'use strict';
/* Public site behaviour: mobile navigation, hero tabs, comparison tray and live catalog
   filtering. Pages work without JavaScript (forms submit as GET); this enhances them. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const money = n => '฿' + new Intl.NumberFormat('en-US').format(n);

  /* ---------- mobile navigation ---------- */
  const toggle = $('.nav-toggle'), nav = $('#main-nav');
  if (toggle && nav) {
    const set = open => { nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
    document.addEventListener('click', e => { if (nav.classList.contains('open') && !e.target.closest('.nav-bar')) set(false); });
    toggle.addEventListener('click', () => set(!nav.classList.contains('open')));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); toggle.focus(); } });
  }

  /* ---------- hero tabs (WAI-ARIA tabs pattern) ---------- */
  $$('[data-tabs]').forEach(box => {
    const tabs = $$('[role=tab]', box);
    const select = (tab, focus) => {
      tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; document.getElementById(t.getAttribute('aria-controls')).hidden = !on; });
      if (focus) { tab.focus(); const field = document.getElementById(tab.getAttribute('aria-controls')).querySelector('textarea,input[type=search],input[type=text]'); if (field && focus === 'field') field.focus(); }
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, 'field'));
      t.addEventListener('keydown', e => {
        const vertical = box.hasAttribute('data-tabs-vertical') && matchMedia('(min-width:961px)').matches;
        const next = vertical ? 'ArrowDown' : 'ArrowRight', prev = vertical ? 'ArrowUp' : 'ArrowLeft';
        if (e.key === next || e.key === prev) { e.preventDefault(); select(tabs[(i + (e.key === next ? 1 : tabs.length - 1)) % tabs.length], true); }
      });
    });
  });
  const ask = $('#ask-q');
  if (ask) ask.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ask.value.trim()) ask.form.requestSubmit(); } });

  /* ---------- comparison tray (per-viewer convenience, sessionStorage) ---------- */
  const KEY = 'labclear-compare';
  const read = () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 3) : []; } catch { return []; } };
  const write = list => { try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: tray still works for this page */ } memory = list; };
  let memory = read();
  let tray = null, liveNote = null;
  function renderTray() {
    $$('[data-compare]').forEach(box => { box.checked = memory.some(x => x.id === box.dataset.compare); });
    if (!tray) {
      tray = el('aside', null, 'compare-tray'); tray.setAttribute('aria-label', 'Comparison');
      liveNote = el('span', '', 'sr-only'); liveNote.setAttribute('aria-live', 'polite');
      document.body.append(tray, liveNote);
    }
    tray.hidden = memory.length === 0 || !location.pathname.startsWith('/packages');
    document.body.classList.toggle('has-tray', !tray.hidden);
    tray.replaceChildren();
    const list = el('ul');
    memory.forEach(item => {
      const li = el('li'); const chip = el('button', null, 'chip'); chip.type = 'button';
      chip.append(document.createTextNode(item.name + ' '), el('span', '×', 'x'));
      chip.setAttribute('aria-label', 'Remove ' + item.name + ' from comparison');
      chip.addEventListener('click', () => { write(memory.filter(x => x.id !== item.id)); renderTray(); liveNote.textContent = item.name + ' removed from comparison'; });
      li.append(chip); list.append(li);
    });
    const go = el('a', memory.length < 2 ? 'Add one more to compare' : 'Compare ' + memory.length, 'btn primary sm');
    if (memory.length < 2) { go.setAttribute('aria-disabled', 'true'); go.removeAttribute('href'); }
    else go.href = '/compare?ids=' + memory.map(x => encodeURIComponent(x.id)).join(',');
    const clear = el('button', 'Clear', 'btn ghost sm'); clear.type = 'button';
    clear.addEventListener('click', () => { write([]); renderTray(); liveNote.textContent = 'Comparison cleared'; });
    tray.append(el('strong', 'Compare', 'small'), list, go, clear);
  }
  document.addEventListener('change', e => {
    const box = e.target.closest('[data-compare]'); if (!box) return;
    const id = box.dataset.compare, name = box.dataset.name;
    if (box.checked) {
      if (memory.length >= 3) { box.checked = false; liveNote && (liveNote.textContent = 'You can compare up to three. Remove one first.'); flash('You can compare up to three health checks. Remove one first.'); return; }
      write([...memory.filter(x => x.id !== id), { id, name }]);
      liveNote && (liveNote.textContent = name + ' added to comparison');
    } else write(memory.filter(x => x.id !== id));
    renderTray();
  });
  $$('[data-clear-compare]').forEach(b => b.addEventListener('click', () => { write([]); location.href = '/packages'; }));
  if (location.pathname === '/compare') {
    const ids = new URLSearchParams(location.search).get('ids');
    if (ids) { const names = $$('.compare-table thead a').map(a => a.textContent); write(ids.split(',').slice(0, 3).map((id, i) => ({ id, name: names[i] || id }))); }
  }
  renderTray();

  function flash(text) {
    let t = $('#site-toast');
    if (!t) { t = el('div', '', 'toast'); t.id = 'site-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = text; t.hidden = false; clearTimeout(flash.timer); flash.timer = setTimeout(() => { t.hidden = true; }, 5000);
  }

  /* ---------- live catalog ---------- */
  const catalog = $('[data-catalog]');
  if (!catalog) return;
  const form = $('#filters'), results = $('[data-results]'), section = $('.results'), countEl = $('[data-count]');
  const emptyBox = $('[data-empty]'), errorBox = $('[data-error]'), chips = $('[data-active-filters]');
  const branches = (JSON.parse($('#page-data').textContent || '{}').branches) || [];
  const LABELS = { segment: { individual: 'Individuals', organization: 'Organizations' }, review: { excluded: 'Book directly', only: 'Staff review first' } };
  let controller = null;

  function params() {
    const data = new FormData(form), p = new URLSearchParams();
    for (const [k, v] of data) if (v !== '' && !(k === 'sort' && v === 'featured')) p.set(k, v);
    return p;
  }
  const KIND = p => p.segment === 'organization' ? 'For organizations of 20 or more' : p.staff_review_required ? 'Follow-up test, reviewed with our team before booking' : 'Book directly';
  function card(p) {
    const a = el('article', null, 'pkg-row'); a.dataset.package = p.id;
    const head = el('div'), h = el('h3'), link = el('a', p.name); link.href = '/packages/' + encodeURIComponent(p.id); h.append(link);
    head.append(h, el('p', KIND(p), 'kind'));
    const ul = el('ul', null, 'pkg-tests'); ul.setAttribute('aria-label', 'Included tests'); p.services.forEach(s => ul.append(el('li', s)));
    const price = el('div', null, 'pkg-price'); price.append(el('strong', money(p.price_thb)), el('span', p.price_unit));
    const actions = el('div', null, 'pkg-actions'), label = el('label', null, 'compare-toggle'), box = el('input'); box.type = 'checkbox'; box.dataset.compare = p.id; box.dataset.name = p.name;
    label.append(box, document.createTextNode(' Compare')); actions.append(label);
    a.append(head, ul, price, actions); return a;
  }
  function renderChips(p) {
    chips.replaceChildren();
    const add = (key, text) => {
      const b = el('button', null, 'chip active'); b.type = 'button'; b.append(document.createTextNode(text + ' '), el('span', '×', 'x'));
      b.setAttribute('aria-label', 'Remove filter: ' + text);
      b.addEventListener('click', () => { const f = form.elements[key]; if (f instanceof RadioNodeList) { [...f].forEach(r => { r.checked = r.value === ''; }); } else f.value = ''; update(true); });
      chips.append(b);
    };
    if (p.get('q')) add('q', '“' + p.get('q') + '”');
    if (p.get('segment')) add('segment', LABELS.segment[p.get('segment')] || p.get('segment'));
    if (p.get('review')) add('review', LABELS.review[p.get('review')] || p.get('review'));
    if (p.get('max_price')) add('max_price', 'Up to ' + money(Number(p.get('max_price'))));
    if (p.get('branch_id')) add('branch_id', (branches.find(b => b.id === p.get('branch_id')) || {}).name || p.get('branch_id'));
  }
  async function update(push) {
    const p = params();
    renderChips(p);
    const url = '/packages' + (p.toString() ? '?' + p : '');
    if (push) history.pushState({}, '', url);
    controller?.abort(); controller = new AbortController();
    section.setAttribute('aria-busy', 'true'); errorBox.hidden = true;
    try {
      const r = await fetch('/api/business/catalog/search?' + p, { signal: controller.signal });
      const d = await r.json();
      if (!r.ok) throw Error(d.message || 'Results could not be loaded.');
      results.replaceChildren(...d.packages.map(card));
      countEl.textContent = d.total;
      countEl.parentElement.lastChild.textContent = ' result' + (d.total !== 1 ? 's' : '');
      emptyBox.hidden = d.total !== 0;
      const askEmpty = $('[data-ask-empty]'); if (askEmpty) askEmpty.href = '/app?q=' + encodeURIComponent('I am looking for a health check' + (p.get('q') ? ' that includes ' + p.get('q') : '') + '.');
      renderTray();
    } catch (e) {
      if (e.name === 'AbortError') return;
      $('[data-error-text]').textContent = e.message === 'Failed to fetch' ? 'You appear to be offline. Check your connection and try again.' : e.message;
      errorBox.hidden = false;
    } finally { section.removeAttribute('aria-busy'); }
  }
  let timer = null;
  form.addEventListener('submit', e => { e.preventDefault(); update(true); form.classList.remove('open'); $('.filters-open')?.setAttribute('aria-expanded', 'false'); });
  form.addEventListener('change', e => { if (e.target.name !== 'q') update(true); });
  form.elements.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => update(true), 350); });
  $('#sort').addEventListener('change', () => { form.elements.sort.value = $('#sort').value; update(true); });
  $('[data-retry]').addEventListener('click', () => update(false));
  $$('[data-reset]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); form.reset(); [...form.querySelectorAll('input[type=search]')].forEach(i => { i.value = ''; }); [...form.querySelectorAll('input[type=radio][value=""]')].forEach(r => { r.checked = true; }); form.elements.max_price.value = ''; form.elements.branch_id.value = ''; form.elements.sort.value = 'featured'; $('#sort').value = 'featured'; update(true); }));
  const filtersOpen = $('.filters-open');
  filtersOpen.addEventListener('click', () => { const open = form.classList.toggle('open'); filtersOpen.setAttribute('aria-expanded', String(open)); if (open) form.querySelector('input,select').focus(); });
  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(location.search);
    form.elements.q.value = p.get('q') || '';
    ['segment', 'review'].forEach(k => [...form.elements[k]].forEach(r => { r.checked = r.value === (p.get(k) || ''); }));
    form.elements.max_price.value = p.get('max_price') || ''; form.elements.branch_id.value = p.get('branch_id') || '';
    form.elements.sort.value = p.get('sort') || 'featured'; $('#sort').value = form.elements.sort.value;
    update(false);
  });
  renderChips(params());
})();
