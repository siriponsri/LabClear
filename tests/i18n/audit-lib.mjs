/*
 * Used by the interface-language audit tests/browser/i18n_audit.mjs (the FastAPI website).
 *
 * auditPage() runs inside the page and reports, for the rendered DOM: html[lang], the TH/EN switch,
 * interface text in the wrong language (Thai in English; in Thai, English dictionary sources shown as
 * is or English sentences), Thai words split across lines, text clipped without an ellipsis and
 * horizontal overflow, plus every place Thai text wraps (judged afterwards by
 * scripts/thai_break_check.py with PyThaiNLP, when available).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";

/** Runs in the page. Returns language/overflow/word-break/clipping findings for the rendered DOM. */
export function auditPage({ lang, keys, contentSel, names = [] }) {
  // Thai letters, vowels, tone marks and digits; the baht sign (U+0E3F) is used in English too.
  const THAI = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;
  const keySet = new Set(keys);
  const out = { htmlLang: document.documentElement.lang, title: document.title, switch: null, untranslated: [], splitWords: [], clipped: [], overflow: null, texts: 0 };
  const rendered = (el) => !!el && el.isConnected && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0);
  // Content regions, plus any element that declares its own language (lang="th" inside an English page,
  // lang="en" inside a Thai page): a deliberate, reviewable statement that the text is in that language.
  const isContent = (el) => !!el.closest(contentSel) || (el.closest("[lang]") || document.documentElement) !== document.documentElement;
  const where = (el) => {
    const parts = [];
    for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      const cls = String(e.className && typeof e.className === "string" ? e.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      parts.unshift(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (cls ? "." + cls : ""));
    }
    return parts.join(" > ");
  };
  // English that may stay in a Thai page: names (products, packages, providers), test names and
  // abbreviations, units, codes, model IDs, settings and addresses. Everything else is a gap.
  const nameSet = new Set(names);
  const TECH = new RegExp(
    "^(?:" +
      [
        "LabClear(?: Plus)?", "PromptPay", "Google(?: Maps)?", "LINE", "Stripe", "Render", "Typhoon(?: OCR)?", "OpenThai[- ]SystemOne", "SystemOne", "iApp", "OpenRouter",
        "DeepSeek", "Luna", "Sant[ée]", "Clef", "Anthropic", "Claude", "OpenAI", "Together", "SCB 10X", "MedlinePlus", "Plus", "Free", "AI", "OCR", "API", "JSON", "PDF", "PNG", "JPG", "JPEG",
        "[A-Z][A-Za-z0-9]*(?:[-_./][A-Za-z0-9]+)+", "[A-Z0-9_]{2,}", "[a-z0-9]+(?:[-_.][a-z0-9]+)+", "[\\w.+-]+@[\\w.-]+", "https?://\\S+", "/\\S*",
        "(?:mg|g|mmol|µmol|umol|U|IU|µIU|mIU|ng|pg|fL|cells|mL|dL|L|%)(?:/[A-Za-z0-9µ]+)*",
        "HbA1c|LDL|HDL|ALT|AST|ALP|BUN|TSH|T4|CBC|eGFR|UACR|FBS|HGB|HCT|MCV|MCH|MCHC|RBC|WBC|PLT",
      ].join("|") +
      ")$",
  );
  const technical = (t) => {
    if (nameSet.has(t)) return true;
    // Every token is a name, an abbreviation, a code, a unit or a number.
    return t.split(/[\s,·:;()/×+–—→]+/).filter((w) => /[A-Za-z]/.test(w)).every((w) => TECH.test(w) || nameSet.has(w) || /\d/.test(w));
  };
  const bad = (text) => {
    const t = text.replace(/[\u200b\u2060]/g, "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (lang === "en") return THAI.test(t);
    // Thai: an English dictionary source string shown as is (the Thai differs), or English words that
    // are not names, test names, units or codes (and no Thai in the same text).
    if (keySet.has(t)) return true;
    if (THAI.test(t) || !/[A-Za-z]{2,}/.test(t)) return false;
    return !technical(t);
  };
  const sw = document.querySelector(".language-switch");
  if (sw) {
    const r = sw.getBoundingClientRect();
    const pressed = sw.querySelector('button[aria-pressed="true"]')?.textContent?.trim().toLowerCase();
    out.switch = { visible: rendered(sw) && r.width > 0 && r.right <= innerWidth + 1 && r.left >= -1, pressed };
  }
  if (document.title.split(" | ").some((part) => part !== "LabClear" && bad(part))) out.untranslated.push({ kind: "document.title", text: document.title.slice(0, 160), where: "head > title" });
  out.breaks = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seg = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    if (!text || !text.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("script, style, noscript, template, svg title")) continue;
    if (!rendered(el)) continue;
    out.texts++;
    if (!isContent(el) && bad(text)) out.untranslated.push({ kind: "text", text: text.trim().replace(/\s+/g, " ").slice(0, 160), where: where(el) });
    if (seg && THAI.test(text)) {
      // Where the browser actually wrapped this text: the word segment ending a line and the one
      // starting the next (both judged against a Thai dictionary after the run).
      const pairs = [];
      let prev = null;
      for (const s of seg.segment(text)) {
        if (!s.segment.replace(/[\s\u200b\u2060]/g, "")) continue;
        range.setStart(n, s.index);
        range.setEnd(n, s.index + s.segment.length);
        const rs = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        if (!rs.length) continue;
        if (prev && Math.round(rs[0].top) > prev.top + 2) pairs.push([prev.seg, s.segment]);
        prev = { seg: s.segment, top: Math.round(rs[rs.length - 1].top) };
      }
      // Interface text only: records quoted as published (content regions) keep their own wording.
      if (pairs.length && !isContent(el)) out.breaks.push({ pairs: pairs.slice(0, 300), where: where(el) });
      for (const s of seg.segment(text)) {
        if (!s.isWordLike || s.segment.length < 2 || !THAI.test(s.segment)) continue;
        range.setStart(n, s.index);
        range.setEnd(n, s.index + s.segment.length);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        if (rects.length < 2) continue;
        const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
        if (tops.length < 2) continue;
        const box = el.getBoundingClientRect();
        const whole = rects.reduce((w, r) => w + r.width, 0);
        // A single word wider than its box has to break; that is a layout limit, not a wrapping bug.
        if (whole > box.width - 1) continue;
        out.splitWords.push({ word: s.segment, text: text.trim().slice(0, 80), where: where(el) });
        break;
      }
    }
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!rendered(el)) continue;
    for (const attr of ["placeholder", "aria-label", "title", "alt"]) {
      const v = el.getAttribute(attr);
      if (v && !isContent(el) && bad(v)) out.untranslated.push({ kind: "@" + attr, text: v.slice(0, 160), where: where(el) });
    }
    const cs = getComputedStyle(el);
    // Visually hidden (sr-only) text is clipped on purpose; real boxes clip text only by mistake.
    if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 2) {
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
      if (own) out.clipped.push({ text: el.textContent.trim().slice(0, 80), where: where(el), scroll: el.scrollWidth, client: el.clientWidth });
    }
  }
  const sw2 = document.documentElement.scrollWidth;
  if (sw2 > innerWidth + 1) {
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") wide.push(where(el) + ` right=${Math.round(r.right)}`);
      if (wide.length > 3) break;
    }
    out.overflow = `${sw2} > ${innerWidth}: ${wide.join("; ")}`;
  }
  return out;
}

