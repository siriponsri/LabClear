#!/usr/bin/env node
/* Live UI evaluation of LabClear: real providers from .env, real browser, one screenshot set per case.

   node scripts/live_ui_eval.cjs                      # pilot: all 74 cases once
   node scripts/live_ui_eval.cjs --repeat 3           # each case three times (new browser session each time)
   node scripts/live_ui_eval.cjs --only Q01 S01 J06   # selected cases
   node scripts/live_ui_eval.cjs --resume <run-dir>   # continue a stopped run (skips finished case/rep pairs)
   Options: --suite all|coursework|extended|images  --port 8190  --pause-ms 3000  --headed  --max-cases N

   The server is scripts/live_ui_server.py: provider keys from .env, storage in a fresh temporary SQLite
   database inside the run folder (never DATABASE_URL). Cases come from eval/coursework/dataset.json
   (unchanged, frozen) plus eval/extended/dataset.json. No rubric or expected value is sent to the app.
   Output: eval_runs/live-ui-<timestamp>/ with run.json, cases.jsonl and screenshots/. Score with
   python scripts/score_live_ui_eval.py <run-dir>. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn, execSync } = require('child_process'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const flag = n => argv.includes('--' + n);
const onlyIdx = argv.indexOf('--only'), only = onlyIdx < 0 ? null : argv.slice(onlyIdx + 1).filter(a => !a.startsWith('--'));
const repeat = Number(opt('repeat', 1)), port = Number(opt('port', 8190)), pauseMs = Number(opt('pause-ms', 3000)), suite = opt('suite', 'all');
const maxCases = Number(opt('max-cases', 0));
const STOP = new Set(['budget_exhausted', 'budget_prior_unknown', 'budget_invalid', 'call_limit', 'cloud_call_limit', 'provider_not_configured', 'provider_network_disabled', 'free_quota_exhausted', 'http_401', 'http_403']);
const RATE = new Set(['upstream_rate_limited', 'rate_limited', 'http_429']);
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const git = c => { try { return execSync('git ' + c, { cwd: root }).toString().trim(); } catch { return null; } };

const frozen = JSON.parse(fs.readFileSync(path.join(root, 'eval/coursework/dataset.json'), 'utf8')).cases;
const extended = JSON.parse(fs.readFileSync(path.join(root, 'eval/extended/dataset.json'), 'utf8')).cases;
let cases = suite === 'coursework' ? frozen : suite === 'extended' ? extended : suite === 'images' ? frozen.filter(c => c.image) : frozen.concat(extended);
if (only) cases = (frozen.concat(extended)).filter(c => only.includes(c.id));
if (maxCases) cases = cases.slice(0, maxCases);
if (!cases.length) { console.error('No cases selected.'); process.exit(2); }

const resume = opt('resume', null);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
const out = resume ? path.resolve(resume) : path.join(root, 'eval_runs', (flag('mock') ? 'mock-ui-' : 'live-ui-') + stamp);
const shots = path.join(out, 'screenshots'); fs.mkdirSync(shots, { recursive: true });
const logFile = path.join(out, 'cases.jsonl');
const done = new Set(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => { const r = JSON.parse(l); return r.id + '#' + r.rep; }) : []);

const py = process.env.TEST_PYTHON || (fs.existsSync(path.join(root, '.venv/Scripts/python.exe')) ? path.join(root, '.venv/Scripts/python.exe') : fs.existsSync(path.join(root, '.venv/bin/python')) ? path.join(root, '.venv/bin/python') : 'python');
const cycle = 'live-ui-' + path.basename(out);
const base = 'http://127.0.0.1:' + port;

async function main() {
  try { const r = await fetch(base + '/health'); if (r.ok) { console.error('Port ' + port + ' already answers. Stop that server or use --port.'); process.exit(2); } } catch { /* free */ }
  let banner = '';
  // --mock: offline provider doubles (scripts/dev_mock_api.py) to check this runner without any provider call.
  const server = flag('mock')
    ? spawn(py, ['scripts/dev_mock_api.py'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(py, ['scripts/live_ui_server.py', String(port), path.join(out, 'server-state'), cycle], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  if (flag('mock')) banner = 'MOCK: scripts/dev_mock_api.py offline doubles, no provider calls';
  const serverLog = fs.createWriteStream(path.join(out, 'server.log'), { flags: 'a' });
  server.stdout.on('data', d => { const s = d.toString(); if (!banner && s.includes('live-ui-server:')) banner = s.trim(); serverLog.write(s); });
  server.stderr.on('data', d => serverLog.write(d));
  const stop = () => { try { server.kill(); } catch { /* gone */ } };
  process.on('SIGINT', () => { stop(); process.exit(130); });
  let health = null;
  for (let i = 0; i < 90 && !health; i++) { await sleep(1000); try { const r = await fetch(base + '/health'); if (r.ok) health = await r.json(); } catch { /* starting */ } if (server.exitCode !== null) break; }
  if (!health) { stop(); console.error('Server did not start; see ' + path.join(out, 'server.log')); process.exit(1); }
  const run = {
    run_id: path.basename(out), mode: flag('mock') ? 'OFFLINE_FIXTURE_UI' : 'LIVE_PROVIDER_LOCAL_UI', started_at: new Date().toISOString(), base, server_banner: banner, health,
    git_head: git('rev-parse HEAD'), git_dirty_files: (git('status --porcelain') || '').split('\n').filter(Boolean), git_diff_sha256: crypto.createHash('sha256').update(git('diff') || '').digest('hex'),
    datasets: { coursework: sha('eval/coursework/dataset.json'), extended: sha('eval/extended/dataset.json') },
    script_sha256: sha('scripts/live_ui_eval.cjs'), repeat, suite, only, case_count: cases.length, budget_cycle: cycle,
    latency_definition: 'Browser time from clicking Send (or the report confirmation button) until the UI finishes the turn (#stop hidden, #send enabled). Server request IDs and receipts are kept per turn.',
    playwright: require(process.env.PLAYWRIGHT_MODULE || 'playwright/package.json').version, node: process.version, platform: process.platform,
  };
  if (!resume || !fs.existsSync(path.join(out, 'run.json'))) fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(run, null, 2));
  console.log(banner); console.log(`Run folder: ${out}\nCases: ${cases.length} x ${repeat}\n`);

  const browser = await chromium.launch({ headless: !flag('headed') });
  let stopReason = null, n = 0;
  try {
    outer: for (let rep = 1; rep <= repeat; rep++) for (const c of cases) {
      if (done.has(c.id + '#' + rep)) continue;
      n++;
      let row = await runCase(browser, c, rep), rateWaits = 0;
      while (row.stop_code && RATE.has(row.stop_code) && rateWaits < 3) { rateWaits++; console.log(`  rate limited, waiting 65 s (${rateWaits}/3)`); await sleep(65000); row = await runCase(browser, c, rep); }
      row.rate_limit_waits = rateWaits;
      fs.appendFileSync(logFile, JSON.stringify(row) + '\n');
      const ms = row.turns.map(t => t.ms).concat(row.confirm ? [row.confirm.ms] : []);
      console.log(`[${n}] ${c.id} r${rep} ${row.ui_state} ${ms.map(x => (x / 1000).toFixed(1) + 's').join(' + ')}${row.stop_code ? ' code=' + row.stop_code : ''}`);
      if (row.stop_code && (STOP.has(row.stop_code) || RATE.has(row.stop_code))) { stopReason = row.stop_code; break outer; }
      await sleep(c.image ? Math.max(pauseMs, 6000) : pauseMs);
    }
  } finally {
    await browser.close(); stop();
    const fin = JSON.parse(fs.readFileSync(path.join(out, 'run.json'), 'utf8'));
    fin.finished_at = new Date().toISOString(); fin.stop_reason = stopReason; fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(fin, null, 2));
  }
  console.log(stopReason ? `\nStopped early: ${stopReason}. Resume later with --resume "${out}"` : '\nFinished.');
  console.log(`Score: ${path.basename(py)} scripts/score_live_ui_eval.py "${out}"`);
}

