/* Chat recovery in a real browser (supplementary to scripts/benchmark_resilience.py).
   MOCKED_TEST_ONLY: the browser fixture (tests/browser/fixture_server.py) behind
   scripts/offline_check.py, and Playwright route interception that replaces the chat endpoint's reply
   with a gateway page, a cut stream, an invalid line, a network reset or LabClear's own 503.
   Checks what a customer sees: the spinner ends, a plain message (Thai by default, never the proxy's
   HTML), interrupted steps and the request reference, and the message back in the composer.
   Usage: TEST_PYTHON=/path/to/python node tests/browser/resilience.cjs   (UAT_OUT: output folder) */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, process.env.UAT_OUT || 'test-results/resilience-ui'); fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'labclear-resilience-ui-'));
const port = Number(process.env.UI_TEST_PORT || 8097), base = 'http://127.0.0.1:' + port;
const py = process.env.TEST_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const server = spawn(py, ['scripts/offline_check.py', 'browser', String(port)], { cwd: root, env: { ...process.env, UI_TEST_PORT: String(port), BUSINESS_DB_PATH: path.join(tmp, 'db.sqlite'), BUSINESS_KEY_PATH: path.join(tmp, 'key') }, stdio: ['ignore', 'ignore', 'pipe'] });
let log = ''; server.stderr.on('data', x => { log += x; });
const wait = ms => new Promise(r => setTimeout(r, ms));
const records = [], shots = [], pageErrors = [];
const strip = s => (s || '').replace(/[⁠​]/g, '');
const assert = (c, m) => { if (!c) throw Error(m); };
async function check(id, name, fn) { const start = Date.now(); try { await fn(); records.push({ id, name, status: 'PASS', ms: Date.now() - start }); } catch (e) { records.push({ id, name, status: 'FAIL', error: e.message.split('\n')[0] }); } }
const line = e => JSON.stringify(e) + '\n';
const TH = {
  gateway: 'ตอนนี้ยังเชื่อมต่อ LabClear ไม่ได้', unexpected: 'LabClear ส่งหน้าที่ไม่ใช่คำตอบกลับมา', eof: 'การตอบกลับหยุดลงก่อนเสร็จ', malformed: 'อ่านข้อมูลที่ตอบกลับมาไม่ได้',
  network: 'การเชื่อมต่อขาดก่อนที่คำตอบจะเสร็จ', busy: 'ขณะนี้ LabClear กำลังประมวลผลคำขออื่นอยู่', notAnswered: 'ยังไม่ได้รับคำตอบ', interrupted: 'ถูกขัดจังหวะ', reference: 'รหัสอ้างอิงคำขอ', unavailable: 'ใช้งานไม่ได้ชั่วคราว',
};
const CASES = [
  ['UI-R03-502', 'Proxy HTML 502', r => r.fulfill({ status: 502, contentType: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1>render-proxy</body></html>' }), TH.gateway, { restored: true }],
  ['UI-R03-504', 'Proxy HTML 504', r => r.fulfill({ status: 504, contentType: 'text/html', body: '<html><body><h1>504 Gateway Time-out</h1>render-proxy</body></html>' }), TH.gateway, { restored: true }],
  ['UI-R11-200', '200 HTML page instead of JSON', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Service waking up render-proxy</body></html>' }), TH.unexpected, { restored: true }],
  ['UI-R04-eof', 'Stream cut before its terminal event', r => r.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: { 'x-request-id': 'req_uicut0000000001' },
    body: line({ type: 'accepted', request_id: 'req_uicut0000000001', deadline_ms: 220000, heartbeat_ms: 10000 }) + line({ type: 'step', id: 'plan', state: 'running', label: 'Understanding your request' }) }), TH.eof, { restored: true, interrupted: true, reference: 'req_uicut0000000001' }],
  ['UI-R04-invalid', 'Invalid NDJSON line', r => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: line({ type: 'accepted', request_id: 'req_uibad0000000001' }) + '<html>render-proxy</html>\n' }), TH.malformed, { restored: true }],
  ['UI-R03-reset', 'Network reset', r => r.abort('connectionreset'), TH.network, { restored: true }],
  ['UI-R06-busy', 'LabClear 503 server_busy', r => r.fulfill({ status: 503, contentType: 'application/json', headers: { 'retry-after': '5', 'x-request-id': 'req_uibusy00000001' },
    body: JSON.stringify({ code: 'server_busy', message: 'LabClear is busy with other requests. Try again in a few seconds.', origin: 'app', request_id: 'req_uibusy00000001' }) }), TH.busy, { restored: true }],
  ['UI-R02-upstream', 'Terminal error event with interrupted step', r => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body:
    line({ type: 'accepted', request_id: 'req_uiup000000001' }) + line({ type: 'step', id: 'safety_in', state: 'running', label: 'Checking your message for safety' }) +
    line({ type: 'step', id: 'safety_in', state: 'unavailable', label: 'Checking your message for safety', detail: 'upstream_unavailable', duration_ms: 1840 }) +
    line({ type: 'error', code: 'upstream_unavailable', message: 'The safety check is temporarily unavailable (HTTP 503: server error). Please try again shortly.', status: 502, origin: 'upstream', request_id: 'req_uiup000000001', step: 'safety_in' }) }),
    'ใช้งานไม่ได้ชั่วคราว', { restored: true, stepState: TH.unavailable, reference: 'req_uiup000000001' }],
];
(async () => {
  let browser;
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { } await wait(250); if (i === 79) throw Error('Fixture unavailable: ' + log.slice(-1200)); }
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', e => pageErrors.push(e.message));
      await page.goto(base + '/app', { waitUntil: 'networkidle' });
      for (const [id, name, reply, message, expect] of CASES) {
        if (width === 390 && !['UI-R03-502', 'UI-R04-eof'].includes(id)) continue;
        await check(id + '-' + width, name + ' at ' + width + ' px', async () => {
          const text = 'Resilience check ' + id;
          await page.route('**/api/business/chat', reply);
          await page.locator('#message').fill(text);
          await page.locator('#send').click();
          await page.locator('#notice:not([hidden])').waitFor({ timeout: 10000 });
          await page.waitForFunction(() => !document.getElementById('send').disabled && document.getElementById('stop').hidden, null, { timeout: 10000 });
          const notice = strip(await page.locator('#notice').innerText());
          assert(notice.includes(message), 'message shown: ' + notice);
          const body = await page.locator('body').innerText();
          assert(!body.includes('render-proxy') && !/<html|<body/i.test(body), 'proxy HTML never rendered');
          if (expect.restored) await page.waitForFunction(t => document.getElementById('message').value === t, text, { timeout: 5000 }).catch(() => { throw Error('message back in the composer'); });
          const live = page.locator('.turn.thinking.ended').last();
          await live.waitFor({ timeout: 5000 });
          assert(strip(await live.locator('.role').innerText()).includes(TH.notAnswered), 'turn marked not answered');
          if (expect.interrupted) assert(strip(await live.innerText()).includes(TH.interrupted), 'running step marked interrupted');
          if (expect.stepState) assert(strip(await live.innerText()).includes(expect.stepState), 'step state shown');
          if (expect.reference) assert(strip(await live.innerText()).includes(TH.reference) && (await live.innerText()).includes(expect.reference), 'request reference shown');
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
          if (['UI-R04-eof', 'UI-R02-upstream'].includes(id) || (id === 'UI-R03-502')) { const file = `${id}-${width}.png`; await page.screenshot({ path: path.join(out, file) }); shots.push(file); }
          await page.unroute('**/api/business/chat');
          await page.locator('#message').fill('');
        });
      }
      await context.close();
    }
  } catch (e) { records.push({ id: 'SETUP', status: 'FAIL', error: e.message }); }
  finally {
    if (browser) await browser.close();
    server.kill();
    const summary = { suite: 'chat recovery (browser)', passed: records.filter(r => r.status === 'PASS').length, total: records.length, page_errors: pageErrors, records, screenshots: shots,
      scope: 'MOCKED_TEST_ONLY: route interception on the browser fixture; no provider calls. UI evidence only.' };
    fs.writeFileSync(path.join(out, 'resilience-ui.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ passed: summary.passed, total: summary.total, failures: records.filter(r => r.status !== 'PASS'), page_errors: pageErrors }, null, 2));
    process.exit(summary.passed === summary.total && !pageErrors.length ? 0 : 1);
  }
})();
