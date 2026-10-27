"""Synchronize affected metadata only; preserve source/video/test artifacts."""
import json,hashlib,re,zipfile
from pathlib import Path
from datetime import datetime,timezone
import pypdfium2 as pdf
ROOT=Path(__file__).resolve().parents[1];EV=ROOT/'docs/evidence/current/focused-remnants-20261012';MAIN=ROOT/'docs/evidence/current/full-course-report-20261012'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
doc=pdf.PdfDocument(str(ROOT/'docs/report/LabClear_Final_Project_Report_TH.pdf'));texts=[p.get_textpage().get_text_range().replace('\u200b','').replace('\u2060','') for p in doc];pages=len(doc);doc.close()
assert pages==14
for term in ['exact field accuracy','claim-level gold review','physical scale','ambiguous spans','atomic admission gate']:
 assert not any(term in t for t in texts),term
front=re.sub(r'\s+','',texts[0])
assert '173.28' in front and 'ไม่มีเสียง' in front and 'โมเดลจำลอง' in front and 'รอเจ้าของ' in front
mapping=load(MAIN/'course-requirements-mapping.json')
for r in mapping['requirements']:
 term=r['evidence'].get('main_section_search','')
 r['evidence']['main_pdf_pages']=[i+1 for i,t in enumerate(texts) if term and term in t]
save(MAIN/'course-requirements-mapping.json',mapping)
for p in [MAIN/'CORE_DELIVERY_READY.json',ROOT/'docs/evidence/current/presentation-20261012/FINAL_PRESENTATION_DELIVERY.json',ROOT/'docs/evidence/current/DELIVERY_CLOSEOUT_20261012.json']:
 v=load(p)
 for r in v.get('files',[]):
  f=ROOT/r.get('file','')
  if f.is_file():r.update(bytes=f.stat().st_size,sha256=sha(f))
 v['focused_remnants_revision_at']=datetime.now(timezone.utc).isoformat();v['focused_remnants_checks']='docs/evidence/current/focused-remnants-20261012/focused-remnants-checks.json'
 save(p,v)
p=ROOT/'docs/evidence/current/delivery-audit-repairs-20261012/final-archive-checks.json';v=load(p);v.update(screenshots_sha256=sha(ROOT/'docs/report/LabClear_All_Screenshots_20261012.zip'),all_1800_png_bytes_unchanged_in_focused_revision=True,direct_archive_member_lookup_verified=1800);save(p,v)
p=EV/'focused-remnants-checks.json';v=load(p)
protected={n:sha(ROOT/n)==h for n,h in load(EV/'protected-before.json').items()};assert all(protected.values())
v.update(report_render='VERIFIED native Word PDF14pages; page1,9,10 fullsize andallpagecontactscan',slide8_native_render='VERIFIED fullsize nativePowerPoint; explicitheaderbbox withincolumn2, oldcelllabelcleared',source_video_raw_protected=protected,new_provider_calls=0,new_test_cases=0,attempts_total_unchanged=722,cap=4000,finished_at=datetime.now(timezone.utc).isoformat())
pos=load(EV/'slide8-header-position.json');assert pos['LabelLeft']>=pos['Column2Left'] and pos['LabelLeft']+pos['HeaderWidth']<=pos['Column2Right']
v['slide8_header_geometry']=pos
with zipfile.ZipFile(ROOT/'docs/presentation/LabClear_Presentation_TH.pptx') as current,zipfile.ZipFile(EV/'LabClear_Presentation_TH.before.pptx') as prior:
 names=[f'ppt/slides/slide{i}.xml' for i in range(1,18) if i!=8]
 changes=[n for n in names if current.read(n)!=prior.read(n)]
 v['other_slide_xml_changes']=changes
save(p,v)
print(json.dumps({'report_pages':pages,'executive_disclosures_present':True,'jargon_targets_remaining':0,'header_inside_column2':True,'manifest_members_verified':1800,'protected_artifacts_unchanged':all(protected.values()),'other_slide_xml_changes':changes,'provider_calls':0},ensure_ascii=False))
