"""Unit tests for request resilience (services/execution.py, the document worker, readiness).

The end-to-end fault cases R01–R12 run in scripts/benchmark_resilience.py; these are the fast checks
of each piece, run with the rest of the suite."""
from __future__ import annotations

import asyncio
import io
import json
import sys

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from config import Settings, settings
from main import app
from services import document_worker, execution
from services.conversation_transport import ConversationError


def png(width=200, height=100) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(out, "PNG")
    return out.getvalue()


# ------------------------------------------------------------------ configuration

@pytest.mark.parametrize("name,value", [("PROVIDER_TRANSPORT_RETRIES", "1"), ("STREAM_HEARTBEAT_SECONDS", "60"),
                                        ("CHAT_DEADLINE_SECONDS", "5"), ("AI_MAX_IN_FLIGHT", "0"), ("SHUTDOWN_DRAIN_SECONDS", "40")])
def test_resilience_settings_are_validated(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(Exception):
        Settings(_env_file=None)


def test_ocr_limit_cannot_exceed_the_ai_limit(monkeypatch):
    monkeypatch.setenv("AI_MAX_IN_FLIGHT", "1")
    monkeypatch.setenv("OCR_MAX_IN_FLIGHT", "2")
    with pytest.raises(Exception, match="OCR_MAX_IN_FLIGHT"):
        Settings(_env_file=None)


def test_defaults_match_the_handoff():
    s = Settings(_env_file=None)
    assert (s.CHAT_DEADLINE_SECONDS, s.REPORT_DEADLINE_SECONDS, s.STREAM_HEARTBEAT_SECONDS, s.AI_MAX_IN_FLIGHT,
            s.OCR_MAX_IN_FLIGHT, s.PROVIDER_TRANSPORT_RETRIES) == (220, 150, 10, 2, 1, 0)


# ------------------------------------------------------------------ admission

def test_admission_refuses_beyond_the_limits_and_releases_once(monkeypatch):
    monkeypatch.setattr(settings, "AI_MAX_IN_FLIGHT", 2)
    monkeypatch.setattr(settings, "OCR_MAX_IN_FLIGHT", 1)
    gate = execution.Admission()
    ocr = gate.acquire("ocr")
    with pytest.raises(ConversationError) as busy:
        gate.acquire("ocr")
    assert busy.value.code == "server_busy" and busy.value.status == 503 and busy.value.retry_after == 5
    chat = gate.acquire("ai")
    with pytest.raises(ConversationError):
        gate.acquire("ai")
    ocr.release()
    ocr.release()  # idempotent
    assert gate.snapshot()["ai_in_flight"] == 1 and gate.snapshot()["ocr_in_flight"] == 0
    chat.release()
    assert gate.snapshot()["ai_in_flight"] == 0


def test_draining_refuses_new_work(monkeypatch):
    monkeypatch.setattr(execution.lifecycle, "draining", True)
    with pytest.raises(ConversationError) as refused:
        execution.Admission().acquire("ai")
    assert refused.value.code == "server_draining" and refused.value.retry_after == 5


# ------------------------------------------------------------------ deadline and budgets

def test_checkpoint_and_call_budget_follow_the_deadline():
    async def run():
        ctx = execution.Execution("/chat", "ai", 30)
        assert ctx.call_timeout(10) == 10           # the call's own limit is tighter
        assert ctx.call_timeout(60) is None         # the workflow deadline is tighter
        ctx.deadline = ctx.loop.time() + 0.5
        with pytest.raises(ConversationError) as late:
            ctx.checkpoint("json_repair")
        assert late.value.code == "request_timeout" and late.value.status == 504 and ctx.last_step == "json_repair"
        with pytest.raises(ConversationError):
            ctx.call_timeout(10)
    asyncio.run(run())


def test_bounded_turns_the_deadline_into_request_timeout():
    async def run():
        ctx = execution.Execution("/chat", "ai", 30)
        ctx.deadline = ctx.loop.time() + 0.05
        with pytest.raises(ConversationError) as late:
            await execution.bounded(ctx, asyncio.sleep(5))
        return late.value
    error = asyncio.run(run())
    assert error.code == "request_timeout" and error.origin == "app"


def test_interrupted_steps_carry_state_and_duration():
    async def run():
        ctx = execution.Execution("/chat", "ai", 30)
        ctx.track({"type": "step", "id": "safety_in", "state": "running", "label": "Guard"})
        ctx.track({"type": "step", "id": "plan", "state": "running", "label": "Plan"})
        ctx.track({"type": "step", "id": "safety_in", "state": "done", "label": "Guard ok"})
        return ctx.interrupted(ConversationError("upstream_unavailable", "x", 502, origin="upstream"))
    steps = asyncio.run(run())
    assert [(s["id"], s["state"]) for s in steps] == [("plan", "unavailable")] and "duration_ms" in steps[0]


def test_cleanup_never_raises():
    def boom():
        raise RuntimeError("storage gone")
    asyncio.run(execution.cleanup(boom))


# ------------------------------------------------------------------ stream channel

def test_channel_bounds_steps_but_always_delivers_the_terminal_event():
    async def run():
        channel = execution._Channel(limit=2)
        for i in range(5):
            channel.put({"type": "step", "id": str(i)})
        channel.finish([{"type": "step", "id": "x", "state": "timeout"}], {"type": "error", "code": "request_timeout"})
        channel.finish([], {"type": "done"})  # a second terminal is ignored
        channel.put({"type": "step", "id": "late"})
        return channel
    channel = asyncio.run(run())
    assert channel.dropped == 3 and [e["id"] for e in channel.events] == ["0", "1", "x"] and channel.terminal["code"] == "request_timeout"


# ------------------------------------------------------------------ request IDs, error contract, readiness

def test_every_response_has_a_request_id_and_errors_repeat_it():
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200 and health.headers["x-request-id"].startswith("req_")
        missing = client.get("/api/business/does-not-exist")
        assert missing.status_code == 404 and missing.json()["request_id"] == missing.headers["x-request-id"]
        too_large = client.post("/api/business/chat", content=b"x" * (4 * 1024 * 1024 + 1), headers={"content-type": "application/json"})
        assert too_large.status_code == 413 and too_large.json()["request_id"] == too_large.headers["x-request-id"]


def test_ready_is_json_and_reports_draining(monkeypatch):
    import main as app_main
    with TestClient(app) as client:
        app_main._probe.update(future=None, ok_at=0.0)
        ready = client.get("/ready")
        assert ready.status_code == 200 and ready.json()["checks"] == {"startup": "done", "draining": False, "storage": "ok"}
        monkeypatch.setattr(execution.lifecycle, "draining", True)
        draining = client.get("/ready")
        assert draining.status_code == 503 and draining.json()["status"] == "not_ready" and client.get("/health").status_code == 200


def test_server_busy_is_a_503_with_retry_after_before_any_work(monkeypatch):
    monkeypatch.setattr(settings, "AI_MAX_IN_FLIGHT", 1)
    held = execution.admission.acquire("ai")
    try:
        with TestClient(app) as client:
            session = client.get("/api/business/session").json()
            r = client.post("/api/business/chat", json={"message": "Hi"},
                            headers={"X-LabClear-Guest": session["guest_token"], "X-Business-CSRF": session["csrf"], "Accept": "application/x-ndjson"})
        assert r.status_code == 503 and r.headers["retry-after"] == "5" and r.json()["code"] == "server_busy" and r.json()["origin"] == "app"
    finally:
        held.release()


def test_structured_log_keeps_only_documented_keys(caplog):
    caplog.set_level("INFO", logger="labclear.request")
    execution.log_event("workflow", request_id="req_x", route="/chat", message="private text", prompt="secret", api_key="sk-1", step="plan")
    line = json.loads(caplog.records[-1].getMessage())
    assert line["route"] == "/chat" and line["step"] == "plan" and not {"message", "prompt", "api_key"} & set(line)


# ------------------------------------------------------------------ document worker

def test_worker_reads_a_png_and_refuses_bad_files():
    async def run():
        pages = await document_worker.rasterize([png()])
        assert len(pages) == 1 and pages[0][1] == "image/png"
        for raw, code in ((b"%PDF-1.4 broken", "pdf_invalid"), (png(5000, 5000), "image_dimensions_too_large"), (b"text", "unsupported_image")):
            with pytest.raises(ConversationError) as refused:
                await document_worker.rasterize([raw])
            assert refused.value.code == code
    asyncio.run(run())
    assert not document_worker.RUNNING


def test_a_stuck_worker_is_killed_and_reaped(monkeypatch):
    monkeypatch.setattr(document_worker, "command", lambda: [sys.executable, "-c", "import time; time.sleep(600)"])
    monkeypatch.setattr(settings, "DOCUMENT_WORKER_SECONDS", 1.0)
    with pytest.raises(ConversationError) as slow:
        asyncio.run(document_worker.rasterize([png()]))
    assert slow.value.code == "document_timeout" and not document_worker.RUNNING


def test_a_cancelled_worker_is_killed_before_returning(monkeypatch):
    monkeypatch.setattr(document_worker, "command", lambda: [sys.executable, "-c", "import time; time.sleep(600)"])
    spawned = []
    real = document_worker.subprocess.Popen
    monkeypatch.setattr(document_worker.subprocess, "Popen", lambda *a, **k: spawned.append(real(*a, **k)) or spawned[-1])

    async def run():
        task = asyncio.create_task(document_worker.rasterize([png()]))
        while not spawned:
            await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(run())
    assert spawned[0].poll() is not None and not document_worker.RUNNING


def test_worker_gets_no_application_secrets(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-should-not-leak")
    env = document_worker._environment()
    assert "LLM_API_KEY" not in env and set(env) <= {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL"}


# ------------------------------------------------------------------ provider errors

def test_provider_statuses_are_classified_with_their_origin():
    from services.conversation_transport import rejection_error
    assert (rejection_error("llm", 429).code, rejection_error("llm", 429).status, rejection_error("llm", 429).origin) == ("upstream_rate_limited", 503, "upstream")
    assert (rejection_error("guard", 503).code, rejection_error("guard", 502).status) == ("upstream_unavailable", 502)
    assert rejection_error("llm", 401).code == "provider_rejected"


def test_new_failure_codes_are_retryable():
    from routers.business import RETRYABLE
    assert {"request_timeout", "upstream_timeout", "upstream_unavailable", "upstream_rate_limited", "cancelled", "server_draining"} <= RETRYABLE


def test_blueprint_uses_readiness_and_valid_resilience_defaults():
    """render.yaml: healthCheckPath /ready, single process, and the documented defaults pass validation."""
    import re
    from pathlib import Path
    text = (Path(__file__).resolve().parents[1] / "render.yaml").read_text(encoding="utf-8")
    assert re.search(r"^\s+healthCheckPath: /ready$", text, re.M)
    assert "startCommand: python scripts/run_business.py" in text and "plan: free" in text
    values = dict(re.findall(r"- key: (\w+)\n\s+value: \"([^\"]*)\"", text))
    expected = {"CHAT_DEADLINE_SECONDS": "220", "REPORT_DEADLINE_SECONDS": "150", "STREAM_HEARTBEAT_SECONDS": "10",
                "AI_MAX_IN_FLIGHT": "2", "OCR_MAX_IN_FLIGHT": "1", "PROVIDER_TRANSPORT_RETRIES": "0", "SHUTDOWN_DRAIN_SECONDS": "20"}
    assert {k: values.get(k) for k in expected} == expected
    s = Settings(_env_file=None, **{k: float(v) if "." in v else int(v) for k, v in expected.items()})
    assert s.SHUTDOWN_DRAIN_SECONDS < 30  # inside Render's default shutdown window


def test_offline_socket_counter_excludes_socketpair_and_counts_denials(monkeypatch):
    import socket
    from tests.resilience import harness

    # Retain the offline guard installed by offline_check; restore every wrapper.
    for target, name in ((socket.socket, "connect"), (socket.socket, "connect_ex"),
                         (socket, "create_connection"), (socket, "getaddrinfo")):
        monkeypatch.setattr(target, name, getattr(target, name))
    monkeypatch.setattr(harness, "SOCKETS", {"attempts": 0})
    harness.count_sockets()
    left, right = socket.socketpair()
    try:
        left.send(b"x")
        assert right.recv(1) == b"x"
        assert harness.SOCKETS["attempts"] == 0
    finally:
        left.close()
        right.close()
    with socket.socket() as sock:
        calls = [lambda: sock.connect(("192.0.2.1", 443)),
                 lambda: sock.connect_ex(("192.0.2.1", 443)),
                 lambda: socket.create_connection(("192.0.2.1", 443)),
                 lambda: socket.getaddrinfo("offline.invalid", 443)]
        for expected, call in enumerate(calls, 1):
            with pytest.raises(RuntimeError, match="OFFLINE_CHECK: outbound network forbidden"):
                call()
            assert harness.SOCKETS["attempts"] == expected


@pytest.mark.parametrize("stream", [False, True])
def test_unexpected_workflow_error_does_not_log_private_exception(monkeypatch, caplog, stream):
    from types import SimpleNamespace
    from services import providers
    private = "PRIVATE_REPORT_AND_KEY_CANARY"
    monkeypatch.setattr(providers, "_read_saved", lambda: {})
    caplog.set_level("INFO", logger="labclear.request")

    async def run():
        async def disconnected():
            return False
        async def fail(emit):
            raise ValueError(private)
        request = SimpleNamespace(headers={"accept": "application/x-ndjson" if stream else "application/json"},
                                  is_disconnected=disconnected)
        ctx = execution.start("/chat", "ai")
        if stream:
            response = await execution.respond(request, ctx, fail)
            events = [json.loads(line) async for line in response.body_iterator]
            assert events[-1]["code"] == "server_error"
            assert private not in json.dumps(events)
        else:
            with pytest.raises(ConversationError) as error:
                await execution.respond(request, ctx, fail)
            assert error.value.code == "server_error"
            assert private not in error.value.message
        assert ctx.request_id not in execution.ACTIVE
        assert ctx.slot.released
    asyncio.run(run())
    assert private not in caplog.text
    assert any('workflow_failed' in r.getMessage() for r in caplog.records)
