/*
 * Interface-language audit of the FastAPI website (the main UI since 4.0.0-rc3): Thai first, TH/EN
 * on every page.
 *
 *   python scripts/dev_mock_api.py &              # real app, offline AI stand-in, port 8000
 *   node tests/browser/i18n_audit.mjs             # BASE=http://127.0.0.1:8000 by default
 *
 * For every page (website, package pages, AI Lab Report, organizations, hospital links, 404), every
 * customer workspace view (/app: chat, packages, booking, appointments, lab dashboard, reports, plan),
 * the printable Lab Report and every service-desk view (/staff, admin), in Thai and English at 390,
 * 768 and 1440 px: html[lang]; the TH/EN switch (visible, pressed state); interface text in the
 * wrong language (tests/i18n/audit-lib.mjs); Thai words split mid-word (PyThaiNLP judge, optional);
 * clipped text; horizontal overflow; console and page errors; a full-page JPEG screenshot. On each
 * page it also switches language with the on-page control (no reload) and checks the text changes
 * and the draft in the chat box survives. Interaction states in both languages: sign-in error,
 * chat send failure, slow loading, empty catalog search, 404.
 *
 * Content is not interface text: chat messages and model answers, values read from a report, source
 * titles, names people typed (translate="no" in the page, or an element with its own lang).
 *
 * MOCKED_TEST_ONLY for the language model and the report reader. Writes
 * docs/evidence/current/i18n-audit.json (I18N_OUT overrides the folder) and the screenshots to
 * eval_runs/i18n-shots/ (not committed; I18N_SHOTS overrides).
 * I18N_ONLY=prefix,prefix runs a subset; I18N_WIDTHS=390,1440 limits widths. Exit 1 on failure.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPage, uniq, problems, startJudge, judgeBreaks } from "../i18n/audit-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const API = BASE + "/api/business";
const OUT = process.env.I18N_OUT ? path.resolve(process.env.I18N_OUT) : path.join(ROOT, "docs/evidence/current");
const SHOTS = process.env.I18N_SHOTS ? path.resolve(process.env.I18N_SHOTS) : path.join(ROOT, "eval_runs/i18n-shots");
const ONLY = (process.env.I18N_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const WIDTHS = (process.env.I18N_WIDTHS || "390,768,1440").split(",").map(Number);
const LANGS = ["th", "en"];
const RUN = Date.now().toString(36).slice(-6);
const PASSWORD = "uat-only-password-i18n";
const src = fs.readFileSync(path.join(ROOT, "static/i18n/th.js"), "utf8");
const DICT = JSON.parse(src.slice(src.indexOf("=") + 1, src.lastIndexOf(";")));
const T = (en) => DICT[en] ?? en;
// Product and package names stay as they are in both languages (catalog and plans).
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "business_data/catalog.json"), "utf8"));
// Feature names the owner keeps in English in both languages (technical terms, 2026-10-09).
const NAMES = [...catalog.packages.map((p) => p.name), "Workday", "Essential", "Comprehensive", "Company Harness", "Process Explainability", "Runtime skills", "Typed tools"];
const KEYS = Object.entries(DICT).filter(([en, th]) => en !== th && /[A-Za-z]{2}/.test(en) && en.length >= 3).map(([en]) => en);

const CONTENT = [
  [".language-switch", "the TH/EN control names both languages on purpose"],
  ["[translate=no]", "content kept in its own language: chat messages, model answers, report values, source titles"],
];
const CONTENT_SEL = CONTENT.map(([s]) => s).join(", ");
const ALLOW = [];
const allowed = (lang, u) => ALLOW.some((a) => a.lang === lang && a.kind === u.kind && a.re.test(u.text));

const started = new Date().toISOString();
const results = [];
const rows = [];
const consoleErrors = [];
const pageErrors = [];
let browser;
let judge = null;
let judgeStatus = "NOT_RUN";
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
    record.error = String(e?.message || e).replace(/\u001b\[\d+m/g, "").split("\n").filter((l) => l.trim()).slice(0, 8).join(" | ").slice(0, 2500);
  }
  record.ms = Date.now() - start;
  if (notes.length) record.note = notes.join(" ");
  results.push(record);
  console.log(`${record.ok ? "PASS" : "FAIL"} ${id} ${title} (${record.ms} ms)${record.error ? "\n     " + record.error : ""}${record.note ? "\n     note: " + record.note : ""}`);
}

const expected = new WeakMap();
function watch(page, label) {
  page.on("pageerror", (e) => pageErrors.push(`${label} ${safePath(page)}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: "reduce", ...opts });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(45000);
  return ctx;
}
async function newPage(ctx, label) {
  const page = await ctx.newPage();
  watch(page, label);
  return page;
}
const setLang = (ctx, lang) => ctx.addCookies([{ name: "labclear_language", value: lang, url: BASE, sameSite: "Lax" }]);
async function settle(page) {
  await page.evaluate(() => document.fonts?.ready);
  await poll(() => page.evaluate(() => !document.querySelector("[aria-busy=true]")), { timeout: 20000, message: "view still busy" }).catch(() => {});
  await wait(350);
}
async function me(ctx) {
  const r = await ctx.request.get(API + "/session");
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

/* ------------------------------------------------------------------ one page, one language, one width */

