"""Refresh archives and provenance after local audit revisions; no provider imports."""
import json,zipfile,hashlib,sys,re
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];EV=ROOT/'docs/evidence/current/full-course-report-20261012';audit=ROOT/'docs/evidence/current/delivery-audit-repairs-20261012'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
source=ROOT/'docs/report/LabClear_Source_Code_20261012.zip'
with zipfile.ZipFile(source) as z:content={n:z.read(n) for n in z.namelist()}
metadata={'SOURCE_SNAPSHOT_MANIFEST.json','SOURCE_SNAPSHOT_README.md','PACKAGE_COMPLETENESS_MANIFEST.json','PACKAGED_STARTUP.md'}
# Refresh code that already belonged to the source bundle and include safe local audit helpers.
for n in list(content):
 p=ROOT/n
 if n not in metadata and p.is_file() and p.suffix.lower() in ['.py','.cjs','.js','.mjs','.ps1','.bat','.html','.css','.json','.md','.txt','.yaml','.toml'] and n!='.env.example':content[n]=p.read_bytes()
for p in list((ROOT/'scripts').glob('delivery_*'))+[ROOT/'scripts/record_academic_demo.cjs',ROOT/'scripts/verify_local_webm.cjs',ROOT/'NOTICE.md']+list((ROOT/'docs/deploy').glob('*.md')):
 if p.is_file():content[p.relative_to(ROOT).as_posix()]=p.read_bytes()
content['.env.example']=content['.env.example'].replace(b'DEMO_ACCOUNTS=\r\n',b'DEMO_ACCOUNTS=false\r\n').replace(b'DEMO_ACCOUNTS=\n',b'DEMO_ACCOUNTS=false\n')
extra=b'\nThe six original synthetic lab PNG fixtures are distributed separately. Image benchmark/sample-demo paths need those authorized fixtures at the documented examples path. Their absence is not hidden as full image reproducibility. No real patient images should be added.\n'
if extra not in content['PACKAGED_STARTUP.md']:content['PACKAGED_STARTUP.md']+=extra
content['SOURCE_SNAPSHOT_README.md']=('''# Source snapshot after delivery audit\n\nHEAD d4ec212 with dirty worktree. This is an uncommitted local snapshot, not a release or pushed commit. Required runtime instruction modules and bundled fonts are present. See PACKAGED_STARTUP.md for offline-first startup and separately supplied synthetic image fixtures. The source archive does not contain installed dependencies, keys, a filled .env, databases, account state or original six health PNGs.\n''').encode()
files=[{'path':n,'sha256':sha(b),'bytes':len(b)} for n,b in sorted(content.items()) if n not in metadata]
content['SOURCE_SNAPSHOT_MANIFEST.json']=json.dumps(files,ensure_ascii=False,indent=2).encode()
content['PACKAGE_COMPLETENESS_MANIFEST.json']=json.dumps({'file_manifest':'SOURCE_SNAPSHOT_MANIFEST.json','source_files':len(files),'runtime_modules_present':True,'font_dependencies_present':True,'startup_check':'OFFLINE_REAL_HTTP_AGENT_DOUBLE; see external audit evidence','not_included':['dependencies','filled .env','DB','keys','original six source health images']},ensure_ascii=False,indent=2).encode()
tmp=source.with_suffix('.final.zip')
with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in content.items():z.writestr(n,b)
tmp.replace(source)
with zipfile.ZipFile(source) as z:
 bad=[r['path'] for r in json.loads(z.read('SOURCE_SNAPSHOT_MANIFEST.json')) if sha(z.read(r['path']))!=r['sha256']]
 assert not bad
tested=ROOT/'docs/evidence/current/context-isolation-offline-20261012-01/archive-checkout'
runtime=[n for n in content if n.startswith(('routers/','services/','business_data/','knowledge/','runtime_skills/','static/','templates/')) or n in ['main.py','config.py']]
different=[n for n in runtime if not (tested/n).is_file() or sha((tested/n).read_bytes())!=sha(content[n])]
assert not different,different
source_meta=read(EV/'source-bundle-manifest.json');source_meta.update(files=len(files),archive_entries=len(content),sha256=sha(source.read_bytes()),runtime_modules_and_fonts_included=True,structural_and_bounded_offline_startup_verified=True,original_six_image_fixtures_separate=True,tested_runtime_files_identical=len(runtime),runtime_differences=different);write(EV/'source-bundle-manifest.json',source_meta)

