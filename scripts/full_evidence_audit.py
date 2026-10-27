"""Read-only checks on evidence, then owner-authorized manifests/screenshot bundle."""
import json,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'docs/evidence/current';OUT=BASE/'full-course-report-20261012';records=[];errors=[];case_checks=[]
folders=['expanded-live-20261012-01','unit-fidelity-retest-20261012-02','unit-fidelity-retest-20261012-03','unit-fidelity-retest-20261012-04','unit-fidelity-source-probe-20261012-01','unit-literal-retest-20261012-01','independent-text-20261012-01','remaining-image-stage-20261012-01','remaining-image-stage-20261012-02']
for folder in folders:
 directory=BASE/folder
 for r in map(json.loads,(directory/'cases.jsonl').read_text(encoding='utf8').splitlines()):
  steps={s.get('step') for s in r.get('screenshots',[]) if s.get('file')};issues=[]
  for required in ['view','full']:
   if required not in steps:issues.append('missing '+required)
  if r.get('confirm') and 'review' not in steps:issues.append('missing before-confirm review')
  if r.get('isolation_action_executed') and not {'before-context-action','after-context-action'}.issubset(steps):issues.append('missing context-action views')
  terminal_receipts=sum(bool(t.get('terminal',{}).get('receipt')) for t in r.get('turns',[]))
  case_checks.append({'run':folder,'case_id':r['id'],'turns':len(r['turns']),'terminal_receipts':terminal_receipts,'actual_outcome':r.get('stop_code') or r['ui_state'],'screenshots':len(steps),'required_capture_issues':issues,'context_action_executed':bool(r.get('isolation_action_executed'))})
  errors.extend(folder+'/'+r['id']+': '+x for x in issues)
  for s in r.get('screenshots',[]):
   if not s.get('file'):errors.append(folder+'/'+r['id']+': capture error');continue
   records.append({**s,'file':str((directory/s['file']).relative_to(ROOT)),'case_id':r['id'],'run':folder,'mode':'LIVE_PROVIDER_LOCAL_UI','status':r.get('stop_code') or r['ui_state'],'input_version':'frozen1.0.0 / expanded1.0.0 / image-stage1.1 as run-inputs','head':'d4ec212','dirty':True})
offline=BASE/'expanded-tests-20261012-01';manifest=json.loads((offline/'screenshots-manifest.json').read_text())
for s in manifest['captures']:records.append({**s,'file':str((offline/s['file']).relative_to(ROOT)),'run':offline.name,'mode':'OFFLINE_MOCK','input_version':'see run.json','head':'d4ec212','dirty':True})
for m in sorted((BASE/'expanded-live-20261012-01').glob('*-captures/manifest.json')):
 if 'parser-invalid' in str(m):continue
 for s in json.loads(m.read_text())['records']:records.append({**s,'run':m.parent.name,'input_version':'source XML named in record','head':'d4ec212','dirty':True})
records+=json.loads((OUT/'focused-result-captures.json').read_text())
unique={s['file']:s for s in records};records=list(unique.values())
for s in records:
 f=ROOT/s['file']
 if not f.exists() or hashlib.sha256(f.read_bytes()).hexdigest()!=s['sha256']:errors.append('missing/hash mismatch '+s['file'])
freeze=json.loads((ROOT/'eval/coursework/MANIFEST.json').read_text())
for f,digest in freeze['files'].items():
 if hashlib.sha256((ROOT/f).read_bytes()).hexdigest()!=digest:errors.append('frozen input changed '+f)
audit={'screenshots':len(records),'executions_with_case_logs':len(case_checks),'frozen_files_checked':len(freeze['files']),'capture_integrity_errors':errors,'case_checks':case_checks,'semantic_coverage_gaps':['Original context8run had no isolation_action: not isolation validation','19image-stage cases have no final explanation/confirmation by design','30GROUND/TONEcases NOT_RUN','One interrupted image-stage01reserved admission lacks final outcome and remains charged'],'invalid_historical_render_excluded':'unit-repair-initial-captures-parser-invalid retained as history, corrected captures included','assessment':'PASS_CAPTURE_INTEGRITY' if not errors else 'FAIL_CAPTURE_INTEGRITY'}
(OUT/'all-screenshots-manifest.json').write_text(json.dumps({'captures':records},ensure_ascii=False,indent=2),encoding='utf8');(OUT/'evidence-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
assert not errors,errors
with zipfile.ZipFile(ROOT/'docs/report/LabClear_All_Screenshots_20261012.zip','w',zipfile.ZIP_DEFLATED) as z:
 for s in records:z.write(ROOT/s['file'],s['file'])
 z.write(OUT/'all-screenshots-manifest.json','SCREENSHOTS_MANIFEST.json');z.write(OUT/'evidence-audit.json','EVIDENCE_AUDIT.json')
 z.writestr('README.md','All captured evidence with source timestamps,hashes,modes and outcomes. Live UI,mocked UI,offline pytestresultviews,and saved focusedproviderresults are distinct. No fabricated screenshots for NOT_RUNsteps. Repeated/derived inputs are not independent samples. One interrupted admission remains charged. Original outcomes are preserved. The readable appendix crops empty UIsidebar; this ZIPcontainsfulloriginalcaptures.\n')
print(json.dumps({'screenshots':len(records),'case_executions':len(case_checks),'capture_errors':len(errors)}))
