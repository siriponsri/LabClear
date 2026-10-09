/*
 * LabClear integration 4.0.0-rc3: whole-system Thai-first / TH-EN language audit (browser).
 *
 *   BASE=http://localhost:3000 node tests/uat-i18n.mjs        # from web/, servers already up
 *
 * Same servers as tests/uat.mjs: `npm run start:render` (production build) in front of the real Codex
 * API with the offline AI stand-in (scripts/dev_mock_api.py). MOCKED_TEST_ONLY for the language model
 * and the report reader; routes, sessions, CSRF, permissions and storage are real.
 *
 * For every relevant page (website, chat, packages, lab report, organization, customer workspace views
 * and every service-desk view) in Thai and English at 390, 768 and 1440 px it records:
 *   - html[lang] and the language switch (present, visible, aria-pressed matches the language);
 *   - UNTRANSLATED UI text: in English, visible Thai text outside data/content regions; in Thai, visible
 *     text or placeholder/aria-label/title/alt that equals an English source string of the app's
 *     dictionary (lib/i18n/dict.th.json) — i.e. a string that bypassed t();
 *   - Thai words broken across two lines (Intl.Segmenter word boundaries vs. the rendered line boxes);
 *   - horizontal page overflow and text clipped by overflow:hidden without an ellipsis;
 *   - console and page errors;
 *   - a full-page screenshot (JPEG) per page/language/width.
 * It also switches the language with the on-page TH/EN control on every page (390 and 1440 px) and
 * checks interaction states in both languages: sign-in error, chat send failure, slow-loading
 * workspace and service desk, empty catalog search, 404, organization upload error.
 *
 * Data and content are not UI text: chat messages and model answers, values read from a report,
 * names typed by users, synthetic records and the language switch labels are excluded by the CONTENT
 * selectors below (each with its reason). Everything else must be in the page language.
 *
 * Output: docs/evidence/integration-4.0-rc3/i18n/i18n-audit.json (+ screenshots in shots/). I18N_OUT
 * overrides the folder. Exit 1 on any failure. Sign-ins: one admin, one wrong-password attempt per
 * language (the API allows 8 per IP per 15 minutes); the customer is a fresh account.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import readline from "node:readline";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");
const ROOT = path.resolve(WEB, "..");
const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const API = BASE + "/api/business";
const OUT = process.env.I18N_OUT ? path.resolve(process.env.I18N_OUT) : path.join(ROOT, "docs/evidence/integration-4.0-rc3/i18n");
const SHOTS = path.join(OUT, "shots");
const ONLY = (process.env.I18N_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const WIDTHS = (process.env.I18N_WIDTHS || "390,768,1440").split(",").map(Number);
const LANGS = ["th", "en"];
const RUN = Date.now().toString(36).slice(-6);
const PASSWORD = "uat-only-password-i18n";
const DICT = JSON.parse(fs.readFileSync(path.join(WEB, "lib/i18n/dict.th.json"), "utf8"));
const T = (en) => DICT[en] ?? en;
/** English source strings whose Thai differs: seeing one of these in Thai mode means t() was bypassed. */
const KEYS = Object.entries(DICT)
  .filter(([en, th]) => en !== th && /[A-Za-z]{2}/.test(en) && en.length >= 3)
  .map(([en]) => en);

/*
 * Content, not interface. Each selector is data shown as entered or as returned, in whatever language
 * it was written; translating it would change the record.
 */
const CONTENT = [
  [".language-switch", "the TH/EN control names both languages on purpose"],
  [".lc-cites ol a, .lc-cite-pub, .lc-ledger-names, .lc-step-detail, .sources a, .src-text, cite", "titles and publishers of reviewed sources are cited as published (bibliographic data)"],
  ["article.turn .answer, article.turn .bubble, article.turn.user, .turn .md", "chat messages and model answers (the language of the conversation)"],
  [".report-card td, table.report-table td, table.lab-table td, .obs-name, .obs-value, .report-values, .lc-row-test", "values and test names read from the report image (also the landing page's sample report)"],
  ["pre.org-preview, blockquote.org-excerpt, .org-card .record h3, .org-card .record h4", "organization document text and titles typed by the uploader"],
  ["[data-content]", "explicitly marked data region"],
];
const CONTENT_SEL = CONTENT.map(([s]) => s).join(", ");
/* Reviewed exceptions: exact UI text that is meant to contain the other language. */
const ALLOW = [
  { lang: "en", kind: "@placeholder", re: /e\.g\. HbA1c or ไขมัน$/, reason: "example of a Thai search term (the sources search understands Thai); an attribute cannot carry lang" },
  { lang: "en", kind: "@placeholder", re: /e\.g\. น้ำตาล$/, reason: "example of a Thai search term (the site search understands Thai); an attribute cannot carry lang" },
];
const allowed = (lang, u) => ALLOW.some((a) => a.lang === lang && a.kind === u.kind && a.re.test(u.text));

