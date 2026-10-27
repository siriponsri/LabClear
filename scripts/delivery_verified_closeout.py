"""Final metadata and readable companions, no app/provider execution."""
import sys,json,hashlib,zipfile,re
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'docs/evidence/current/reader-report-v2-20261012/runtime'))
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
EV=ROOT/'docs/evidence/current/delivery-audit-repairs-20261012';MAIN=ROOT/'docs/evidence/current/full-course-report-20261012'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
for stem in ['docs/report/LabClear_Final_Project_Report_TH','docs/report/LabClear_Final_Project_Appendix_TH','docs/presentation/LabClear_Academic_Demo_Storyboard_TH']:
 p=ROOT/(stem+'.docx');d=Document(p);parts=[]
 for el in d.element.body:
  if el.tag.endswith('}p'):
   para=Paragraph(el,d);t=para.text.replace('\u200b','').replace('\u2060','')
   if not t:continue
   prefix='# ' if para.style.name=='Title' else '## ' if para.style.name=='Heading 1' else '### ' if para.style.name=='Heading 2' else ''
   parts.append(prefix+t)
  elif el.tag.endswith('}tbl'):
   table=Table(el,d);rows=[[c.text.replace('\u200b','').replace('\u2060','').replace('|','\\|').replace('\n','<br>') for c in row.cells] for row in table.rows]
   parts.append('\n'.join(['| '+' | '.join(rows[0])+' |','| '+' | '.join(['---']*len(rows[0]))+' |']+['| '+' | '.join(r)+' |' for r in rows[1:]]))
 text='\n\n'.join(parts)+'\n'
 if 'Appendix' in stem:text+='\nภาพเต็มอยู่ใน Word/PDF และ screenshots ZIP การครอปเพื่อให้อ่านง่ายไม่เพิ่มจำนวนตัวอย่างต้นทาง\n'
 (ROOT/(stem+'.md')).write_text(text,encoding='utf8')
p=MAIN/'course-requirements-mapping.json';v=load(p)
for r in v['requirements']:
 if r['id']=='R29':
  r.update(content_status='CLIP_DELIVERED_LIMITED',behavior_status='ACTUAL_LOCAL_UI_WITH_EXPLICIT_MODEL_DOUBLE',pending='ผู้จัดทำตรวจความเหมาะสมของคลิปไม่มีเสียง/โมเดลจำลองก่อนส่ง ไม่ถือเป็นผล AI ใหม่')
  r['evidence']['paths']=list(dict.fromkeys(r['evidence']['paths']+['docs/presentation/LabClear_Academic_Demo_TH.webm','docs/presentation/LabClear_Academic_Demo_TH.webm.playback.json','docs/evidence/current/delivery-audit-repairs-20261012/video-qa/ffmpeg-92.png']));r['evidence']['verified_duration_seconds']=173.28
 if r['id']=='R10':r['status']='มีคำตอบ Q01–Q10 และเวลาจริง; พบ Q07 แต่ง SLA และ Q10 ภาษาอังกฤษ จึงไม่รับรองคำตอบผ่านครบ'
save(p,v)
p=ROOT/'docs/report/README.md';text=p.read_text(encoding='utf8');text=text.replace('1792ภาพ','1800ภาพ (1792ภาพเดิม และภาพผล HTTP 8ภาพ)').replace('และยังขาดคลิป≤3นาที การตรวจข้ามงานของผู้จัดทำ','คลิปจริง 173.28วินาทีมีคำบรรยายไทย ไม่มีเสียง และใช้โมเดลจำลองติดป้ายชัดเจน ยังขาดการตรวจข้ามงานของผู้จัดทำ')
addition='\nการตรวจคำตอบที่บันทึก 62กรณี: PASS9 / PARTIAL20 / FAIL22 / ERROR11 ผลอัตโนมัติเดิมคงไว้ รายละเอียดในภาคผนวกส่วน ฉ ไม่มี clinical validation\n\n[คลิปสาธิต 173.28วินาที](../presentation/LabClear_Academic_Demo_TH.webm) และ [จังหวะ/คำบรรยายที่แก้ไขได้](../presentation/LabClear_Academic_Demo_Timings.json) ใช้หน้าเว็บ/APIจริงกับโมเดลจำลอง ไม่มีผู้ให้บริการใหม่\n'
if addition not in text:text+=addition
p.write_text(text,encoding='utf8')
p=ROOT/'docs/presentation/README.md';text=p.read_text(encoding='utf8');addition='\nฉบับแก้ audit: สไลด์ใช้ภาษาไทยเป็นหลัก แยกผลอัตโนมัติจากการตรวจคำตอบ มี [คลิปจริง173.28วินาที](LabClear_Academic_Demo_TH.webm) และ [timings/captions](LabClear_Academic_Demo_Timings.json) คลิปไม่มีเสียงและติดป้าย agent double ชัดเจน ไม่ใช่ live AI validation\n'
if addition not in text:text+=addition
p.write_text(text,encoding='utf8')
presentation=ROOT/'docs/evidence/current/presentation-20261012/FINAL_PRESENTATION_DELIVERY.json';v=load(presentation);v.update(status='REVISED_THAI_DECK_AND_LIMITED_ACTUAL_UI_DEMO_READY',primarily_thai_visible_copy=True,required_demo_delivered=True,demo_seconds=173.28,demo_mode='ACTUAL_LOCAL_UI_EXPLICIT_MODEL_DOUBLE_THAI_CAPTIONS_NO_AUDIO',new_provider_calls=0,all17slides_visual_review=True,storyboard_font_family='TH SarabunPSK',storyboard_theme_font_attributes_removed=True,storyboard_duplicate_complex_sizes_removed=True)
for r in v.get('files',[]):
 p=ROOT/r['file']
 if p.is_file():r.update(bytes=p.stat().st_size,sha256=sha(p))
