"""Deterministic resilience cases (server side). MOCKED_TEST_ONLY, never deploy.

Run by scripts/benchmark_resilience.py through ``scripts/offline_check.py resilience <config.json>``:
isolated environment, temporary SQLite storage, outbound sockets denied, provider doubles in process,
and a virtual clock (tests/resilience/vclock.py) so deadlines, heartbeats and hangs resolve
instantly and in the same order every run. Each case records named assertions; a case passes only
when all of its assertions pass. Timings reported here are virtual seconds, never Render latency.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import random
import sqlite3
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.resilience import vclock  # noqa: E402
from tests.resilience.harness import CANARY_KEY, CANARY_TEXT, SOCKETS, Client, LogCapture, count_sockets, setup  # noqa: E402

API = "/api/business"
TERMINAL = ("done", "error")


class Case:
    def __init__(self, case_id: str, title: str):
        self.id, self.title = case_id, title
        self.assertions: list[dict] = []
        self.artifacts: dict = {}
        self.error = ""

    def check(self, name: str, ok, detail=None) -> bool:
        self.assertions.append({"name": name, "passed": bool(ok), **({"detail": _plain(detail)} if detail is not None and not ok else {})})
        return bool(ok)

    def result(self) -> dict:
        passed = bool(self.assertions) and all(a["passed"] for a in self.assertions) and not self.error
        out = {"id": self.id, "title": self.title, "passed": passed, "assertions": self.assertions}
        if self.error:
            out["error"] = self.error
        if not passed and self.artifacts:
            out["artifacts"] = self.artifacts
        return out


def _plain(value):
    try:
        json.dumps(value)
        return value
    except TypeError:
        return repr(value)


# ------------------------------------------------------------------ helpers

async def collect(response, until=None):
    return [(t, e) async for t, e in response.events(until)]


def kinds(events):
    return [e.get("type") for _, e in events]


def terminal_of(events):
    return events[-1][1] if events and events[-1][1].get("type") in TERMINAL else {}


def steps(events, step_id=None):
    return [e for _, e in events if e.get("type") == "step" and (step_id is None or e.get("id") == step_id)]


async def stored(fn):
    """Storage reads for assertions run in a worker thread, like the application's own."""
    from services import business_store as db

    def run():
        with db.transaction() as tx:
            return fn(tx)
    return await asyncio.to_thread(run)


async def workspace(client):
    return (await client.request("GET", API + "/workspace")).json()


async def guest(app):
    client = Client(app)
    await client.session()
    return client


def idle():
    from services import execution
    snap = execution.admission.snapshot()
    return snap["ai_in_flight"] == 0 and snap["ocr_in_flight"] == 0 and not execution.ACTIVE


async def settle(seconds=0.05):
    await asyncio.sleep(seconds)


def png(width=600, height=400) -> bytes:
    from PIL import Image
    out = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(out, "PNG")
    return out.getvalue()


def pdf(pages=1) -> bytes:
    from reportlab.pdfgen import canvas
    out = io.BytesIO()
    c = canvas.Canvas(out)
    for i in range(pages):
        c.drawString(72, 720, f"Synthetic page {i + 1}")
        c.showPage()
    c.save()
    return out.getvalue()


async def ledger_cancelled():
    def read(tx):
        return sum(1 for r in tx.find("cost_entry", "system") if r["data"].get("outcome") == "cancelled")
    return await stored(read)


# ------------------------------------------------------------------ cases

