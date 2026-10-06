'use strict';
/* Website motion and navigation (v5). Everything here is progressive: without JavaScript
   the page is complete and readable; with reduced motion the same content appears without
   movement. Owns: scroll reveals, split headline, count-up, the product deck, the question
   marquee, scroll-lit statement, nav dropdown, search dialog (Ctrl/Cmd K) and the lazy
   Three.js hero. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const make = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  if (!reduced) root.classList.add('motion');

  /* ---------- header state ---------- */
  const header = $('.site-header');
  if (header) { const on = () => header.classList.toggle('scrolled', scrollY > 8); addEventListener('scroll', on, { passive: true }); on(); }

  /* ---------- split headline: words rise in sequence ---------- */
  $$('[data-split]').forEach(h => {
    if (reduced) return;
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.replaceChildren(...words.flatMap((w, i) => { const o = make('span', null, 'w'), inner = make('span', w); o.setAttribute('aria-hidden', 'true'); o.style.setProperty('--i', i); o.append(inner); return i < words.length - 1 ? [o, document.createTextNode(' ')] : [o]; }));
    requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add('is-in')));
  });

  /* ---------- reveals, demos, count-up ---------- */
  function countUp(el) {
    const end = Number(el.dataset.countup), prefix = el.dataset.prefix || '', fmt = n => prefix + new Intl.NumberFormat('en-US').format(n);
    if (reduced || !Number.isFinite(end)) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 1100;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(end * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const targets = $$('[data-reveal],[data-demo],[data-countup],.ladder');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      if (e.target.dataset.countup !== undefined) countUp(e.target);
      io.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach(t => io.observe(t));
  } else targets.forEach(t => t.classList.add('is-in'));

  /* ---------- statement: words light up as it scrolls through the viewport ---------- */
  $$('[data-words]').forEach(p => {
    const words = p.textContent.trim().split(/\s+/);
    p.setAttribute('aria-label', p.textContent.trim());
    const spans = words.map(w => { const s = make('span', w + ' ', 'lw'); s.setAttribute('aria-hidden', 'true'); return s; });
    p.replaceChildren(...spans);
    if (reduced) { spans.forEach(s => s.classList.add('on')); return; }
    let ticking = false;
    const update = () => {
      ticking = false; const r = p.getBoundingClientRect(), vh = innerHeight;
      const k = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.55 + r.height * 0.3)));
      const n = Math.round(k * spans.length); spans.forEach((s, i) => s.classList.toggle('on', i < n));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true }); update();
  });

  /* ---------- product deck: stacked cards with tabs, auto-advance that pauses ---------- */
  $$('[data-deck]').forEach(deck => {
    const tabs = $$('[role=tab]', deck), panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls'))).filter(Boolean);
    if (!panels.length) return;
    const bar = $('.deck-progress span', deck);
    let index = 0, timer = 0, paused = false, visible = false;
    deck.classList.add('stacked');
    const place = () => panels.forEach((p, i) => {
      const pos = (i - index + panels.length) % panels.length;
      p.hidden = false; p.dataset.pos = String(Math.min(pos, 3)); p.inert = pos !== 0;
      p.setAttribute('aria-hidden', String(pos !== 0)); p.classList.toggle('is-in', pos === 0);
    });
    const select = (i, focus) => {
      index = (i + panels.length) % panels.length;
      tabs.forEach((t, k) => { const on = k === index; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      place(); if (focus) tabs[index].focus(); restart();
    };
    const restart = () => {
      clearTimeout(timer);
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
      deck.classList.toggle('paused', paused || !visible || reduced);
      if (!paused && visible && !reduced) timer = setTimeout(() => select(index + 1), 6500);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(index + (e.key === 'ArrowRight' ? 1 : -1), true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); } if (e.key === 'End') { e.preventDefault(); select(panels.length - 1, true); }
      });
    });
    deck.addEventListener('pointerenter', () => { paused = true; restart(); });
    deck.addEventListener('pointerleave', () => { paused = false; restart(); });
    deck.addEventListener('focusin', () => { paused = true; restart(); });
    deck.addEventListener('focusout', e => { if (!deck.contains(e.relatedTarget)) { paused = false; restart(); } });
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; restart(); }, { threshold: 0.35 }).observe(deck);
    document.addEventListener('visibilitychange', () => { visible = !document.hidden && visible; restart(); });
    select(0);
  });

  /* ---------- question marquee: duplicated track, pauses on hover and focus ---------- */
  $$('[data-marquee]').forEach(m => {
    const track = $('.marquee-track', m); if (!track || reduced) { m.classList.add('static'); return; }
    const clone = track.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); $$('a', clone).forEach(a => { a.tabIndex = -1; });
    m.append(clone); m.classList.add('running');
  });

  /* ---------- nav dropdown ---------- */
  $$('.nav-drop').forEach(drop => {
    const btn = $('.nav-drop-btn', drop), menu = $('.nav-menu', drop); if (!btn || !menu) return;
    let hoverTimer = 0, hoverOpened = false;
    const set = open => { btn.setAttribute('aria-expanded', String(open)); menu.hidden = !open; drop.classList.toggle('open', open); if (!open) hoverOpened = false; };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      // A mouse that hovered the menu open should not close it again with the same click.
      if (hoverOpened) { hoverOpened = false; return; }
      set(menu.hidden); if (!menu.hidden && e.detail === 0) $('a', menu)?.focus({ preventScroll: true });
    });
    drop.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && matchMedia('(min-width:961px)').matches) { clearTimeout(hoverTimer); if (menu.hidden) { set(true); hoverOpened = true; } } });
    drop.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && matchMedia('(min-width:961px)').matches) hoverTimer = setTimeout(() => set(false), 160); });
    document.addEventListener('click', e => { if (!drop.contains(e.target)) set(false); });
    drop.addEventListener('keydown', e => {
      const links = $$('a', menu), i = links.indexOf(document.activeElement);
      if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); }
      if (e.key === 'ArrowDown' && !menu.hidden) { e.preventDefault(); links[(i + 1) % links.length].focus(); }
      if (e.key === 'ArrowUp' && !menu.hidden) { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
    });
    drop.addEventListener('focusout', e => { if (!drop.contains(e.relatedTarget)) set(false); });
  });

  /* ---------- search dialog ---------- */
  const dlg = $('#search-dialog');
  if (dlg) {
    const input = $('#search-input'), list = $('#search-results'), money = n => '฿' + new Intl.NumberFormat('en-US').format(n);
    const PAGES = [['Health checks', '/packages', 'packages catalog tests'], ['Compare packages', '/compare', 'compare side by side'], ['AI Lab Report', '/lab-reports', 'lab report ai read result plus subscription dashboard'],
      ['Lab dashboard', '/app?view=labs', 'dashboard trends results over time'], ['Plans and Plus', '/app?view=plan', 'plan plus price subscription 355'], ['Organizations', '/organizations', 'company team employees quotation'],
      ['Centers', '/centers', 'center branch location hours'], ['Help and policies', '/help', 'help refund cancel payment policy'], ['Medical sources', '/sources', 'sources references evidence'],
      ['Request a time', '/app?view=book', 'book appointment time'], ['My appointments', '/app?view=bookings', 'appointments booking pay'], ['Privacy', '/privacy', 'privacy data']];
    let items = [], active = -1, seq = 0, debounce = 0;
    const option = (title, sub, href, kind) => { const a = make('a', null, 'search-item'); a.href = href; a.setAttribute('role', 'option'); a.id = 'sr-' + Math.random().toString(36).slice(2, 8); a.append(make('span', kind, 'search-kind tiny'), make('strong', title), sub ? make('span', sub, 'tiny muted') : ''); return a; };
    const highlight = i => { active = i; items.forEach((it, k) => it.setAttribute('aria-selected', String(k === i))); if (items[i]) { input.setAttribute('aria-activedescendant', items[i].id); items[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant'); };
    async function run() {
      const q = input.value.trim(), mine = ++seq, ql = q.toLowerCase(), ask = [], packages = [], tail = [];
      if (q) ask.push(option('Ask the assistant: “' + q.slice(0, 60) + '”', 'Answers with sources', '/app?q=' + encodeURIComponent(q), 'Ask'));
      const pages = PAGES.filter(([t, , k]) => !q || (t + ' ' + k).toLowerCase().includes(ql)).slice(0, q ? 4 : 6).map(([t, h]) => option(t, '', h, 'Page'));
      if (q) {
        try {
          const r = await fetch('/api/business/catalog/search?' + new URLSearchParams({ q }), { credentials: 'same-origin' });
          const d = r.ok ? await r.json() : { packages: [] };
          if (mine !== seq) return;
          d.packages.slice(0, 6).forEach(p => packages.push(option(p.name, money(p.price_thb) + ' · ' + p.services.slice(0, 3).join(', '), '/packages/' + encodeURIComponent(p.id), 'Package')));
          if (!d.packages.length) tail.push(make('p', 'No package matches “' + q.slice(0, 40) + '”. Try a test name such as HbA1c or lipid.', 'search-empty small muted'));
        } catch { if (mine !== seq) return; tail.push(make('p', 'Package search is unavailable right now.', 'search-empty small muted')); }
      }
      if (mine !== seq) return;
      list.replaceChildren(...packages, ...ask, ...pages, ...tail); items = $$('[role=option]', list); highlight(items.length ? 0 : -1);
    }
    const open = () => { if (dlg.open) return; dlg.showModal(); input.value = ''; run(); input.focus(); };
    $$('[data-search-open]').forEach(b => b.addEventListener('click', open));
    document.addEventListener('keydown', e => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); dlg.open ? dlg.close() : open(); }
      else if (e.key === '/' && !dlg.open && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) { e.preventDefault(); open(); }
    });
    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(run, 140); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(0, active - 1)); }
    });
    $('[data-search-form]', dlg).addEventListener('submit', e => { e.preventDefault(); if (items[active]) location.href = items[active].href; });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- Three.js hero, loaded only when it can run well ---------- */
  const hero3d = $('[data-hero3d]');
  if (hero3d && !reduced && !(navigator.connection && navigator.connection.saveData)) {
    const load = () => import('/static/js/hero3d.js').catch(() => { /* the hero is complete without it */ });
    if (document.readyState === 'complete') ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 1500 }) : setTimeout(load, 300));
    else addEventListener('load', () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 1500 }) : setTimeout(load, 300)), { once: true });
  }
})();
