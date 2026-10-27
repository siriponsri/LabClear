"""Specific coursework mapping from rendered documents and existing evidence."""
import json,re
from pathlib import Path
import pypdfium2 as pdf
ROOT=Path(__file__).resolve().parents[1];EV=ROOT/'docs/evidence/current/full-course-report-20261012'
def texts(path):
 d=pdf.PdfDocument(str(ROOT/path));out=[p.get_textpage().get_text_range().replace('\u200b','').replace('\u2060','') for p in d];d.close();return out
main=texts('docs/report/LabClear_Final_Project_Report_TH.pdf');app=texts('docs/report/LabClear_Final_Project_Appendix_TH.pdf')
def find(pages,term):return [i+1 for i,t in enumerate(pages) if term in t]
spec={
'R01':('ผู้จัดทำ',['owner-confirmed identities','docs/report/LabClear_Final_Project_Report_TH.docx cover'],'PRESENT','OWNER_CONFIRMED','NONE'),
'R02':('ธุรกิจ',['business_data/catalog.json','docs/report/LabClear_Business_Report_TH.md'],'PRESENT','PROTOTYPE_ONLY','ไม่มีข้อมูลดำเนินธุรกิจจริงเพียงพอ'),
'R03':('18',['business_data/catalog.json','knowledge/evidence/catalog.json'],'PRESENT','18_SYNTHETIC_SERVICES','ห้ามยกบริการจำลองเป็นข้อมูลธุรกิจที่ผ่าน validation'),
'R04':('ภาพทั้ง',['examples/thai_lab_reference_v3','services/report_reader_v2.py','docs/evidence/current/expanded-live-20261012-01/cases.jsonl I01-I05'],'PRESENT','PARTIAL_IMAGE_WORKFLOW','หน่วยและความครบถ้วนภาพยังไม่ผ่าน'),
'R05':('จำลอง',['original asset README_TH.md and expected_results.json','business_data/policies.json'],'PRESENT','SYNTHETIC_DOCUMENTED','สิทธิ์แม่แบบภาพเดิมยังไม่มีหลักฐานอิสระ'),
'R06':('ข้อกล่าวอ้าง',['docs/evidence/current/full-course-report-20261012/text-outcome-review.json'],'PRESENT','FAILURES_RECORDED','พบข้อกล่าวอ้างที่แหล่งไม่รองรับ'),
'R07':('UI',['docs/evidence/current/expanded-tests-20261012-01/ui/browser-uat.json','tests/browser/uat.cjs'],'PRESENT','37_OF_38_OFFLINE_UI_PASS','UI28 click timeout ยังไม่ยืนยันสาเหตุ'),
'R08':('ความปลอดภัย',['docs/evidence/current/full-course-report-20261012/classifier-metrics.json','docs/evidence/current/independent-text-20261012-01/cases.jsonl EXP-SAFE-01..24'],'PRESENT','PARTIAL_SAFETY','input FN6/12 และ FP1/12'),
'R09':('ต้นแบบ',['docs/evidence/current/context-isolation-offline-20261012-01/results.json','main.py'],'PRESENT','OFFLINE_SOURCE_STARTUP_VERIFIED','ไม่รับรอง production/live AI'),
'R10':('คำถาม 10',['eval/coursework','docs/evidence/current/expanded-live-20261012-01/cases.jsonl Q01-Q10','docs/evidence/current/expanded-live-20261012-01/scored.json'],'PRESENT','PARTIAL_LIVE_TEXT','Q07 มี SLA ที่แต่ง Q10 ภาษาอังกฤษ'),
'R11':('เส้นทาง API',['routers','docs/report/LabClear_Final_Project_Appendix_TH.docx ส่วน ง endpoint inventory'],'PRESENT','NOT_ALL_ENDPOINTS_DEMONSTRATED','รายการ source ไม่แทนผลการเรียกทุก endpoint'),
'R12':('processing',['docs/evidence/current/expanded-tests-20261012-01/ui/browser-uat.json','tests/browser/fixture_server.py'],'PRESENT','OFFLINE_UI_DEMONSTRATED','processing/error ใน demo ใช้โมเดลจำลอง'),
'R13':('ค้นเอกสาร',['services/evidence_search.py','knowledge/evidence/catalog.json','docs/evidence/current/full-course-report-20261012/text-outcome-review.json'],'PRESENT','PARTIAL_THAI_GROUNDING','ภาษาไม่สม่ำเสมอและอ้างอิงผิด'),
'R14':('สิ่งที่ควร',['runtime_skills/thai_health/manifest.json','runtime_skills/thai_health/core.md','eval/coursework'],'PRESENT','SOURCE_AND_CASE_MAPPING','การมี prompt ไม่รับรองพฤติกรรมทุกกรณี'),
'R15':('false',['services/business_store.py','routers/business.py','docs/evidence/current/context-isolation-offline-20261012-01/results.json'],'PRESENT','BOUNDARIES_OFFLINE_8_PASS','ยังไม่วัดโมเดลจริงใน isolation'),
'R16':('คำถาม 10',['docs/evidence/current/expanded-live-20261012-01/cases.jsonl Q01-Q10','docs/evidence/current/expanded-live-20261012-01/scored.json'],'PRESENT','RECORDED_LIVE_ANSWERS_TIMING','คง frozen rubric เดิม'),
'R17':('ภาพ 5',['docs/evidence/current/expanded-live-20261012-01/cases.jsonl I01-I05','original PNG/expected_results.json'],'PRESENT','RECORDED_IMAGE_RESULTS_NOT_ALL_PASS','ไม่ถือผล error เป็นการวิเคราะห์ถูก'),
'R18':('ความปลอดภัย 5',['docs/evidence/current/expanded-live-20261012-01/cases.jsonl S01-S05','eval/coursework'],'PRESENT','RECORDED_SAFETY_RESULTS','แยกชุด frozen 5 จาก expanded classifiers'),
'R19':('ปรับปรุง',['docs/evidence/current/unit-fidelity-retest-20261012-02','docs/evidence/current/unit-literal-retest-20261012-01','scripts/expanded_attempt_gate.py'],'PRESENT','OFFLINE_AND_TARGETED_LIVE_SEPARATE','ป้องกันหน่วยผิดยังไม่เท่ากับ OCR ผ่าน'),
'R20':('แผนภาพสถาปัตยกรรม',['docs/report/LabClear_Architecture_Editable_TH.svg','routers/business.py','services/conversation_transport.py'],'PRESENT','SOURCE_MAPPED','ไม่ยืนยันทุก endpoint จากแผนภาพ'),
'R21':('หนึ่งข้อความ',['docs/report/LabClear_Message_Flow_Editable_TH.svg','docs/evidence/current/expanded-live-20261012-01/cases.jsonl Q01'],'PRESENT','SOURCE_AND_RECORDED_FLOW','กรณีหนึ่งไม่แทนทุกเส้นทาง'),
'R22':('LabClear',['docs/report/LabClear_Final_Project_Report_TH.docx cover','docs/presentation/LabClear_Presentation_TH.pptx slide1'],'PRESENT','OWNER_CONFIRMED_IDENTITIES','NONE'),
'R23':('ธุรกิจ',['business_data/catalog.json','business_data/policies.json','business_data/branches.json'],'PRESENT','PROTOTYPE_DATA_ONLY','ห้ามแต่งลูกค้า รายได้ และ validation'),
'R24':('FAQ 10',['docs/report/LabClear_Final_Project_Report_TH.docx section2','docs/presentation/LabClear_Presentation_TH.pptx slide13'],'PRESENT','CONTENT_ONLY','FAQ ไม่เท่ากับผลทดสอบ'),
'R25':('บทบาท',['docs/report/LabClear_Final_Project_Report_TH.docx section12','owner-confirmed role allocation'],'PRESENT','OWNER_CONFIRMED_ALLOCATION','ยังต้องยืนยัน contribution จริงของแต่ละคน'),
'R26':('cross-review',['docs/presentation/LabClear_Oral_Defense_and_Cross_Review_TH.md'],'PREPARATION_ONLY','NOT_DEMONSTRATED','ผู้จัดทำต้องตรวจงานกันและรับรองบันทึกเอง'),
'R27':('Source bundle',['docs/report/LabClear_Source_Code_20261012.zip','docs/evidence/current/delivery-audit-repairs-20261012/archive-completeness.json','docs/evidence/current/context-isolation-offline-20261012-01/results.json'],'PRESENT','BOUNDED_OFFLINE_STARTUP','dependency installation ไม่ได้รัน; image fixtures แจกแยก'),
'R28':('Google',['docs/report/LabClear_Final_Project_Report_TH.pdf','student_report/01_COURSE_REQUIREMENTS.md C2'],'PDF_PRESENT_GOOGLE_DOC_PENDING','NOT_SUBMITTED','owner ต้องอนุมัติ upload/สิทธิ์ Google Doc และ Drive'),
'R29':('คลิป',['docs/presentation/LabClear_Academic_Demo_Storyboard_TH.docx','docs/presentation/LabClear_Academic_Demo_Timings.json'],'STORYBOARD_PRESENT_VIDEO_PENDING_VERIFY','NOT_YET_CONFIRMED','คลิป <=180s บังคับ ต้องตรวจเล่นและวัดไฟล์จริง'),
'R30':('ส่งลิงก์',['student_report/01_COURSE_REQUIREMENTS.md section6'],'PENDING','NOT_SUBMITTED','เจ้าของตรวจสิทธิ์และส่งลิงก์งาน')}
p=EV/'course-requirements-mapping.json';v=json.loads(p.read_text())
for row in v['requirements']:
 term,paths,content,behavior,pending=spec[row['id']]
 row.update(evidence={'main_pdf_pages':find(main,term),'main_section_search':term,'paths':paths},content_status=content,behavior_status=behavior,pending=pending)
 if row['id'] in ['R10','R16']:row['evidence']['appendix_case_pages']={id:[i+1 for i,t in enumerate(app) if re.search(r'\b'+id+r'\b',t)] for id in ['Q01','Q02','Q03','Q04','Q05','Q06','Q07','Q08','Q09','Q10']}
 if row['id'] in ['R17','R18']:
  ids=['I01','I02','I03','I04','I05'] if row['id']=='R17' else ['S01','S02','S03','S04','S05'];row['evidence']['appendix_case_pages']={id:[i+1 for i,t in enumerate(app) if re.search(r'\b'+id+r'\b',t)] for id in ids}
v['all_requirements_fulfilled']=False;v['mapping_revision']='SPECIFIC_RENDERED_PAGES_AND_PATHS';v['page_counts']={'main':len(main),'appendix':len(app)}
p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'requirements':30,'generic_identical_evidence_removed':True,'page_counts':v['page_counts']}))
