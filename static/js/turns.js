'use strict';
/* Shared renderer for conversation turns (public dock and customer workspace).
   Layout follows the owner's reference: speaker row with time, serif text, hairline
   between turns, a row of real actions under each answer. No chat bubbles. */
window.RSTurns = (() => {
  const make = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const ICONS = {
    source: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M10 12h5M10 15.5h5"/>',
    compare: '<path d="M5 19.5V11M10 19.5V5M15 19.5V9M20 19.5V13"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    staff: '<path d="M5 6.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4 3.5v-3.5H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/>',
    open: '<path d="M9 5H5.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V15M13 5h6v6M19 5l-8 8"/>',
    value: '<path d="M4 18h16M7 18V9M12 18V6M17 18v-5"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    check: '<path d="M12 3.5 5 6.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    attach: '<path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7 7a5 5 0 0 1-7-7L11 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    folder: '<path d="M3.5 7a1 1 0 0 1 1-1h4.6l2 2.2h8.4a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>',
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || ''; return svg;
  }
  function act(label, iconName, onClick, href) {
    const a = make(href ? 'a' : 'button', null, 'act'); if (href) a.href = href; else { a.type = 'button'; a.addEventListener('click', onClick); }
    a.append(icon(iconName), document.createTextNode(label)); return a;
  }
  const time = t => t ? new Date(t * 1000).toLocaleTimeString(window.LC_I18N?.locale() || 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  // Conversation text, model answers, report values and source titles stay in their own language.
  const keep = e => { e.setAttribute('translate', 'no'); return e; };
  function safeUrl(url) { try { const u = new URL(url, location.origin); return ['http:', 'https:'].includes(u.protocol) ? u : null; } catch { return null; } }
  /* Answers carry inline [source-id] markers (checked server-side against the cited evidence).
     They become numbered references that match the numbered source list under the answer. */
  function body(text, sources = []) {
    const d = keep(make('div', null, 'message-body'));
    if (window.DOMPurify && window.marked) d.innerHTML = DOMPurify.sanitize(marked.parse(text || ''), { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'], ALLOWED_ATTR: [] });
    else d.textContent = text || '';
    if (!sources.length) return d;
    const index = new Map(sources.map((x, i) => [x.id, i])), walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parts = [...node.textContent.matchAll(/\s?\[([a-z0-9][a-z0-9_-]+)\]/g)]; if (!parts.length) return;
      const frag = document.createDocumentFragment(); let at = 0;
      parts.forEach(m => {
        frag.append(document.createTextNode(node.textContent.slice(at, m.index)));
        const i = index.get(m[1]);
        if (i === undefined) frag.append(document.createTextNode(m[0]));
        else {
          const x = sources[i], u = safeUrl(x.url), c = make(u ? 'a' : 'span', String(i + 1), 'cite');
          if (u) { c.href = u.href; if (u.origin !== location.origin) { c.target = '_blank'; c.rel = 'noopener noreferrer'; } }
          c.title = x.title; c.setAttribute('aria-label', 'Source ' + (i + 1) + ': ' + x.title); frag.append(c);
        }
        at = m.index + m[0].length;
      });
      frag.append(document.createTextNode(node.textContent.slice(at))); node.replaceWith(frag);
    });
    return d;
  }
  /* Reference text printed on the user's own report, e.g. "70-99", "< 200", "> 40". Returns null when it
     cannot be drawn honestly; the value is then shown as text only. */
  function parseRange(ref) {
    const t = String(ref || '').replace(/,/g, '').trim(), num = '(-?\\d+(?:\\.\\d+)?)';
    let m = t.match(new RegExp('^' + num + '\\s*[-\u2013\u2014to]+\\s*' + num));
    if (m) return { lo: +m[1], hi: +m[2] };
    if ((m = t.match(new RegExp('^(?:<|\u2264|less than|up to)\\s*' + num, 'i')))) return { lo: null, hi: +m[1] };
    if ((m = t.match(new RegExp('^(?:>|\u2265|more than|at least)\\s*' + num, 'i')))) return { lo: +m[1], hi: null };
    return null;
  }
  const STATUS = { low: ['Below the printed range', 'warn'], high: ['Above the printed range', 'warn'], within: ['Within the printed range', 'ok'], unknown: ['No range to compare with', 'neutral'] };
  function observation(o) {
    const row = make('div', null, 'obs'), head = make('div', null, 'obs-head');
    head.append(keep(make('strong', (o.name || 'Value') + ' ' + o.value + (o.unit ? ' ' + o.unit : ''))), make('span', o.reference ? 'Range printed on your report: ' + o.reference : 'Your report prints no range for this value'));
    const [label, tone] = STATUS[o.status] || STATUS.unknown, b = make('span', label, 'badge ' + tone); head.append(b);
    row.append(head);
    const r = parseRange(o.reference), v = parseFloat(String(o.value).replace(/,/g, ''));
    if (r && Number.isFinite(v)) {
      const lo = r.lo ?? Math.min(0, v), hi = r.hi ?? Math.max(r.lo * 2, v), span = Math.max(hi - lo, 1e-9);
      const min = Math.min(lo - span * .35, v), max = Math.max(hi + span * .35, v), pos = x => ((x - min) / (max - min) * 100).toFixed(1) + '%';
      const ruler = make('div', null, 'obs-ruler'); ruler.setAttribute('role', 'img'); ruler.setAttribute('aria-label', o.value + ' ' + (o.unit || '') + ', ' + label.toLowerCase() + ' ' + o.reference);
      const band = make('span', null, 'band'); band.style.setProperty('--from', pos(r.lo ?? min)); band.style.setProperty('--to', pos(r.hi ?? max));
      const mark = make('span', null, 'mark'); mark.style.setProperty('--at', pos(v));
      ruler.append(band, mark);
      [r.lo, r.hi].forEach(x => { if (x !== null && x !== undefined) { const t = make('span', String(x), 'tick'); t.style.setProperty('--at', pos(x)); ruler.append(t); } });
      row.append(ruler);
    } else row.append(make('span', 'Not drawn: the printed range is not a simple number range.', 'no-ruler'));
    return row;
  }
  /* What actually ran before an answer was shown. Every step listed here passed; a failed step
     withholds the answer instead (server: business_agent.run). Newer answers carry the full
     step-by-step trace that was shown live while the assistant worked. */
  function receipt(c, m) {
    const ul = make('ul', null, 'receipt'); ul.hidden = true;
    if (m.trace?.length) {
      m.trace.forEach(x => { const li = make('li'), t = make('div'); t.append(make('span', x.label, 'step-label')); if (x.detail) t.append(make('span', x.detail, 'step-detail')); li.append(t); ul.append(li); });
      harness(c).forEach(li => ul.append(li));
      return ul;
    }
    const items = ['Safety check on your question', c.citations_validated ? 'Each claim matched to ' + c.citations_validated + (c.citations_validated === 1 ? ' cited source' : ' cited sources') : 'No source needed for this reply', 'Second review: supported, values unchanged, in scope', 'Safety check on the answer'];
    if (c.observations) items.splice(2, 0, c.observations + (c.observations === 1 ? ' report value' : ' report values') + ' matched exactly to your confirmed report');
    if (m.dot?.name) items.push('Answered by the ' + m.dot.name);
    items.forEach(t => ul.append(make('li', t)));
    return ul;
  }
  /* The harness behind this answer, as the server recorded it (checks.tools and checks.skills):
     which typed tools ran with which permission scope, and which reviewed instruction modules were
     loaded. Names and versions only: never arguments, data or hidden reasoning. */
  function harness(c) {
    const out = [];
    const line = (label, detail) => { const li = make('li', null, 'harness'), t = make('div'); t.append(make('span', label, 'step-label')); const d = make('span', detail, 'step-detail mono'); d.setAttribute('translate', 'no'); t.append(d); li.append(t); return li; };
    const tools = (c?.tools || []).filter(x => x.ok);
    if (tools.length) out.push(line('Typed tools run by the server', [...new Set(tools.map(x => `${x.tool} ${x.version || ''} (${x.scope})`.replace(' (', ' · ').replace(')', '')))].join(', ')));
    if (c?.skills) out.push(line('Runtime skills loaded', `${c.skills.package} · ${(c.skills.modules || []).join(', ')} · sha256 ${c.skills.sha256}`));
    return out;
  }
  /* Official hospital package pages the server attached to a package answer (never written by the
     model; never a LabClear price, booking or partnership). */
  function offers(list) {
    const box = make('div', null, 'external-offers');
    box.append(make('p', 'Packages on hospital websites', 'offers-title tiny'));
    list.forEach(o => {
      const u = safeUrl(o.url); if (!u || u.protocol !== 'https:') return;
      const a = make('a', null, 'offer-link'); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer';
      const thai = s => (/[\u0E01-\u0E5B]/.test(s || '') ? 'th' : 'en');
      const name = make('strong', o.hospital); name.lang = thai(o.hospital);
      const variant = make('span', o.variant, 'small'); variant.lang = thai(o.variant);
      const price = make('span', o.price_thb ? '฿' + new Intl.NumberFormat('en-US').format(o.price_thb) : '', 'num small');
      a.append(name, variant, price, make('span', ' (opens in a new tab)', 'sr-only')); box.append(a);
    });
    const note = make('p', null, 'tiny muted'); note.append(document.createTextNode('External links, separate from our simulated packages: no partnership or booking. Prices as shown on each page when checked ' + (list[0]?.checked_at || '') + '. '));
    const all = make('a', 'All hospital links'); all.href = '/hospital-links'; note.append(all); box.append(note);
    return box;
  }
  /* Files sent with a message: the report pages as thumbnails (served only to their owner). */
  function attachments(m, opts) {
    const box = make('div', null, 'attachments sent');
    (m.attachments || []).forEach(a => {
      const src = opts.privateFiles ? '' : a.preview || (a.report_id ? '/api/business/reports/' + encodeURIComponent(a.report_id) + '/source?page=' + (a.page || 1) : '');
      if (!src) { const f = make('span', null, 'file-chip'); f.append(icon('attach'), document.createTextNode(opts.privateFiles ? 'Lab report (private)' : (a.name || 'File'))); box.append(f); return; }
      const b = make('button', null, 'thumb'); b.type = 'button'; b.setAttribute('aria-label', 'Open ' + (a.name || 'image') + (a.page > 1 ? ', page ' + a.page : ''));
      const img = make('img'); if (opts.loadImage) opts.loadImage(img, src); else img.src = src; img.alt = ''; img.loading = 'lazy'; b.append(img);
      b.onclick = () => { if (img.getAttribute('src')) return opts.onImage ? opts.onImage(img.src, a) : window.open(img.src, '_blank', 'noopener'); };
      box.append(b);
    });
    return box;
  }
  const FAILED = { safety_blocked: 'Not answered: the safety check blocked this request.' };
  function failure(m, opts, onRetry) {
    const text = m.retryable ? 'Not answered yet.' : (FAILED[m.error] || 'Not answered.');
    const r = make('div', null, 'callout bad failure'); r.append(make('strong', text));
    if (m.error_message) r.append(make('span', ' ' + m.error_message, 'small'));
    else if (!m.retryable) r.append(make('span', ' Try rephrasing, or ask our team.', 'small'));
    if (opts.interactive && m.retryable && onRetry) { const b = make('button', 'Retry', 'btn sm'); b.type = 'button'; b.onclick = () => onRetry(m.id); r.append(b); }
    return r;
  }
  /* opts: {interactive, onRetry(id), onShortcut(cmd) -> element|null, onAction(msg) -> element|null, onStaff(), onFollowup(q),
           onReportCard(msg, last) -> element, onCardRetry(id), onImage(src, attachment)} */
  function render(m, opts = {}) {
    const turn = make('article', null, 'turn ' + (m.role === 'user' ? 'user' : m.role === 'staff' ? 'staff' : 'ai'));
    const head = make('div', null, 'turn-head');
    if (m.role === 'user') head.append(make('span', 'You', 'who'));
    else if (m.role === 'staff') head.append(make('span', 'LabClear team', 'who ai'), make('span', 'a person', 'role'));
    else { const dot = make('span', null, 'speaker-dot'); dot.setAttribute('aria-hidden', 'true'); head.append(dot, make('span', 'LabClear', 'who ai'), make('span', (m.dot?.name || 'Assistant') + ', AI', 'role')); }
    const t = make('time', time(m.at)); if (m.at) t.dateTime = new Date(m.at * 1000).toISOString(); head.append(t);
    turn.append(head);
    if (m.role === 'user') {
      if (m.attachments?.length) turn.append(attachments(m, opts));
      if (m.content) turn.append(keep(make('div', m.content, 'text')));
      if (m.failed) turn.append(failure(m, opts, opts.onRetry));
      return turn;
    }
    if (m.kind === 'report_read') {
      turn.append(opts.onReportCard ? opts.onReportCard(m, opts.last) : make('p', m.content, 'small muted'));
      if (m.failed) turn.append(failure(m, opts, opts.onCardRetry));
      return turn;
    }
    turn.append(body(m.content, m.sources || []));
    if (m.external_offers?.length) turn.append(offers(m.external_offers));
    if (m.observations?.length) { const l = make('div', null, 'obs-list'); l.setAttribute('aria-label', 'Report values in this answer'); m.observations.forEach(o => l.append(observation(o))); turn.append(l); }
    if (!opts.interactive) return turn;
    const actions = make('div', null, 'actions'), extra = make('div');
    if (m.sources?.length) {
      const list = make('div', null, 'sources'); list.hidden = true;
      m.sources.forEach((x, i) => { const a = keep(make('a')), u = safeUrl(x.url); a.append(make('span', String(i + 1), 'cite'), document.createTextNode(x.title + (x.publisher ? ', ' + x.publisher : ''))); if (u) { a.href = u.href; if (u.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } } list.append(a); });
      const b = act(m.sources.length === 1 ? 'View source' : 'View ' + m.sources.length + ' sources', 'source', () => { list.hidden = !list.hidden; b.setAttribute('aria-expanded', String(!list.hidden)); });
      b.setAttribute('aria-expanded', 'false'); actions.append(b); extra.append(list);
    }
    if (m.checks) { const r = receipt(m.checks, m); const b = act('How this was checked', 'check', () => { r.hidden = !r.hidden; b.setAttribute('aria-expanded', String(!r.hidden)); }); b.setAttribute('aria-expanded', 'false'); actions.append(b); extra.append(r); }
    (m.ui || []).forEach(c => { const el = opts.onShortcut && opts.onShortcut(c); if (el) actions.append(el); });
    if (opts.onAction && m.action && m.action_id) { const el = opts.onAction(m); if (el) extra.append(el); }
    // Step 4 of the journey, always the customer's choice: never offered automatically by the Explainer.
    if (opts.onFollowupCheck && opts.last && m.dot?.id === 'explainer') actions.append(act('Find a follow-up check', 'calendar', opts.onFollowupCheck));
    if (opts.onStaff && opts.last && m.role !== 'staff') actions.append(act('Ask our team', 'staff', opts.onStaff));
    if (m.followups?.length && opts.onFollowup) { const f = make('div', null, 'row'); m.followups.slice(0, 3).forEach(q => { const c = keep(make('button', q, 'chip')); c.type = 'button'; c.onclick = () => opts.onFollowup(q); f.append(c); }); extra.append(f); }
    if (actions.children.length) turn.append(actions);
    if (extra.children.length) turn.append(extra);
    return turn;
  }
  return { render, act, icon, make, parseRange, receipt };
})();
