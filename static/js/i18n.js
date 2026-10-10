'use strict';
/* LabClear interface language: Thai first, English on request.

   Templates and scripts are written in English. This file (loaded in <head>, before the body is
   parsed) translates every interface text node and the aria-label / placeholder / title / alt
   attributes into Thai with the shared dictionary (static/i18n/th.js, built from i18n/ by
   scripts/build_i18n.mjs). A MutationObserver translates what the parser and the page scripts
   add, before the browser paints it, so Thai pages never flash English. Switching language swaps
   the text in place (no reload): drafts, scroll position, open chats and dialogs stay as they are.

   A sentence that wraps links or emphasis ("Answers cite <a>58 records</a>. Not a clinic.") is
   translated as one unit: its key replaces each inline element with {0}, {1}... and the Thai
   template puts the same elements (with their listeners) back in Thai word order. When the
   dictionary has no such sentence, each text piece is translated on its own.

   Not translated: content marked translate="no" (chat messages, model answers, values read from a
   report, names people typed), elements that declare their own lang, form fields and code.
   Strings with values ("{n} tests") match {placeholder} templates in the dictionary.

   Window API: LC_I18N.lang, .locale(), .t(en), .tf(en, values), .set(lang), and the
   "labclear:language" event on document after a switch. The choice is kept in the
   "labclear_language" cookie, which the server reads to render <html lang>. */