function parseNdjson(text) {
  const evs = []; for (const line of (text || '').split('\n')) { const s = line.trim(); if (!s) continue; try { evs.push(JSON.parse(s)); } catch { /* partial */ } }
  if (!evs.length) { try { evs.push(JSON.parse(text)); } catch { /* not json */ } }
  return evs;
}

async function runCase(browser, c, rep) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  const page = await ctx.newPage();
  const row = { id: c.id, rep, kind: c.kind, split: c.split, topic: c.topic, started_at: new Date().toISOString(), turns: [], confirm: null, dialogs: [], console_errors: [], screenshots: [], ui_state: 'ok', stop_code: null };
  // Copy of every chat stream body, read in the page from a clone of the fetch response
  // (Playwright cannot always return the body of a streamed response).
  await ctx.addInitScript(() => {
    const real = window.fetch; window.__lcCaptured = [];
    window.fetch = async (...a) => {
      const r = await real(...a);
      try {
        const url = String(a[0] && a[0].url || a[0]), method = String((a[1] && a[1].method) || 'GET').toUpperCase();
        if (method === 'GET' && new URL(url, location.href).pathname === '/api/business/workspace') {
          r.clone().json().then(j => { window.__lcWorkspace = j && j.conversation ? { conversation: j.conversation } : window.__lcWorkspace; }, () => {});
        }
        if (method === 'POST' && /\/api\/business\/chat(\/report(\/confirm)?)?$/.test(new URL(url, location.href).pathname)) {
          const item = { path: new URL(url, location.href).pathname, status: r.status, text: null };
          window.__lcCaptured.push(item);
          r.clone().text().then(t => { item.text = t; }, e => { item.text = ''; item.error = String(e); });
        }
      } catch { /* never break the page */ }
      return r;
    };
  });
  page.on('dialog', async d => { row.dialogs.push(d.message()); await d.dismiss().catch(() => {}); });
  page.on('console', m => { if (m.type() === 'error') row.console_errors.push(m.text().slice(0, 300)); });
  const waitTurn = async (timeout) => {
    await page.waitForFunction(() => { const s = document.getElementById('stop'), b = document.getElementById('send'); return s && s.hidden && b && !b.disabled && !document.body.classList.contains('turn-active'); }, null, { timeout, polling: 250 });
  };
  const collect = async () => {
    await page.waitForFunction(() => (window.__lcCaptured || []).every(x => x.text !== null), null, { timeout: 30000 }).catch(() => {});
    const got = await page.evaluate(() => { const g = window.__lcCaptured.splice(0); return g; });
    return got.map(x => ({ path: x.path, status: x.status, error: x.error, events: parseNdjson(x.text) }));
  };
  const terminalOf = calls => { for (const c2 of calls.slice().reverse()) { const t = (c2.events || []).filter(e => e && (e.type === 'done' || e.type === 'error')).pop(); if (t) return { ...t, http_status: c2.status, path: c2.path }; if (c2.status >= 400 && c2.events?.[0]) return { type: 'error', ...c2.events[0], http_status: c2.status, path: c2.path }; } return null; };
  const codeOf = t => t && t.type === 'error' ? (t.code || t.error || (t.http_status ? 'http_' + t.http_status : 'error')) : null;
  try {
    await page.goto(base + '/app', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => { const b = document.getElementById('send'); return b && !b.disabled; }, null, { timeout: 60000 });
    for (let i = 0; i < c.turns.length; i++) {
      const text = c.turns[i];
      if (c.image && i === 0) {
        await page.click('#attach');
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.click('#add-report')]);
        await chooser.setFiles(path.join(root, c.image));
        await page.locator('#attachments:not([hidden])').waitFor({ timeout: 10000 });
      }
      await page.fill('#message', text);
      const t0 = Date.now(); await page.click('#send');
      await page.waitForFunction(() => !document.getElementById('stop').hidden || document.body.classList.contains('turn-active'), null, { timeout: 10000 }).catch(() => {});
      await waitTurn(c.image ? 200000 : 260000);
      const ms = Date.now() - t0, calls = await collect(), term = terminalOf(calls);
      row.turns.push({ text, ms, terminal: term, calls: calls.map(x => ({ path: x.path, status: x.status, steps: (x.events || []).filter(e => e.type === 'step').map(e => ({ id: e.id, state: e.state, label: e.label, duration_ms: e.duration_ms })) })) });
      const code = codeOf(term); if (code) { row.stop_code = code; row.ui_state = 'error'; break; }
      if (c.image && i === 0) {
        const btn = page.locator('.report-card.draft .rc-actions .btn.primary').last();
        await btn.waitFor({ timeout: 20000 });
        await shot(page, row, 'review');
        const t1 = Date.now(); await btn.click();
        await page.waitForFunction(() => document.body.classList.contains('turn-active'), null, { timeout: 10000 }).catch(() => {});
        await waitTurn(260000);
        const ms2 = Date.now() - t1, calls2 = await collect(), term2 = terminalOf(calls2);
        row.confirm = { ms: ms2, terminal: term2, calls: calls2.map(x => ({ path: x.path, status: x.status, steps: (x.events || []).filter(e => e.type === 'step').map(e => ({ id: e.id, state: e.state, label: e.label, duration_ms: e.duration_ms })) })) };
        const code2 = codeOf(term2); if (code2) { row.stop_code = code2; row.ui_state = 'error'; }
      }
      if (i < c.turns.length - 1) await sleep(1500);
    }
    row.ui_text = (await page.locator('#messages').innerText().catch(() => '')).slice(-12000);
    await sleep(500);
    const ws = await page.evaluate(() => window.__lcWorkspace || null).catch(() => null);
    row.messages = ws && ws.conversation ? (ws.conversation.messages || []).map(m => ({ role: m.role, kind: m.kind, state: m.state, content: m.content, fields: m.fields, warnings: m.warnings, critical_note: m.critical_note, failed: m.failed, sources: (m.sources || []).map(x => x.id || x.title) })) : null;
  } catch (e) { row.ui_state = 'runner_error'; row.runner_error = String(e).slice(0, 500); }
  await shot(page, row, 'view');
  // Whole conversation: grow the viewport to the height of the message list, then capture it.
  try {
    const extra = await page.evaluate(() => { const m = document.getElementById('messages'); return m ? m.scrollHeight - m.clientHeight : 0; });
    if (extra > 0) { await page.setViewportSize({ width: 1280, height: Math.min(900 + extra + 40, 16000) }); await sleep(400); }
    await page.evaluate(() => { const m = document.getElementById('messages'); if (m) m.scrollTop = 0; });
  } catch { /* keep the normal view */ }
  await shot(page, row, 'full', true);
  await ctx.close();
  return row;
}

async function shot(page, row, tag, full = false) {
  const name = `${row.id}-r${row.rep}-${tag}.png`, file = path.join(shots, name);
  try { await page.screenshot({ path: file, fullPage: full }); row.screenshots.push({ file: 'screenshots/' + name, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }); } catch (e) { row.screenshots.push({ file: null, error: String(e).slice(0, 200) }); }
}

main().catch(e => { console.error(e); process.exit(1); });