async def r01(app, provider, logs, loop):
    c = Case("R01", "Provider hangs or sends data slowly without end")
    from services import execution
    from config import settings
    # (a) every call is slow but within its own limit; the chain (with one rewrite) outlasts the
    #     220 s workflow deadline, which ends it during the rewrite: the corrective call shares it.
    provider.reset(planner="delay:59", writer="delay:59", reviewer="delay:59+reject")
    client = await guest(app)
    cancelled_before = await ledger_cancelled()
    started = loop.time()
    r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    events = await collect(r)
    end = terminal_of(events)
    elapsed = (events[-1][0] - started) if events else -1
    c.artifacts["deadline_events"] = [e for _, e in events if e.get("type") != "heartbeat"][-6:]
    c.check("slow chain: terminal error request_timeout (504, origin app)", end.get("type") == "error" and end.get("code") == "request_timeout" and end.get("status") == 504 and end.get("origin") == "app", end)
    c.check("ends at the workflow deadline CHAT_DEADLINE_SECONDS = 220 s (virtual clock, +1.5 s)", settings.CHAT_DEADLINE_SECONDS - 0.5 <= elapsed <= settings.CHAT_DEADLINE_SECONDS + 1.5, round(elapsed, 3))
    c.check("exactly one terminal event", sum(k in TERMINAL for k in kinds(events)) == 1, kinds(events)[-3:])
    beats = [t for t, e in events if e.get("type") == "heartbeat"]
    c.check("heartbeats every 10 s while waiting (>= 15 in 220 s)", len(beats) >= 15, len(beats))
    c.check("the rewrite (second writer call) was cut by the deadline and shown as timeout",
            provider.calls.get("writer") == 2 and provider.cancelled.get("writer") == 1 and any(e.get("state") == "timeout" for e in steps(events, "draft")), provider.calls)
    c.check("no step started after the deadline (no output guard)", provider.calls.get("guard", 0) == 1 and not steps(events, "safety_out"), provider.calls)
    w = await workspace(client)
    last = w["conversation"]["messages"][-1]
    c.check("the message is kept as failed and retryable, with the request ID", last.get("failed") and last.get("retryable") and last.get("error") == "request_timeout"
            and (last.get("failure") or {}).get("request_id") == end.get("request_id"), last)
    c.check("the conversation is not left busy", not w["conversation"].get("busy_until"), w["conversation"].get("busy_until"))
    c.check("admission slot and registry released", idle(), execution.admission.snapshot())
    c.check("the cut call keeps its cost reservation (charged, not refunded)", await ledger_cancelled() == cancelled_before + 1)
    # (b) the planner never answers: its own call budget (LLM timeout 60 s) ends it as upstream_timeout
    provider.reset(planner="hang")
    client = await guest(app)
    started = loop.time()
    r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    events = await collect(r)
    end = terminal_of(events)
    c.check("hung planner: terminal upstream_timeout (504, origin upstream) after its call budget", end.get("code") == "upstream_timeout" and end.get("origin") == "upstream"
            and 59 <= events[-1][0] - started <= 61.5, (end, round(events[-1][0] - started, 3)))
    c.check("hung planner: shown as timeout, no later agent step", any(e.get("state") == "timeout" for e in steps(events, "plan"))
            and not [e["id"] for e in steps(events) if e["id"] not in ("harness", "safety_in", "plan")], [e["id"] for e in steps(events)])
    c.check("hung planner: writer, reviewer and output guard never called", provider.calls.get("writer", 0) == 0 and provider.calls.get("reviewer", 0) == 0 and provider.calls.get("guard", 0) == 1, provider.calls)
    c.check("hung planner: the call was cancelled (HTTP client closed)", provider.cancelled.get("planner", 0) == 1, provider.cancelled)
    c.check("hung planner: slot released", idle())
    # (c) the same without streaming: an HTTP 504 JSON error with the request ID
    provider.reset(planner="hang")
    client = await guest(app)
    r = await client.request("POST", API + "/chat", json_body={"message": "What does LDL mean?"})
    body = r.json()
    c.check("plain JSON request: HTTP 504 with code, origin and X-Request-ID in header and body", r.status == 504 and body.get("code") == "upstream_timeout"
            and body.get("origin") == "upstream" and body.get("request_id") == r.headers.get("x-request-id") and body["request_id"].startswith("req_"), {"status": r.status, "body": body})
    c.check("plain JSON request released its slot", idle(), execution.admission.snapshot())
    # (d) the writer trickles bytes for ever: the whole-call budget ends it (httpx read timeouts alone would not)
    provider.reset(writer="trickle")
    client = await guest(app)
    r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    events = await collect(r)
    end = terminal_of(events)
    draft = [t for t, e in events if e.get("type") == "step" and e.get("id") == "draft" and e.get("state") == "running"]
    took = events[-1][0] - draft[0] if draft else -1
    c.check("trickling provider: terminal upstream_timeout (504, origin upstream)", end.get("code") == "upstream_timeout" and end.get("status") == 504 and end.get("origin") == "upstream", end)
    c.check("ended by the provider call budget (LLM timeout 60 s, never more than 75 s)", 59 <= took <= 61.5, round(took, 3))
    c.check("no reviewer or output guard after the timed-out writer", provider.calls.get("reviewer", 0) == 0 and provider.calls.get("guard", 0) == 1, provider.calls)
    c.check("trickling call cancelled", provider.cancelled.get("writer", 0) == 1, provider.cancelled)
    c.check("slot released after the trickle", idle())
    return c


async def r02(app, provider, logs, loop):
    c = Case("R02", "Provider 502/503/429 and malformed output")
    from services import execution
    scenarios = [
        ("input guard HTTP 502", {"guard": "status:502"}, "upstream_unavailable", 502, "safety_in", "guard", 1),
        ("planner HTTP 429", {"planner": "status:429"}, "upstream_rate_limited", 503, "plan", "planner", 1),
        ("writer HTTP 503", {"writer": "status:503"}, "upstream_unavailable", 502, "draft", "writer", 1),
        ("reviewer returns an HTML page", {"reviewer": "malformed"}, "provider_response_invalid", 502, "review", "reviewer", 1),
        ("output guard HTTP 503", {"guard#2": "status:503"}, "upstream_unavailable", 502, "safety_out", "guard", 2),
        ("output guard returns no verdict", {"guard#2": "guard_malformed"}, "guard_invalid", 502, "safety_out", "guard", 2),
    ]
    for name, faults, code, status, step_id, stage, calls in scenarios:
        provider.reset(**faults)
        client = await guest(app)
        r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
        events = await collect(r)
        end = terminal_of(events)
        origin = "upstream" if code != "guard_invalid" else "app"
        c.check(f"{name}: classified as {code} ({status}, origin {origin})", end.get("code") == code and end.get("status") == status and end.get("origin") == origin, end)
        c.check(f"{name}: no automatic retry ({stage} called {calls}x in total)", provider.calls.get(stage, 0) == calls, provider.calls)
        shown = [e.get("state") for e in steps(events, step_id) if e.get("state") not in ("running", "done")]
        c.check(f"{name}: {step_id} shown as ended, not passed", shown and shown[-1] in ("unavailable", "error"), shown)
        c.check(f"{name}: the provider's echoed key never reaches the client", CANARY_KEY not in json.dumps(end), end)
        w = await workspace(client)
        roles = [m["role"] for m in w["conversation"]["messages"]]
        c.check(f"{name}: no answer was shown or stored (fail closed)", "assistant" not in roles and not any(e.get("type") == "done" for _, e in events), roles)
        c.check(f"{name}: slot released", idle(), execution.admission.snapshot())
    return c


