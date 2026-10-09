/*
 * LabClear integration 4.0.0-rc2 browser acceptance suite (UAT) for the Next.js website, customer
 * workspace (/app) and service desk (/staff), running against the Codex backend.
 *
 *   npm run uat                         # from web/, against http://localhost:3000
 *   BASE=http://localhost:3000 node tests/uat.mjs
 *
 * Origin: Claude's 4.0.0 suite (51 scenarios). Integration 4.0 keeps its scenarios and selectors
 * and rewrites only those that tested Claude-only backend contracts: keep-chat sign-in (now the
 * Codex rule: sign-in discards the guest chat, plus the delayed-response race), organization
 * documents (now Codex membership, draft/approve/revoke, excerpt search) and the AI providers view
 * (now six agents, two opt-in roles disabled by default, candidate registry). It adds the Codex
 * hospital links page. tests/uat-flags-off.mjs checks the same build with every new flag off.
 *
 * Runs against servers that are already up (next build + next start, and the real Codex API with
 * the offline AI stand-in, scripts/dev_mock_api.py). MOCKED_TEST_ONLY: the language model and the
 * report reader are test doubles, so this is UI/flow evidence (real routes, storage, sessions, CSRF,
 * permissions and state machines), never model or OCR quality evidence.
 *
 * Writes docs/evidence/integration-4.0-rc1/web-uat/uat.json and screenshots (UAT_OUT overrides);
 * exits 1 on any failure. The pages run in Thai (the default); selectors use the app's own
 * dictionary (lib/i18n/dict.th.json) through T("English source text").
 *
 * Sign-in budget: the API allows 8 sign-in attempts per IP per 15 minutes. A run signs in once per
 * role (admin, test-02) and once as test-01 from a guest chat, and reuses those browser contexts.
 * Other customers are fresh accounts created with "Create account" (not rate limited). Optional:
 *   UAT_ONLY=R4-02,UI-1      run only scenarios whose id starts with one of these prefixes
 *                            (results and screenshots then go to <tmp>/labclear-uat-partial)
 *   UAT_REUSE_AUTH=1|<dir>   keep role storage states between runs (outside the repo)
 *   UAT_DEBUG=1              save a screenshot of every open page when a scenario fails (tmp dir)
 *   UAT_HEADED=1             show the browser
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");
const ROOT = path.resolve(WEB, "..");
const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const API = BASE + "/api/business";
const ONLY = (process.env.UAT_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
// A partial run (UAT_ONLY) must not replace the release evidence: it writes to a temp folder.
const OUT = process.env.UAT_OUT ? path.resolve(process.env.UAT_OUT) : ONLY.length ? path.join(os.tmpdir(), "labclear-uat-partial") : path.join(ROOT, "docs/evidence/integration-4.0-rc1/web-uat");
const AUTH_DIR = !process.env.UAT_REUSE_AUTH ? "" : process.env.UAT_REUSE_AUTH === "1" ? path.join(os.tmpdir(), "labclear-uat-auth") : path.resolve(process.env.UAT_REUSE_AUTH);
const DEBUG_DIR = path.join(os.tmpdir(), "labclear-uat-debug");
const RUN = Date.now().toString(36).slice(-6);
const PASSWORD = "uat-only-password-rc1";
const SAMPLE = path.join(ROOT, "examples/thai_lab_reference_v3/png");
const PNG_GLUCOSE = path.join(SAMPLE, "04_B_Glucose_Urine.png");
const PNG_LIVER = path.join(SAMPLE, "01_A_Liver.png");

/* ------------------------------------------------------------------ language: Thai by default */

const DICT = JSON.parse(fs.readFileSync(path.join(WEB, "lib/i18n/dict.th.json"), "utf8"));
/** The Thai text the UI shows for an English source string (the app's own dictionary). */
const T = (en) => DICT[en] ?? en;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`));
const TF = (en, v) => fill(T(en), v);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A RegExp for a translated template, every {placeholder} matching any text. */
const TR = (en, flags = "") => new RegExp(esc(T(en)).replace(/\\\{\w+\\\}/g, ".+?"), flags);
const THAI = /[\u0E00-\u0E7F]/;

/* ------------------------------------------------------------------ results */

const started = new Date().toISOString();
const results = [];
const pageErrors = [];
const consoleErrors = [];
const shots = [];
let browser;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

async function poll(fn, { timeout = 10000, every = 250, message = "condition not met" } = {}) {
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
    record.error = String(e?.message || e)
      .replace(/\u001b\[\d+m/g, "")
      .split("\n")
      .filter((l) => l.trim() && !/^\s*-\s+(waiting|locator|attempting|retrying|element|\d+ ×)/.test(l))
      .slice(0, 6)
      .join(" | ")
      .slice(0, 900);
    if (process.env.UAT_DEBUG && browser) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
      let n = 0;
      for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await pg.screenshot({ path: path.join(DEBUG_DIR, `${id}-${n++}.png`) }).catch(() => {});
    }
  }
  record.ms = Date.now() - start;
  if (notes.length) record.note = notes.join(" ");
  results.push(record);
  console.log(`${record.ok ? "PASS" : "FAIL"} ${id} ${title} (${record.ms} ms)${record.error ? "\n     " + record.error : ""}${record.note ? "\n     note: " + record.note : ""}`);
}

/** Next.js dev-server chatter (HMR, Fast Refresh, dev overlay). Everything else is reported. */
const DEV_NOISE = /\[HMR\]|\[Fast Refresh\]|webpack-hmr|turbopack-hmr|__nextjs_original-stack-frame|next-devtools|Download the React DevTools/i;

/** Console errors a negative test causes on purpose (e.g. the 404 of an unknown page), per page. */
const expected = new WeakMap();
function expectErrors(page, re) {
  expected.set(page, re);
}

function watch(page, label) {
  page.on("pageerror", (e) => pageErrors.push(`${label} ${safePath(page)}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error" || DEV_NOISE.test(m.text())) return;
    if (expected.get(page)?.test(m.text())) return;
    consoleErrors.push({ label, path: safePath(page), text: m.text().slice(0, 400), at: Date.now() });
  });
  // Accept "leave page?" (guest chat guard) so reloads and navigations proceed.
  page.on("dialog", (d) => d.accept().catch(() => {}));
}
function safePath(page) {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "";
  }
}

async function newContext(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    acceptDownloads: true,
    ...opts,
  });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(45000);
  return ctx;
}
async function newPage(ctx, label) {
  const page = await ctx.newPage();
  watch(page, label);
  return page;
}
/** Navigate and wait until React has hydrated the header (clicks before that are lost). */
async function go(page, p, until = "load") {
  const r = await page.goto(BASE + p, { waitUntil: until });
  await hydrated(page);
  return r;
}
async function hydrated(page, selector = ".site-header button, .workspace-header button, main button") {
  await poll(
    () =>
      page.evaluate((sel) => {
        const isReact = (el) => !!el && Object.keys(el).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber"));
        const el = document.querySelector(sel);
        return isReact(document.body) && (!el || isReact(el));
      }, selector),
    { timeout: 20000, every: 100, message: `page ${safePath(page)} did not hydrate` },
  );
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), animations: "disabled", caret: "hide" });
  shots.push(name);
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const overflowInfo = (page) => page.evaluate(() => `${document.documentElement.scrollWidth} > ${innerWidth}`);

/** Runs in the page: Web Storage, document.cookie and every IndexedDB record decoded as text. */
async function readBrowserStorage() {
  const out = { local: Object.entries(localStorage), session: Object.entries(sessionStorage), cookie: document.cookie, idb: [], idbText: "" };
  const dbs = indexedDB.databases ? await indexedDB.databases() : [];
  const dec = new TextDecoder();
  const text = (v) => {
    if (v instanceof Uint8Array || v instanceof ArrayBuffer) return dec.decode(v);
    if (Array.isArray(v)) return v.map(text).join("");
    if (v && typeof v === "object") return Object.values(v).map(text).join(" ");
    return String(v ?? "");
  };
  for (const d of dbs) {
    out.idb.push(d.name);
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(d.name);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch(() => null);
    if (!db) continue;
    for (const s of db.objectStoreNames) {
      const rows = await new Promise((res) => {
        const r = db.transaction(s).objectStore(s).getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => res([]);
      });
      out.idbText += text(rows);
    }
    db.close();
  }
  return out;
}

/* ------------------------------------------------------------------ API helpers (same session as the page) */

async function me(ctx) {
  const r = await ctx.request.get(API + "/me");
  return r.ok() ? r.json() : { user: null, csrf: "" };
}
/** JSON call with the context's session cookie and CSRF header (signed-in users). */
async function call(ctx, method, p, data) {
  const { csrf } = await me(ctx);
  const r = await ctx.request.fetch(API + p, { method, data, headers: { "X-Business-CSRF": csrf || "" }, failOnStatusCode: false });
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  if (!r.ok()) throw new Error(`${method} ${p} -> ${r.status()} ${JSON.stringify(body)?.slice(0, 200)}`);
  return body;
}
const workspace = (ctx) => call(ctx, "GET", "/workspace");

/* ------------------------------------------------------------------ sign-in */

/** Fill the shared sign-in dialog. kind: "login" (Sign in) or "register" (Create account). */
async function useSignInDialog(page, email, password, { kind = "login", warnDiscard = false } = {}) {
  const dlg = page.locator("dialog.signin-dialog[open]");
  await dlg.waitFor();
  await dlg.getByLabel(T("Email or username")).fill(email);
  await dlg.getByLabel(T("Password"), { exact: true }).fill(password);
  // Codex rule: there is no "keep this chat" choice; the dialog warns that the guest chat is deleted.
  assert(!(await dlg.getByRole("checkbox").count()), "the sign-in dialog offers a keep-chat checkbox");
  if (warnDiscard) await dlg.locator(".guest-discard", { hasText: T("Signing in or creating an account discards this temporary chat and its images.") }).waitFor();
  await dlg.getByRole("button", { name: kind === "login" ? T("Sign in") : T("Create account"), exact: true }).click();
  const end = Date.now() + 20000;
  while (await dlg.count()) {
    const err = dlg.locator(".field-error");
    if (await err.count()) throw new Error(`${kind === "login" ? "Sign-in" : "Create account"} as ${email} failed: ${await err.innerText()}`);
    if (Date.now() > end) throw new Error("sign-in dialog did not close");
    await wait(200);
  }
}

const roles = {}; // name -> { ctx, page }
const ROLE_USER = { admin: "admin", t01: "test-01", t02: "test-02" };

async function restoreRole(name) {
  if (!AUTH_DIR) return null;
  const file = path.join(AUTH_DIR, name + ".json");
  if (!fs.existsSync(file)) return null;
  const ctx = await newContext({ storageState: file });
  const who = await me(ctx);
  if (who.user?.email === ROLE_USER[name]) return ctx;
  await ctx.close();
  return null;
}
async function saveRole(name, ctx) {
  if (!AUTH_DIR) return;
  fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  await ctx.storageState({ path: path.join(AUTH_DIR, name + ".json") });
}

/** admin: signs in from the website header (a manager is sent to the service desk). */
async function admin() {
  if (roles.admin) return roles.admin;
  let ctx = await restoreRole("admin");
  let page;
  if (ctx) {
    page = await newPage(ctx, "admin");
    await go(page, "/staff");
  } else {
    ctx = await newContext();
    page = await newPage(ctx, "admin");
    await go(page, "/");
    await page.locator(".site-header .nav-account").getByRole("button", { name: T("Sign in"), exact: true }).click();
    await useSignInDialog(page, "admin", "1234");
    await page.waitForURL(/\/staff/, { timeout: 30000 });
    await saveRole("admin", ctx);
  }
  await page.locator("nav.side-nav").waitFor({ timeout: 30000 });
  roles.admin = { ctx, page };
  return roles.admin;
}

