// Deterministic checks of the browser client (static/js/stream.js) for R03, R04, R10 and R11.
// MOCKED_TEST_ONLY: a fake fetch and a fake clock, no network, no browser.
//
//   node tests/resilience/client_cases.mjs            # prints JSON {cases: {R03: [...], ...}}
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../../static/js/stream.js");

// ------------------------------------------------------------------ fake clock
function clock() {
  let now = 0, seq = 0;
  const timers = new Map();
  const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
  return {
    now: () => now,
    set: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms), fn }); return id; },
    clear: id => { timers.delete(id); },
    async advance(ms) {
      const end = now + ms;
      await flush();
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]); now = due[1].at; due[1].fn(); await flush();
      }
      now = end; await flush();
    },
    flush,
  };
}

// ------------------------------------------------------------------ fake responses
const enc = new TextEncoder();
function streamBody(signal) {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  signal?.addEventListener("abort", () => { try { controller.error(new DOMException("aborted", "AbortError")); } catch { /* closed */ } });
  return { body, push: text => controller.enqueue(enc.encode(text)), close: () => controller.close() };
}
function fetcher(handler) {
  const calls = [];
  const fn = (url, init = {}) => {
    calls.push({ url, method: init.method || "GET" });
    return new Promise((resolve, reject) => {
      if (init.signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      Promise.resolve(handler(url, init, calls.length)).then(resolve, reject);
    });
  };
  fn.calls = calls;
  return fn;
}
const html = (status, text) => new Response(`<html><body><h1>${status} ${text}</h1><script>alert(1)</script></body></html>`, { status, headers: { "content-type": "text/html" } });
const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const ndjson = (s, headers = {}) => new Response(s.body, { status: 200, headers: { "content-type": "application/x-ndjson", "x-request-id": "req_client0000000001", ...headers } });
const line = e => JSON.stringify(e) + "\n";

const results = { R03: [], R04: [], R10: [], R11: [] };
const check = (id, name, ok, detail) => results[id].push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

async function settle(promise, c, ms = 0, step = 1000) {
  let out, done = false;
  promise.then(v => { out = v; done = true; });
  for (let t = 0; !done && t < ms; t += step) await c.advance(step);
  await c.flush();
  return done ? out : { pending: true };
}

// ------------------------------------------------------------------ R03 gateway pages
for (const [status, text] of [[502, "Bad Gateway"], [503, "Service Unavailable"], [504, "Gateway Timeout"]]) {
  const c = clock(), f = fetcher(() => html(status, text));
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R03", `HTML ${status} from a proxy: classified 'gateway', never parsed as JSON`, r.ok === false && r.kind === "gateway" && r.status === status, r);
  check("R03", `HTML ${status}: the spinner can end (the promise settled) and the text shown has no HTML`, !r.pending && !/[<>]/.test(r.message) && r.message.includes("send it again"), r.message);
  check("R03", `HTML ${status}: no LabClear request ID is claimed for a platform page`, r.requestId === "" && r.origin === "platform", r.requestId);
  check("R03", `HTML ${status}: the POST was sent once (no automatic resend)`, f.calls.length === 1, f.calls.length);
}
{
  const c = clock(), f = fetcher(() => json(503, { code: "server_busy", message: "LabClear is busy with other requests. Try again in a few seconds.", origin: "app", request_id: "req_busy000000000001" }, { "retry-after": "5", "x-request-id": "req_busy000000000001" }));
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R03", "LabClear's own 503 JSON (server_busy) stays an app error with Retry-After and request ID", r.kind === "app" && r.code === "server_busy" && r.retryAfter === 5 && r.requestId === "req_busy000000000001", r);
}
{
  const c = clock(), f = fetcher(() => Promise.reject(new TypeError("Failed to fetch")));
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R03", "network failure before any response: classified 'network'", r.kind === "network" && !r.ok, r);
}

// ------------------------------------------------------------------ R04 stalled, cut and invalid streams
{
  const c = clock(); let s;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_idle", deadline_ms: 220000, heartbeat_ms: 10000 })); return ndjson(s); });
  const p = S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c });
  const early = await settle(p, c, 34000);
  const r = await settle(p, c, 2000);
  check("R04", "idle watchdog: nothing for 35 s ends the request as 'idle' (not before)", early.pending && r.kind === "idle" && !r.ok, { early, r });
  check("R04", "idle: the request ID from 'accepted' is kept for support", r.requestId === "req_idle", r.requestId);
}
{
  const c = clock(); let s, beats = 0;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_beat", deadline_ms: 220000 })); return ndjson(s); });
  const p = S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c, onHeartbeat: () => beats++ });
  for (let i = 0; i < 6; i++) { await c.advance(10000); s.push(line({ type: "heartbeat", elapsed_ms: (i + 1) * 10000 })); }
  s.push(line({ type: "done", result: { reply: "ok" }, request_id: "req_beat" }));
  const r = await settle(p, c);
  check("R04", "heartbeats every 10 s keep a 60 s wait alive; done arrives", r.ok && r.result.reply === "ok" && beats === 6, { r, beats });
}
{
  const c = clock(); let s, stepsSeen = 0;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_cut" })); s.push(line({ type: "step", id: "plan", state: "running", label: "Plan" })); s.close(); return ndjson(s); });
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c, onStep: () => stepsSeen++ }), c);
  check("R04", "stream cut before its terminal event: 'eof', never success, even after steps", r.kind === "eof" && !r.ok && stepsSeen === 1, r);
}
{
  const c = clock(); let s;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_bad" })); s.push("<html>proxy injected</html>\n"); return ndjson(s); });
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R04", "an invalid line: 'malformed', the stream is abandoned", r.kind === "malformed" && !r.ok, r);
}
{
  const c = clock(); let s;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_over", deadline_ms: 220000 })); return ndjson(s); });
  const p = S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c });
  for (let i = 0; i < 22; i++) { await c.advance(10000); s.push(line({ type: "heartbeat" })); }
  await c.advance(9000);                       // 229 s after the request started
  const before = await settle(p, c, 0);
  const r = await settle(p, c, 2000);          // 231 s
  check("R04", "overall watchdog: server budget (from 'accepted') + 10 s, not earlier", before.pending && r.kind === "overall", { before, r });
}
{
  const c = clock(); let s;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_err" })); s.push(line({ type: "step", id: "safety_in", state: "unavailable", label: "Guard", duration_ms: 1200 })); s.push(line({ type: "error", code: "upstream_unavailable", message: "The safety check is temporarily unavailable.", status: 502, origin: "upstream", request_id: "req_err", step: "safety_in" })); return ndjson(s); });
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R04", "a terminal error event keeps code, origin, step and request ID", r.kind === "app" && r.code === "upstream_unavailable" && r.origin === "upstream" && r.step === "safety_in" && r.requestId === "req_err", r);
}
{
  const c = clock(), user = new AbortController(); let s;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_stop" })); return ndjson(s); });
  const p = S.run("/api/business/chat", { method: "POST", signal: user.signal }, { fetch: f, timers: c });
  await c.advance(1000); user.abort();
  const r = await settle(p, c);
  check("R04", "Stop (user abort) is 'aborted', not an error to show", r.kind === "aborted", r);
}

