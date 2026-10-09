"""Rasterize uploaded report files in a separate, killable process.

PDF rendering and image decoding are native work: once started, neither ``asyncio.wait_for`` nor
cancelling ``asyncio.to_thread`` can stop it. Each upload therefore runs services/document_render.py
in its own process (``python -I``, minimal environment without application secrets) with:

* a wall-clock limit: ``DOCUMENT_WORKER_SECONDS``, never more than the workflow's remaining time;
* an address-space limit (``DOCUMENT_WORKER_MEMORY_MB``), a CPU-time limit and no writable files
  (POSIX ``setrlimit``; on Windows only the wall-clock limit and the kill apply);
* in-memory pipes only: no temporary files to clean up.

On timeout, Stop, a closed connection, the request deadline or shutdown the process is killed and
reaped before the workflow's admission slot is released.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

from config import settings
from services import execution
from services.conversation_transport import ConversationError

SCRIPT = Path(__file__).with_name("document_render.py")
RUNNING: set[subprocess.Popen] = set()   # live worker processes (tests and shutdown check this is empty)


def command() -> list[str]:
    """The worker command line. Tests replace this to simulate a stuck or crashing worker."""
    return [sys.executable, "-I", str(SCRIPT)]


def _environment() -> dict[str, str]:
    keep = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL")
    return {k: os.environ[k] for k in keep if k in os.environ}


def _kill(process: subprocess.Popen) -> None:
    if process.poll() is None:
        try:
            process.kill()
        except OSError:
            pass


def _communicate(process: subprocess.Popen, payload: bytes, seconds: float) -> tuple[int, bytes, bool]:
    """Blocking, in a worker thread. Returns (returncode, stdout, timed_out); always reaps."""
    try:
        out, _ = process.communicate(payload, timeout=seconds)
        return process.returncode, out, False
    except subprocess.TimeoutExpired:
        _kill(process)
        out, _ = process.communicate()
        return process.returncode, out or b"", True


async def rasterize(raws: list[bytes]) -> list[tuple[bytes, str]]:
    """Page images for up to three uploaded files, or a ConversationError naming the problem."""
    ctx = execution.current()
    seconds = settings.DOCUMENT_WORKER_SECONDS
    if ctx is not None:
        ctx.checkpoint("prepare")
        seconds = max(0.5, min(seconds, ctx.remaining()))
    payload = json.dumps({"files": [base64.b64encode(raw).decode() for raw in raws],
                          "limits": {"max_bytes": settings.IMAGE_MAX_BYTES, "max_pixels": settings.IMAGE_MAX_PIXELS,
                                     "max_pages": 3, "memory_mb": settings.DOCUMENT_WORKER_MEMORY_MB,
                                     "cpu_seconds": max(1, int(seconds) + 1)}}).encode()
    popen = {"stdin": subprocess.PIPE, "stdout": subprocess.PIPE, "stderr": subprocess.DEVNULL, "env": _environment()}
    if os.name == "posix":
        popen["start_new_session"] = True
    else:
        popen["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    process = subprocess.Popen(command(), **popen)
    RUNNING.add(process)
    future = asyncio.ensure_future(asyncio.to_thread(_communicate, process, payload, seconds))
    try:
        returncode, out, timed_out = await future
    except asyncio.CancelledError:
        # Stop, disconnect, deadline or shutdown: the process must be gone before the slot is freed.
        _kill(process)
        try:
            await asyncio.wait_for(asyncio.shield(future), execution.CLEANUP_SECONDS)
        except (Exception, asyncio.CancelledError):  # noqa: BLE001 - the original cancellation wins
            pass
        execution.log_event("document_worker", worker="cancelled", returncode=process.poll())
        raise
    finally:
        if process.poll() is None:  # defensive: never leave a process behind
            _kill(process)
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
        RUNNING.discard(process)
    if timed_out:
        execution.log_event("document_worker", worker="timeout", returncode=returncode)
        raise ConversationError("document_timeout", "This file took too long to prepare. Try a smaller PDF or a PNG image.", 422)
    try:
        reply = json.loads(out)
    except ValueError:
        execution.log_event("document_worker", worker="crashed", returncode=returncode)
        raise ConversationError("pdf_invalid", "This file cannot be read. Try an unlocked PDF or a PNG image.", 422) from None
    if not reply.get("ok"):
        raise ConversationError(str(reply.get("code") or "pdf_invalid"), str(reply.get("message") or "This file cannot be read."),
                                int(reply.get("status") or 422))
    pages = [(base64.b64decode(data), str(media_type)) for data, media_type in reply["pages"]]
    execution.log_event("document_worker", worker="ok", pages=len(pages))
    return pages