async def r04(app, provider, logs, loop):
    c = Case("R04", "Idle stream, a stream cut before done, an invalid line")
    from services import execution
    provider.reset(planner="delay:25")
    client = await guest(app)
    r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    events = await collect(r)
    beats = [t for t, e in events if e.get("type") == "heartbeat"]
    gaps = [round(b - a, 3) for a, b in zip(beats, beats[1:])]
    c.check("a heartbeat is sent after each 10 s without output (>= 2 during a 25 s wait)", len(beats) >= 2, len(beats))
    c.check("heartbeats are 10 s apart (virtual clock)", all(abs(g - 10) < 0.5 for g in gaps), gaps)
    c.check("the stream still ends with exactly one done", terminal_of(events).get("type") == "done" and sum(k in TERMINAL for k in kinds(events)) == 1, kinds(events)[-3:])
    c.check("accepted comes first, with the request ID, deadline and heartbeat interval", events[0][1].get("type") == "accepted" and events[0][1].get("deadline_ms") == 220000
            and events[0][1].get("heartbeat_ms") == 10000 and events[0][1].get("request_id") == r.headers.get("x-request-id"), events[0][1])
    # Bounded queue: a slow reader drops step events (counted), never the terminal event.
    channel = execution._Channel(limit=3)
    for i in range(10):
        channel.put({"type": "step", "id": f"s{i}", "state": "done"})
    channel.finish([{"type": "step", "id": "s9", "state": "timeout"}], {"type": "error", "code": "request_timeout"})
    channel.put({"type": "step", "id": "late"})
    c.check("bounded queue: overflow counted, interrupted step and terminal still delivered, nothing after it",
            channel.dropped == 7 and list(channel.events)[-1]["state"] == "timeout" and channel.terminal["code"] == "request_timeout" and len(channel.events) == 4,
            {"dropped": channel.dropped, "queued": len(channel.events)})
    return c


async def r05(app, provider, logs, loop):
    c = Case("R05", "Stop or a closed connection while waiting for AI")
    from services import execution, document_worker
    # (a) Stop while the planner is waiting
    provider.reset(planner="hang")
    client = await guest(app)
    r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    seen = []
    async for t, e in r.events():
        seen.append((t, e))
        if e.get("type") == "step" and e.get("id") == "plan" and e.get("state") == "running":
            while provider.calls.get("planner", 0) == 0:  # the planner call is open at the provider
                await asyncio.sleep(0.01)
            stop_at = loop.time()
            stop = await client.request("POST", API + "/stop", json_body={})
            c.check("Stop answers 200", stop.status == 200, stop.status)
    end = terminal_of(seen)
    c.check("the stream ends with a terminal cancelled event, promptly", end.get("code") == "cancelled" and seen[-1][0] - stop_at < 1.0, end)
    c.check("the planner call was cancelled (HTTP client closed)", provider.cancelled.get("planner", 0) == 1, provider.cancelled)
    await asyncio.sleep(300)  # well past any provider timeout: a late answer would have arrived by now
    w = await workspace(client)
    c.check("no late answer is added", not [m for m in w["conversation"]["messages"] if m["role"] == "assistant"], [m["role"] for m in w["conversation"]["messages"]])
    c.check("busy state, slot and registry are free after Stop", not w["conversation"].get("busy_until") and idle(), execution.admission.snapshot())
    provider.reset()
    r = await client.start("POST", API + "/chat", json_body={"message": "What does LDL mean?"}, stream=True)
    c.check("the same chat accepts the next message", terminal_of(await collect(r)).get("type") == "done")
    # (b) the browser closes the connection while waiting
    provider.reset(writer="hang")
    client = await guest(app)
    r = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    async for t, e in r.events():
        if e.get("type") == "step" and e.get("id") == "draft" and e.get("state") == "running":
            break
    while provider.calls.get("writer", 0) == 0:  # the writer call is open at the provider
        await asyncio.sleep(0.01)
    r.disconnect()
    await r.task
    await settle()
    c.check("disconnect cancels the provider call", provider.cancelled.get("writer", 0) == 1, provider.cancelled)
    w = await workspace(client)
    last = w["conversation"]["messages"][-1]
    c.check("after a disconnect the message stays retryable (cancelled), no answer added", last["role"] == "user" and last.get("failed") and last.get("error") == "cancelled" and last.get("retryable"), last)
    c.check("slot and busy state released after a disconnect", idle() and not w["conversation"].get("busy_until"), execution.admission.snapshot())
    # (c) Stop while the document worker is stuck: the process is killed and reaped, the OCR slot freed
    original = document_worker.command
    document_worker.command = lambda: [sys.executable, "-c", "import time; time.sleep(600)"]
    processes = []
    real_popen = document_worker.subprocess.Popen

    def recording(*a, **k):
        p = real_popen(*a, **k)
        processes.append(p)
        return p
    document_worker.subprocess.Popen = recording
    try:
        client = await guest(app)
        r = await client.start("POST", API + "/chat/report", data={"message": "Read this"}, files=[("files", ("synthetic.png", png(), "image/png"))], stream=True)
        while not document_worker.RUNNING and not r.finished.is_set():
            await asyncio.sleep(0.01)
        stop = await client.request("POST", API + "/stop", json_body={})
        events = await collect(r)
        end = terminal_of(events)
        await settle()
        c.check("Stop during report preparation ends the stream as cancelled", end.get("code") == "cancelled", end)
        c.check("the stuck worker process was killed and reaped", processes and all(p.poll() is not None for p in processes) and not document_worker.RUNNING,
                [p.poll() for p in processes])
        c.check("the OCR slot was released", idle(), execution.admission.snapshot())
    finally:
        document_worker.command = original
        document_worker.subprocess.Popen = real_popen
    return c


