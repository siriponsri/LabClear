'use strict';
(() => {
  const root = document.querySelector('[data-txn]'); if (!root) return;
  const LOC = () => window.LC_I18N?.locale() || 'en-GB';   // dates follow the page language (static/js/i18n.js)
  const id = root.dataset.txn, panel = root.querySelector('[data-pay-panel]');
  const make = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const money = n => '฿' + new Intl.NumberFormat('en-US').format(n);
  const LABEL = { pending: ['Waiting for payment', 'warn'], succeeded: ['Paid (simulation)', 'ok'], failed: ['Payment failed', 'bad'], expired: ['Expired', 'neutral'], cancelled: ['Cancelled', 'neutral'], refunded: ['Refunded (simulation)', 'neutral'] };
  let timer = null;
  function render(t) {
    const [label, tone] = LABEL[t.state] || [t.state, 'neutral'];
    const head = make('div', null, 'row'); head.append(make('span', label, 'badge ' + tone), make('span', 'Simulated integration', 'badge sim'));
    const amount = make('p', money(t.amount_thb), 'amount');
    const meta = make('p', `${t.order_kind === 'subscription' ? 'LabClear Plus, 30 days · ' : ''}Reference ${t.reference} · ${t.method === 'promptpay' ? 'PromptPay test QR' : 'Test card'} · THB`, 'small muted');
    panel.replaceChildren(head, amount, meta);
    if (t.state === 'pending') {
      const left = Math.max(0, Math.round(t.expires_at - Date.now() / 1000));
      const qr = make('div', t.method === 'promptpay' ? 'Simulated QR code. It cannot be scanned or paid.' : 'Test card step. No card details are collected.', 'qr-sim');
      qr.setAttribute('role', 'img'); qr.setAttribute('aria-label', 'Placeholder for a simulated payment code; it cannot be used to pay');
      const clock = make('p', `Expires in ${Math.floor(left / 60)} min ${left % 60} s`, 'small');
      const actions = make('div', null, 'form-actions');
      [['success', 'Simulate successful payment', 'btn primary'], ['failure', 'Simulate a failure', 'btn'], ['expire', 'Let it expire', 'btn'], ['cancel', 'Cancel payment', 'btn ghost']]
        .forEach(([outcome, text, cls]) => { const b = make('button', text, cls); b.type = 'button'; b.onclick = () => act(outcome, b); actions.append(b); });
      panel.append(qr, clock, actions);
      clearTimeout(timer); timer = setTimeout(load, 15000);
    } else {
      const plus = t.order_kind === 'subscription';
      const back = make('a', plus ? 'Back to my plan' : 'Back to My appointments', 'btn primary'); back.href = plus ? '/app?view=plan' : '/app?view=bookings';
      const note = make('p', plus
        ? (t.state === 'succeeded' ? 'LabClear Plus is active for 30 days. No real money moved.' : t.state === 'refunded' ? 'A simulated refund ended Plus.' : 'Your plan did not change. You can start a new test payment.')
        : (t.state === 'succeeded' ? 'The appointment is marked as paid. No real money moved.' : t.state === 'refunded' ? 'A manager approved a simulated refund.' : 'The appointment remains unpaid. You can start a new test payment or pay at the center.'), 'small');
      panel.append(note, back);
    }
    const log = make('details'); log.append(make('summary', 'Signed events received (' + t.events.length + ')'));
    const ul = make('ul', null, 'plain small'); t.events.forEach(e => ul.append(make('li', new Date(e.at * 1000).toLocaleString(LOC()) + ' · ' + e.type))); log.append(ul);
    panel.append(log);
  }
  function fail(message, retry = true) {
    const box = make('div', null, 'state-box'); box.setAttribute('role', 'alert');
    box.append(make('h3', 'This test payment cannot be shown'), make('p', message, 'small muted'));
    const row = make('div', null, 'row');
    if (retry) { const b = make('button', 'Try again', 'btn'); b.type = 'button'; b.onclick = load; row.append(b); }
    const back = make('a', 'My appointments', 'btn primary'); back.href = '/app?view=bookings'; row.append(back);
    box.append(row); panel.replaceChildren(box);
  }
  async function load() {
    try { await RS.session(); render(await RS.call('/payments/simulator/' + encodeURIComponent(id))); }
    catch (e) { fail(e.status === 404 ? 'It does not exist or belongs to another account. Sign in with the account that started it.' : e.message, e.status !== 404); }
  }
  async function act(outcome, button) {
    panel.querySelectorAll('button').forEach(b => { b.disabled = true; }); button.setAttribute('aria-busy', 'true');
    try { const r = await RS.post('/payments/simulator/' + encodeURIComponent(id) + '/events', { outcome }); render(r.txn); }
    catch (e) { fail(e.message); }
  }
  load();
})();
