"""Request execution: one request ID, one deadline, one admission slot and one cancellation scope.

Every AI workflow (chat answers and report reading) runs inside an ``Execution`` created by its
route, and every part of it (Guard, Planner, Tools, Writer, Reviewer, OCR) shares it:

* ``request_id`` (with the conversation ``turn_id``) is returned as ``X-Request-ID``, in JSON errors, in the ``accepted`` stream event
  and in the terminal event, and is written to the structured log line of the request;
* the deadline is monotonic (event-loop clock) and covers the whole workflow: admission, storage,
  provider calls, OCR and finalization. A step does not start without time left
  (``checkpoint``) and a provider call never gets more than the time left (``call_timeout``);
* the admission slot bounds work per instance: ``AI_MAX_IN_FLIGHT`` workflows, of which at most
  ``OCR_MAX_IN_FLIGHT`` read reports. Extra requests get ``503 server_busy`` with
  ``Retry-After: 5`` before any provider call; there is no waiting queue;
* cancellation: Stop, a closed connection, the deadline or shutdown cancel the workflow task. The
  provider HTTP client closes, a document worker process is killed and reaped, and the slot is
  released in ``finally``. Cost reservations stay charged (a provider may bill a cancelled call).

The protocol for streamed workflows is NDJSON: ``accepted`` once admitted, ``step`` events as they
happen, a ``heartbeat`` after every ``STREAM_HEARTBEAT_SECONDS`` without output, then exactly one
terminal event, ``done`` or ``error``. See docs/operations/resilience.md.
"""
from __future__ import annotations

import asyncio
import collections
import contextvars
import json
import inspect
import logging
import secrets
import threading
import time
from typing import Any, Awaitable, Callable

import anyio
from starlette.responses import StreamingResponse

from config import settings
from services.conversation_transport import ConversationError

log = logging.getLogger("labclear.request")

REQUEST_ID: contextvars.ContextVar[str] = contextvars.ContextVar("labclear_request_id", default="")
_CURRENT: contextvars.ContextVar["Execution | None"] = contextvars.ContextVar("labclear_execution", default=None)

MIN_STEP_SECONDS = 1.0     # a step or provider call does not start with less time than this left
CLEANUP_SECONDS = 5.0      # bounded cleanup after a workflow ends (mark the turn, free the conversation)
STREAM_QUEUE_LIMIT = 256   # step events waiting for a slow reader; the terminal event is kept apart

# How a step that was still running is shown when the workflow ends with this error code.
_INTERRUPTED = {"request_timeout": "timeout", "upstream_timeout": "timeout", "cancelled": "cancelled",
                "server_draining": "cancelled", "upstream_unavailable": "unavailable",
                "upstream_rate_limited": "unavailable", "service_unavailable": "unavailable",
                "provider_rejected": "unavailable", "provider_response_invalid": "unavailable"}


def new_request_id() -> str:
    return "req_" + secrets.token_hex(8)


def current() -> "Execution | None":
    return _CURRENT.get()


def checkpoint(step: str) -> None:
    """Before a step starts: raise request_timeout when the workflow has too little time left."""
    ctx = current()
    if ctx is not None:
        ctx.checkpoint(step)


# ------------------------------------------------------------------ admission and lifecycle

class Slot:
    def __init__(self, admission: "Admission", kind: str):
        self.admission, self.kind, self.released = admission, kind, False

    def release(self) -> None:
        self.admission.release(self)