for name in ['docs/presentation/LabClear_Academic_Demo_TH.webm','docs/presentation/LabClear_Academic_Demo_Timings.json']:
 p=ROOT/name;v['files']=[r for r in v.get('files',[]) if r['file']!=name];v['files'].append({'file':name,'bytes':p.stat().st_size,'sha256':sha(p)})
save(presentation,v)
video=load(EV/'demo-recording.json');video.update(playback='CHROMIUM_PLAYBACK_VERIFIED',duration_seconds=173.28,decoded_frames='Playwright bundled FFmpeg VP8 decoder,10timestamps inspected',audio='NONE_THAI_CAPTIONS',failed_first_take_preserved=True,chrome_seek_frame_probe='FAILED_DUPLICATE_FIRST_FRAMES; retained, replaced by decoded FFmpeg evidence');save(EV/'demo-recording.json',video)
save(EV/'failed-probes-retained.json',{'offline_context_initial_probe':'Windows asyncio loopback denied by too-broad network block; no context tests ran. Corrected allow-loopback still denies all external connects, second probe passed8.','demo_take1':'desktop #new-chat hidden; click timed out. Private original video retained; corrected .cl-new take delivered.','PowerPoint_first_revision':'table-cell WordWrap property unsupported; fixed by removing it, last native export passed.','browser_video_seek_probe':'allframesduplicatedfirstframe; notacceptedQA. TrustedPlaywrightFFmpeg decoded10different actualtimestamps.','new_provider_calls':0})
save(EV/'FINAL_AUDIT_REPAIR_CLOSEOUT.json',{'at':datetime.now(timezone.utc).isoformat(),'seven_findings':'IMPLEMENTED_AND_VERIFIED_WITH_DISCLOSED_LIMITS','semantic_review':{'cases':62,'PASS':9,'PARTIAL':20,'FAIL':22,'ERROR':11,'remaining_REVIEW_PENDING':0,'uncertainty':'20PARTIALretaincase-specificlimits; noindependentclinicalreview'},'context_boundary_tests':{'actual_http_actions':8,'PASS':8,'provider_calls':0,'guest_reload':'HTTPclose/reopen sequence,notbrowserreload','mode':'explicitagentdouble'},'demo':{'file':'docs/presentation/LabClear_Academic_Demo_TH.webm','seconds':173.28,'playback_verified':True,'audio':False,'mode':'actualUI/modeldoubles'},'attempts':{'before':722,'after':722,'cap':4000},'raw_answers_automated_outcomes_preserved':True,'new_image_grounding_tone_cases_run':0,'remaining_blockers':['full-imageunitfidelityand30dependentimagecases','20PARTIALsemanticuncertainties','live-modelcontextresistanceunvalidated','UI28timeoutcauseunknown'],'owner_only_actions':['reviewsilentmocked-demo suitability','studentcross-review/individualdefense','approveGoogleDoc/Driveuploadandsharing','finalsubmission'],'evidence':'final-document-qa.json, final-archive-checks.json, course-requirements-mapping.json, text-outcome-review.json, results.json'})
print('Companions and final delivery metadata refreshed; raw results preserved.')
