/* No credentials and no provider calls. Audit evidence completeness and source hashes. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');const root=path.resolve(__dirname,'..');const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const freeze=JSON.parse(fs.readFileSync(path.join(root,'eval/coursework/MANIFEST.json')));const errors=[];
for(const [f,expected] of Object.entries(freeze.files))if(sha(path.join(root,f))!==expected)errors.push('Frozen source changed: '+f);
const offline=path.join(root,'docs/evidence/current/expanded-tests-20261012-01');const live=path.join(root,'docs/evidence/current/expanded-live-20261012-01');
const om=JSON.parse(fs.readFileSync(path.join(offline,'screenshots-manifest.json'))),seen=new Set();
for(const s of om.captures){const p=path.join(offline,s.file);if(!fs.existsSync(p)||sha(p)!==s.sha256)errors.push('Offline capture hash: '+s.file);seen.add(s.case_id);if(!s.captured_at||!s.viewport||!s.step)errors.push('Capture metadata missing: '+s.file);}
const expectedOffline=JSON.parse(fs.readFileSync(path.join(offline,'ui/browser-uat.json'))).records.map(r=>r.id);for(const id of expectedOffline)if(!seen.has(id))errors.push('UI case lacks capture: '+id);
const rows=fs.existsSync(path.join(live,'cases.jsonl'))?fs.readFileSync(path.join(live,'cases.jsonl'),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse):[];
let liveShots=0;for(const r of rows){if(!(r.screenshots||[]).some(s=>s.file))errors.push('Live case lacks capture: '+r.id);for(const s of r.screenshots||[]){if(!s.file){errors.push('Live screenshot error: '+r.id);continue;}const p=path.join(live,s.file);if(!fs.existsSync(p)||sha(p)!==s.sha256)errors.push('Live capture hash: '+s.file);liveShots++;}}
const result={checked_at:new Date().toISOString(),frozen_file_count:Object.keys(freeze.files).length,offline_captures:om.captures.length,offline_unique_capture_case_ids:seen.size,live_executed:rows.length,live_captures:liveShots,errors,assessment:errors.length?'FAIL':'PASS'};
fs.writeFileSync(path.join(live,'evidence-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