/** A customer demo account signed in from the /app header. */
async function customer(name) {
  if (roles[name]) return roles[name];
  let ctx = await restoreRole(name);
  let page;
  if (ctx) {
    page = await newPage(ctx, name);
    await go(page, "/app");
  } else {
    ctx = await newContext();
    page = await newPage(ctx, name);
    await go(page, "/app");
    await page.locator(".ws-root .composer textarea").waitFor({ timeout: 30000 });
    await page.locator(".workspace-header .avatar-button").click();
    await useSignInDialog(page, ROLE_USER[name], "1234");
    await saveRole(name, ctx);
  }
  await page.getByRole("button", { name: `${T("Account")}: ${ROLE_USER[name]}` }).waitFor({ timeout: 30000 });
  roles[name] = { ctx, page };
  return roles[name];
}

/** A new customer account made through "Create account" in /app (not rate limited). */
async function freshCustomer(tag, label = tag) {
  const email = `uat-${RUN}-${tag}@example.invalid`;
  const ctx = await newContext();
  const page = await newPage(ctx, label);
  await go(page, "/app");
  await page.locator(".ws-root .composer textarea").waitFor({ timeout: 30000 });
  await page.locator(".workspace-header .avatar-button").click();
  await useSignInDialog(page, email, PASSWORD, { kind: "register" });
  await page.getByRole("button", { name: `${T("Account")}: ${email}` }).waitFor();
  return { ctx, page, email };
}

/* ------------------------------------------------------------------ workspace helpers */

const chat = (page) => page.locator("section.chat-view");
async function appReady(page) {
  await page.locator(".ws-root .workspace-header").waitFor({ timeout: 30000 });
  await page.locator(".ws-root main .view:not([aria-busy])").first().waitFor({ timeout: 30000 });
}
/** Send a chat message from /app and wait for the finished reply. Returns the last assistant turn. */
async function sendChat(page, text, { scope = chat(page), timeout = 30000 } = {}) {
  const finished = scope.locator("article.turn.ai:not(.thinking)");
  const before = await finished.count();
  await scope.locator("textarea").first().fill(text);
  await scope.getByRole("button", { name: T("Send message") }).click();
  await poll(async () => (await finished.count()) > before && !(await scope.locator("article.turn.thinking").count()), { timeout, message: `no reply to "${text}"` });
  return finished.last();
}
async function viewTitle(page, en) {
  await page.locator("#content .view-intro h2", { hasText: T(en) }).first().waitFor({ timeout: 20000 });
}
async function seeToast(page, re) {
  await page.locator("div.toast[role=status]:not([hidden])", { hasText: re }).waitFor({ timeout: 15000 });
}
async function fileChooser(page, trigger, files) {
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), trigger()]);
  await fc.setFiles(files);
}
const openDialog = (page) => page.locator("dialog.rs-dialog[open]").last();

/* ------------------------------------------------------------------ staff helpers */

async function staffView(page, view, extra = "") {
  await go(page, "/staff" + (view === "overview" ? "" : "?view=" + view) + extra);
  await page.locator("nav.side-nav").waitFor({ timeout: 30000 });
}

