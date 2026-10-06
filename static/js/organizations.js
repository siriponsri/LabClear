'use strict';
(() => {
  const form = document.getElementById('inquiry-form'); if (!form) return;
  const status = document.querySelector('[data-inquiry-auth]'), error = document.querySelector('[data-form-error]'), done = document.querySelector('[data-inquiry-done]');
  const make = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  let authBox = null;
  function showError(text) { error.textContent = text; error.hidden = !text; }
  function renderAuth() {
    const user = RS.user;
    if (user && user.registered) { status.textContent = 'Signed in as ' + user.email + '. The quotation will appear in your workspace.'; authBox?.remove(); authBox = null; return; }
    status.textContent = 'Sign in or create a free account so you can follow and accept the quotation.';
    if (authBox) return;
    authBox = make('div', null, 'auth-box stack-sm'); authBox.setAttribute('aria-label', 'Account');
    const email = make('input', null, 'input'); email.type = 'email'; email.autocomplete = 'email'; email.required = true;
    const pass = make('input', null, 'input'); pass.type = 'password'; pass.minLength = 12; pass.required = true; pass.autocomplete = 'current-password';
    const l1 = make('label', 'Email address', 'field'); l1.append(email);
    const l2 = make('label', 'Password (12+ characters)', 'field'); l2.append(pass);
    const row = make('div', null, 'form-actions');
    const go = kind => async () => {
      if (!email.checkValidity() || !pass.checkValidity()) { showError('Enter a valid email and a password of at least 12 characters.'); return; }
      try { showError(''); await RS.auth(kind, email.value, pass.value); renderAuth(); }
      catch (e) { showError(e.message); }
    };
    const signIn = make('button', 'Sign in', 'btn sm'); signIn.type = 'button'; signIn.onclick = go('login');
    const create = make('button', 'Create account', 'btn sm primary'); create.type = 'button'; create.onclick = go('register');
    row.append(create, signIn);
    authBox.append(make('p', 'Use a demonstration password. Do not reuse a real one.', 'tiny muted'), l1, l2, row);
    form.prepend(authBox);
  }
  RS.session().then(renderAuth).catch(e => { status.textContent = e.message; });
  form.addEventListener('submit', async e => {
    e.preventDefault(); showError('');
    if (!RS.user || !RS.user.registered) { showError('Sign in or create an account first.'); return; }
    const fields = ['organization', 'contact_name', 'headcount'];
    for (const name of fields) { const f = form.elements[name]; f.setAttribute('aria-invalid', String(!f.checkValidity())); }
    if (!form.checkValidity()) { showError('Please complete the highlighted fields. Teams start at 20 people.'); form.querySelector('[aria-invalid=true]')?.focus(); return; }
    const data = new FormData(form);
    const body = { organization: data.get('organization').trim(), contact_name: data.get('contact_name').trim(), headcount: Number(data.get('headcount')),
      service_mode: data.get('service_mode'), branch_id: data.get('branch_id'), preferred_date: data.get('preferred_date') || '',
      package_ids: data.getAll('package_ids'), notes: (data.get('notes') || '').trim() };
    const button = form.querySelector('button[type=submit]'); button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Sending…';
    try { await RS.post('/organizations/inquiries', body); form.hidden = true; done.hidden = false; done.querySelector('a').focus(); }
    catch (err) { showError(err.message); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = 'Send request'; }
  });
})();
