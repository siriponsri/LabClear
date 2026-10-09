/* Offline upgrade verification. Synthetic accounts/documents only; no provider calls. */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..');
// Integration 4.0: UAT_OUT and TEST_PYTHON allow a run outside Windows without overwriting the Codex evidence.
const out = process.env.UAT_OUT ? path.resolve(root, process.env.UAT_OUT) : path.join(root, 'docs/evidence/current/browser');
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:8099';
const python = process.env.TEST_PYTHON || path.join(root, '.venv/Scripts/python.exe');
const server = spawn(python, ['scripts/offline_check.py', 'browser', '8099'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
let errors = '', browser;
server.stderr.on('data', b => { errors += b; });
const records = [], screenshots = [], browserErrors = [];
// The interface is Thai by default (labclear_language cookie). Thai interface strings may carry
// invisible line-breaking marks (U+2060, U+200B; see docs/i18n.md), so match them tolerantly.
const th = (text) => new RegExp('^\\s*' + [...text].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\u2060\\u200b]*') + '\\s*$');
const check = (condition, message) => { if (!condition) throw Error(message); };
async function shot(page, name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); screenshots.push(name + '.png'); }
async function scenario(name, fn) { try { await fn(); records.push({ name, status: 'PASS' }); } catch (e) { records.push({ name, status: 'FAIL', error: e.message }); } }
(async () => {
  try {
    for (let n = 0; n < 60; n++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 300)); if (n === 59) throw Error('Fixture did not boot: ' + errors.slice(-1500)); }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', e => browserErrors.push(e.message));
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await scenario('baseline home ' + width, async () => {
        const start = Date.now(); await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
        await page.evaluate(() => document.fonts.ready); await shot(page, 'baseline-home-' + width);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'baseline overflow');
        records.push({ name: 'baseline home timing ' + width, ms: Date.now() - start, scope: 'local fixture navigation + screenshot; not production performance' });
      });
      await scenario('interactive Thai preview ' + width, async () => {
        const start = Date.now(); await page.goto(base + '/preview/landing', { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
        await page.locator('[data-row="Hemoglobin"]').click();
        check((await page.locator('#sample-value').innerText()).includes('13.2 g/dL'), 'value changed');
        await page.locator('[data-row="Creatinine"]').focus(); await page.keyboard.press('Enter');
        check((await page.locator('#sample-value').innerText()).includes('0.75 mg/dL'), 'keyboard control');
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'preview overflow');
        await shot(page, 'preview-th-' + width);
        await page.locator('#preview-language').click(); check(await page.locator('html').getAttribute('lang') === 'en', 'language');
        check((await page.locator('#sample-value').innerText()).includes('0.75 mg/dL'), 'language changes facts');
        await shot(page, 'preview-en-' + width);
        await page.locator('#preview-language').click();
        records.push({ name: 'preview timing ' + width, ms: Date.now() - start, scope: 'local fixture interaction + screenshots' });
      });
      await scenario('official external links ' + width, async () => {
        await page.goto(base + '/hospital-links', { waitUntil: 'networkidle' });
        const links = page.locator('main a[target="_blank"]'); check(await links.count() === 2, 'offer count');
        for (const link of await links.all()) { const url = new URL(await link.getAttribute('href')); check(!url.search && !url.hash, 'personal outbound data'); check((await link.getAttribute('rel')).includes('noreferrer'), 'referrer'); }
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'offers overflow'); await shot(page, 'hospital-links-' + width);
      });
    }
    await scenario('synthetic organization upload review cite revoke', async () => {
      await page.goto(base + '/staff', { waitUntil: 'networkidle' });
      if (!(await page.locator('#modal').isVisible())) await page.locator('#account-open').click();
      await page.getByLabel('Email or username').fill('staff@example.invalid');
      await page.getByLabel('Password', { exact: true }).fill('ui-test-only-password');
      await page.locator('#modal').getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.locator('#modal').waitFor({ state: 'hidden' });
      await page.locator('[data-view=ai]').click();
      await page.locator('.agents-card').waitFor();
      check(await page.getByText('Disabled until configured', { exact: true }).count() === 2, 'new roles inherited a provider');
      await page.getByLabel('Model for the Medical analyzer').selectOption('own');
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        const card=page.locator('.agents-card');
        const name='admin-agents-' + width + '.png';
        await card.screenshot({ path: path.join(out, name) }); screenshots.push(name);
        const clipped=await card.locator('input:visible, select:visible').evaluateAll(elements => elements.map(e => { const r=e.getBoundingClientRect(); return {tag:e.tagName,left:r.left,right:r.right,width:innerWidth}; }).filter(r => r.left < 0 || r.right > r.width));
        check(!clipped.length, 'admin control clipped: '+JSON.stringify(clipped));
      }
      await page.goto(base + '/organization-references', { waitUntil: 'networkidle' });
      await page.locator('#reference-upload').waitFor({ state: 'visible' });
      await page.locator('#reference-upload input[name=title]').fill('เอกสารจำลองการเตรียมตัว');
      await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.md', mimeType: 'text/markdown', buffer: Buffer.from('ข้อมูลจำลอง: เตรียมเลขนัดหมายก่อนมาติดต่อ\n<script>throw Error("injected")</script>') });
      await page.getByRole('button', { name: th('อัปโหลดและดูตัวอย่าง') }).click();
      await page.getByRole('button', { name: th('อนุมัติ') }).waitFor();
      check((await page.locator('#reference-text').innerText()).includes('<script>'), 'preview does not preserve plain text');
      await shot(page, 'organization-draft-1440');
      await page.getByRole('button', { name: th('อนุมัติ') }).click();
      await page.getByRole('button', { name: th('ถอนเอกสาร') }).waitFor();
      await page.locator('input[name=q]').fill('นัดหมาย');
      await page.getByRole('button', { name: th('ค้นหาแหล่งอ้างอิง') }).click();
      await page.locator('#reference-results a').waitFor();
      check((await page.locator('#reference-results').innerText()).includes('line 1'), 'citation line');
      const download = await page.locator('#reference-results a').getAttribute('href');
      check((await page.request.get(base + download)).status() === 200, 'download authorized');
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'organization overflow');
        check(await page.locator('#reference-upload input:not([type=hidden]), #reference-upload button').evaluateAll(elements => elements.every(e => { const r=e.getBoundingClientRect(), f=e.closest('form').getBoundingClientRect(); return r.left >= f.left && r.right <= f.right; })), 'upload controls clipped');
        await shot(page, 'organization-approved-' + width);
      }
      await page.getByRole('button', { name: th('ถอนเอกสาร') }).click();
      await page.getByText(th('รุ่น 1 · ถอนแล้ว')).waitFor();
      check((await page.request.get(base + download)).status() === 404, 'revoked source still available');
      await page.getByRole('button', { name: th('ค้นหาแหล่งอ้างอิง') }).click();
      await page.getByText(th('ไม่พบข้อความในเอกสารที่อนุมัติแล้ว')).waitFor();
      await shot(page, 'organization-revoked-1440');
    });
    check(browserErrors.length === 0, browserErrors.join('\n'));
  } catch (error) { records.push({ name: 'harness', status: 'FAIL', error: error.message }); }
  finally {
    if (browser) await browser.close(); server.kill();
    const report = { mode: 'SOFTWARE_TESTS_WITH_DOUBLES', candidate_sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), working_tree: true, at: new Date().toISOString(), records, screenshots, browserErrors };
    fs.writeFileSync(path.join(out, 'upgrade-browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(records)); process.exitCode = records.some(r => r.status === 'FAIL') ? 1 : 0;
  }
})();