class Admission:
    """Per-instance limits for AI workflows. One HTTP workflow holds one slot, whatever the number of
    agents or provider calls inside it. Callers on any thread; the counters are lock-protected."""

    def __init__(self) -> None:
        self.ai = self.ocr = 0
        self._lock = threading.Lock()

    def acquire(self, kind: str = "ai") -> Slot:
        with self._lock:
            if lifecycle.draining:
                raise draining_error()
            if self.ai >= settings.AI_MAX_IN_FLIGHT or (kind == "ocr" and self.ocr >= settings.OCR_MAX_IN_FLIGHT):
                log_event("admission_refused", kind=kind, ai=self.ai, ocr=self.ocr)
                raise ConversationError("server_busy", "LabClear is busy with other requests. Try again in a few seconds.",
                                        503, origin="app", retry_after=5)
            self.ai += 1
            self.ocr += kind == "ocr"
        return Slot(self, kind)

    def release(self, slot: Slot) -> None:
        with self._lock:
            if slot.released:
                return
            slot.released = True
            self.ai -= 1
            self.ocr -= slot.kind == "ocr"

    def snapshot(self) -> dict:
        with self._lock:
            return {"ai_in_flight": self.ai, "ocr_in_flight": self.ocr,
                    "ai_limit": settings.AI_MAX_IN_FLIGHT, "ocr_limit": settings.OCR_MAX_IN_FLIGHT}


admission = Admission()
ACTIVE: dict[str, "Execution"] = {}


class Lifecycle:
    """Draining starts on SIGTERM (scripts/run_business.py): /ready answers 503, new AI work is
    refused with server_draining, in-flight work may finish within SHUTDOWN_DRAIN_SECONDS and is
    then cancelled with a terminal event."""

    def __init__(self) -> None:
        self.started = False
        self.draining = False

    def begin_drain(self) -> None:
        if not self.draining:
            self.draining = True
            log_event("drain_started", in_flight=len(ACTIVE))

    async def drain(self, budget: float) -> int:
        """Wait for in-flight workflows, then cancel the rest. Returns how many were cancelled."""
        self.begin_drain()
        loop = asyncio.get_running_loop()
        end = loop.time() + budget
        while ACTIVE and loop.time() < end:
            await asyncio.sleep(min(0.1, max(0.0, end - loop.time())))
        left = list(ACTIVE.values())
        for ctx in left:
            ctx.cancel("shutdown")
        end = loop.time() + CLEANUP_SECONDS
        while ACTIVE and loop.time() < end:
            await asyncio.sleep(0.05)
        log_event("drain_finished", cancelled=len(left), still_running=len(ACTIVE))
        return len(left)


lifecycle = Lifecycle()


def draining_error() -> ConversationError:
    return ConversationError("server_draining", "LabClear is restarting. Your message was not answered; try again in a minute.",
                             503, origin="app", retry_after=5)


def cancel_owner(owner: str, reason: str = "stop") -> int:
    """Stop: cancel the workflows of this account (any thread). Returns how many were running."""
    found = [ctx for ctx in list(ACTIVE.values()) if ctx.owner == owner]
    for ctx in found:
        ctx.cancel(reason)
    return len(found)


# ------------------------------------------------------------------ the execution context

