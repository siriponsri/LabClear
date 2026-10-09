'use strict';
/* Client side of LabClear's AI workflows (docs/operations/resilience.md).

   RSStream.run() sends one POST whose reply is the NDJSON stream (or JSON) and always settles with a
   classified outcome; it never throws for server or network trouble and never parses or shows a
   gateway's HTML page:
     {ok: true, result, requestId}
     {ok: false, kind, code, message, status, origin, step, requestId, retryAfter}
   kind: 'app' (LabClear answered with an error), 'gateway' (an error page that is not LabClear's, such
   as a proxy 502/503/504), 'unexpected' (a 200 page that is not JSON), 'network', 'malformed' (a line
   that is not JSON), 'eof' (the stream ended before its terminal event), 'idle' (nothing for 35 s;
   the server sends a heartbeat every 10 s), 'overall' (server budget + 10 s), 'aborted' (Stop).
   Nothing is retried automatically: a POST is sent once.

   RSStream.ensureReady() waits for GET /ready before a message is sent after the page sat idle, so
   a sleeping free instance can wake (about a minute) without the message being posted twice.
   RSStream.gate() lets one workflow run at a time (Send and Retry do nothing while one is active).
   Works in the browser (window.RSStream) and in Node (tests/resilience/client_cases.mjs). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RSStream = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const IDLE_MS = 35000, GRACE_MS = 10000, DEFAULT_BUDGET_MS = 220000, STALE_MS = 60000;
  const MESSAGES = {
    gateway: 'LabClear could not be reached right now (it may be starting or restarting). Your message was not answered. Wait a moment, then send it again.',
    unexpected: 'LabClear sent an unexpected page instead of an answer. Your message was not answered. Reload the page, then send it again.',
    network: 'The connection was interrupted before the answer finished. Nothing was saved as an answer. Check your connection, then send it again.',
    malformed: 'The reply could not be read. Nothing was saved as an answer. Please send it again.',
    eof: 'The reply stopped before it finished. Nothing was saved as an answer. Please send it again.',
    idle: 'No response for 35 seconds, so the request was stopped. Nothing was saved as an answer. Please send it again.',
    overall: 'This took longer than the time allowed, so the request was stopped. Please send it again.',
    aborted: 'Stopped. A late answer will not be added.',
  };
  const realTimers = { set: (f, ms) => setTimeout(f, ms), clear: id => clearTimeout(id), now: () => Date.now() };
  let lastContact = realTimers.now();

  const touch = (timers = realTimers) => { lastContact = timers.now(); };
  const stale = (timers = realTimers) => timers.now() - lastContact > STALE_MS;
  const number = v => { const n = parseInt(v || '', 10); return Number.isFinite(n) ? n : null; };

  async function run(url, init = {}, opts = {}) {
    const T = opts.timers || realTimers, fetchImpl = opts.fetch || ((...a) => fetch(...a));
    const idleMs = opts.idleMs || IDLE_MS, started = T.now();
    let budgetMs = opts.budgetMs || DEFAULT_BUDGET_MS, reason = '', idleTimer = null, overallTimer = null, accepted = null;
    const controller = new AbortController();
    const stop = why => { reason = reason || why; controller.abort(); };
    if (init.signal) { if (init.signal.aborted) stop('aborted'); else init.signal.addEventListener('abort', () => stop('aborted')); }
    const kick = () => { T.clear(idleTimer); idleTimer = T.set(() => stop('idle'), idleMs); };
    const arm = () => { T.clear(overallTimer); overallTimer = T.set(() => stop('overall'), Math.max(0, budgetMs + GRACE_MS - (T.now() - started))); };
    const fail = (kind, extra = {}) => ({ ok: false, kind, code: kind, message: MESSAGES[kind] || MESSAGES.network, status: extra.status || 0,
      origin: kind === 'gateway' || kind === 'unexpected' ? 'platform' : 'client', step: null, retryAfter: extra.retryAfter ?? null,
      requestId: (accepted && accepted.request_id) || extra.requestId || '' });
    kick(); arm();
    try {
      let r;
      try { r = await fetchImpl(url, { ...init, signal: controller.signal }); }
      catch { return fail(reason || 'network'); }
      kick();
      const requestId = (r.headers.get('x-request-id') || '');
      const type = (r.headers.get('content-type') || '').toLowerCase();
      const retryAfter = number(r.headers.get('retry-after'));
      if (r.ok && type.includes('ndjson')) return await read(r, requestId);
      if (type.includes('application/json')) {
        let d;
        try { d = await r.json(); } catch { return fail(reason || (r.ok ? 'unexpected' : 'gateway'), { status: r.status, requestId }); }
        touch(T);
        if (r.ok) return { ok: true, result: d, requestId };
        return { ok: false, kind: 'app', code: d.code || '', message: d.message || '', detail: d.detail, status: r.status,
          origin: d.origin || 'app', step: null, retryAfter, requestId: d.request_id || requestId };
      }
      // An HTML page (gateway error, cold-start or captive portal) or anything else: never parsed or shown.
      try { await r.body?.cancel(); } catch { /* already closed */ }
      return fail(r.ok ? 'unexpected' : 'gateway', { status: r.status, requestId, retryAfter });
    } finally { T.clear(idleTimer); T.clear(overallTimer); }

    async function read(r, requestId) {
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = '', terminal = null;
      const handle = text => {
        if (!text.trim()) return true;
        let ev; try { ev = JSON.parse(text); } catch { return false; }
        if (!ev || typeof ev.type !== 'string') return false;
        if (ev.type === 'accepted') { accepted = ev; if (ev.deadline_ms) { budgetMs = ev.deadline_ms; arm(); } opts.onAccepted?.(ev); }
        else if (ev.type === 'heartbeat') opts.onHeartbeat?.(ev);
        else if (ev.type === 'step') opts.onStep?.(ev);
        else if (ev.type === 'done' || ev.type === 'error') terminal = ev;
        return true;
      };
      const close = () => { try { reader.cancel(); } catch { /* closed */ } };
      for (;;) {
        let chunk;
        try { chunk = await reader.read(); } catch { return fail(reason || 'network', { requestId }); }
        if (chunk.done) break;
        kick(); touch(T);
        buf += dec.decode(chunk.value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!handle(line)) { close(); return fail('malformed', { requestId }); }
          if (terminal) { close(); return settle(terminal, requestId); }
        }
      }
      buf += dec.decode();
      if (buf.trim() && !handle(buf)) return fail('malformed', { requestId });
      return terminal ? settle(terminal, requestId) : fail(reason || 'eof', { requestId });
    }
    function settle(ev, requestId) {
      if (ev.type === 'done') return { ok: true, result: ev.result, requestId: ev.request_id || requestId };
      return { ok: false, kind: 'app', code: ev.code || '', message: ev.message || '', status: ev.status || 0, origin: ev.origin || 'app',
        step: ev.step || null, retryAfter: null, requestId: ev.request_id || requestId };
    }
  }

  /* GET /ready until LabClear answers ready (a free instance wakes in about a minute). Only GETs are
     repeated; the message is sent once, afterwards. {ready, waited}. */
  async function ensureReady(opts = {}) {
    const T = opts.timers || realTimers, fetchImpl = opts.fetch || ((...a) => fetch(...a));
    const maxWaitMs = opts.maxWaitMs ?? 90000, intervalMs = opts.intervalMs ?? 3000, probeMs = opts.probeMs ?? 8000;
    const started = T.now(); let waited = false;
    const sleep = ms => new Promise(done => T.set(done, ms));
    for (;;) {
      const controller = new AbortController(), timer = T.set(() => controller.abort(), probeMs);
      let ready = false;
      try {
        const r = await fetchImpl(opts.url || '/ready', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if ((r.headers.get('content-type') || '').includes('application/json')) ready = r.ok && (await r.json()).status === 'ready';
        else try { await r.body?.cancel(); } catch { /* closed */ }
      } catch { /* unreachable or too slow: keep waiting */ }
      finally { T.clear(timer); }
      if (ready) { touch(T); return { ready: true, waited }; }
      if (!waited) { waited = true; opts.onWaiting?.(); }
      if (T.now() - started >= maxWaitMs || opts.signal?.aborted) return { ready: false, waited };
      await sleep(intervalMs);
    }
  }

  function gate() {
    let active = false;
    return {
      get active() { return active; },
      async run(work) {
        if (active) return { ok: false, kind: 'active', code: 'active', message: '' };
        active = true;
        try { return await work(); } finally { active = false; }
      },
    };
  }

  return { run, ensureReady, gate, touch, stale, MESSAGES, IDLE_MS, GRACE_MS, STALE_MS };
});
