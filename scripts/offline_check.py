"""Run tests or the browser fixture with isolated storage and no outbound sockets.

Usage: python scripts/offline_check.py pytest -q
       python scripts/offline_check.py browser
       python scripts/offline_check.py benchmark <config.json>   (started by scripts/benchmark_labclear.py)
No .env, inherited application configuration, or production database is loaded.
The benchmark mode serves the real app with provider test doubles behind an in-process
httpx.MockTransport (tests/benchmark); outbound sockets stay denied exactly as in the other modes.
"""
from __future__ import annotations

import os
from pathlib import Path
import runpy
import socket
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]


def main():
    mode, *args = sys.argv[1:] or ["pytest", "-q"]
    if mode not in {"pytest", "browser", "evaluation", "boot", "benchmark"}:
        raise SystemExit("Choose pytest, browser, evaluation, boot or benchmark")
    browser_port = int(args[0]) if mode == "browser" and args else 8098
    # Preserve only OS/tool operation variables, never provider/cloud credentials.
    keep = {"systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile",
            "localappdata", "appdata", "comspec", "home"}
    for key in list(os.environ):
        if key.lower() not in keep:
            del os.environ[key]
    with tempfile.TemporaryDirectory(prefix="labclear-offline-") as folder:
        os.environ.update(APP_ENV="test", DATABASE_URL="", PROVIDER_NETWORK_ENABLED="false",
                          BUSINESS_DB_PATH=str(Path(folder) / "business.sqlite3"),
                          BUSINESS_KEY_PATH=str(Path(folder) / "business.key"),
                          BUSINESS_EXTERNAL_ENABLED="false", DEMO_ACCOUNTS="true" if mode == "browser" else "false")
        os.environ["UI_TEST_PORT"] = str(browser_port)
        sys.path.insert(0, str(ROOT))
        os.chdir(folder)
        import config  # reads defaults and the isolated env; no repository .env
        assert not config.settings.PROVIDER_NETWORK_ENABLED
        os.chdir(ROOT)

        def denied(*_args, **_kwargs):
            raise RuntimeError("OFFLINE_CHECK: outbound network forbidden; use a test double")

        # Windows asyncio implements its internal wakeup pipe with socketpair.
        # Permit only the socketpair implementation, in the calling thread.
        original_connect, original_pair = socket.socket.connect, socket.socketpair
        internal = threading.local()

        def pair(*pair_args, **pair_kwargs):
            internal.socketpair = True
            try:
                return original_pair(*pair_args, **pair_kwargs)
            finally:
                internal.socketpair = False

        def connect(sock, address):
            if getattr(internal, "socketpair", False):
                return original_connect(sock, address)
            return denied()

        socket.socketpair = pair
        socket.socket.connect = connect
        socket.socket.connect_ex = denied
        socket.create_connection = denied
        socket.getaddrinfo = denied
        if mode == "pytest":
            import pytest
            return pytest.main(args or ["-q"])
        if mode == "evaluation":
            runpy.run_path(str(ROOT / "scripts/evaluate_upgrade.py"), run_name="__main__")
            return 0
        if mode == "boot":
            runpy.run_path(str(ROOT / "scripts/boot_check.py"), run_name="__main__")
            return 0
        if mode == "benchmark":
            if len(args) != 1:
                raise SystemExit("benchmark needs the config file written by scripts/benchmark_labclear.py")
            sys.argv = [str(ROOT / "tests/benchmark/server.py"), str(Path(args[0]).resolve())]
            runpy.run_path(sys.argv[0], run_name="__main__")
            return 0
        runpy.run_path(str(ROOT / "tests/browser/fixture_server.py"), run_name="__main__")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
