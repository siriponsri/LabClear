/* Harness-only adaptation of existing live UI runner, no whole-case retries.
   Original source remains untouched. Existing DB/cycle/money limits preserved. */
const fs=require('fs'),path=require('path'),Module=require('module');const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.EXPANDED_RUN_DIR||'docs/evidence/current/expanded-live-20261012-01');
const originalPath=path.join(root,'scripts/live_ui_eval.cjs');let source=fs.readFileSync(originalPath,'utf8');
const replace=(a,b)=>{if(!source.includes(a))throw Error('Harness anchor changed: '+a.slice(0,70));source=source.replace(a,b);};
replace("const extended = JSON.parse(fs.readFileSync(path.join(root, 'eval/extended/dataset.json'), 'utf8')).cases;",`const extended = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(out,'run-inputs.json'))}, 'utf8')).cases;`);
replace("frozen.concat(extended);","extended;");
replace("const out = resume ? path.resolve(resume) : path.join(root, 'eval_runs', (flag('mock') ? 'mock-ui-' : 'live-ui-') + stamp);",`const out = ${JSON.stringify(out)};`);
replace("['scripts/live_ui_server.py', String(port), path.join(out, 'server-state'), cycle]","['-B', 'scripts/expanded_live_server.py', out, String(port)]");
replace("rateWaits < 3","rateWaits < 0");
replace("'http_401', 'http_403'","'http_401', 'http_403', 'expanded_attempt_limit', 'accounting_unknown', 'cycle_required'");
replace("chooser.setFiles(path.join(root, c.image))","chooser.setFiles(path.isAbsolute(c.image) ? c.image : path.join(root, c.image))");
// Capture output language/tone via the normal request payload, preserving server-owned selection.
replace("await page.fill('#message', text);","if (c.tone) await page.evaluate(tone => { const previous=window.fetch; window.fetch=(url,options)=>{ if(options?.body && typeof options.body==='string' && String(url).includes('/api/business/chat')) { try { const body=JSON.parse(options.body); body.tone=tone.toLowerCase(); options={...options,body:JSON.stringify(body)}; } catch {} } return previous(url,options); }; },c.tone); await page.fill('#message', text);");
replace("row.screenshots.push({ file: 'screenshots/' + name, sha256:","row.screenshots.push({ file: 'screenshots/' + name, case_id: row.id, step: tag, viewport: page.viewportSize(), captured_at: new Date().toISOString(), run_id: path.basename(out), privacy_masked_input: true, sha256:");
replace("budget_cycle: cycle,","budget_cycle: 'live-ui-live-ui-20261012T102549', owner_global_attempt_ceiling: 4000, whole_case_retries: 0, accounting_preflight: JSON.parse(fs.readFileSync(path.join(out,'accounting-preflight.json'),'utf8')),");
replace("script_sha256: sha('scripts/live_ui_eval.cjs'),", "script_sha256: sha('scripts/live_ui_eval.cjs'), candidate_sources: Object.fromEntries(['services/lab_units.py','services/ocr_tables_html.py','services/lab_fields_v2.py','services/report_binding.py','scripts/expanded_live_server.py','scripts/expanded_attempt_gate.py'].map(f=>[f,sha(f)])),");
replace("extended: sha('eval/extended/dataset.json')",`extended: sha(${JSON.stringify(path.relative(root,path.join(out,'run-inputs.json')).replaceAll('\\','/'))})`);
replace("const row = { id: c.id, rep,", "const row = { id: c.id, source_sample_index: c.source_sample_index, tone: c.tone || 'normal', isolation_action: c.isolation_action || null, rep,");
replace("const page = await ctx.newPage();", "await ctx.addCookies([{name:'labclear_language',value:'en',url:base}]); const page = await ctx.newPage();");
replace("const browser = await chromium.launch({ headless: !flag('headed') });", "console.log('HARNESS_STAGE browser_launch'); const browser = await chromium.launch({ headless: !flag('headed'), timeout: 20000, args: ['--no-sandbox'] }); console.log('HARNESS_STAGE browser_ready');");
replace("async function runCase(browser, c, rep) {", "async function runCase(browser, c, rep) { console.log('HARNESS_STAGE case_start '+c.id);");
replace("const code = codeOf(term); if (code)", "if(c.image && term?.result?.report_id) { row.unit_fidelity_debug = await page.evaluate(async id => { const response=await fetch('/api/business/reports/'+encodeURIComponent(id)); if(!response.ok)return {status:response.status}; const report=await response.json(); return report.data?.unit_fidelity || null; },term.result.report_id).catch(()=>null); } const code = codeOf(term); if (code)");
if(process.env.EXPANDED_READ_ONLY_IMAGE==='1') {
 replace("if (c.image && i === 0) {\n        const btn =", "if (c.image && i === 0 && false) {\n        const btn =");
 replace("const code = codeOf(term); if (code)", "await shot(page,row,'turn-'+(i+1)+'-outcome'); const code = codeOf(term); if (code)");
}
replace("await page.goto(base + '/app', { waitUntil: 'networkidle', timeout: 60000 });", "console.log('HARNESS_STAGE app_navigation '+c.id); await page.goto(base + '/app', { waitUntil: 'domcontentloaded', timeout: 30000 }); console.log('HARNESS_STAGE app_loaded '+c.id);");
replace("for (let i = 0; i < c.turns.length; i++) {", `if(c.isolation_action && ['switch chat','switch project','logout/login'].includes(c.isolation_action)) { await page.locator('#account-open').click(); await page.getByLabel('Email or username').fill(c.id.toLowerCase()+'-'+Date.now()+'@example.invalid'); await page.getByLabel('Password',{exact:true}).fill('expanded-synthetic-only-password'); await page.getByRole('button',{name:'Create account',exact:true}).click(); await page.locator('#modal').waitFor({state:'hidden'}); }
    for (let i = 0; i < c.turns.length; i++) {
      if(i===2 && c.isolation_action) {
        await shot(page,row,'before-context-action');
        if(['switch chat','new guest chat','reset context'].includes(c.isolation_action)) await page.locator('#new-chat').click();
        else if(c.isolation_action==='switch project') { await page.getByRole('button',{name:'New project',exact:true}).click(); await page.getByLabel('Project name').fill('Synthetic isolated project'); await page.getByRole('button',{name:'Create project',exact:true}).click(); await page.getByRole('button',{name:'New chat in Synthetic isolated project',exact:true}).click(); }
        else if(['new session','logout/login'].includes(c.isolation_action)) { await ctx.clearCookies(); await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();}); await page.reload({waitUntil:'networkidle'}); }
        else if(c.isolation_action==='guest reload') await page.reload({waitUntil:'networkidle'});
        row.isolation_action_executed=true; await shot(page,row,'after-context-action');
      }`);