class Execution:
    def __init__(self, route: str, kind: str, budget: float, owner: str = "", request_id: str = ""):
        self.loop = asyncio.get_running_loop()
        self.route, self.kind, self.owner = route, kind, owner
        self.request_id = request_id or REQUEST_ID.get() or new_request_id()
        self.budget = float(budget)
        self.started = self.loop.time()
        self.deadline = self.started + self.budget
        self.turn_id = ""          # the conversation turn this request runs (set by the chat and report routes)
        self.slot: Slot | None = None
        self.task: asyncio.Task | None = None
        self.cancel_reason = ""
        self.running: dict[str, tuple[str, float]] = {}
        self.last_step = ""
        self.attempts = 0          # provider calls attempted (each JSON repair counts)
        self.receipt_reserved_thb = 0.0
        self.receipt_settled_thb = 0.0
        self.receipt_ledger_enabled = bool(settings.COST_LEDGER_ENABLED)
        self.receipt_sources = []
        self.dropped_events = 0
        self.outcome = self.code = self.origin = ""
        self.status = 200
        self.providers: dict | None = None  # provider settings snapshot for this workflow (services/providers.py)

    # time
    def remaining(self) -> float:
        return self.deadline - self.loop.time()

    def elapsed_ms(self) -> int:
        return round((self.loop.time() - self.started) * 1000)

    def checkpoint(self, step: str) -> None:
        if self.remaining() < MIN_STEP_SECONDS:
            self.last_step = step or self.last_step
            raise self.timeout_error()

    def call_timeout(self, timeout: float) -> float | None:
        """Seconds a provider call may take, or None when the workflow deadline is the tighter bound."""
        left = self.remaining()
        if left < MIN_STEP_SECONDS:
            raise self.timeout_error()
        return None if timeout >= left else timeout

    def timeout_error(self) -> ConversationError:
        return ConversationError("request_timeout", "This took longer than the time allowed and was stopped. No answer was saved; please try again.",
                                 504, origin="app")

    # steps, as streamed to Process Explainability
    def track(self, event: dict) -> None:
        if event.get("type") != "step" or not event.get("id"):
            return
        step_id = event["id"]
        if event.get("state") == "running":
            self.running[step_id] = (event.get("label") or step_id, self.loop.time())
            self.last_step = step_id
        else:
            self.running.pop(step_id, None)
            if event.get("state") == "error":
                self.last_step = step_id

    def interrupted(self, exc: ConversationError) -> list[dict]:
        state = _INTERRUPTED.get(exc.code, "error")
        now = self.loop.time()
        return [{"type": "step", "id": step_id, "state": state, "label": label,
                 "detail": exc.code, "duration_ms": round((now - started) * 1000, 1)}
                for step_id, (label, started) in self.running.items()]

    # cancellation
    def cancel(self, reason: str) -> None:
        """Thread-safe: Stop runs in a worker thread, disconnects and shutdown on the loop."""
        if not self.cancel_reason:
            self.cancel_reason = reason
        if self.task is not None and not self.task.done():
            self.loop.call_soon_threadsafe(self.task.cancel)

    def cancel_error(self) -> ConversationError:
        if self.remaining() <= 0:
            return self.timeout_error()
        if self.cancel_reason == "shutdown":
            return draining_error()
        if self.cancel_reason == "disconnect":
            return ConversationError("cancelled", "The connection closed before the answer finished.", 499, origin="client")
        return ConversationError("cancelled", "Stopped. A late answer will not be added.", 409, origin="client")

    def error_event(self, exc: ConversationError) -> dict:
        from services.workflow_receipt import receipt
        return {"type": "error", "code": exc.code, "message": exc.message, "status": exc.status, "origin": exc.origin,
                "request_id": self.request_id, "step": self.last_step or None, "receipt": receipt(self)}

    def accepted_event(self) -> dict:
        return {"type": "accepted", "request_id": self.request_id, "deadline_ms": round(self.budget * 1000),
                "heartbeat_ms": round(settings.STREAM_HEARTBEAT_SECONDS * 1000)}

    # bookkeeping
    def register(self, task: asyncio.Task) -> None:
        self.task = task
        ACTIVE[self.request_id] = self

    def release(self) -> None:
        ACTIVE.pop(self.request_id, None)
        if self.slot is not None:
            self.slot.release()

    def finish(self, outcome: str, exc: ConversationError | None = None) -> None:
        self.outcome = outcome
        if exc is not None:
            self.code, self.origin, self.status = exc.code, exc.origin, exc.status

    def summary(self, stream: bool) -> dict:
        return {"request_id": self.request_id, "turn_id": self.turn_id or None, "route": self.route, "kind": self.kind, "stream": stream,
                "outcome": self.outcome, "status": self.status, "code": self.code or None, "origin": self.origin or None,
                "step": self.last_step or None, "duration_ms": self.elapsed_ms(), "attempts": self.attempts,
                "dropped_events": self.dropped_events}


def start(route: str, kind: str, owner: str = "", budget: float | None = None) -> Execution:
    """A route's workflow context, admitted: raises server_busy / server_draining before any work."""
    if budget is None:
        budget = settings.REPORT_DEADLINE_SECONDS if kind == "ocr" else settings.CHAT_DEADLINE_SECONDS
    ctx = Execution(route, kind, budget, owner)
    ctx.slot = admission.acquire(kind)
    return ctx


async def bounded(ctx: Execution, work: Awaitable[Any]) -> Any:
    """Await ``work`` under the workflow deadline. The deadline cancels it and becomes request_timeout."""
    try:
        async with asyncio.timeout_at(ctx.deadline):
            return await work
    except TimeoutError:
        raise ctx.timeout_error() from None


