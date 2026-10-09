"""Local measurements of LabClear's own request overhead (separate from the deterministic score).

    python scripts/measure_resilience.py --json-out docs/evidence/current/resilience/local-measurements.json

Real seconds on this machine: process start to /health and /ready, time to the first stream event
(``accepted``), completion p50/p95 for sequential and two-at-a-time chats and report reads, peak
memory of the web process and of a document worker, and the exit time after SIGTERM. Providers are
the in-process offline doubles, so model and OCR latency are NOT included: the numbers describe the
application around the models on this machine. They are not Render measurements; Render Free adds
its own cold start (about a minute after 15 idle minutes, per Render's documentation) and network.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import signal
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from benchmark_resilience import _free_port, _guest, _Http, _multipart, commit  # noqa: E402


def pct(values, q):
    values = sorted(values)
    if not values:
        return None
    k = (len(values) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return round((values[lo] + (values[hi] - values[lo]) * (k - lo)) * 1000, 1)


def stream_once(http: _Http, path: str, body: bytes, headers: dict) -> dict:
    events, seen = [], threading.Event()
    started = time.monotonic()
    http.stream(path, body, headers, events, seen)
    first = next((t for t, e in events if e.get("type") == "accepted"), None)
    end = next(((t, e) for t, e in events if e.get("type") in ("done", "error")), (None, {}))
    return {"ttfe": None if first is None else first - started, "total": None if end[0] is None else end[0] - started, "outcome": end[1].get("type"), "code": end[1].get("code")}


def rss_kib(pid: int, field: str) -> int | None:
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith(field + ":"):
                return int(line.split()[1])
    except OSError:
        return None
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-out", type=Path, default=ROOT / "eval_runs/resilience/local-measurements.json")
    parser.add_argument("--chats", type=int, default=20)
    parser.add_argument("--reads", type=int, default=5)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="labclear-measure-") as folder:
        work = Path(folder)
        port = _free_port()
        config = {"port": port, "out": str(work / "server.json"), "workdir": str(work / "server"), "faults": {}, "hang_worker": False, "drain_seconds": 5}
        (work / "config.json").write_text(json.dumps(config), encoding="utf-8")
        flags = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {}
        spawned = time.monotonic()
        proc = subprocess.Popen([sys.executable, str(ROOT / "scripts/offline_check.py"), "resilience-server", str(work / "config.json")], cwd=ROOT,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **flags)
        http = _Http(port)
        health_at = ready_at = None
        while time.monotonic() - spawned < 60 and ready_at is None:
            try:
                if health_at is None and http.call("GET", "/health", timeout=1)[0] == 200:
                    health_at = time.monotonic() - spawned
                if http.call("GET", "/ready", timeout=1)[0] == 200:
                    ready_at = time.monotonic() - spawned
            except OSError:
                pass
            time.sleep(0.02)
        rss_ready = rss_kib(proc.pid, "VmRSS")
        try:
            chat = json.dumps({"message": "What does HbA1c measure?"}).encode()
            stream_once(http, "/api/business/chat", chat, {**_guest(http), "Content-Type": "application/json"})  # first request warms caches
            sequential = [stream_once(http, "/api/business/chat", chat, {**_guest(http), "Content-Type": "application/json"}) for _ in range(args.chats)]
            parallel = []
            for _ in range(args.chats // 2):
                pair, threads = [None, None], []
                for i in range(2):
                    headers = {**_guest(http), "Content-Type": "application/json"}
                    threads.append(threading.Thread(target=lambda i=i, h=headers: pair.__setitem__(i, stream_once(http, "/api/business/chat", chat, h))))
                for t in threads:
                    t.start()
                for t in threads:
                    t.join()
                parallel += pair
            from PIL import Image
            import io
            image = io.BytesIO()
            Image.new("RGB", (1240, 1754), "white").save(image, "PNG")  # an A4 page at 150 dpi
            reads = []
            for _ in range(args.reads):
                body, content_type = _multipart("synthetic.png", image.getvalue())
                reads.append(stream_once(http, "/api/business/chat/report", body, {**_guest(http), "Content-Type": content_type}))
            rss_peak = rss_kib(proc.pid, "VmHWM")
            signalled = time.monotonic()
            if os.name == "nt":
                os.kill(proc.pid, signal.CTRL_BREAK_EVENT)
            else:
                proc.send_signal(signal.SIGTERM)
            code = proc.wait(30)
            exit_seconds = time.monotonic() - signalled
        finally:
            if proc.poll() is None:
                proc.kill()
        summary = json.loads(Path(config["out"]).read_text(encoding="utf-8")) if Path(config["out"]).exists() else {}

    def block(rows):
        ok = [r for r in rows if r["outcome"] == "done"]
        return {"samples": len(rows), "succeeded": len(ok),
                "time_to_first_event_ms": {"p50": pct([r["ttfe"] for r in ok], .5), "p95": pct([r["ttfe"] for r in ok], .95)},
                "completion_ms": {"p50": pct([r["total"] for r in ok], .5), "p95": pct([r["total"] for r in ok], .95)},
                "failures": [r["code"] for r in rows if r["outcome"] != "done"]}
    report = {
        "what": "Local measurements of LabClear's own overhead with offline provider doubles (model and OCR latency excluded). Not Render; not the deterministic score.",
        "commit": commit(), "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "environment": {"platform": platform.platform(), "python": platform.python_version(), "cpu_count": os.cpu_count(),
                        "server": "scripts/run_business.py DrainingServer (one Uvicorn process) on 127.0.0.1, SQLite, offline doubles"},
        "process_start": {"to_health_ms": None if health_at is None else round(health_at * 1000), "to_ready_ms": None if ready_at is None else round(ready_at * 1000),
                          "note": "Python process start, imports and storage setup on this machine; Render's free-plan wake-up is separate."},
        "chat_sequential": block(sequential), "chat_two_at_a_time": block(parallel), "report_read_sequential": block(reads),
        "memory_kib": {"web_process_at_ready": rss_ready, "web_process_peak": rss_peak, "document_worker_peak": summary.get("worker_peak_rss_kib")},
        "shutdown": {"exit_after_sigterm_ms": round(exit_seconds * 1000), "exit_status": code, "workers_running_at_exit": summary.get("workers_running")},
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