replace("await page.fill('#message', text);", "await page.fill('#message', text);");
// Mask identifying-looking header/footer regions in actual browser screenshots only.
replace("try { await page.screenshot({ path: file, fullPage: full });",`try { await page.evaluate(index => { document.querySelectorAll('[data-test-privacy-mask]').forEach(e=>e.remove()); if(index===undefined)return; const upper=index<2?[.12,.235]:index<4?[.025,.10]:[.02,.145], lower=index<2?[.77,.85]:index<4?[.79,.855]:[.86,.965]; for(const img of document.querySelectorAll('#messages img, #attachments img')) { const r=img.getBoundingClientRect(); if(r.width<50)continue; for(const [a,b] of [upper,lower,[.97,1]]) { const mask=document.createElement('div'); mask.dataset.testPrivacyMask='true'; mask.style.cssText='position:absolute;z-index:99999;pointer-events:none;background:white;left:'+(r.left+scrollX)+'px;top:'+(r.top+scrollY+r.height*a)+'px;width:'+r.width+'px;height:'+(r.height*(b-a))+'px';document.body.append(mask); } } },row.source_sample_index); await page.screenshot({ path: file, fullPage: full });`);
// Retain raw public terminal/receipt data. No scorer/gold is injected into the app.
fs.writeFileSync(path.join(out,'runner-instrumented-source.txt'),source);
new (require('vm').Script)(source,{filename:originalPath});
if(process.argv.includes('--dry-run')) { console.log('Instrumented harness syntax and anchors verified; no server/provider launched.'); return; }
process.argv=[process.argv[0],originalPath,'--port','8290','--pause-ms','200','--max-cases',process.env.EXPANDED_MAX_CASES||'148'];
process.env.TEST_PYTHON=path.join(root,'.venv/Scripts/python.exe');
const m=new Module(originalPath,module);m.filename=originalPath;m.paths=Module._nodeModulePaths(path.dirname(originalPath));m._compile(source,originalPath);
