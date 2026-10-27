/* Provider-free completion watcher. Never launches/retries the live runner. */
const fs=require('fs'),path=require('path'),cp=require('child_process');const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs/evidence/current/expanded-live-20261012-01');
const py=path.join(root,'.venv/Scripts/python.exe');const start=Date.now();const log=path.join(dir,'finalization.log');
const note=s=>fs.appendFileSync(log,new Date().toISOString()+' '+s+'\n');
function execute(exe,args){const result=cp.spawnSync(exe,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});note('COMMAND '+args.join(' ')+' EXIT '+result.status+'\n'+(result.stdout||'')+(result.stderr||'')+(result.error?String(result.error):''));if(result.status!==0)throw Error('Finalization command failed: '+args[0]);}
async function main(){note('Watching run completion; zero provider calls; no live process interaction.');for(;;){const file=path.join(dir,'run.json');let run={};try{run=JSON.parse(fs.readFileSync(file))}catch{}if(run.finished_at){break;}if(Date.now()-start>2*3600*1000){note('BLOCKED: no completion marker after two hours; runner not stopped or restarted.');return;}await new Promise(resolve=>setTimeout(resolve,15000));}
execute(py,['-B','scripts/expanded_score.py']);execute(process.execPath,['scripts/expanded_evidence_audit.cjs']);execute(process.execPath,['scripts/expanded_live_appendix.cjs']);
execute(py,['-B','scripts/expanded_render_qa.py','docs/report/LabClear_Expanded_Testing_Report_TH.pdf','docs/evidence/current/expanded-live-20261012-01/report-render-qa']);
execute(py,['-B','scripts/expanded_render_qa.py','docs/report/LabClear_Expanded_Test_Appendix_TH.pdf','docs/evidence/current/expanded-live-20261012-01/appendix-render-qa']);
note('Rendered final execution snapshot. Human semantic review and visual inspection remain pending; not clinical validation.');}
main().catch(e=>{note(String(e));process.exitCode=1});