async def r06(app, provider, logs, loop):
    c = Case("R06", "More users than the concurrency limit")
    from services import execution
    from config import settings
    provider.reset(planner="delay:50", ocr="delay:30")
    clients = [await guest(app) for _ in range(5)]
    first = await clients[0].start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    second = await clients[1].start("POST", API + "/chat", json_body={"message": "What does LDL mean?"}, stream=True)
    await first.started.wait()
    await second.started.wait()
    await asyncio.sleep(1)
    guard_calls = provider.calls.get("guard", 0)
    started = loop.time()
    third = await clients[2].request("POST", API + "/chat", json_body={"message": "What is ALT?"}, headers={"Accept": "application/x-ndjson"})
    body = third.json()
    c.check(f"request {settings.AI_MAX_IN_FLIGHT + 1} gets 503 server_busy with Retry-After: 5", third.status == 503 and body.get("code") == "server_busy" and third.headers.get("retry-after") == "5", {"status": third.status, "body": body})
    c.check("refused before any provider call (no guard call for it)", provider.calls.get("guard", 0) == guard_calls, provider.calls)
    c.check("refused at once, not queued (virtual clock)", loop.time() - started < 0.5, loop.time() - started)
    c.check("the refusal carries a request ID (JSON and header)", body.get("request_id") and body.get("request_id") == third.headers.get("x-request-id"))
    health_at = time.monotonic()
    health = await clients[3].request("GET", "/health")
    c.check("/health answers while the limit is full", health.status == 200 and time.monotonic() - health_at < 0.5, health.status)
    ready = (await clients[3].request("GET", "/ready")).json()
    c.check("/ready reports the load without failing", ready.get("load", {}).get("ai_in_flight") == 2, ready.get("load"))
    for r in (first, second):
        c.check("admitted requests still finish normally", terminal_of(await collect(r)).get("type") == "done")
    c.check("all slots free afterwards", idle(), execution.admission.snapshot())
    # OCR is a subset: one report read at a time while a chat slot is still free.
    reader = await clients[3].start("POST", API + "/chat/report", data={"message": ""}, files=[("files", ("synthetic.png", png(), "image/png"))], stream=True)
    await reader.started.wait()
    await asyncio.sleep(0.5)
    second_reader = await clients[4].request("POST", API + "/chat/report", data={"message": ""}, files=[("files", ("synthetic.png", png(), "image/png"))])
    c.check("a second report read gets server_busy (OCR_MAX_IN_FLIGHT=1)", second_reader.status == 503 and second_reader.json().get("code") == "server_busy", second_reader.status)
    chat = await clients[4].start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
    await chat.started.wait()
    chat_events = await collect(chat)
    c.check("a chat is still admitted while one report is read (OCR counts toward AI)", chat.status == 200 and chat_events[0][1].get("type") == "accepted"
            and terminal_of(chat_events).get("type") == "done", (chat.status, kinds(chat_events)[-2:]))
    read_events = await collect(reader)
    c.check("the report read finishes", terminal_of(read_events).get("type") == "done", terminal_of(read_events))
    c.check("all slots free at the end", idle(), execution.admission.snapshot())
    return c