// ------------------------------------------------------------------ R10 one workflow at a time
{
  const c = clock(), gate = S.gate(); let s;
  const f = fetcher((url, init) => { s = streamBody(init.signal); s.push(line({ type: "accepted", request_id: "req_gate" })); return ndjson(s); });
  const first = gate.run(() => S.run("/api/business/chat/retry", { method: "POST" }, { fetch: f, timers: c }));
  await c.flush();
  const second = await gate.run(() => S.run("/api/business/chat/retry", { method: "POST" }, { fetch: f, timers: c }));
  check("R10", "Retry while a workflow is active does nothing (no second POST)", second.kind === "active" && f.calls.length === 1 && gate.active, { second, calls: f.calls.length });
  s.push(line({ type: "done", result: {}, request_id: "req_gate" }));
  const r = await settle(first, c);
  check("R10", "after the first finishes, the gate opens again", r.ok && !gate.active, r);
}

// ------------------------------------------------------------------ R11 cold start and HTML 200
{
  const c = clock(), f = fetcher(() => new Response("<html><body>Waking up...</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R11", "200 with an HTML page is not success: 'unexpected'", !r.ok && r.kind === "unexpected" && !/[<>]/.test(r.message), r);
  check("R11", "200 HTML: no automatic resend of the POST", f.calls.length === 1, f.calls.length);
}
{
  const c = clock(); let waits = 0;
  const f = fetcher((url, init, n) => url === "/ready"
    ? (n <= 2 ? html(503, "Service Unavailable") : json(200, { status: "ready" }))
    : json(200, { reply: "answer" }));
  const p = S.ensureReady({ fetch: f, timers: c, onWaiting: () => waits++, intervalMs: 3000 });
  const w = await settle(p, c, 10000);
  check("R11", "cold start: GET /ready is polled until ready, the user sees one waiting status", w.ready && w.waited && waits === 1 && f.calls.filter(x => x.url === "/ready").length === 3, { w, waits, calls: f.calls });
  const r = await settle(S.run("/api/business/chat", { method: "POST" }, { fetch: f, timers: c }), c);
  check("R11", "cold start: the message is POSTed exactly once, after ready", r.ok && f.calls.filter(x => x.method === "POST").length === 1, f.calls);
}
{
  const c = clock(), f = fetcher(() => html(502, "Bad Gateway"));
  const w = await settle(S.ensureReady({ fetch: f, timers: c, maxWaitMs: 90000, intervalMs: 3000 }), c, 120000);
  check("R11", "a service that never wakes: give up after 90 s without any POST", w.ready === false && f.calls.every(x => x.method === "GET"), { w, posts: f.calls.filter(x => x.method === "POST").length });
}
{
  const c = clock();
  S.touch(c);
  const fresh = S.stale(c);
  await c.advance(S.STALE_MS + 1);
  check("R11", "after more than 60 s without contact the next send checks /ready first", !fresh && S.stale(c), { fresh, stale: S.stale(c) });
}

console.log(JSON.stringify({ engine: "node " + process.version, module: "static/js/stream.js", cases: results }, null, 2));