# Original1792 image bytes remain byte-identical; add8 clearly labelled HTTP result views.
screens=ROOT/'docs/report/LabClear_All_Screenshots_20261012.zip'
if not (audit/(screens.name+'.before')).exists():(audit/(screens.name+'.before')).write_bytes(screens.read_bytes())
shots=read(ROOT/'docs/evidence/current/context-isolation-offline-20261012-01/screenshots-manifest.json')
with zipfile.ZipFile(screens) as z:screencontent={n:z.read(n) for n in z.namelist()}
prior_png={n:sha(b) for n,b in screencontent.items() if n.lower().endswith('.png') and not n.startswith('context-isolation-offline-20261012-01/')}
for s in shots:screencontent['context-isolation-offline-20261012-01/'+s['file']]=(ROOT/s['source']).read_bytes()
screencontent['OFFLINE_CONTEXT_SCREENSHOTS_MANIFEST.json']=json.dumps(shots,ensure_ascii=False,indent=2).encode()
master=read(EV/'all-screenshots-manifest.json')
master['captures']=[r for r in master['captures'] if r.get('mode')!='OFFLINE_HTTP_RESULT_VIEW']
master['captures'] += [{**s,'file':s['source'],'run':'context-isolation-offline-20261012-01','step':'http-result-view'} for s in shots]
master['total']=1800;master['original_verified_captures']=1792;master['new_offline_http_result_views']=8
write(EV/'all-screenshots-manifest.json',master)
screencontent['ALL_SCREENSHOTS_CURRENT_MANIFEST.json']=json.dumps(master,ensure_ascii=False,indent=2).encode()
auditv=read(EV/'evidence-audit.json');auditv['screenshots']=1800;auditv['original_130_case_logs_preserved']=True;auditv['offline_http_cases_added']=8;auditv['offline_http_captures_mode']='OFFLINE_HTTP_RESULT_VIEW';write(EV/'evidence-audit.json',auditv)
screencontent['SCREENSHOT_AUDIT_REVISION.json']=json.dumps({'original_verified_pngs':1792,'original_png_bytes_unchanged':True,'new_offline_http_result_views':8,'total_pngs':1800,'not_independent_model_samples':True,'video_QA_frames_not_in_test_count':True},indent=2).encode()
tmp=screens.with_suffix('.final.zip')
with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in screencontent.items():z.writestr(n,b)
tmp.replace(screens)
with zipfile.ZipFile(screens) as z:
 assert all(sha(z.read(n))==h for n,h in prior_png.items())
 assert sum(n.lower().endswith('.png') for n in z.namelist())==1800
write(audit/'final-archive-checks.json',{'source_files':len(files),'source_archive_entries':len(content),'source_hash_errors':bad,'source_sha256':sha(source.read_bytes()),'original_screenshot_pngs':len(prior_png),'all_original_hashes_unchanged':True,'new_offline_http_result_views':8,'total_pngs':1800,'screenshots_sha256':sha(screens.read_bytes()),'provider_calls':0})
for p in [EV/'CORE_DELIVERY_READY.json',ROOT/'docs/evidence/current/DELIVERY_CLOSEOUT_20261012.json']:
 v=read(p);v.update(status='REVISED_DELIVERABLES_READY_WITH_DISCLOSED_COURSEWORK_GAPS',required_clip_status='DELIVERED_LIMITED_OFFLINE_UI_WITH_THAI_CAPTIONS',clip_seconds=173.28,clip_file='docs/presentation/LabClear_Academic_Demo_TH.webm',coursework_delivery_complete=False,semantic_review={'PASS':9,'PARTIAL':20,'FAIL':22,'ERROR':11,'remaining_REVIEW_PENDING':0},context_boundaries_offline={'PASS':8,'live_model_validation':False},provider_attempts_preserved=722,new_provider_calls=0,screenshots_total=1800,original_screenshots=1792,new_overnight_scope='17 primarily Thai editable slides and an actual173.28second localUI demo using clearly labelled explicit model doubles. No new provider calls. Student cross-review and GoogleDoc/Drive/submission still pending.',revision_at=datetime.now(timezone.utc).isoformat())
 for r in v.get('files',[]):
  path=ROOT/r.get('file','')
  if path.is_file():r.update(bytes=path.stat().st_size,sha256=sha(path.read_bytes()))
 write(p,v)
print(json.dumps({'source_files':len(files),'source_archive_entries':len(content),'pngs':1800,'original_png_hashes_unchanged':True,'new_provider_calls':0}))
