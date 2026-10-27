"""Repair delivery artifacts only. Does not import the app or call providers."""
import sys,json,re,zipfile,hashlib,copy
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'docs/evidence/current/reader-report-v2-20261012/runtime'))
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt,RGBColor
EV=ROOT/'docs/evidence/current/delivery-audit-repairs-20261012';EV.mkdir(exist_ok=True)
FONT='TH SarabunPSK'
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def sha(b):return hashlib.sha256(b).hexdigest()
def snapshot(p):
 dst=EV/(p.name+'.before')
 if not dst.exists():dst.write_bytes(p.read_bytes())
def font(rp,size=None):
 rf=rp.find(qn('w:rFonts'))
 if rf is None:rf=OxmlElement('w:rFonts');rp.insert(0,rf)
 for k in list(rf.attrib):
  if 'theme' in k.lower():del rf.attrib[k]
 for k in ['ascii','hAnsi','eastAsia','cs']:rf.set(qn('w:'+k),FONT)
 if size is not None:
  for tag in ['sz','szCs']:
   for e in list(rp.findall(qn('w:'+tag))):rp.remove(e)
   e=OxmlElement('w:'+tag);e.set(qn('w:val'),str(size*2));rp.append(e)

# Repair effective fonts and keep each evidence picture with its following caption.
docs=[ROOT/'docs/report/LabClear_Final_Project_Report_TH.docx',ROOT/'docs/report/LabClear_Final_Project_Appendix_TH.docx',ROOT/'docs/presentation/LabClear_Academic_Demo_Storyboard_TH.docx']
changed=[]
gloss={'demo fixture':'ข้อมูลจำลองสำหรับทดสอบ','CSRF':'การป้องกันคำสั่งปลอมที่อาศัยบัญชีผู้ใช้ (CSRF)','BM25':'การค้นเอกสารจากคำที่ตรงกัน (BM25)','citation_invalid':'ข้อผิดพลาดเพราะแหล่งอ้างอิงไม่ตรงกับคำตอบ','isolation_action':'การสลับแชต บัญชี หรือเซสชันเพื่อทดสอบการแยกข้อมูล','gate receipts':'รายการรับเข้าที่ใช้ตรวจนับการเรียก AI','shadow future estimate':'ประมาณการค่าใช้จ่ายในอนาคตที่แยกจากยอดจริง','shadow estimates':'ประมาณการค่าใช้จ่ายที่แยกจากยอดจริง'}
for path in docs:
 snapshot(path);d=Document(path);sizes={'Title':20,'Heading 1':18,'Heading 2':16,'Normal':14,'Caption':14}
 for st in d.styles:
  if st.type==1:
   font(st.element.get_or_add_rPr(),sizes.get(st.name,14))
 for para in d.paragraphs:
  if 'Report_TH' in path.name:
   for run in para.runs:
    t=run.text.replace('**','')
    for a,b in gloss.items():t=t.replace(a,b)
    run.text=t
  if para._p.xpath('.//w:drawing'):
   para.paragraph_format.keep_with_next=True;para.paragraph_format.keep_together=True
  elif para.style.name=='Caption':
   para.paragraph_format.keep_with_next=False;para.paragraph_format.keep_together=True
  for run in para.runs:font(run._r.get_or_add_rPr())
 for table in d.tables:
  for row in table.rows:
   pr=row._tr.get_or_add_trPr()
   if pr.find(qn('w:cantSplit')) is None:pr.append(OxmlElement('w:cantSplit'))
   for cell in row.cells:
    for para in cell.paragraphs:
     para.paragraph_format.keep_together=True
     for run in para.runs:
      if 'Report_TH' in path.name:run.text=run.text.replace('**','')
      font(run._r.get_or_add_rPr())
 # Remove misleading optional demo wording in narrative, preserving saved answers.
 if 'Report_TH' in path.name:
  para=d.add_paragraph('คลิปสาธิตต้นแบบจริงไม่เกิน 3 นาทีเป็นสิ่งส่งมอบที่รายวิชาบังคับ ขณะนี้มีเพียงสตอรีบอร์ด สถานะคลิปคือ REQUIRED_NOT_DELIVERED การมีรายงานและสไลด์ไม่ได้ทำให้การส่งงานครบถ้วน')
  for r in para.runs:font(r._r.get_or_add_rPr(),14)
 d.save(path);changed.append(str(path.relative_to(ROOT)))