# ------------------------------------------------------------------ running blocking work

async def offload(fn: Callable, *args, **kwargs):
    """Run blocking work (storage, CPU) in a worker thread so the event loop keeps serving /health,
    heartbeats and other requests. Context variables (request ID, execution) follow the call."""
    return await asyncio.to_thread(fn, *args, **kwargs)


async def cleanup(fn: Callable, *args) -> None:
    """Bounded cleanup in ``except``/``finally``: never longer than CLEANUP_SECONDS, never raises, so
    it cannot hide the error that ended the workflow. Runs even while the task is being cancelled."""
    future = asyncio.ensure_future(asyncio.to_thread(fn, *args))
    try:
        await asyncio.wait_for(asyncio.shield(future), CLEANUP_SECONDS)
    except (Exception, asyncio.CancelledError) as exc:  # noqa: BLE001 - cleanup must not mask the cause
        log_event("cleanup_incomplete", reason=type(exc).__name__)


# ------------------------------------------------------------------ running a workflow for a route

class _Channel:
    """Events for one streamed workflow. Step events are bounded (an overflow is counted, not
    queued); the interrupted-step states and the terminal event are always delivered."""

    def __init__(self, limit: int = STREAM_QUEUE_LIMIT):
        self.events: collections.deque = collections.deque()
        self.limit, self.dropped = limit, 0
        self.terminal: dict | None = None
        self.wake = asyncio.Event()

    def put(self, event: dict) -> None:
        if self.terminal is not None:
            return
        if len(self.events) >= self.limit:
            self.dropped += 1
            return
        self.events.append(event)
        self.wake.set()

    def finish(self, before: list[dict], terminal: dict) -> None:
        if self.terminal is not None:
            return
        self.events.extend(before)
        self.terminal = terminal
        self.wake.set()


class NDJSONResponse(StreamingResponse):
    """Streams one workflow and always listens for the client disconnecting (whatever ASGI spec
    version the server reports). on_close runs when the response ends for any reason."""

    media_type = "application/x-ndjson"

    def __init__(self, content, on_close: Callable[[], Awaitable[None] | None], headers: dict | None = None):
        super().__init__(content, headers=headers, media_type=self.media_type)
        self.on_close = on_close

    async def __call__(self, scope, receive, send) -> None:
        try:
            async with anyio.create_task_group() as group:
                async def stream() -> None:
                    await self.stream_response(send)
                    group.cancel_scope.cancel()

                async def listen() -> None:
                    await self.listen_for_disconnect(receive)
                    group.cancel_scope.cancel()

                group.start_soon(stream)
                group.start_soon(listen)
        except* OSError:
            pass  # the client went away while we were writing
        finally:
            # Disconnect cancels the streaming task group, not the independently
            # registered workflow's bounded storage cleanup.
            with anyio.CancelScope(shield=True):
                closing = self.on_close()
                if inspect.isawaitable(closing):
                    await closing


def _line(event: dict) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode()