/** Dedupe findings by text+where so one missing string is reported once per page. */
export function uniq(list, key) {
  const seen = new Set();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function problems(row, { switchRequired = true } = {}) {
  const p = [];
  if (row.html_lang !== row.lang) p.push(`html lang=${row.html_lang}`);
  if (switchRequired && (!row.switch || !row.switch.visible)) p.push("language switch missing or off-screen");
  if (row.switch && row.switch.pressed !== row.lang) p.push(`switch shows ${row.switch.pressed}`);
  for (const u of row.untranslated) p.push(`untranslated ${u.kind} "${u.text}" @ ${u.where}`);
  for (const s of row.split_words) p.push(`Thai word split "${s.word}" @ ${s.where}`);
  for (const s of row.mid_word_breaks || []) p.push(`Thai line break inside a word "${s.split}" @ ${s.where}`);
  for (const c of row.clipped) p.push(`clipped "${c.text}" @ ${c.where} (${c.scroll}>${c.client})`);
  if (row.overflow) p.push(`overflow ${row.overflow}`);
  return p.map((x) => `${row.lang}/${row.width}: ${x}`);
}

/** Thai line-break judge (scripts/thai_break_check.py, PyThaiNLP). Optional: NOT_RUN without it. */
export async function startJudge(root) {
  const py = process.env.TEST_PYTHON || path.join(root, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  if (!fs.existsSync(py)) return { status: `NOT_RUN (no Python at ${py})`, judge: null };
  const proc = spawn(py, ["-X", "utf8", path.join(root, "scripts/thai_break_check.py")], { stdio: ["pipe", "pipe", "pipe"] });
  const rl = readline.createInterface({ input: proc.stdout });
  const queue = [];
  rl.on("line", (line) => queue.shift()?.(JSON.parse(line)));
  let err = "";
  proc.stderr.on("data", (d) => (err += d));
  const ready = await new Promise((res) => {
    queue.push(() => res(true));
    proc.on("exit", () => res(false));
    setTimeout(() => res(false), 60000);
  });
  if (!ready) return { status: `NOT_RUN (thai_break_check.py did not start: ${err.split("\n").filter(Boolean).slice(-1)[0] || "timeout"})`, judge: null };
  return {
    status: "RUN (PyThaiNLP dictionary)",
    judge: {
      ask: (req) =>
        new Promise((res, reject) => {
          if (proc.exitCode !== null || proc.killed) return reject(new Error("Thai line-break judge exited"));
          const timer = setTimeout(() => {
            proc.kill();
            reject(new Error("Thai line-break judge did not respond within 15 seconds"));
          }, 15000);
          queue.push(value => { clearTimeout(timer); res(value); });
          proc.stdin.write(JSON.stringify(req) + "\n");
        }),
      stop: () => proc.kill(),
    },
  };
}

/** Mid-word Thai line breaks of one auditPage() result. */
export async function judgeBreaks(judge, result) {
  const out = [];
  if (!judge) return out;
  for (const b of result.breaks.slice(0, 600)) {
    const res = await judge.ask({ pairs: b.pairs });
    for (const [l, r] of res.bad || []) out.push({ split: `${l}|${r}`.replace(/[\u200b\u2060]/g, ""), where: b.where });
  }
  return out;
}
