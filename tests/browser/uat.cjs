/* Full business browser UAT.
   Real UI, HTTP routes, SQLite storage, auth, CSRF, permissions and state machines.
   MOCKED_TEST_ONLY: LLM agent and OCR reader are doubles (tests/browser/fixture_server.py),
   so these results are UI/flow evidence, never model or OCR quality evidence.
   Usage: TEST_PYTHON=/path/to/python node tests/browser/uat.cjs   (UAT_OUT to change output folder) */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const crypto = require('crypto');
const { spawn, spawnSync, execSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, process.env.UAT_OUT || 'test-results/uat'); fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'labclear-uat-')); const port = Number(process.env.UI_TEST_PORT || 8098), base = 'http://127.0.0.1:' + port;
const startedAt = new Date().toISOString();
const py = process.env.TEST_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
let sha = 'unknown', dirty = null, diffSha = null, statusPorcelain = []; try {
  sha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  const statusText = execSync('git status --porcelain', { cwd: root }).toString();
  statusPorcelain = statusText.trim() ? statusText.trim().split(/\r?\n/) : [];
  dirty = statusPorcelain.length > 0;
  const diffResult = spawnSync('git', ['diff', '--binary'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (diffResult.error || diffResult.status !== 0) throw diffResult.error || Error('git diff failed');
  diffSha = crypto.createHash('sha256').update(diffResult.stdout).digest('hex');
} catch { /* no git */ }
const server = (() => { try { require('child_process').execSync(`node -e "fetch('${'http://127.0.0.1:' + (process.env.UI_TEST_PORT || 8098)}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, { stdio: 'ignore' }); console.error('Port in use: another server answers on the UAT port. Stop it first; results would come from its database.'); process.exit(2); } catch { /* port free */ } return null; })() || spawn(py, ['scripts/offline_check.py', 'browser', String(port)], { cwd: root, env: { ...process.env, UI_TEST_PORT: String(port), PROVIDER_NETWORK_ENABLED: 'false', BUSINESS_DB_PATH: path.join(tmp, 'db.sqlite'), BUSINESS_KEY_PATH: path.join(tmp, 'key'), BUSINESS_DATA_KEY: '', DATABASE_URL: '', VERCEL: '', RENDER: '', APP_ENV: 'test', BUSINESS_EXTERNAL_ENABLED: '', STRIPE_SECRET_KEY: '', LINE_CHANNEL_SECRET: '', LINE_CHANNEL_ACCESS_TOKEN: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
let log = ''; server.on('error', e => { log += 'Fixture process failed: ' + e.message; }); server.stderr.on('data', x => { log += x; });
let browser, activeCaseId = null; const records = [], errors = [], shots = [], screenshotEvidence = []; const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw Error(m); };
async function check(id, name, fn) { const start = Date.now(); activeCaseId = id; try { await fn(); records.push({ id, name, expected: 'All scenario assertions and required UI steps complete.', actual: 'All scenario assertions passed.', status: 'PASS', ms: Date.now() - start }); } catch (e) { const actual = e.message.split('\n')[0]; records.push({ id, name, expected: 'All scenario assertions and required UI steps complete.', actual, status: 'FAIL', ms: Date.now() - start, error: actual }); if (process.env.UAT_DEBUG && browser) { let n = 0; for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await pg.screenshot({ path: path.join(out, 'fail-' + id + '-' + (n++) + '.png') }).catch(() => {}); } } finally { activeCaseId = null; } }
async function shot(page, name, full = false) { const caseId = activeCaseId || 'UNASSIGNED'; const file = caseId + '_' + name + '.png'; await page.screenshot({ path: path.join(out, file), fullPage: full }); shots.push(file); screenshotEvidence.push({ case_id: caseId, file, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) }); }
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
function nextOpenDay(days) { const d = new Date(Date.now() + 7 * 3600e3 + days * 86400e3); while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function watch(page, label) { page.on('pageerror', e => errors.push(label + ': ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/status of (4\d\d|502)|net::ERR_FAILED/.test(m.text())) errors.push(label + ' console: ' + m.text()); }); }
async function signUp(page, email) {
  await page.locator('#account-open').click();
  await page.getByLabel('Email or username').fill(email); await page.getByLabel('Password', { exact: true }).fill('ui-test-only-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click(); await page.locator('#modal').waitFor({ state: 'hidden' });
}
(async () => {
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { } await wait(250); if (i === 79) throw Error('Fixture server unavailable: ' + log.slice(-1500)); }
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    // This suite checks the English interface (the source language); the Thai interface is covered by
    // tests/browser/i18n_audit.mjs. Every context starts with the English language cookie.
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (options) => { const c = await newContext(options); await c.addCookies([{ name: 'labclear_language', value: 'en', url: base }]); return c; };
    const cctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); const c = await cctx.newPage(); watch(c, 'customer');
    const day1 = nextOpenDay(3);

    await check('UI-01', 'Home: segmented tabs keyboard, comparison audience toggle, theme toggle persists, search routes to filtered catalog, no overflow', async () => {
      await c.goto(base, { waitUntil: 'networkidle' }); assert(await noOverflow(c), 'overflow'); await shot(c, 'home-1440', true);
      await c.getByRole('tab', { name: /Core health checks/ }).focus(); await c.keyboard.press('ArrowRight');
      assert(await c.getByRole('tab', { name: /Follow-up tests/ }).getAttribute('aria-selected') === 'true', 'tab not selected by keyboard');
      await c.getByRole('tab', { name: /For organizations/ }).click(); await c.locator('#need-org').waitFor({ state: 'visible' }); assert(await c.locator('#need-core').isHidden(), 'need tab panel');
      await c.getByRole('tab', { name: 'Organizations', exact: true }).click(); await c.locator('#matrix-organization').waitFor({ state: 'visible' });
      assert(await c.locator('#matrix-organization').getByText('Corporate Workday').count() > 0, 'organization matrix');
      const before = await c.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await c.locator('[data-theme-toggle]').first().click();
      const theme = await c.evaluate(() => document.documentElement.dataset.theme); const after = await c.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert(theme && before !== after, 'theme toggle did not change the page');
      await c.reload({ waitUntil: 'networkidle' }); assert(await c.evaluate(() => document.documentElement.dataset.theme) === theme, 'theme not persisted');
      await c.locator('[data-theme-toggle]').first().click(); // back to the starting theme for later screenshots
      await c.locator('#hero-search').fill('lipid'); await c.locator('#hero-search').press('Enter');
      await c.waitForURL(/\/packages\?q=lipid/); assert(Number(await c.locator('[data-count]').innerText()) >= 3, 'lipid results');
    });
    await check('UI-02', 'Catalog: filter, URL state, chip removal, empty state, reset, sort, back/forward', async () => {
      await c.goto(base + '/packages', { waitUntil: 'networkidle' }); assert(await c.locator('[data-count]').innerText() === '18', 'initial 18');
      await c.getByLabel('Organizations (20+ people)').check(); await c.waitForURL(/segment=organization/); await c.locator('[data-count]').filter({ hasText: '3' }).waitFor();
      await c.getByRole('button', { name: 'Remove filter: Organizations' }).click(); await c.locator('[data-count]').filter({ hasText: '18' }).waitFor();
      await c.locator('#filters input[name=q]').fill('zzz-no-such-test'); await c.locator('[data-empty]').waitFor({ state: 'visible' });
      await c.locator('[data-empty] [data-reset]').click(); await c.locator('[data-count]').filter({ hasText: '18' }).waitFor(); assert(await c.locator('[data-empty]').isHidden(), 'empty hidden after reset');
      await c.locator('#sort').selectOption('price_asc'); await c.waitForURL(/sort=price_asc/); await wait(300);
      const prices = await c.locator('[data-results] .pkg-price strong').allInnerTexts(); const n = prices.map(p => Number(p.replace(/[^\d]/g, '')));
      assert(n.every((v, i) => i === 0 || n[i - 1] <= v), 'not sorted ascending');
      await c.getByLabel('Organizations (20+ people)').check(); await c.waitForURL(/segment=organization/); await c.goBack(); await c.waitForURL(u => !/segment=organization/.test(u.toString()));
      await c.locator('[data-count]').filter({ hasText: '18' }).waitFor(); await shot(c, 'catalog-1440');
    });
    await check('UI-02b', 'Catalog: network error shows recoverable error state', async () => {
      await c.route('**/api/business/catalog/search**', r => r.abort()); await c.getByLabel('Individuals and families').check();
      await c.locator('[data-error]').waitFor({ state: 'visible' }); await shot(c, 'catalog-network-error-1440'); await c.unroute('**/api/business/catalog/search**');
      await c.locator('[data-retry]').click(); await c.locator('[data-count]').filter({ hasText: /^15$/ }).waitFor(); assert(await c.locator('[data-error]').isHidden(), 'error still visible');
    });
    await check('UI-03', 'Compare: tray limit, compare table, assistant hand-off link, clear', async () => {
      await c.goto(base + '/packages', { waitUntil: 'networkidle' });
      for (const id of ['P01', 'P02', 'P03']) await c.locator(`[data-compare="${id}"]`).first().check();
      await c.locator('[data-compare="P04"]').first().click(); await wait(100); assert(!(await c.locator('[data-compare="P04"]').first().isChecked()), 'fourth item accepted');
      await c.locator('.compare-tray a.btn.primary').click(); await c.waitForURL(/compare\?ids=P01,P02,P03/);
      assert(await c.locator('.compare-table tbody tr').count() >= 8, 'compare rows'); assert((await c.locator('.compare-table').innerText()).includes('Not included'), 'diff shown');
      assert((await c.getByRole('link', { name: 'Ask the assistant to compare for me' }).getAttribute('href')).includes('compare=P01,P02,P03'), 'assistant link');
      await shot(c, 'compare-1440'); await c.locator('[data-clear-compare]').click(); await c.waitForURL(/\/packages$/); assert(await c.locator('.compare-tray').isHidden(), 'tray still visible');
    });
    await check('UI-04', 'Package detail CTA leads to booking view; guest account gate prevents booking; invalid package is 404', async () => {
      await c.goto(base + '/packages/P02', { waitUntil: 'networkidle' }); await c.getByRole('link', { name: 'Request an appointment' }).click();
      await c.waitForURL(/view=book/); await c.locator('select').first().waitFor(); assert(await c.locator('.field select').first().inputValue() === 'P02', 'package preselected');
      await c.getByLabel('Center').selectOption('BKK01'); await c.getByLabel('Date').fill(day1); await c.getByLabel('Date').dispatchEvent('change');
      let bookingPostSeen = false; await c.route('**/api/business/bookings', async route => { bookingPostSeen = true; await route.continue(); });
      await c.getByRole('button', { name: /^09:00/ }).click(); await c.getByRole('button', { name: 'Send appointment request' }).click();
      await c.getByText('Create an account or sign in so you can follow your appointment request.').waitFor();
      await shot(c, 'guest-account-required');
      assert(!bookingPostSeen, 'guest booking request reached the server'); await c.unroute('**/api/business/bookings');
      const invalidPackage = await c.goto(base + '/packages/P99'); assert(invalidPackage.status() === 404, 'invalid package did not return 404'); await shot(c, 'package-not-found');
    });
    await check('UI-05', 'Account: create account, label updates, survives reload', async () => {
      await c.goto(base + '/app', { waitUntil: 'networkidle' }); await signUp(c, 'customer@example.invalid');
      assert((await c.locator('#account-label').innerText()).includes('customer@'), 'label'); await c.reload({ waitUntil: 'networkidle' });
      assert((await c.locator('#account-label').innerText()).includes('customer@'), 'session lost'); await shot(c, 'account-persisted-1440');
    });
    let bookingRef = '';
    await check('UI-06', 'Booking form: center, date, live slots, request created as awaiting confirmation', async () => {
      await c.goto(base + '/app?view=book&package=P02', { waitUntil: 'networkidle' });
      await c.getByLabel('Center').selectOption('BKK01'); await c.getByLabel('Date').fill(day1); await c.getByLabel('Date').dispatchEvent('change');
      await c.getByRole('button', { name: /^09:00/ }).click(); await shot(c, 'book-1440');
      await c.getByRole('button', { name: 'Send appointment request' }).click(); await c.waitForURL(/view=bookings/);
      await c.locator('#content').getByText('Awaiting confirmation').first().waitFor(); bookingRef = (await c.locator('.record-meta span').filter({ hasText: 'Ref ' }).first().innerText()).replace('Ref ', '');
      await c.reload({ waitUntil: 'networkidle' }); await c.locator('#content').getByText('Awaiting confirmation').first().waitFor();
    });
    await check('UI-07', 'Chat: proposal does not book; sending request creates exactly one more request', async () => {
      await c.goto(base + '/app', { waitUntil: 'networkidle' }); await c.locator('#message').fill('UI_TEST_BOOK'); await c.getByRole('button', { name: 'Send message' }).click();
      await c.getByRole('button', { name: 'Send appointment request' }).waitFor(); let w = await (await c.request.get(base + '/api/business/workspace')).json(); assert(w.bookings.length === 1, 'premature booking');
      await shot(c, 'chat-preview-1440'); await c.getByRole('button', { name: 'Send appointment request' }).click(); await c.locator('#notice').filter({ hasText: 'Appointment request sent' }).waitFor();
      await c.getByRole('button', { name: 'Send appointment request' }).click(); await wait(500); // idempotent second click
      w = await (await c.request.get(base + '/api/business/workspace')).json(); assert(w.bookings.length === 2, 'expected exactly two bookings, got ' + w.bookings.length);
    });
    await check('UI-08', 'Chat: failed reply is marked, retry answers without duplicating the message; sources render', async () => {
      await c.locator('#message').fill('UI_TEST_FAIL_ONCE'); await c.getByRole('button', { name: 'Send message' }).click();
      await c.getByRole('button', { name: 'Retry', exact: true }).waitFor(); await shot(c, 'chat-retry-error-1440'); await c.getByRole('button', { name: 'Retry', exact: true }).click();
      await c.getByText('Offline UI test double: your question was received.').last().waitFor();
      const w = await (await c.request.get(base + '/api/business/workspace')).json(); assert(w.conversation.messages.filter(m => m.content === 'UI_TEST_FAIL_ONCE').length === 1, 'duplicated');
      await c.locator('#message').fill('UI_TEST_SOURCES'); await c.getByRole('button', { name: 'Send message' }).click();
      await c.locator('#messages .act', { hasText: 'View source' }).last().click(); await c.getByRole('link', { name: /How to understand your lab results/ }).last().waitFor(); await c.getByRole('button', { name: 'What does a reference range mean?' }).waitFor();
      await shot(c, 'chat-source-1440');
    });
    await check('UI-09', 'Reports: upload (OCR double), source image, edit, explicit confirmation, context chip, reload', async () => {
      await c.locator('#report-file').setInputFiles(path.join(root, 'examples/thai_lab_reference_v3/png/04_B_Glucose_Urine.png'));
      await c.getByRole('heading', { name: 'Review report fields' }).waitFor(); await c.locator('.report-preview').evaluate(img => img.decode());
      assert(await c.locator('.report-preview').evaluate(img => img.naturalWidth > 0), 'no image');
      await c.getByLabel('value for row 1', { exact: true }).fill('101');
      const countBefore = await c.locator('#modal .report-table input[aria-label^="name for row"]').count();
      await c.getByRole('button', {name:'Add missing test row',exact:true}).click();
      assert(await c.locator('#modal .report-table input[aria-label^="name for row"]').count() === countBefore + 1, 'missing row not added');
      await c.getByRole('button', {name:'Remove row '+(countBefore+1),exact:true}).click();
      assert(await c.locator('#modal .report-table input[aria-label^="name for row"]').count() === countBefore, 'row not removed');
      assert(await c.getByLabel('unit for row 1',{exact:true}).getAttribute('maxlength') === '60','unit length differs from API');
      await shot(c, 'report-review-1440');
      await c.getByRole('button', { name: 'Confirm and use report' }).click(); assert(await c.locator('#modal').isVisible(), 'confirmed without checkbox');
      await c.locator('#modal input[type=checkbox]').check(); await c.getByRole('button', { name: 'Confirm and use report' }).click(); await c.locator('#modal').waitFor({ state: 'hidden' });
      await c.locator('#context-chips').getByText(/Report:/).waitFor(); await c.reload({ waitUntil: 'networkidle' }); await c.locator('#context-report').filter({ hasText: 'Report in use' }).waitFor();
    });
    await check('UI-10', 'Organization page: inquiry form validation and submission for the signed-in account', async () => {
      await c.goto(base + '/organizations', { waitUntil: 'networkidle' }); await c.locator('[data-inquiry-auth]').filter({ hasText: 'Signed in as' }).waitFor();
      await c.getByRole('button', { name: 'Send request' }).click(); await c.locator('[data-form-error]').filter({ hasText: 'complete' }).waitFor();
      await c.getByLabel('Organization name').fill('Example Logistics (synthetic)'); await c.getByLabel('Your name').fill('Test Coordinator');
      await c.getByLabel('Number of people').fill('40'); await c.getByLabel('At our workplace (travel fee quoted)').check(); await c.getByLabel('Corporate Workday').check();
      await c.getByRole('button', { name: 'Send request' }).click(); await c.locator('[data-inquiry-done]').waitFor(); await shot(c, 'organization-done-1440');
    });

    const sctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); const s = await sctx.newPage(); watch(s, 'staff');
    await check('UI-11', 'Manager: separate session sign-in, inbox shows organization request with details', async () => {
      await s.goto(base + '/staff', { waitUntil: 'networkidle' }); await s.getByLabel('Email or username').fill('manager@example.invalid'); await s.getByLabel('Password', { exact: true }).fill('ui-test-only-password');
      await s.locator('#modal').getByRole('button', { name: 'Sign in', exact: true }).click(); await s.locator('#modal').waitFor({ state: 'hidden' });
      await s.locator('.kpi').first().waitFor(); await shot(s, 'staff-overview-1440');
      await s.locator('[data-view=staff]').click(); await s.getByRole('button', { name: /Organization inquiry: Example Logistics/ }).click(); await s.getByText('Organization request').waitFor(); await s.getByText('Onsite at their workplace').waitFor();
    });
    await check('UI-12', 'Staff: take over, issue quotation v1 then revision v2', async () => {
      await Promise.all([s.waitForResponse(r => r.url().endsWith('/state')), s.getByRole('button', { name: 'Take over' }).click()]);
      await s.getByRole('button', { name: 'Prepare quotation' }).click(); await s.getByLabel('Venue').fill('Synthetic office, Bangkok'); await s.getByLabel('Service date').fill(nextOpenDay(10));
      await s.getByLabel('Travel fee (THB)').fill('1500'); await s.getByRole('button', { name: 'Issue quotation' }).click(); await s.locator('#modal').waitFor({ state: 'hidden' });
      await s.getByText('v1', { exact: true }).waitFor();
      await s.getByRole('button', { name: 'Revise quotation (new version)' }).click(); await s.getByLabel('Number of people').fill('45'); await s.getByLabel('Note to customer').fill('Revised headcount');
      await s.getByRole('button', { name: 'Issue quotation' }).click(); await s.locator('#modal').waitFor({ state: 'hidden' }); await s.getByText('v2', { exact: true }).waitFor(); await shot(s, 'staff-quote-1440');
    });
    await check('UI-13', 'Staff: confirm one request, decline another with a reason', async () => {
      const appointmentStaffContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const appointmentStaff = await appointmentStaffContext.newPage(); watch(appointmentStaff, 'appointment staff');
      try {
        await appointmentStaff.goto(base + '/staff', { waitUntil: 'networkidle' });
        await appointmentStaff.getByLabel('Email or username').fill('appointments-staff@example.invalid');
        await appointmentStaff.getByLabel('Password', { exact: true }).fill('ui-test-only-password');
        await appointmentStaff.locator('#modal').getByRole('button', { name: 'Sign in', exact: true }).click();
        await appointmentStaff.locator('#modal').waitFor({ state: 'hidden' });
        const staffSession = await (await appointmentStaff.request.get(base + '/api/business/session')).json();
        assert(staffSession.user.role === 'staff', 'appointments account is not a support staff role');
        await appointmentStaff.locator('[data-view=operations]').click();
        await appointmentStaff.getByRole('button', { name: /Awaiting confirmation \(2\)/ }).waitFor();
        await appointmentStaff.getByRole('button', { name: 'Confirm appointment' }).first().click();
        await appointmentStaff.locator('#notice').filter({ hasText: 'Confirmed' }).waitFor();
        assert(await appointmentStaff.getByRole('button', { name: 'Record simulated receipt' }).count() === 0,
          'support staff can see the settlement control');
        await appointmentStaff.getByRole('button', { name: 'Decline', exact: true }).first().click();
        await appointmentStaff.getByLabel('Reason shown to the customer').fill('No technician available at that time (test).');
        await appointmentStaff.getByRole('button', { name: 'Decline request' }).click();
        await appointmentStaff.getByRole('button', { name: /Awaiting confirmation \(0\)/ }).waitFor();
        await shot(appointmentStaff, 'staff-appointments-1440');
      } finally { await appointmentStaffContext.close(); }
      const managerContext = await browser.newContext(); const manager = await managerContext.newPage(); watch(manager, 'manager settlement');
      try {
        await manager.goto(base + '/staff', { waitUntil: 'networkidle' }); await manager.getByLabel('Email or username').fill('admin'); await manager.getByLabel('Password', { exact: true }).fill('1234');
        await manager.locator('#modal').getByRole('button', { name: 'Sign in', exact: true }).click(); await manager.locator('#modal').waitFor({ state: 'hidden' });
        const managerSession = await (await manager.request.get(base + '/api/business/session')).json();
        assert(managerSession.user.role === 'manager', 'settlement account is not a manager role');
        await manager.locator('[data-view=operations]').click();
        await manager.getByRole('button', { name: /Confirmed \(1\)/ }).click();
        await manager.getByRole('button', { name: 'Record simulated receipt' }).first().waitFor();
        await shot(manager, 'manager-simulated-receipt-1440');
      } finally { await managerContext.close(); }
    });
    await check('UI-14', 'Customer: notifications from events, calendar file, quotation versions and PDF, accept latest', async () => {
      await c.goto(base + '/app?view=bookings', { waitUntil: 'networkidle' }); assert(Number(await c.locator('#bell-count').innerText()) >= 3, 'bell count');
      await c.locator('#content').getByText('Confirmed', { exact: true }).first().waitFor(); await c.getByText('No technician available at that time (test).').waitFor();
      const ics = await c.request.get(base + await c.getByRole('link', { name: 'Add to calendar (.ics)' }).getAttribute('href'));
      assert(ics.ok() && (await ics.text()).includes('BEGIN:VEVENT'), 'ics');
      await c.getByText('Superseded by a newer version').waitFor(); const pdfHref = await c.getByRole('link', { name: 'Download quotation (PDF)' }).first().getAttribute('href');
      const pdf = await c.request.get(base + pdfHref); assert(pdf.ok() && (await pdf.body()).subarray(0, 5).toString() === '%PDF-', 'pdf');
      await c.getByRole('button', { name: 'Review and accept' }).click(); await c.getByRole('button', { name: 'Accept quotation' }).click(); await c.locator('#content').getByText('Accepted', { exact: true }).waitFor();
      await c.locator('#bell').click(); await c.getByRole('heading', { name: 'Notifications' }).first().waitFor(); await c.getByText('Appointment confirmed').waitFor();
      await c.getByRole('button', { name: 'Mark all as read' }).click(); await c.locator('#bell-count').waitFor({ state: 'hidden' }); await shot(c, 'notifications-1440');
    });
    await check('UI-15', 'Payment simulator: PromptPay test payment, signed success, paid state persists', async () => {
      await c.goto(base + '/app?view=bookings', { waitUntil: 'networkidle' }); await c.getByRole('button', { name: 'Pay with test PromptPay' }).first().click(); await c.waitForURL(/\/pay\/sim\//);
      await c.getByText('Simulated QR code. It cannot be scanned or paid.').waitFor(); await shot(c, 'payment-simulator-1440');
      await c.getByRole('button', { name: 'Simulate successful payment' }).click(); await c.getByText('Paid (simulation)').first().waitFor();
      await c.getByRole('link', { name: 'Back to My appointments' }).click(); await c.locator('#content').getByText('Paid (simulation)').first().waitFor();
      const other = await (await browser.newContext()).newPage(); await other.goto(base + '/pay/sim/paysim_unknown', { waitUntil: 'networkidle' });
      await other.getByText('This test payment cannot be shown').waitFor();
    });
    await check('UI-16', 'Website handoff: customer asks for team, staff takes over, reply reaches customer, and customer confirms assistant resume', async () => {
      const isolatedContext=await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const customer=await isolatedContext.newPage(); watch(customer, 'handoff customer');
      try {
        await customer.goto(base + '/app', { waitUntil: 'networkidle' });
        await signUp(customer, 'handoff-ui16@example.invalid');
        await customer.locator('#staff-request').waitFor({ state: 'visible' });
        const session=(await (await customer.request.get(base + '/api/business/session')).json());
        const rejectHandoff=async (summary, code) => {
          const before=await (await customer.request.get(base + '/api/business/workspace')).json();
          const response=await customer.request.post(base + '/api/business/handoffs', { data: { summary }, headers: { 'X-Business-CSRF': session.csrf, Origin: base } });
          assert(response.status()===409 && (await response.json()).code===code, 'handoff rejection mismatch: expected '+code+', got '+response.status());
          const after=await (await customer.request.get(base + '/api/business/workspace')).json();
          assert(JSON.stringify(after.conversation)===JSON.stringify(before.conversation) && JSON.stringify(after.tickets)===JSON.stringify(before.tickets), 'rejected handoff mutated customer state');
        };

        await customer.locator('#message').fill('UI_TEST_HANDOFF_START');
        await customer.getByRole('button', { name: 'Send message' }).click();
        await customer.getByText('Offline UI test double: your question was received.').waitFor();
        let workspace=(await (await customer.request.get(base + '/api/business/workspace')).json());
        const botChatId=workspace.conversation.chat_id;
        const selectedHistoryMessage=workspace.conversation.messages.find(m=>m.role==='user' && m.content==='UI_TEST_HANDOFF_START');
        assert(selectedHistoryMessage?.id, 'synthetic pre-handoff message has no stable ID');
        assert(workspace.conversation.mode==='bot' && workspace.conversation.messages.some(m=>m.role==='assistant' && m.content==='Offline UI test double: your question was received.'), 'offline bot did not answer before handoff');
        await shot(customer, 'handoff-bot-chat-1440');

        await customer.locator('#staff-request').click(); await customer.getByLabel('How can our team help?').fill('UI UAT live help request');
        await customer.locator('[data-share-message-id="' + selectedHistoryMessage.id + '"]').check();
        await shot(customer, 'handoff-sharing-selected-1440');
        const handoffResponsePromise=customer.waitForResponse(r=>r.url().endsWith('/handoffs') && r.request().method()==='POST');
        await customer.getByRole('button', { name: 'Send to our team' }).click();
        const handoffTicket=await (await handoffResponsePromise).json();
        const sharingReceipt=handoffTicket.data?.sharing_receipts?.slice(-1)[0];
        assert(sharingReceipt?.notice_version==='handoff-sharing-v2', 'support-sharing notice version was not recorded');
        assert(sharingReceipt?.scope?.request_note===true && sharingReceipt.scope.message_ids.includes(selectedHistoryMessage.id), 'sharing receipt did not match the note and selected message');
        assert(sharingReceipt?.legal_basis_status==='owner_review_required' && sharingReceipt?.retention_status==='owner_review_required', 'unapproved privacy decisions were presented as resolved');
        await customer.locator('#handoff-state').filter({ hasText: /queued/ }).waitFor();
        workspace=(await (await customer.request.get(base + '/api/business/workspace')).json());
        const binding={ticket_id:handoffTicket.id||null,ticket_state:handoffTicket.state||null,ticket_chat_id:handoffTicket.data?.chat_id||null,active_chat_id:workspace.conversation.chat_id||null,mode:workspace.conversation.mode||null};
        assert(binding.ticket_chat_id===binding.active_chat_id, 'ticket chat binding mismatch: '+JSON.stringify(binding));
        assert(binding.active_chat_id===botChatId, 'handoff switched away from the bot conversation: '+JSON.stringify(binding));
        assert(binding.ticket_state==='waiting' && binding.mode==='waiting', 'new handoff ticket should be waiting: '+JSON.stringify(binding));
        assert(await customer.locator('#staff-request').isHidden(), 'team handoff action remained visible while the request was queued');
        await rejectHandoff('Duplicate while waiting', 'handoff_in_progress');
        await customer.locator('#notice').waitFor({ state: 'hidden' });
        await shot(customer, 'handoff-queued-1440');

        const queuedStaffView=(await (await s.request.get(base + '/api/business/staff/tickets/' + handoffTicket.id)).json());
        assert(queuedStaffView.conversation.messages.length===0 && queuedStaffView.bookings.length===0, 'unassigned staff preview exposed customer history or bookings');
        await s.locator('[data-view=staff]').click(); await s.locator('[data-ticket="' + handoffTicket.id + '"]').click();
        await s.getByRole('heading', { name: 'UI UAT live help request' }).waitFor();
        const btnTake = s.getByRole('button', { name: 'Take over' }); if (await btnTake.count()) await Promise.all([s.waitForResponse(r => r.url().endsWith('/state')), btnTake.click()]);
        const reply = s.getByLabel('Staff reply'); for (let i = 0; i < 6; i++) { await reply.fill('A staff member is reviewing your request.'); await wait(400); if (await reply.inputValue() === 'A staff member is reviewing your request.') break; }
        await Promise.all([s.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST'), s.getByRole('button', { name: 'Send reply' }).click()]);
        await customer.getByText('A staff member is reviewing your request.').waitFor({ timeout: 12000 }); await customer.locator('#handoff-state').filter({ hasText: 'paused' }).waitFor();
        let staffSnapshot=(await (await s.request.get(base + '/api/business/staff/tickets/' + handoffTicket.id)).json());
        const firstResponseAt=staffSnapshot.ticket.data.first_response_at;
        assert(firstResponseAt && staffSnapshot.ticket.data.conversation_version===staffSnapshot.conversation.version, 'first staff reply did not persist the ticket version');
        assert(staffSnapshot.ticket.data.mode_epoch===staffSnapshot.conversation.mode_epoch, 'first staff reply changed the mode epoch unexpectedly');
        const secondReply='The team is checking the details you selected.';
        await s.getByLabel('Staff reply').fill(secondReply);
        await Promise.all([s.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST'), s.getByRole('button', { name: 'Send reply' }).click()]);
        await customer.getByText(secondReply, { exact: true }).waitFor({ timeout: 12000 });
        staffSnapshot=(await (await s.request.get(base + '/api/business/staff/tickets/' + handoffTicket.id)).json());
        assert(staffSnapshot.conversation.messages.some(m=>m.id===selectedHistoryMessage.id), 'the selected chat message was not shared after staff takeover');
        assert(!staffSnapshot.conversation.messages.some(m=>m.content==='Offline UI test double: your question was received.'), 'an unselected assistant message leaked to staff');
        assert(staffSnapshot.ticket.data.conversation_version===staffSnapshot.conversation.version, 'second staff reply left the ticket version stale');
        assert(staffSnapshot.ticket.data.mode_epoch===staffSnapshot.conversation.mode_epoch, 'second staff reply left the ticket mode epoch stale');
        assert(staffSnapshot.ticket.data.first_response_at===firstResponseAt, 'later staff reply overwrote first response time');
        await shot(s, 'handoff-staff-second-reply-1440');
        await shot(customer, 'handoff-staff-second-reply-customer-1440');
        assert(await customer.locator('#staff-request').isHidden(), 'team handoff action remained visible while staff was replying');
        await rejectHandoff('Duplicate while staff is replying', 'handoff_in_progress');
        await Promise.all([s.waitForResponse(r => r.url().endsWith('/state') && r.request().method() === 'POST'), s.getByRole('button', { name: 'Ask customer to resume assistant' }).click()]);
        const beforeChoice=(await (await customer.request.get(base + '/api/business/workspace')).json());
        await rejectHandoff('Bypass customer resume choice', 'resume_choice_required');
        const rejected=(await customer.request.post(base + '/api/business/chat', { data: { message: 'UI_TEST_RESUME_WITHOUT_CHOICE' }, headers: { 'X-Business-CSRF': session.csrf, Origin: base } }));
        assert(rejected.status()===409 && (await rejected.json()).code==='resume_choice_required', 'server accepted a message before resume choice');
        const afterChoice=(await (await customer.request.get(base + '/api/business/workspace')).json());
        assert(JSON.stringify(afterChoice)===JSON.stringify(beforeChoice), 'message or handoff state changed before resume choice');
        await customer.waitForFunction(() => document.querySelector('#message')?.disabled === true, null, { timeout: 6000 });
        assert(await customer.locator('#message').isDisabled(), 'composer stayed enabled while waiting for resume choice');
        assert(await customer.locator('#staff-request').isHidden(), 'team handoff action remained visible while awaiting resume choice');
        await customer.getByRole('button', { name: 'Resume with assistant' }).waitFor();
        await shot(customer, 'handoff-resume-prompt-1440');
        await Promise.all([customer.waitForResponse(r => r.url().endsWith('/resume') && r.request().method() === 'POST'), customer.getByRole('button', { name: 'Resume with assistant' }).click()]);
        workspace=(await (await customer.request.get(base + '/api/business/workspace')).json());
        assert(workspace.conversation.mode === 'bot', 'customer confirmation did not resume assistant');
        const resumedTicket=workspace.tickets.find(t=>t.id===handoffTicket.id); assert(resumedTicket?.state==='bot' && resumedTicket.data.chat_id===workspace.conversation.chat_id, 'ticket did not record confirmed bot resume on the same chat');
        await customer.locator('#staff-request').waitFor({ state: 'visible', timeout: 12000 });
        const assistantRepliesBeforeResume=workspace.conversation.messages.filter(m=>m.role==='assistant').length;
        const visibleRepliesBeforeResume=await customer.getByText('Offline UI test double: your question was received.', { exact: true }).count();
        await customer.locator('#message').fill('UI_TEST_AFTER_RESUME');
        await Promise.all([
          customer.waitForResponse(r=>r.url().endsWith('/chat') && r.request().method()==='POST'),
          customer.getByRole('button', { name: 'Send message' }).click()
        ]);
        const observedReplyHandle=await customer.waitForFunction(async ({ previousCount, expectedChatId }) => {
          const response=await fetch('/api/business/workspace', { cache: 'no-store' });
          const state=await response.json();
          const replies=state.conversation.messages.filter(message=>message.role==='assistant');
          if (state.conversation.chat_id===expectedChatId && replies.length>previousCount && replies.at(-1)?.content==='Offline UI test double: your question was received.') {
            return { chat_id: state.conversation.chat_id, mode: state.conversation.mode, assistant_reply_count: replies.length, latest_reply: replies.at(-1).content };
          }
          return false;
        }, { previousCount: assistantRepliesBeforeResume, expectedChatId: botChatId }, { timeout: 12000 });
        const pageReplyObservation=await observedReplyHandle.jsonValue();
        await customer.getByText('Offline UI test double: your question was received.', { exact: true }).nth(visibleRepliesBeforeResume).waitFor({ state: 'visible', timeout: 12000 });
        await customer.getByText('Thinking', { exact: true }).waitFor({ state: 'hidden', timeout: 12000 });
        await customer.locator('#notice').waitFor({ state: 'hidden' });
        await shot(customer, 'handoff-resumed-1440');
        let persistedWorkspace, assistantRepliesAfterResume, persistedReply=false;
        for (let attempt=0; attempt<20; attempt++) {
          const response=await customer.request.get(base + '/api/business/workspace', { headers: { 'Cache-Control': 'no-cache' } });
          persistedWorkspace=await response.json();
          assistantRepliesAfterResume=persistedWorkspace.conversation.messages.filter(m=>m.role==='assistant');
          if (persistedWorkspace.conversation.chat_id===botChatId && persistedWorkspace.conversation.mode==='bot' && assistantRepliesAfterResume.length>assistantRepliesBeforeResume && assistantRepliesAfterResume.at(-1)?.content==='Offline UI test double: your question was received.') {
            persistedReply=true;
            break;
          }
          await wait(250);
        }
        workspace=persistedWorkspace;
        assert(workspace.conversation.mode==='bot' && workspace.conversation.messages.some(m=>m.content==='UI_TEST_AFTER_RESUME'), 'bot did not accept a message after confirmed resume');
        assert(persistedReply, 'new bot reply after resume was not stable in workspace reads: '+JSON.stringify({page:pageReplyObservation,api:{chat_id:workspace.conversation.chat_id,mode:workspace.conversation.mode,assistant_reply_count:assistantRepliesAfterResume.length,latest_reply:assistantRepliesAfterResume.at(-1)?.content}}));
        await customer.locator('#staff-request').click(); await customer.getByLabel('How can our team help?').fill('UI UAT second handoff');
        const secondHandoffPromise=customer.waitForResponse(r=>r.url().endsWith('/handoffs') && r.request().method()==='POST');
        await customer.getByRole('button', { name: 'Send to our team' }).click();
        const secondTicket=await (await secondHandoffPromise).json();
        const requeueReceipts=secondTicket.data?.sharing_receipts || [];
        assert(requeueReceipts.length===2 && requeueReceipts[0].scope.message_ids.includes(selectedHistoryMessage.id) && requeueReceipts[1].scope.message_ids.length===0, 'requeue did not preserve the original sharing receipt and append the note-only receipt');
        await customer.locator('#handoff-state').filter({ hasText: /queued/ }).waitFor();
        workspace=(await (await customer.request.get(base + '/api/business/workspace')).json());
        const requeued=workspace.tickets.find(t=>t.id===handoffTicket.id); assert(requeued?.state==='waiting' && !requeued.data.assigned_to && requeued.data.chat_id===workspace.conversation.chat_id, 'second customer handoff did not return the ticket to the unassigned queue');
        assert(secondTicket.id===handoffTicket.id && secondTicket.state==='waiting', 'requeue created or returned a different ticket');
        assert(workspace.conversation.mode==='waiting', 'assistant was not paused on requeue');
        await customer.locator('#notice').waitFor({ state: 'hidden' });
        await shot(customer, 'handoff-requeued-1440');
        await shot(s, 'staff-inbox-1440');
        await s.locator('[data-ticket="' + handoffTicket.id + '"]').click();
        await s.getByRole('button', { name: 'Take over' }).waitFor();
        await Promise.all([s.waitForResponse(r=>r.url().endsWith('/state') && r.request().method()==='POST'), s.getByRole('button', { name: 'Take over' }).click()]);
        await Promise.all([s.waitForResponse(r=>r.url().endsWith('/state') && r.request().method()==='POST'), s.getByRole('button', { name: 'Close case' }).click()]);
        await customer.waitForFunction(async (id) => {
          const state=await (await fetch('/api/business/workspace',{cache:'no-store'})).json();
          return state.conversation.mode==='closed' && state.tickets.find(t=>t.id===id)?.state==='closed';
        }, handoffTicket.id, { timeout: 12000 });
        const closedBefore=(await (await customer.request.get(base + '/api/business/workspace')).json());
        const rejectedClosed=await customer.request.post(base + '/api/business/chat', { data: { message: 'UI_TEST_CLOSED_THREAD' }, headers: { 'X-Business-CSRF': session.csrf, Origin: base } });
        assert(rejectedClosed.status()===409 && (await rejectedClosed.json()).code==='conversation_closed', 'closed thread accepted assistant chat');
        const closedAfter=(await (await customer.request.get(base + '/api/business/workspace')).json());
        assert(JSON.stringify(closedAfter.conversation)===JSON.stringify(closedBefore.conversation) && JSON.stringify(closedAfter.tickets)===JSON.stringify(closedBefore.tickets), 'closed chat rejection mutated state');
        await customer.setViewportSize({ width: 390, height: 844 });
        await customer.waitForFunction(() => {
          const ids = ['message', 'send', 'attach', 'demo-open'];
          return ids.every(id => document.getElementById(id)?.disabled === true) &&
            document.querySelector('#handoff-state button')?.textContent.trim() === 'New chat';
        }, null, { timeout: 10000 });
        assert(await customer.locator('#message').isDisabled() && await customer.locator('#send').isDisabled(), 'closed composer remained active');
        assert(await customer.locator('#attach').isDisabled() && await customer.locator('#demo-open').isDisabled(), 'closed chat still allowed report attachments');
        assert(await noOverflow(customer), 'closed chat overflowed at mobile width');
        await shot(customer, 'handoff-closed-390');
        const closedThreadNewChat = customer.waitForResponse(r =>
          r.url().endsWith('/api/business/chats') && r.request().method()==='POST'
        );
        const [newChatResponse] = await Promise.all([
          closedThreadNewChat,
          customer.locator('#handoff-state').getByRole('button', { name: 'New chat', exact: true }).click()
        ]);
        assert(newChatResponse.ok(), 'new chat request failed from the closed thread');
        await customer.waitForFunction(() => document.querySelector('#message')?.disabled === false, null, { timeout: 12000 });
        let fresh=(await (await customer.request.get(base + '/api/business/workspace')).json());
        assert(fresh.conversation.chat_id!==botChatId && fresh.conversation.mode==='bot', 'new chat did not start in bot mode');
        await customer.locator('#message').fill('UI_TEST_AFTER_CLOSED_NEW_CHAT'); await customer.locator('#send').click();
        const activeAssistantReply=customer.locator('#messages .turn.ai .message-body').last();
        await activeAssistantReply.waitFor({ state: 'visible', timeout: 12000 });
        assert((await activeAssistantReply.innerText()).trim()==='Offline UI test double: your question was received.', 'new chat did not render its latest assistant reply in the active transcript');
        await shot(customer, 'handoff-new-chat-390');
        await customer.locator('#chats-toggle').click();
        await customer.locator('.cl-open', { hasText: 'UI_TEST_HANDOFF_START' }).click();
        await customer.waitForFunction(async (id) => {
          const state=await (await fetch('/api/business/workspace',{cache:'no-store'})).json();
          return state.conversation.chat_id===id && state.conversation.mode==='closed';
        }, botChatId, { timeout: 12000 });
        await customer.waitForFunction(() => {
          return document.querySelector('#message')?.disabled === true &&
            document.querySelector('#handoff-state button')?.textContent.trim() === 'New chat';
        }, null, { timeout: 12000 });
        assert(await customer.locator('#message').isDisabled(), 'opening closed history re-enabled the composer');
        await shot(customer, 'handoff-history-closed-390');
        const closedHistoryNewChat = customer.waitForResponse(r =>
          r.url().endsWith('/api/business/chats') && r.request().method() === 'POST'
        );
        await customer.locator('#handoff-state').getByRole('button', { name: 'New chat', exact: true }).click();
        await closedHistoryNewChat;
        await customer.waitForFunction(() => {
          return document.querySelector('#handoff-state button')?.textContent.trim() !== 'New chat' &&
            document.querySelector('#message')?.disabled === false;
        }, null, { timeout: 12000 });
        fresh=(await (await customer.request.get(base + '/api/business/workspace')).json());
        assert(fresh.conversation.chat_id!==botChatId && fresh.conversation.mode==='bot', 'new chat from closed history failed');
      } catch (error) {
        await shot(customer, 'handoff-failed-1440').catch(() => {});
        throw error;
      } finally { await isolatedContext.close(); }
    });
    await check('UI-16b', 'Handoff privacy: no history is preselected or visible in the unassigned staff queue', async () => {
      const isolatedContext=await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const customer=await isolatedContext.newPage(); watch(customer, 'handoff privacy');
      try {
        await customer.goto(base + '/app', { waitUntil: 'networkidle' });
        await signUp(customer, 'handoff-privacy-ui16b@example.invalid');
        await customer.locator('#message').fill('UI_TEST_UNSHARED_HANDOFF_MARKER');
        await customer.getByRole('button', { name: 'Send message' }).click();
        await customer.getByText('Offline UI test double: your question was received.').waitFor();
        await customer.locator('#staff-request').click();
        const choices=customer.locator('[data-share-message-id]');
        assert(await choices.count()>=1, 'handoff did not offer explicit per-message sharing');
        assert(!await choices.evaluateAll(xs=>xs.some(x=>x.checked)), 'chat history was preselected for sharing');
        await shot(customer, 'handoff-sharing-none-1440');
        const responsePromise=customer.waitForResponse(r=>r.url().endsWith('/handoffs') && r.request().method()==='POST');
        await customer.getByLabel('How can our team help?').fill('UI_TEST_NO_TRANSCRIPT');
        await customer.getByRole('button', { name: 'Send to our team' }).click();
        const ticket=await (await responsePromise).json();
        const sharingReceipt=ticket.data?.sharing_receipts?.slice(-1)[0];
        assert(sharingReceipt?.scope?.request_note===true && sharingReceipt.scope.message_ids.length===0 && sharingReceipt.scope.booking_ids.length===0, 'note-only request receipt included unselected history');
        const preview=(await (await s.request.get(base + '/api/business/staff/tickets/' + ticket.id)).json());
        assert(preview.conversation.messages.length===0 && preview.bookings.length===0, 'unassigned staff queue exposed unselected history or bookings');
        await s.locator('[data-view=staff]').click();
        await s.locator('[data-ticket="' + ticket.id + '"]').click();
        await s.getByRole('heading', { name: 'UI_TEST_NO_TRANSCRIPT' }).waitFor();
        assert(await s.getByText('UI_TEST_UNSHARED_HANDOFF_MARKER', { exact: true }).count()===0, 'unselected chat content appeared in staff UI');
        await shot(s, 'handoff-queue-no-history-1440');
      } finally { await isolatedContext.close(); }
    });
    await check('UI-16c', 'Handoff sharing notice fits a mobile dialog without clipping or control overlap', async () => {
      const mobileContext=await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobile=await mobileContext.newPage(); watch(mobile, 'handoff mobile');
      try {
        await mobile.goto(base + '/app', { waitUntil: 'networkidle' });
        await signUp(mobile, 'handoff-mobile-ui16c@example.invalid');
        await mobile.locator('#staff-request').click();
        const notice=mobile.getByText(/retention period is still awaiting owner approval/);
        await notice.waitFor();
        await mobile.waitForFunction(() => {
          const dialog = document.querySelector('#modal');
          return dialog && dialog.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
        });
        assert(await noOverflow(mobile), 'mobile handoff dialog caused horizontal overflow');
        const dialogBox=await mobile.locator('#modal').boundingBox();
        const noticeBox=await notice.boundingBox();
        const submitBox=await mobile.getByRole('button', { name: 'Send to our team' }).boundingBox();
        assert(dialogBox && dialogBox.x>=0 && dialogBox.x+dialogBox.width<=390, 'dialog crossed the mobile viewport');
        assert(noticeBox && noticeBox.x>=dialogBox.x && noticeBox.x+noticeBox.width<=dialogBox.x+dialogBox.width, 'sharing notice was clipped horizontally');
        assert(submitBox && noticeBox.y+noticeBox.height<=submitBox.y+2, 'sharing notice overlaps the submit button');
        await shot(mobile, 'handoff-sharing-mobile-390');
      } finally { await mobileContext.close(); }
    });
    await check('UI-17', 'Manager: price edit persists and reaches the public catalog; branch staff cannot see manager tools', async () => {
      await s.locator('[data-view=catalog-admin]').click(); await s.getByLabel('Essential Check price in THB').fill('1250');
      await s.getByRole('row', { name: /Essential Check/ }).getByRole('button', { name: 'Save package' }).click(); await s.getByText(/Saved · now ฿1,250/).waitFor();
      await shot(s, 'manager-price-simulator-1440');
      await c.goto(base + '/packages/P01', { waitUntil: 'networkidle' }); assert((await c.locator('.buy-box .pkg-price strong').innerText()).includes('1,250'), 'price not propagated');
      const x = await (await browser.newContext()).newPage(); await x.goto(base + '/staff', { waitUntil: 'networkidle' });
      await x.getByLabel('Email or username').fill('cnx-staff@example.invalid'); await x.getByLabel('Password', { exact: true }).fill('ui-test-only-password');
      await x.locator('#modal').getByRole('button', { name: 'Sign in', exact: true }).click(); await x.locator('#modal').waitFor({ state: 'hidden' });
      assert(await x.locator('[data-view=catalog-admin]').isHidden(), 'manager nav visible to staff');
      const r = await x.request.put(base + '/api/business/staff/catalog/P01', { data: { price_thb: 1, active: true }, headers: { 'X-Business-CSRF': 'x' } }); assert(r.status() === 403, 'branch staff edit not refused');
    });
    await check('UI-18', 'Channels: LINE simulator event through adapter, worker run, simulated delivery recorded', async () => {
      await s.locator('[data-view=channels]').click(); await s.getByText('LINE channel simulator').waitFor(); await s.getByLabel('Message').fill('Hello from the LINE simulator');
      await s.getByRole('button', { name: 'Send as LINE user' }).click(); await s.locator('#notice').filter({ hasText: 'Queued event' }).waitFor();
      await s.getByRole('button', { name: 'Run worker once' }).click(); await s.locator('#notice').waitFor();
      await s.getByText(/line_job/).first().waitFor(); await shot(s, 'channels-1440', true);
    });
    await check('UI-28', 'Manager: AI providers page saves a provider, masks the key, never returns it', async () => {
      await s.locator('[data-view=ai]').click(); await s.getByRole('heading', { name: 'Language model' }).waitFor();
      assert(await s.locator('#content section.card:not(.agents-card)').count() === 3, 'three AI slots expected');
      const card = s.locator('#content section.card:not(.agents-card)').first();
      await card.getByRole('heading', { name: 'Language model', exact: true }).waitFor();
      const provider = card.getByLabel('Provider');
      const providerIds = await provider.locator('option').evaluateAll(options => options.map(option => option.value));
      assert(providerIds.includes('anthropic'), 'Anthropic missing from language-model provider options: ' + JSON.stringify(providerIds));
      await provider.selectOption('anthropic'); await card.getByLabel('API key').fill('sk-ant-uat-0123456789wxyz');
      await card.getByRole('button', { name: 'Save' }).click(); await s.locator('#notice').filter({ hasText: 'saved' }).waitFor();
      const again = s.locator('#content section.card:not(.agents-card)').first();
      await again.getByText('Saved key: •••• wxyz').waitFor(); assert(await again.getByLabel('Provider').inputValue() === 'anthropic', 'provider not kept');
      const body = await (await s.request.get(base + '/api/business/staff/ai-providers')).text(); assert(!body.includes('0123456789wxyz'), 'key returned to browser');
      await shot(s, 'ai-providers-1440', true);
      await again.getByRole('button', { name: 'Use server settings' }).click(); await s.locator('#notice').filter({ hasText: 'server environment' }).waitFor();
    });
    await check('UI-23', 'Staff dashboard: numbers from records, capacity table, centers edit, roles pause/resume, audit log', async () => {
      await s.locator('[data-view=overview]').click(); await s.locator('.kpi-value').first().waitFor();
      const d = await (await s.request.get(base + '/api/business/staff/dashboard')).json();
      assert((await s.locator('.kpi').filter({ hasText: 'Awaiting confirmation' }).locator('.kpi-value').innerText()) === String(d.bookings.by_state.requested), 'kpi mismatch');
      assert(await s.locator('table.heat tr').count() === 4, 'heat rows');
      await s.locator('[data-view=centers]').click(); await s.getByLabel('Khon Kaen City Demo Center visits per slot').fill('2');
      await s.getByRole('row', { name: /Khon Kaen/ }).getByRole('button', { name: 'Save' }).click(); await s.getByText(/Saved · 2 per slot/).waitFor();
      const slots = await (await c.request.get(base + '/api/business/slots?branch_id=KKC01&date=' + nextOpenDay(5))).json(); assert(slots.slots.every(x => x.capacity === 2), 'capacity not applied');
      await s.locator('[data-view=roles]').click(); await s.getByRole('button', { name: 'Pause this role' }).last().click(); await s.locator('.record .badge', { hasText: 'Paused' }).waitFor();
      assert(!(await (await c.request.get(base + '/api/business/dots')).json()).dots.find(x => x.id === 'explainer').enabled, 'role not paused');
      await s.getByRole('button', { name: 'Turn on' }).click(); await s.locator('.record .badge', { hasText: 'Paused' }).waitFor({ state: 'detached' });
      await s.locator('[data-view=audit]').click(); await s.getByRole('cell', { name: 'branch.capacity' }).first().waitFor(); await shot(s, 'staff-audit-1440');
    });
    await check('UI-25', 'Staff customers and payments: list from records, customer history dialog, payment state filter', async () => {
      await s.locator('[data-view=customers]').click(); await s.locator('table.data .link-btn', { hasText: 'customer@example.invalid' }).click();
      await s.locator('#modal .history-block h4', { hasText: 'Appointments' }).waitFor(); assert(await s.locator('#modal').getByText(/Values stay private|No reports uploaded/).count() > 0, 'privacy note');
      await s.locator('#modal-close').click(); await shot(s, 'staff-customers-1440');
      await s.locator('[data-view=payments]').click(); await s.getByRole('button', { name: /^Succeeded \(\d+\)$/ }).click();
      await s.locator('table.data .badge', { hasText: 'Succeeded' }).first().waitFor(); assert(await s.locator('table.data .badge').filter({ hasNotText: 'Succeeded' }).count() === 0, 'filter leaked other states');
      await shot(s, 'staff-payments-1440');
    });
    await check('UI-24', 'Assistant dock on public pages: page-aware, role label, shortcut goes straight to the booking form', async () => {
      // Fresh visitor: the signed-in customer's conversation is with staff after UI-16, so AI answers are paused there by design.
      const g = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); watch(g, 'dock');
      await g.goto(base + '/packages/P02', { waitUntil: 'networkidle' }); await g.locator('.dock-launch').click();
      await g.locator('.dock').getByText(/Answers with Workday Check in mind/).waitFor();
      await g.locator('.dock textarea').fill('UI_TEST_DOCK'); await g.locator('.dock').getByRole('button', { name: 'Send', exact: true }).click();
      await g.locator('.dock').getByText('Health-check Advisor, AI').last().waitFor(); await shot(g, 'dock-1440');
      await g.locator('.dock').getByRole('link', { name: 'Book Workday Check' }).click(); await g.waitForURL(/view=book&package=P02&branch=BKK01/);
      await g.getByLabel('Center').waitFor(); assert(await g.getByLabel('Center').inputValue() === 'BKK01', 'branch not prefilled');
      await g.goto(base + '/packages/P02', { waitUntil: 'networkidle' }); await g.locator('.dock-launch').click(); await g.keyboard.press('Escape'); assert(await g.locator('.dock').isHidden(), 'dock not closed');
    });
    await check('UI-19', 'Permission: customer cannot use staff APIs; staff views ask to sign in', async () => {
      const r = await c.request.get(base + '/api/business/staff/inbox'); assert(r.status() === 403, 'customer read staff inbox');
      await c.goto(base + '/staff?view=staff', { waitUntil: 'networkidle' }); await c.getByText('Staff sign-in required').waitFor(); await shot(c, 'customer-staff-denied-1440');
    });
    await check('UI-20', 'Keyboard and dialogs: visible focus, Escape closes dialog', async () => {
      const dialogContext=await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      try {
        const dialogPage=await dialogContext.newPage(); watch(dialogPage, 'dialog');
        await dialogPage.goto(base + '/app', { waitUntil: 'networkidle' }); await signUp(dialogPage, 'ui20-dialog@example.invalid');
        await dialogPage.keyboard.press('Tab'); assert(await dialogPage.evaluate(() => document.activeElement && document.activeElement !== document.body), 'no focus');
        await dialogPage.locator('#account-open').click(); await dialogPage.locator('#account-menu [role=menuitem]').first().waitFor(); await dialogPage.keyboard.press('Escape'); await dialogPage.locator('#account-menu').waitFor({ state: 'hidden' });
        await dialogPage.locator('#staff-request').click(); await dialogPage.locator('#modal').waitFor();
        await dialogPage.locator('#notice').waitFor({ state: 'hidden' }); await shot(dialogPage, 'keyboard-dialog-1440');
        await dialogPage.keyboard.press('Escape'); await dialogPage.locator('#modal').waitFor({ state: 'hidden' });
        assert(await noOverflow(dialogPage), 'desktop overflow');
      } finally { await dialogContext.close(); }
    });
    await check('UI-26', 'AI Lab Report: free reading, upgrade prompt, Plus via signed test payment, multi-image reading, lab dashboard over time, printable Lab Report', async () => {
      const lctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const l = await lctx.newPage(); watch(l, 'labs');
      const png = path.join(root, 'examples/thai_lab_reference_v3/png/01_A_Liver.png');
      await l.goto(base + '/app?view=labs', { waitUntil: 'networkidle' }); await signUp(l, 'labs-' + Date.now() + '@example.invalid');
      await l.goto(base + '/app?view=labs', { waitUntil: 'networkidle' }); await l.getByText('No confirmed reports yet').waitFor(); await l.getByText('Free plan', { exact: true }).waitFor();
      const confirmReport = async () => { await l.locator('#modal').getByRole('button', { name: 'Confirm and use report' }).waitFor(); await l.locator('#modal input[type=checkbox]').check(); await l.locator('#modal').getByRole('button', { name: 'Confirm and use report' }).click(); await l.locator('#modal').waitFor({ state: 'hidden' }); };
      await l.locator('#report-file').setInputFiles(png); await confirmReport();
      await l.goto(base + '/app?view=labs', { waitUntil: 'networkidle' }); await l.getByRole('link', { name: 'Open Lab Report' }).waitFor(); await l.locator('.locked').waitFor();
      await shot(l, 'labs-free-1440');
      await l.getByRole('button', { name: 'Add a report' }).click(); await l.getByRole('heading', { name: 'This needs LabClear Plus' }).waitFor();
      await l.locator('#modal').getByRole('button', { name: 'See LabClear Plus' }).click(); await l.getByRole('button', { name: 'Subscribe with test PromptPay' }).waitFor(); await shot(l, 'plan-free-1440');
      await l.getByRole('button', { name: 'Subscribe with test PromptPay' }).click(); await l.waitForURL(/\/pay\/sim\//); await l.getByText('LabClear Plus, 30 days', { exact: false }).waitFor();
      await l.getByRole('button', { name: 'Simulate successful payment' }).click(); await l.getByRole('link', { name: 'Back to my plan' }).click(); await l.waitForURL(/view=plan/);
      await l.locator('.plan-card.featured').getByText('Current plan').waitFor();
      await l.goto(base + '/app?view=reports', { waitUntil: 'networkidle' }); assert(await l.locator('#report-file').evaluate(e => e.multiple), 'Plus should allow several files');
      await l.locator('#report-file').setInputFiles([png, png]); await l.locator('#modal .report-pages img').nth(1).waitFor(); await confirmReport();
      await l.goto(base + '/app?view=labs', { waitUntil: 'networkidle' }); await l.locator('.trend-card').first().waitFor(); assert(await l.locator('.trend-card svg.spark').count() > 0, 'no trend chart');
      await shot(l, 'labs-plus-1440', true);
      const href = await l.getByRole('link', { name: 'Open Lab Report' }).getAttribute('href'); await l.goto(base + href, { waitUntil: 'networkidle' });
      await l.locator('.lab-table tbody tr').first().waitFor(); assert(await l.locator('.lab-table th', { hasText: /^Previous/ }).count() === 1, 'Plus Lab Report should compare with the previous report');
      await l.getByRole('button', { name: 'Print or save as PDF' }).waitFor(); await shot(l, 'lab-report-1440', true); await lctx.close();
    });
    await check('UI-27', 'Website v5: product deck tabs, search dialog (Ctrl K), nav dropdown, AI Lab Report page', async () => {
      const wctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const w = await wctx.newPage(); watch(w, 'site-v5');
      await w.goto(base, { waitUntil: 'networkidle' });
      await w.locator('[data-deck] [role=tab]', { hasText: 'Book' }).click(); assert(await w.locator('#deck-book').getAttribute('data-pos') === '0', 'deck tab did not bring its card forward');
      await w.locator('[data-deck] [role=tab][aria-selected=true]').press('ArrowRight'); assert(await w.locator('#deck-read').getAttribute('data-pos') === '0', 'arrow key did not move the deck');
      await w.locator('.nav-drop-btn').click(); await w.locator('#menu-checks').getByRole('link', { name: /Compare packages/ }).waitFor(); await w.keyboard.press('Escape'); assert(await w.locator('#menu-checks').isHidden(), 'dropdown did not close');
      await w.keyboard.press('Control+k'); await w.locator('#search-input').fill('lipid'); await w.locator('#search-results .search-item', { hasText: 'Package' }).first().waitFor();
      await shot(w, 'search-dialog-1440'); await w.keyboard.press('Enter'); await w.waitForURL(/\/packages\/P\d+/);
      await w.goto(base + '/lab-reports', { waitUntil: 'networkidle' }); await w.getByRole('heading', { level: 1 }).waitFor(); assert(await w.getByText('฿355').count() > 0, 'Plus price missing'); await shot(w, 'lab-reports-1440', true);
      await wctx.close();
    });
    await check('UI-29', 'Sign-in: demo accounts by typing (not listed), admin goes to the service desk and AI providers, test-02 has Plus', async () => {
      const dctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const d = await dctx.newPage(); watch(d, 'demo');
      const appSignIn = async (who) => {
        await d.getByRole('button', { name: 'Sign in' }).click(); const m = d.locator('#modal');
        await m.getByLabel('Email or username').fill(who); await m.getByLabel('Password', { exact: true }).fill('1234');
        await m.getByRole('button', { name: 'Sign in', exact: true }).click();
      };
      await d.goto(base + '/app', { waitUntil: 'networkidle' }); await d.getByRole('button', { name: 'Sign in' }).click();
      await d.locator('#modal').getByLabel('Email or username').waitFor(); assert(await d.locator('.demo-pick').count() === 0, 'demo accounts are not listed'); await wait(300); await shot(d, 'signin-1440');
      const m0 = d.locator('#modal'); await m0.getByLabel('Email or username').fill('admin'); await m0.getByLabel('Password', { exact: true }).fill('1234');
      await m0.getByRole('button', { name: 'Sign in', exact: true }).click(); await d.waitForURL(/\/staff/);
      await d.locator('[data-view=ai]').click(); await d.locator('#content').getByRole('heading', { name: 'AI providers' }).waitFor();
      await d.locator('#account-open').click(); await d.getByRole('menuitem', { name: 'Sign out' }).click(); await d.locator('#modal-title', { hasText: 'Staff sign-in' }).waitFor();
      await d.goto(base + '/app', { waitUntil: 'networkidle' }); await appSignIn('test-02');
      await d.locator('#modal').waitFor({ state: 'hidden' }); await d.goto(base + '/app?view=plan', { waitUntil: 'networkidle' }); await d.locator('.plan-card.featured').getByText('Current plan').waitFor();
      await dctx.close();
    });
    await check('UI-30', 'Report in the chat: thumbnail before and after sending, live steps, values card, one-click confirm answers the question', async () => {
      const rctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const r = await rctx.newPage(); watch(r, 'chat-report');
      await r.goto(base + '/app', { waitUntil: 'networkidle' }); await signUp(r, 'report-ui@example.invalid');
      await r.locator('#attach').click(); await r.locator('#add-report').click();
      await r.locator('#report-file').setInputFiles(path.join(root, 'examples/thai_lab_reference_v3/png/04_B_Glucose_Urine.png'));
      await r.locator('#attachments .draft-file img').waitFor(); await r.locator('#message').fill('UI_TEST_REPORT_QUESTION');
      await r.locator('#send').click(); await r.locator('.turn.thinking .step').first().waitFor();
      await r.locator('.report-card.draft').waitFor(); await r.locator('.turn.user .thumb img').last().evaluate(img => img.decode());
      assert(await r.locator('.turn.user .thumb img').last().evaluate(img => img.naturalWidth > 0), 'thumbnail did not load');
      let w = await (await r.request.get(base + '/api/business/workspace')).json(); assert(!w.conversation.report_id, 'report used before confirmation'); await shot(r, 'chat-report-card-1440');
      await r.getByRole('button', { name: 'Values are correct, this is my report' }).click(); await r.locator('.report-card.confirmed').waitFor();
      await r.getByText('Offline UI test double: your question was received.').last().waitFor();
      w = await (await r.request.get(base + '/api/business/workspace')).json();
      assert(w.conversation.report_id && w.conversation.messages.filter(m => m.content === 'UI_TEST_REPORT_QUESTION').length === 1, 'confirmation did not answer once');
      await r.locator('.act', { hasText: 'Process Explainability' }).last().click(); await r.locator('.receipt:not([hidden]) .step-label').first().waitFor(); await shot(r, 'chat-report-answer-1440');
      await rctx.close();
    });
    await check('UI-31', 'Chats and projects: new chat, project, rename, switch back, drawer on mobile', async () => {
      const pctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await pctx.newPage(); watch(p, 'chats');
      await p.goto(base + '/app', { waitUntil: 'networkidle' }); await signUp(p, 'projects-ui@example.invalid'); await p.locator('#message').fill('UI_TEST_FIRST_CHAT'); await p.locator('#send').click();
      await p.locator('.cl-item.active', { hasText: 'UI_TEST_FIRST_CHAT' }).waitFor();
      await p.getByRole('button', { name: 'New project' }).click(); await p.getByLabel('Project name').fill('Annual check-up'); await p.getByRole('button', { name: 'Create project' }).click();
      await p.getByRole('button', { name: 'New chat in Annual check-up' }).click(); await p.locator('#chat-project', { hasText: 'Annual check-up' }).waitFor();
      await p.locator('#message').fill('UI_TEST_PROJECT_CHAT'); await p.locator('#send').click(); await p.locator('.cl-children .cl-item.active').waitFor();
      await p.getByRole('button', { name: 'Options for chat UI_TEST_PROJECT_CHAT' }).click(); await p.getByLabel('Chat name').fill('Lipids follow-up'); await p.locator('#modal').getByRole('button', { name: 'Save' }).click();
      await p.locator('.cl-children .cl-name', { hasText: 'Lipids follow-up' }).waitFor(); await shot(p, 'chats-1440');
      await p.locator('.cl-open', { hasText: 'UI_TEST_FIRST_CHAT' }).click(); await p.locator('#messages .turn.user', { hasText: 'UI_TEST_FIRST_CHAT' }).waitFor();
      assert(await p.locator('#messages').getByText('UI_TEST_PROJECT_CHAT').count() === 0, 'switched chat still shows the other chat');
      await p.setViewportSize({ width: 390, height: 844 }); await wait(200); assert(await p.locator('#chat-list').evaluate(e => e.inert), 'closed drawer should be inert');
      await p.locator('#chats-toggle').click(); await p.locator('#chat-list.open').waitFor(); await wait(300); await shot(p, 'chats-390');
      await p.keyboard.press('Escape'); assert(!(await p.locator('#chat-list').evaluate(e => e.classList.contains('open'))), 'drawer did not close');
      assert(await noOverflow(p), 'mobile overflow'); await pctx.close();
    });
    await check('UI-32', 'Website: sign in from the header with a typed demo account, account menu, sign out; journey section; agents on AI providers', async () => {
      const hctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const h = await hctx.newPage(); watch(h, 'header');
      await h.goto(base + '/', { waitUntil: 'networkidle' }); await h.locator('#journey-title').waitFor();
      assert(await h.locator('.journey-steps li').count() === 5, 'journey has five steps');
      const siteSignIn = async (who) => {
        await h.locator('[data-account]').getByRole('button', { name: 'Sign in' }).click(); const g = h.locator('#signin-dialog');
        await g.getByLabel('Email or username').fill(who); await g.getByLabel('Password', { exact: true }).fill('1234');
        await g.getByRole('button', { name: 'Sign in', exact: true }).click();
      };
      await siteSignIn('test-01'); await h.waitForURL(/\/app/);
      await h.goto(base + '/packages', { waitUntil: 'networkidle' }); await h.locator('.nav-avatar').click();
      await h.getByRole('menuitem', { name: 'My appointments' }).waitFor(); await shot(h, 'header-menu-1440');
      await h.getByRole('menuitem', { name: 'Sign out' }).click(); await h.locator('[data-account]').getByRole('button', { name: 'Sign in' }).waitFor();
      await siteSignIn('admin'); await h.waitForURL(/\/staff/);
      await h.locator('[data-view=ai]').click(); await h.locator('.agents-card .agent-row').first().waitFor();
      assert(await h.locator('.agents-card .agent-row').count() === 6, 'four legacy agents and two opt-in roles');
      await h.getByLabel('Model for the Reviewer').selectOption('own');
      await h.locator('.agent-row').filter({ has: h.getByLabel('Model for the Reviewer') }).locator('.ai-form').waitFor({ state: 'visible' });
      await shot(h, 'ai-agents-1440'); await hctx.close();
    });
    await check('UI-33', 'Guest: upload/image preview, no persisted token, reload revokes chat and image, no history after signup', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await ctx.newPage(); watch(p, 'guest-privacy');
      let session;
      p.on('response', async r => { if (r.url().endsWith('/api/business/session') && r.ok()) session = await r.json(); });
      await p.goto(base + '/app?attach=1', { waitUntil: 'networkidle' });
      await p.locator('#attach-menu').waitFor({ state: 'visible' }); await p.locator('#add-report').click();
      await p.locator('#report-file').setInputFiles(path.join(root, 'examples/thai_lab_reference_v3/png/04_B_Glucose_Urine.png'));
      await p.locator('#message').fill('PRIVATE_GUEST_302'); await p.locator('#send').click(); await p.locator('.report-card.draft').waitFor();
      // The thumbnail's private blob is fetched after the turn renders; wait for it before decoding (race seen on Linux).
      await p.locator('.turn.user .thumb img[src^="blob:"]').last().waitFor({ state: 'attached' });
      await p.locator('.turn.user .thumb img').last().evaluate(img => img.decode());
      assert(await p.locator('.turn.user .thumb img').last().evaluate(img => img.naturalWidth > 0 && img.src.startsWith('blob:')), 'guest image requires a private blob');
      await p.getByRole('button', { name: 'Edit values', exact: true }).click(); await p.locator('.report-preview').evaluate(img => img.decode());
      await p.locator('#modal-close').click();
      const old = session, headers = { 'X-LabClear-Guest': old.guest_token };
      const workspace = await (await p.request.get(base + '/api/business/workspace', { headers })).json();
      const report = workspace.reports[0].id;
      assert(!(await ctx.cookies()).some(x => x.name === 'labclear_session'), 'guest auth cookie saved');
      const stores = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
      assert(!stores.includes('PRIVATE_GUEST_302') && !stores.includes(old.guest_token), 'guest data persisted in Web Storage');
      assert(workspace.chats.chats.length === 0 && workspace.chats.projects.length === 0, 'guest history listed');
      await shot(p, 'guest-temporary-1440');
      await p.reload({ waitUntil: 'networkidle' });
      assert(await p.locator('#messages').getByText('PRIVATE_GUEST_302').count() === 0, 'chat survived reload');
      assert((await p.request.get(base + '/api/business/workspace', { headers })).status() === 401, 'close beacon did not revoke old token');
      assert((await p.request.get(base + '/api/business/reports/' + report + '/source', { headers })).status() === 401, 'old report source survived');
      await p.locator('#message').fill('PRIVATE_BEFORE_SIGNUP'); await p.locator('#send').click(); await p.getByText('Offline UI test double: your question was received.').last().waitFor();
      let releaseGuest, capturedGuest;
      const delayedGuest = new Promise(resolve => { releaseGuest = resolve; });
      const captured = new Promise(resolve => { capturedGuest = resolve; });
      let held = false;
      await p.route('**/api/business/workspace', async route => {
        if (!held && route.request().headers()['x-labclear-guest']) {
          held = true; const response = await route.fetch(); capturedGuest();
          await delayedGuest; await route.fulfill({ response });
        } else await route.continue();
      });
      // Hold the next ordinary Guest poll across the identity change.
      await Promise.race([captured, wait(12000).then(() => { throw Error('Guest poll not observed'); })]);
      await signUp(p, 'guest-converted@example.invalid');
      assert(await p.locator('#messages').getByText('PRIVATE_BEFORE_SIGNUP').count() === 0, 'guest chat imported');
      const staleDelivered = p.waitForResponse(r => r.url().endsWith('/api/business/workspace') && !!r.request().headers()['x-labclear-guest']);
      releaseGuest(); await staleDelivered; await wait(200);
      assert(await p.locator('#messages').getByText('PRIVATE_BEFORE_SIGNUP').count() === 0, 'stale guest poll repainted account');
      assert((await p.locator('#account-label').innerText()).includes('guest-converted@'), 'stale guest poll changed identity');
      assert((await (await p.request.get(base + '/api/business/workspace')).json()).conversation.messages.length === 0, 'guest history stored under account');
      await ctx.close();
    });
    await check('UI-34', 'Navigation: delayed view cannot overwrite latest click; booking fields survive sign-in; customer staff URL stays private', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await ctx.newPage(); watch(p, 'navigation');
      await p.goto(base + '/app', { waitUntil: 'networkidle' });
      let release; const delayed = new Promise(resolve => { release = resolve; });
      await p.route('**/api/business/plans', async route => { await delayed; await route.continue(); });
      const started = p.waitForRequest('**/api/business/plans'); await p.locator('[data-view=plan]').click(); await started;
      await p.locator('[data-view=book]').click(); await p.getByLabel('Health check', { exact: true }).waitFor(); release();
      await p.waitForResponse('**/api/business/plans'); await wait(300);
      assert(await p.getByLabel('Health check', { exact: true }).isVisible(), 'old view overwrote booking');
      await p.getByLabel('Health check', { exact: true }).selectOption('P03'); await p.getByLabel('Center').selectOption('BKK01');
      await p.getByLabel('Date', { exact: true }).fill(day1); await p.getByLabel('Date', { exact: true }).dispatchEvent('change');
      await p.getByRole('button', { name: /^11:00/ }).click();
      await signUp(p, 'nav-preserve@example.invalid');
      assert(await p.getByLabel('Health check', { exact: true }).inputValue() === 'P03', 'package lost at sign-in');
      assert(await p.getByLabel('Date', { exact: true }).inputValue() === day1, 'date lost at sign-in');
      assert(await p.getByRole('button', { name: /^11:00/ }).getAttribute('aria-pressed') === 'true', 'slot lost at sign-in');
      await p.goto(base + '/app?view=staff', { waitUntil: 'networkidle' });
      assert(await p.locator('#chat-view').isVisible(), 'customer routed to staff inbox'); await shot(p, 'customer-staff-url-private-1440'); await ctx.close();
    });
    for (const [w, h, label] of [[768, 1024, 'tablet'], [390, 844, 'mobile']]) {
      await check('UI-21-' + label, label + ': pages without horizontal overflow, navigation drawer, filters toggle, reduced motion', async () => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }); const m = await ctx.newPage(); watch(m, label);
        for (const p of ['/', '/packages', '/packages/P02', '/organizations', '/centers', '/help', '/compare?ids=P01,P02']) { await m.goto(base + p, { waitUntil: 'networkidle' }); assert(await noOverflow(m), 'overflow on ' + p); }
        await m.goto(base, { waitUntil: 'networkidle' }); await shot(m, 'home-' + w, true);
        await m.locator('.nav-toggle').click(); await m.locator('#main-nav').getByRole('link', { name: 'Organizations' }).waitFor(); await m.keyboard.press('Escape'); assert(await m.locator('#main-nav').isHidden(), 'nav not closed');
        if (w < 1080) { await m.goto(base + '/packages', { waitUntil: 'networkidle' }); await m.locator('.filters-open').click(); await m.locator('#filters').waitFor({ state: 'visible' }); await shot(m, 'catalog-filters-' + w); }
        await m.goto(base + '/app', { waitUntil: 'networkidle' }); assert(await noOverflow(m), 'app overflow');
        if (w <= 800) { assert(await m.locator('#sidebar').evaluate(e => e.inert), 'drawer should be inert'); await m.locator('#menu-toggle').click(); await m.locator('[data-view=book]').click(); await m.getByLabel('Center').waitFor(); }
        assert(await m.locator('#send').evaluate(e => e.getBoundingClientRect().right <= innerWidth) || w > 800, 'send clipped');
        await shot(m, 'app-' + w); await ctx.close();
      });
    }
    await check('UI-22', 'No uncaught browser JavaScript errors', async () => assert(!errors.length, JSON.stringify(errors.slice(0, 5))));
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally {
    const failed = records.filter(r => r.status !== 'PASS').length;
    const exitCode = process.exitCode || (failed || errors.length ? 1 : 0);
    if (exitCode) process.exitCode = exitCode;
    const python = spawnSync(py, ['--version'], { encoding: 'utf8' });
    const screenshotRecords = screenshotEvidence.map(item => ({
      ...item,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(out, item.file))).digest('hex')
    }));
    fs.writeFileSync(path.join(out, 'browser-uat.json'), JSON.stringify({
      started_at: startedAt, finished_at: new Date().toISOString(), candidate_sha: sha,
      working_tree_dirty: dirty, git_diff_binary_sha256: diffSha, status_porcelain_at_start: statusPorcelain,
      environment: {
        platform: process.platform, architecture: process.arch, node: process.version,
        playwright: require('playwright/package.json').version, browser: 'Chromium',
        browser_version: browser ? browser.version() : null,
        python: (python.stdout || python.stderr || '').trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        fixture: 'isolated SQLite; PROVIDER_NETWORK_ENABLED=false; synthetic test data'
      },
      mode: 'MOCKED_TEST_ONLY for LLM and OCR; real UI/API/storage/permissions. Not model or OCR quality evidence.',
      passed: records.length - failed, failed, exit_code: exitCode, records, errors, screenshots: shots,
      screenshot_evidence: screenshotRecords
    }, null, 2));
    console.log(records.map(r => `${r.status} ${r.id} ${r.name}${r.error ? ' — ' + r.error : ''}`).join('\n'));
    if (browser) await browser.close(); server.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