/* ------------------------------------------------------------------ the scenarios */

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", headless: !process.env.UAT_HEADED, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update"] });
  const health = await fetch(BASE + "/health").catch(() => null);
  if (!health?.ok) throw new Error(`The website or API is not answering at ${BASE}/health`);

  const keep = {}; // values shared between scenarios
  const nav = (page, en) => page.locator("nav.side-nav").getByRole("button", { name: new RegExp("^" + esc(T(en))) });

  /* ================================================================ 4.0.0: language */

  await scenario("R4-01", "Thai is the default; TH/EN switch keeps a typed chat draft and survives reload", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "lang");
      await go(p, "/");
      assert((await p.getAttribute("html", "lang")) === "th", "html lang is not th by default");
      const h1 = await p.locator("h1#hero-title").innerText();
      assert(h1.includes(T("Book the check.")) && THAI.test(h1), `headline is not the Thai one: ${h1}`);
      assert(!(await ctx.cookies()).some((c) => c.name === "labclear_language"), "a language cookie was set without a choice");
      await p.locator('.lc-hero-art[data-gl="live"], .lc-hero-art[data-gl="off"]').waitFor({ timeout: 8000 }).catch(() => {});
      await wait(800);
      await shot(p, "home-1440.png");

      await go(p, "/app");
      await appReady(p);
      const draft = `ร่างข้อความทดสอบ ${RUN} HbA1c`;
      const box = chat(p).locator("textarea").first();
      await box.fill(draft);
      const sw = p.getByRole("group", { name: "ภาษา / Language" });
      await sw.getByRole("button", { name: "EN", exact: true }).click();
      await poll(async () => (await p.getAttribute("html", "lang")) === "en", { message: "html lang did not switch to en" });
      await p.locator(".workspace-header nav").getByRole("button", { name: "Conversation", exact: true }).waitFor();
      await chat(p).getByRole("button", { name: "Send message" }).waitFor();
      assert((await box.inputValue()) === draft, "the typed chat draft was lost when switching language");
      assert((await sw.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")) === "true", "EN not marked as current");

      await p.reload({ waitUntil: "load" });
      await appReady(p);
      assert((await p.getAttribute("html", "lang")) === "en", "English did not survive reload");
      await p.locator(".workspace-header nav").getByRole("button", { name: "Conversation", exact: true }).waitFor();
      assert((await ctx.cookies()).some((c) => c.name === "labclear_language" && c.value === "en"), "language cookie not saved");

      await go(p, "/");
      assert((await p.locator("h1#hero-title").innerText()).includes("Book the check."), "home is not English after the switch");
      await p.getByRole("group", { name: "ภาษา / Language" }).getByRole("button", { name: "TH", exact: true }).click();
      await poll(async () => (await p.locator("h1#hero-title").innerText()).includes(T("Book the check.")), { message: "switching back to Thai did not update the page" });
      assert((await p.getAttribute("html", "lang")) === "th", "html lang not back to th");
    } finally {
      await ctx.close();
    }
  });

  /* ================================================================ 4.0.0: guest privacy */

  await scenario("R4-02", "Guest privacy: answer with sources, nothing in browser storage, empty after reload, old guest token revoked", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "guest");
      const tokens = [];
      p.on("request", async (r) => {
        if (!r.url().startsWith(API)) return;
        const h = await r.allHeaders().catch(() => ({}));
        const tok = h["x-labclear-guest"];
        if (tok && !tokens.includes(tok)) tokens.push(tok);
      });
      await go(p, "/app");
      await appReady(p);
      const note = chat(p).locator(".guest-note");
      await note.waitFor();
      assert((await note.innerText()).includes(T("Guest mode: this chat is not saved and is deleted when you refresh or close the page.")), "guest notice text");
      assert((await chat(p).locator("textarea").first().getAttribute("autocomplete")) === "off", "chat draft textarea must use autocomplete=off");

      const msg = `UAT-${RUN} HbA1c คืออะไร`;
      const answer = await sendChat(p, msg);
      const answerText = (await answer.locator(".answer").innerText()).trim();
      assert(answerText.includes("HbA1c"), "assistant answer missing");
      const answerBit = answerText.split("\n").find((l) => l.length > 20)?.slice(6, 40) || answerText.slice(0, 30);
      await answer.getByRole("button", { name: TF("View {n} sources", { n: 2 }) }).click();
      const links = answer.locator(".sources a");
      await links.first().waitFor();
      assert((await links.count()) >= 2, "expected 2 cited sources");
      await shot(p, "app-answer-1440.png");
      // Free-first harness: the receipt names the typed data tools and reviewed instruction modules the server used.
      await answer.getByRole("button", { name: T("How this was checked") }).click();
      const receipt = answer.locator(".receipt");
      await receipt.getByText(T("Data the server looked up")).waitFor();
      await receipt.getByText(T("Reviewed instruction modules")).waitFor();
      assert((await receipt.innerText()).includes(T("Medical knowledge search")), "receipt does not name the knowledge search tool");
      await shot(p, "app-receipt-1440.png");

      assert(tokens.length >= 1, "no X-LabClear-Guest header seen on API requests");
      const old = tokens[tokens.length - 1];
      const stores = await p.evaluate(readBrowserStorage);
      const cookies = await ctx.cookies();
      const blob = JSON.stringify([stores, cookies]);
      assert(!blob.includes(msg) && !blob.includes(answerBit), "chat text found in browser storage, cookies or IndexedDB");
      assert(!blob.includes(old), "guest token found in browser storage or cookies");
      assert(!cookies.some((c) => c.name === "labclear_session"), "a session cookie was set for a guest");
      assert(stores.local.every(([k]) => k === "rs-theme"), "localStorage holds more than the theme: " + stores.local.map(([k]) => k).join(", "));
      // Next dev keeps its own RSC debug stream in IndexedDB (__next_debug_channel, dev only); its
      // bytes are decoded into stores.idbText above and checked too. Any other database is a finding.
      const appDbs = stores.idb.filter((n) => !/^__next_/.test(n));
      assert(appDbs.length === 0, "IndexedDB databases created by the app: " + appDbs.join(", "));

      await p.reload({ waitUntil: "load" });
      await appReady(p);
      await chat(p).locator(".guest-note").waitFor();
      await chat(p).locator(".welcome").waitFor();
      assert((await chat(p).locator("article.turn").count()) === 0, "guest chat survived reload");
      assert(!(await p.content()).includes(msg), "message text still in the page after reload");
      const status = await poll(
        async () => {
          const r = await ctx.request.get(API + "/workspace", { headers: { "X-LabClear-Guest": old }, failOnStatusCode: false });
          return r.status() === 401 ? 401 : false;
        },
        { timeout: 8000, message: "old guest token still works after reload" },
      );
      assert(status === 401, "old guest token not rejected");
      await poll(async () => tokens.length >= 2 && tokens[tokens.length - 1] !== old, { timeout: 8000, message: "no new guest token after reload" });
    } finally {
      await ctx.close();
    }
  });

  /* ================================================================ integration: Codex guest sign-in rule */

  await scenario("R4-03", "Sign-in discards the guest chat (Codex): the dialog warns; the message is gone at once, after reload and in the account", async () => {
    const ctx = await newContext();
    let handedOver = false;
    try {
      const p = await newPage(ctx, "test-01");
      await go(p, "/app");
      await appReady(p);
      const msg = `UAT-${RUN} drop: ค่าน้ำตาลสะสมคืออะไร`;
      await sendChat(p, msg);
      await chat(p).locator(".guest-note").getByRole("button", { name: T("Sign in to save future chats") }).click();
      await useSignInDialog(p, "test-01", "1234", { warnDiscard: true });
      // Synchronous clear: no guest message may be visible once the dialog has closed.
      assert(!(await chat(p).locator("article.turn.user", { hasText: msg }).count()), "guest message still on screen right after sign-in");
      await p.getByRole("button", { name: `${T("Account")}: test-01` }).waitFor();
      roles.t01 = { ctx, page: p };
      handedOver = true;
      await saveRole("t01", ctx);
      await seeToast(p, new RegExp("^" + esc(T("Signed in.")) + "$"));
      assert(!(await chat(p).locator(".guest-note").count()), "guest notice still shown after sign-in");
      await p.reload({ waitUntil: "load" });
      await appReady(p);
      await wait(500);
      assert(!(await chat(p).locator("article.turn.user", { hasText: msg }).count()), "discarded guest message is back after reload");
      const w = await workspace(ctx);
      assert(!w.conversation.messages.some((m) => m.content === msg), "guest message stored in the account");
      assert(!JSON.stringify(w.chats).includes(msg.slice(0, 20)), "guest message listed as a chat");
    } finally {
      if (!handedOver) await ctx.close();
    }
  });

  await scenario("R4-04", "Identity race (Codex regression): a delayed guest /workspace response cannot repaint the new account's chat", async ({ note }) => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "race");
      await go(p, "/app");
      await appReady(p);
      const msg = `UAT-${RUN} race: ไขมันดีคืออะไร`;
      await sendChat(p, msg);
      let delayed = 0;
      let released = 0;
      await p.route("**/api/business/workspace", async (route) => {
        const guest = route.request().headers()["x-labclear-guest"];
        if (!guest) return route.continue();
        delayed++;
        const response = await route.fetch();
        await wait(3500);
        released++;
        await route.fulfill({ response }).catch(() => {});
      });
      // The chat polls /workspace every 4 s; wait until a guest response is held back.
      await poll(async () => delayed > 0, { timeout: 12000, message: "no guest /workspace request was observed" });
      await p.locator(".workspace-header .avatar-button").click();
      const email = `uat-${RUN}-race@example.invalid`;
      await useSignInDialog(p, email, PASSWORD, { kind: "register", warnDiscard: true });
      assert(!(await chat(p).locator("article.turn.user", { hasText: msg }).count()), "guest message visible right after creating the account");
      await p.getByRole("button", { name: `${T("Account")}: ${email}` }).waitFor();
      await poll(async () => released >= delayed, { timeout: 12000, message: "the delayed guest response was never released" });
      for (let i = 0; i < 6; i++) {
        assert(!(await chat(p).locator("article.turn.user", { hasText: msg }).count()), "a delayed guest response repainted the account's chat");
        await wait(250);
      }
      await p.unroute("**/api/business/workspace");
      note(`${delayed} guest /workspace response(s) held for 3.5 s across the sign-up.`);
      const w = await workspace(ctx);
      assert(!w.conversation.messages.some((m) => m.content === msg), "guest message stored in the new account");
    } finally {
      await ctx.close();
    }
  });

  /* ================================================================ public pages */

  await scenario("R4-09", '/packages: Thai search "น้ำตาล" finds the glucose packages', async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "packages");
      await go(p, "/packages");
      const total = Number((await p.locator("#results-title").innerText()).replace(/[^\d]/g, ""));
      await p.locator("#filters input[name=q]").fill("น้ำตาล");
      await p.waitForURL(/[?&]q=/);
      assert(decodeURIComponent(p.url()).includes("q=น้ำตาล"), "query not kept in the address bar");
      await poll(async () => Number((await p.locator("#results-title").innerText()).replace(/[^\d]/g, "")) < total, { message: "results did not narrow" });
      const rows = p.locator("[data-results] article.pkg-row");
      const n = await rows.count();
      assert(n > 0, "no package found for น้ำตาล");
      for (let i = 0; i < n; i++) assert(/glucose|hba1c/i.test(await rows.nth(i).innerText()), `result ${i + 1} has no glucose test`);
      const names = await rows.locator("h3").allInnerTexts();
      assert(names.some((x) => /Glucose Follow-up/.test(x)) && names.some((x) => /HbA1c/.test(x)), "Glucose Follow-up / HbA1c Add-on not found: " + names.join(", "));
    } finally {
      await ctx.close();
    }
  });

  await scenario("R4-10", "Compare two packages side by side", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "compare2");
      await go(p, "/packages");
      for (const id of ["P01", "P02"]) await p.locator(`article[data-package="${id}"] .compare-toggle input`).check();
      const tray = p.locator("aside.compare-tray");
      await tray.getByRole("link", { name: TF("Compare {n}", { n: 2 }) }).click();
      await p.waitForURL(/\/compare\?ids=P01,P02/);
      const head = await p.locator("table.compare-table thead th").allInnerTexts();
      assert(head.length === 3 && head.join(" ").includes("Essential Check") && head.join(" ").includes("Workday Check"), "compare header: " + head.join(" | "));
      assert((await p.locator("table.compare-table tbody tr").count()) >= 5, "too few compare rows");
      const body = await p.locator("table.compare-table").innerText();
      assert(body.includes("฿1,190") && body.includes("฿1,690"), "prices missing in comparison");
      assert(body.includes(T("Not included")) && body.includes(T("Included")), "included / not included cells missing");
    } finally {
      await ctx.close();
    }
  });

  await scenario("R4-11", "/sources lists the reviewed records grouped by publisher type", async ({ note }) => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "sources");
      await go(p, "/sources");
      const all = p.locator(".pub-chips button.chip").first();
      const total = Number(await all.locator(".pub-chip-n").innerText());
      assert(total === 58, `the active Codex corpus has 58 reviewed records, the page shows ${total}`);
      note("58 reviewed records (Codex active corpus; Claude's 77 offline-authored records are in the acquisition queue, not active).");
      const groups = p.locator("section.pub-src-group");
      const g = await groups.count();
      assert(g >= 1, "no publisher-type groups");
      let sum = 0;
      for (let i = 0; i < g; i++) sum += await groups.nth(i).locator("li.pub-src").count();
      assert(sum === total, `grouped rows (${sum}) differ from the total (${total})`);
      const types = await p.locator(".pub-chips button.chip").count();
      assert(types === g + 1, "filter chips do not match the groups");
      note(`${g} publisher-type group(s).`);
      assert(g === 2, "expected two publisher-type groups (Thai hospitals, international reference)");
      if (types > 2) {
        await p.locator(".pub-chips button.chip").nth(1).click();
        assert((await groups.count()) === 1, "type chip did not filter to one group");
      }
      await p.locator(".pub-src-search input").fill("HbA1c");
      await poll(async () => Number((await p.locator(".pub-chips button.chip").first().locator(".pub-chip-n").innerText())) < total, { message: "search did not narrow the sources" });
    } finally {
      await ctx.close();
    }
  });

  await scenario("R4-12", "Ctrl+K search opens, finds a package from Thai words and navigates", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "search");
      await go(p, "/");
      await p.locator("h1#hero-title").waitFor();
      await p.keyboard.press("Control+k");
      const dlg = p.locator("dialog.search-dialog[open]");
      await dlg.waitFor();
      await poll(async () => (await p.evaluate(() => document.activeElement?.id)) === "search-input", { message: "search input not focused" });
      await p.keyboard.type("น้ำตาล");
      const pkg = dlg.locator('#search-results [role=option]', { hasText: T("Package") }).first();
      await pkg.waitFor();
      assert(/glucose|hba1c/i.test(await pkg.innerText()), "first package hit is not a glucose package");
      await p.keyboard.press("Enter");
      await p.waitForURL(/\/packages\/P\d+/);
      await p.locator("main h1").waitFor();
      assert(!(await dlg.count()), "search dialog still open after navigating");
      await p.keyboard.press("Control+k");
      await dlg.waitFor();
      await p.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden" });
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-01", "Home: theme toggle changes and persists; the hero search pill opens search", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "home");
      await go(p, "/");
      const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await p.locator(".site-header button.theme-toggle").click();
      const theme = await p.evaluate(() => document.documentElement.dataset.theme);
      const after = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert(theme && before !== after, "theme toggle did not change the page");
      await p.reload({ waitUntil: "load" });
      assert((await p.evaluate(() => document.documentElement.dataset.theme)) === theme, "theme not persisted");
      await p.locator("button.lc-search").click();
      await p.locator("dialog.search-dialog[open]").waitFor();
      await p.keyboard.press("Escape");
      await p.locator("dialog.search-dialog[open]").waitFor({ state: "hidden" });
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-02", "Catalog: filter, URL state, chip removal, empty state, reset, sort, back/forward", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "catalog");
      const count = async () => Number((await p.locator("#results-title").innerText()).replace(/[^\d]/g, ""));
      await go(p, "/packages");
      const total = await count();
      assert(total >= 10, "catalog too small: " + total);
      await p.getByLabel(T("Organizations (20+ people)")).check();
      await p.waitForURL(/segment=organization/);
      await poll(async () => (await count()) === 3, { message: "organization filter count" });
      await p.getByRole("button", { name: TF("Remove filter: {name}", { name: T("Organizations") }) }).click();
      await poll(async () => (await count()) === total, { message: "chip removal did not restore the list" });
      await p.locator("#filters input[name=q]").fill("zzz-no-such-test");
      await p.locator("[data-empty]").waitFor();
      await p.locator("[data-empty]").getByRole("button", { name: T("Clear filters") }).click();
      await poll(async () => (await count()) === total, { message: "reset did not restore the list" });
      assert(!(await p.locator("[data-empty]").count()), "empty state still visible");
      await p.locator("#sort").selectOption("price_asc");
      await p.waitForURL(/sort=price_asc/);
      await wait(300);
      const prices = (await p.locator("[data-results] .pkg-price strong").allInnerTexts()).map((x) => Number(x.replace(/[^\d]/g, "")));
      assert(prices.every((v, i) => i === 0 || prices[i - 1] <= v), "not sorted by price ascending");
      await p.getByLabel(T("Organizations (20+ people)")).check();
      await p.waitForURL(/segment=organization/);
      await p.goBack();
      await p.waitForURL((u) => !/segment=organization/.test(u.toString()));
      await poll(async () => (await count()) === total, { message: "Back did not restore the unfiltered list" });
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-03", "Compare: tray limit of three, compare table, assistant hand-off link, clear", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "compare3");
      await go(p, "/packages");
      for (const id of ["P01", "P02", "P03"]) await p.locator(`article[data-package="${id}"] .compare-toggle input`).check();
      await p.locator('article[data-package="P04"] .compare-toggle input').click();
      await seeToast(p, T("You can compare up to three health checks. Remove one first."));
      assert(!(await p.locator('article[data-package="P04"] .compare-toggle input').isChecked()), "a fourth package was accepted");
      await p.locator("aside.compare-tray").getByRole("link", { name: TF("Compare {n}", { n: 3 }) }).click();
      await p.waitForURL(/compare\?ids=P01,P02,P03/);
      assert((await p.locator("table.compare-table tbody tr").count()) >= 8, "compare rows");
      const ask = await p.getByRole("link", { name: T("Ask the assistant to compare for me") }).getAttribute("href");
      assert(ask.includes("compare=P01,P02,P03"), "assistant link: " + ask);
      await p.getByRole("link", { name: T("Clear comparison") }).click();
      await p.waitForURL(/\/packages$/);
      assert(!(await p.locator("aside.compare-tray").count()), "tray still visible after clearing");
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-04", "Package page: CTA opens the booking view with the package chosen; unknown package is a 404", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "package");
      await go(p, "/packages/P02");
      await p.locator("main").getByRole("link", { name: T("Request an appointment") }).click();
      await p.waitForURL(/view=book/);
      await p.locator("#book-pkg").waitFor();
      assert((await p.locator("#book-pkg").inputValue()) === "P02", "package not preselected");
      expectErrors(p, /status of 404/);
      const r = await go(p, "/packages/P99");
      assert(r.status() === 404, "unknown package status " + r.status());
      await p.getByRole("heading", { name: T("Page not found") }).waitFor();
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-27", "Website navigation: Health checks menu opens and closes with Escape; AI Lab Report page shows the Plus price", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "site-nav");
      await go(p, "/");
      await p.locator(".nav-drop-btn").click();
      await p.locator("#menu-checks").getByRole("link", { name: new RegExp(esc(T("Compare packages"))) }).waitFor();
      await p.keyboard.press("Escape");
      await p.locator("#menu-checks").waitFor({ state: "hidden" });
      await go(p, "/lab-reports");
      await p.getByRole("heading", { level: 1 }).waitFor();
      assert((await p.getByText("฿355").count()) > 0, "Plus price ฿355 missing");
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-24", "Assistant dock on a package page: page-aware, shortcut goes to the booking form, Escape closes", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "dock");
      await go(p, "/packages/P02");
      await p.locator("button.dock-launch").click();
      const dock = p.locator("section.dock.chat-dock");
      await dock.waitFor();
      await dock.locator(".dock-context", { hasText: TF("Answers with {name} in mind.", { name: "Workday Check" }) }).waitFor();
      await dock.locator(".guest-note").waitFor();
      await dock.locator("textarea").fill("UI_TEST_DOCK");
      await dock.getByRole("button", { name: T("Send message") }).click();
      const link = dock.getByRole("link", { name: TF("Book {name}", { name: "Workday Check" }) });
      await link.waitFor({ timeout: 30000 });
      await link.click();
      await p.waitForURL(/view=book.*package=P02.*branch=BKK01|view=book.*branch=BKK01.*package=P02/);
      await p.locator("#book-branch").waitFor();
      assert((await p.locator("#book-branch").inputValue()) === "BKK01", "center not prefilled from the shortcut");
      await go(p, "/packages/P02");
      await p.locator("button.dock-launch").click();
      await dock.waitFor();
      await dock.locator("textarea").focus();
      await p.keyboard.press("Escape");
      await dock.waitFor({ state: "hidden" });
    } finally {
      await ctx.close();
    }
  });

  /* ================================================================ sign-in, roles and permissions */

  await scenario("UI-29", "Sign-in by typing demo accounts (none listed): admin from the website goes to the service desk; test-02 has Plus", async () => {
    const a = await admin();
    assert(new URL(a.page.url()).pathname === "/staff", "admin did not land on /staff");
    assert(!(await a.page.locator(".demo-pick").count()), "demo accounts are listed");
    const b = await customer("t02");
    await go(b.page, "/app?view=plan");
    await b.page.locator(".plan-card.featured").getByText(T("Current plan")).waitFor();
  });

  await scenario("R4-07", "Customer on /staff sees the staff sign-in gate; staff APIs refuse a customer", async () => {
    const c = roles.t01 || (await customer("t01"));
    const p = await newPage(c.ctx, "t01-staff");
    try {
      await go(p, "/staff");
      await p.getByText(T("Staff sign-in required")).waitFor();
      const dlg = p.locator("dialog.signin-dialog[open]");
      await dlg.getByRole("heading", { name: T("Staff sign-in") }).waitFor();
      assert(!(await p.locator("nav.side-nav").count()), "staff navigation shown to a customer");
      await p.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden" });
      for (const path of ["/staff/inbox", "/staff/dashboard", "/staff/ai-providers", "/staff/budget"]) {
        const r = await c.ctx.request.get(API + path, { failOnStatusCode: false });
        assert(r.status() === 403, `customer GET ${path} -> ${r.status()}`);
      }
      // Codex membership is manager-only: a customer cannot add itself to an organization.
      const self = (await me(c.ctx)).user.id;
      const join = await c.ctx.request.put(API + "/organization-documents/membership", { data: { user_id: self, organization_id: "org_self", role: "editor" }, headers: { "X-Business-CSRF": (await me(c.ctx)).csrf }, failOnStatusCode: false });
      assert(join.status() === 403, "customer self-membership not refused: " + join.status());
      const put = await c.ctx.request.put(API + "/staff/catalog/P01", { data: { price_thb: 1, active: true }, headers: { "X-Business-CSRF": (await me(c.ctx)).csrf }, failOnStatusCode: false });
      assert(put.status() === 403, "customer price edit not refused: " + put.status());
      await go(p, "/app?view=staff");
      await appReady(p);
      await chat(p).waitFor();
      assert(new URL(p.url()).pathname === "/app", "customer was routed away from /app");
    } finally {
      await p.close();
    }
  });

  /* ================================================================ 4.0.0: staff desk */

  await scenario("R4-06", "Staff desk (admin): overview, inbox, appointments, AI providers on the Codex contract, organization membership", async ({ note }) => {
    const { page: s, ctx } = await admin();
    await staffView(s, "overview");
    await s.locator(".kpi-grid .kpi").first().waitFor({ timeout: 20000 });
    assert((await s.locator(".kpi-grid .kpi").count()) >= 4, "overview tiles missing");
    assert((await s.locator(".workspace-header h1").innerText()) === T("Overview"), "overview title");
    await shot(s, "staff-overview-1440.png");
    const views = [
      ["Inbox", ".metric-grid"],
      ["Appointments", '[role=group][aria-label="' + T("Show appointments") + '"]'],
      ["AI providers", "#sd-ai-summary"],
      ["Organization membership", "#content .view-intro"],
    ];
    for (const [en, sel] of views) {
      await nav(s, en).click();
      await s.locator(".workspace-header h1", { hasText: T(en) }).waitFor();
      await s.locator(sel).first().waitFor({ timeout: 20000 });
      if (en === "AI providers") {
        const table = s.locator("table.sd-ai-table");
        await table.waitFor();
        const rows = await table.locator("tbody tr").count();
        assert(rows === 9, `expected 9 AI steps (language model, 6 agents, safety, OCR), found ${rows}`);
        const raw = await (await ctx.request.get(API + "/staff/ai-providers")).text();
        assert(!/sk-(or|ant|proj)-[A-Za-z0-9_-]{12,}/.test(raw), "an API key is returned to the browser");
        const view = JSON.parse(raw);
        assert(Object.keys(view.agents).length === 6, "the API does not list six agents");
        assert(view.free_policy && view.free_policy.active === false, "the free-only trial policy must be off in a normal deployment");
        assert(view.harness && view.harness.tools.length === 8 && view.harness.skills.modules.length === 8, "harness tools/skills not reported");
        await s.getByRole("heading", { name: T("Free-only trial policy") }).waitFor();
        await s.getByRole("heading", { name: T("Conversation harness") }).waitFor();
        assert(view.agents.medical_analyzer.config_status !== "SCHEMA_CHECK_ONLY" && view.agents.thai_composer.config_status !== "SCHEMA_CHECK_ONLY", "an opt-in role is configured by default");
        const agents = s.locator("section.agents-card .agent-row");
        assert((await agents.count()) === 6, "expected six agent rows, found " + (await agents.count()));
        for (const role of ["Medical analyzer", "Thai composer"]) {
          const row = agents.filter({ has: s.getByText(T(role), { exact: true }) });
          await row.locator(".badge", { hasText: T("Disabled until configured") }).waitFor();
          const pick = s.getByLabel(TF("Model for the {agent}", { agent: T(role) }));
          assert((await pick.inputValue()) === "shared", role + " is not disabled by default");
          await pick.selectOption("own");
          const form = row.locator("form.ai-form");
          await form.waitFor();
          assert(await form.getByLabel(T("Reviewed OpenRouter endpoint IDs")).isVisible(), role + ": endpoint allowlist field missing");
          assert((await form.getByLabel(T("Input price (THB per 1M tokens)")).inputValue()) === "", role + ": a default price is prefilled");
          await pick.selectOption("shared");
        }
        const registry = s.locator("#sd-registry");
        await registry.waitFor();
        const candidates = await s.locator("section:has(#sd-registry) ul li").count();
        assert(candidates >= 1, "candidate registry is empty");
        note(`${rows} AI steps; ${candidates} registry candidates shown as metadata only.`);
        await shot(s, "staff-ai-1440.png");
      }
      if (en === "Organization membership") {
        await s.locator("form", { has: s.getByLabel(T("Organization ID")) }).waitFor();
      }
    }
  });

  /* ================================================================ 4.0.0: booking */

  await scenario("R4-08", "Booking: test-01 requests a time, sees it in My appointments; admin confirms; the customer sees Confirmed", async () => {
    const c = roles.t01 || (await customer("t01"));
    const s = (await admin()).page;
    const p = c.page;
    await go(p, "/app?view=book");
    await p.locator("#book-pkg").waitFor();
    await p.locator("#book-pkg").selectOption("P01");
    await p.locator("#book-branch").selectOption("BKK01");
    const chips = p.locator(".date-chips button.chip");
    await chips.nth(2 + (parseInt(RUN, 36) % 3)).click();
    const slot = p.locator(".slot-grid button.slot:not([disabled])").first();
    await slot.waitFor();
    const time = (await slot.locator("span").innerText()).trim();
    await slot.click();
    assert((await slot.getAttribute("aria-pressed")) === "true", "slot not selected");
    const before = (await workspace(c.ctx)).bookings.length;
    await p.locator("aside.summary").getByRole("button", { name: T("Send appointment request") }).click();
    await viewTitle(p, "My appointments");
    const w = await workspace(c.ctx);
    assert(w.bookings.length === before + 1, "expected exactly one new booking");
    const b = w.bookings.sort((x, y) => y.created - x.created)[0];
    assert(b.state === "requested" && b.data.time === time, "booking state/time: " + b.state + " " + b.data.time);
    const ref = b.id.slice(-8);
    keep.t01Booking = b.id;
    const mine = p.locator("article.record", { hasText: TF("Ref {ref}", { ref }) });
    await mine.waitFor();
    await mine.locator(".badge", { hasText: T("Awaiting confirmation") }).waitFor();

    await staffView(s, "operations", "&filter=requested");
    const row = s.locator("article.record", { hasText: ref });
    await row.waitFor({ timeout: 20000 });
    await row.getByRole("button", { name: T("Confirm appointment") }).click();
    await seeToast(s, T("Confirmed. The customer was notified."));
    await row.waitFor({ state: "detached" });

    await go(p, "/app?view=bookings");
    await viewTitle(p, "My appointments");
    const done = p.locator("article.record", { hasText: TF("Ref {ref}", { ref }) });
    await done.locator(".badge", { hasText: new RegExp("^" + esc(T("Confirmed")) + "$") }).waitFor();
    const ics = await done.getByRole("link", { name: T("Add to calendar (.ics)") }).getAttribute("href");
    const cal = await c.ctx.request.get(BASE + ics);
    assert(cal.ok() && (await cal.text()).includes("BEGIN:VEVENT"), "calendar file");
  });

  await scenario("UI-15", "Test payment for the confirmed visit: PromptPay simulator, paid state persists; manager approves a refund; unknown payment page", async () => {
    assert(keep.t01Booking, "needs the confirmed booking from R4-08");
    const c = roles.t01;
    const p = c.page;
    const ref = keep.t01Booking.slice(-8);
    await go(p, "/app?view=bookings");
    const rec = p.locator("article.record", { hasText: TF("Ref {ref}", { ref }) });
    await rec.getByRole("button", { name: T("Pay with test PromptPay") }).click();
    await p.waitForURL(/\/pay\/sim\//);
    await p.getByText(T("Simulated QR code. It cannot be scanned or paid.")).waitFor();
    await p.getByRole("button", { name: T("Simulate successful payment") }).click();
    await p.locator(".badge", { hasText: T("Paid (simulation)") }).first().waitFor();
    await p.getByRole("link", { name: T("Back to My appointments") }).click();
    await viewTitle(p, "My appointments");
    await p.locator("article.record", { hasText: TF("Ref {ref}", { ref }) }).locator(".badge", { hasText: T("Paid (simulation)") }).waitFor();

    const s = (await admin()).page;
    await staffView(s, "operations", "&filter=confirmed");
    const row = s.locator("article.record", { hasText: ref });
    await row.getByRole("button", { name: T("Approve full refund") }).click();
    const dlg = openDialog(s);
    await dlg.getByLabel(T("Reason"), { exact: true }).fill("UAT refund " + RUN);
    await dlg.getByRole("button", { name: T("Confirm refund") }).click();
    await dlg.waitFor({ state: "hidden" });
    await go(p, "/app?view=bookings");
    await p.locator("article.record", { hasText: TF("Ref {ref}", { ref }) }).locator(".badge", { hasText: new RegExp("^" + esc(T("Refunded")) + "$") }).waitFor();

    const g = await newContext();
    try {
      const other = await newPage(g, "pay-unknown");
      expectErrors(other, /status of 404/);
      await go(other, "/pay/sim/paysim_unknown");
      await other.getByText(T("This test payment cannot be shown")).waitFor();
    } finally {
      await g.close();
    }
  });

  /* ================================================================ 4.0.0: organization documents end to end */

  await scenario("R4-05", "Organization documents (Codex): manager assigns an editor and a reader; draft, preview, approve, search excerpt, new version, revoke; tenant isolation", async ({ note }) => {
    const A = await admin();
    const B = await customer("t02");
    const s = A.page;
    const p = B.page;
    const org = `org_uat_${RUN}`;
    const title = `UAT preparation guide ${RUN}`;
    const reader = await freshCustomer("orgreader", "org-reader");
    const outsider = await freshCustomer("outsider", "org-outsider");
    try {
      const t02 = (await me(B.ctx)).user.id;
      const readerId = (await me(reader.ctx)).user.id;
      // Before membership: My organization explains how to join and shows the account ID.
      await go(reader.page, "/app?view=orgs");
      await viewTitle(reader.page, "My organization");
      await reader.page.getByText(TF("Your account ID: {id}", { id: readerId })).waitFor();

      // The manager assigns both accounts from the service desk.
      await staffView(s, "organizations");
      for (const [uid, role] of [[t02, "editor"], [readerId, "reader"]]) {
        await s.getByLabel(T("Account ID")).fill(uid);
        await s.getByLabel(T("Organization ID")).fill(org);
        await s.getByLabel(T("Role")).selectOption(role);
        await s.getByRole("button", { name: T("Save membership") }).click();
        await seeToast(s, T("Membership saved."));
      }

      await go(p, "/app?view=orgs");
      await viewTitle(p, "My organization");
      const card = p.locator("section.org-card");
      await card.locator(".badge", { hasText: new RegExp("^" + esc(T("Editor")) + "$") }).waitFor();
      await card.locator(".badge", { hasText: T("Search only") }).waitFor();
      const form = card.locator("form.org-upload");
      const text = [
        `${title} (synthetic, UAT ${RUN})`,
        "การเตรียมตัวก่อนตรวจเลือด: งดอาหารและเครื่องดื่มที่มีน้ำตาล 8 ถึง 10 ชั่วโมงก่อนตรวจน้ำตาลในเลือดและไขมัน ดื่มน้ำเปล่าได้",
        `Fasting preparation ${RUN}: no food or sugary drinks for 8 to 10 hours before a fasting glucose or lipid test.`,
      ].join("\n");
      // A PDF is refused before upload with the Codex rule (UTF-8 .txt or .md only).
      await form.getByLabel(T("File")).setInputFiles({ name: "guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
      await form.locator(".field-error", { hasText: T("Use a UTF-8 .txt or .md file. PDF, Word and scanned images are not supported here.") }).waitFor();
      await form.getByLabel(T("File")).setInputFiles({ name: `uat-preparation-${RUN}.md`, mimeType: "text/markdown", buffer: Buffer.from(text, "utf8") });
      await form.getByLabel(T("Title")).fill(title);
      await form.getByRole("button", { name: T("Upload as draft") }).click();
      await seeToast(p, TF("Version {n} was saved as a draft. Review and approve it before members can use it.", { n: 1 }));
      const doc = card.locator("article.record", { has: p.getByRole("heading", { name: title, exact: true }) });
      await doc.locator(".badge", { hasText: T("Draft, waiting for an editor's review") }).waitFor({ timeout: 20000 });

      // The reader does not see the draft; the outsider has no organization.
      const listing = await call(reader.ctx, "GET", "/organization-documents");
      assert(!listing.documents.length && !listing.can_edit, "a reader sees a draft or can edit");
      const denied = await outsider.ctx.request.get(API + "/organization-documents", { failOnStatusCode: false });
      assert(denied.status() === 403, "an account outside the organization is not refused: " + denied.status());

      await doc.getByRole("button", { name: T("Preview") }).click();
      await openDialog(p).locator("pre.org-preview", { hasText: `Fasting preparation ${RUN}` }).waitFor();
      await p.keyboard.press("Escape");
      await doc.getByRole("button", { name: T("Approve"), exact: true }).click();
      await seeToast(p, T("Approved. Members can now see this version."));
      await doc.locator(".badge", { hasText: new RegExp("^" + esc(T("Approved")) + "$") }).waitFor();
      await shot(p, "orgs-1440.png");

      // The reader searches and gets a source excerpt (not an AI answer) with a member-only download.
      await go(reader.page, "/app?view=orgs");
      await viewTitle(reader.page, "My organization");
      const rcard = reader.page.locator("section.org-card");
      await rcard.locator("article.record", { has: reader.page.getByRole("heading", { name: title, exact: true }) }).waitFor();
      assert(!(await rcard.locator("form.org-upload").count()), "a reader sees the upload form");
      await reader.page.getByLabel(T("Words to find")).fill(`preparation ${RUN}`);
      await reader.page.getByRole("button", { name: T("Search"), exact: true }).click();
      await reader.page.getByText(T("Text from the source document — not an answer from AI.")).waitFor();
      await reader.page.locator("blockquote.org-excerpt", { hasText: `Fasting preparation ${RUN}` }).waitFor();
      const found = await call(reader.ctx, "POST", "/organization-documents/search", { q: `preparation ${RUN}` });
      const download = await reader.ctx.request.get(BASE + found.sources[0].url, { failOnStatusCode: false });
      assert(download.ok(), "the reader cannot download the approved text");
      const foreign = await outsider.ctx.request.get(BASE + found.sources[0].url, { failOnStatusCode: false });
      assert(foreign.status() === 403 || foreign.status() === 404, "an outsider can download the document: " + foreign.status());

      // Chat chip: membership is known; inference stays off by default (search only).
      await go(p, "/app");
      await chat(p).locator(".context-chips button.chip", { hasText: T("Organization references: search only, not sent to the assistant") }).waitFor();

      // New version, approve (replaces v1), then revoke: the reader's search is empty again.
      await go(p, "/app?view=orgs");
      await viewTitle(p, "My organization");
      await doc.getByRole("button", { name: T("Upload new version") }).click();
      await form.getByLabel(T("File")).setInputFiles({ name: `uat-preparation-${RUN}-v2.md`, mimeType: "text/markdown", buffer: Buffer.from(text + `\nVersion two ${RUN}.`, "utf8") });
      await form.getByRole("button", { name: T("Upload new version") }).click();
      await seeToast(p, TF("Version {n} was saved as a draft. Review and approve it before members can use it.", { n: 2 }));
      const v2 = card.locator("article.record", { has: p.locator(".badge", { hasText: TF("Version {n}", { n: 2 }) }) });
      await v2.getByRole("button", { name: T("Approve"), exact: true }).click();
      await seeToast(p, T("Approved. Members can now see this version."));
      await card.locator("article.record", { has: p.locator(".badge", { hasText: TF("Version {n}", { n: 1 }) }) }).locator(".badge", { hasText: new RegExp("^" + esc(T("Revoked")) + "$") }).waitFor();
      await v2.getByRole("button", { name: T("Revoke"), exact: true }).click();
      await openDialog(p).getByRole("button", { name: T("Revoke"), exact: true }).click();
      await seeToast(p, T("Revoked."));
      const after = await call(reader.ctx, "POST", "/organization-documents/search", { q: `preparation ${RUN}` });
      assert(after.sources.length === 0, "a revoked document is still searchable");
      note("v1 revoked by approving v2; v2 revoked; reader search empty; outsider refused (403/404).");
    } finally {
      await reader.ctx.close();
      await outsider.ctx.close();
    }
  });

  /* ================================================================ ported: chat, reports, accounts */

  let chatUser = null;
  await scenario("UI-05", "Account: create an account in /app, the header shows it and it survives reload", async () => {
    chatUser = await freshCustomer("chat", "chat-user");
    await chatUser.page.reload({ waitUntil: "load" });
    await appReady(chatUser.page);
    await chatUser.page.getByRole("button", { name: `${T("Account")}: ${chatUser.email}` }).waitFor();
    assert(!(await chat(chatUser.page).locator(".guest-note").count()), "guest notice shown to a signed-in customer");
  });

  await scenario("UI-07", "Chat booking preview does not book; sending it creates exactly one request", async () => {
    assert(chatUser, "needs the account from UI-05");
    const { page: p, ctx } = chatUser;
    const before = (await workspace(ctx)).bookings.length;
    const turn = await sendChat(p, "อยากจองตรวจ Workday Check ครับ");
    const card = turn.locator(".action-card");
    await card.waitFor();
    assert((await workspace(ctx)).bookings.length === before, "the preview booked before confirmation");
    await card.getByRole("button", { name: T("Send appointment request") }).click();
    await card.locator(".badge", { hasText: T("Request sent") }).waitFor();
    const w = await workspace(ctx);
    assert(w.bookings.length === before + 1, `expected exactly one request, got ${w.bookings.length - before}`);
    keep.chatBooking = w.bookings.sort((x, y) => y.created - x.created)[0].id;
    assert(!(await card.getByRole("button", { name: T("Send appointment request") }).count()), "the request can be sent twice");
  });

  await scenario("UI-13", "Staff declines a request with a reason; the customer sees it", async () => {
    assert(keep.chatBooking, "needs the booking from UI-07");
    const s = (await admin()).page;
    const ref = keep.chatBooking.slice(-8);
    const reason = `UAT ${RUN}: no technician at that time (test).`;
    try {
      await staffView(s, "operations", "&filter=requested");
      const row = s.locator("article.record", { hasText: ref });
      await row.getByRole("button", { name: T("Decline"), exact: true }).click();
      const dlg = openDialog(s);
      await dlg.getByLabel(T("Reason shown to the customer")).fill(reason);
      await dlg.getByRole("button", { name: T("Decline request") }).click();
      await seeToast(s, T("Declined. The customer was notified."));
      const p = chatUser.page;
      await go(p, "/app?view=bookings");
      const rec = p.locator("article.record", { hasText: TF("Ref {ref}", { ref }) });
      await rec.locator(".badge", { hasText: T("Declined") }).waitFor();
      await rec.getByText(TF("From our team: {note}", { note: reason })).waitFor();
    } finally {
      const w = await workspace(chatUser.ctx).catch(() => null);
      const b = w?.bookings.find((x) => x.id === keep.chatBooking);
      if (b?.state === "requested") await call(chatUser.ctx, "POST", `/bookings/${b.id}/change`, { operation: "cancel" }).catch(() => {});
    }
  });

  await scenario("UI-08", "Chat: a failed reply offers Retry without duplicating the message; sources and follow-ups render", async ({ note }) => {
    assert(chatUser, "needs the account from UI-05");
    const { page: p, ctx } = chatUser;
    await go(p, "/app");
    await appReady(p);
    await chat(p).locator("textarea").first().fill("UI_TEST_FAIL_ONCE");
    await chat(p).getByRole("button", { name: T("Send message") }).click();
    const retry = chat(p).locator(".failure").getByRole("button", { name: T("Retry"), exact: true });
    const answered = chat(p).locator("article.turn.ai:not(.thinking) .answer", { hasText: "Offline UI test double: your question was received." });
    await poll(async () => (await retry.count()) || (await answered.count()), { timeout: 30000, message: "neither a failure nor an answer" });
    if (await retry.count()) {
      await retry.last().click();
      await answered.last().waitFor({ timeout: 30000 });
    } else {
      note("UI_TEST_FAIL_ONCE fails only once per API process and was already used, so the Retry path was not exercised in this run.");
    }
    const w = await workspace(ctx);
    assert(w.conversation.messages.filter((m) => m.content === "UI_TEST_FAIL_ONCE").length === 1, "message duplicated by Retry");
    const turn = await sendChat(p, "UI_TEST_SOURCES");
    await turn.getByRole("button", { name: T("View source") }).click();
    await turn.locator(".sources a", { hasText: "How to understand your lab results" }).waitFor();
    await turn.getByRole("button", { name: "What does a reference range mean?" }).waitFor();
  });

  await scenario("UI-30", "Report in the chat: thumbnail, live steps, values card, one-click confirm answers the question once", async () => {
    assert(chatUser, "needs the account from UI-05");
    const { page: p, ctx } = chatUser;
    await go(p, "/app");
    await appReady(p);
    await chat(p).getByRole("button", { name: T("Add a report") }).click();
    await fileChooser(p, () => chat(p).getByRole("menuitem", { name: T("Attach a lab report (JPG, PNG or PDF, up to 3 MB)") }).click(), PNG_GLUCOSE);
    await chat(p).locator(".attachments.draft .draft-file img").waitFor();
    await chat(p).locator("textarea").first().fill("UI_TEST_REPORT_QUESTION");
    await chat(p).getByRole("button", { name: T("Send message") }).click();
    await chat(p).locator("article.turn.thinking .live-steps li.step").first().waitFor();
    await chat(p).locator(".report-card.draft").waitFor({ timeout: 30000 });
    const img = chat(p).locator("article.turn.user .thumb img").last();
    await img.waitFor();
    await poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0), { message: "report thumbnail did not load" });
    let w = await workspace(ctx);
    assert(!w.conversation.report_id, "report used before confirmation");
    await chat(p).getByRole("button", { name: T("Values are correct, this is my report") }).click();
    await chat(p).locator(".report-card.confirmed").waitFor();
    await chat(p).locator("article.turn.ai:not(.thinking) .answer", { hasText: "Offline UI test double: your question was received." }).last().waitFor({ timeout: 30000 });
    w = await workspace(ctx);
    assert(w.conversation.report_id && w.conversation.messages.filter((m) => m.content === "UI_TEST_REPORT_QUESTION").length === 1, "confirmation did not answer exactly once");
    const last = chat(p).locator("article.turn.ai:not(.thinking)").last();
    await last.getByRole("button", { name: T("How this was checked") }).click();
    await last.locator(".receipt .step-label").first().waitFor();
    await chat(p).locator(".context-chips").getByText(TR("Report in use: {label}")).waitFor();
  });

  await scenario("UI-31", "Chats and projects: new chat, project, rename, switch back; drawer on a phone", async () => {
    assert(chatUser, "needs the account from UI-05");
    const { page: p } = chatUser;
    await go(p, "/app");
    await appReady(p);
    await p.getByRole("button", { name: T("New chat") }).filter({ visible: true }).first().click();
    await poll(async () => !(await chat(p).locator("article.turn").count()), { message: "new chat is not empty" });
    await sendChat(p, "UI_TEST_FIRST_CHAT");
    const list = p.locator("#chat-list");
    await list.locator(".cl-item.active", { hasText: "UI_TEST_FIRST_CHAT" }).waitFor();
    await list.getByRole("button", { name: T("New project") }).click();
    const dlg = openDialog(p);
    await dlg.getByLabel(T("Project name")).fill("Annual check-up " + RUN);
    await dlg.getByRole("button", { name: T("Create project") }).click();
    await dlg.waitFor({ state: "hidden" });
    await list.getByRole("button", { name: TF("New chat in {name}", { name: "Annual check-up " + RUN }) }).click();
    await chat(p).locator(".chat-project", { hasText: "Annual check-up " + RUN }).waitFor();
    await sendChat(p, "UI_TEST_PROJECT_CHAT");
    await list.locator(".cl-children .cl-item.active").waitFor();
    const activeTitle = (await list.locator(".cl-children .cl-item.active .cl-name").innerText()).trim();
    await list.getByRole("button", { name: TF("Options for chat {title}", { title: activeTitle }) }).click();
    const edit = openDialog(p);
    await edit.getByLabel(T("Chat name")).fill("Lipids follow-up " + RUN);
    await edit.getByRole("button", { name: T("Save"), exact: true }).click();
    await list.locator(".cl-children .cl-name", { hasText: "Lipids follow-up " + RUN }).waitFor();
    await list.locator(".cl-open", { hasText: "UI_TEST_FIRST_CHAT" }).click();
    await chat(p).locator("article.turn.user", { hasText: "UI_TEST_FIRST_CHAT" }).waitFor();
    assert(!(await chat(p).locator("article.turn", { hasText: "UI_TEST_PROJECT_CHAT" }).count()), "switched chat still shows the other chat");
    await p.setViewportSize({ width: 390, height: 844 });
    await poll(() => list.evaluate((e) => e.inert === true), { message: "closed chat drawer should be inert on a phone" });
    await chat(p).getByRole("button", { name: T("Show chats") }).click();
    await p.locator("#chat-list.open").waitFor();
    await p.keyboard.press("Escape");
    await poll(() => list.evaluate((e) => !e.classList.contains("open")), { message: "chat drawer did not close on Escape" });
    assert(await noOverflow(p), "phone overflow: " + (await overflowInfo(p)));
    await p.setViewportSize({ width: 1440, height: 900 });
  });

  let labsUser = null;
  await scenario("UI-09", "My reports: upload, source image, edit, add/remove a row, explicit confirmation, report chip survives reload", async () => {
    labsUser = await freshCustomer("labs", "labs-user");
    const p = labsUser.page;
    await go(p, "/app?view=reports");
    await viewTitle(p, "My reports");
    await fileChooser(p, () => p.locator("#content .toolbar").getByRole("button", { name: T("Add a report"), exact: true }).click(), PNG_GLUCOSE);
    const dlg = openDialog(p);
    await dlg.getByRole("heading", { name: T("Review report fields") }).waitFor({ timeout: 30000 });
    const img = dlg.locator("img.report-preview").first();
    await img.waitFor();
    await poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0), { message: "source image did not load" });
    await dlg.getByLabel(TF("{field} for row {n}", { field: T("Result"), n: 1 }), { exact: true }).fill("101");
    const rows = dlg.locator("table.report-table tbody tr");
    const n0 = await rows.count();
    await dlg.getByRole("button", { name: T("Add missing test row") }).click();
    assert((await rows.count()) === n0 + 1, "missing row not added");
    await dlg.getByRole("button", { name: TF("Remove row {n}", { n: n0 + 1 }), exact: true }).click();
    assert((await rows.count()) === n0, "row not removed");
    assert((await dlg.getByLabel(TF("{field} for row {n}", { field: T("Unit"), n: 1 }), { exact: true }).getAttribute("maxlength")) === "60", "unit length differs from the API");
    await dlg.getByRole("button", { name: T("Confirm and use report") }).click();
    await wait(400);
    assert(await dlg.isVisible(), "confirmed without the explicit checkbox");
    await dlg.getByRole("checkbox").check();
    await dlg.getByRole("button", { name: T("Confirm and use report") }).click();
    await dlg.waitFor({ state: "hidden" });
    await chat(p).locator(".context-chips").getByText(TR("Report in use: {label}")).waitFor();
    await p.reload({ waitUntil: "load" });
    await appReady(p);
    await chat(p).locator(".context-chips").getByText(TR("Report in use: {label}")).waitFor();
    const w = await workspace(labsUser.ctx);
    const r = await call(labsUser.ctx, "GET", "/reports/" + w.conversation.report_id);
    assert(r.data.fields.some((f) => f.value === "101"), "edited value not stored");
  });

  await scenario("UI-26", "AI Lab Report: free reading used -> upgrade prompt, Plus via test payment, multi-image reading, results over time, printable Lab Report", async () => {
    assert(labsUser, "needs the account from UI-09");
    const p = labsUser.page;
    await go(p, "/app?view=labs");
    await viewTitle(p, "Lab dashboard");
    await p.getByRole("link", { name: T("Open Lab Report") }).waitFor();
    await p.locator("#content .locked").waitFor();
    await p.locator("#content").getByRole("button", { name: T("Add a report"), exact: true }).click();
    const up = openDialog(p);
    await up.getByRole("heading", { name: T("This needs LabClear Plus") }).waitFor();
    await up.getByRole("button", { name: T("See LabClear Plus") }).click();
    await viewTitle(p, "Plan");
    await p.getByRole("button", { name: T("Subscribe with test PromptPay") }).click();
    await p.waitForURL(/\/pay\/sim\//);
    await p.getByText(T("LabClear Plus, 30 days"), { exact: false }).waitFor();
    await p.getByRole("button", { name: T("Simulate successful payment") }).click();
    await p.getByRole("link", { name: T("Back to my plan") }).click();
    await p.waitForURL(/view=plan/);
    await p.locator(".plan-card.featured").getByText(T("Current plan")).waitFor();
    await go(p, "/app?view=reports");
    await viewTitle(p, "My reports");
    await fileChooser(p, () => p.locator("#content .toolbar").getByRole("button", { name: T("Add a report (up to 3 files)") }).click(), [PNG_LIVER, PNG_GLUCOSE]);
    const dlg = openDialog(p);
    await dlg.locator(".report-pages img.report-preview").nth(1).waitFor({ timeout: 30000 });
    await dlg.getByRole("checkbox").check();
    await dlg.getByRole("button", { name: T("Confirm and use report") }).click();
    await dlg.waitFor({ state: "hidden" });
    await go(p, "/app?view=labs");
    await p.locator(".trend-card").first().waitFor();
    assert((await p.locator(".trend-card svg").count()) > 0, "no trend chart");
    const href = await p.getByRole("link", { name: T("Open Lab Report") }).getAttribute("href");
    await go(p, href);
    await p.locator("table.lab-table tbody tr").first().waitFor({ timeout: 20000 });
    assert((await p.locator("table.lab-table th", { hasText: TR("Previous, {date}") }).count()) === 1, "Plus Lab Report should compare with the previous report");
    await p.getByRole("button", { name: T("Print or save as PDF") }).waitFor();
  });

  /* ================================================================ ported: organizations, quotations and the inbox */

  let orgUser = null;
  const orgName = `UAT Logistics ${RUN} (synthetic)`;
  await scenario("UI-10", "Organization page: inquiry form validation and submission for the signed-in account", async () => {
    orgUser = await freshCustomer("org", "org-user");
    const p = orgUser.page;
    await go(p, "/organizations");
    await p.getByText(TF("Signed in as {email}. The quotation will appear in your workspace.", { email: orgUser.email })).waitFor();
    const form = p.locator("#inquiry-form");
    await form.getByRole("button", { name: T("Send request") }).click();
    await form.locator(".field-error:not([hidden])").waitFor();
    await form.getByLabel(T("Organization name")).fill(orgName);
    await form.getByLabel(T("Your name")).fill("Test Coordinator");
    await form.getByLabel(T("Number of people")).fill("40");
    await form.getByLabel(T("At our workplace (travel fee quoted)")).check();
    await form.getByLabel("Corporate Workday").check();
    await form.getByRole("button", { name: T("Send request") }).click();
    await p.getByRole("heading", { name: T("Request received") }).waitFor();
  });

  await scenario("UI-11", "Staff inbox: the organization request shows its details", async () => {
    assert(orgUser, "needs the inquiry from UI-10");
    const s = (await admin()).page;
    const w = await workspace(orgUser.ctx);
    const ticket = w.tickets.find((x) => x.data?.inquiry_id || /Organization inquiry/.test(x.data?.summary || ""));
    assert(ticket, "no ticket for the inquiry");
    keep.orgTicket = ticket.id;
    await staffView(s, "staff");
    await s.locator(".staff-list button.ticket-btn", { hasText: orgName }).first().click();
    const th = s.locator(".staff-thread");
    await th.getByRole("heading", { name: T("Organization request") }).waitFor();
    await th.getByText(T("Onsite at their workplace")).waitFor();
    await th.getByText("Test Coordinator", { exact: false }).waitFor();
  });

  await scenario("UI-12", "Staff: take over, issue quotation v1, then revision v2", async () => {
    assert(keep.orgTicket, "needs the case from UI-11");
    const s = (await admin()).page;
    await staffView(s, "staff", "&ticket=" + keep.orgTicket);
    const th = s.locator(".staff-thread");
    await th.getByRole("button", { name: T("Take over") }).click();
    await th.locator(".badge", { hasText: T("You are replying") }).waitFor();
    await th.getByRole("button", { name: T("Prepare quotation") }).click();
    let dlg = openDialog(s);
    await dlg.getByLabel(T("Venue")).fill("Synthetic office, Bangkok");
    const day = await s.evaluate(() => {
      const d = new Date(Date.now() + 7 * 3600e3 + 10 * 86400e3);
      if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    });
    await dlg.getByLabel(T("Service date")).fill(day);
    await dlg.getByLabel(T("Travel fee (THB)")).fill("1500");
    await dlg.getByRole("button", { name: T("Issue quotation") }).click();
    await dlg.waitFor({ state: "hidden" });
    await th.getByText("v1", { exact: true }).waitFor();
    await th.getByRole("button", { name: T("Revise quotation (new version)") }).click();
    dlg = openDialog(s);
    await dlg.getByLabel(T("Number of people")).fill("45");
    await dlg.getByLabel(T("Note to customer")).fill("Revised headcount");
    await dlg.getByRole("button", { name: T("Issue quotation") }).click();
    await dlg.waitFor({ state: "hidden" });
    await th.getByText("v2", { exact: true }).waitFor();
  });

  await scenario("UI-14", "Customer: quotation versions and PDF, accept the latest, notifications marked as read", async () => {
    assert(orgUser, "needs the inquiry from UI-10");
    const p = orgUser.page;
    await go(p, "/app?view=bookings");
    await viewTitle(p, "My appointments");
    const q = p.locator("article.record", { hasText: TF("Earlier versions ({n})", { n: 1 }) });
    await q.waitFor();
    assert((await q.locator("h3").innerText()).includes("2"), "latest quotation is not version 2");
    const pdf = await q.getByRole("link", { name: T("Download quotation (PDF)") }).getAttribute("href");
    const r = await orgUser.ctx.request.get(BASE + pdf);
    assert(r.ok() && (await r.body()).subarray(0, 5).toString() === "%PDF-", "quotation PDF");
    await q.getByRole("button", { name: T("Review and accept") }).click();
    await openDialog(p).getByRole("button", { name: T("Accept quotation") }).click();
    await q.locator(".badge", { hasText: new RegExp("^" + esc(T("Accepted")) + "$") }).waitFor();
    const bell = p.getByRole("button", { name: TR("Notifications, {n} unread") });
    await bell.waitFor({ timeout: 25000 });
    await bell.click();
    await viewTitle(p, "Notifications");
    await p.getByRole("button", { name: T("Mark all as read") }).click();
    await p.getByRole("button", { name: T("Notifications"), exact: true }).waitFor();
  });

  await scenario("UI-16", "Handoff: customer asks for the team, staff replies, the reply reaches the customer and the assistant is paused", async () => {
    assert(orgUser, "needs the account from UI-10");
    const p = orgUser.page;
    const s = (await admin()).page;
    const text = `UAT ${RUN} live help request`;
    const reply = `A staff member is reviewing your request (${RUN}).`;
    await go(p, "/app");
    await appReady(p);
    await chat(p).locator(".composer-note").getByRole("button", { name: T("Talk to our team") }).click();
    const dlg = openDialog(p);
    await dlg.getByLabel(T("How can our team help?")).fill(text);
    await dlg.getByRole("button", { name: T("Send to our team") }).click();
    await dlg.waitFor({ state: "hidden" });
    await chat(p).locator(".staff-banner").waitFor();
    const w = await workspace(orgUser.ctx);
    const open = w.tickets.filter((x) => x.state !== "closed").sort((a, b) => b.created - a.created)[0];
    assert(open, "no open case for the customer");
    await staffView(s, "staff", "&ticket=" + open.id);
    const th = s.locator(".staff-thread");
    await th.locator(".record-head h3").first().waitFor();
    const take = th.getByRole("button", { name: T("Take over") });
    if (await take.count()) await take.click();
    const box = th.getByLabel(T("Staff reply"));
    await poll(async () => !(await box.isDisabled()), { message: "reply box stays disabled after taking over" });
    await box.fill(reply);
    await th.getByRole("button", { name: T("Send reply") }).click();
    await chat(p).locator("article.turn.staff", { hasText: reply }).waitFor({ timeout: 20000 });
    await chat(p).locator(".staff-banner", { hasText: T("A team member is replying; the assistant is paused.") }).waitFor();
  });

  await scenario("UI-25", "Staff customers and payments: customer history dialog, payment state filter", async () => {
    assert(orgUser, "needs the account from UI-10");
    const s = (await admin()).page;
    await staffView(s, "customers");
    await s.getByLabel(T("Search customers")).fill(orgUser.email);
    await s.locator("#content").getByRole("button", { name: T("Search"), exact: true }).click();
    const row = s.locator("table.data tbody tr", { hasText: orgUser.email });
    await row.waitFor();
    await row.click();
    const dlg = openDialog(s);
    await dlg.getByText(T("Quotations")).first().waitFor();
    await dlg.getByRole("button", { name: T("Close dialog") }).click();
    await staffView(s, "payments");
    const chip = s.getByRole("button", { name: TR("{label} ({n})") }).filter({ hasText: T("Succeeded") });
    await chip.first().click();
    await poll(async () => (await chip.first().getAttribute("aria-pressed")) === "true", { message: "payment filter chip not pressed" });
    await s.locator("table.data tbody .badge", { hasText: T("Succeeded") }).first().waitFor();
    await poll(async () => (await s.locator("table.data tbody .badge").filter({ hasNotText: T("Succeeded") }).count()) === 0, { timeout: 5000, message: "the Succeeded filter still shows other payment states" });
  });

  await scenario("UI-17", "Manager: a price edit reaches the public catalog (restored afterwards)", async () => {
    const A = await admin();
    const s = A.page;
    const orig = (await call(A.ctx, "GET", "/catalog")).packages?.find((x) => x.id === "P01") || (await (await A.ctx.request.get(API + "/site/common")).json()).catalog.packages.find((x) => x.id === "P01");
    const price = orig.price_thb + 5;
    try {
      await staffView(s, "catalog-admin");
      await s.getByLabel(TF("{name} price in THB", { name: orig.name })).fill(String(price));
      const row = s.locator("tr", { hasText: "P01" });
      await row.getByRole("button", { name: T("Save package") }).click();
      await row.getByText(TR("Saved · now {price} · {v}")).waitFor();
      const g = await newContext();
      try {
        const p = await newPage(g, "price");
        await go(p, "/packages/P01");
        await poll(async () => (await p.locator("main").innerText()).includes("฿" + price.toLocaleString("en-US")), { message: "new price not on the package page" });
      } finally {
        await g.close();
      }
    } finally {
      await call(A.ctx, "PUT", "/staff/catalog/P01", { price_thb: orig.price_thb, active: orig.active !== false });
    }
  });

  await scenario("UI-18", "Channels: LINE simulator event is queued and the worker runs", async () => {
    const s = (await admin()).page;
    await staffView(s, "channels");
    const sec = s.locator("section", { has: s.getByRole("heading", { name: T("LINE channel simulator") }) });
    await sec.getByLabel(T("Message"), { exact: true }).fill("Hello from the LINE simulator " + RUN);
    await sec.getByRole("button", { name: T("Send as LINE user") }).click();
    await s.locator("div.toast[role=status]:not([hidden])").waitFor();
    await sec.getByRole("button", { name: T("Run worker once") }).click();
    await seeToast(s, new RegExp([T("Processed one job."), T("The job failed; see its error code below."), T("No pending jobs.")].map(esc).join("|")));
    assert((await sec.locator("table tbody tr").count()) >= 1, "no LINE jobs listed");
  });

  await scenario("UI-23", "Staff overview numbers come from the records; audit log lists events", async () => {
    const A = await admin();
    const s = A.page;
    await staffView(s, "overview");
    const tile = s.locator(".kpi", { hasText: T("Awaiting confirmation") }).locator(".kpi-value");
    await tile.waitFor();
    await poll(async () => {
      const d = await call(A.ctx, "GET", "/staff/dashboard?days=7&branch=");
      return (await tile.innerText()).trim() === String(d.bookings.by_state.requested);
    }, { timeout: 15000, message: "KPI differs from the dashboard API" });
    await staffView(s, "audit");
    await s.locator("table.data tbody tr").first().waitFor();
  });

  /* ================================================================ ported: guest uploads, navigation, keyboard */

  await scenario("UI-33", "Guest report upload: private blob preview, nothing persisted, reload revokes the chat and the image", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "guest-upload");
      let token = "";
      p.on("request", async (r) => {
        if (!r.url().startsWith(API)) return;
        const h = await r.allHeaders().catch(() => ({}));
        if (h["x-labclear-guest"]) token = h["x-labclear-guest"];
      });
      await go(p, "/app?attach=1");
      await appReady(p);
      await fileChooser(p, () => chat(p).getByRole("menuitem", { name: T("Attach a lab report (JPG, PNG or PDF, up to 3 MB)") }).click(), PNG_GLUCOSE);
      await chat(p).locator("textarea").first().fill("PRIVATE_GUEST_" + RUN);
      await chat(p).getByRole("button", { name: T("Send message") }).click();
      await chat(p).locator(".report-card.draft").waitFor({ timeout: 30000 });
      const img = chat(p).locator("article.turn.user .thumb img").last();
      await img.waitFor();
      await poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0 && i.src.startsWith("blob:")), { message: "guest image is not a private blob" });
      const old = token;
      assert(old, "no guest token seen");
      const ws = await (await ctx.request.get(API + "/workspace", { headers: { "X-LabClear-Guest": old } })).json();
      const report = ws.reports[0]?.id;
      assert(report, "guest report not stored for the session");
      assert(ws.chats.chats.length === 0 && ws.chats.projects.length === 0, "guest history listed");
      const stores = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
      assert(!stores.includes("PRIVATE_GUEST_") && !stores.includes(old), "guest data persisted in Web Storage");
      await p.reload({ waitUntil: "load" });
      await appReady(p);
      assert(!(await chat(p).locator("article.turn").count()), "chat survived reload");
      await poll(async () => (await ctx.request.get(API + "/workspace", { headers: { "X-LabClear-Guest": old }, failOnStatusCode: false })).status() === 401, { timeout: 8000, message: "close beacon did not revoke the old token" });
      const src = await ctx.request.get(API + `/reports/${report}/source`, { headers: { "X-LabClear-Guest": old }, failOnStatusCode: false });
      assert(src.status() === 401, "old report image still served: " + src.status());
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-34", "Navigation: a slow view cannot overwrite the latest click; booking fields survive creating an account", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "navigation");
      await go(p, "/app");
      await appReady(p);
      let release;
      const delayed = new Promise((r) => (release = r));
      await p.route("**/api/business/plans", async (route) => {
        await delayed;
        await route.continue();
      });
      const started = p.waitForRequest("**/api/business/plans");
      await p.locator(".workspace-header nav").getByRole("button", { name: T("Plan"), exact: true }).click();
      await started;
      await p.locator(".workspace-header nav").getByRole("button", { name: T("Request a time"), exact: true }).click();
      await p.locator("#book-pkg").waitFor();
      const done = p.waitForResponse("**/api/business/plans");
      release();
      await done;
      await wait(300);
      assert(await p.locator("#book-pkg").isVisible(), "the slow view replaced the booking form");
      await p.unroute("**/api/business/plans");
      await p.locator("#book-pkg").selectOption("P03");
      await p.locator("#book-branch").selectOption("BKK01");
      await p.locator(".date-chips button.chip").nth(3).click();
      const day = await p.locator("#book-date").inputValue();
      const slot = p.locator(".slot-grid button.slot:not([disabled])").first();
      await slot.waitFor();
      const time = (await slot.locator("span").innerText()).trim();
      await slot.click();
      await p.locator("aside.summary").getByRole("button", { name: T("Send appointment request") }).click();
      await useSignInDialog(p, `uat-${RUN}-nav@example.invalid`, PASSWORD, { kind: "register" });
      await p.getByRole("button", { name: `${T("Account")}: uat-${RUN}-nav@example.invalid` }).waitFor();
      assert((await p.locator("#book-pkg").inputValue()) === "P03", "package lost at sign-in");
      assert((await p.locator("#book-date").inputValue()) === day, "date lost at sign-in");
      assert((await p.locator(".slot-grid button.slot", { hasText: time }).first().getAttribute("aria-pressed")) === "true", "time lost at sign-in");
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-32", "Website header: create an account, account menu, sign out", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "header");
      const email = `uat-${RUN}-header@example.invalid`;
      await go(p, "/packages");
      await p.locator(".site-header .nav-account").getByRole("button", { name: T("Sign in"), exact: true }).click();
      await useSignInDialog(p, email, PASSWORD, { kind: "register" });
      await p.locator(".site-header .nav-avatar").waitFor({ timeout: 20000 });
      await p.locator(".site-header .nav-avatar").click();
      await p.getByRole("menuitem", { name: T("My appointments") }).waitFor();
      await p.getByRole("menuitem", { name: T("Sign out") }).click();
      await p.locator(".site-header .nav-account").getByRole("button", { name: T("Sign in"), exact: true }).waitFor({ timeout: 20000 });
      assert(!(await me(ctx)).user, "still signed in after signing out");
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-20", "Keyboard: skip link first, Escape closes the attach menu and the sign-in dialog", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "keyboard");
      await go(p, "/");
      await p.keyboard.press("Tab");
      assert((await p.evaluate(() => document.activeElement?.className || "")).includes("skip"), "first Tab does not reach the skip link");
      await go(p, "/app");
      await appReady(p);
      const attach = chat(p).getByRole("button", { name: T("Add a report") });
      await attach.click();
      await chat(p).locator(".attach-menu").waitFor();
      await p.keyboard.press("Escape");
      await chat(p).locator(".attach-menu").waitFor({ state: "detached" });
      assert(await attach.evaluate((e) => e === document.activeElement), "focus did not return to the attach button");
      await p.locator(".workspace-header .avatar-button").click();
      await p.locator("dialog.signin-dialog[open]").waitFor();
      await p.keyboard.press("Escape");
      await p.locator("dialog.signin-dialog[open]").waitFor({ state: "hidden" });
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-21", "Phone and tablet: site menu, catalog filters panel and the /app navigation open and close", async () => {
    const problems = [];
    for (const [w, h] of [[390, 844], [768, 1024]]) {
      const ctx = await newContext({ viewport: { width: w, height: h } });
      try {
        const p = await newPage(ctx, "mobile-" + w);
        await go(p, "/");
        const toggle = p.locator(".site-header button.nav-toggle");
        if (await toggle.isVisible()) {
          await toggle.click();
          await p.locator("#main-nav").getByRole("link", { name: T("Organizations"), exact: true }).waitFor();
          await p.keyboard.press("Escape");
          await wait(300);
          if ((await toggle.getAttribute("aria-expanded")) !== "false") {
            problems.push(`${w}px: the open site menu does not close on Escape`);
            await toggle.click();
          }
          await poll(async () => (await toggle.getAttribute("aria-expanded")) === "false", { timeout: 3000, message: `${w}px: the site menu button does not close the menu` });
        }
        await go(p, "/packages");
        const filters = p.locator("button.filters-open");
        if (await filters.isVisible()) {
          await filters.click();
          await p.locator("#filters.open").waitFor();
        }
        await go(p, "/app");
        await appReady(p);
        const menu = p.locator(".workspace-header button.mobile-menu");
        if (await menu.isVisible()) {
          await menu.click();
          await p.locator("#sidebar.open").getByRole("button", { name: T("Request a time"), exact: true }).click();
          await p.locator("#book-pkg").waitFor();
        }
        const send = await p.evaluate(() => {
          const b = document.querySelector(".composer .send-btn");
          return !b || b.getBoundingClientRect().right <= innerWidth;
        });
        if (!send) problems.push(`${w}px: send button clipped`);
      } catch (e) {
        problems.push(`${w}px: ${String(e.message).split("\n")[0]}`);
      } finally {
        await ctx.close();
      }
    }
    assert(!problems.length, problems.join("; "));
  });

  await scenario("R4-15", "Hospital links (Codex data): price only for the verified current offer, external links without referrer, no booking claim", async () => {
    const ctx = await newContext();
    try {
      const p = await newPage(ctx, "hospital-links");
      await go(p, "/");
      await p.locator("footer.site-footer").getByRole("link", { name: T("Hospital websites") }).click();
      await p.waitForURL(/\/hospital-links$/);
      const cards = p.locator("article.center-row");
      await cards.first().waitFor();
      const data = await (await ctx.request.get(API + "/site/hospital-links")).json();
      assert((await cards.count()) === data.offers.length, "offer count differs from the API");
      for (const o of data.offers) {
        const card = p.locator(`article#${o.id}`);
        const body = await card.innerText();
        if (o.current_offer) assert(body.includes(TF("{price} THB", { price: o.price_thb.toLocaleString("th-TH") })), `${o.id}: verified price missing`);
        else assert(body.includes(T("Current price not confirmed")), `${o.id}: an unverified offer shows a price`);
        const link = card.getByRole("link", { name: new RegExp(esc(T("View on the hospital website"))) });
        assert((await link.getAttribute("href")) === o.url, `${o.id}: link differs from the reviewed URL`);
        assert((await link.getAttribute("rel")) === "noopener noreferrer" && (await link.getAttribute("referrerpolicy")) === "no-referrer", `${o.id}: link leaks referrer`);
      }
      await shot(p, "hospital-links-1440.png");
    } finally {
      await ctx.close();
    }
  });

  /* ================================================================ 4.0.0: responsive and motion */

  const PAGES = ["/", "/packages", "/sources", "/help", "/organizations", "/hospital-links", "/app", "/staff"];
  const WIDTHS = [320, 390, 768, 1440];
  for (const route of PAGES) {
    await scenario(`R4-13${route === "/" ? "-home" : route.replace(/\//g, "-")}`, `Responsive ${route}: no horizontal overflow and no console errors at ${WIDTHS.join(", ")} px`, async () => {
      const staff = route === "/staff";
      const ctx = staff ? (await admin()).ctx : await newContext();
      const p = await newPage(ctx, "responsive");
      const problems = [];
      try {
        for (const width of WIDTHS) {
          await p.setViewportSize({ width, height: width < 800 ? 844 : 900 });
          const from = consoleErrors.length;
          const fromPage = pageErrors.length;
          await go(p, route);
          if (route === "/app") await appReady(p);
          else if (staff) await p.locator(".kpi-grid .kpi").first().waitFor({ timeout: 20000 });
          else await p.locator("main h1").first().waitFor();
          await p.evaluate(() => document.fonts?.ready);
          await wait(400);
          if (!(await noOverflow(p))) {
            const wide = await p.evaluate(() => {
              const out = [];
              for (const el of document.querySelectorAll("body *")) {
                const r = el.getBoundingClientRect();
                if (r.right > innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} right=${Math.round(r.right)}`);
                if (out.length > 3) break;
              }
              return out.join(", ");
            });
            problems.push(`${width}px overflow ${await overflowInfo(p)} (${wide})`);
          }
          const errs = consoleErrors.slice(from).filter((e) => e.label === "responsive");
          for (const e of errs) problems.push(`${width}px console: ${e.text.slice(0, 160)}`);
          for (const e of pageErrors.slice(fromPage)) if (e.startsWith("responsive")) problems.push(`${width}px pageerror: ${e.slice(0, 160)}`);
          if (route === "/" && width === 390) await shot(p, "home-390.png");
        }
      } finally {
        await p.close();
        if (!staff) await ctx.close();
      }
      assert(!problems.length, problems.join("; "));
    });
  }

  await scenario("R4-14", 'Reduced motion: home renders the hero text and a static helix without errors (reducedMotion "reduce")', async ({ note }) => {
    const ctx = await newContext({ reducedMotion: "reduce" });
    try {
      const p = await newPage(ctx, "reduced-motion");
      const fromPage = pageErrors.length;
      const from = consoleErrors.length;
      await go(p, "/");
      await p.locator("h1#hero-title").waitFor();
      assert((await p.locator("h1#hero-title").innerText()).includes(T("Book the check.")), "hero text missing");
      assert(await p.locator("h1#hero-title").isVisible(), "hero title not visible");
      assert(!(await p.evaluate(() => document.documentElement.classList.contains("motion"))), "motion class set under reduced motion");
      const art = p.locator(".lc-hero-art");
      await art.locator("svg.lc-helix-svg").waitFor({ state: "attached" });
      await wait(2500); // let the idle-time 3D helix load if WebGL is available
      const phase = await art.getAttribute("data-gl");
      note(`hero art phase data-gl=${phase}.`);
      if (phase !== "live") {
        const op = Number(await art.locator("svg.lc-helix-svg").evaluate((e) => getComputedStyle(e).opacity));
        assert(op > 0, "static SVG helix hidden");
      } else {
        assert((await art.locator("canvas").count()) > 0, "3D helix live without a canvas");
      }
      const a = await art.screenshot();
      await wait(900);
      const b = await art.screenshot();
      assert(a.equals(b), `the helix moves under reduced motion (data-gl=${phase})`);
      const errs = consoleErrors.slice(from).filter((e) => e.label === "reduced-motion");
      assert(pageErrors.length === fromPage && !errs.length, "errors: " + [...pageErrors.slice(fromPage), ...errs.map((e) => e.text)].join(" | ").slice(0, 300));
    } finally {
      await ctx.close();
    }
  });

  await scenario("UI-22", "No uncaught JavaScript errors and no console errors during the run", async () => {
    const errs = consoleErrors.map((e) => `${e.label} ${e.path}: ${e.text}`);
    const all = [...pageErrors, ...errs];
    assert(!all.length, [...new Set(all)].slice(0, 6).join(" | "));
  });
}

let fatal = "";
try {
  await main();
} catch (e) {
  fatal = String(e?.message || e);
  console.error("Fatal:", fatal);
} finally {
  for (const r of Object.values(roles)) await r.ctx.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  const failed = results.filter((r) => !r.ok).length + (fatal ? 1 : 0);
  if (fatal) results.push({ id: "SUITE", title: "Suite could not run", ok: false, ms: 0, error: fatal });
  const report = {
    started,
    base: BASE,
    mode: "MOCKED_TEST_ONLY for the language model and report reader (scripts/dev_mock_api.py on the Codex backend); real UI, routes, storage, sessions, CSRF, trusted-origin proxy and permissions.",
    candidate: process.env.UAT_CANDIDATE || undefined,
    only: ONLY.length ? ONLY : undefined,
    scenarios: results,
    passed: results.filter((r) => r.ok).length,
    failed,
    screenshots: shots,
    browser_errors: [...new Set([...pageErrors, ...consoleErrors.map((e) => `${e.label} ${e.path}: ${e.text}`)])].slice(0, 30),
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "uat.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\n${report.passed} passed, ${report.failed} failed -> ${path.join(OUT, "uat.json")}`);
  process.exitCode = failed ? 1 : 0;
}
