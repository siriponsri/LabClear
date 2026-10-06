'use strict';
/* Shared session-aware API client for public pages that act on the customer's account. */
window.RS = (() => {
  let csrf = '', user = null;
  async function call(path, options = {}) {
    const headers = { 'X-Business-CSRF': csrf, ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch('/api/business' + path, { credentials: 'same-origin', ...options, headers }); }
    catch { throw Object.assign(Error('You appear to be offline. Check your connection and try again.'), { code: 'network' }); }
    let d = null; try { d = await r.json(); } catch { throw Error('The server response could not be read.'); }
    if (!r.ok) throw Object.assign(Error(d.message || (typeof d.detail === 'string' ? d.detail : 'Please check the highlighted fields.')), { code: d.code, status: r.status, detail: d.detail });
    return d;
  }
  async function session() { const s = await call('/session'); csrf = s.csrf; user = s.user; return s; }
  async function auth(kind, email, password) { const r = await call('/' + kind, { method: 'POST', body: JSON.stringify({ email, password }) }); csrf = r.csrf; user = r.user; return r; }
  const post = (path, body = {}) => call(path, { method: 'POST', body: JSON.stringify(body) });
  return { call, post, session, auth, get user() { return user; } };
})();