async def r07(app, provider, logs, loop):
    c = Case("R07", "Broken PDF, too many pages, too many pixels, a stuck worker")
    from services import execution, document_worker
    from config import settings
    provider.reset()
    client = await guest(app)
    temp_before = set(os.listdir(tempfile.gettempdir()))
    spawned = []
    real_popen = document_worker.subprocess.Popen

    def recording(*a, **k):
        p = real_popen(*a, **k)
        spawned.append(p)
        return p
    document_worker.subprocess.Popen = recording
    try:
        def upload(name, raw, kind):
            return client.request("POST", API + "/reports/read", files=[("files", (name, raw, kind))])
        r = await upload("broken.pdf", b"%PDF-1.7\nthis is not a real document", "application/pdf")
        c.check("a broken PDF is refused with 422 pdf_invalid", r.status == 422 and r.json().get("code") == "pdf_invalid", (r.status, r.body[:200]))
        r = await upload("four.pdf", pdf(4), "application/pdf")
        c.check("a 4-page PDF is refused with 422 pdf_page_limit before rendering", r.status == 422 and r.json().get("code") == "pdf_page_limit", (r.status, r.body[:200]))
        r = await upload("huge.png", png(5000, 5000), "image/png")
        c.check("a 25-megapixel image is refused with 413 image_dimensions_too_large", r.status == 413 and r.json().get("code") == "image_dimensions_too_large", (r.status, r.body[:200]))
        before = len(spawned)
        r = await upload("large.png", png() + b"\0" * (settings.IMAGE_MAX_BYTES + 10), "image/png")
        c.check("a file over 3 MB is refused with 413 before admission and without a worker", r.status == 413 and r.json().get("code") == "file_too_large" and len(spawned) == before, (r.status, r.body[:200]))
        r = await upload("note.txt", b"plain text, not a report", "text/plain")
        c.check("a file that is not PDF/PNG/JPEG is refused with 415 without a worker", r.status == 415 and len(spawned) == before, (r.status, r.body[:200]))
        # A worker that never finishes: killed at DOCUMENT_WORKER_SECONDS.
        original, limit = document_worker.command, settings.DOCUMENT_WORKER_SECONDS
        document_worker.command = lambda: [sys.executable, "-c", "import time; time.sleep(600)"]
        settings.DOCUMENT_WORKER_SECONDS = 2.0
        try:
            real_started = time.monotonic()
            r = await upload("synthetic.png", png(), "image/png")
            took = time.monotonic() - real_started
        finally:
            document_worker.command, settings.DOCUMENT_WORKER_SECONDS = original, limit
        c.check("a stuck worker ends as 422 document_timeout", r.status == 422 and r.json().get("code") == "document_timeout", (r.status, r.body[:200]))
        c.check("the stuck worker was stopped at its time limit (2 s real time, < 6 s)", 1.5 <= took < 6, round(took, 2))
        c.check("every worker process was reaped", all(p.poll() is not None for p in spawned) and not document_worker.RUNNING, [p.poll() for p in spawned])
        c.check("no slot left behind", idle(), execution.admission.snapshot())
        r = await upload("synthetic.png", png(), "image/png")
        c.check("the next valid upload is read normally", r.status == 200 and r.json().get("data", {}).get("fields"), (r.status, r.body[:200]))
        w = await workspace(client)
        c.check("refused uploads used no free reading (only the valid one counted)", w["plan"].get("ai_reads_used") == 1, w["plan"].get("ai_reads_used"))
    finally:
        document_worker.subprocess.Popen = real_popen
    left = {n for n in set(os.listdir(tempfile.gettempdir())) - temp_before if not n.startswith("labclear-offline-")}
    c.check("no temporary file left behind", not left, sorted(left))
    return c