# Archive required runtime instructions, launchers, safe configuration and bundled fonts.
archive=ROOT/'docs/report/LabClear_Source_Code_20261012.zip';snapshot(archive)
with zipfile.ZipFile(archive) as z:content={n:z.read(n) for n in z.namelist()}
added=[]
for p in list((ROOT/'runtime_skills/thai_health').glob('*'))+list((ROOT/'static/fonts').glob('*'))+[ROOT/'START.bat',ROOT/'scripts/start.ps1',ROOT/'.env.example']:
 if p.is_file():
  name=p.relative_to(ROOT).as_posix();content[name]=p.read_bytes();added.append(name)
content['PACKAGED_STARTUP.md']=('''# LabClear packaged source\n\nPython 3.12 and dependencies from requirements.txt are required. The archive does not contain installed dependencies. After extracting into a new local directory, copy .env.example to .env. The example has empty credentials and PROVIDER_NETWORK_ENABLED=false. Keep AI networking off for offline checks.\n\nOn Windows, START.bat invokes scripts/start.ps1. This launcher creates a virtual environment when absent, installs requirements (requires network), creates .env if absent and starts local Uvicorn. It was not executed during the audit. For an existing prepared environment, run `python -m uvicorn main:app --host 127.0.0.1 --port 8000`. Runtime instruction modules, manifest, fonts and public reference PDFs are included. No filled .env, keys, databases or original six health source images are included.\n\nAI validation requires separately approved credentials, privacy scope and budget. Offline startup is not proof of live-provider accuracy.\n''').encode()
# Locate the prior file manifest and refresh it without changing source bytes.
records=[{'file':n,'bytes':len(b),'sha256':sha(b)} for n,b in sorted(content.items()) if not n.lower().endswith('manifest.json')]
content['PACKAGE_COMPLETENESS_MANIFEST.json']=json.dumps({'files':records,'added_required_assets':added,'audit_mode':'STRUCTURAL_READ_ONLY_SOURCE_CHECK'},ensure_ascii=False,indent=2).encode()
temp=archive.with_suffix('.repair.zip')
with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in content.items():z.writestr(n,b)
temp.replace(archive)
required=['main.py','config.py','requirements.txt','runtime_skills/thai_health/manifest.json','START.bat','scripts/start.ps1','.env.example']
manifest=json.loads(content['runtime_skills/thai_health/manifest.json'])
checks={n:sha(content['runtime_skills/thai_health/'+n])==v for n,v in manifest['modules'].items()}
css='\n'.join(b.decode('utf8') for n,b in content.items() if n.endswith('.css'))
fontrefs=set(re.findall(r"/static/fonts/([^)'\"]+)",css));missing_fonts=[n for n in fontrefs if 'static/fonts/'+n not in content]
write(EV/'archive-completeness.json',{'required_files_present':all(n in content for n in required),'runtime_module_hashes':checks,'missing_css_fonts':missing_fonts,'files':len(content),'sha256':sha(archive.read_bytes()),'added':added,'startup_execution':'NOT_YET_RUN','original_archive_preserved':str((EV/(archive.name+'.before')).relative_to(ROOT))})
assert all(checks.values()) and not missing_fonts
old=ROOT/'docs/evidence/current/full-course-report-20261012/source-bundle-manifest.json';v=json.loads(old.read_text());v.update({'files':len(content),'sha256':sha(archive.read_bytes()),'runtime_modules_and_fonts_included':True,'completeness_audit':'docs/evidence/current/delivery-audit-repairs-20261012/archive-completeness.json'});write(old,v)

# Correct readiness without implying that a storyboard satisfies the required clip.
for p in [ROOT/'docs/evidence/current/full-course-report-20261012/CORE_DELIVERY_READY.json',ROOT/'docs/evidence/current/DELIVERY_CLOSEOUT_20261012.json']:
 snapshot(p);v=json.loads(p.read_text(encoding='utf8'))
 v['required_clip_status']='REQUIRED_NOT_DELIVERED';v['coursework_delivery_complete']=False
 v['new_overnight_scope']='Report and presentation revisions in progress. Required actual prototype demo <=180 seconds is REQUIRED_NOT_DELIVERED; storyboard is preparation only.'
 v['audit_revision_at']=datetime.now(timezone.utc).isoformat()
 for f in v.get('files',[]):
  fp=ROOT/f.get('file','')
  if fp.is_file():f['bytes']=fp.stat().st_size;f['sha256']=sha(fp.read_bytes())
 write(p,v)
write(EV/'repairs.json',{'modified_artifacts':changed,'raw_evidence_modified':False,'provider_calls':0,'required_clip_status':'REQUIRED_NOT_DELIVERED'})
print(json.dumps({'documents':len(changed),'archive_files':len(content),'runtime_hashes_match':all(checks.values()),'missing_fonts':missing_fonts}))
