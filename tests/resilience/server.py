"""Server for the SIGTERM case (R09) and the local measurements. MOCKED_TEST_ONLY, never deploy.

Started by scripts/benchmark_resilience.py through ``scripts/offline_check.py resilience-server``:
the real application and the real entry point (scripts/run_business.py DrainingServer) on a loopback
port, with provider doubles in which the planner never answers and a document worker that never
finishes, so a chat and a report read are in flight when the signal arrives. Writes a JSON summary
after the server stops: worker processes left, outbound socket attempts, the entry point's binding.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.resilience.harness import SOCKETS, count_sockets, setup  # noqa: E402


def main(config_path: str) -> None:
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    count_sockets()
    workdir = Path(config["workdir"])
    workdir.mkdir(parents=True, exist_ok=True)
    app, provider = setup(workdir)
    # R09: the planner never answers and the document worker never finishes. The local measurements
    # (scripts/measure_resilience.py) pass "faults": {} and "hang_worker": false instead.
    provider.reset(**config.get("faults", {"planner": "hang"}))
    from config import settings
    from services import document_worker
    settings.SHUTDOWN_DRAIN_SECONDS = float(config.get("drain_seconds", 3))
    if config.get("hang_worker", True):
        document_worker.command = lambda: [sys.executable, "-c", "import time; time.sleep(600)"]
    spawned = []
    real_popen = document_worker.subprocess.Popen

    def recording(*a, **k):
        process = real_popen(*a, **k)
        spawned.append(process)
        return process
    document_worker.subprocess.Popen = recording
    import logging
    logging.getLogger("labclear").setLevel(logging.INFO)
    sys.path.insert(0, str(ROOT / "scripts"))
    import run_business
    os.environ["PORT"] = "8123"
    default = run_business.config()
    server = run_business.DrainingServer(run_business.config(app=app, host="127.0.0.1", port=config["port"]))
    asyncio.run(server.serve())
    children = None
    try:
        import resource
        children = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss  # KiB on Linux: largest reaped worker
    except (ImportError, AttributeError):
        pass
    Path(config["out"]).write_text(json.dumps({
        "worker_peak_rss_kib": children,
        "workers_spawned": len(spawned), "workers_running": len(document_worker.RUNNING),
        "worker_returncodes": [p.poll() for p in spawned], "outbound_socket_attempts": SOCKETS["attempts"],
        "entrypoint": {"host": default.host, "port_from_env": default.port == 8123, "workers": default.workers,
                       "timeout_graceful_shutdown": default.timeout_graceful_shutdown},
    }), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
