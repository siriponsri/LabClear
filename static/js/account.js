'use strict';
/* Website header: Sign in (with the demo accounts when they are on) or, once signed in, an account
   menu with the customer's places and Sign out. Uses /api/business/me, which never creates a session. */
(() => {
  const slot = document.querySelector('[data-account]'); if (!slot) return;
  const make = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  let me = { user: null, csrf: '', demo_accounts: [] };
  const STAFF = ['staff', 'manager', 'clinical'];

  async function load() {
    try { const r = await fetch('/api/business/me', { credentials: 'same-origin' }); if (r.ok) me = await r.json(); } catch { /* keep signed out */ }
    render();
  }
  async function send(path, body, csrf = '') {
    const r = await fetch('/api/business' + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Business-CSRF': csrf }, body: JSON.stringify(body || {}) });
    let d = {}; try { d = await r.json(); } catch { /* empty */ }
    if (!r.ok) throw Object.assign(Error(d.message || 'Please check your details and try again.'), { code: d.code });
    return d;
  }
  function after(user) { location.href = STAFF.includes(user.role) ? '/staff' : (location.pathname === '/' ? '/app' : location.href); }

  function render() {
    slot.replaceChildren();
    if (!me.user) {
      const b = make('button', 'Sign in', 'nav-signin nav-account-btn'); b.type = 'button'; b.onclick = openDialog; slot.append(b); return;
    }
    const u = me.user, b = make('button', null, 'nav-avatar'); b.type = 'button';
    b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Account: ' + u.email);
    b.append(make('span', u.email[0].toUpperCase(), 'avatar-letter'));
    const menu = make('div', null, 'account-pop'); menu.setAttribute('role', 'menu'); menu.hidden = true;
    const head = make('div', null, 'menu-head'); head.append(make('strong', u.email + (u.demo ? ' (demo)' : '')), make('span', STAFF.includes(u.role) ? (u.role === 'manager' ? 'Manager' : 'Staff') : 'Customer', 'tiny muted'));
    const link = (label, href) => { const a = make('a', label, 'menu-item'); a.href = href; a.setAttribute('role', 'menuitem'); return a; };
    const items = [link('Chat and lab reports', '/app'), link('My appointments', '/app?view=bookings'), link('My results', '/app?view=labs')];
    if (STAFF.includes(u.role)) items.push(link('Service desk', '/staff'));
    const out = make('button', 'Sign out', 'menu-item danger'); out.type = 'button'; out.setAttribute('role', 'menuitem');
    out.onclick = async () => { try { await send('/logout', {}, me.csrf); } finally { location.reload(); } };
    items.push(out); menu.append(head, ...items);
    const close = () => { menu.hidden = true; b.setAttribute('aria-expanded', 'false'); };
    b.onclick = () => { const open = menu.hidden; menu.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open) items[0].focus(); };
    document.addEventListener('click', e => { if (!e.target.closest('[data-account]')) close(); });
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); b.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = items.indexOf(document.activeElement); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    });
    slot.append(b, menu);
  }

  function openDialog() {
    let dlg = document.getElementById('signin-dialog');
    if (!dlg) { dlg = make('dialog', null, 'rs-dialog signin-dialog'); dlg.id = 'signin-dialog'; dlg.setAttribute('aria-labelledby', 'signin-title'); document.body.append(dlg); dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); }
    const head = make('div', null, 'dialog-head'), title = make('h2', 'Sign in to LabClear'), x = make('button', '×', 'icon-btn'); title.id = 'signin-title';
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => dlg.close(); head.append(title, x);
    const body = make('div', null, 'dialog-body stack'), err = make('p', '', 'field-error'); err.setAttribute('role', 'alert'); err.hidden = true;
    const fail = e => { err.textContent = e.message; err.hidden = false; };
    if (me.demo_accounts?.length) {
      const d = make('div', null, 'demo-accounts'), grid = make('div', null, 'demo-grid');
      d.append(make('p', 'Demo accounts, password 1234', 'small strong'));
      me.demo_accounts.forEach(a => {
        const b = make('button', null, 'demo-pick'); b.type = 'button'; b.setAttribute('aria-label', 'Sign in as ' + a.username + ', ' + a.label);
        b.append(make('strong', a.username), make('span', a.label, 'tiny muted'));
        b.onclick = async () => { try { after((await send('/login', { email: a.username, password: '1234' })).user); } catch (e) { fail(e); } };
        grid.append(b);
      });
      d.append(grid, make('p', 'Shared demonstration accounts: anyone can sign in with them.', 'tiny muted')); body.append(d);
    }
    const form = make('form', null, 'form-grid');
    const field = (label, type, auto) => { const w = make('div', null, 'field'), id = 'si-' + type, l = make('label', label), i = make('input', null, 'input'); l.htmlFor = id; i.id = id; i.type = type; i.required = true; i.autocomplete = auto; w.append(l, i); return { w, i }; };
    const email = field('Email or username', 'text', 'username'), pass = field('Password', 'password', 'current-password');
    pass.i.minLength = 4;
    const actions = make('div', null, 'form-actions'), signIn = make('button', 'Sign in', 'btn primary'), create = make('a', 'Create an account', 'btn');
    signIn.type = 'submit'; create.href = '/app'; actions.append(signIn, create);
    form.onsubmit = async e => { e.preventDefault(); err.hidden = true; try { after((await send('/login', { email: email.i.value, password: pass.i.value })).user); } catch (x2) { fail(x2); } };
    form.append(email.w, pass.w, err, actions, make('p', 'New here? Create an account from the sign-in button inside the app. You can also use LabClear without an account.', 'tiny muted'));
    body.append(form); dlg.replaceChildren(head, body); dlg.showModal(); (body.querySelector('.demo-pick') || email.i).focus();
  }
  load();
})();