async def r08(app, provider, logs, loop):
    c = Case("R08", "Slow storage: connection, query or lock")
    import main as app_main
    from services import business_store as db, execution
    provider.reset()
    client = await guest(app)
    # (a) another writer holds the database lock longer than the storage wait limit
    path = os.environ["BUSINESS_DB_PATH"]
    holding, release = threading.Event(), threading.Event()

    def hold():
        con = sqlite3.connect(path, timeout=5)
        con.execute("BEGIN IMMEDIATE")
        holding.set()
        release.wait(5)
        con.rollback()
        con.close()
    holder = threading.Thread(target=hold, daemon=True)
    old_wait = db.SQLITE_BUSY_SECONDS
    db.SQLITE_BUSY_SECONDS = 0.5
    holder.start()
    holding.wait(5)
    try:
        real_started = time.monotonic()
        chat = await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True)
        health_started = time.monotonic()
        health = await Client(app).request("GET", "/health")
        health_took = time.monotonic() - health_started
        await chat.task
        took = time.monotonic() - real_started
    finally:
        release.set()
        holder.join(5)
        db.SQLITE_BUSY_SECONDS = old_wait
    body = json.loads(chat.body or b"{}")
    c.check("a request that cannot get the database lock ends as 503 storage_unavailable", chat.status == 503 and body.get("code") == "storage_unavailable", (chat.status, chat.body[:200]))
    c.check("the storage wait is bounded (0.5 s limit, < 3 s real)", took < 3, round(took, 2))
    c.check("/health answers while a request waits for storage (< 0.3 s)", health.status == 200 and health_took < 0.3, round(health_took, 3))
    c.check("no slot taken by the storage failure", idle(), execution.admission.snapshot())
    # (b) a readiness probe that hangs: /ready answers 503 within its 1 s budget; /health is unaffected
    original_probe = db.probe
    app_main._probe.update(future=None, ok_at=0.0)

    def slow_probe(timeout=1):
        time.sleep(2.5)
        return "sqlite"
    db.probe = slow_probe
    try:
        started = time.monotonic()
        ready = await Client(app).request("GET", "/ready")
        ready_took = time.monotonic() - started
        health_started = time.monotonic()
        health = await Client(app).request("GET", "/health")
        health_took = time.monotonic() - health_started
        body = ready.json()
        c.check("a slow storage probe makes /ready answer 503 (storage: timeout)", ready.status == 503 and body["checks"]["storage"] == "timeout", body)
        c.check("/ready answers within its 1 s budget (< 1.5 s real)", ready_took < 1.5, round(ready_took, 2))
        c.check("liveness (/health) is not blocked by the probe", health.status == 200 and health_took < 0.3, round(health_took, 3))
        c.check("the readiness body has safe details only (no URL, no error text)", set(body) == {"status", "checks", "load", "version", "commit"} and "sqlite" not in json.dumps(body["checks"]))
        await asyncio.to_thread(time.sleep, 2.6)  # let the slow probe finish
        db.probe = lambda timeout=1: (_ for _ in ()).throw(RuntimeError("connection refused to secret-host"))
        app_main._probe.update(future=None, ok_at=0.0)
        down = await Client(app).request("GET", "/ready")
        c.check("storage down: /ready 503 (storage: unavailable) without the error text", down.status == 503 and down.json()["checks"]["storage"] == "unavailable" and "secret-host" not in down.body.decode())
    finally:
        db.probe = original_probe
        app_main._probe.update(future=None, ok_at=0.0)
    ready = await Client(app).request("GET", "/ready")
    c.check("/ready returns to 200 when storage answers again", ready.status == 200, ready.body[:200])
    # (c) PostgreSQL waits are bounded by connect, statement and lock timeouts (fake driver, no network)
    recorded = {}

    class OperationalError(Exception):
        pass

    class FakePsycopg:
        Error = Exception

        def __init__(self):
            self.OperationalError = OperationalError

        def connect(self, url, **kwargs):
            recorded.update(kwargs)
            raise OperationalError("timeout expired")
    fake = FakePsycopg()
    rows = type(sys)("psycopg.rows")
    rows.dict_row = object()
    saved = {k: sys.modules.get(k) for k in ("psycopg", "psycopg.rows")}
    sys.modules["psycopg"], sys.modules["psycopg.rows"] = fake, rows
    os.environ["DATABASE_URL"] = "postgresql://synthetic.invalid/labclear"
    try:
        def attempt():
            try:
                with db.transaction():
                    return "no error"
            except Exception as exc:  # noqa: BLE001
                return getattr(exc, "code", type(exc).__name__)
        code = await asyncio.to_thread(attempt)
    finally:
        del os.environ["DATABASE_URL"]
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    options = str(recorded.get("options", ""))
    c.check("PostgreSQL: a failed or slow connection becomes storage_unavailable", code == "storage_unavailable", code)
    c.check("PostgreSQL: connect_timeout=10 and statement/lock timeouts are set on every connection",
            recorded.get("connect_timeout") == 10 and "statement_timeout=15000" in options and "lock_timeout=10000" in options, recorded)
    return c


