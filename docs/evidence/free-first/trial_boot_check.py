"""Boot the LIVE_FREE trial server without keys and without any inference; record what it reports.

    python docs/evidence/free-first/trial_boot_check.py > docs/evidence/free-first/trial-boot-check.json

Starts scripts/live_free_server.py exactly as the benchmark runner would (clean environment, policy
eval/policies/free_only.example.json, isolated SQLite in a temporary folder, 127.0.0.1), then calls
only /health, /api/business/session, the synthetic manager login, /staff/budget and
/staff/ai-providers. No chat, report or provider request is sent, so no provider is contacted.
"""
import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
PY = sys.executable


def port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    folder = Path(tempfile.mkdtemp(prefix="labclear-trial-boot-"))
    p, password = port(), secrets.token_urlsafe(12)
    cfg = folder / "config.json"
    cfg.write_text(json.dumps({"profile": "C", "free_only_policy": str(ROOT / "eval/policies/free_only.example.json"), "cycle": "trial-boot-check",
                               "manager_password": password, "canaries": {}, "state_dir": str(folder / "state"),
                               "ready_file": str(folder / ".ready"), "port": p}))
    env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "TMP", "TEMP")}
    proc = subprocess.Popen([PY, str(ROOT / "scripts/live_free_server.py"), str(cfg)], cwd=folder, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{p}"
    out = {"command": "scripts/live_free_server.py (as started by benchmark_labclear.py)", "keys_present": False,
           "policy": "eval/policies/free_only.example.json", "inference_calls_made": 0}
    try:
        for _ in range(200):
            if (folder / ".ready").exists():
                try:
                    if httpx.get(base + "/health", timeout=2).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
            time.sleep(0.2)
        c = httpx.Client(base_url=base, timeout=10)
        health = c.get("/health").json()
        out["health"] = {k: health.get(k) for k in ("status", "version", "commit", "environment")}
        s = c.get("/api/business/session").json()
        r = c.post("/api/business/login", json={"email": "bench-manager@example.invalid", "password": password},
                   headers={"X-Business-CSRF": s["csrf"], "X-LabClear-Guest": s.get("guest_token", "")})
        csrf = r.json()["csrf"]
        budget = c.get("/api/business/staff/budget", headers={"X-Business-CSRF": csrf}).json()
        out["budget"] = {"network_enabled": budget.get("network_enabled"), "free_policy_active": budget.get("free_policy_active"),
                         "free_quota": budget.get("free_quota"), "ledger_enabled": (budget.get("cost") or {}).get("enabled"),
                         "call_cycle": budget.get("call_cycle")}
        ai = c.get("/api/business/staff/ai-providers", headers={"X-Business-CSRF": csrf}).json()
        fp = ai.get("free_policy") or {}
        out["free_policy"] = {k: fp.get(k) for k in ("active", "valid", "policy_id", "mode")}
        out["free_policy"]["endpoints"] = [{k: e[k] for k in ("family", "host", "path", "model", "price_status", "callable", "reason")} for e in fp.get("endpoints", [])]
        out["slots_ready"] = {k: v.get("ready") for k, v in (ai.get("slots") or {}).items()}
        out["harness"] = {"tools": len((ai.get("harness") or {}).get("tools", [])), "skills": (ai.get("harness") or {}).get("skills", {}).get("version")}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
