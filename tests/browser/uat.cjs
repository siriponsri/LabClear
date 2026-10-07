/* Full business browser UAT.
   Real UI, HTTP routes, SQLite storage, auth, CSRF, permissions and state machines.
   MOCKED_TEST_ONLY: LLM agent and OCR reader are doubles (tests/browser/fixture_server.py),
   so these results are UI/flow evidence, never model or OCR quality evidence.
   Usage: TEST_PYTHON=/path/to/python node tests/browser/uat.cjs   (UAT_OUT to change output folder) */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn, execSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, process.env.UAT_OUT || 'test-results/uat'); fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'labclear-uat-')); const port = Number(process.env.UI_TEST_PORT || 8098), base = 'http://127.0.0.1:' + port;
const py = process.env.TEST_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
let sha = 'unknown', dirty = null; try { sha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); dirty = execSync('git status --porcelain', { cwd: root }).toString().trim().length > 0; } catch { /* no git */ }
const server = (() => { try { require('child_process').execSync(`node -e "fetch('${'http://127.0.0.1:' + (process.env.UI_TEST_PORT || 8098)}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, { stdio: 'ignore' }); console.error('Port in use: another server answers on the UAT port. Stop it first; results would come from its database.'); process.exit(2); } catch { /* port free */ } return null; })() || spawn(py, ['tests/browser/fixture_server.py'], { cwd: root, env: { ...process.env, UI_TEST_PORT: String(port), PROVIDER_NETWORK_ENABLED: 'false', BUSINESS_DB_PATH: path.join(tmp, 'db.sqlite'), BUSINESS_KEY_PATH: path.join(tmp, 'key'), BUSINESS_DATA_KEY: '', DATABASE_URL: '', VERCEL: '', RENDER: '', APP_ENV: 'test', BUSINESS_EXTERNAL_ENABLED: '', STRIPE_SECRET_KEY: '', LINE_CHANNEL_SECRET: '', LINE_CHANNEL_ACCESS_TOKEN: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
let log = ''; server.on('error', e => { log += 'Fixture process failed: ' + e.message; }); server.stderr.on('data', x => { log += x; });
let browser; const records = [], errors = [], shots = []; const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw Error(m); };
async function check(id, name, fn) { const start = Date.now(); try { await fn(); records.push({ id, name, status: 'PASS', ms: Date.now() - start }); } catch (e) { records.push({ id, name, status: 'FAIL', ms: Date.now() - start, error: e.message.split('\n')[0] }); if (process.env.UAT_DEBUG && browser) { let n = 0; for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await pg.screenshot({ path: path.join(out, 'fail-' + id + '-' + (n++) + '.png') }).catch(() => {}); } } }
async function shot(page, name, full = false) { const file = name + '.png'; await page.screenshot({ path: path.join(out, file), fullPage: full }); shots.push(file); }
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
      await c.locator('[data-error]').waitFor({ state: 'visible' }); await c.unroute('**/api/business/catalog/search**');
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
    await check('UI-04', 'Package detail CTA leads to booking view; guest must create an account', async () => {
      await c.goto(base + '/packages/P02', { waitUntil: 'networkidle' }); await c.getByRole('link', { name: 'Request an appointment' }).click();
      await c.waitForURL(/view=book/); await c.locator('select').first().waitFor(); assert(await c.locator('.field select').first().inputValue() === 'P02', 'package preselected');
      assert((await c.goto(base + '/packages/P99')).status() === 404, '404 page');
    });
    await check('UI-05', 'Account: create account, label updates, survives reload', async () => {
      await c.goto(base + '/app', { waitUntil: 'networkidle' }); await signUp(c, 'customer@example.invalid');
      assert((await c.locator('#account-label').innerText()).includes('customer@'), 'label'); await c.reload({ waitUntil: 'networkidle' });
      assert((await c.locator('#account-label').innerText()).includes('customer@'), 'session lost');
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
      await c.getByRole('button', { name: 'Retry', exact: true }).waitFor(); await c.getByRole('button', { name: 'Retry', exact: true }).click();
      await c.getByText('Offline UI test double: your question was received.').last().waitFor();
      const w = await (await c.request.get(base + '/api/business/workspace')).json(); assert(w.conversation.messages.filter(m => m.content === 'UI_TEST_FAIL_ONCE').length === 1, 'duplicated');
      await c.locator('#message').fill('UI_TEST_SOURCES'); await c.getByRole('button', { name: 'Send message' }).click();
      await c.locator('#messages .act', { hasText: 'View source' }).last().click(); await c.getByRole('link', { name: /How to understand your lab results/ }).last().waitFor(); await c.getByRole('button', { name: 'What does a reference range mean?' }).waitFor();
    });
    await check('UI-09', 'Reports: upload (OCR double), source image, edit, explicit confirmation, context chip, reload', async () => {
      await c.locator('#report-file').setInputFiles(path.join(root, 'examples/thai_lab_reference_v3/png/04_B_Glucose_Urine.png'));
      await c.getByRole('heading', { name: 'Review report fields' }).waitFor(); await c.locator('.report-preview').evaluate(img => img.decode());
      assert(await c.locator('.report-preview').evaluate(img => img.naturalWidth > 0), 'no image');
      await c.getByLabel('value for row 1', { exact: true }).fill('101'); await shot(c, 'report-review-1440');
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
    await check('UI-11', 'Staff: separate session sign-in, inbox shows organization request with details', async () => {
      await s.goto(base + '/staff', { waitUntil: 'networkidle' }); await s.getByLabel('Email or username').fill('staff@example.invalid'); await s.getByLabel('Password', { exact: true }).fill('ui-test-only-password');
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
      await s.locator('[data-view=operations]').click(); await s.getByRole('button', { name: /Awaiting confirmation \(2\)/ }).waitFor();
      await s.getByRole('button', { name: 'Confirm appointment' }).first().click(); await s.locator('#notice').filter({ hasText: 'Confirmed' }).waitFor();
      await s.getByRole('button', { name: 'Decline', exact: true }).first().click(); await s.getByLabel('Reason shown to the customer').fill('No technician available at that time (test).');
      await s.getByRole('button', { name: 'Decline request' }).click(); await s.getByRole('button', { name: /Awaiting confirmation \(0\)/ }).waitFor(); await shot(s, 'staff-appointments-1440');
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
    await check('UI-16', 'Website handoff: customer asks for team, staff takes over, reply reaches customer, assistant paused', async () => {
      await c.goto(base + '/app', { waitUntil: 'networkidle' }); await c.locator('#staff-request').click(); await c.getByLabel('How can our team help?').fill('UI UAT live help request');
      await c.getByRole('button', { name: 'Send to our team' }).click(); await c.locator('#handoff-state').filter({ hasText: /queued|replying/ }).waitFor(); // a case taken over in UI-12 already pauses the assistant
      await s.locator('[data-view=staff]').click(); await s.getByRole('button', { name: /UI UAT live help request|Organization inquiry/ }).first().click();
      await s.getByRole('heading', { name: /Organization inquiry|UI UAT live help request/ }).waitFor();
      const btnTake = s.getByRole('button', { name: 'Take over' }); if (await btnTake.count()) await Promise.all([s.waitForResponse(r => r.url().endsWith('/state')), btnTake.click()]);
      // The ticket view re-renders after Take over; fill once the reply box has settled.
      const reply = s.getByLabel('Staff reply'); for (let i = 0; i < 6; i++) { await reply.fill('A staff member is reviewing your request.'); await wait(400); if (await reply.inputValue() === 'A staff member is reviewing your request.') break; }
      await Promise.all([s.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST'), s.getByRole('button', { name: 'Send reply' }).click()]);
      await c.getByText('A staff member is reviewing your request.').waitFor({ timeout: 12000 }); await c.locator('#handoff-state').filter({ hasText: 'paused' }).waitFor();
      await shot(s, 'staff-inbox-1440');
    });
    await check('UI-17', 'Manager: price edit persists and reaches the public catalog; branch staff cannot see manager tools', async () => {
      await s.locator('[data-view=catalog-admin]').click(); await s.getByLabel('Essential Check price in THB').fill('1250');
      await s.getByRole('row', { name: /Essential Check/ }).getByRole('button', { name: 'Save package' }).click(); await s.getByText(/Saved · now ฿1,250/).waitFor();
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
      const card = s.locator('#content section.card').filter({ has: s.getByRole('heading', { name: 'Language model' }) });
      await card.getByLabel('Provider').selectOption('anthropic'); await card.getByLabel('API key').fill('sk-ant-uat-0123456789wxyz');
      await card.getByRole('button', { name: 'Save' }).click(); await s.locator('#notice').filter({ hasText: 'saved' }).waitFor();
      const again = s.locator('#content section.card').filter({ has: s.getByRole('heading', { name: 'Language model' }) });
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
      await c.goto(base + '/staff?view=staff', { waitUntil: 'networkidle' }); await c.getByText('Staff sign-in required').waitFor();
    });
    await check('UI-20', 'Keyboard and dialogs: visible focus, Escape closes dialog', async () => {
      await c.goto(base + '/app', { waitUntil: 'networkidle' }); await c.keyboard.press('Tab'); assert(await c.evaluate(() => document.activeElement && document.activeElement !== document.body), 'no focus');
      await c.locator('#account-open').click(); await c.locator('#account-menu [role=menuitem]').first().waitFor(); await c.keyboard.press('Escape'); await c.locator('#account-menu').waitFor({ state: 'hidden' });
      await c.locator('#staff-request').click(); await c.locator('#modal').waitFor(); await c.keyboard.press('Escape'); await c.locator('#modal').waitFor({ state: 'hidden' });
      assert(await noOverflow(c), 'desktop overflow');
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
    await check('UI-29', 'Sign-in: demo accounts (1234), admin goes to the service desk and AI providers, test-02 has Plus', async () => {
      const dctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const d = await dctx.newPage(); watch(d, 'demo');
      await d.goto(base + '/app', { waitUntil: 'networkidle' }); await d.getByRole('button', { name: 'Sign in' }).click();
      await d.locator('.demo-pick').first().waitFor(); assert(await d.locator('.demo-pick').count() === 3, 'three demo accounts'); await wait(300); await shot(d, 'signin-1440');
      await d.getByRole('button', { name: /Sign in as admin/ }).click(); await d.waitForURL(/\/staff/);
      await d.locator('[data-view=ai]').click(); await d.locator('#content').getByRole('heading', { name: 'AI providers' }).waitFor();
      await d.locator('#account-open').click(); await d.getByRole('menuitem', { name: 'Sign out' }).click(); await d.locator('#modal-title', { hasText: 'Staff sign-in' }).waitFor();
      await d.goto(base + '/app', { waitUntil: 'networkidle' }); await d.getByRole('button', { name: 'Sign in' }).click(); await d.getByRole('button', { name: /Sign in as test-02/ }).click();
      await d.locator('#modal').waitFor({ state: 'hidden' }); await d.goto(base + '/app?view=plan', { waitUntil: 'networkidle' }); await d.locator('.plan-card.featured').getByText('Current plan').waitFor();
      await dctx.close();
    });
    await check('UI-30', 'Report in the chat: thumbnail before and after sending, live steps, values card, one-click confirm answers the question', async () => {
      const rctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const r = await rctx.newPage(); watch(r, 'chat-report');
      await r.goto(base + '/app', { waitUntil: 'networkidle' });
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
      await r.locator('.act', { hasText: 'How this was checked' }).last().click(); await r.locator('.receipt:not([hidden]) .step-label').first().waitFor(); await shot(r, 'chat-report-answer-1440');
      await rctx.close();
    });
    await check('UI-31', 'Chats and projects: new chat, project, rename, switch back, drawer on mobile', async () => {
      const pctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await pctx.newPage(); watch(p, 'chats');
      await p.goto(base + '/app', { waitUntil: 'networkidle' }); await p.locator('#message').fill('UI_TEST_FIRST_CHAT'); await p.locator('#send').click();
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
    await check('UI-32', 'Website: sign in from the header with a demo account, account menu, sign out; journey section; agents on AI providers', async () => {
      const hctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const h = await hctx.newPage(); watch(h, 'header');
      await h.goto(base + '/', { waitUntil: 'networkidle' }); await h.locator('#journey-title').waitFor();
      assert(await h.locator('.journey-steps li').count() === 5, 'journey has five steps');
      await h.locator('[data-account]').getByRole('button', { name: 'Sign in' }).click(); await h.locator('#signin-dialog .demo-pick').first().waitFor();
      await h.getByRole('button', { name: /Sign in as test-01/ }).click(); await h.waitForURL(/\/app/);
      await h.goto(base + '/packages', { waitUntil: 'networkidle' }); await h.locator('.nav-avatar').click();
      await h.getByRole('menuitem', { name: 'My appointments' }).waitFor(); await shot(h, 'header-menu-1440');
      await h.getByRole('menuitem', { name: 'Sign out' }).click(); await h.locator('[data-account]').getByRole('button', { name: 'Sign in' }).waitFor();
      await h.locator('[data-account]').getByRole('button', { name: 'Sign in' }).click(); await h.getByRole('button', { name: /Sign in as admin/ }).click(); await h.waitForURL(/\/staff/);
      await h.locator('[data-view=ai]').click(); await h.locator('.agents-card .agent-row').first().waitFor();
      assert(await h.locator('.agents-card .agent-row').count() === 4, 'four agents');
      await h.getByLabel('Model for the Reviewer').selectOption('own'); await h.locator('.agents-card .ai-form').last().waitFor({ state: 'visible' });
      await shot(h, 'ai-agents-1440'); await hctx.close();
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
    const failed = records.filter(r => r.status !== 'PASS').length; if (failed) process.exitCode = 1;
    fs.writeFileSync(path.join(out, 'browser-uat.json'), JSON.stringify({ date: new Date().toISOString(), candidate_sha: sha, working_tree_dirty: dirty, mode: 'MOCKED_TEST_ONLY for LLM and OCR; real UI/API/storage/permissions. Not model or OCR quality evidence.', passed: records.length - failed, failed, records, errors, screenshots: shots }, null, 2));
    console.log(records.map(r => `${r.status} ${r.id} ${r.name}${r.error ? ' — ' + r.error : ''}`).join('\n'));
    if (browser) await browser.close(); server.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