async def r10(app, provider, logs, loop):
    c = Case("R10", "Retry clicked twice, or while the original request is active")
    from services import business_store as db, execution
    # (a) a failed message, then two retries while the first one is still running
    provider.reset(planner="status:503")
    client = await guest(app)
    await collect(await client.start("POST", API + "/chat", json_body={"message": "What does HbA1c measure?"}, stream=True))
    failed = (await workspace(client))["conversation"]["messages"][-1]
    c.check("setup: the message failed and is retryable", failed.get("failed") and failed.get("retryable"), failed)
    provider.reset(planner="delay:30")
    first = await client.start("POST", API + "/chat/retry", json_body={"message_id": failed["id"]}, stream=True)
    async for t, e in first.events():
        if e.get("type") == "step" and e.get("id") == "plan" and e.get("state") == "running":
            break
    second = await client.request("POST", API + "/chat/retry", json_body={"message_id": failed["id"]}, headers={"Accept": "application/x-ndjson"})
    second_events = [json.loads(x) for x in second.body.decode().splitlines() if x.strip()]
    end = second_events[-1] if second_events else {}
    c.check("the second retry is refused (busy) while the first runs", end.get("type") == "error" and end.get("code") == "busy", second_events[-1:])
    await settle()
    record = next((e for e in logs.events() if e.get("event") == "workflow" and e.get("request_id") == second.headers.get("x-request-id")), {})
    c.check("the second retry started no provider chain (0 provider calls for that request)", record.get("attempts") == 0 and record.get("code") == "busy", record)
    rest = [(t, e) async for t, e in first.events()]
    c.check("the first retry finishes with one answer", terminal_of(rest).get("type") == "done")
    messages = (await workspace(client))["conversation"]["messages"]
    c.check("one user message and one answer (nothing duplicated)", [m["role"] for m in messages] == ["user", "assistant"], [m["role"] for m in messages])
    c.check("slots free after the retries", idle(), execution.admission.snapshot())
    # (b) a booking confirmed twice at once creates one booking
    member = await guest(app)
    email = "resilience-member@example.invalid"
    reg = await member.request("POST", API + "/register", json_body={"email": email, "password": "synthetic-only-password-1"})
    member.csrf, member.guest = reg.json()["csrf"], ""
    owner = reg.json()["user"]["id"]
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    day = datetime.now(ZoneInfo("Asia/Bangkok")) + timedelta(days=3)
    while day.weekday() == 6:
        day += timedelta(days=1)

    def preview(tx):
        conv = tx.get("conversation_" + owner)
        version = conv["data"]["version"] if conv else 0
        if not conv:
            from services.chat_sessions import conversation
            version = conversation(tx, owner)["data"]["version"]
        tx.put("action_resilience_book", "action", owner, {"action": {"type": "book", "quote": db.quote(["P02"], tx), "branch_id": "BKK01",
               "date": day.strftime("%Y-%m-%d"), "time": "09:00"}, "expires": time.time() + 600, "version": version}, "pending")
    await stored(preview)
    one, two = await asyncio.gather(member.request("POST", API + "/confirm", json_body={"action_id": "action_resilience_book"}),
                                    member.request("POST", API + "/confirm", json_body={"action_id": "action_resilience_book"}))
    bookings = await stored(lambda tx: [b["id"] for b in tx.find("booking", owner)])
    c.check("two simultaneous confirmations: both answered, one booking", one.status == 200 and two.status == 200 and len(bookings) == 1
            and one.json().get("id") == two.json().get("id") == bookings[0], {"statuses": [one.status, two.status], "bookings": bookings})
    # (c) a payment started twice for the same order opens one test payment

    def confirm_booking(tx):
        b = tx.get(bookings[0])
        tx.put(b["id"], "booking", owner, b["data"], "confirmed", b["branch"])
    await stored(confirm_booking)
    pay = [member.request("POST", API + "/payments/checkout", json_body={"booking_id": bookings[0], "method": "promptpay"}) for _ in range(2)]
    p1, p2 = await asyncio.gather(*pay)
    txns = await stored(lambda tx: [t["id"] for t in tx.find("payment_txn", owner)])
    c.check("two simultaneous payment starts: one simulated payment", p1.status == 200 and p2.status == 200 and len(txns) == 1
            and p1.json()["txn"]["id"] == p2.json()["txn"]["id"], {"statuses": [p1.status, p2.status], "txns": txns})
    return c


async def r11(app, provider, logs, loop):
    c = Case("R11", "Cold start and pages that are not JSON")
    import main as app_main
    from services import execution
    client = Client(app)
    execution.lifecycle.started = False
    try:
        r = await client.request("GET", "/ready")
        c.check("before startup completes, /ready is 503 JSON (startup pending), never an HTML page", r.status == 503 and r.headers.get("content-type", "").startswith("application/json")
                and r.json()["checks"]["startup"] == "pending", (r.status, r.headers.get("content-type")))
    finally:
        execution.lifecycle.started = True
    app_main._probe.update(future=None, ok_at=0.0)
    r = await client.request("GET", "/ready")
    c.check("after startup, /ready is 200", r.status == 200, r.body[:200])
    r = await client.request("GET", API + "/no-such-endpoint")
    c.check("an unknown API path answers JSON 404 with the request ID, not a page", r.status == 404 and r.headers.get("content-type", "").startswith("application/json")
            and r.json().get("request_id") == r.headers.get("x-request-id"), (r.status, r.headers.get("content-type")))
    r = await client.request("GET", "/health", headers={"Accept": "text/html"})
    c.check("/health stays a JSON liveness answer", r.status == 200 and r.json().get("status") == "ok")
    return c


async def r12(app, provider, logs, loop):
    c = Case("R12", "Request IDs, logs without secrets")
    provider.reset()
    client = await guest(app)
    first_log = len(logs.records)
    r = await client.start("POST", API + "/chat", json_body={"message": CANARY_TEXT}, stream=True)
    events = await collect(r)
    rid = r.headers.get("x-request-id", "")
    end = terminal_of(events)
    c.check("success: X-Request-ID equals the accepted and done events' request ID", rid.startswith("req_") and events[0][1].get("request_id") == rid and end.get("request_id") == rid)
    provider.reset(planner="status:502")
    r2 = await client.start("POST", API + "/chat", json_body={"message": CANARY_TEXT + " again"}, stream=True)
    events2 = await collect(r2)
    rid2 = r2.headers.get("x-request-id", "")
    end2 = terminal_of(events2)
    c.check("failure: the error event carries the same request ID", end2.get("request_id") == rid2 and rid2 != rid)
    await settle()
    lines = logs.events()
    workflow = {e["request_id"]: e for e in lines if e.get("event") == "workflow"}
    http = {e["request_id"]: e for e in lines if e.get("event") == "http"}
    ok, bad = workflow.get(rid, {}), workflow.get(rid2, {})
    c.check("one structured workflow line per request, linked by request ID (and the turn ID)", ok.get("outcome") == "done" and bad.get("outcome") == "error" and rid in http and rid2 in http
            and ok.get("turn_id") and bad.get("turn_id") and ok["turn_id"] != bad["turn_id"], {"ok": ok, "bad": bad})
    c.check("the line records route, status, outcome, code, origin, step, duration and attempts",
            bad.get("route") == "/chat" and bad.get("code") == "upstream_unavailable" and bad.get("origin") == "upstream" and bad.get("step") == "plan"
            and bad.get("attempts") == 2 and isinstance(bad.get("duration_ms"), int) and bad.get("status") == 502, bad)
    text = "\n".join(logs.records[first_log:])
    c.check("no API key in any log line", CANARY_KEY not in text)
    c.check("no message text in any log line", "RESILIENCE-CANARY" not in text and "ข้อความทดสอบ" not in text)
    c.check("no bearer token or report image data in any log line", "Bearer " not in text and "data:image" not in text and "base64" not in text)
    c.check("every labclear.request line is JSON with only the documented keys",
            all(set(e) <= {"event", "at", "request_id", "turn_id", "route", "kind", "stream", "outcome", "status", "code", "origin", "step", "duration_ms", "attempts",
                           "dropped_events", "method", "in_flight", "ai", "ocr", "cancelled", "still_running", "reason", "storage", "worker", "pages", "returncode"} for e in lines))
    return c


