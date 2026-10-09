/*
 * Integration 4.0.0-rc2: the same Next.js build against the Codex API with every new feature flag
 * OFF (the default deployment state on Render). Start the API with UAT_FLAGS=off:
 *
 *   UAT_FLAGS=off python scripts/dev_mock_api.py           # repository root, :8000
 *   API_ORIGIN=http://127.0.0.1:8000 npm run start:render  # web/, :3000
 *   node tests/uat-flags-off.mjs
 *
 * MOCKED_TEST_ONLY AI (no model is called). Writes docs/evidence/integration-4.0-rc2/web-uat-flags-off/uat.json.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");
const ROOT = path.resolve(WEB, "..");
const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const API = BASE + "/api/business";
const OUT = process.env.UAT_OUT ? path.resolve(process.env.UAT_OUT) : path.join(ROOT, "docs/evidence/integration-4.0-rc2/web-uat-flags-off");
fs.mkdirSync(OUT, { recursive: true });
const DICT = JSON.parse(fs.readFileSync(path.join(WEB, "lib/i18n/dict.th.json"), "utf8"));
const T = (en) => DICT[en] ?? en;
const RUN = Date.now().toString(36).slice(-6);
const results = [];
const errors = [];
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

async function scenario(id, title, fn) {
  const start = Date.now();
  const record = { id, title, ok: false, ms: 0 };
  try {
    await fn();
    record.ok = true;
  } catch (e) {
    record.error = String(e?.message || e).split("\n")[0];
  }
  record.ms = Date.now() - start;
  results.push(record);
  console.log(`${record.ok ? "PASS" : "FAIL"} ${id} ${title} (${record.ms} ms)${record.error ? "\n     " + record.error : ""}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "th-TH" });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(`${new URL(page.url()).pathname}: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
try {
  await scenario("OFF-01", "Feature endpoint reports every new Codex flag off", async () => {
    const f = await (await ctx.request.get(API + "/site/features")).json();
    assert(Object.values(f).every((v) => v === false), "a flag is on: " + JSON.stringify(f));
  });
  await scenario("OFF-02", "/hospital-links is a 404 and the footer has no hospital link", async () => {
    const r = await page.goto(BASE + "/hospital-links");
    assert(r.status() === 404, "status " + r.status());
    await page.goto(BASE + "/");
    await page.locator("footer.site-footer").waitFor();
    assert(!(await page.locator("footer.site-footer").getByRole("link", { name: T("Hospital websites") }).count()), "footer shows the hospital link");
  });
  await scenario("OFF-03", "/app does not list My organization; the view explains it is off; the API answers 404", async () => {
    await page.goto(BASE + "/app");
    await page.locator(".ws-root .workspace-header").waitFor({ timeout: 30000 });
    await page.locator(".ws-root .composer textarea").waitFor({ timeout: 30000 });
    assert(!(await page.locator("nav.top-nav").getByRole("button", { name: T("My organization") }).count()), "My organization listed while off");
    await page.locator(".workspace-header .avatar-button").click();
    const dlg = page.locator("dialog.signin-dialog[open]");
    await dlg.getByLabel(T("Email or username")).fill(`uat-off-${RUN}@example.invalid`);
    await dlg.getByLabel(T("Password"), { exact: true }).fill("uat-only-password-rc1");
    await dlg.getByRole("button", { name: T("Create account"), exact: true }).click();
    await dlg.waitFor({ state: "hidden", timeout: 20000 });
    await page.goto(BASE + "/app?view=orgs");
    await page.getByRole("heading", { name: T("Organization documents are not switched on") }).waitFor({ timeout: 20000 });
    const r = await ctx.request.get(API + "/organization-documents", { failOnStatusCode: false });
    assert(r.status() === 404, "organization documents API status " + r.status());
    await page.screenshot({ path: path.join(OUT, "orgs-off-1440.png") });
  });
  await scenario("OFF-04", "Codex Jinja preview pages stay off on the API", async () => {
    for (const p of ["/preview/landing", "/organization-references", "/hospital-links"]) {
      const r = await fetch("http://127.0.0.1:8000" + p);
      assert(r.status === 404, `${p} -> ${r.status}`);
    }
  });
  await scenario("OFF-05", "No console or page errors", async () => {
    // The two 404s above are requested on purpose (document navigation and API probe).
    const unexpected = errors.filter((e) => !/status of 404/.test(e));
    assert(!unexpected.length, unexpected.slice(0, 4).join(" | "));
  });
} finally {
  await browser.close();
  const report = {
    started: new Date().toISOString(),
    base: BASE,
    mode: "MOCKED_TEST_ONLY AI; Codex API with every new flag off (UAT_FLAGS=off).",
    candidate: process.env.UAT_CANDIDATE || undefined,
    scenarios: results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    browser_errors: errors.slice(0, 20),
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "uat.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\n${report.passed} passed, ${report.failed} failed -> ${path.join(OUT, "uat.json")}`);
  process.exitCode = report.failed ? 1 : 0;
}