async function audit(page, target, lang, width) {
  const r = await page.evaluate(auditPage, { lang, keys: KEYS, contentSel: CONTENT_SEL, names: NAMES });
  const midWord = await judgeBreaks(judge, r);
  const file = `${target.id}-${lang}-${width}.jpg`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true, type: "jpeg", quality: 62, animations: "disabled", caret: "hide" });
  const row = {
    target: target.id,
    area: target.area,
    path: safePath(page),
    role: target.role,
    lang,
    width,
    html_lang: r.htmlLang,
    title: r.title,
    switch: r.switch,
    untranslated: uniq(r.untranslated.filter((u) => !allowed(lang, u)), (x) => x.kind + x.text + x.where),
    allowed: uniq(r.untranslated.filter((u) => allowed(lang, u)), (x) => x.kind + x.text),
    split_words: uniq(r.splitWords, (x) => x.word + x.where),
    mid_word_breaks: uniq(midWord, (x) => x.split + x.where),
    thai_breaks_checked: r.breaks.reduce((n, b) => n + b.pairs.length, 0),
    clipped: uniq(r.clipped, (x) => x.where),
    overflow: r.overflow,
    texts_checked: r.texts,
    screenshot: path.relative(ROOT, path.join(SHOTS, file)),
  };
  rows.push(row);
  return row;
}

const chromeText = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("header, nav, button, label, h1, h2, .view-intro, .sim-note")]
      .filter((e) => !e.closest("[translate=no]"))
      .map((e) => e.textContent || "")
      .join("|")
      .replace(/\s+/g, " ")
      .trim(),
  );
/** Click the other language on the page's own TH/EN control: the page follows without reloading. */
async function switchCheck(page, to) {
  const before = await chromeText(page);
  const marker = await page.evaluate(() => (window.__i18nMarker = Math.random()));
  const sw = page.locator(".language-switch:visible").first();
  await sw.locator(`button[data-lang="${to}"]`).click();
  await poll(() => page.evaluate((l) => document.documentElement.lang === l, to), { timeout: 15000, message: `html lang did not become ${to}` });
  await poll(() => sw.locator(`button[data-lang="${to}"]`).getAttribute("aria-pressed").then((v) => v === "true"), { timeout: 15000, message: "switch not pressed" });
  await wait(300);
  const after = await chromeText(page);
  const cookie = (await page.context().cookies(BASE)).find((c) => c.name === "labclear_language")?.value;
  assert(cookie === to, `cookie ${cookie} after switching to ${to}`);
  const same = await page.evaluate((m) => window.__i18nMarker === m, marker);
  assert(same, "the page reloaded to switch language (expected an in-place switch)");
  return { changed: before !== after };
}