async def demo(app, provider, logs, loop) -> dict:
    """Three rollouts for the notebook: success, provider timeout, user cancellation. Recorded events
    are exactly what the browser receives (virtual seconds since the request), plus the structured
    log line of each request. No prompts and no model reasoning are recorded here."""
    async def rollout(name, message, faults, stop_on=None):
        provider.reset(**faults)
        client = await guest(app)
        started = loop.time()
        r = await client.start("POST", API + "/chat", json_body={"message": message}, stream=True)
        events = []
        async for t, e in r.events():
            events.append({"t": round(t - started, 3), **{k: v for k, v in e.items() if k not in ("elapsed_ms", "result")}})
            if e.get("type") == "done":
                events[-1]["reply_excerpt"] = e["result"]["reply"][:240]
                events[-1]["sources"] = [x["id"] for x in e["result"].get("sources", [])]
            if stop_on and e.get("type") == "step" and e.get("id") == stop_on and e.get("state") == "running":
                while provider.calls.get("writer", 0) == 0:
                    await asyncio.sleep(0.01)
                await client.request("POST", API + "/stop", json_body={})
        await settle()
        rid = r.headers.get("x-request-id")
        record = next((e for e in logs.events() if e.get("event") == "workflow" and e.get("request_id") == rid), {})
        return {"name": name, "request_id": rid, "faults": faults, "provider_calls": dict(provider.calls),
                "provider_calls_cancelled": dict(provider.cancelled), "events": events, "workflow_log": record}
    return {"clock": "virtual seconds (tests/resilience/vclock.py); not latency", "rollouts": [
        await rollout("success", "HbA1c คืออะไร", {}),
        await rollout("provider_timeout", "HbA1c คืออะไร", {"planner": "hang"}),
        await rollout("user_cancellation", "HbA1c คืออะไร", {"writer": "hang"}, stop_on="draft"),
    ]}


CASES = {"R01": r01, "R02": r02, "R04": r04, "R05": r05, "R06": r06, "R07": r07, "R08": r08, "R10": r10, "R11": r11, "R12": r12}


async def main(config: dict) -> dict:
    import logging
    count_sockets()
    workdir = Path(config["workdir"])
    workdir.mkdir(parents=True, exist_ok=True)
    logs = LogCapture()
    logging.getLogger().addHandler(logs)
    logging.getLogger().setLevel(logging.INFO)
    app, provider = setup(workdir)
    loop = asyncio.get_running_loop()
    import main as app_main
    async with app_main.lifespan(app):
        if config.get("demo"):
            return await demo(app, provider, logs, loop)
        order = list(config.get("cases") or CASES)
        random.Random(config.get("seed", 0)).shuffle(order)  # the seed fixes the order; results must not depend on it
        results = []
        for case_id in order:
            started_real, started_virtual = time.monotonic(), loop.time()
            try:
                case = await CASES[case_id](app, provider, logs, loop)
            except Exception:  # noqa: BLE001 - a crashed case fails with its traceback as the artifact
                case = Case(case_id, "crashed")
                case.error = traceback.format_exc()[-4000:]
            await asyncio.sleep(0.2)
            from services import execution, document_worker
            # Nothing may outlive a case: a leak fails the case that caused it.
            case.check("nothing left running after the case (slots, workflows, worker processes)",
                       idle() and not document_worker.RUNNING, {"admission": execution.admission.snapshot(), "active": list(execution.ACTIVE), "workers": len(document_worker.RUNNING)})
            out = case.result()
            out["virtual_seconds"] = round(loop.time() - started_virtual, 3)
            out["real_seconds"] = round(time.monotonic() - started_real, 3)
            results.append(out)
    return {"cases": sorted(results, key=lambda r: r["id"]), "order": order, "seed": config.get("seed", 0),
            "outbound_socket_attempts": SOCKETS["attempts"], "provider_doubles": "in-process httpx.MockTransport"}


if __name__ == "__main__":
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    report = vclock.run(main(config))
    Path(config["out"]).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
