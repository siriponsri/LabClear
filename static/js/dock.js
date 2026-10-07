'use strict';
/* Assistant dock on every public page. Same conversation as /app; the page the visitor
   is viewing is sent as context. Shortcuts only navigate or prefill; the visitor confirms. */
(() => {
  if (document.body.dataset.noDock === 'true') return;
  const { render, act, icon, make } = window.RSTurns;
  const money = n => '฿' + new Intl.NumberFormat('en-US').format(n);
  let online = null, open = false, busy = false, controller = null, loaded = false, lastKey = '';
  let launcher, panel, list, input, status, sendBtn, stopBtn;

  function pageContext() {
    const ctx = { path: location.pathname.replace(/[^A-Za-z0-9/_-]/g, '').slice(0, 120) };
    const m = location.pathname.match(/^\/packages\/(P\d{2})$/); if (m) ctx.package_id = m[1];
    const ids = new URLSearchParams(location.search).get('ids');
    if (location.pathname === '/compare' && ids) ctx.compare_ids = ids.split(',').filter(x => /^P\d{2}$/.test(x)).slice(0, 3);
    return ctx;
  }
  function contextLine() {
    const c = pageContext();
    if (c.package_id) return 'Answers with ' + (document.querySelector('h1')?.textContent || c.package_id) + ' in mind.';
    if (c.compare_ids) return 'Answers with your comparison of ' + c.compare_ids.length + ' packages in mind.';
    if (c.path === '/packages') return 'Answers with the catalog you are browsing in mind.';
    if (c.path === '/organizations') return 'Answers with your organization request in mind.';
    return 'Replies in your language. General information, not a diagnosis.';
  }
  function shortcut(cmd) {
    const a = cmd.args || {};
    if (cmd.type === 'open_package') return act('Open ' + (a.name || a.package_id), 'open', null, '/packages/' + encodeURIComponent(a.package_id));
    if (cmd.type === 'open_compare') return act('Compare packages', 'compare', null, '/compare?ids=' + a.package_ids.map(encodeURIComponent).join(','));
    if (cmd.type === 'filter_catalog') { const p = new URLSearchParams(); ['q', 'segment', 'max_price'].forEach(k => { if (a[k]) p.set(k, a[k]); }); return act('Show matching packages', 'open', null, '/packages?' + p); }
    if (cmd.type === 'prefill_booking') { const p = new URLSearchParams({ view: 'book', package: a.package_id }); if (a.branch_id) p.set('branch', a.branch_id); if (a.date) p.set('date', a.date); return act('Book ' + (a.name || 'a checkup'), 'calendar', null, '/app?' + p); }
    if (cmd.type === 'open_org_form') return act('Organization request form', 'open', null, '/organizations#inq-title');
    if (cmd.type === 'highlight_report_field') return act('Show it on my report', 'value', null, '/app?view=reports');
    if (cmd.type === 'open_view') return act({ packages: 'Browse packages', book: 'Request an appointment', bookings: 'My appointments', reports: 'My reports', notifications: 'Notifications' }[a.view] || 'Open', 'open', null, a.view === 'packages' ? '/packages' : '/app?view=' + encodeURIComponent(a.view));
    return null;
  }
  function actionBlock(m) {
    const a = m.action; if (!['book', 'quote', 'handoff', 'pay'].includes(a.type)) return null;
    const box = make('div', null, 'callout'), label = { book: 'Send appointment request', quote: 'Keep this selection', handoff: 'Send to our team', pay: 'Open test payment' }[a.type];
    const summary = a.quote ? a.quote.items.map(x => x.name).join(' and ') + ', ' + money(a.quote.total_thb) + (a.type === 'book' ? ', ' + a.date + ' at ' + a.time : '') : (a.summary || '');
    if (summary) box.append(make('p', summary));
    if (a.type === 'book') box.append(make('p', 'This holds the slot as a request. Our team confirms it before any payment.', 'tiny muted'));
    const b = make('button', label, 'btn primary sm'); b.type = 'button';
    b.onclick = async () => {
      b.disabled = true;
      try { const r = await RS.post('/confirm', { action_id: m.action_id }); if (r.simulator_url || r.url) { location.assign(r.simulator_url || r.url); return; } status.textContent = a.type === 'book' ? 'Request sent. You will be notified when our team confirms it.' : 'Sent.'; lastKey = ''; await refresh(true); }
      catch (e) { status.textContent = e.code === 'account_required' ? 'Create an account or sign in first.' : e.message; if (e.code === 'account_required') { const l = make('a', 'Sign in in your workspace', 'btn sm'); l.href = '/app'; box.append(l); } }
      finally { b.disabled = false; }
    };
    box.append(b); return box;
  }
  const opts = () => ({ interactive: true, onRetry: retry, onShortcut: shortcut, onAction: actionBlock, onStaff: () => { location.href = '/app?team=1'; }, onFollowup: q => submit(q) });

  function build() {
    launcher = make('button', null, 'dock-launch'); launcher.type = 'button'; launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-expanded', 'false');
    const dot = make('span', null, 'speaker-dot'); dot.setAttribute('aria-hidden', 'true');
    launcher.append(dot, document.createTextNode('Ask LabClear'));
    launcher.addEventListener('click', () => toggle(true));
    panel = make('section', null, 'dock'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'dock-title'); panel.hidden = true;
    const head = make('div', null, 'dock-head'), top = make('div', null, 'row'), h = make('h2'); h.id = 'dock-title';
    const d2 = make('span', null, 'speaker-dot'); d2.setAttribute('aria-hidden', 'true'); h.append(d2, document.createTextNode('Ask LabClear'));
    const tools = make('div', null, 'row'), full = make('a', 'Open workspace'); full.href = '/app';
    const close = make('button', '×', 'icon-btn'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.onclick = () => toggle(false);
    tools.append(full, close); top.append(h, tools);
    head.append(top, make('p', contextLine(), 'dock-context'));
    list = make('div', null, 'dock-body'); list.setAttribute('aria-live', 'polite');
    const foot = make('div', null, 'dock-foot'), form = make('form');
    input = make('textarea'); input.rows = 1; input.maxLength = 4000; input.placeholder = 'Ask about a test, a package or a booking'; input.setAttribute('aria-label', 'Message');
    stopBtn = make('button', 'Stop', 'btn sm'); stopBtn.type = 'button'; stopBtn.hidden = true; stopBtn.onclick = async () => { controller?.abort(); try { await RS.post('/stop'); } catch { } };
    sendBtn = make('button', null, 'send-btn'); sendBtn.type = 'submit'; sendBtn.setAttribute('aria-label', 'Send'); sendBtn.append(icon('send'));
    form.append(input, stopBtn, sendBtn);
    status = make('p', '', 'tiny muted'); status.setAttribute('role', 'status');
    foot.append(status, form, make('p', 'General information, not a medical diagnosis.', 'tiny muted'));
    form.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    panel.append(head, list, foot);
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
    document.body.append(launcher, panel);
    document.querySelectorAll('[data-open-dock]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toggle(true); }));
  }
  async function toggle(want) {
    open = want; panel.hidden = !want; launcher.hidden = want; launcher.setAttribute('aria-expanded', String(want));
    document.body.classList.toggle('dock-open', want);
    if (want) { input.focus(); if (!loaded) { loaded = true; await refresh(true); } }
    else launcher.focus();
  }
  function empty() {
    const box = make('div', null, 'dock-empty');
    if (online === false) box.append(make('p', 'AI answers are switched off at the moment. You can still browse, book, and send a message to our team.', 'callout warn'));
    const c = pageContext(), prompts = c.package_id ? ['What does each test in this package measure?', 'Is this suitable for a yearly check-up?'] :
      c.compare_ids ? ['What is the real difference between these packages?'] : ['Which package fits a ฿1,500 budget?', 'What does a lipid profile include?', 'We need checks for 40 employees'];
    prompts.forEach(p => { const b = make('button', p, 'chip'); b.type = 'button'; b.onclick = () => submit(p); box.append(b); });
    return box;
  }
  async function refresh(scroll) {
    try {
      if (!RS.user) await RS.session();
      const w = await RS.call('/workspace');
      panel.querySelector('.dock-context').textContent = contextLine() + (w.user.registered ? '' : ' Temporary chat: refreshing, leaving or closing this page clears it.');
      const msgs = w.conversation.messages.slice(-10);
      const key = JSON.stringify(msgs) + w.conversation.mode; if (key === lastKey) return; lastKey = key;
      list.replaceChildren(...(msgs.length ? msgs.map((m, i) => render(m, { ...opts(), last: i === msgs.length - 1 })) : [empty()]));
      if (w.conversation.mode !== 'bot') list.append(make('p', w.conversation.mode === 'waiting' ? 'Your message is with our team. AI answers are paused until they reply.' : 'A person from our team is replying. AI answers are paused.', 'callout'));
      if (scroll) list.scrollTop = list.scrollHeight;
    } catch (e) { list.replaceChildren(make('p', e.message, 'callout bad')); }
  }
  async function submit(text) {
    if (busy || !text.trim()) return;
    busy = true; sendBtn.disabled = true; stopBtn.hidden = false; input.value = '';
    list.append(render({ role: 'user', content: text, at: Date.now() / 1000 }, {})); list.scrollTop = list.scrollHeight;
    status.textContent = 'Checking sources and safety before answering.';
    controller = new AbortController();
    try { if (!RS.user) await RS.session(); await RS.call('/chat', { method: 'POST', body: JSON.stringify({ message: text, page: pageContext() }), signal: controller.signal }); status.textContent = ''; }
    catch (e) { status.textContent = e.name === 'AbortError' ? 'Stopped. A late answer will not be added.' : e.message; }
    finally { busy = false; sendBtn.disabled = false; stopBtn.hidden = true; controller = null; lastKey = ''; await refresh(true); input.focus(); }
  }
  async function retry(id) {
    if (busy) return; busy = true; status.textContent = 'Retrying.';
    try { await RS.post('/chat/retry', { message_id: id }); status.textContent = ''; } catch (e) { status.textContent = e.message; }
    finally { busy = false; lastKey = ''; await refresh(true); }
  }
  fetch('/api/business/modes').then(r => r.json()).then(d => { online = d.modes.assistant.mode === 'LIVE_MODEL'; }).catch(() => { online = null; });
  build();
  setInterval(() => { if (open && !busy && !document.hidden && RS.user) refresh(false); }, 5000);
})();