/* Thai line-break judge (scripts/thai_break_check.py, PyThaiNLP). Optional: NOT_RUN without it. */
const PY = process.env.TEST_PYTHON || path.join(ROOT, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
let judge = null;
let judgeStatus = "NOT_RUN";
async function startJudge() {
  if (!fs.existsSync(PY)) return (judgeStatus = `NOT_RUN (no Python at ${PY})`);
  const proc = spawn(PY, [path.join(ROOT, "scripts/thai_break_check.py")], { stdio: ["pipe", "pipe", "pipe"] });
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
  if (!ready) return (judgeStatus = `NOT_RUN (thai_break_check.py did not start: ${err.split("\n").filter(Boolean).slice(-1)[0] || "timeout"})`);
  judgeStatus = "RUN (PyThaiNLP newmm dictionary)";
  judge = {
    ask: (req) =>
      new Promise((res) => {
        queue.push(res);
        proc.stdin.write(JSON.stringify(req) + "\n");
      }),
    stop: () => proc.kill(),
  };
}

const started = new Date().toISOString();
const results = [];
const pages = []; // one row per target/lang/width
const consoleErrors = [];
const pageErrors = [];
let browser;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function poll(fn, { timeout = 10000, every = 200, message = "condition not met" } = {}) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() > end) throw new Error(message + (last instanceof Error ? ` (${last.message.split("\n")[0]})` : ""));
    await wait(every);
  }
}
async function scenario(id, title, fn) {
  if (ONLY.length && !ONLY.some((p) => id.startsWith(p))) return;
  const start = Date.now();
  const record = { id, title, ok: false, ms: 0 };
  const notes = [];
  try {
    await fn({ note: (n) => notes.push(n) });
    record.ok = true;
  } catch (e) {
    record.error = String(e?.message || e).replace(/\u001b\[\d+m/g, "").split("\n").filter((l) => l.trim()).slice(0, 8).join(" | ").slice(0, 1500);
  }
  record.ms = Date.now() - start;
  if (notes.length) record.note = notes.join(" ");
  results.push(record);
  console.log(`${record.ok ? "PASS" : "FAIL"} ${id} ${title} (${record.ms} ms)${record.error ? "\n     " + record.error : ""}${record.note ? "\n     note: " + record.note : ""}`);
}

/* ------------------------------------------------------------------ browser helpers */

const DEV_NOISE = /\[HMR\]|\[Fast Refresh\]|webpack-hmr|turbopack-hmr|next-devtools|Download the React DevTools/i;
const expected = new WeakMap();
function watch(page, label) {
  page.on("pageerror", (e) => pageErrors.push(`${label} ${safePath(page)}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error" || DEV_NOISE.test(m.text())) return;
    if (expected.get(page)?.test(m.text())) return;
    consoleErrors.push(`${label} ${safePath(page)}: ${m.text().slice(0, 300)}`);
  });
  page.on("dialog", (d) => d.accept().catch(() => {}));
}
function safePath(page) {
  try {
    const u = new URL(page.url());
    return u.pathname + u.search;
  } catch {
    return "";
  }
}
async function newContext(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", ...opts });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(45000);
  return ctx;
}
async function newPage(ctx, label) {
  const page = await ctx.newPage();
  watch(page, label);
  return page;
}
async function setLang(ctx, lang) {
  await ctx.addCookies([{ name: "labclear_language", value: lang, url: BASE, sameSite: "Lax" }]);
}
async function hydrated(page) {
  await poll(
    () =>
      page.evaluate(() => {
        const isReact = (el) => !!el && Object.keys(el).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber"));
        const el = document.querySelector(".language-switch button");
        return isReact(document.body) && (!el || isReact(el));
      }),
    { timeout: 20000, every: 100, message: `page ${safePath(page)} did not hydrate` },
  );
}
async function go(page, p) {
  const r = await page.goto(BASE + p, { waitUntil: "load" });
  await hydrated(page);
  return r;
}
async function settle(page) {
  await page.evaluate(() => document.fonts?.ready);
  await poll(() => page.evaluate(() => !document.querySelector("main [aria-busy=true], #content [aria-busy=true], .view[aria-busy]")), { timeout: 20000, message: "view still busy" }).catch(() => {});
  await wait(350);
}
async function me(ctx) {
  const r = await ctx.request.get(API + "/me");
  return r.ok() ? r.json() : { user: null, csrf: "" };
}
async function call(ctx, method, p, data, multipart) {
  const { csrf } = await me(ctx);
  const opts = { method, headers: { "X-Business-CSRF": csrf || "", Origin: BASE }, failOnStatusCode: false };
  if (multipart) opts.multipart = multipart;
  else if (data !== undefined && data !== null) opts.data = data;
  const r = await ctx.request.fetch(API + p, opts);
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  if (!r.ok()) throw new Error(`${method} ${p} -> ${r.status()} ${JSON.stringify(body)?.slice(0, 200)}`);
  return body;
}
/** Fill the shared sign-in dialog; kind "login" submits, "register" uses Create account (Thai labels). */
async function signInDialog(page, email, password, kind = "login") {
  const dlg = page.locator("dialog.signin-dialog[open]");
  await dlg.waitFor();
  await dlg.locator("#si-email").fill(email);
  await dlg.locator("#si-pass").fill(password);
  if (kind === "register") await dlg.getByRole("button", { name: T("Create account"), exact: true }).click();
  else await dlg.locator('button[type="submit"]').click();
}

/* ------------------------------------------------------------------ the in-page audit */

/** Runs in the page. Returns language/overflow/word-break/clipping findings for the rendered DOM. */
function auditPage({ lang, keys, contentSel }) {
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
  const bad = (text) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (lang === "en") return THAI.test(t);
    // Thai: an English dictionary source string shown as is (the Thai differs), or a line of English
    // sentence text that is not a name (>= 4 English words and no Thai at all).
    if (keySet.has(t)) return true;
    return !THAI.test(t) && /\b[A-Za-z]{2,}\b(\s+\b[A-Za-z]{2,}\b){3,}/.test(t) && /\b(the|and|your|you|this|with|for|not|from|our|are|is|to|of)\b/i.test(t);
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
function uniq(list, key) {
  const seen = new Set();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function audit(page, target, lang, width) {
  const r = await page.evaluate(auditPage, { lang, keys: KEYS, contentSel: CONTENT_SEL });
  const midWord = [];
  if (judge) {
    for (const b of r.breaks.slice(0, 600)) {
      const res = await judge.ask({ pairs: b.pairs });
      for (const [l, rr] of res.bad || []) midWord.push({ split: `${l}|${rr}`.replace(/[\u200b\u2060]/g, ""), where: b.where });
    }
  }
  const file = `${target.id}-${lang}-${width}.jpg`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true, type: "jpeg", quality: 62, animations: "disabled", caret: "hide" });
  const row = {
    target: target.id,
    area: target.area,
    path: target.path,
    role: target.role,
    lang,
    width,
    html_lang: r.htmlLang,
    switch: r.switch,
    untranslated: uniq(r.untranslated.filter((u) => !allowed(lang, u)), (x) => x.kind + x.text + x.where),
    allowed: uniq(r.untranslated.filter((u) => allowed(lang, u)), (x) => x.kind + x.text),
    split_words: uniq(r.splitWords, (x) => x.word + x.where),
    mid_word_breaks: uniq(midWord, (x) => x.split + x.where),
    thai_breaks_checked: r.breaks.reduce((n, b) => n + b.pairs.length, 0),
    clipped: uniq(r.clipped, (x) => x.where),
    overflow: r.overflow,
    texts_checked: r.texts,
    screenshot: "shots/" + file,
  };
  pages.push(row);
  return row;
}

function problems(row, { switchRequired = true } = {}) {
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

/** Click the other language on the page's own TH/EN control and check that the page follows. */
const chromeText = (page) =>
  page.evaluate(() => {
    // Interface text only: headers, navigation, buttons and labels (not records such as a report's own name).
    const parts = [...document.querySelectorAll("header, nav, button, label, h1, h2, .view-intro")].map((e) => e.textContent || "");
    return parts.join("|").replace(/\s+/g, " ").trim();
  });
async function switchCheck(page, from, to) {
  const before = await chromeText(page);
  const sw = page.locator(".language-switch").first();
  await sw.getByRole("button", { name: to.toUpperCase(), exact: true }).click();
  await poll(() => page.evaluate((l) => document.documentElement.lang === l, to), { timeout: 15000, message: `html lang did not become ${to}` });
  await poll(() => sw.getByRole("button", { name: to.toUpperCase(), exact: true }).getAttribute("aria-pressed").then((v) => v === "true"), { timeout: 15000, message: "switch not pressed" });
  await settle(page);
  const after = await chromeText(page);
  const cookie = (await page.context().cookies(BASE)).find((c) => c.name === "labclear_language")?.value;
  assert(cookie === to, `cookie ${cookie} after switching to ${to}`);
  return { before, after, changed: before !== after };
}

/* ------------------------------------------------------------------ targets */

const PUBLIC = [
  ["home", "Landing", "/", "main h1"],
  ["packages", "Package", "/packages", "main h1"],
  ["package", "Package", "/packages/P02", "main h1"],
  ["compare", "Package", "/compare?ids=P01,P02", "main h1"],
  ["centers", "Website", "/centers", "main h1"],
  ["help", "Website", "/help", "main h1"],
  ["privacy", "Website", "/privacy", "main h1"],
  ["sources", "Website", "/sources", "main h1"],
  ["lab-reports", "Lab Report", "/lab-reports", "main h1"],
  ["organizations", "Organization", "/organizations", "main h1"],
  ["hospital-links", "Package", "/hospital-links", "main h1"],
  ["not-found", "Website", "/this-page-does-not-exist", "main h1"],
];
const APP = [
  ["app-chat", "Chatbot", "/app", null],
  ["app-packages", "Package", "/app?view=packages", null],
  ["app-book", "Package", "/app?view=book", null],
  ["app-bookings", "Package", "/app?view=bookings", null],
  ["app-labs", "Lab Report", "/app?view=labs", null],
  ["app-reports", "Lab Report", "/app?view=reports", null],
  ["app-plan", "Lab Report", "/app?view=plan", null],
  ["app-notifications", "Chatbot", "/app?view=notifications", null],
  ["app-orgs", "Organization", "/app?view=orgs", null],
];
const STAFF = ["overview", "staff", "operations", "customers", "payments", "notifications", "catalog-admin", "centers", "roles", "ai", "channels", "audit", "organizations"];

async function appReady(page) {
  await page.locator(".ws-root .workspace-header").waitFor({ timeout: 30000 });
  await page.locator(".ws-root main .view:not([hidden]):not([aria-busy])").first().waitFor({ timeout: 30000 });
}
/** Chat answer: open "How this was checked" and the source list so their text is audited too. */
async function openReceipt(page, lang) {
  const turn = page.locator("section.chat-view article.turn.ai:not(.thinking)").last();
  if (!(await turn.count())) return;
  for (const label of ["How this was checked", "View source"]) {
    const b = turn.getByRole("button", { name: lang === "th" ? T(label) : label });
    if ((await b.count()) && (await b.first().getAttribute("aria-expanded")) !== "true") await b.first().click().catch(() => {});
  }
  await wait(300);
}
async function staffReady(page) {
  await page.locator("nav.side-nav").waitFor({ timeout: 30000 });
  await page.locator("#content").first().waitFor({ timeout: 30000 });
}

/* ------------------------------------------------------------------ main */

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", headless: !process.env.UAT_HEADED, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update"] });
  const health = await fetch(BASE + "/health").catch(() => null);
  if (!health?.ok) throw new Error(`The website or API is not answering at ${BASE}/health`);
  const candidate = (await health.json()).commit;
  await startJudge();
  console.log(`Thai line-break check: ${judgeStatus}`);

  /* ---- setup: a guest, a fresh customer with a confirmed report, a chat answer and an organization; admin */
  const guestCtx = await newContext();
  const custCtx = await newContext();
  const adminCtx = await newContext();
  const setup = {};
  await scenario("I18N-00", "Setup: fresh customer (synthetic report confirmed, chat answer, organization editor with a draft) and admin", async ({ note }) => {
    const p = await newPage(custCtx, "customer");
    await go(p, "/app");
    await appReady(p);
    await p.locator(".workspace-header .avatar-button").click();
    const email = `i18n-${RUN}@example.invalid`;
    await signInDialog(p, email, PASSWORD, "register");
    await poll(async () => (await me(custCtx)).user?.email === email, { timeout: 20000, message: "customer account not created" });
    setup.email = email;
    setup.userId = (await me(custCtx)).user.id;
    const read = await call(custCtx, "POST", "/demos/03_B_Lipid/read");
    const fields = read.data.fields.map((f) => ({ name: f.name, value: f.value, unit: f.unit || "", reference: f.reference || "", printed_flag: f.printed_flag || "" }));
    await call(custCtx, "POST", "/reports/confirm", { report_id: read.id, fields, label: "Synthetic lipid report", collected_date: "2026-10-01", same_person_confirmed: true });
    setup.reportId = read.id;
    // A chat answer with sources (offline test double).
    await go(p, "/app");
    await appReady(p);
    await p.locator("section.chat-view textarea").first().fill("UI_TEST_SOURCES");
    await p.locator("section.chat-view").getByRole("button", { name: T("Send message") }).click();
    await p.locator("section.chat-view article.turn.ai:not(.thinking) .answer").first().waitFor({ timeout: 30000 });
    await p.close();
    // Admin signs in from the website header and is sent to the service desk.
    const a = await newPage(adminCtx, "admin");
    await go(a, "/");
    await a.locator(".site-header .nav-account").getByRole("button").first().click();
    await signInDialog(a, "admin", "1234");
    await a.waitForURL(/\/staff/, { timeout: 30000 });
    await a.close();
    // Organization: the customer becomes an editor and uploads one synthetic draft.
    const org = `org_i18n_${RUN}`;
    await call(adminCtx, "PUT", "/organization-documents/membership", { user_id: setup.userId, organization_id: org, role: "editor" });
    await call(custCtx, "POST", "/organization-documents", null, {
      title: `Synthetic preparation note ${RUN}`,
      file: { name: `prep-${RUN}.md`, mimeType: "text/markdown", buffer: Buffer.from("Synthetic note: no food for 8 hours before a fasting glucose test.\nโน้ตสังเคราะห์: งดอาหาร 8 ชั่วโมงก่อนตรวจน้ำตาล", "utf8") },
    });
    note(`customer ${setup.userId}, report ${setup.reportId}, organization ${org}.`);
  });

  const all = [
    ...PUBLIC.map(([id, area, p, ready]) => ({ id, area, path: p, role: "guest", ctx: guestCtx, ready: (pg) => pg.locator(ready).first().waitFor({ timeout: 20000 }) })),
    { id: "app-chat-guest", area: "Chatbot", path: "/app", role: "guest", ctx: guestCtx, ready: appReady },
    ...APP.map(([id, area, p]) => ({ id, area, path: p, role: "customer", ctx: custCtx, ready: appReady, prepare: id === "app-chat" ? openReceipt : null })),
    { id: "lab-report", area: "Lab Report", path: () => "/lab-report/" + encodeURIComponent(setup.reportId), role: "customer", ctx: custCtx, ready: (pg) => pg.locator("table.lab-table tbody tr").first().waitFor({ timeout: 20000 }) },
    { id: "organizations-signed-in", area: "Organization", path: "/organizations", role: "customer", ctx: custCtx, ready: (pg) => pg.locator("main h1").first().waitFor() },
    ...STAFF.map((v) => ({ id: "staff-" + v, area: "Staff/Admin", path: "/staff" + (v === "overview" ? "" : "?view=" + v), role: "admin", ctx: adminCtx, ready: staffReady })),
  ];

  for (const target of all) {
    await scenario(`I18N-P-${target.id}`, `${target.area} ${typeof target.path === "string" ? target.path : "/lab-report/<id>"} (${target.role}): TH and EN at ${WIDTHS.join("/")} px, switch control works`, async ({ note }) => {
      const pth = typeof target.path === "function" ? target.path() : target.path;
      target.path = pth;
      const page = await newPage(target.ctx, target.id);
      if (target.id === "not-found") expected.set(page, /404|Not Found/i);
      const issues = [];
      const switches = [];
      try {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
          for (const lang of LANGS) {
            await setLang(target.ctx, lang);
            const from = consoleErrors.length;
            const fromP = pageErrors.length;
            await go(page, pth);
            await target.ready(page);
            if (target.prepare) await target.prepare(page, lang);
            await settle(page);
            const row = await audit(page, target, lang, width);
            issues.push(...problems(row));
            for (const e of consoleErrors.slice(from)) if (e.startsWith(target.id + " ")) issues.push(`${lang}/${width}: console ${e}`);
            for (const e of pageErrors.slice(fromP)) if (e.startsWith(target.id + " ")) issues.push(`${lang}/${width}: pageerror ${e}`);
          }
          if (width === 390 || width === 1440) {
            // Page is in English now: switch to Thai with the on-page control, then back to English.
            const a = await switchCheck(page, "en", "th");
            const b = await switchCheck(page, "th", "en");
            switches.push(`${width}px EN→TH ${a.changed ? "changed" : "same"} interface text, TH→EN ${b.changed ? "changed" : "same"}`);
            if (!a.changed || !b.changed) issues.push(`${width}: interface text did not change when switching (${a.before.slice(0, 80)})`);
          }
        }
      } finally {
        await page.close();
        await setLang(target.ctx, "th");
      }
      note(switches.join("; "));
      assert(!issues.length, issues.slice(0, 25).join(" || ") + (issues.length > 25 ? ` || … ${issues.length - 25} more` : ""));
    });
  }

  /* ---- interaction states in both languages */

  const STATE_W = [390, 1440];
  const stateRow = async (page, id, area, lang, width) => problems(await audit(page, { id, area, path: safePath(page), role: "state" }, lang, width), { switchRequired: false });

  await scenario("I18N-S-signin-error", "Sign-in dialog: wrong password error in TH and EN", async () => {
    const issues = [];
    for (const lang of LANGS) {
      const ctx = await newContext();
      try {
        await setLang(ctx, lang);
        const p = await newPage(ctx, "signin-error");
        expected.set(p, /401|Unauthorized|status of 4\d\d/i);
        await go(p, "/");
        await p.locator(".site-header .nav-account").getByRole("button").first().click();
        await signInDialog(p, `nobody-${RUN}@example.invalid`, "wrong-password-i18n");
        await p.locator("dialog.signin-dialog[open] .field-error").waitFor({ timeout: 15000 });
        const msg = (await p.locator("dialog.signin-dialog[open] .field-error").innerText()).trim();
        issues.push(...(await stateRow(p, "state-signin-error", "Website", lang, 1440)));
        if (lang === "en" && /[฀-๿]/.test(msg)) issues.push(`en: error in Thai: ${msg}`);
        if (lang === "th" && !/[฀-๿]/.test(msg)) issues.push(`th: error not in Thai: ${msg}`);
      } finally {
        await ctx.close();
      }
    }
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-S-chat-failure", "Chat: a message that cannot be sent shows the failure and Retry in TH and EN", async () => {
    const issues = [];
    for (const width of STATE_W)
      for (const lang of LANGS) {
        await setLang(custCtx, lang);
        const p = await newPage(custCtx, "chat-failure");
        expected.set(p, /Failed to load resource|net::ERR_FAILED|status of 5\d\d/i);
        try {
          await p.setViewportSize({ width, height: width < 800 ? 844 : 900 });
          await go(p, "/app");
          await appReady(p);
          await p.route("**/api/business/chat", (r) => r.abort("failed"));
          await p.locator("section.chat-view textarea").first().fill("i18n failure check");
          await p.locator("section.chat-view").getByRole("button", { name: lang === "th" ? T("Send message") : "Send message" }).click();
          await p.locator("section.chat-view .failure, section.chat-view [role=alert], .toast[role=status]:not([hidden])").first().waitFor({ timeout: 20000 });
          await settle(p);
          issues.push(...(await stateRow(p, "state-chat-failure", "Chatbot", lang, width)));
        } finally {
          await p.unroute("**/api/business/chat").catch(() => {});
          await p.close();
        }
      }
    await setLang(custCtx, "th");
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-S-loading", "Loading states (slow workspace, slow service desk) in TH and EN", async () => {
    const issues = [];
    for (const lang of LANGS)
      for (const [ctx, route, url, id, area] of [
        [custCtx, "**/api/business/workspace*", "/app?view=reports", "state-loading-app", "Chatbot"],
        [adminCtx, "**/api/business/staff/**", "/staff", "state-loading-staff", "Staff/Admin"],
      ]) {
        await setLang(ctx, lang);
        const p = await newPage(ctx, id);
        try {
          await p.setViewportSize({ width: 390, height: 844 });
          let release;
          const gate = new Promise((r) => (release = r));
          await p.route(route, async (r) => {
            await gate;
            await r.continue().catch(() => {});
          });
          await p.goto(BASE + url, { waitUntil: "domcontentloaded" });
          await wait(1500);
          issues.push(...(await stateRow(p, id, area, lang, 390)));
          release();
          await p.unroute(route).catch(() => {});
        } finally {
          await p.close();
        }
      }
    for (const ctx of [custCtx, adminCtx]) await setLang(ctx, "th");
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-S-empty-search", "Catalog: a search with no match shows the empty state in TH and EN", async () => {
    const issues = [];
    for (const width of STATE_W)
      for (const lang of LANGS) {
        await setLang(guestCtx, lang);
        const p = await newPage(guestCtx, "empty-search");
        try {
          await p.setViewportSize({ width, height: width < 800 ? 844 : 900 });
          await go(p, "/packages?q=zzqxv");
          await p.locator("[data-empty]").first().waitFor({ timeout: 15000 });
          await settle(p);
          issues.push(...(await stateRow(p, "state-empty-search", "Package", lang, width)));
        } finally {
          await p.close();
        }
      }
    await setLang(guestCtx, "th");
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-S-org-upload-error", "Organization upload: an unsupported file is refused with a message in TH and EN", async () => {
    const issues = [];
    for (const lang of LANGS) {
      await setLang(custCtx, lang);
      const p = await newPage(custCtx, "org-error");
      try {
        await p.setViewportSize({ width: 390, height: 844 });
        await go(p, "/app?view=orgs");
        await appReady(p);
        const form = p.locator("form.org-upload");
        await form.locator('input[type="file"]').setInputFiles({ name: "guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
        await form.locator(".field-error").first().waitFor({ timeout: 10000 });
        await settle(p);
        issues.push(...(await stateRow(p, "state-org-upload-error", "Organization", lang, 390)));
      } finally {
        await p.close();
      }
    }
    await setLang(custCtx, "th");
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-Z", "No uncaught page errors during the run", async () => {
    assert(!pageErrors.length, [...new Set(pageErrors)].slice(0, 8).join(" | "));
  });

  for (const c of [guestCtx, custCtx, adminCtx]) await c.close().catch(() => {});
  judge?.stop();
  return candidate;
}

let fatal = "";
let candidate;
try {
  candidate = await main();
} catch (e) {
  fatal = String(e?.message || e);
  console.error("Fatal:", fatal);
} finally {
  if (browser) await browser.close().catch(() => {});
  const failed = results.filter((r) => !r.ok).length + (fatal ? 1 : 0);
  if (fatal) results.push({ id: "SUITE", title: "Suite could not run", ok: false, ms: 0, error: fatal });
  const byArea = {};
  for (const r of pages) {
    const a = (byArea[r.area] ||= { pages: new Set(), rows: 0, rows_clean: 0 });
    a.pages.add(r.target);
    a.rows++;
    if (!problems(r, { switchRequired: r.role !== "state" }).length) a.rows_clean++;
  }
  const report = {
    started,
    finished: new Date().toISOString(),
    base: BASE,
    candidate_commit: candidate,
    mode: "MOCKED_TEST_ONLY for the language model and report reader (scripts/dev_mock_api.py on the Codex backend); real UI, routes, sessions, CSRF, permissions.",
    widths: WIDTHS,
    languages: LANGS,
    content_exclusions: CONTENT.map(([selector, reason]) => ({ selector, reason })),
    explicit_language_regions: "elements with their own lang attribute (record text, offers, Thai example words) are treated as content in that language",
    reviewed_exceptions: ALLOW.map((a) => ({ lang: a.lang, kind: a.kind, pattern: String(a.re), reason: a.reason })),
    thai_line_break_check: judgeStatus,
    dictionary_strings: Object.keys(DICT).length,
    scenarios: results,
    passed: results.filter((r) => r.ok).length,
    failed,
    areas: Object.fromEntries(Object.entries(byArea).map(([k, v]) => [k, { pages: [...v.pages], page_language_width_rows: v.rows, rows_without_findings: v.rows_clean }])),
    rows: pages,
    console_errors: [...new Set(consoleErrors)].slice(0, 40),
    page_errors: [...new Set(pageErrors)].slice(0, 20),
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "i18n-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\n${report.passed} passed, ${report.failed} failed -> ${path.join(OUT, "i18n-audit.json")}`);
  process.exitCode = failed ? 1 : 0;
}