async def respond(request, ctx: Execution, run: Callable[[Callable], Awaitable[Any]]):
    """Run ``run(emit)`` as this request's workflow. With ``Accept: application/x-ndjson`` the
    response is the NDJSON stream; otherwise the JSON result or a JSON error."""
    stream = "application/x-ndjson" in request.headers.get("accept", "")
    channel = _Channel() if stream else None
    _CURRENT.set(ctx)

    async def emit(event: dict) -> None:
        if event.get("type") == "step" and event.get("state") == "running":
            ctx.checkpoint(event.get("id", ""))
        ctx.track(event)
        if channel is not None:
            channel.put(event)

    async def workflow():
        from services import providers
        ctx.providers = await offload(providers._read_saved)
        return await run(emit)

    async def work():
        try:
            result = await bounded(ctx, workflow())
            ctx.finish("done")
            if channel is not None:
                ctx.dropped_events = channel.dropped
                from services.workflow_receipt import receipt
                channel.finish([], {"type": "done", "result": result, "request_id": ctx.request_id, "receipt": receipt(ctx),
                                    **({"dropped_events": channel.dropped} if channel.dropped else {})})
            return result
        except ConversationError as exc:
            _ended(exc)
            if channel is None:
                raise
        except asyncio.CancelledError:
            _ended(ctx.cancel_error())
            raise
        except Exception as exc:
            # Exception text and traceback source lines can contain report data or
            # provider credentials. Keep a request ID and type, never the payload.
            log_event("workflow_failed", request_id=ctx.request_id, reason=type(exc).__name__)
            exc = ConversationError("server_error", "Something went wrong on our side. Please try again.", 500)
            _ended(exc)
            if channel is None:
                raise exc from None
        # Streamed: the outcome went to the client as the terminal event; nothing awaits this task.
        finally:
            ctx.release()
            log_event("workflow", **ctx.summary(stream))

    def _ended(exc: ConversationError) -> None:
        ctx.finish("cancelled" if exc.code in ("cancelled", "server_draining") else "error", exc)
        if channel is not None:
            ctx.dropped_events = channel.dropped
            channel.finish(ctx.interrupted(exc), ctx.error_event(exc))

    task = asyncio.create_task(work())
    ctx.register(task)

    if channel is None:
        watcher = asyncio.create_task(_watch_disconnect(request, ctx))
        try:
            return await task
        except asyncio.CancelledError:
            if task.cancelled() and not asyncio.current_task().cancelling():
                raise ctx.cancel_error() from None
            ctx.cancel("disconnect")
            raise
        finally:
            watcher.cancel()

    heartbeat = settings.STREAM_HEARTBEAT_SECONDS

    async def lines():
        yield _line(ctx.accepted_event())
        while True:
            if not channel.events and channel.terminal is None:
                channel.wake.clear()
                try:
                    await asyncio.wait_for(channel.wake.wait(), heartbeat)
                except TimeoutError:
                    yield _line({"type": "heartbeat", "elapsed_ms": ctx.elapsed_ms()})
                    continue
            while channel.events:
                yield _line(channel.events.popleft())
            if channel.terminal is not None:
                yield _line(channel.terminal)
                return

    async def on_close() -> None:
        # Keep response teardown joined to workflow cleanup. A new request must
        # not race an unfinished failed-turn write / busy-slot release.
        if channel.terminal is None and not task.done():
            if not ctx.cancel_reason:
                ctx.cancel("disconnect")
            # wait() bounds this join without cancelling storage cleanup again.
            # On timeout the workflow remains registered and owns its slot until
            # its own finally block releases it; never pretend it is finished.
            _, pending = await asyncio.wait({task}, timeout=CLEANUP_SECONDS)
            if pending:
                log_event("disconnect_cleanup_pending", request_id=ctx.request_id)

    return NDJSONResponse(lines(), on_close, headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no",
                                                      "X-Request-ID": ctx.request_id})


async def _watch_disconnect(request, ctx: Execution) -> None:
    """Plain JSON requests: cancel the workflow when the client goes away."""
    try:
        while True:
            if await request.is_disconnected():
                ctx.cancel("disconnect")
                return
            await asyncio.sleep(1.0)
    except asyncio.CancelledError:
        pass


# ------------------------------------------------------------------ structured logs

_LOG_KEYS = {"request_id", "turn_id", "route", "kind", "stream", "outcome", "status", "code", "origin", "step", "duration_ms",
             "attempts", "dropped_events", "method", "in_flight", "ai", "ocr", "cancelled", "still_running", "reason",
             "storage", "worker", "pages", "returncode"}


def log_event(event: str, **fields) -> None:
    """One JSON line per event. Only the keys above: never prompts, messages, report images or
    values, keys, tokens or personal identifiers."""
    record = {"event": event, "at": round(time.time(), 3)}
    if "request_id" not in fields and REQUEST_ID.get():
        record["request_id"] = REQUEST_ID.get()
    record.update({k: v for k, v in fields.items() if k in _LOG_KEYS})
    log.info(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