(() => {
  const COOKIE = 'labclear_language';
  const TH = window.LC_TH || {};
  const root = document.documentElement;
  let lang = root.lang === 'en' ? 'en' : 'th';
  const INVISIBLE = /[⁠​]/g;
  const LATIN = /[A-Za-z]/;
  const THAI = /[ก-ฺเ-๛]/;
  const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
  const SKIP = 'script,style,noscript,template,textarea,code,pre,kbd,[translate="no"],[data-no-translate],[contenteditable=""],[contenteditable="true"]';

  /* ---------------------------------------------------------------- dictionary lookups */
  const norm = s => s.replace(/\s+/g, ' ').trim();
  // Thai -> English for text that was already Thai when it reached the page (first key wins).
  let reverse = null;
  const back = th => {
    if (!reverse) { reverse = new Map(); for (const [en, t] of Object.entries(TH)) { const k = norm(t.replace(INVISIBLE, '')); if (!reverse.has(k)) reverse.set(k, en); } }
    return reverse.get(norm(th.replace(INVISIBLE, '')));
  };
  // "{n} tests", "Signed events received ({n})": templates indexed by their literal start or end
  // (3 to 5 characters), or by their longest literal part when they start and end with a value.
  // The most specific template (most literal text) wins: "Remove filter: {name}" before "Remove {name}".
  let starts = null, ends = null, middles = null;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const put = (map, k, t) => { if (!map.has(k)) map.set(k, []); map.get(k).push(t); };
  function buildTemplates() {
    starts = new Map(); ends = new Map(); middles = [];
    for (const [en, th] of Object.entries(TH)) {
      if (!/\{\w+\}/.test(en)) continue;
      const lits = en.split(/\{\w+\}/);
      const letters = lits.join('').replace(/[^A-Za-z]/g, '').length;
      if (letters < 3) continue;   // "{a} {b}" alone is too vague
      const names = [];
      const re = new RegExp('^' + esc(en).replace(/\\\{(\w+)\\\}/g, (_, n) => (names.push(n), '([\\s\\S]+?)')) + '$');
      const longest = lits.reduce((a, b) => (b.length > a.length ? b : a), '');
      const t = { re, names, th, weight: lits.join('').length, longest };
      const head = lits[0].slice(0, 5), tail = lits[lits.length - 1].slice(-5);
      if (head.length >= 3) put(starts, head, t);
      else if (tail.length >= 3) put(ends, tail, t);
      else if (longest.trim().length >= 4) middles.push(t);
    }
  }
  function fromTemplate(text) {
    if (!starts) buildTemplates();
    const pool = [];
    for (let k = 3; k <= 5; k++) { pool.push(...(starts.get(text.slice(0, k)) || []), ...(ends.get(text.slice(-k)) || [])); }
    for (const t of middles) if (text.includes(t.longest)) pool.push(t);
    pool.sort((a, b) => b.weight - a.weight);
    for (const t of pool) {
      const m = text.match(t.re);
      if (!m) continue;
      const v = {};
      t.names.forEach((n, i) => { v[n] = TH[m[i + 1]] ?? m[i + 1]; });
      return t.th.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : `{${k}}`));
    }
    return null;
  }
  /** Thai for an English interface string, or null when the dictionary has none. */
  function toThai(en) {
    const key = norm(en);
    if (!key || !LATIN.test(key)) return null;
    return TH[key] ?? fromTemplate(key);
  }
  const t = en => (lang === 'th' ? toThai(en) ?? en : en);
  const tf = (en, values) => t(en).replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`));
  const keepSpace = (orig, out) => { const lead = orig.match(/^\s*/)[0], trail = orig.match(/\s*$/)[0]; return lead + out + trail; };

  /* ---------------------------------------------------------------- the DOM */
  const texts = new WeakMap();   // Text -> { en, th }
  const attrs = new WeakMap();   // Element -> { attr: { en, th } }
  function foreign(el) {
    if (el.closest('[translate="no"],[data-no-translate]')) return true;
    const own = el.closest('[lang]');
    return !!own && own !== root;   // a region that declares its own language keeps it
  }
  /** Text inside this element is left alone (content, code, form fields). */
  function excluded(el) {
    if (!el || el.nodeType !== 1) return true;
    return !!el.closest(SKIP) || foreign(el);
  }
  /** Attributes (placeholder, aria-label...) are interface text even on form fields. */
  const excludedAttr = el => !el || el.nodeType !== 1 || foreign(el);
  function applyText(node) {
    const cur = node.data;
    if (!cur || !cur.trim()) return;
    const rec = texts.get(node);
    let en = rec && (cur === rec.th || cur === rec.en) ? rec.en : cur;
    if (!rec && !LATIN.test(cur) && THAI.test(cur)) en = back(cur) ?? cur;   // Thai written by a script
    if (lang === 'en') {
      if (en !== cur) node.data = en;
      if (rec || en !== cur) texts.set(node, { en, th: rec?.th ?? cur });
      return;
    }
    const th = toThai(en);
    if (th === null) { if (rec) texts.delete(node); return; }
    const out = keepSpace(en, th);
    texts.set(node, { en, th: out });
    if (cur !== out) node.data = out;
  }
  function applyAttr(el, name) {
    const cur = el.getAttribute(name);
    if (!cur) return;
    const all = attrs.get(el) || {};
    const rec = all[name];
    const en = rec && (cur === rec.th || cur === rec.en) ? rec.en : cur;
    if (lang === 'en') { if (rec && cur !== en) el.setAttribute(name, en); return; }
    const th = toThai(en);
    if (th === null) return;
    all[name] = { en, th };
    attrs.set(el, all);
    if (cur !== th) el.setAttribute(name, th);
  }
  /* Sentences with inline elements: translated as a whole, elements kept (and moved) as they are. */
  const INLINE = new Set(['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'SMALL', 'CODE', 'KBD', 'ABBR', 'TIME', 'MARK', 'SUP', 'SUB', 'BR', 'DATA', 'BDI', 'S', 'U', 'Q', 'CITE', 'DFN']);
  const sentences = new WeakMap();   // Element -> { key, en: [nodes], th: [nodes] }
  const owned = new WeakSet();       // Thai text nodes created for a sentence
  function sentenceKey(el) {
    let text = false, inline = 0, key = '';
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { if (c.data.trim()) text = true; key += c.data; }
      else if (c.nodeType === 1 && INLINE.has(c.tagName)) key += `{${inline++}}`;
      else if (c.nodeType === 1 && c.namespaceURI === 'http://www.w3.org/2000/svg') key += '';
      else if (c.nodeType !== 8) return null;
    }
    return text && inline ? norm(key) : null;
  }
  const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
  /** Returns true when el is (now) handled as a sentence. */
  function applySentence(el) {
    const kids = [...el.childNodes];
    let rec = sentences.get(el);
    if (rec && !same(kids, rec.en) && !same(kids, rec.th)) { sentences.delete(el); rec = null; }
    if (!rec) {
      const key = sentenceKey(el);
      if (!key) return false;
      const th = TH[key] ?? fromTemplate(key);
      if (!th || !/\{\d+\}/.test(th)) return false;
      const elements = kids.filter(c => c.nodeType === 1 && INLINE.has(c.tagName));
      const icons = kids.filter(c => c.nodeType === 1 && c.namespaceURI === 'http://www.w3.org/2000/svg');
      const lead = (kids[0]?.nodeType === 3 && kids[0].data.match(/^\s*/)[0]) || '';
      const thNodes = [...icons];
      th.split(/\{(\d+)\}/).forEach((part, i) => {
        if (i % 2) { const n = elements[+part]; if (n) thNodes.push(n); }
        else if (part) { const tn = document.createTextNode(i === 0 ? lead + part : part); owned.add(tn); thNodes.push(tn); }
      });
      rec = { key, en: kids, th: thNodes };
      sentences.set(el, rec);
    }
    const want = lang === 'th' ? rec.th : rec.en;
    if (!same([...el.childNodes], want)) el.replaceChildren(...want);
    // Text inside the kept elements (link text, numbers) is translated on its own.
    for (const c of want) if (c.nodeType === 1) walkInside(c);
    return true;
  }
  function walk(node) {
    if (node.nodeType === 3 && node.parentElement?.nodeName === 'TITLE') { applyTitle(); return; }
    if (node.nodeType === 3) {
      const p = node.parentElement;
      if (owned.has(node) || excluded(p)) return;
      if (p && (sentences.has(p) || sentenceKey(p))) { applySentence(p) || applyText(node); return; }
      applyText(node);
      return;
    }
    walkInside(node);
  }
  function walkInside(node) {
    if (node.nodeType === 3) { if (!excluded(node.parentElement)) applyText(node); return; }
    if (node.nodeType !== 1) return;
    if (excluded(node)) { if (!excludedAttr(node)) walkAttrs(node); return; }
    for (const a of ATTRS) if (node.hasAttribute(a)) applyAttr(node, a);
    if (applySentence(node)) return walkAttrs(node);
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeType === 1 ? (excluded(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT),
    });
    // Elements are skipped (not rejected) so text inside is reached; sentence parents are done once.
    // Collect first: a sentence swap replaces nodes the walker would otherwise be standing on.
    const found = [];
    for (let n = tw.nextNode(); n; n = tw.nextNode()) found.push(n);
    const done = new Set();
    for (const n of found) {
      if (!n.isConnected) continue;
      // Owned Thai nodes still lead us to their sentence parent on an EN switch.
      // Skipping them first stranded inline sentences in Thai until a reload.
      const p = n.parentElement;
      if (p !== node && (sentences.has(p) || sentenceKey(p))) { if (!done.has(p)) { done.add(p); if (!applySentence(p)) for (const c of p.childNodes) if (c.nodeType === 3 && !owned.has(c)) applyText(c); } continue; }
      if (!owned.has(n)) applyText(n);
    }
    walkAttrs(node);
  }
  function walkAttrs(node) {
    for (const a of ATTRS) if (node.hasAttribute?.(a) && !excludedAttr(node)) applyAttr(node, a);
    node.querySelectorAll('[aria-label],[placeholder],[title],[alt]').forEach(el => { if (!excludedAttr(el)) for (const a of ATTRS) if (el.hasAttribute(a)) applyAttr(el, a); });
  }
  let titleEn = null, titleRendered = null;
  function applyTitle() {
    const cur = document.title;
    if (titleEn === null || cur !== titleRendered) titleEn = cur;
    const out = title(titleEn);
    titleRendered = out;
    if (cur !== out) document.title = out;
  }
  // "Health checks | LabClear", "Service desk — LabClear": translate each part except the name.
  const title = en => en.split(/( [|—] )/).map((p, i) => (i % 2 || p === 'LabClear' ? p : t(p))).join('');

  const observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'childList' && r.target.nodeName === 'TITLE') { applyTitle(); continue; }
      if (r.type === 'childList') {
        const t = r.target;
        if (t.nodeType === 1 && !excluded(t) && (sentences.has(t) || sentenceKey(t))) { if (!applySentence(t)) r.addedNodes.forEach(walk); }
        else r.addedNodes.forEach(walk);
      }
      else if (r.type === 'characterData' && r.target.parentElement?.nodeName === 'TITLE') applyTitle();
      else if (r.type === 'characterData') { if (!owned.has(r.target) && !excluded(r.target.parentElement)) applyText(r.target); }
      else if (r.type === 'attributes' && !excludedAttr(r.target)) applyAttr(r.target, r.attributeName);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  /* ---------------------------------------------------------------- switching */
  function syncSwitches() {
    document.querySelectorAll('.language-switch button[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  function set(next) {
    if (next !== 'th' && next !== 'en') return;
    document.cookie = `${COOKIE}=${next}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    if (next === lang) { syncSwitches(); return; }
    const swap = () => {
      lang = next;
      root.lang = next;
      walk(document.body);
      applyTitle();
      syncSwitches();
      document.dispatchEvent(new CustomEvent('labclear:language', { detail: { lang } }));
    };
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calm) document.startViewTransition(swap);
    else swap();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('.language-switch button[data-lang]');
    if (b) { e.preventDefault(); set(b.dataset.lang); }
  });
  document.addEventListener('DOMContentLoaded', () => { walk(document.body); applyTitle(); syncSwitches(); });
  if (document.body) walk(document.body);
  applyTitle();

  window.LC_I18N = {
    get lang() { return lang; },
    locale: () => (lang === 'th' ? 'th-TH' : 'en-GB'),
    t, tf, set,
    translate: walk,
    /** The English source of an element's own text (for scripts that rebuild it, e.g. animations). */
    source: el => [...el.childNodes].map(n => (n.nodeType === 3 ? texts.get(n)?.en ?? n.data : n.textContent)).join(''),
  };
})();
