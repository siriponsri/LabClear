'use strict';
/* Shared session-aware API client for public pages that act on the customer's account. */
window.RS = (() => {
  let csrf = '', user = null, guestToken = '', pendingSession = null;
  function init(options = {}, accept = 'application/json') {
    const headers = { 'X-Business-CSRF': csrf, Accept: accept, ...(guestToken ? { 'X-LabClear-Guest': guestToken } : {}), ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return { credentials: 'same-origin', ...options, headers };
  }
  async function call(path, options = {}) {
    let r;
    try { r = await fetch('/api/business' + path, init(options)); }
    catch (e) { if (e.name === 'AbortError') throw e; throw Object.assign(Error('You appear to be offline. Check your connection and try again.'), { code: 'network' }); }
    // A gateway's HTML error page (or any non-JSON reply) is never parsed or shown (static/js/stream.js).
    if (!(r.headers.get('content-type') || '').includes('application/json')) {
      try { await r.body?.cancel(); } catch { /* closed */ }
      const kind = r.ok ? 'unexpected' : 'gateway';
      throw Object.assign(Error(window.RSStream ? RSStream.MESSAGES[kind] : 'LabClear could not be reached right now. Please try again.'), { code: kind, kind, status: r.status });
    }
    window.RSStream?.touch();
    let d = null; try { d = await r.json(); } catch { throw Error('The server response could not be read.'); }
    if (!r.ok) throw Object.assign(Error(d.message || (typeof d.detail === 'string' ? d.detail : 'Please check the highlighted fields.')), { code: d.code, status: r.status, detail: d.detail, requestId: d.request_id || r.headers.get('x-request-id') || '' });
    return d;
  }
  /* An AI workflow (NDJSON): resolves with the result or throws a classified Error (static/js/stream.js). */
  async function stream(path, options = {}, onStep) {
    const r = await RSStream.run('/api/business' + path, init(options, 'application/x-ndjson'), { onStep });
    if (r.ok) return r.result;
    throw Object.assign(Error(r.message || 'The request could not be completed.'), { code: r.code, kind: r.kind, status: r.status, requestId: r.requestId, step: r.step });
  }
  async function session() {
    if (!pendingSession) pendingSession = call('/session').then(s => { csrf = s.csrf; user = s.user; guestToken = s.guest_token || ''; return s; }).finally(() => { pendingSession = null; });
    return pendingSession;
  }
  function closeGuest() {
    if (!guestToken) return;
    navigator.sendBeacon('/api/business/guest/close', new Blob([JSON.stringify({ guest_token: guestToken, csrf })], { type: 'application/json' }));
    guestToken = ''; user = null; csrf = '';
  }
  addEventListener('pagehide', closeGuest);
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
  async function auth(kind, email, password) { const r = await call('/' + kind, { method: 'POST', body: JSON.stringify({ email, password }) }); csrf = r.csrf; user = r.user; guestToken = ''; return r; }
  const post = (path, body = {}) => call(path, { method: 'POST', body: JSON.stringify(body) });
  return { call, post, stream, session, auth, get user() { return user; } };
})();
