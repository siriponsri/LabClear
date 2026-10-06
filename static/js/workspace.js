'use strict';
/* LabClear workspace: customer (/app) and service desk (/staff).
   Every control here calls a server endpoint; the server owns identity, prices,
   capacity, payment state and permissions. The browser only renders and asks. */
(() => {
  const $ = id => document.getElementById(id);
  const STAFF_MODE = document.body.dataset.staff === 'true';
  const STAFF_ROLES = ['staff', 'manager', 'clinical'];
  let csrf = '', user = null, state = null, accessCode = '', busy = false, controller = null;
  let view = STAFF_MODE ? 'overview' : 'chat', lastMessages = '', activeTicket = '', ticketFilter = 'open', opsFilter = 'requested';
  let modes = null, catalogCache = null, branchCache = null;

  /* ------------------------------------------------------------ helpers */
  const money = n => '฿' + new Intl.NumberFormat('en-US').format(n);
  const longDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const ago = t => { const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const when = t => new Date(t * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined && text !== null) e.textContent = text; if (cls) e.className = cls; return e; };
  const isStaff = () => STAFF_ROLES.includes(user?.role);
  const isManager = () => user?.role === 'manager';
  function notice(text, tone) { const n = $('notice'); n.textContent = text; n.className = 'toast' + (tone === 'bad' ? ' bad' : ''); n.hidden = false; clearTimeout(notice.t); notice.t = setTimeout(() => { n.hidden = true; }, 7000); }
  async function api(path, options = {}) {
    const headers = { 'X-Business-CSRF': csrf, ...(accessCode ? { 'X-LabClear-Access': accessCode } : {}), ...options.headers };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch('/api/business' + path, { credentials: 'same-origin', ...options, headers }); }
    catch (e) { if (e.name === 'AbortError') throw e; throw Object.assign(Error('You appear to be offline. Check your connection and try again.'), { code: 'network' }); }
    let d; try { d = await r.json(); } catch { throw Error('The server response could not be read.'); }
    if (!r.ok) {
      let message = d.message || 'The request could not be completed.';
      if (Array.isArray(d.detail)) message = 'Please check: ' + d.detail.map(x => (x.loc || []).slice(-1)[0]).filter(Boolean).join(', ') + '.';
      throw Object.assign(Error(message), { code: d.code, status: r.status });
    }
    return d;
  }
  const post = (path, data = {}) => api(path, { method: 'POST', body: JSON.stringify(data) });
  function button(text, run, cls = 'btn sm') {
    const b = el('button', text, cls); b.type = 'button';
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { await run(b); } catch (e) { if (e.name !== 'AbortError') notice(e.message, 'bad'); }
      finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    });
    return b;
  }
  function link(text, href, cls = 'btn sm') { const a = el('a', text, cls); a.href = href; return a; }
  function modal(title, node) { $('modal-title').textContent = title; $('modal-content').replaceChildren(node); if (!$('modal').open) $('modal').showModal(); }
  const closeModal = () => { if ($('modal').open) $('modal').close(); };
  $('modal-close').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) { const r = $('modal').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(); } });
  function intro(title, copy) { const d = el('div', null, 'view-intro'); d.append(el('h2', title)); if (copy) d.append(el('p', copy)); return d; }
  function empty(title, copy, ...actions) { const d = el('div', null, 'state-box'); d.append(el('h3', title)); if (copy) d.append(el('p', copy, 'small muted')); if (actions.length) { const r = el('div', null, 'row'); r.append(...actions); d.append(r); } return d; }
  let fieldSeq = 0;
  function field(label, type = 'text', value = '', hint = '') {
    // Label names the control; the hint is linked with aria-describedby so it is not part of the name.
    const id = 'f' + (++fieldSeq), wrap = el('div', null, 'field'), lab = el('label', label); lab.htmlFor = id; wrap.append(lab);
    const input = type === 'textarea' ? el('textarea', null, 'input') : type === 'select' ? el('select', null, 'input') : el('input', null, 'input');
    input.id = id; if (type !== 'textarea' && type !== 'select') input.type = type;
    if (hint) { const h = el('span', hint, 'hint'); h.id = id + '-hint'; input.setAttribute('aria-describedby', h.id); wrap.append(h); }
    if (value !== '' && value !== null && value !== undefined) input.value = value;
    wrap.append(input); return { wrap, input };
  }
  function badge(text, tone = '') { return el('span', text, 'badge' + (tone ? ' ' + tone : '')); }
  const BOOKING_STATE = { requested: ['Awaiting confirmation', 'warn'], confirmed: ['Confirmed', 'ok'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'neutral'] };
  const PAYMENT_STATE = { pending: ['Unpaid', 'neutral'], paid: ['Paid (simulation)', 'ok'], refunded: ['Refunded', 'neutral'], refund_pending: ['Refund pending', 'warn'], expired: ['Checkout expired', 'neutral'] };
  function bookingBadges(b) {
    const [s, st] = BOOKING_STATE[b.state] || [b.state, 'neutral'];
    const [p, pt] = PAYMENT_STATE[b.data.payment_status] || [b.data.payment_status, 'neutral'];
    return [badge(s, st), badge(p, pt)];
  }
  const branchName = id => (branchCache?.branches || []).find(b => b.id === id)?.name || id;
  async function loadBusiness() {
    if (!catalogCache) catalogCache = await api('/catalog');
    if (!branchCache) branchCache = await api('/branches');
  }
  function requireAccount(reason) {
    const box = el('div', null, 'stack');
    box.append(el('p', reason), button('Sign in or create an account', account, 'btn primary'));
    modal('Account needed', box);
  }

  /* ------------------------------------------------------------ account */
  function updateUser(u) {
    user = u;
    $('account-label').textContent = u.registered ? u.email : (STAFF_MODE ? 'Not signed in' : 'Guest');
    $('avatar').textContent = u.registered ? u.email[0].toUpperCase() : '?';
    $('account-sub').textContent = isStaff() ? u.role + (u.branch ? ' · ' + u.branch : '') : u.registered ? 'Your personal workspace' : 'Sign in to keep your history';
    if ($('staff-nav')) $('staff-nav').hidden = !isStaff();
    document.querySelectorAll('[data-manager-only]').forEach(n => { n.hidden = !isManager(); });
  }
  function account() {
    const box = el('div', null, 'stack');
    if (user?.registered) {
      box.append(el('p', 'Signed in as ' + user.email + (isStaff() ? ' (' + user.role + ')' : '')),
        el('p', 'Your reports and conversations are private to this account. Email verification and password recovery are not available in this coursework release.', 'small muted'));
      const row = el('div', null, 'row');
      row.append(button('Sign out', async () => { await post('/logout'); location.href = STAFF_MODE ? '/staff' : '/app'; }, 'btn'));
      if (!STAFF_MODE) row.append(button('Unlink LINE', async () => { await post('/account/line/unlink'); notice('LINE unlinked. Pending LINE deliveries were cancelled.'); }, 'btn ghost'));
      box.append(row);
    } else {
      const form = el('form', null, 'form-grid'), email = field('Email address', 'email'), pass = field('Password', 'password', '', 'At least 12 characters. Use a demonstration password.');
      email.input.required = true; email.input.autocomplete = 'email'; pass.input.minLength = 12; pass.input.required = true; pass.input.autocomplete = 'current-password';
      const err = el('p', '', 'field-error'); err.setAttribute('role', 'alert'); err.hidden = true;
      async function auth(kind) {
        err.hidden = true;
        if (!form.reportValidity()) return;
        try {
          const r = await post('/' + kind, { email: email.input.value, password: pass.input.value });
          csrf = r.csrf; updateUser(r.user); closeModal(); lastMessages = '';
          await refresh(); notice(kind === 'login' ? 'Signed in.' : 'Account created.');
          await navigate(view, false); await checkLink();
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      }
      const actions = el('div', null, 'form-actions');
      actions.append(button('Sign in', () => auth('login'), 'btn primary'));
      if (!STAFF_MODE) actions.append(button('Create account', () => auth('register'), 'btn'));
      form.addEventListener('submit', e => { e.preventDefault(); auth('login'); });
      form.append(email.wrap, pass.wrap, err, actions);
      if (STAFF_MODE) form.append(el('p', 'Staff accounts are created by the deployment owner with scripts/create_staff.py.', 'tiny muted'));
      box.append(form);
    }
    modal(user?.registered ? 'Your account' : (STAFF_MODE ? 'Staff sign-in' : 'Sign in or create an account'), box);
  }
  $('account-open').onclick = account;

  /* ------------------------------------------------------------ chat */
  function markdown(text) {
    const d = el('div', null, 'message-body');
    d.innerHTML = DOMPurify.sanitize(marked.parse(text || ''), { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h2', 'h3', 'table', 'thead', 'tbody', 'tr', 'th', 'td'], ALLOWED_ATTR: [] });
    return d;
  }
  function safeHref(url) { try { const u = new URL(url, location.origin); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
  function actionCard(m) {
    const a = m.action, c = el('div', null, 'action-card');
    const titles = { book: 'Appointment request preview', quote: 'Package preview', pay: 'Payment preview', handoff: 'Continue with our team', link: 'Link your LINE conversation' };
    c.append(el('strong', titles[a.type] || 'Preview'));
    if (a.quote) c.append(el('p', a.quote.items.map(x => x.name).join(' + ') + ' · ' + money(a.quote.total_thb), 'small'));
    if (a.type === 'book') c.append(el('p', branchName(a.branch_id) + ', ' + longDate(a.date) + ', ' + a.time + ' Bangkok time', 'small'));
    if (a.summary) c.append(el('p', a.summary, 'small muted'));
    if (a.type === 'book') c.append(el('p', 'Sending this creates a request. Our team confirms it before payment opens.', 'tiny muted'));
    if (a.type === 'link') c.append(el('p', 'Open the invitation from your LINE chat while signed in here to link accounts.', 'tiny muted'));
    if (m.action_id && ['book', 'quote', 'handoff', 'pay'].includes(a.type)) {
      const label = { book: 'Send appointment request', quote: 'Keep this selection', handoff: 'Request our team', pay: 'Open test payment' }[a.type];
      c.append(button(label, async () => {
        try {
          const r = await post('/confirm', { action_id: m.action_id });
          if (r.simulator_url) { location.assign(r.simulator_url); return; }
          if (r.url) { location.assign(r.url); return; }
          notice(a.type === 'book' ? 'Appointment request sent. Our team will confirm it.' : a.type === 'handoff' ? 'Your request is with our team.' : r.message || 'Done.');
          await refresh();
        } catch (e) {
          if (e.code === 'account_required') requireAccount('Create an account or sign in before sending an appointment request, so you can follow it.');
          else if (['preview_expired', 'quote_changed'].includes(e.code)) notice(e.message + ' Ask the assistant for a fresh preview.', 'bad');
          else throw e;
        }
      }, 'btn primary sm'));
    }
    return c;
  }
  function messageNode(m, interactive = true, last = false) {
    return RSTurns.render(m, interactive ? { interactive: true, last, onRetry: retry, onShortcut: shortcut, onAction: actionCard, onStaff: () => requestStaff(), onFollowup: q => send(q) } : {});
  }
  function shortcut(cmd) {
    // Whitelisted page shortcuts proposed by the assistant: navigate, prefill or show; never confirm.
    const x = cmd.args || {}, act = RSTurns.act;
    if (cmd.type === 'open_package') return act('Open ' + (x.name || x.package_id), 'open', null, '/packages/' + encodeURIComponent(x.package_id));
    if (cmd.type === 'open_compare') return act('Compare packages', 'compare', () => openCompare(x.package_ids));
    if (cmd.type === 'filter_catalog') return act('Show matching packages', 'open', () => navigate('packages', true, Object.fromEntries(['q', 'segment', 'max_price'].filter(k => x[k]).map(k => [k, x[k]]))));
    if (cmd.type === 'prefill_booking') return act('Book ' + (x.name || 'a checkup') + (x.date ? ' on ' + x.date : ''), 'calendar', () => navigate('book', true, Object.fromEntries([['package', x.package_id], ['branch', x.branch_id], ['date', x.date]].filter(([, v]) => v))));
    if (cmd.type === 'open_org_form') return act('Organization request form', 'open', null, '/organizations#inq-title');
    if (cmd.type === 'highlight_report_field') return act('Show it on my report', 'value', async () => { const r = state?.conversation.report_id; if (r) reviewReport(await api('/reports/' + r), x.field_id); else notice('Select a confirmed report first.', 'bad'); });
    if (cmd.type === 'open_view') return act({ packages: 'Browse packages', book: 'Request a time', bookings: 'My appointments', reports: 'My reports', labs: 'Lab dashboard', plan: 'Plan', notifications: 'Notifications' }[x.view] || 'Open', 'open', () => navigate(x.view));
    return null;
  }
  async function openCompare(ids, focus) {
    // Comparison panel beside the answer (dialog on narrow screens). The highlighted column is the
    // package the user is looking at, never a "popular" pick.
    const canvas = $('canvas'); if (!canvas) return;
    canvas.hidden = false; canvas.replaceChildren(el('p', 'Loading comparison', 'loading'));
    try {
      const d = await api('/catalog/compare?ids=' + ids.map(encodeURIComponent).join(','));
      const head = el('div', null, 'canvas-head'), close = el('button', '×', 'icon-btn'); close.type = 'button'; close.setAttribute('aria-label', 'Close comparison');
      close.onclick = () => { canvas.hidden = true; $('chat-view').classList.remove('with-canvas'); };
      const titles = el('div'); titles.append(el('h2', 'Package comparison'), el('p', 'Included tests and simulated prices from catalog ' + d.catalog_version + '.', 'small muted'));
      head.append(titles, close);
      const t = el('table', null, 'compare-grid'), hr = el('tr'); hr.append(el('th', 'Includes'));
      const sel = focus || ids[0];
      d.packages.forEach(p => { const th = el('th'); th.scope = 'col'; if (p.id === sel) th.className = 'sel'; th.append(el('strong', p.name), el('span', p.segment === 'organization' ? 'Organizations' : p.staff_review_required ? 'Reviewed first' : 'Book directly')); hr.append(th); });
      t.append(hr);
      d.services.forEach(s2 => { const tr = el('tr'), th = el('th', s2.name); th.scope = 'row'; tr.append(th); s2.included.forEach((inc, i) => { const td = el('td', inc ? '✓' : '–', inc ? 'yes' : 'no'); td.setAttribute('aria-label', inc ? 'Included' : 'Not included'); if (d.packages[i].id === sel) td.classList.add('sel'); tr.append(td); }); t.append(tr); });
      const pr = el('tr', null, 'price-row'); pr.append(el('th', ''));
      d.packages.forEach(p => { const td = el('td'); if (p.id === sel) td.className = 'sel'; const a = el('a', 'View details'); a.href = '/packages/' + p.id; td.append(el('strong', money(p.price_thb), 'num'), a); pr.append(td); });
      t.append(pr);
      canvas.replaceChildren(head, t);
      $('chat-view').classList.add('with-canvas'); close.focus();
    } catch (e) { canvas.replaceChildren(el('p', e.message, 'callout bad')); }
  }
  function renderMessages(c) {
    if (STAFF_MODE) return;
    const key = JSON.stringify(c.messages);
    if (key === lastMessages) return;
    lastMessages = key;
    if (!c.messages.length) {
      if (!$('messages').querySelector('.welcome')) $('messages').replaceChildren(empty('A fresh conversation', 'Ask about a health check, a report or an appointment.'));
      return;
    }
    $('messages').replaceChildren(...c.messages.map((m, i) => messageNode(m, true, i === c.messages.length - 1)));
    toBottom();
  }
  // Layout settles after fonts and the view switch; scroll once more on the next frames.
  const toBottom = () => { const m = $('messages'); if (!m) return; m.scrollTop = m.scrollHeight; requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; setTimeout(() => { m.scrollTop = m.scrollHeight; }, 120); }); };
  function renderContext() {
    if (STAFF_MODE || !state) return;
    const mode = state.conversation.mode;
    $('handoff-state').textContent = mode === 'waiting' ? 'Your request is queued for our team; the assistant is paused.' : mode === 'staff' ? 'A team member is replying; the assistant is paused.' : '';
    const r = state.reports.find(x => x.id === state.conversation.report_id);
    $('context-report').textContent = r ? 'Report in use: ' + r.label + (r.date ? ' · ' + r.date : '') : 'No report selected';
    const next = $('context-next'); next.replaceChildren();
    const today = bangkokDate(0), open = state.bookings.filter(b => ['requested', 'confirmed'].includes(b.state) && b.data.date >= today).sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time));
    if (open.length) {
      const b = open[0], a = el('button', (b.state === 'requested' ? 'Requested: ' : 'Next visit: ') + new Date(b.data.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + b.data.time, 'link-btn');
      a.type = 'button'; a.onclick = () => navigate('bookings'); next.append(a, bookingBadges(b)[0]);
    } else next.append(el('span', mode === 'bot' ? 'Answers come with their sources. Our team confirms every appointment.' : 'Our team has this conversation.'));
    const chips = $('context-chips'); chips.replaceChildren();
    if (r) { const c = el('button', null, 'chip active'); c.type = 'button'; c.append(document.createTextNode('Report: ' + (r.label || 'My report') + ' '), el('span', '×', 'x')); c.setAttribute('aria-label', 'Stop using report ' + (r.label || 'My report')); c.onclick = async () => { await post('/reports/select', { report_id: '' }); await refresh(); notice('The report is no longer used in this conversation.'); }; chips.append(c); }
  }
  async function refresh() {
    state = await api('/workspace');
    updateUser(state.user);
    renderMessages(state.conversation);
    renderContext();
    setBell(state.unread_notifications);
  }
  async function send(text) {
    if (busy || !text.trim()) return;
    if (view !== 'chat') await navigate('chat');
    busy = true; $('send').disabled = true; $('stop').hidden = false;
    $('chat-status').textContent = state?.conversation.mode === 'bot' ? 'Checking your request, sources and safety before replying…' : 'Sending to our team…';
    controller = new AbortController(); $('message').value = ''; window.rsGrow?.();
    try { await api('/chat', { method: 'POST', body: JSON.stringify({ message: text, page: { path: '/app', view } }), signal: controller.signal }); }
    catch (e) { if (e.name !== 'AbortError') notice(e.message, 'bad'); }
    finally { busy = false; $('send').disabled = false; $('stop').hidden = true; $('chat-status').textContent = ''; controller = null; await refresh().catch(() => {}); $('message').focus(); }
  }
  async function retry(id) {
    if (busy) return;
    busy = true; $('chat-status').textContent = 'Retrying your last message…'; $('stop').hidden = false; controller = new AbortController();
    try { await api('/chat/retry', { method: 'POST', body: JSON.stringify({ message_id: id }), signal: controller.signal }); }
    catch (e) { if (e.name !== 'AbortError') notice(e.message, 'bad'); }
    finally { busy = false; $('chat-status').textContent = ''; $('stop').hidden = true; controller = null; lastMessages = ''; await refresh().catch(() => {}); }
  }
  if (!STAFF_MODE) {
    $('chat-form').addEventListener('submit', e => { e.preventDefault(); send($('message').value); });
    $('message').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chat-form').requestSubmit(); } });
    const grow = () => { const m = $('message'), n = m.value.length, c = $('char-count'); m.style.height = 'auto'; m.style.height = Math.min(m.scrollHeight, 200) + 'px'; c.hidden = n < 6000; c.textContent = new Intl.NumberFormat('en-US').format(n) + ' / 8,000'; c.classList.toggle('near', n > 7600); };
    $('message').addEventListener('input', grow); window.rsGrow = grow;
    $('stop').onclick = async () => { controller?.abort(); try { await post('/stop'); notice('Stopped. A late answer will not be added.'); } catch (e) { notice(e.message, 'bad'); } };
    $('new-chat').onclick = async () => {
      try { await post('/new-chat'); lastMessages = ''; await refresh(); await navigate('chat'); notice('Previous conversation saved in Past conversations.'); }
      catch (e) { notice(e.message, 'bad'); }
    };
    $('staff-request').onclick = () => requestStaff();
    document.querySelectorAll('[data-goto]').forEach(b => { b.onclick = () => navigate(b.dataset.goto); });
    const attach = $('attach'), menu = $('attach-menu');
    const setAttach = open => { menu.hidden = !open; attach.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('button').focus(); };
    attach.onclick = () => setAttach(menu.hidden);
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { setAttach(false); attach.focus(); } });
    document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.attach-wrap')) setAttach(false); });
    menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setAttach(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('canvas').hidden) { $('canvas').hidden = true; $('chat-view').classList.remove('with-canvas'); } });
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-prompt]'); if (b) send(b.dataset.prompt); });
  function requestStaff(prefill = '') {
    const form = el('form', null, 'form-grid'), f = field('How can our team help?', 'textarea', typeof prefill === 'string' ? prefill : '');
    f.input.required = true; f.input.maxLength = 1000;
    form.append(f.wrap, el('p', 'Your conversation is shared with the service team and the assistant pauses until they reply or hand it back. Urgent health concerns should not wait in this queue.', 'small muted'),
      button('Send to our team', async () => { if (!form.reportValidity()) return; await post('/handoffs', { summary: f.input.value }); closeModal(); await refresh(); notice('Your request is queued for our team.'); }, 'btn primary'));
    form.onsubmit = e => e.preventDefault();
    modal('Talk to our team', form);
  }

  /* ------------------------------------------------------------ health checks */
  function packageCard(p) {
    // Same row as the public catalog, so a package reads the same everywhere.
    const c = el('article', null, 'pkg-row'), name = el('div'), h = el('h3'), a = el('a', p.name); a.href = '/packages/' + p.id; h.append(a);
    name.append(h, el('p', p.segment === 'organization' ? 'For organizations of 20 or more' : p.staff_review_required ? 'Follow-up test, reviewed with our team before booking' : 'Book directly', 'kind'));
    const ul = el('ul', null, 'pkg-tests'); ul.setAttribute('aria-label', 'Included tests'); p.services.forEach(x => ul.append(el('li', x)));
    const price = el('div', null, 'pkg-price'); price.append(el('strong', money(p.price_thb)), el('span', p.price_unit));
    const foot = el('div', null, 'pkg-actions');
    if (p.segment === 'organization') foot.append(link('Request a quotation', '/organizations?package=' + p.id, 'btn sm'));
    else if (!p.staff_review_required) foot.append(button('Request a time', () => navigate('book', true, { package: p.id }), 'btn sm primary'));
    foot.append(button('Ask', () => send(`Tell me about ${p.name} (${p.id}). Is it suitable for my goals?`), 'btn sm ghost'));
    c.append(name, ul, price, foot); return c;
  }
  async function packages(params = {}) {
    const box = el('div'); box.append(intro('Health checks', 'Search and filter the same catalog the assistant uses. Simulated prices.'));
    const initial = params;
    const bar = el('form', null, 'toolbar'); bar.setAttribute('role', 'search');
    const q = el('input', null, 'input'); q.type = 'search'; q.placeholder = 'Search tests, e.g. lipid'; q.setAttribute('aria-label', 'Search health checks'); q.maxLength = 80;
    const seg = el('select', null, 'input'); seg.setAttribute('aria-label', 'Who it is for');
    [['', 'Everyone'], ['individual', 'Individuals'], ['organization', 'Organizations']].forEach(([v, t]) => { const o = el('option', t); o.value = v; seg.append(o); });
    const sort = el('select', null, 'input'); sort.setAttribute('aria-label', 'Sort');
    [['featured', 'Recommended'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['name', 'Name']].forEach(([v, t]) => { const o = el('option', t); o.value = v; sort.append(o); });
    const reset = el('button', 'Reset', 'btn ghost sm'); reset.type = 'button';
    const count = el('p', '', 'small muted'); count.setAttribute('aria-live', 'polite');
    bar.append(q, seg, sort, reset);
    const grid = el('div', null, 'pkg-list');
    if (initial.q) q.value = initial.q; if (['individual', 'organization'].includes(initial.segment)) seg.value = initial.segment;
    async function load() {
      grid.setAttribute('aria-busy', 'true');
      const p = new URLSearchParams({ q: q.value, segment: seg.value, sort: sort.value }); if (initial.max_price && !q.value) p.set('max_price', initial.max_price);
      try {
        const d = await api('/catalog/search?' + p);
        grid.replaceChildren(...d.packages.map(packageCard));
        count.textContent = d.total + ' result' + (d.total !== 1 ? 's' : '') + ' · catalog ' + d.catalog_version;
        if (!d.total) grid.replaceChildren(empty('No matches', 'Try another test name or clear the filters.', button('Clear filters', () => { q.value = ''; seg.value = ''; sort.value = 'featured'; load(); }), button('Ask the assistant', () => send('I am looking for a health check that includes ' + (q.value || 'specific tests') + '.'), 'btn sm primary')));
      } catch (e) { grid.replaceChildren(empty('Health checks could not be loaded', e.message, button('Try again', load))); }
      finally { grid.removeAttribute('aria-busy'); }
    }
    let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
    seg.onchange = load; sort.onchange = load; bar.onsubmit = e => { e.preventDefault(); load(); };
    reset.onclick = () => { q.value = ''; seg.value = ''; sort.value = 'featured'; load(); };
    box.append(bar, count, grid); await load(); return box;
  }

  /* ------------------------------------------------------------ booking */
  function slotPicker(branchSel, dateInput, onPick) {
    const wrap = el('div', null, 'stack-sm'), grid = el('div', null, 'slot-grid'), msg = el('p', 'Choose a center and date to see available times.', 'small muted');
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Available times'); msg.setAttribute('aria-live', 'polite');
    let chosen = '';
    async function load() {
      chosen = ''; onPick('');
      if (!branchSel.value || !dateInput.value) { grid.replaceChildren(); msg.textContent = 'Choose a center and date to see available times.'; return; }
      msg.textContent = 'Loading times…'; grid.replaceChildren();
      try {
        const d = await api('/slots?' + new URLSearchParams({ branch_id: branchSel.value, date: dateInput.value }));
        if (!d.slots.length) { msg.textContent = new Date(dateInput.value + 'T00:00:00').getDay() === 0 ? 'Centers are closed on Sundays. Choose Monday to Saturday.' : 'No times are open on this date (past, or more than 30 days ahead). Choose another date.'; return; }
        const open = d.slots.filter(s => s.available > 0).length;
        msg.textContent = open ? open + ' of ' + d.slots.length + ' times available.' : 'This date is fully booked. Try another date or center.';
        d.slots.forEach(s => {
          const b = el('button', null, 'slot'); b.type = 'button'; b.disabled = s.available < 1; b.setAttribute('aria-pressed', 'false');
          b.append(el('span', s.time), el('small', s.available < 1 ? 'Full' : s.available + ' left'));
          b.setAttribute('aria-label', s.time + (s.available < 1 ? ', full' : ', ' + s.available + ' places left'));
          b.onclick = () => { grid.querySelectorAll('.slot').forEach(x => x.setAttribute('aria-pressed', String(x === b))); chosen = s.time; onPick(s.time); };
          grid.append(b);
        });
      } catch (e) { msg.textContent = e.message; grid.replaceChildren(button('Try again', load)); }
    }
    branchSel.addEventListener('change', load); dateInput.addEventListener('change', load);
    wrap.append(msg, grid); return { wrap, load, get value() { return chosen; } };
  }
  function bangkokDate(offsetDays = 0) { const d = new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3); return d.toISOString().slice(0, 10); }
  async function bookView(params = {}) {
    await loadBusiness();
    const box = el('div'); box.append(intro('Request an appointment', 'Choose a package, center and time. Your request holds the slot until our team confirms it; payment opens after confirmation.'));
    const bookable = catalogCache.packages.filter(p => p.segment === 'individual' && !p.staff_review_required && p.active !== false);
    const grid = el('div', null, 'book-grid'), form = el('form', null, 'form-grid'), summary = el('aside', null, 'summary');
    const pkg = field('Health check', 'select'); bookable.forEach(p => { const o = el('option', p.name + ' · ' + money(p.price_thb)); o.value = p.id; pkg.input.append(o); });
    if (params.package && bookable.some(p => p.id === params.package)) pkg.input.value = params.package;
    const branch = field('Center', 'select'); const date = field('Date', 'date', '', 'Monday to Saturday, up to 30 days ahead');
    date.input.min = bangkokDate(0); date.input.max = bangkokDate(30); date.input.required = true;
    function fillBranches() {
      const p = bookable.find(x => x.id === pkg.input.value); const prev = branch.input.value || params.branch || '';
      branch.input.replaceChildren(); const o0 = el('option', 'Choose a center'); o0.value = ''; branch.input.append(o0);
      branchCache.branches.filter(b => !p || p.branch_ids.includes(b.id)).forEach(b => { const o = el('option', b.name); o.value = b.id; branch.input.append(o); });
      branch.input.value = [...branch.input.options].some(o => o.value === prev) ? prev : '';
    }
    fillBranches();
    let time = ''; let key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const picker = slotPicker(branch.input, date.input, t => { time = t; renderSummary(); });
    const err = el('p', '', 'field-error'); err.hidden = true; err.setAttribute('role', 'alert');
    const submit = button('Send appointment request', async () => {
      err.hidden = true;
      if (!pkg.input.value || !branch.input.value || !date.input.value || !time) { err.textContent = 'Choose a package, a center, a date and an available time.'; err.hidden = false; return; }
      if (!user?.registered) { requireAccount('Create an account or sign in so you can follow your appointment request.'); return; }
      try {
        const r = await post('/bookings', { package_ids: [pkg.input.value], branch_id: branch.input.value, date: date.input.value, time, idempotency_key: key });
        key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        notice('Request sent for ' + r.data.date + ' at ' + r.data.time + '. We will notify you when it is confirmed.');
        await navigate('bookings');
      } catch (e) {
        err.textContent = e.message; err.hidden = false;
        if (e.code === 'slot_full') picker.load();
      }
    }, 'btn primary');
    pkg.input.addEventListener('change', () => { fillBranches(); picker.load(); renderSummary(); });
    branch.input.addEventListener('change', renderSummary); date.input.addEventListener('change', renderSummary);
    function renderSummary() {
      const p = bookable.find(x => x.id === pkg.input.value);
      summary.replaceChildren(el('h3', 'Summary'));
      const dl = el('dl'); const row = (k, v) => { const d = el('div'); d.append(el('dt', k), el('dd', v || 'Not chosen')); dl.append(d); };
      row('Package', p?.name); row('Center', branch.input.value ? branchName(branch.input.value) : ''); row('Date', date.input.value ? new Date(date.input.value + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''); row('Time', time ? time + ' Bangkok time' : '');
      summary.append(dl, el('p', p ? money(p.price_thb) : '', 'total'), el('p', 'Simulated price from the current catalog. The server rechecks price and capacity when you send.', 'tiny muted'), submit);
    }
    form.onsubmit = e => e.preventDefault();
    const two = el('div', null, 'form-grid two'); two.append(branch.wrap, date.wrap);
    form.append(pkg.wrap, two, el('h3', 'Time'), picker.wrap, err);
    if (!bookable.length) form.replaceChildren(empty('No packages can be booked directly right now', 'Ask our team for help.', button('Talk to our team', requestStaff)));
    renderSummary(); grid.append(form, summary); box.append(grid);
    if (branch.input.value && params.date) { date.input.value = params.date; picker.load(); }
    return box;
  }
  function rescheduleDialog(b) {
    const f = el('div', null, 'form-grid');
    const branch = el('select', null, 'input'); const o = el('option', branchName(b.branch)); o.value = b.branch; branch.append(o); branch.disabled = true;
    const date = field('New date', 'date'); date.input.min = bangkokDate(0); date.input.max = bangkokDate(30);
    let time = ''; const picker = slotPicker(branch, date.input, t => { time = t; });
    f.append(el('p', 'Changing the time sends the appointment back to our team for confirmation. ' + (b.state === 'confirmed' ? 'Changes less than 24 hours before the slot go to staff review.' : ''), 'small muted'), date.wrap, picker.wrap,
      button('Request new time', async () => {
        if (!date.input.value || !time) { notice('Choose a date and an available time.', 'bad'); return; }
        const r = await post('/bookings/' + b.id + '/change', { operation: 'reschedule', date: date.input.value, time });
        closeModal(); notice(r.kind === 'ticket' ? 'Within 24 hours, so our team will review the change.' : 'New time requested. Awaiting confirmation.'); await navigate('bookings', false);
      }, 'btn primary'));
    modal('Change appointment time', f);
  }
  async function pay(b, method) {
    const r = await post('/payments/checkout', { booking_id: b.id, method });
    if (r.simulator_url) { location.assign(r.simulator_url); return; }
    if (r.url) { location.assign(r.url); return; }
    notice(r.message || 'Payment method recorded.'); await navigate('bookings', false);
  }
  async function bookings() {
    await refresh(); await loadBusiness();
    const box = el('div'); box.append(intro('My appointments', 'Requests, confirmed visits, payments and organization quotations. A confirmed appointment and a paid order are separate states.'));
    const toolbar = el('div', null, 'toolbar'); toolbar.append(button('Request an appointment', () => navigate('book'), 'btn primary sm'), button('Refresh', () => navigate('bookings', false), 'btn ghost sm'));
    box.append(toolbar);
    // Quotations grouped by case, newest version first.
    const quotes = (state.quotes || []).slice().sort((a, b) => (b.data.version || 1) - (a.data.version || 1));
    if (quotes.length || (state.inquiries || []).length) {
      const t = el('div', null, 'section-title'); t.append(el('h2', 'Organization quotations')); box.append(t);
      const list = el('div', null, 'record-list');
      (state.inquiries || []).filter(i => !quotes.some(q => q.data.ticket_id === i.data.ticket_id)).forEach(i => {
        const r = el('article', null, 'record'); const h = el('div', null, 'record-head');
        h.append(el('h3', i.data.organization), badge('Waiting for quotation', 'warn')); r.append(h, el('p', i.data.headcount + ' people · ' + (i.data.service_mode === 'onsite' ? 'onsite' : 'at center') + ' · requested ' + when(i.data.at), 'small muted')); list.append(r);
      });
      quotes.forEach(q => {
        const d = q.data, r = el('article', null, 'record'), h = el('div', null, 'record-head');
        const tone = { offered: ['Ready to review', 'warn'], accepted: ['Accepted', 'ok'], superseded: ['Superseded by a newer version', 'neutral'] }[q.state] || [q.state, 'neutral'];
        h.append(el('h3', d.items[0].name + ' · version ' + (d.version || 1)), badge(...tone)); r.append(h);
        const meta = el('div', null, 'record-meta'); meta.append(el('span', 'Total ' + money(d.total_thb)), el('span', d.date + ' ' + d.time), el('span', d.venue), el('span', 'Valid until ' + new Date(d.expires * 1000).toLocaleDateString('en-GB')));
        r.append(meta); if (d.note) r.append(el('p', 'Note: ' + d.note, 'small'));
        const act = el('div', null, 'record-actions');
        act.append(link('Download quotation (PDF)', '/api/business/quotes/' + encodeURIComponent(q.id) + '/document.pdf', 'btn sm'));
        if (q.state === 'offered') act.append(button('Review and accept', () => {
          const n = el('div', null, 'stack');
          n.append(el('p', `Accept version ${d.version || 1}: ${d.people} people, ${money(d.total_thb)} in total. Accepting creates the service appointment; payment is arranged with our team. This is not a tax invoice.`),
            button('Accept quotation', async () => { try { await post('/quotes/accept', { quote_id: q.id }); closeModal(); notice('Quotation accepted.'); await navigate('bookings', false); } catch (e) { closeModal(); notice(e.message, 'bad'); await navigate('bookings', false); } }, 'btn primary'));
          modal('Accept organization quotation', n);
        }, 'btn sm primary'));
        r.append(act); list.append(r);
      });
      box.append(list);
    }
    const t2 = el('div', null, 'section-title'); t2.append(el('h2', 'Appointments')); box.append(t2);
    if (!state.bookings.length) { box.append(empty('No appointments yet', 'Request a time directly, or ask the assistant to help you choose.', button('Request an appointment', () => navigate('book'), 'btn primary sm'), button('Ask the assistant', () => send('Help me choose a package and book a visit.'), 'btn sm'))); return box; }
    const list = el('div', null, 'record-list');
    state.bookings.slice().reverse().forEach(b => {
      const d = b.data, r = el('article', null, 'record'), h = el('div', null, 'record-head');
      h.append(el('h3', d.items.map(i => i.name).join(' + ')), ...bookingBadges(b));
      const meta = el('div', null, 'record-meta');
      meta.append(el('span', longDate(d.date) + ', ' + d.time + ' Bangkok time'), el('span', d.organization ? (d.venue || 'Organization service') : branchName(b.branch)), el('span', money(d.total_thb)), el('span', 'Ref ' + b.id.slice(-8)));
      r.append(h, meta);
      if (b.state === 'declined' && d.decision_note) r.append(el('p', 'From our team: ' + d.decision_note, 'small'));
      const txn = (state.payments || []).find(t => t.booking_id === b.id && t.state === 'pending');
      if (d.last_payment_outcome && d.payment_status === 'pending' && !txn) r.append(el('p', 'Last test payment: ' + d.last_payment_outcome + '. You can try again or pay at the center.', 'small muted'));
      const act = el('div', null, 'record-actions');
      if (b.state === 'requested') {
        r.append(el('p', 'Our team will confirm or decline this request. You will get a notification.', 'small muted'));
        act.append(button('Change time', () => rescheduleDialog(b)), button('Withdraw request', () => {
          const n = el('div', null, 'stack'); n.append(el('p', 'Withdraw this appointment request? The time slot is released.'), button('Withdraw request', async () => { await post('/bookings/' + b.id + '/change', { operation: 'cancel' }); closeModal(); notice('Request withdrawn.'); await navigate('bookings', false); }, 'btn danger'));
          modal('Withdraw request', n);
        }, 'btn sm danger'));
      }
      if (b.state === 'confirmed') {
        if (!d.organization) act.append(link('Add to calendar (.ics)', '/api/business/bookings/' + encodeURIComponent(b.id) + '/calendar.ics', 'btn sm'));
        if (d.payment_status === 'pending') {
          if (txn) act.append(link('Continue test payment', '/pay/sim/' + encodeURIComponent(txn.id), 'btn sm primary'));
          else if (!d.organization) { r.append(el('p', 'Pay at the center on the day, or now with a test payment that moves no real money.', 'small muted')); act.append(button('Pay with test PromptPay', () => pay(b, 'promptpay'), 'btn sm primary'), button('Pay with test card', () => pay(b, 'card'))); }
        }
        if (!d.organization) act.append(button('Change time', () => rescheduleDialog(b)));
        act.append(button(d.payment_status === 'paid' ? 'Request refund' : 'Cancel appointment', () => {
          const n = el('div', null, 'stack');
          n.append(el('p', d.payment_status === 'paid' ? 'Refunds are reviewed by our team; approval is not guaranteed.' : 'Cancelling 24 hours or more before the slot is immediate. Closer to the time, our team reviews it.', 'small'),
            button('Confirm', async () => { const res = await post('/bookings/' + b.id + '/change', { operation: d.payment_status === 'paid' ? 'refund_request' : 'cancel' }); closeModal(); notice(res.kind === 'ticket' ? 'Sent to our team for review.' : 'Appointment cancelled.'); await navigate('bookings', false); }, 'btn danger'));
          modal(d.payment_status === 'paid' ? 'Request a refund' : 'Cancel appointment', n);
        }, 'btn sm danger'));
      }
      if (act.children.length) r.append(act);
      list.append(r);
    });
    box.append(list); return box;
  }

  /* ------------------------------------------------------------ reports */
  async function reports() {
    await refresh();
    const box = el('div'); box.append(intro('My reports', 'Check every extracted value before it is used. Choose a previous report for comparison only when it belongs to the same person.'));
    box.append(planStrip());
    const actions = el('div', null, 'toolbar');
    actions.append(button('Add a report', () => { if (!planOf().can_read) return upgradeDialog('Your free AI report reading has been used. Synthetic samples stay free.'); $('report-file').click(); }, 'btn primary sm'), button('Try a synthetic sample', demoPicker),
      button('Clear report context', async () => { await post('/reports/select', { report_id: '' }); await post('/reports/compare', { report_id: '' }); await refresh(); notice('Report context cleared.'); }, 'btn ghost sm'));
    box.append(actions);
    if (!state.reports.length) { box.append(empty('No reports yet', 'Upload a JPEG, PNG or PDF up to 3 MB, or read one of the synthetic samples.')); return box; }
    const list = el('div', null, 'record-list');
    state.reports.slice().reverse().forEach(r => {
      const c = el('article', null, 'record'), h = el('div', null, 'record-head');
      h.append(el('h3', r.label), r.confirmed ? badge('Confirmed', 'ok') : badge('Needs review', 'warn'));
      if (state.conversation.report_id === r.id) h.append(badge('In use'));
      if (state.conversation.compare_report_id === r.id) h.append(badge('Previous report', 'neutral'));
      c.append(h, el('p', (r.date ? longDate(r.date) : 'Collection date not entered') + (r.pages > 1 ? ' · ' + r.pages + ' pages' : '') + (r.sample ? ' · Synthetic sample' : ''), 'small muted'));
      const a = el('div', null, 'record-actions');
      if (r.confirmed) a.append(link('Lab Report', '/lab-report/' + encodeURIComponent(r.id), 'btn sm primary'));
      a.append(button(r.confirmed ? 'View fields' : 'Review fields', async () => reviewReport(await api('/reports/' + r.id))));
      if (r.confirmed) a.append(button('Use in conversation', async () => { await post('/reports/select', { report_id: r.id }); await refresh(); await navigate('chat'); notice('Report selected. Ask about it now.'); }),
        button('Use as previous report', async () => { await post('/reports/compare', { report_id: r.id }); await navigate('reports', false); notice('Previous report selected for comparison.'); }));
      a.append(button('Delete', () => {
        const n = el('div', null, 'stack'); n.append(el('p', 'This removes the report and clears conversation history so its values cannot reappear. This cannot be undone.'),
          button('Delete report and history', async () => { await api('/reports/' + r.id, { method: 'DELETE' }); closeModal(); lastMessages = ''; notice('Report deleted.'); await navigate('reports', false); }, 'btn danger'));
        modal('Delete report', n);
      }, 'btn sm danger'));
      c.append(a); list.append(c);
    });
    box.append(list); return box;
  }
  function reviewReport(r, highlight = '') {
    const d = r.data, form = el('form', null, 'form-grid'), label = field('Report label', 'text', d.label && d.label !== 'Unconfirmed report' ? d.label : '', 'For example: Annual check, September 2026'), date = field('Collection date if known', 'date', d.collected_date || '');
    form.append(el('p', 'Compare every value with the source image. Leave missing values empty. Synthetic samples are not patient records.', 'small muted'), label.wrap, date.wrap);
    if (d.warnings?.length) form.append(el('p', d.warnings.join(' · '), 'callout warn small'));
    const pages = d.pages || 1, previews = el('div', null, pages > 1 ? 'report-pages' : '');
    for (let i = 1; i <= pages; i++) { const img = el('img', null, 'report-preview'); img.src = '/api/business/reports/' + encodeURIComponent(r.id) + '/source?page=' + i; img.alt = `Source report, page ${i} of ${pages}, for comparison`; img.loading = 'lazy'; previews.append(img); }
    form.append(previews);
    const wrap = el('div', null, 'table-wrap'), table = el('table', null, 'data report-table'), head = el('tr');
    ['Test', 'Result', 'Unit', 'Reference', 'Flag'].forEach(x => head.append(el('th', x))); table.append(head);
    const fields = [];
    d.fields.forEach((row, i) => {
      const tr = el('tr'), cells = {};
      ['name', 'value', 'unit', 'reference', 'printed_flag'].forEach(k => { const td = el('td'), input = el('input'); input.type = 'text'; input.value = row[k] || ''; input.setAttribute('aria-label', (k === 'printed_flag' ? 'flag' : k) + ' for row ' + (i + 1)); input.maxLength = k === 'name' ? 120 : 160; td.append(input); tr.append(td); cells[k] = input; });
      if (highlight && row.id === highlight) { tr.className = 'highlight flash'; setTimeout(() => tr.scrollIntoView({ block: 'center' }), 50); }
      fields.push(cells); table.append(tr);
    });
    if (!d.fields.length) form.append(el('p', 'No values could be read. Delete this report or try a clearer image.', 'callout warn small'));
    wrap.append(table);
    const check = el('label', null, 'check'), cb = el('input'); cb.type = 'checkbox'; cb.required = true;
    check.append(cb, document.createTextNode('I checked the extracted values and confirm this report belongs to the person being discussed.'));
    form.append(wrap, check, button('Confirm and use report', async () => {
      if (!form.reportValidity()) return;
      await post('/reports/confirm', { report_id: r.id, fields: fields.map(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.value]))), label: label.input.value.trim() || 'My report', collected_date: date.input.value, same_person_confirmed: cb.checked });
      closeModal(); await refresh(); await navigate('chat'); notice('Report confirmed. You can ask about it now.');
    }, 'btn primary'));
    form.onsubmit = e => e.preventDefault();
    modal('Review report fields', form);
  }
  async function demoPicker() {
    const d = await api('/demos'), box = el('div', null, 'stack');
    box.append(el('p', 'Six synthetic laboratory documents for testing the reader. Their values and printed ranges are not medical reference knowledge.', 'small muted'));
    d.demos.forEach(x => {
      const row = el('div', null, 'record'); row.append(el('h3', x.title), el('p', x.description, 'small muted'));
      const a = el('a', 'View source image', 'small'); a.href = '/api/samples/' + x.id + '/png'; a.target = '_blank'; a.rel = 'noopener';
      row.append(a, button('Read this sample', async () => { notice('Reading the document. This uses the configured OCR provider.'); reviewReport(await post('/demos/' + x.id + '/read')); }, 'btn sm'));
      box.append(row);
    });
    modal('Try a sample report', box);
  }
  if (!STAFF_MODE) {
    $('add-report').onclick = () => { if (!planOf().can_read) return upgradeDialog('Your free AI report reading has been used. Synthetic samples stay free.'); $('report-file').click(); };
    $('demo-open').onclick = () => demoPicker().catch(e => notice(e.message, 'bad'));
  }
  $('report-file').onchange = async () => {
    const files = [...$('report-file').files]; if (!files.length) return;
    try {
      const limit = planOf().images_per_read || 1;
      if (files.length > limit) { upgradeDialog(limit === 1 ? 'The Free plan reads one image at a time. LabClear Plus reads up to three pages or images together.' : 'Choose up to three files.'); return; }
      files.forEach(file => {
        if (file.size > 3 * 1024 * 1024) throw Error('Choose files under 3 MB each.');
        if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw Error('Use PDF, PNG or JPEG files.');
      });
      const form = new FormData(); files.forEach(f => form.append('files', f));
      notice(files.length > 1 ? `Reading ${files.length} files together. Please wait…` : 'Reading your document. Please wait…');
      const r = await api('/reports/read', { method: 'POST', body: form });
      if (r.entitlement && state) state.plan = r.entitlement;
      reviewReport(r);
    } catch (e) { if (e.code === 'subscription_required') upgradeDialog(e.message); else notice(e.message, 'bad'); } finally { $('report-file').value = ''; }
  };
  function syncFileInput() { $('report-file').multiple = (planOf().images_per_read || 1) > 1; }

  /* ------------------------------------------------------------ plan, lab dashboard */
  const planOf = () => state?.plan || { plan: 'free', images_per_read: 1, trends: false, can_read: true, ai_reads_used: 0, ai_reads_limit: 1 };
  const isPlus = () => planOf().plan === 'plus';
  const dayText = t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const shortDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (d || '');
  const LAB_STATUS = { within: ['Within printed range', 'ok'], high: ['Above printed range', 'warn'], low: ['Below printed range', 'warn'], unknown: ['No range to compare', 'neutral'] };
  function planStrip() {
    const p = planOf(), s = el('div', null, 'plan-strip');
    if (isPlus()) s.append(badge('LabClear Plus', 'ok'), el('span', 'Active until ' + dayText(p.period_end) + ' · up to 3 pages or images per reading', 'small muted'));
    else {
      s.append(badge('Free plan', 'neutral'), el('span', p.can_read ? 'One AI report reading of one image is included.' : 'Your free AI reading is used. Samples stay free.', 'small muted'));
      s.append(button('Get Plus, ฿355 for 30 days', () => navigate('plan'), 'btn sm primary'));
    }
    return s;
  }
  function upgradeDialog(reason) {
    const n = el('div', null, 'stack');
    n.append(el('p', reason), el('p', 'LabClear Plus costs ฿355 for 30 days. It reads reports without the one-report limit, up to three pages or images at once, and shows your results over time. It does not renew by itself.', 'small muted'),
      button('See LabClear Plus', () => { closeModal(); navigate('plan'); }, 'btn primary'));
    modal('This needs LabClear Plus', n);
  }
  async function planView() {
    await refresh();
    const [catalog, ent] = await Promise.all([api('/plans'), api('/subscription')]);
    state.plan = ent; syncFileInput();
    const box = el('div'); box.append(intro('Plan', 'Health-check packages are paid per visit. The AI Lab Report service has a free plan and LabClear Plus. Payments here use the test simulator; no real money moves.'));
    const grid = el('div', null, 'plan-grid');
    catalog.plans.forEach(pl => {
      const current = ent.plan === pl.id, card = el('article', null, 'plan-card' + (pl.id === 'plus' ? ' featured' : ''));
      const head = el('div', null, 'plan-head'); head.append(el('h3', pl.name)); if (current) head.append(badge('Current plan', 'ok'));
      const price = el('p', null, 'plan-price'); price.append(el('strong', pl.price_thb ? money(pl.price_thb) : '฿0', 'num'), el('span', pl.price_thb ? ' for ' + pl.period_days + ' days' : ' always', 'small muted'));
      const ul = el('ul', null, 'plan-features'); pl.features.forEach(f => ul.append(el('li', f)));
      card.append(head, el('p', pl.summary, 'small muted'), price, ul);
      if (pl.id === 'plus') {
        const act = el('div', null, 'record-actions'), renewable = !ent.active || (ent.period_end - Date.now() / 1000) <= 7 * 86400;
        if (!user?.registered) act.append(button('Create an account to subscribe', account, 'btn primary sm'));
        else if (renewable) {
          const go = method => async () => { const r = await post('/subscriptions/checkout', { method }); location.href = r.simulator_url; };
          act.append(button(ent.active ? 'Renew with test PromptPay' : 'Subscribe with test PromptPay', go('promptpay'), 'btn primary sm'), button('Test card', go('card')));
        } else act.append(el('span', 'Renewal opens in the last 7 days of your period.', 'small muted'));
        card.append(act);
      }
      grid.append(card);
    });
    box.append(grid);
    const kv = el('dl', null, 'kv'), row = (k, v) => kv.append(el('dt', k), el('dd', v));
    row('Plan', ent.plan_name); row('AI report readings used', String(ent.ai_reads_used) + (ent.ai_reads_limit ? ' of ' + ent.ai_reads_limit : ' (no limit on Plus)'));
    row('Pages or images per reading', String(ent.images_per_read)); if (ent.active) row('Plus active until', dayText(ent.period_end));
    if (ent.subscription?.payment_status === 'refunded') row('Last Plus period', 'Refunded (simulation)');
    const status = el('section', null, 'card stack-sm'); status.append(el('h3', 'Your plan'), kv, el('p', 'Plus does not renew by itself. Synthetic sample reports never use a reading.', 'small muted'));
    box.append(status); return box;
  }

  function sparkline(t) {
    // One series per chart. Printed range of the latest report as a band (only for simple numeric ranges).
    const pts = t.points.filter(x => x.number !== null && x.number !== undefined);
    const W = 320, H = 96, P = { l: 8, r: 44, t: 12, b: 20 };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'spark');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${t.name}: ${t.points.map(x => x.date + ' ' + x.value).join(', ')}`);
    if (pts.length < 1) return svg;
    const range = window.RSTurns?.parseRange(t.latest.reference);
    const vals = pts.map(x => x.number).concat(range ? [range.lo, range.hi].filter(v => v !== null) : []);
    let lo = Math.min(...vals), hi = Math.max(...vals); if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * .12; lo -= pad; hi += pad;
    const x = i => P.l + (pts.length === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (pts.length - 1)), y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const ns = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    if (range) { const top = y(range.hi ?? hi), bot = y(range.lo ?? lo); svg.append(ns('rect', { x: P.l, y: Math.min(top, bot), width: W - P.l - P.r, height: Math.abs(bot - top), class: 'spark-band' })); }
    svg.append(ns('line', { x1: P.l, x2: W - P.r, y1: H - P.b + .5, y2: H - P.b + .5, class: 'spark-axis' }));
    if (pts.length > 1) svg.append(ns('polyline', { points: pts.map((p, i) => x(i) + ',' + y(p.number)).join(' '), class: 'spark-line' }));
    pts.forEach((p, i) => { const c = ns('circle', { cx: x(i), cy: y(p.number), r: 4, class: 'spark-dot ' + p.status }); const tt = ns('title', {}); tt.textContent = `${p.date}: ${p.value} ${t.unit} (${(LAB_STATUS[p.status] || LAB_STATUS.unknown)[0]})`; c.append(tt); svg.append(c); });
    const last = pts[pts.length - 1], lab = ns('text', { x: x(pts.length - 1) + 8, y: y(last.number) + 4, class: 'spark-label' }); lab.textContent = last.value; svg.append(lab);
    const d0 = ns('text', { x: P.l, y: H - 4, class: 'spark-date' }); d0.textContent = shortDate(pts[0].date); svg.append(d0);
    if (pts.length > 1 && last.date !== pts[0].date) { const d1 = ns('text', { x: W - P.r, y: H - 4, class: 'spark-date', 'text-anchor': 'end' }); d1.textContent = shortDate(last.date); svg.append(d1); }
    return svg;
  }
  async function labsView() {
    await refresh(); syncFileInput();
    const box = el('div'); box.append(intro('Lab dashboard', 'Your confirmed reports in one place. Values are exactly as printed and confirmed by you; each status compares a value with the range printed on the same report. This is not a diagnosis.'));
    box.append(planStrip());
    const confirmed = state.reports.filter(r => r.confirmed);
    const bar = el('div', null, 'toolbar'); bar.append(button('Add a report', () => { if (!planOf().can_read) return upgradeDialog('Your free AI report reading has been used.'); $('report-file').click(); }, 'btn primary sm'), button('Try a synthetic sample', demoPicker)); box.append(bar);
    if (!confirmed.length) { box.append(empty('No confirmed reports yet', 'Add a report or read a synthetic sample, check the values and confirm them. Your Lab Report and dashboard appear here.')); return box; }
    const latest = confirmed.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))[confirmed.length - 1];
    const lab = await api('/reports/' + latest.id + '/lab-report');
    const sum = el('section', null, 'card stack-sm lab-latest'), head = el('div', null, 'record-head');
    head.append(el('h3', 'Latest: ' + lab.label), el('span', lab.date ? longDate(lab.date) : '', 'small muted'), link('Open Lab Report', '/lab-report/' + encodeURIComponent(lab.id), 'btn sm primary'));
    const kpis = el('div', null, 'kpi-grid four');
    [['within', 'Within range'], ['high', 'Above range'], ['low', 'Below range'], ['unknown', 'No printed range']].forEach(([k, label]) => kpis.append(tile(label, String(lab.counts[k] || 0), k === 'within' ? 'of ' + lab.rows.length + (lab.rows.length === 1 ? ' test' : ' tests') : '')));
    sum.append(head, kpis);
    const flagged = lab.rows.filter(r => r.status === 'high' || r.status === 'low');
    if (flagged.length) { const ul = el('ul', null, 'plain flag-list'); flagged.forEach(r => { const li = el('li'); li.append(el('strong', r.name), el('span', ` ${r.value} ${r.unit}`.trimEnd()), el('span', ' · printed range ' + (r.reference || 'none'), 'muted small'), badge(...LAB_STATUS[r.status])); ul.append(li); }); sum.append(ul); }
    const askRow = el('div', null, 'row'); askRow.append(button('Ask about this report', async () => { await post('/reports/select', { report_id: lab.id }); await refresh(); await navigate('chat'); $('message').value = 'Please explain my latest report in plain language.'; $('message').focus(); }, 'btn sm'));
    sum.append(askRow);
    box.append(sum);
    const trendBox = el('section', null, 'stack-sm'); trendBox.append(el('h3', 'Results over time'));
    if (!isPlus()) {
      const lock = el('div', null, 'locked');
      lock.append(el('p', 'See every test across your reports, with the change since your previous report. This is part of LabClear Plus.', 'small'), button('Get Plus, ฿355 for 30 days', () => navigate('plan'), 'btn primary sm'));
      trendBox.append(lock); box.append(trendBox); return box;
    }
    const tr = await api('/reports/trends');
    if (tr.reports.length < 2) trendBox.append(el('p', 'Confirm a second report to see changes over time. Each chart below shows one test.', 'small muted'));
    const grid = el('div', null, 'trend-grid');
    tr.tests.slice(0, 24).forEach(t => {
      const card = el('article', null, 'trend-card'), h = el('div', null, 'trend-head');
      h.append(el('strong', t.name), badge(...(LAB_STATUS[t.latest.status] || LAB_STATUS.unknown)));
      const meta = el('p', null, 'small muted');
      meta.textContent = `${t.latest.value} ${t.unit}`.trim() + (t.change === null || t.change === undefined ? (t.count > 1 ? ' · change not numeric' : ' · one report so far') : t.change === 0 ? ` · no change since ${shortDate(t.previous.date)}` : ` · ${t.change > 0 ? '+' : ''}${t.change} since ${shortDate(t.previous.date)}`);
      card.append(h, meta, sparkline(t), el('p', t.latest.reference ? 'Band: range printed on the latest report (' + t.latest.reference + ')' : 'No printed range on the latest report', 'tiny muted'));
      grid.append(card);
    });
    trendBox.append(grid);
    const tableBtn = button('Show as a table', () => {
      const wrap = el('div', null, 'table-wrap'), t = el('table', null, 'data'), hr = el('tr'); ['Test', ...tr.reports.map(r => r.date)].forEach(x => hr.append(el('th', x))); t.append(hr);
      tr.tests.forEach(s => { const row = el('tr'); row.append(el('td', s.name + (s.unit ? ' (' + s.unit + ')' : ''))); tr.reports.forEach(r => { const pnt = s.points.find(p => p.report_id === r.id); row.append(el('td', pnt ? pnt.value : 'Not in report', pnt ? 'n' : 'n muted')); }); t.append(row); });
      wrap.append(t); modal('Results over time', wrap);
    }, 'btn ghost sm');
    const tableRow = el('div', null, 'row'); tableRow.append(tableBtn); trendBox.append(tableRow); box.append(trendBox); return box;
  }

  /* ------------------------------------------------------------ history and notifications */
  async function historyView() {
    const d = await api('/history'), box = el('div'); box.append(intro('Past conversations', 'Saved when you start a new conversation. Deleting a report also clears these to avoid keeping its values.'));
    if (!d.conversations.length) { box.append(empty('No past conversations', 'Start a new conversation to save the current one here.')); return box; }
    const list = el('div', null, 'record-list');
    d.conversations.slice().reverse().forEach(c => {
      const n = el('article', null, 'record'), first = c.data.messages.find(m => m.role === 'user');
      n.append(el('h3', when(c.created)), el('p', first ? first.content.slice(0, 140) : 'No messages', 'small muted'),
        button('Read conversation', () => { const b = el('div', null, 'stack'); c.data.messages.forEach(m => b.append(messageNode({ ...m, action: null }, false))); modal('Past conversation', b); }));
      list.append(n);
    });
    box.append(list); return box;
  }
  function setBell(n) { const c = $('bell-count'); c.textContent = n > 99 ? '99+' : String(n || 0); c.hidden = !n; $('bell').setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications'); }
  const noticePath = () => STAFF_MODE ? '/staff/notifications' : '/notifications';
  async function pollBell() { if (!csrf || (STAFF_MODE && !isStaff())) return; try { setBell((await api(noticePath())).unread); } catch { /* keep last count */ } }
  async function notifications() {
    const box = el('div'); box.append(intro('Notifications', 'Updates created by real events in your account: requests, confirmations, payments, quotations and replies.'));
    if (STAFF_MODE && !isStaff()) return staffSignIn(box);
    const d = await api(noticePath());
    const bar = el('div', null, 'toolbar'); bar.append(button('Mark all as read', async () => { await post(noticePath() + '/read', {}); await navigate('notifications', false); setBell(0); }, 'btn sm'));
    box.append(bar);
    if (!d.notifications.length) { box.append(empty('No notifications yet', 'You will see updates here when something changes.')); return box; }
    const list = el('div', null, 'record-list');
    d.notifications.forEach(n => {
      const item = el('article', null, 'notice-item' + (n.state === 'unread' ? ' unread' : ''));
      item.append(el('strong', n.title), el('span', n.body, 'small'), el('time', when(n.at)));
      if (n.link) { const go = el('button', 'Open', 'link-btn small'); go.type = 'button'; go.onclick = async () => { await post(noticePath() + '/read', { ids: [n.id] }); const u = new URL(n.link, location.origin); if (u.pathname === location.pathname) navigate(u.searchParams.get('view') || (STAFF_MODE ? 'overview' : 'chat')); else location.href = u.href; }; item.append(go); }
      list.append(item);
    });
    box.append(list); setBell(d.unread); return box;
  }
  $('bell').onclick = () => navigate('notifications');

  /* ------------------------------------------------------------ staff: inbox */
  function staffSignIn(box) { box.append(empty('Staff sign-in required', 'Use an account created by the deployment owner.', button('Sign in', account, 'btn primary sm'))); return box; }
  function ticketButton(t) {
    const b = el('button', null, 'ticket-btn'); b.type = 'button'; b.dataset.ticket = t.id; b.setAttribute('aria-current', String(t.id === activeTicket));
    const top = el('span', null, 'row'); top.append(el('strong', t.data.summary.slice(0, 90)));
    const tone = { waiting: 'warn', staff: '', bot: 'neutral', closed: 'neutral' }[t.state];
    b.append(top, el('small', ({ waiting: 'Waiting', staff: 'With staff', bot: 'Back with assistant', closed: 'Closed' }[t.state] || t.state) + ' · ' + (t.branch || 'any center') + ' · ' + when(t.created)));
    if (t.data.topic === 'organization') b.append(badge('Organization', 'neutral'));
    b.onclick = () => openTicket(t.id); b.classList.toggle('closed', t.state === 'closed'); void tone; return b;
  }
  async function staffView() {
    const box = el('div'); box.append(intro('Inbox', 'Customer requests from the website and LINE. Take over a case before replying; the assistant pauses while you do.'));
    if (!isStaff()) return staffSignIn(box);
    await loadBusiness();
    const [d, ops] = await Promise.all([api('/staff/inbox'), api('/staff/operations')]);
    const metrics = el('div', null, 'metric-grid');
    [['Open requests', d.metrics.open], ['Waiting for a person', d.tickets.filter(t => t.state === 'waiting').length], ['My cases', d.tickets.filter(t => t.data.assigned_to === user.id && t.state === 'staff').length], ['Appointments to confirm', ops.bookings.filter(b => b.state === 'requested').length]]
      .forEach(([name, count]) => { const m = el('div', null, 'metric'); m.append(el('strong', String(count)), el('span', name)); metrics.append(m); });
    const filters = el('div', null, 'toolbar');
    [['open', 'Open'], ['all', 'All']].forEach(([v, t]) => { const c = el('button', t, 'chip'); c.type = 'button'; c.setAttribute('aria-pressed', String(ticketFilter === v)); c.onclick = () => { ticketFilter = v; navigate('staff', false); }; filters.append(c); });
    filters.append(button('Refresh', () => navigate('staff', false), 'btn ghost sm'));
    const grid = el('div', null, 'staff-grid'), list = el('div', null, 'staff-list'), thread = el('div', null, 'staff-thread');
    list.id = 'staff-list'; thread.id = 'staff-thread'; list.setAttribute('aria-label', 'Requests');
    thread.append(empty('Select a request', 'Its conversation, related appointments and organization details appear here.'));
    const shown = d.tickets.filter(t => ticketFilter === 'all' || t.state !== 'closed').reverse();
    shown.forEach(t => list.append(ticketButton(t)));
    if (!shown.length) list.append(empty('The queue is clear', ticketFilter === 'open' ? 'No open requests.' : 'No requests yet.'));
    grid.append(list, thread); box.append(metrics, filters, grid);
    if (activeTicket && shown.some(t => t.id === activeTicket)) setTimeout(() => openTicket(activeTicket), 0);
    return box;
  }
  async function openTicket(id) {
    activeTicket = id;
    document.querySelectorAll('.ticket-btn').forEach(b => b.setAttribute('aria-current', String(b.dataset.ticket === id)));
    const thread = $('staff-thread'); if (!thread) return;
    let d, inq;
    try { [d, inq] = await Promise.all([api('/staff/tickets/' + id), api('/staff/tickets/' + id + '/inquiry')]); }
    catch (e) { thread.replaceChildren(empty('This case cannot be opened', e.message)); return; }
    const t = d.ticket, mine = t.data.assigned_to === user.id;
    const head = el('div', null, 'record-head'); head.append(el('h3', t.data.summary), badge({ waiting: 'Waiting', staff: mine ? 'You are replying' : 'With another staff member', bot: 'With assistant', closed: 'Closed' }[t.state] || t.state, t.state === 'waiting' ? 'warn' : 'neutral'));
    thread.replaceChildren(head);
    const controls = el('div', null, 'record-actions');
    const setState = (label, s, cls) => button(label, async () => { await post('/staff/tickets/' + id + '/state', { state: s }); notice(s === 'staff' ? 'You took over. The assistant is paused for this customer.' : s === 'bot' ? 'Returned to the assistant.' : 'Case closed.'); await openTicket(id); pollList(); }, cls);
    if (!(t.state === 'staff' && mine)) controls.append(setState('Take over', 'staff', 'btn sm primary'));
    if (t.state !== 'bot') controls.append(setState('Return to assistant', 'bot'));
    if (t.state !== 'closed') controls.append(setState('Close case', 'closed', 'btn sm ghost'));
    thread.append(controls);
    if (inq.inquiry) {
      const i = inq.inquiry.data, box = el('section', null, 'card stack-sm'); box.append(el('h4', 'Organization request'));
      const kv = el('dl', null, 'kv'); const row = (k, v) => kv.append(el('dt', k), el('dd', v || 'Not given'));
      row('Organization', i.organization); row('Contact', i.contact_name + ' · ' + i.email); row('People', String(i.headcount)); row('Where', i.service_mode === 'onsite' ? 'Onsite at their workplace' : 'At a center'); row('Center', branchName(i.branch_id)); row('Preferred date', i.preferred_date); row('Interested in', (i.package_ids || []).join(', ')); row('Notes', i.notes);
      box.append(kv); thread.append(box);
    }
    if (inq.quotes.length || inq.inquiry || t.data.topic === 'organization') {
      const qs = el('section', null, 'stack-sm'); qs.append(el('h4', 'Quotations'));
      inq.quotes.slice().sort((a, b) => b.data.version - a.data.version).forEach(q => {
        const r = el('div', null, 'row small'); r.append(el('strong', 'v' + q.data.version), el('span', money(q.data.total_thb) + ' · ' + q.data.people + ' people · ' + q.data.date), badge(q.state, q.state === 'accepted' ? 'ok' : q.state === 'offered' ? 'warn' : 'neutral'), link('PDF', '/api/business/quotes/' + encodeURIComponent(q.id) + '/document.pdf', 'btn ghost sm'));
        qs.append(r);
      });
      if (!inq.quotes.some(q => q.state === 'accepted')) qs.append(button(inq.quotes.length ? 'Revise quotation (new version)' : 'Prepare quotation', () => quoteForm(id, inq), mine ? 'btn sm primary' : 'btn sm'));
      thread.append(qs);
    }
    const messages = el('div', null, 'staff-messages'); messages.setAttribute('aria-label', 'Conversation'); messages.setAttribute('aria-live', 'polite');
    d.conversation.messages.forEach(m => messages.append(messageNode({ ...m, action: null }, false)));
    if (!d.conversation.messages.length) messages.append(el('p', 'No chat messages. This case came from a form or appointment change.', 'small muted'));
    messages.dataset.version = JSON.stringify(d.conversation.messages);
    thread.append(messages); messages.scrollTop = messages.scrollHeight;
    const form = el('form', null, 'form-grid'), text = el('textarea', null, 'input');
    text.setAttribute('aria-label', 'Staff reply'); text.required = true; text.maxLength = 4000; text.rows = 3;
    const canReply = t.state === 'staff' && mine; text.disabled = !canReply;
    text.placeholder = canReply ? 'Write to the customer…' : 'Take over the case to reply.';
    form.append(text, button('Send reply', async () => { if (!form.reportValidity()) return; await post('/staff/tickets/' + id + '/messages', { message: text.value }); text.value = ''; await openTicket(id); }, 'btn primary sm'));
    form.onsubmit = e => e.preventDefault();
    thread.append(form);
    if (d.bookings.length) {
      const bx = el('section', null, 'stack-sm'); bx.append(el('h4', 'This customer’s appointments'));
      d.bookings.slice().reverse().forEach(b => bx.append(staffBookingRow(b, () => openTicket(id))));
      thread.append(bx);
    }
  }
  async function quoteForm(ticketId, inq) {
    await loadBusiness();
    const latest = inq.quotes.slice().sort((a, b) => b.data.version - a.data.version)[0]?.data, i = inq.inquiry?.data || {};
    const f = el('form', null, 'form-grid'), pkg = field('Organization package', 'select');
    catalogCache.packages.filter(p => p.segment === 'organization' && p.active !== false).forEach(p => { const o = el('option', p.name + ' · ' + money(p.price_thb) + ' per person'); o.value = p.id; pkg.input.append(o); });
    pkg.input.value = latest?.package_id || (i.package_ids || [])[0] || pkg.input.value;
    const people = field('Number of people', 'number', latest?.people || i.headcount || 20); people.input.min = 20; people.input.max = 10000; people.input.required = true;
    const date = field('Service date', 'date', latest?.date || i.preferred_date || ''); date.input.required = true; date.input.min = bangkokDate(1);
    const tm = field('Start time', 'time', latest?.time || '09:00'); tm.input.required = true;
    const venue = field('Venue', 'text', latest?.venue || (i.service_mode === 'center' ? branchName(i.branch_id) : '')); venue.input.required = true; venue.input.maxLength = 250;
    const travel = field('Travel fee (THB)', 'number', latest?.travel_fee_thb ?? 0, 'Onsite only'); travel.input.min = 0; travel.input.max = 20000;
    const branch = field('Coordinating center', 'select'); branchCache.branches.forEach(b => { const o = el('option', b.name); o.value = b.id; branch.input.append(o); }); branch.input.value = latest?.branch_id || i.branch_id || user.branch || 'BKK01';
    const note = field('Note to customer', 'textarea', '', 'Optional, shown on the quotation'); note.input.maxLength = 500;
    const total = el('p', '', 'total');
    const calc = () => { const p = catalogCache.packages.find(x => x.id === pkg.input.value); total.textContent = p ? 'Total ' + money(p.price_thb * Number(people.input.value || 0) + Number(travel.input.value || 0)) : ''; };
    [pkg.input, people.input, travel.input].forEach(x => x.addEventListener('input', calc)); calc();
    const err = el('p', '', 'field-error'); err.hidden = true; err.setAttribute('role', 'alert');
    f.append(pkg.wrap, el('div', null, 'form-grid two'), venue.wrap, branch.wrap, note.wrap, total, err);
    f.children[1].append(people.wrap, travel.wrap, date.wrap, tm.wrap);
    f.append(el('p', inq.quotes.length ? 'Issuing creates a new version and supersedes the open one. The customer is notified.' : 'The customer is notified and can download and accept it.', 'small muted'),
      button('Issue quotation', async () => {
        err.hidden = true; if (!f.reportValidity()) return;
        try {
          await post('/staff/quotes', { ticket_id: ticketId, package_id: pkg.input.value, people: Number(people.input.value), date: date.input.value, time: tm.input.value, venue: venue.input.value, travel_fee_thb: Number(travel.input.value || 0), branch_id: branch.input.value, note: note.input.value });
          closeModal(); notice('Quotation issued to the customer.'); await openTicket(ticketId);
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      }, 'btn primary'));
    f.onsubmit = e => e.preventDefault();
    modal(inq.quotes.length ? 'Revise quotation' : 'Prepare quotation', f);
  }

  /* ------------------------------------------------------------ staff: appointments */
  function staffBookingRow(b, after) {
    const d = b.data, r = el('article', null, 'record'), h = el('div', null, 'record-head');
    h.append(el('h3', d.items.map(i => i.name).join(' + ')), ...bookingBadges(b));
    const meta = el('div', null, 'record-meta'); meta.append(el('span', new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + d.time), el('span', branchName(b.branch)), el('span', money(d.total_thb)), el('span', d.organization ? 'Organization' : 'Pays ' + ({ center: 'at the center', promptpay: 'by test PromptPay', card: 'by test card' }[d.payment_method] || 'at the center')), el('span', 'Ref ' + b.id.slice(-8)));
    if (b.state === 'requested' && d.requested_at) meta.append(el('span', 'Requested ' + ago(d.requested_at)));
    r.append(h, meta);
    const act = el('div', null, 'record-actions');
    if (b.state === 'requested') {
      act.append(button('Confirm appointment', async () => { await post('/staff/bookings/' + b.id + '/decision', { decision: 'confirm' }); notice('Confirmed. The customer was notified.'); await after(); }, 'btn sm primary'),
        button('Decline', () => {
          const n = el('form', null, 'form-grid'), why = field('Reason shown to the customer', 'textarea'); why.input.required = true; why.input.maxLength = 500;
          n.append(why.wrap, button('Decline request', async () => { if (!n.reportValidity()) return; await post('/staff/bookings/' + b.id + '/decision', { decision: 'decline', note: why.input.value }); closeModal(); notice('Declined. The customer was notified.'); await after(); }, 'btn danger'));
          n.onsubmit = e => e.preventDefault(); modal('Decline appointment request', n);
        }, 'btn sm danger'));
    }
    if (b.state === 'confirmed' && d.payment_status === 'pending' && d.payment_method === 'center' && !d.active_txn)
      act.append(button('Record payment at center', () => {
        const n = el('div', null, 'stack'); n.append(el('p', `Confirm you received ${money(d.total_thb)} for this simulated appointment. This creates an auditable demo receipt.`),
          button('Confirm receipt', async () => { await post('/staff/bookings/' + b.id + '/settle'); closeModal(); notice('Payment recorded.'); await after(); }, 'btn primary'));
        modal('Record center payment', n);
      }));
    if (isManager() && d.payment_status === 'paid')
      act.append(button('Approve full refund', () => {
        const n = el('form', null, 'form-grid'), why = field('Reason'); why.input.required = true; why.input.minLength = 3;
        n.append(why.wrap, el('p', `Refund ${money(d.total_thb)}. Test payments are refunded through the simulator or provider test mode; center payments create a demo refund record.`, 'small muted'),
          button('Confirm refund', async () => { if (!n.reportValidity()) return; const res = await post('/staff/bookings/' + b.id + '/refund', { reason: why.input.value }); closeModal(); notice('Refund status: ' + res.status); await after(); }, 'btn danger'));
        n.onsubmit = e => e.preventDefault(); modal('Approve refund', n);
      }, 'btn sm danger'));
    if (act.children.length) r.append(act);
    return r;
  }
  async function operationsView() {
    const box = el('div'); box.append(intro('Appointments', 'Confirm or decline requests, record center payments and approve refunds. Capacity and prices are checked on the server.'));
    if (!isStaff()) return staffSignIn(box);
    await loadBusiness();
    const d = await api('/staff/operations');
    const bar = el('div', null, 'toolbar');
    [['requested', 'Awaiting confirmation'], ['confirmed', 'Confirmed'], ['closed', 'Declined or cancelled'], ['all', 'All']].forEach(([v, t]) => {
      const n = v === 'all' ? d.bookings.length : v === 'closed' ? d.bookings.filter(b => ['declined', 'cancelled'].includes(b.state)).length : d.bookings.filter(b => b.state === v).length;
      const c = el('button', t + ' (' + n + ')', 'chip'); c.type = 'button'; c.setAttribute('aria-pressed', String(opsFilter === v)); c.onclick = () => { opsFilter = v; navigate('operations', false); }; bar.append(c);
    });
    bar.append(button('Refresh', () => navigate('operations', false), 'btn ghost sm'));
    box.append(bar);
    const rows = d.bookings.filter(b => opsFilter === 'all' || (opsFilter === 'closed' ? ['declined', 'cancelled'].includes(b.state) : b.state === opsFilter))
      .sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time));
    if (!rows.length) { box.append(empty('Nothing here', opsFilter === 'requested' ? 'No requests are waiting for confirmation.' : 'No appointments in this group.')); return box; }
    const list = el('div', null, 'record-list'); rows.forEach(b => list.append(staffBookingRow(b, () => navigate('operations', false)))); box.append(list);
    return box;
  }
  async function catalogAdmin() {
    const box = el('div'); box.append(intro('Catalog', 'Manager-only. Changes apply immediately to the website, the assistant and new previews. Confirmed appointments keep their agreed price.'));
    if (!isManager()) { box.append(empty('Manager access required', 'Ask a manager to change prices or availability.')); return box; }
    const d = await api('/staff/operations'); catalogCache = null;
    box.append(el('p', 'Catalog version ' + d.catalog.version, 'small muted'));
    const wrap = el('div', null, 'table-wrap'), table = el('table', null, 'data'), head = el('tr');
    ['Package', 'Segment', 'Price (THB)', 'Available', ''].forEach(h => head.append(el('th', h))); table.append(head);
    d.catalog.packages.forEach(p => {
      const tr = el('tr'), price = el('input', null, 'input'); price.type = 'number'; price.min = 1; price.max = 1000000; price.value = p.price_thb; price.setAttribute('aria-label', p.name + ' price in THB');
      const active = el('input'); active.type = 'checkbox'; active.checked = p.active !== false; active.setAttribute('aria-label', p.name + ' available');
      const status = el('span', '', 'tiny muted'); status.setAttribute('aria-live', 'polite');
      const save = button('Save package', async () => {
        if (!price.checkValidity()) { status.textContent = 'Enter 1–1,000,000.'; return; }
        const r = await api('/staff/catalog/' + p.id, { method: 'PUT', body: JSON.stringify({ price_thb: Number(price.value), active: active.checked }) });
        const fresh = await api('/catalog/search?segment=' + p.segment); const back = fresh.packages.find(x => x.id === p.id);
        status.textContent = back ? 'Saved · now ' + money(back.price_thb) + ' · ' + r.version : 'Saved · hidden from customers · ' + r.version;
      });
      const tdName = el('td'); tdName.append(el('strong', p.name), el('div', p.id, 'tiny muted'));
      const tdP = el('td'); tdP.append(price); const tdA = el('td'); tdA.append(active); const tdS = el('td'); tdS.append(save, status);
      tr.append(tdName, el('td', p.segment), tdP, tdA, tdS); table.append(tr);
    });
    wrap.append(table); box.append(wrap); return box;
  }
  async function channels() {
    const box = el('div'); box.append(intro('Channels and budget', 'Integration modes are decided by the server. Simulated channels run through the same adapters, queues and storage as real ones.'));
    if (!isManager()) { box.append(empty('Manager access required', '')); return box; }
    const [m, budget, out] = await Promise.all([api('/modes'), api('/staff/budget').catch(e => ({ error: e.message })), api('/staff/line-simulator/outbox')]);
    const t = el('div', null, 'table-wrap'), table = el('table', null, 'data'); const h = el('tr'); ['Integration', 'Mode'].forEach(x => h.append(el('th', x))); table.append(h);
    Object.values(m.modes).forEach(x => { const tr = el('tr'), td = el('td'); td.append(badge(x.mode.replaceAll('_', ' ').toLowerCase(), x.mode === 'LIVE_MODEL' || x.mode === 'PROVIDER_SANDBOX' ? 'ok' : x.mode === 'UNAVAILABLE' ? 'warn' : 'neutral')); tr.append(el('td', x.label), td); table.append(tr); });
    t.append(table);
    const b = el('section', null, 'card stack-sm'); b.append(el('h3', 'AI budget (project total)'));
    if (budget.error) b.append(el('p', budget.error, 'small'));
    else {
      const c = budget.cost, kv = el('dl', null, 'kv'); const row = (k, v) => kv.append(el('dt', k), el('dd', v));
      row('Cap', money(c.cap_thb) + ' for the whole project, not monthly'); row('Spent before this ledger', c.prior_spend_thb === null || c.prior_spend_thb === undefined ? 'Not set, so paid AI calls are blocked' : money(c.prior_spend_thb));
      row('Settled in ledger', c.available ? c.settled_thb.toFixed(4) + ' THB' : 'Unavailable'); row('Reserved now', c.available ? c.reserved_thb.toFixed(4) + ' THB' : 'Unavailable'); row('Remaining', c.remaining_thb === null || c.remaining_thb === undefined ? 'Unknown' : c.remaining_thb.toFixed(2) + ' THB');
      row('Calls', String(c.calls ?? 0)); row('Priced models', (c.priced_models || []).join(', ') || 'None configured'); row('Provider network', budget.network_enabled ? 'Enabled' : 'Disabled');
      const hc = budget.hosted_calls;
      if (hc) row('Call cap (saved in the database)', hc.cycle ? `${hc.used} of ${hc.limit} calls used in cycle ${hc.cycle}` : 'Set PROVIDER_BUDGET_CYCLE_ID and CLOUD_CALL_LIMIT to allow AI calls');
      b.append(kv);
    }
    const sim = el('section', null, 'card stack'); sim.append(el('h3', 'LINE channel simulator'), el('p', 'Sends a LINE-shaped, signed webhook event through the real verification, queue and worker. Replies are stored as simulated deliveries; nothing is sent to LINE.', 'small muted'));
    const f = el('form', null, 'form-grid'), uid = field('Simulated LINE user ID', 'text', 'Usim' + Math.random().toString(16).slice(2, 12)), text = field('Message', 'textarea');
    uid.input.pattern = 'Usim[0-9a-f]{8,32}'; text.input.required = true; text.input.maxLength = 2000;
    f.append(uid.wrap, text.wrap);
    const row = el('div', null, 'form-actions');
    row.append(button('Send as LINE user', async () => { if (!f.reportValidity()) return; const r = await post('/staff/line-simulator/events', { line_user_id: uid.input.value, text: text.input.value }); notice('Queued event ' + r.event_id.slice(-6) + '. Run the worker to process it.'); text.input.value = ''; await navigate('channels', false); }, 'btn primary sm'),
      button('Run worker once', async () => { const r = await post('/staff/line-simulator/run'); notice(r.processed ? 'Processed one job.' : r.failed ? 'The job failed; see its error code below.' : 'No pending jobs.'); await navigate('channels', false); }, 'btn sm'));
    f.append(row); f.onsubmit = e => e.preventDefault(); sim.append(f);
    const jt = el('div', null, 'table-wrap'), jtable = el('table', null, 'data'); const jh = el('tr'); ['Job', 'State', 'Error', 'Created'].forEach(x => jh.append(el('th', x))); jtable.append(jh);
    out.jobs.slice().reverse().forEach(j => { const tr = el('tr'); tr.append(el('td', j.kind + ' …' + j.id.slice(-6)), el('td', j.state), el('td', j.error_code || 'None'), el('td', when(j.created))); jtable.append(tr); });
    if (!out.jobs.length) { const tr = el('tr'); const td = el('td', 'No LINE jobs yet.'); td.colSpan = 4; tr.append(td); jtable.append(tr); }
    jt.append(jtable);
    const dl = el('div', null, 'record-list'); out.deliveries.slice().reverse().forEach(x => { const r = el('article', null, 'notice-item'); r.append(el('strong', 'To ' + x.to), el('span', x.text, 'small'), el('time', when(x.at))); dl.append(r); });
    if (!out.deliveries.length) dl.append(el('p', 'No simulated deliveries yet.', 'small muted'));
    sim.append(el('h4', 'Jobs'), jt, el('h4', 'Simulated deliveries'), dl);
    box.append(t, b, sim); return box;
  }

  /* ------------------------------------------------------------ staff: customers and payments */
  let customerQuery = '', payState = '';
  async function customersView() {
    const box = el('div'); box.append(intro('Customers', 'People with an appointment, case, quotation or payment at your center' + (isManager() ? 's' : '') + '. Report values and chat text stay private; read a conversation through its case.'));
    if (!isStaff()) return staffSignIn(box);
    const bar = el('form', null, 'toolbar'); bar.setAttribute('role', 'search');
    const q = el('input', null, 'input'); q.type = 'search'; q.placeholder = 'Search by email'; q.maxLength = 80; q.value = customerQuery; q.setAttribute('aria-label', 'Search customers');
    const count = el('span', '', 'small muted'); count.setAttribute('aria-live', 'polite');
    bar.append(q, button('Search', () => bar.requestSubmit(), 'btn sm'), count); box.append(bar);
    const wrap = el('div', null, 'table-wrap'); box.append(wrap);
    async function load() {
      customerQuery = q.value; wrap.setAttribute('aria-busy', 'true');
      try {
        const d = await api('/staff/customers?' + new URLSearchParams({ q: q.value }));
        count.textContent = d.total + (d.total === 1 ? ' customer' : ' customers');
        if (!d.customers.length) { wrap.replaceChildren(empty(q.value ? 'No customer matches' : 'No customers yet', q.value ? 'Try part of the email address.' : 'Customers appear after their first request or case.')); return; }
        const t = el('table', null, 'data'), h = el('tr');
        [['Customer', ''], ['Appointments', 'n'], ['Awaiting', 'n'], ['Open cases', 'n'], ['Paid (simulated)', 'n'], ['Last activity', '']].forEach(([x, c]) => { const th = el('th', x, c); th.scope = 'col'; h.append(th); }); t.append(h);
        d.customers.forEach(c => {
          const tr = el('tr', null, 'clickable'), who = el('td'), open = el('button', c.label, 'link-btn'); open.type = 'button'; open.onclick = () => customerDetail(c.id);
          who.append(open, el('span', c.channel, 'sub')); tr.onclick = e => { if (e.target !== open) customerDetail(c.id); };
          const aw = el('td', null, 'n'); aw.append(c.requested ? badge(String(c.requested), 'warn') : document.createTextNode('0'));
          tr.append(who, el('td', String(c.bookings), 'n'), aw, el('td', String(c.open_cases), 'n'), el('td', money(c.paid_thb), 'n'), el('td', c.last_activity ? ago(c.last_activity) : 'Not yet'));
          t.append(tr);
        });
        wrap.replaceChildren(t);
      } catch (e) { wrap.replaceChildren(empty('Customers could not be loaded', e.message, button('Try again', load))); }
      finally { wrap.removeAttribute('aria-busy'); }
    }
    bar.onsubmit = e => { e.preventDefault(); load(); };
    await load(); return box;
  }
  async function customerDetail(id) {
    let d; try { d = await api('/staff/customers/' + encodeURIComponent(id)); } catch (e) { notice(e.message, 'bad'); return; }
    const box = el('div', null, 'stack'), c = d.customer;
    box.append(el('p', c.channel + ' · reference ' + c.id.slice(-8), 'small muted'));
    const block = (title, rows, emptyText) => { const b = el('section', null, 'history-block'); b.append(el('h4', title)); if (!rows.length) b.append(el('p', emptyText, 'small muted')); rows.forEach(r => b.append(r)); box.append(b); };
    block('Appointments', d.bookings.slice().reverse().map(b => { const r = el('div', null, 'history-row'); r.append(el('strong', (b.items || []).map(i => i.name).join(' + ')), el('span', longDate(b.date) + ', ' + b.time), el('span', branchName(b.branch)), el('span', money(b.total_thb)), ...bookingBadges({ state: b.state, data: { payment_status: b.payment_status } })); return r; }), 'No appointments.');
    block('Cases', d.tickets.slice().reverse().map(t => { const r = el('div', null, 'history-row'); r.append(el('span', t.summary.slice(0, 80)), badge({ waiting: 'Waiting', staff: 'With staff', bot: 'With assistant', closed: 'Closed' }[t.state] || t.state, t.state === 'waiting' ? 'warn' : 'neutral'), button('Open case', async () => { closeModal(); activeTicket = t.id; ticketFilter = 'all'; await navigate('staff'); }, 'btn ghost sm')); return r; }), 'No cases.');
    block('Quotations', d.quotes.map(q => { const r = el('div', null, 'history-row'); r.append(el('strong', 'Version ' + q.version), el('span', q.people + ' people, ' + q.date), el('span', money(q.total_thb)), badge(q.state, q.state === 'accepted' ? 'ok' : q.state === 'offered' ? 'warn' : 'neutral'), link('PDF', '/api/business/quotes/' + encodeURIComponent(q.id) + '/document.pdf', 'btn ghost sm')); return r; }), 'No quotations.');
    block('Test payments', d.payments.slice().reverse().map(p => { const r = el('div', null, 'history-row'); r.append(el('span', p.reference), el('span', money(p.amount_thb)), el('span', { promptpay: 'Test PromptPay', card: 'Test card' }[p.method] || p.method), payBadge(p.state)); return r; }), 'No test payments.');
    box.append(el('p', d.reports.count ? d.reports.count + (d.reports.count === 1 ? ' report uploaded' : ' reports uploaded') + ', ' + d.reports.confirmed + ' confirmed. Values stay private to the customer.' : 'No reports uploaded.', 'small muted'));
    if (d.plan) box.append(el('p', 'Lab Report plan: ' + d.plan.plan_name + (d.plan.active ? ' until ' + new Date(d.plan.period_end * 1000).toLocaleDateString('en-GB') : '') + ' · AI readings used: ' + d.plan.ai_reads_used, 'small muted'));
    modal(c.label, box);
  }
  const PAY = { pending: ['Waiting for payment', 'warn'], succeeded: ['Succeeded', 'ok'], failed: ['Failed', 'bad'], expired: ['Expired', 'neutral'], cancelled: ['Cancelled', 'neutral'], refunded: ['Refunded', 'neutral'], center: ['Paid at center', 'ok'] };
  const payBadge = st => badge(...(PAY[st] || [st, 'neutral']));
  async function paymentsView() {
    const box = el('div'); box.append(intro('Payments', 'Test payments from the simulator and receipts recorded at the center. No real money moves in this release.'));
    if (!isStaff()) return staffSignIn(box);
    const all = await api('/staff/payments'), d = payState ? await api('/staff/payments?state=' + payState) : all;
    const ml = el('p', null, 'money-line');
    [['Succeeded', all.money.succeeded_thb], ['of which Plus', all.money.plus_thb || 0], ['Paid at center', all.money.center_thb], ['Refunded', all.money.refunded_thb]].forEach(([k, v]) => { const x = el('span'); x.append(document.createTextNode(k + ' '), el('strong', money(v), 'num')); ml.append(x); });
    const bar = el('div', null, 'toolbar');
    [['', 'All', all.payments.length], ...Object.entries(PAY).map(([k, [label]]) => [k, label, all.totals[k]])].filter(([k, , n]) => !k || n).forEach(([k, label, n]) => {
      const c = el('button', label + ' (' + n + ')', 'chip'); c.type = 'button'; c.setAttribute('aria-pressed', String(payState === k)); c.onclick = () => { payState = k; navigate('payments', false); }; bar.append(c);
    });
    bar.append(button('Refresh', () => navigate('payments', false), 'btn ghost sm'));
    box.append(ml, bar);
    if (!d.payments.length) { box.append(empty('No payments here', payState ? 'Nothing in this group.' : 'Payments appear after a customer pays a confirmed appointment.')); return box; }
    const wrap = el('div', null, 'table-wrap'), t = el('table', null, 'data'), h = el('tr');
    [['Time', ''], ['Customer', ''], ['Order', ''], ['Method', ''], ['Amount', 'n'], ['State', ''], ['Reference', '']].forEach(([x, c]) => { const th = el('th', x, c); th.scope = 'col'; h.append(th); }); t.append(h);
    d.payments.forEach(p => {
      const tr = el('tr'), st = el('td'); st.append(payBadge(p.state));
      if (p.kind === 'subscription' && p.state === 'succeeded' && isManager()) st.append(button('Refund', () => {
        const n = el('div', null, 'stack'), reason = field('Reason (kept in the audit log)', 'text');
        n.append(el('p', 'A simulated refund ends this Plus period now. No real money moves.', 'small'), reason.wrap,
          button('Refund Plus period', async () => { if (!reason.input.value.trim()) { reason.input.focus(); return; } await post('/staff/subscriptions/' + p.booking_id + '/refund', { reason: reason.input.value.trim() }); closeModal(); notice('Plus refunded (simulation).'); await navigate('payments', false); }, 'btn danger'));
        modal('Refund LabClear Plus', n);
      }, 'btn sm ghost'));
      const ref = el('td'); ref.append(el('span', p.reference), el('span', p.events ? p.events + (p.events === 1 ? ' signed event' : ' signed events') : 'Recorded by staff', 'sub'));
      const order = el('td'); order.append(el('span', p.items.join(' + ') || 'Ref ' + p.booking_id.slice(-8))); if (p.kind === 'subscription') order.append(el('span', 'Lab Report subscription', 'sub'));
      tr.append(el('td', when(p.created)), el('td', p.customer), order, el('td', { promptpay: 'Test PromptPay', card: 'Test card', center: 'At the center' }[p.method] || p.method), el('td', money(p.amount_thb), 'n'), st, ref);
      t.append(tr);
    });
    wrap.append(t); box.append(wrap); return box;
  }
  async function navCounts() {
    if (!STAFF_MODE || !isStaff()) return;
    try {
      const d = await api('/staff/dashboard?days=1'), set = (id, n) => { const e = $(id); e.textContent = String(n); e.hidden = !n; };
      set('nav-requested', d.bookings.by_state.requested); set('nav-waiting', d.tickets.waiting);
    } catch { /* counts are a convenience */ }
  }

  /* ------------------------------------------------------------ staff: overview dashboard */
  const RAMP = [0, 1, 2, 3, 4]; // steps of the sequential capacity ramp; colours are theme tokens (.heat-N)
  const rampStep = u => u <= 0 ? 0 : u < .25 ? 1 : u < .5 ? 2 : u < .75 ? 3 : 4;
  let dashBranch = '', dashDays = 7;
  function tile(label, value, sub, onClick) {
    const t = el(onClick ? 'button' : 'div', null, 'kpi'); if (onClick) { t.type = 'button'; t.onclick = onClick; }
    t.append(el('span', label, 'kpi-label'), el('strong', value, 'kpi-value num')); if (sub) t.append(el('span', sub, 'kpi-sub'));
    return t;
  }
  async function overview() {
    const box = el('div');
    if (!isStaff()) return staffSignIn(box);
    await loadBusiness();
    const [d, ops] = await Promise.all([api('/staff/dashboard?' + new URLSearchParams({ branch: dashBranch, days: dashDays })), api('/staff/operations')]);
    const bar = el('div', null, 'toolbar');
    if (isManager()) {
      const sel = el('select', null, 'input'); sel.setAttribute('aria-label', 'Center');
      [['', 'All centers'], ...branchCache.branches.map(b => [b.id, b.name])].forEach(([v, t]) => { const o = el('option', t); o.value = v; sel.append(o); });
      sel.value = dashBranch; sel.onchange = () => { dashBranch = sel.value; navigate('overview', false); }; bar.append(sel);
    } else bar.append(badge('Your center: ' + branchName(d.scope[0]), 'neutral'));
    const days = el('select', null, 'input'); days.setAttribute('aria-label', 'Days ahead');
    [[7, 'Next 7 open days'], [14, 'Next 14 open days']].forEach(([v, t]) => { const o = el('option', t); o.value = v; days.append(o); });
    days.value = String(dashDays); days.onchange = () => { dashDays = Number(days.value); navigate('overview', false); };
    bar.append(days, el('span', 'Updated ' + new Date(d.generated_at * 1000).toLocaleTimeString('en-GB'), 'small muted'), button('Refresh', () => navigate('overview', false), 'btn ghost sm'));
    box.append(intro('Overview', 'Every number is computed from stored appointments, cases, quotations and payments. Money values are simulated.'), bar);
    // Decision of the day: requests that only a person can confirm, oldest first, with the real actions inline.
    const waiting = ops.bookings.filter(b => b.state === 'requested' && (!dashBranch || b.branch === dashBranch)).sort((a, b) => (a.data.requested_at || 0) - (b.data.requested_at || 0));
    const decide = el('section', null, 'decide'), dh = el('div', null, 'decide-head');
    dh.append(el('h3', waiting.length ? waiting.length + (waiting.length === 1 ? ' request waits for you' : ' requests wait for you') : 'No requests are waiting'), el('span', waiting.length ? 'Oldest first. The customer is notified of either decision.' : 'New appointment requests appear here first.', 'small muted'));
    decide.append(dh);
    if (waiting.length) {
      const list = el('div', null, 'record-list'); waiting.slice(0, 4).forEach(b => list.append(staffBookingRow(b, () => navigate('overview', false)))); decide.append(list);
      if (waiting.length > 4) { const more = el('p', null, 'small'); more.style.padding = '0 0 14px'; more.append(button('See all ' + waiting.length + ' requests', () => { opsFilter = 'requested'; navigate('operations'); }, 'link-btn')); decide.append(more); }
    } else decide.style.paddingBottom = '18px';
    box.append(decide);
    const kpis = el('div', null, 'kpi-grid');
    kpis.append(
      tile('Awaiting confirmation', String(d.bookings.by_state.requested), d.bookings.by_state.requested ? (d.bookings.awaiting_oldest_minutes < 1 ? 'Oldest just now' : 'Oldest ' + d.bookings.awaiting_oldest_minutes + ' min') : 'Nothing waiting', () => { opsFilter = 'requested'; navigate('operations'); }),
      tile('Upcoming confirmed', String(d.bookings.upcoming_confirmed), 'From today'),
      tile('Open cases', String(d.tickets.open), d.tickets.waiting + ' waiting for a person', () => navigate('staff')),
      tile('Median first reply', d.tickets.median_first_response_minutes === null ? 'None yet' : d.tickets.median_first_response_minutes + ' min', 'From case creation to a staff reply'),
      tile('Paid (simulated)', money(d.money.paid_thb), 'Refunded ' + money(d.money.refunded_thb)),
      tile('Confirmed, unpaid', money(d.money.unpaid_confirmed_thb), 'Pay at center or test payment'));
    box.append(kpis);
    const grid = el('div', null, 'dash-grid');
    // Funnel: one series, magnitude -> horizontal bars with direct labels.
    const funnel = el('section', null, 'card stack-sm'); funnel.append(el('h3', 'Individual appointments'), el('p', 'Requests that reached confirmation and payment.', 'small muted'));
    const max = Math.max(1, d.funnel.requested);
    [['Requested', d.funnel.requested], ['Confirmed', d.funnel.confirmed], ['Paid', d.funnel.paid]].forEach(([label, n]) => {
      const row = el('div', null, 'bar-row'), track = el('div', null, 'bar-track'), fill = el('span', null, 'bar-fill');
      fill.style.width = (n / max * 100) + '%'; fill.title = label + ': ' + n; track.append(fill);
      row.append(el('span', label, 'small'), track, el('strong', String(n), 'num')); funnel.append(row);
    });
    // Capacity heat strip: sequential single hue, value printed in every cell, legend + caption.
    const cap = el('section', null, 'card stack-sm'); cap.append(el('h3', 'Capacity used'), el('p', 'Requested and confirmed visits against slots (18 half-hours × visits per slot), Monday to Saturday.', 'small muted'));
    const tableWrap = el('div', null, 'heat-wrap'), t = el('table', null, 'heat'); t.setAttribute('aria-label', 'Capacity used per center and day');
    const hr = el('tr'); hr.append(el('th', 'Center')); (d.capacity[0]?.days || []).forEach(x => { const th = el('th', new Date(x.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })); th.scope = 'col'; hr.append(th); }); hr.append(el('th', 'Used')); t.append(hr);
    d.capacity.forEach(b => {
      const tr = el('tr'), th = el('th', b.name.replace(' Demo Center', '')); th.scope = 'row'; tr.append(th);
      b.days.forEach(x => { const u = x.capacity ? x.used / x.capacity : 0, step = rampStep(u), td = el('td', x.used + '/' + x.capacity, 'num heat-' + step); td.title = `${b.name}, ${x.date}: ${x.used} of ${x.capacity} visits`; tr.append(td); });
      tr.append(el('td', Math.round(b.utilization * 100) + '%', 'num strong')); t.append(tr);
    });
    tableWrap.append(t);
    const legend = el('div', null, 'legend small'); legend.append(el('span', 'Less'));
    RAMP.forEach(n => { const sw = el('span', null, 'swatch heat-' + n); sw.setAttribute('aria-hidden', 'true'); legend.append(sw); }); legend.append(el('span', 'More used'));
    cap.append(tableWrap, legend);
    const pay = el('section', null, 'card stack-sm'); pay.append(el('h3', 'Test payments'), el('p', 'Simulator transactions by outcome. No real money.', 'small muted'));
    const pt = el('table', null, 'data compact'); Object.entries(d.money.test_payments).forEach(([k, v]) => { const tr = el('tr'); tr.append(el('td', (PAY[k] || [k])[0]), el('td', String(v), 'n')); pt.append(tr); }); pay.append(pt, button('Open payments', () => navigate('payments'), 'btn sm'));
    const q = el('section', null, 'card stack-sm'); q.append(el('h3', 'Organization quotations'));
    const qt = el('table', null, 'data compact'); [['Offered', d.quotes.offered], ['Accepted', d.quotes.accepted], ['Superseded', d.quotes.superseded], ['Accepted value', money(d.quotes.accepted_thb)]].forEach(([k, v]) => { const tr = el('tr'); tr.append(el('td', k), el('td', String(v), 'n')); qt.append(tr); }); q.append(qt);
    grid.append(funnel, cap, pay, q);
    if (isManager()) {
      const a = el('section', null, 'card stack-sm'); a.append(el('h3', 'Assistant'), el('p', 'Answers by role, and turns that could not be answered.', 'small muted'));
      const at = el('table', null, 'data compact'); const entries = Object.entries(d.assistant);
      if (!entries.length) a.append(el('p', 'No assistant answers yet.', 'small muted'));
      entries.forEach(([k, v]) => { const tr = el('tr'); tr.append(el('td', k), el('td', String(v), 'n')); at.append(tr); }); if (entries.length) a.append(at);
      a.append(button('Manage assistant roles', () => navigate('roles'), 'btn sm')); grid.append(a);
    }
    if (d.lab_reports) {
      const l = el('section', null, 'card stack-sm'); l.append(el('h3', 'AI Lab Report'), el('p', 'Company-wide. Plus is ฿' + d.lab_reports.price_thb + ' for 30 days (test payments).', 'small muted'));
      const lt = el('table', null, 'data compact');
      [['Plus active now', d.lab_reports.plus_active], ['Plus revenue (simulated)', money(d.lab_reports.plus_revenue_thb)], ['Plus refunded', money(d.lab_reports.plus_refunded_thb)], ['AI readings used', d.lab_reports.ai_reads], ['Reports confirmed', d.lab_reports.reports_confirmed]].forEach(([k, v]) => { const tr = el('tr'); tr.append(el('td', k), el('td', String(v), 'n')); lt.append(tr); });
      l.append(lt); grid.append(l);
    }
    box.append(grid); return box;
  }
  async function centersAdmin() {
    const box = el('div'); box.append(intro('Centers', 'Manager-only. Visits per half-hour slot apply to new requests immediately. Existing appointments are never cancelled by a change.'));
    if (!isManager()) { box.append(empty('Manager access required', '')); return box; }
    branchCache = await api('/branches');
    const wrap = el('div', null, 'table-wrap'), t = el('table', null, 'data'), h = el('tr'); ['Center', 'Area', 'Hours', 'Visits per slot', ''].forEach(x => h.append(el('th', x))); t.append(h);
    branchCache.branches.forEach(b => {
      const tr = el('tr'), inp = el('input', null, 'input'); inp.type = 'number'; inp.min = 1; inp.max = 20; inp.value = b.capacity_per_slot; inp.setAttribute('aria-label', b.name + ' visits per slot'); inp.style.maxWidth = '110px';
      const st = el('span', '', 'tiny muted'); st.setAttribute('aria-live', 'polite');
      const save = button('Save', async () => { if (!inp.checkValidity()) { st.textContent = 'Use 1–20.'; return; } const r = await api('/staff/branches/' + b.id, { method: 'PUT', body: JSON.stringify({ capacity_per_slot: Number(inp.value) }) }); st.textContent = 'Saved · ' + r.branch.capacity_per_slot + ' per slot · ' + r.version; branchCache = null; });
      const c1 = el('td'); c1.append(el('strong', b.name), el('div', b.id, 'tiny muted')); const c4 = el('td'); c4.append(inp); const c5 = el('td'); c5.append(save, st);
      tr.append(c1, el('td', b.area), el('td', b.hours), c4, c5); t.append(tr);
    });
    wrap.append(t); box.append(wrap); return box;
  }
  async function rolesAdmin() {
    const box = el('div'); box.append(intro('Assistant roles', 'Two AI roles are routed automatically inside one conversation. Customers never choose a role. Permissions below are enforced by the server, not by the prompt.'));
    if (!isManager()) { box.append(empty('Manager access required', '')); return box; }
    const d = await api('/dots');
    const list = el('div', null, 'record-list');
    const full = { advisor: { actions: 'Answer, compare, quote preview, appointment request preview, payment preview, organization request, team handoff', ui: 'Open package, compare, filter catalog, prefill booking, open organization form', reads: 'Catalog, centers, policies, public medical sources, your own appointments' }, explainer: { actions: 'Answer, clarify, urgent referral, team handoff', ui: 'Highlight a report value, open a view', reads: 'Confirmed report values, public medical sources, policies. No catalog or prices.' } };
    d.dots.forEach(r => {
      const card = el('article', null, 'record'), head = el('div', null, 'record-head'), mk = el('span', r.name[0], 'dot-mark ' + r.id);
      head.append(mk, el('h3', r.name), badge(r.enabled ? 'On' : 'Paused', r.enabled ? 'ok' : 'warn'));
      const kv = el('dl', null, 'kv'); const row = (k, v) => kv.append(el('dt', k), el('dd', v));
      row('Role', r.role); row('Purpose', r.summary); if (full[r.id]) { row('Can propose', full[r.id].actions); row('Page shortcuts', full[r.id].ui); row('Can read', full[r.id].reads); }
      const act = el('div', null, 'record-actions');
      act.append(button(r.enabled ? 'Pause this role' : 'Turn on', async () => { await api('/staff/dots/' + r.id, { method: 'PUT', body: JSON.stringify({ enabled: !r.enabled }) }); notice(r.name + (r.enabled ? ' paused. Its questions go to the other role or our team.' : ' is on.')); await navigate('roles', false); }, r.enabled ? 'btn sm danger' : 'btn sm primary'));
      card.append(head, kv, act); list.append(card);
    });
    box.append(list, el('p', 'Pausing every role pauses AI replies; browsing, booking, payments and the team inbox keep working.', 'small muted'));
    return box;
  }
  async function auditView() {
    const box = el('div'); box.append(intro('Audit log', 'Who did what and when. Message contents and health data are never stored here.'));
    if (!isManager()) { box.append(empty('Manager access required', '')); return box; }
    const d = await api('/staff/audit?limit=150');
    if (!d.events.length) { box.append(empty('No events yet', '')); return box; }
    const wrap = el('div', null, 'table-wrap'), t = el('table', null, 'data'), h = el('tr'); ['Time', 'Actor', 'Action', 'Record'].forEach(x => h.append(el('th', x))); t.append(h);
    d.events.forEach(e => { const tr = el('tr'); tr.append(el('td', when(e.at)), el('td', e.actor_role + ' …' + e.actor), el('td', e.action), el('td', '…' + e.object)); t.append(tr); });
    wrap.append(t); box.append(wrap); return box;
  }

  /* ------------------------------------------------------------ navigation */
  const TITLES = { customers: 'Customers', payments: 'Payments', chat: 'Conversation', packages: 'Health checks', book: 'Request an appointment', bookings: 'My appointments', reports: 'My reports', labs: 'Lab dashboard', plan: 'Plan', history: 'Past conversations', notifications: 'Notifications', overview: 'Overview', staff: 'Inbox', operations: 'Appointments', 'catalog-admin': 'Catalog', centers: 'Centers', roles: 'Assistant roles', channels: 'Channels and budget', audit: 'Audit log' };
  const FACTORIES = { customers: customersView, payments: paymentsView, packages, book: bookView, bookings, reports, labs: labsView, plan: planView, history: historyView, notifications, overview, staff: staffView, operations: operationsView, 'catalog-admin': catalogAdmin, centers: centersAdmin, roles: rolesAdmin, channels, audit: auditView };
  const STAFF_ONLY = ['customers', 'payments', 'overview', 'operations', 'catalog-admin', 'centers', 'roles', 'channels', 'audit'];
  const mobile = matchMedia(STAFF_MODE ? '(max-width:860px)' : '(max-width:1100px)');
  function setMenu(open) { $('sidebar').classList.toggle('open', open); $('sidebar').inert = mobile.matches && !open; $('menu-toggle').setAttribute('aria-expanded', String(open)); $('menu-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); }
  async function navigate(next, push = true, params = {}) {
    if (!TITLES[next] || (STAFF_MODE && next === 'chat') || (!STAFF_MODE && STAFF_ONLY.includes(next))) next = STAFF_MODE ? 'overview' : 'chat';
    view = next; $('view-title').textContent = TITLES[next]; document.title = TITLES[next] + ' | LabClear';
    document.querySelectorAll('.nav-item').forEach(b => { const on = b.dataset.view === next; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    setMenu(false);
    if (push) { const u = new URL(location.href); u.search = ''; if (next !== (STAFF_MODE ? 'overview' : 'chat')) u.searchParams.set('view', next); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v)); window.history.pushState({ view: next }, '', u); }
    if ($('chat-view')) $('chat-view').hidden = next !== 'chat';
    $('content-view').hidden = next === 'chat';
    if (next === 'chat') { toBottom(); $('message').focus({ preventScroll: true }); return; }
    const content = $('content'); content.replaceChildren(el('div', null, 'skeleton')); content.setAttribute('aria-busy', 'true');
    try { content.replaceChildren(await FACTORIES[next](params)); }
    catch (e) { content.replaceChildren(empty('This view could not be loaded', e.message, button('Try again', () => navigate(next, false, params), 'btn sm'))); }
    finally { content.removeAttribute('aria-busy'); navCounts(); }
  }
  document.querySelectorAll('.nav-item[data-view]').forEach(b => { b.onclick = () => navigate(b.dataset.view); });
  $('menu-toggle').onclick = () => setMenu(!$('sidebar').classList.contains('open'));
  mobile.addEventListener('change', () => setMenu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('sidebar').classList.contains('open')) { setMenu(false); $('menu-toggle').focus(); } });
  window.addEventListener('popstate', () => { const p = new URLSearchParams(location.search); navigate(p.get('view') || (STAFF_MODE ? 'overview' : 'chat'), false, Object.fromEntries(p)); });

  /* ------------------------------------------------------------ connection and linking */
  async function connection() {
    try {
      modes = (await api('/modes')).modes;
      const online = modes.assistant.mode === 'LIVE_MODEL';
      $('connection-state').textContent = online ? 'Assistant online' : 'Assistant offline';
      $('connection-state').className = 'status-pill ' + (online ? 'ok' : 'off');
    } catch { $('connection-state').textContent = 'Status unavailable'; }
  }
  $('connection-state').onclick = () => {
    const n = el('div', null, 'stack');
    n.append(el('p', modes?.assistant.mode === 'LIVE_MODEL' ? 'The conversation model is connected. Replies pass safety and evidence checks before they appear.' : 'The conversation model is not connected or is paused. Browsing, booking, payments, reports review and our team still work; AI replies will show a clear error instead of an invented answer.', 'small'));
    if (modes) { const ul = el('ul', null, 'plain small'); Object.values(modes).forEach(x => { const li = el('li'); li.append(el('span', x.label + ': '), badge(x.mode.replaceAll('_', ' ').toLowerCase(), 'neutral')); ul.append(li); }); n.append(ul); }
    const f = field('Demo access code for this tab', 'password', '', 'Only if the deployment owner gave you one');
    n.append(f.wrap, button('Use access code', () => { accessCode = f.input.value; f.input.value = ''; closeModal(); notice('Access code set for this tab only.'); }, 'btn sm'), link('Connection settings', '/settings', 'small'));
    modal('Assistant and integrations', n);
  };
  async function checkLink() {
    const token = new URLSearchParams(location.search).get('link'); if (!token || STAFF_MODE) return;
    if (!user?.registered) { requireAccount('Sign in or create an account first, then open the link from your LINE chat again.'); return; }
    const n = el('div', null, 'stack');
    n.append(el('p', 'Link this LINE identity to your account and import its reports, appointments and conversation. Continue only if you requested this invitation from your own LINE chat.'),
      button('Confirm account linking', async () => { await post('/account/line/link', { token, consent: true }); window.history.replaceState({}, '', '/app'); closeModal(); notice('Your LINE conversation is linked.'); await refresh(); }, 'btn primary'));
    modal('Link your LINE conversation', n);
  }
  async function applyDeepLinks(p) {
    if (STAFF_MODE) return;
    const pkgName = id => catalogCache?.packages.find(x => x.id === id)?.name || id;
    if (p.has('package') && !p.get('view')) { await loadBusiness(); $('message').value = `Tell me about ${pkgName(p.get('package'))} (${p.get('package')}). Is it suitable for me?`; }
    if (p.has('ask')) { await loadBusiness(); $('message').value = `I am interested in ${pkgName(p.get('ask'))} (${p.get('ask')}). Can your team review whether it is suitable for me?`; }
    if (p.has('compare')) { await loadBusiness(); const ids = p.get('compare').split(',').slice(0, 3); $('message').value = `Please compare ${ids.map(i => `${pkgName(i)} (${i})`).join(' and ')} for me. What is different and which fits a general check-up?`; }
    if (p.get('topic') === 'organization') $('message').value = 'I would like to arrange health checks for my organization.';
    if (p.get('team') === '1') requestStaff();
    if (p.get('payment') === 'return') notice('Returned from checkout. Payment status updates when the provider confirms it.');
    if (p.has('q') && p.get('q').trim()) {
      const q = p.get('q').slice(0, 2000); window.history.replaceState({}, '', '/app'); // a reload must not resend
      if (state?.conversation.mode === 'bot') send(q); else $('message').value = q;
    }
    if (['package', 'ask', 'compare', 'topic'].some(k => p.has(k)) && !p.get('view')) { window.history.replaceState({}, '', '/app'); $('message').focus(); }
  }
  async function init() {
    setMenu(false);
    if (!STAFF_MODE && matchMedia('(max-width:640px)').matches) $('message').placeholder = 'Ask a question';
    const p = new URLSearchParams(location.search);
    try {
      const s = await api('/session'); csrf = s.csrf; updateUser(s.user);
      if (!STAFF_MODE) { await loadBusiness().catch(() => {}); await refresh(); syncFileInput(); } else setBell(0);
      await navigate(p.get('view') || view, false, Object.fromEntries(p));
      await checkLink(); await applyDeepLinks(p);
      if (STAFF_MODE && !isStaff()) account();
    } catch (e) { notice(e.message, 'bad'); if ($('chat-status')) $('chat-status').textContent = e.message; }
    connection(); pollBell();
  }
  async function pollList() {
    const list = $('staff-list'); if (!list || !isStaff()) return;
    const d = await api('/staff/inbox');
    const shown = d.tickets.filter(t => ticketFilter === 'all' || t.state !== 'closed').reverse();
    if (shown.length) list.replaceChildren(...shown.map(ticketButton));
  }
  async function pollStaff() {
    if (!isStaff() || $('modal').open) return;
    await pollList();
    if (activeTicket && $('staff-thread')) {
      const t = await api('/staff/tickets/' + activeTicket), messages = $('staff-thread').querySelector('.staff-messages');
      const content = JSON.stringify(t.conversation.messages);
      if (messages && messages.dataset.version !== content) { messages.replaceChildren(...t.conversation.messages.map(m => messageNode({ ...m, action: null }, false))); messages.dataset.version = content; messages.scrollTop = messages.scrollHeight; }
    }
  }
  init();
  setInterval(() => {
    if (document.hidden || busy || !csrf) return;
    if (view === 'chat' && !STAFF_MODE) refresh().catch(() => {});
    if (view === 'staff') pollStaff().catch(() => {});
  }, 4000);
  setInterval(() => { if (!document.hidden && csrf) pollBell(); }, 20000);
})();
