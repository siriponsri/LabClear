'use strict';
/* Hub-only page state. No storage, API requests, account data or external calls. */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const t = s => window.LC_I18N?.t(s) || s;
  const tf = (s, v) => window.LC_I18N?.tf(s, v) || s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));
  const selected = new Set();
  const boxes = $$('[data-hub-select]');
  const tray = $('[data-hub-tray]');
  const status = $('[data-hub-feedback]');
  function renderSelection() {
    if (!tray) return;
    tray.hidden = !selected.size;
    $('[data-hub-selection-count]').textContent = tf('{n} demo packages selected', {n:selected.size});
    const link = $('[data-hub-compare-link]');
    link.href = '/hub/compare?ids=' + [...selected].map(encodeURIComponent).join(',');
    link.textContent = t(selected.size < 2 ? 'Add one more to compare' : 'Compare selected examples');
    link.setAttribute('aria-disabled', String(selected.size < 2));
  }
  boxes.forEach(box => box.addEventListener('change', () => {
    if (box.checked && selected.size >= 3) {
      box.checked = false;
      status.textContent = t('Choose at most three Hub packages.');
      return;
    }
    box.checked ? selected.add(box.dataset.hubSelect) : selected.delete(box.dataset.hubSelect);
    status.textContent = '';
    renderSelection();
  }));
  $('[data-hub-compare-link]')?.addEventListener('click', e => {
    if (selected.size < 2) {
      e.preventDefault();
      status.textContent = t('Choose two or three Hub packages');
    }
  });
  $('[data-hub-clear]')?.addEventListener('click', () => {
    selected.clear(); boxes.forEach(b => b.checked = false); status.textContent = ''; renderSelection();
    boxes[0]?.focus();
  });
  // Do not submit the empty option as an integer query parameter.
  $('.hub-filters')?.addEventListener('submit', e => {
    const price = e.currentTarget.elements.max_price;
    if (!price.value) price.disabled = true;
  });
  const form = $('[data-hub-inquiry]');
  const confirmation = $('[data-hub-confirmation]');
  let example = null;
  const times = {morning:'Morning',afternoon:'Afternoon'};
  const topics = {availability:'Ask about availability',included:'Ask what is included',preparation:'Ask about preparation'};
  function renderConfirmation() {
    if (!example) return;
    $('[data-hub-confirm-time]').textContent = t(times[example.time]);
    $('[data-hub-confirm-topic]').textContent = t(topics[example.topic]);
  }
  if (form) {
    $('[data-hub-simulate]').disabled = false;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const time = form.elements.time.value, topic = form.elements.topic.value;
      if (!Object.hasOwn(times, time) || !Object.hasOwn(topics, topic)) return;
      example = {time, topic}; renderConfirmation();
      form.hidden = true; confirmation.hidden = false; confirmation.focus();
    });
    $('[data-hub-inquiry-reset]').addEventListener('click', () => {
      example = null; form.reset(); confirmation.hidden = true; form.hidden = false;
      form.elements.time.focus();
    });
  }
  document.addEventListener('labclear:language', () => { renderSelection(); renderConfirmation(); });
})();