/* ------------------------------------------------------------------ targets */

async function appReady(page) {
  await page.locator(".workspace-header").waitFor({ timeout: 30000 });
  await poll(() => page.evaluate(() => {
    const c = document.getElementById("content");
    const chat = document.getElementById("chat-view");
    return (chat && !chat.hidden) || (c && !c.hasAttribute("aria-busy") && c.children.length && !c.querySelector(".skeleton"));
  }), { timeout: 30000, message: "workspace view did not load" });
}
const PUBLIC = [
  ["home", "Landing", "/"],
  ["packages", "Package", "/packages"],
  ["package", "Package", "/packages/P02"],
  ["compare", "Package", "/compare?ids=P01,P02"],
  ["centers", "Website", "/centers"],
  ["help", "Website", "/help"],
  ["privacy", "Website", "/privacy"],
  ["sources", "Website", "/sources"],
  ["lab-reports", "Lab Report", "/lab-reports"],
  ["organizations", "Organization", "/organizations"],
  ["hospital-links", "Package", "/hospital-links"],
  ["not-found", "Website", "/this-page-does-not-exist"],
];
const APP = [
  ["app-chat", "Chatbot", "/app"],
  ["app-packages", "Package", "/app?view=packages"],
  ["app-book", "Package", "/app?view=book"],
  ["app-bookings", "Package", "/app?view=bookings"],
  ["app-labs", "Lab Report", "/app?view=labs"],
  ["app-reports", "Lab Report", "/app?view=reports"],
  ["app-plan", "Lab Report", "/app?view=plan"],
  ["app-notifications", "Chatbot", "/app?view=notifications"],
];
const STAFF = ["overview", "staff", "operations", "customers", "payments", "notifications", "catalog-admin", "centers", "roles", "harness", "knowledge", "ai", "channels", "audit"];
// Admin views with something to open: the first skill and tool, and the first knowledge record's PDF page.
const STAFF_PREPARE = {
  harness: async (page) => {
    for (const d of (await page.locator(".admin-harness details.admin-disclosure").all()).slice(0, 1)) await d.locator("summary").first().click();
  },
  knowledge: async (page) => {
    await page.locator(".knowledge-item").first().click();
    await page.locator(".pdf-page[src]").waitFor({ timeout: 20000 });
  },
};

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, headless: true, args: ["--no-sandbox"] });
  const health = await fetch(BASE + "/health").catch(() => null);
  if (!health?.ok) throw new Error(`The website is not answering at ${BASE}/health`);
  const candidate = (await health.json()).commit;
  ({ judge, status: judgeStatus } = await startJudge(ROOT));
  console.log(`Thai line-break check: ${judgeStatus}`);

  const guestCtx = await newContext();
  const custCtx = await newContext();
  const adminCtx = await newContext();
  const setup = {};
  await scenario("I18N-00", "Setup: a fresh customer (synthetic report confirmed, one chat answer, organization editor) and the admin", async ({ note }) => {
    const p = await newPage(custCtx, "customer");
    await p.goto(BASE + "/app", { waitUntil: "load" });
    await appReady(p);
    await p.locator("#account-open").click();
    const m = p.locator("#modal");
    await m.locator('input[type="text"]').first().fill(`i18n-${RUN}@example.invalid`);
    await m.locator('input[type="password"]').fill(PASSWORD);
    await m.locator(".form-actions button").nth(1).click(); // Create account
    await poll(async () => (await me(custCtx)).user?.registered, { timeout: 20000, message: "customer account not created" });
    setup.userId = (await me(custCtx)).user.id;
    const read = await call(custCtx, "POST", "/demos/03_B_Lipid/read");
    const fields = read.data.fields.map((f) => ({ name: f.name, value: f.value, unit: f.unit || "", reference: f.reference || "", printed_flag: f.printed_flag || "" }));
    await call(custCtx, "POST", "/reports/confirm", { report_id: read.id, fields, label: "Synthetic lipid report", collected_date: "2026-10-01", same_person_confirmed: true });
    setup.reportId = read.id;
    await p.goto(BASE + "/app", { waitUntil: "load" });
    await appReady(p);
    await p.locator("#message").fill("UI_TEST_SOURCES");
    await p.locator("#send").click();
    await p.locator("#messages article.turn.ai .message-body").first().waitFor({ timeout: 30000 });
    // The real agent pipeline with offline provider doubles (scripts/dev_mock_api.py, DEV_AGENT=pipeline):
    // harness, typed-tool and skill steps under Process Explainability, plus official hospital links.
    await p.locator("#message").fill("แนะนำแพ็กเกจตรวจสุขภาพประจำปีหน่อย");
    await p.locator("#send").click();
    await poll(() => p.locator("#messages article.turn.ai .message-body").count().then((n) => n >= 2), { timeout: 60000, message: "pipeline answer missing" });
    await p.close();
    const a = await newPage(adminCtx, "admin");
    await a.goto(BASE + "/staff", { waitUntil: "load" });
    const am = a.locator("#modal");
    await am.locator('input[type="text"]').first().fill("admin");
    await am.locator('input[type="password"]').fill("1234");
    await am.locator(".form-actions button").first().click();
    await a.locator("nav.side-nav").waitFor({ timeout: 30000 });
    await poll(async () => (await me(adminCtx)).user?.role === "manager", { timeout: 20000, message: "admin not signed in" });
    await a.close();
    note(`customer ${setup.userId}, report ${setup.reportId}.`);
  });

  const all = [
    ...PUBLIC.map(([id, area, p]) => ({ id, area, path: p, role: "guest", ctx: guestCtx, ready: (pg) => pg.locator("main h1, main h2").first().waitFor({ timeout: 20000 }) })),
    { id: "app-chat-guest", area: "Chatbot", path: "/app", role: "guest", ctx: guestCtx, ready: appReady, draft: true, prepare: askPackages },
    ...APP.map(([id, area, p]) => ({ id, area, path: p, role: "customer", ctx: custCtx, ready: appReady, draft: id === "app-chat", prepare: id === "app-chat" ? openReceipt : null })),
    { id: "lab-report", area: "Lab Report", path: () => "/lab-report/" + encodeURIComponent(setup.reportId), role: "customer", ctx: custCtx, ready: (pg) => pg.locator("main table tbody tr, main .lab-table, main h1").first().waitFor({ timeout: 20000 }) },
    { id: "organizations-signed-in", area: "Organization", path: "/organizations", role: "customer", ctx: custCtx, ready: (pg) => pg.locator("main h1").first().waitFor() },
    ...STAFF.map((v) => ({ id: "staff-" + v, area: "Staff/Admin", path: "/staff" + (v === "overview" ? "" : "?view=" + v), role: "admin", ctx: adminCtx, ready: appReady, prepare: STAFF_PREPARE[v] || null })),
  ];

  for (const target of all) {
    await scenario(`I18N-P-${target.id}`, `${target.area} ${typeof target.path === "string" ? target.path : "/lab-report/<id>"} (${target.role}): TH and EN at ${WIDTHS.join("/")} px, in-place switch`, async ({ note }) => {
      const pth = typeof target.path === "function" ? target.path() : target.path;
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
            await page.goto(BASE + pth, { waitUntil: "load" });
            await target.ready(page);
            if (target.prepare) await target.prepare(page, lang);
            await settle(page);
            const row = await audit(page, target, lang, width);
            issues.push(...problems(row));
            for (const e of consoleErrors.slice(from)) if (e.startsWith(target.id + " ")) issues.push(`${lang}/${width}: console ${e}`);
            for (const e of pageErrors.slice(fromP)) if (e.startsWith(target.id + " ")) issues.push(`${lang}/${width}: pageerror ${e}`);
          }
          if (width === 390 || width === 1440) {
            // The page is in English now. A typed chat draft must survive both switches.
            const draft = target.draft ? `ร่าง ${RUN} draft` : null;
            if (draft) await page.locator("#message").fill(draft);
            const a = await switchCheck(page, "th");
            const b = await switchCheck(page, "en");
            if (draft) assert((await page.locator("#message").inputValue()) === draft, "the chat draft was lost when switching language");
            switches.push(`${width}px EN→TH ${a.changed ? "changed" : "same"}, TH→EN ${b.changed ? "changed" : "same"}`);
            if (!a.changed || !b.changed) issues.push(`${width}: interface text did not change when switching`);
          }
        }
      } finally {
        await page.close();
        await setLang(target.ctx, "th");
      }
      note(switches.join("; "));
      assert(!issues.length, issues.slice(0, 30).join(" || ") + (issues.length > 30 ? ` || … ${issues.length - 30} more` : ""));
    });
  }

  /* ---- interaction states in both languages */
  const stateRow = async (page, id, area, lang, width) => problems(await audit(page, { id, area, role: "state" }, lang, width), { switchRequired: false });

  await scenario("I18N-S-signin-error", "Sign-in dialog: wrong password error in TH and EN", async () => {
    const issues = [];
    for (const lang of LANGS) {
      const ctx = await newContext();
      try {
        await setLang(ctx, lang);
        const p = await newPage(ctx, "signin-error");
        expected.set(p, /401|Unauthorized|status of 4\d\d/i);
        await p.goto(BASE + "/app", { waitUntil: "load" });
        await appReady(p);
        await p.locator("#account-open").click();
        const m = p.locator("#modal");
        await m.locator('input[type="text"]').first().fill(`nobody-${RUN}@example.invalid`);
        await m.locator('input[type="password"]').fill("wrong-password-i18n");
        await m.locator(".form-actions button").first().click();
        await m.locator(".field-error:not([hidden])").waitFor({ timeout: 15000 });
        const msg = (await m.locator(".field-error").innerText()).trim();
        issues.push(...(await stateRow(p, "state-signin-error", "Chatbot", lang, 1440)));
        if (lang === "en" && /[ก-ฺเ-๛]/.test(msg)) issues.push(`en: error in Thai: ${msg}`);
        if (lang === "th" && !/[ก-ฺเ-๛]/.test(msg)) issues.push(`th: error not in Thai: ${msg}`);
      } finally {
        await ctx.close();
      }
    }
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-S-chat-failure", "Chat: a message that cannot be sent shows the failure in TH and EN", async () => {
    const issues = [];
    for (const width of [390, 1440])
      for (const lang of LANGS) {
        await setLang(custCtx, lang);
        const p = await newPage(custCtx, "chat-failure");
        expected.set(p, /Failed to load resource|net::ERR_FAILED|status of 5\d\d/i);
        try {
          await p.setViewportSize({ width, height: width < 800 ? 844 : 900 });
          await p.goto(BASE + "/app", { waitUntil: "load" });
          await appReady(p);
          await p.route("**/api/business/chat", (r) => r.abort("failed"));
          await p.locator("#message").fill("i18n failure check");
          await p.locator("#send").click();
          await p.locator("#messages .failure, .toast:not([hidden])").first().waitFor({ timeout: 20000 });
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

  await scenario("I18N-S-loading", "Loading states (slow workspace view, slow service desk) in TH and EN", async () => {
    const issues = [];
    for (const lang of LANGS)
      for (const [ctx, route, url, id, area] of [
        [custCtx, "**/api/business/reports*", "/app?view=reports", "state-loading-app", "Lab Report"],
        [adminCtx, "**/api/business/staff/overview*", "/staff", "state-loading-staff", "Staff/Admin"],
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
    for (const width of [390, 1440])
      for (const lang of LANGS) {
        await setLang(guestCtx, lang);
        const p = await newPage(guestCtx, "empty-search");
        try {
          await p.setViewportSize({ width, height: width < 800 ? 844 : 900 });
          await p.goto(BASE + "/packages?q=zzqxv", { waitUntil: "load" });
          await p.locator("[data-empty]").first().waitFor({ state: "visible", timeout: 15000 });
          await settle(p);
          issues.push(...(await stateRow(p, "state-empty-search", "Package", lang, width)));
        } finally {
          await p.close();
        }
      }
    await setLang(guestCtx, "th");
    assert(!issues.length, issues.join(" || "));
  });

  await scenario("I18N-Z", "No uncaught page errors during the run", async () => {
    assert(!pageErrors.length, [...new Set(pageErrors)].slice(0, 8).join(" | "));
  });

  for (const c of [guestCtx, custCtx, adminCtx]) await c.close().catch(() => {});
  judge?.stop();
  return candidate;
}

/** Chat answer: open "How this was checked" and the source list so their text is audited too. */
async function openReceipt(page) {
  const turn = page.locator("#messages article.turn.ai").last();
  if (!(await turn.count())) return;
  for (const b of await turn.locator("button.act[aria-expanded=false]").all()) await b.click().catch(() => {});
  await wait(300);
  // Bring "Process Explainability" (the answer receipt) into the screenshot.
  const receipt = turn.locator(".receipt").first();
  if (await receipt.count()) await receipt.scrollIntoViewIfNeeded().catch(() => {});
}
/** A guest asks a package question; the real pipeline (offline doubles) answers with official hospital links. */
async function askPackages(page, lang) {
  await page.locator("#message").fill(lang === "th" ? "แนะนำแพ็กเกจตรวจสุขภาพประจำปีหน่อย" : "Which annual health check package would you recommend?");
  await page.locator("#send").click();
  await page.locator("#messages article.turn.ai .external-offers").first().waitFor({ timeout: 60000 });
  await openReceipt(page);
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
  for (const r of rows) {
    const a = (byArea[r.area] ||= { pages: new Set(), rows: 0, rows_clean: 0 });
    a.pages.add(r.target);
    a.rows++;
    if (!problems(r, { switchRequired: r.role !== "state" }).length) a.rows_clean++;
  }
  const report = {
    started,
    finished: new Date().toISOString(),
    base: BASE,
    ui: "FastAPI website (templates/ + static/js), the main UI since 4.0.0-rc3",
    candidate_commit: candidate,
    mode: "MOCKED_TEST_ONLY for the language model and report reader (scripts/dev_mock_api.py); real UI, routes, sessions, CSRF, permissions.",
    widths: WIDTHS,
    languages: LANGS,
    content_exclusions: CONTENT.map(([selector, reason]) => ({ selector, reason })),
    explicit_language_regions: "elements with their own lang attribute are content in that language",
    reviewed_exceptions: ALLOW.map((a) => ({ lang: a.lang, kind: a.kind, pattern: String(a.re), reason: a.reason })),
    thai_line_break_check: judgeStatus,
    dictionary_strings: Object.keys(DICT).length,
    scenarios: results,
    passed: results.filter((r) => r.ok).length,
    failed,
    areas: Object.fromEntries(Object.entries(byArea).map(([k, v]) => [k, { pages: [...v.pages], page_language_width_rows: v.rows, rows_without_findings: v.rows_clean }])),
    rows,
    console_errors: [...new Set(consoleErrors)].slice(0, 40),
    page_errors: [...new Set(pageErrors)].slice(0, 20),
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "i18n-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\n${report.passed} passed, ${report.failed} failed -> ${path.join(OUT, "i18n-audit.json")}`);
  process.exitCode = failed ? 1 : 0;
}
