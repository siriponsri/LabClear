"""Deterministic resilience benchmark: fault cases R01–R12 (docs/operations/resilience.md).

    python scripts/benchmark_resilience.py --offline --seed 20261010 --json-out docs/evidence/current/resilience/resilience-benchmark.json

Everything runs on this machine with synthetic data: the real application, provider test doubles
behind an in-process httpx.MockTransport, a virtual clock for deadlines and heartbeats, synthetic
PNG/PDF files, outbound sockets denied (scripts/offline_check.py). No provider is called and nothing
is charged; ``--offline`` is required because no other mode exists.

Parts:
  server   tests/resilience/suite.py        R01 R02 R04 R05 R06 R07 R08 R10 R11 R12 (virtual clock)
  client   tests/resilience/client_cases.mjs R03 R04 R10 R11 (Node, fake fetch and fake clock)
  sigterm  tests/resilience/server.py       R09 (a real process, a real signal, real seconds)
  regress  pytest: business, Guest privacy, Guard and resilience unit tests (R12)

score = 100 × passed required cases / 12. A case passes only when all of its assertions pass. The
exit code is 0 only for 12/12 with no case skipped and 0 outbound connection attempts. The score is
the pass rate of this fault suite: not an uptime SLA, not latency on Render, not model accuracy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TITLES = {
    "R01": "Provider hangs or sends data slowly without end",
    "R02": "Provider 502/503/429 and malformed output",
    "R03": "A proxy answers with an HTML 502/503/504 page",
    "R04": "Idle stream, a stream cut before done, an invalid line",
    "R05": "Stop or a closed connection while waiting for AI",
    "R06": "More users than the concurrency limit",
    "R07": "Broken PDF, too many pages, too many pixels, a stuck worker",
    "R08": "Slow storage: connection, query or lock",
    "R09": "SIGTERM during a chat and a report read",
    "R10": "Retry clicked twice, or while the original request is active",
    "R11": "Cold start and pages that are not JSON",
    "R12": "Request IDs, logs without secrets, existing regressions",
}
PARTS = {"R01": ["server"], "R02": ["server"], "R03": ["client"], "R04": ["server", "client"], "R05": ["server"],
         "R06": ["server"], "R07": ["server"], "R08": ["server"], "R09": ["sigterm"], "R10": ["server", "client"],
         "R11": ["server", "client"], "R12": ["server", "regression"]}
REGRESSION = ["tests/test_resilience.py", "tests/test_business_v3.py", "tests/test_business_full.py", "tests/test_guest_privacy_302.py",
              "tests/test_guard_repairs_302.py", "tests/test_upgrade_safety.py", "tests/test_chat_features.py", "tests/test_cost_ledger.py"]


def commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def run_server_suite(seed: int, work: Path, artifacts: Path) -> dict:
    config = {"workdir": str(work / "server"), "out": str(work / "server.json"), "seed": seed}
    path = work / "server-config.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    log = artifacts / "server-suite.log"
    started = time.monotonic()
    with log.open("w", encoding="utf-8") as out:
        proc = subprocess.run([sys.executable, str(ROOT / "scripts/offline_check.py"), "resilience", str(path)], cwd=ROOT,
                              stdout=out, stderr=subprocess.STDOUT, timeout=900)
    if proc.returncode != 0 or not Path(config["out"]).exists():
        return {"error": f"server suite exited with {proc.returncode}; see {log.name}", "cases": []}
    data = json.loads(Path(config["out"]).read_text(encoding="utf-8"))
    data["real_seconds"] = round(time.monotonic() - started, 2)
    return data


def run_client_cases(artifacts: Path) -> dict:
    node = shutil.which("node")
    if not node:
        return {"error": "Node.js is required for the client cases (static/js/stream.js) and was not found."}
    started = time.monotonic()
    proc = subprocess.run([node, str(ROOT / "tests/resilience/client_cases.mjs")], cwd=ROOT, capture_output=True, text=True, timeout=300)
    (artifacts / "client-cases.log").write_text(proc.stdout + proc.stderr, encoding="utf-8")
    if proc.returncode != 0:
        return {"error": f"client cases exited with {proc.returncode}; see client-cases.log"}
    data = json.loads(proc.stdout)
    data["real_seconds"] = round(time.monotonic() - started, 2)
    return data


# ------------------------------------------------------------------ R09: a real SIGTERM

def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _Http:
    def __init__(self, port: int):
        self.base = f"http://127.0.0.1:{port}"

    def call(self, method, path, body=None, headers=None, timeout=10):
        data = json.dumps(body).encode() if isinstance(body, dict) else body
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as r:
                return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
        except urllib.error.HTTPError as e:
            return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()

    def stream(self, path, body, headers, sink: list, ready: threading.Event):
        """Read an NDJSON stream line by line in a thread: (monotonic time, event)."""
        request = urllib.request.Request(self.base + path, data=body, method="POST", headers={**headers, "Accept": "application/x-ndjson"})
        try:
            with urllib.request.urlopen(request, timeout=60) as r:
                for raw in r:
                    if raw.strip():
                        sink.append((time.monotonic(), json.loads(raw)))
                        ready.set()
        except Exception as exc:  # noqa: BLE001 - recorded as the outcome of the stream
            sink.append((time.monotonic(), {"type": "transport_error", "error": type(exc).__name__}))
        finally:
            sink.append((time.monotonic(), {"type": "closed"}))
            ready.set()


def _guest(http: _Http) -> dict:
    status, _, raw = http.call("GET", "/api/business/session")
    data = json.loads(raw)
    return {"X-LabClear-Guest": data["guest_token"], "X-Business-CSRF": data["csrf"]}


def _multipart(filename: str, payload: bytes) -> tuple[bytes, str]:
    boundary = "resilience" + os.urandom(6).hex()
    parts = [f"--{boundary}\r\nContent-Disposition: form-data; name=\"message\"\r\n\r\nRead this\r\n".encode(),
             f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{filename}\"\r\nContent-Type: image/png\r\n\r\n".encode(),
             payload, f"\r\n--{boundary}--\r\n".encode()]
    return b"".join(parts), "multipart/form-data; boundary=" + boundary


def run_sigterm(work: Path, artifacts: Path, drain: float = 3.0) -> dict:
    assertions = []

    def check(name, ok, detail=None):
        assertions.append({"name": name, "passed": bool(ok), **({"detail": detail} if detail is not None and not ok else {})})
    port = _free_port()
    config = {"port": port, "out": str(work / "sigterm.json"), "workdir": str(work / "sigterm"), "drain_seconds": drain}
    path = work / "sigterm-config.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    log = (artifacts / "sigterm-server.log").open("w", encoding="utf-8")
    flags = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {}
    proc = subprocess.Popen([sys.executable, str(ROOT / "scripts/offline_check.py"), "resilience-server", str(path)], cwd=ROOT,
                            stdout=log, stderr=subprocess.STDOUT, **flags)
    http = _Http(port)
    started = time.monotonic()
    try:
        ready = 0
        while time.monotonic() - started < 60:
            try:
                ready = http.call("GET", "/ready", timeout=2)[0]
            except OSError:
                ready = 0
            if ready == 200:
                break
            time.sleep(0.2)
        check("before the signal /ready is 200", ready == 200, ready)
        chat_events, chat_seen = [], threading.Event()
        headers = {**_guest(http), "Content-Type": "application/json"}
        threading.Thread(target=http.stream, args=("/api/business/chat", json.dumps({"message": "What does HbA1c measure?"}).encode(), headers, chat_events, chat_seen), daemon=True).start()
        from PIL import Image
        import io
        image = io.BytesIO()
        Image.new("RGB", (600, 400), "white").save(image, "PNG")
        body, content_type = _multipart("synthetic.png", image.getvalue())
        report_events, report_seen = [], threading.Event()
        threading.Thread(target=http.stream, args=("/api/business/chat/report", body, {**_guest(http), "Content-Type": content_type}, report_events, report_seen), daemon=True).start()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and not (any(e.get("id") == "plan" for _, e in chat_events) and any(e.get("type") == "accepted" for _, e in report_events)):
            time.sleep(0.05)
        time.sleep(0.5)  # the report worker process is running
        check("a chat (waiting for the planner) and a report read (worker running) are in flight", any(e.get("id") == "plan" for _, e in chat_events)
              and any(e.get("type") == "accepted" for _, e in report_events), {"chat": [e for _, e in chat_events][:4], "report": [e for _, e in report_events][:3]})
        signalled = time.monotonic()
        if os.name == "nt":
            os.kill(proc.pid, signal.CTRL_BREAK_EVENT)  # Windows: uvicorn handles SIGBREAK the same way
        else:
            proc.send_signal(signal.SIGTERM)
        time.sleep(0.3)
        status, hdrs, raw = http.call("GET", "/ready", timeout=3)
        check("right after the signal /ready answers 503 (draining)", status == 503 and json.loads(raw)["checks"]["draining"] is True, (status, raw[:200]))
        status, hdrs, raw = http.call("POST", "/api/business/chat", {"message": "New question"}, {**_guest(http), "Content-Type": "application/json"}, timeout=5)
        body = json.loads(raw or b"{}")
        check("new AI work is refused with 503 server_draining and Retry-After: 5", status == 503 and body.get("code") == "server_draining" and hdrs.get("retry-after") == "5", (status, body, hdrs.get("retry-after")))
        status, _, raw = http.call("GET", "/health", timeout=3)
        check("liveness still answers while draining", status == 200, status)
        try:
            code = proc.wait(timeout=drain + 15)
        except subprocess.TimeoutExpired:
            code = None
        exited = time.monotonic() - signalled
        for name, events in (("chat", chat_events), ("report read", report_events)):
            terminal = next((e for _, e in events if e.get("type") in ("done", "error")), {})
            when = next((t for t, e in events if e.get("type") in ("done", "error")), None)
            check(f"the in-flight {name} ends with a terminal server_draining event after the drain budget ({drain:.0f} s)",
                  terminal.get("code") == "server_draining" and when is not None and drain - 0.5 <= when - signalled <= drain + 3, (terminal, None if when is None else round(when - signalled, 2)))
        check(f"the process exits by itself within drain + 10 s, exit status 0", code == 0 and exited < drain + 10, (code, round(exited, 2)))
        summary = json.loads(Path(config["out"]).read_text(encoding="utf-8")) if Path(config["out"]).exists() else {}
        check("the report's worker process was killed and reaped; none left running", summary.get("workers_spawned", 0) >= 1 and summary.get("workers_running") == 0
              and all(rc is not None for rc in summary.get("worker_returncodes", [None])), summary)
        check("the entry point binds 0.0.0.0:$PORT with one worker process", summary.get("entrypoint", {}).get("host") == "0.0.0.0" and summary["entrypoint"].get("port_from_env")
              and summary["entrypoint"].get("workers") == 1, summary.get("entrypoint"))
        return {"assertions": assertions, "outbound_socket_attempts": summary.get("outbound_socket_attempts", -1),
                "real_seconds": round(time.monotonic() - started, 2), "platform_signal": "CTRL_BREAK_EVENT" if os.name == "nt" else "SIGTERM"}
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(10)
        log.close()


def run_regression(artifacts: Path) -> dict:
    started = time.monotonic()
    proc = subprocess.run([sys.executable, str(ROOT / "scripts/offline_check.py"), "pytest", "-q", "-p", "no:cacheprovider", *REGRESSION],
                          cwd=ROOT, capture_output=True, text=True, timeout=900)
    (artifacts / "regression.log").write_text(proc.stdout[-20000:] + proc.stderr[-5000:], encoding="utf-8")
    import re
    tail = [line for line in proc.stdout.splitlines() if " passed" in line or " failed" in line or " error" in line]
    counts = ", ".join(re.findall(r"\d+ (?:passed|failed|errors?|skipped)", tail[-1])) if tail else "no summary"
    # The name carries the counts only (no timing), so the score hash is reproducible.
    return {"assertions": [{"name": f"existing business, Guest privacy, Guard, cost-ledger and resilience tests pass ({counts})",
                            "passed": proc.returncode == 0}], "files": REGRESSION, "real_seconds": round(time.monotonic() - started, 2)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--offline", action="store_true", help="required: run with provider doubles and synthetic files only")
    parser.add_argument("--seed", type=int, default=20261010, help="orders the server cases; results must not depend on it")
    parser.add_argument("--json-out", type=Path, default=ROOT / "eval_runs/resilience/resilience-benchmark.json")
    parser.add_argument("--artifacts", type=Path, help="logs and failure details (default: next to --json-out)")
    args = parser.parse_args()
    if not args.offline:
        parser.error("--offline is required: this benchmark never calls a provider (there is no live mode)")
    artifacts = args.artifacts or args.json_out.parent / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="labclear-resilience-") as folder:
        work = Path(folder)
        print("server cases (virtual clock)…", flush=True)
        server = run_server_suite(args.seed, work, artifacts)
        print("client cases (Node)…", flush=True)
        client = run_client_cases(artifacts)
        print("SIGTERM case (real process)…", flush=True)
        sigterm = run_sigterm(work, artifacts)
        print("regression tests…", flush=True)
        regression = run_regression(artifacts)
    by_id = {c["id"]: c for c in server.get("cases", [])}
    cases = []
    for case_id, title in TITLES.items():
        assertions, notes = [], []
        for part in PARTS[case_id]:
            if part == "server":
                found = by_id.get(case_id)
                if found is None:
                    notes.append(server.get("error") or "server part missing")
                    continue
                assertions += [{"part": "server", **a} for a in found["assertions"]]
                if found.get("error"):
                    notes.append(found["error"][-1500:])
            elif part == "client":
                if client.get("error"):
                    notes.append(client["error"])
                    continue
                assertions += [{"part": "client", **a} for a in client["cases"].get(case_id, [])]
            elif part == "sigterm":
                assertions += [{"part": "sigterm", **a} for a in sigterm["assertions"]]
            elif part == "regression":
                assertions += [{"part": "regression", **a} for a in regression["assertions"]]
        missing = len(notes) > 0
        passed = bool(assertions) and all(a["passed"] for a in assertions) and not missing
        case = {"id": case_id, "title": title, "parts": PARTS[case_id], "passed": passed, "skipped": not assertions,
                "assertions_passed": sum(a["passed"] for a in assertions), "assertions": len(assertions), "checks": assertions}
        if notes:
            case["notes"] = notes
        if not passed:
            (artifacts / f"{case_id}-failure.json").write_text(json.dumps({**case, "server_artifacts": (by_id.get(case_id) or {}).get("artifacts")}, ensure_ascii=False, indent=2), encoding="utf-8")
        cases.append(case)
    passed = sum(c["passed"] for c in cases)
    skipped = sum(c["skipped"] for c in cases)
    sockets = max(0, server.get("outbound_socket_attempts", 0)) + max(0, sigterm.get("outbound_socket_attempts", 0))
    if server.get("outbound_socket_attempts", 0) < 0 or sigterm.get("outbound_socket_attempts", 0) < 0:
        sockets = -1
    canonical = json.dumps([[c["id"], c["passed"], [[a["name"], a["passed"]] for a in c["checks"]]] for c in cases], ensure_ascii=False)
    report = {
        "benchmark": "LabClear resilience fault suite R01–R12", "mode": "OFFLINE", "seed": args.seed, "commit": commit(),
        "score": round(100 * passed / len(TITLES), 1), "required": len(TITLES), "passed": passed, "failed": len(TITLES) - passed - skipped, "skipped": skipped,
        "external_provider_calls": 0 if sockets == 0 else None, "outbound_connection_attempts": sockets,
        "accepted": passed == len(TITLES) and skipped == 0 and sockets == 0,
        "score_sha256": hashlib.sha256(canonical.encode()).hexdigest()[:16],
        "environment": {"python": platform.python_version(), "node": (client.get("engine") or "unavailable"), "platform": platform.platform(),
                        "clock": "virtual for server cases, fake for client cases, real seconds for R09 and regression"},
        "real_seconds": {"server": server.get("real_seconds"), "client": client.get("real_seconds"), "sigterm": sigterm.get("real_seconds"),
                         "regression": regression.get("real_seconds"), "total": round(time.monotonic() - started, 2)},
        "server_case_order": server.get("order"), "regression_files": REGRESSION,
        "note": "Pass rate of a deterministic fault suite with provider doubles and synthetic files. Not an uptime SLA, not latency on Render, not model accuracy.",
        "cases": cases,
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for c in cases:
        print(f"{c['id']} {'PASS' if c['passed'] else 'FAIL'} {c['assertions_passed']}/{c['assertions']}  {c['title']}")
        for a in c["checks"]:
            if not a["passed"]:
                print("     ✗", a["name"])
    print(f"score {report['score']} ({passed}/{len(TITLES)}), skipped {skipped}, outbound connection attempts {sockets} -> {args.json_out}")
    return 0 if report["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
