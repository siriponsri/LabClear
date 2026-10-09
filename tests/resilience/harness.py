"""In-process harness for the resilience suite. MOCKED_TEST_ONLY, never deploy.

* ``setup()`` configures the real application as an owner would (Typhoon text and OCR, iApp guard),
  with a canary API key, an isolated SQLite database (scripts/offline_check.py) and the provider
  network hop replaced by ``FaultProvider`` behind an in-process ``httpx.MockTransport``. The call
  cap, the THB cost ledger, the guard and every validator are the real ones. Nothing can leave the
  machine: offline_check denies every outbound socket and ``SOCKETS`` counts attempts.
* ``Client`` drives the ASGI application directly (no server, no socket): it can read a stream
  event by event with virtual timestamps and disconnect at any point.
* ``FaultProvider`` answers each provider stage normally (tests/benchmark doubles; OCR returns a
  fixed synthetic table) or with a fault: hang, trickle, an HTTP status, a malformed body or a delay.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from urllib.parse import urlsplit

import httpx

ROOT = Path(__file__).resolve().parents[2]
CANARY_KEY = "sk-resilience-canary-7f3a9c1e5b2d4086"
CANARY_TEXT = "RESILIENCE-CANARY ข้อความทดสอบ HbA1c คืออะไร"
SYNTHETIC_TABLE = "Test Result Unit Reference\nALT 35 U/L 0-40\nAST 28 U/L 0-40\n"  # synthetic values only


# ------------------------------------------------------------------ provider faults

def stage_of(request: httpx.Request) -> str:
    url = urlsplit(str(request.url))
    if "systemone" in url.path:
        return "guard"
    try:
        body = json.loads(request.content or b"{}")
    except ValueError:
        return "unknown"
    from tests.benchmark.doubles import _stage
    messages = body.get("messages") or []
    system = next((m.get("content", "") for m in messages if m.get("role") == "system" and isinstance(m.get("content"), str)), "")
    return _stage(system, messages)


class FaultProvider:
    """faults: {stage or "stage#n" (n-th call): mode}. Modes: "hang", "trickle", "status:502", "malformed",
    "guard_malformed", "reject" (reviewer), "delay:<seconds>" optionally followed by "+<mode>".
    Every call and every cancelled call is counted per stage."""

    def __init__(self, recorder_path: Path):
        from tests.benchmark import doubles
        self.normal = doubles.make_handler(doubles.Recorder(recorder_path, None))
        self.faults: dict[str, str] = {}
        self.calls: dict[str, int] = {}
        self.cancelled: dict[str, int] = {}
        self.order: list[str] = []

    def reset(self, **faults) -> None:
        self.faults = dict(faults)
        self.calls, self.cancelled, self.order = {}, {}, []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        await request.aread()
        stage = stage_of(request)
        self.calls[stage] = self.calls.get(stage, 0) + 1
        self.order.append(stage)
        mode = self.faults.get(f"{stage}#{self.calls[stage]}", self.faults.get(stage, "ok"))
        try:
            if mode == "hang":
                await asyncio.sleep(10 ** 7)
            if mode.startswith("delay:"):
                delay, _, rest = mode.partition("+")
                await asyncio.sleep(float(delay.split(":", 1)[1]))
                mode = rest or "ok"
        except asyncio.CancelledError:
            self.cancelled[stage] = self.cancelled.get(stage, 0) + 1
            raise
        if mode == "trickle":
            provider = self

            async def slowly():
                try:
                    yield b'{"choices": ['
                    while True:  # a provider that keeps the connection busy and never finishes
                        await asyncio.sleep(5)
                        yield b" "
                except asyncio.CancelledError:
                    provider.cancelled[stage] = provider.cancelled.get(stage, 0) + 1
                    raise
            return httpx.Response(200, content=slowly(), headers={"content-type": "application/json"})
        if mode.startswith("status:"):
            status = int(mode.split(":", 1)[1])
            # The provider echoes something key-like: LabClear must never repeat it.
            return httpx.Response(status, json={"error": {"message": "upstream trouble", "key": CANARY_KEY}})
        if mode == "malformed":
            return httpx.Response(200, content=b"<html><body>Bad gateway</body></html>", headers={"content-type": "text/html"})
        if mode == "reject":  # the reviewer finds the draft unsupported: the writer must rewrite once
            content = json.dumps({"supported": False, "values_preserved": True, "within_scope": True})
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                                             "usage": {"prompt_tokens": 100, "completion_tokens": 20}})
        if mode == "guard_malformed":
            return httpx.Response(200, json={"answers": {}})
        if stage == "ocr":
            content = SYNTHETIC_TABLE
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                                             "usage": {"prompt_tokens": 1000, "completion_tokens": 50}})
        return await self.normal(request)


# ------------------------------------------------------------------ application setup

SOCKETS = {"attempts": 0}


def count_sockets() -> None:
    """offline_check already denies outbound sockets; also count every attempt for the report."""
    import socket
    original = socket.socket.connect

    def counted(sock, address):
        if not (isinstance(address, str) or sock.family == getattr(socket, "AF_UNIX", -1)):
            SOCKETS["attempts"] += 1
        return original(sock, address)
    socket.socket.connect = counted


def setup(workdir: Path):
    """Configure the real app with provider doubles. Returns (app, provider)."""
    from config import settings
    settings.LLM_PROVIDER, settings.LLM_API_KEY, settings.LLM_MODEL = "typhoon", CANARY_KEY, ""
    settings.VISION_ENABLED, settings.VISION_PROVIDER, settings.VISION_API_KEY = True, "typhoon_ocr", CANARY_KEY
    settings.GUARD_PROVIDER, settings.GUARD_API_KEY = "iapp_systemone", CANARY_KEY
    settings.PROVIDER_BUDGET_CYCLE_ID = "resilience-suite"
    settings.CLOUD_CALL_LIMIT = 100000
    settings.PROJECT_BUDGET_PRIOR_SPEND_THB = "0"
    settings.PROJECT_BUDGET_THB = 100000.0
    settings.CHAT_RATE_LIMIT_REQUESTS = 100000
    settings.RUNTIME_SKILLS_ENABLED = True
    settings.HOSPITAL_LINKS_ENABLED = False
    settings.PROVIDER_NETWORK_ENABLED = True  # only the in-process MockTransport can be reached
    provider = FaultProvider(workdir / "provider-calls.jsonl")
    from services import conversation_transport as transport
    real_client = httpx.AsyncClient

    class DoubleClient(real_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(provider)
            super().__init__(*args, **kwargs)

    transport.httpx.AsyncClient = DoubleClient
    from services import business_store as db, providers
    db.STRICT_EVENT_LOOP = True  # the chat and report workflows must never touch storage on the event loop
    from tests.benchmark import doubles
    doubles.load_skill_headers(ROOT / "runtime_skills" / "thai_health")
    from main import app
    providers.clear_cache()
    return app, provider


class LogCapture(logging.Handler):
    def __init__(self):
        super().__init__(logging.DEBUG)
        self.records: list[str] = []

    def emit(self, record):
        try:
            self.records.append(record.name + " " + record.getMessage())
        except Exception:  # noqa: BLE001
            self.records.append(record.name + " <unformattable>")

    def events(self, name: str = "labclear.request") -> list[dict]:
        out = []
        for line in self.records:
            if line.startswith(name + " {"):
                out.append(json.loads(line[len(name) + 1:]))
        return out


# ------------------------------------------------------------------ in-process ASGI client

class Response:
    def __init__(self):
        self.status = 0
        self.headers: dict[str, str] = {}
        self.chunks: asyncio.Queue = asyncio.Queue()
        self.body = b""
        self.finished = asyncio.Event()
        self.disconnected = asyncio.Event()
        self.task: asyncio.Task | None = None
        self.started = asyncio.Event()

    def json(self):
        return json.loads(self.body)

    async def events(self, stop_after=None):
        """NDJSON events as they arrive: (virtual time, event). Stops at a terminal event or EOF."""
        loop = asyncio.get_running_loop()
        buffer = b""
        while True:
            chunk = await self.chunks.get()
            if chunk is None:
                break
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                if line.strip():
                    event = json.loads(line)
                    yield loop.time(), event
                    if stop_after and stop_after(event):
                        return

    def disconnect(self):
        self.disconnected.set()


class Client:
    def __init__(self, app):
        self.app = app
        self.guest = ""
        self.csrf = ""
        self.cookies: dict[str, str] = {}

    def _scope(self, method, path, headers):
        raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
        return {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"}, "http_version": "1.1", "method": method,
                "scheme": "http", "path": path.split("?")[0], "raw_path": path.encode(), "query_string": (path.split("?", 1)[1] if "?" in path else "").encode(),
                "root_path": "", "headers": [(b"host", b"testserver")] + raw, "client": ("127.0.0.1", 50000), "server": ("testserver", 80)}

    async def start(self, method, path, *, json_body=None, data=None, files=None, headers=None, stream=False) -> Response:
        hdrs = {"X-Business-CSRF": self.csrf, **({"X-LabClear-Guest": self.guest} if self.guest else {})}
        hdrs.update(headers or {})
        if self.cookies:
            hdrs["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        if stream:
            hdrs["Accept"] = "application/x-ndjson"
        request = httpx.Request(method, "http://testserver" + path, json=json_body, data=data, files=files, headers=hdrs)
        body = request.read()
        hdrs = {k: v for k, v in request.headers.items() if k.lower() not in ("host",)}
        response = Response()
        sent = {"done": False}

        async def receive():
            if not sent["done"]:
                sent["done"] = True
                return {"type": "http.request", "body": body, "more_body": False}
            await response.disconnected.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            if response.disconnected.is_set():
                raise OSError("client disconnected")
            if message["type"] == "http.response.start":
                response.status = message["status"]
                response.headers = {k.decode().lower(): v.decode() for k, v in message["headers"]}
                for k, v in message["headers"]:
                    if k.decode().lower() == "set-cookie":
                        name, _, rest = v.decode().partition("=")
                        value = rest.split(";", 1)[0]
                        if "max-age=0" in v.decode().lower() or 'expires=thu, 01 jan 1970' in v.decode().lower():
                            self.cookies.pop(name, None)
                        else:
                            self.cookies[name] = value
                response.started.set()
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                response.body += chunk
                if chunk:
                    response.chunks.put_nowait(chunk)
                if not message.get("more_body", False):
                    response.chunks.put_nowait(None)
                    response.finished.set()

        async def run():
            try:
                await self.app(self._scope(method, path, hdrs), receive, send)
            finally:
                if not response.finished.is_set():
                    response.chunks.put_nowait(None)
                    response.finished.set()
        response.task = asyncio.create_task(run())
        return response

    async def request(self, method, path, **kw) -> Response:
        response = await self.start(method, path, **kw)
        await response.task
        return response

    async def session(self):
        r = await self.request("GET", "/api/business/session")
        data = r.json()
        self.guest, self.csrf = data["guest_token"], data["csrf"]
        return data
