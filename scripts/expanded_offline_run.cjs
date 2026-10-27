/* OFFLINE ONLY. Preserves the owner UAT source; instruments a copy in memory. */
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),Module=require('module');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'docs/evidence/current/expanded-tests-20261012-01');
fs.mkdirSync(out,{recursive:true});
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'expanded_offline_cases.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root});
const py=path.join(root,'.venv/Scripts/python.exe');
const baseline={run_id:path.basename(out),mode:'OFFLINE_MOCK',started_at:new Date().toISOString(),head:git(['rev-parse','HEAD']).toString().trim(),status:git(['status','--porcelain']).toString(),diff_binary_sha256:sha(git(['diff','--binary'])),node:process.version,platform:process.platform,provider_attempts:0,prior_live_responses_conservative:23,global_attempt_ceiling:3000,live_execution:'BLOCKED_OLD_RUN_UNRECONCILED',sources:{}};
for(const f of ['eval/coursework/dataset.json','eval/coursework/rubric.json','tests/browser/uat.cjs','scripts/expanded_offline_cases.json']) baseline.sources[f]=sha(fs.readFileSync(path.join(root,f)));
fs.writeFileSync(path.join(out,'run.json'),JSON.stringify(baseline,null,2));
const junit=path.join(out,'reliability.xml');
const p=cp.spawnSync(py,['scripts/offline_check.py','pytest','-q',...config.reliability,'--junitxml='+junit],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
fs.writeFileSync(path.join(out,'reliability.log'),(p.stdout||'')+(p.stderr||'')+(p.error?String(p.error):''));
baseline.reliability_exit=p.status;fs.writeFileSync(path.join(out,'run.json'),JSON.stringify(baseline,null,2));
console.log('Reliability exit:',p.status,(p.stdout||'').slice(-700));
process.env.TEST_PYTHON=py;process.env.UI_TEST_PORT='8298';process.env.UAT_OUT=path.join(out,'ui');process.env.UAT_DEBUG='1';
const filename=path.join(root,'tests/browser/uat.cjs');let source=fs.readFileSync(filename,'utf8');
// Capture every scenario even when existing suite only takes a screenshot on selected steps.
const marker='finally { activeCaseId = null; }';
if(!source.includes(marker))throw Error('UAT instrumentation anchor changed');
source=source.replace(marker,`finally { if(browser) { let captureIndex=0; for(const context of browser.contexts()) for(const pg of context.pages()) { try { await shot(pg, 'executed-result-'+(++captureIndex), false); } catch(e) { errors.push('Capture failed '+id+': '+e.message); } } } activeCaseId = null; }`);
source=source.replace('screenshotEvidence.push({ case_id: caseId, file, viewport:', 'screenshotEvidence.push({ case_id: caseId, file, captured_at: new Date().toISOString(), step: name, viewport:');
fs.writeFileSync(path.join(out,'uat-instrumented-source.txt'),source);
baseline.instrumented_source_sha256=sha(Buffer.from(source));fs.writeFileSync(path.join(out,'run.json'),JSON.stringify(baseline,null,2));
const instrumented=new Module(filename,module);instrumented.filename=filename;instrumented.paths=Module._nodeModulePaths(path.dirname(filename));instrumented._compile(source,filename);
