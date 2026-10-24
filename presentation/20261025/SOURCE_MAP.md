# SOURCE_MAP — LabClear presentation 25 Oct 2026

ทุกตัวเลข ข้อกล่าวอ้าง และภาพในสไลด์ ชี้กลับไปที่ไฟล์ใน repo ตามตารางนี้ รหัส E01–E15 และ S01–S06 ตรงกับ `docs/presentation/LABCLEAR_PRESENTATION_BRIEF_TH.md`

## Numbers and claims

| สไลด์ | ข้อความบนจอ | ค่า | Source | ตรวจเมื่อ |
| --- | --- | --- | --- | --- |
| 1 Overview | ต้นแบบเพื่อการศึกษา · ธุรกิจจำลอง · รายงานสังเคราะห์ | — | E01 `docs/final-submission/report/SOURCE_AND_CLAIM_MAP.md`, brief §1 | 24 ต.ค. |
| 5 Business | แพ็กเกจจำลอง 18 · บุคคล 15 / องค์กร 3 | 18 / 15 / 3 | E03 `business_data/catalog.json` (version `2026-10-05-proposed`, `is_demo: true`, segment count) | 24 ต.ค. นับจาก JSON |
| 5 Business | ศูนย์จำลอง 3 แห่ง (กรุงเทพฯ อารีย์ · เชียงใหม่ สุเทพ · ขอนแก่น) | 3 | E03 `business_data/branches.json` | 24 ต.ค. |
| 5 Business | Essential Check ฿1,190 · Workday Check ฿1,690 (+ Lipid, ALT) | P01 / P02 | E03 `business_data/catalog.json` | 24 ต.ค. |
| 6–7 Knowledge | 148 records · 58 / 90 | 148 = 58 + 90 | E04 `knowledge/evidence/catalog.json` version `2026-10-09-owner-approved-148` (`approval_note`), `knowledge/README.md` | 24 ต.ค. |
| 7 Knowledge | 29 ชื่อผู้เผยแพร่ · NLM 35 · Siriraj 2 ชื่อ 23 + 23 · อีก 27 ชื่อ 67 | 35 + 46 + 67 = 148 | E04 catalog.json (นับ field `publisher`) | 24 ต.ค. |
| 8 Knowledge | record `siriraj-glucose-glucose-07` · aliases น้ำตาล/กลูโคส/FBS/Glucose · อายุ > 15 ปี 74–99 mg/dL · page 2 · reviewed 2026-10-03 | — | E04 catalog.json; `source_file` = `knowledge/medical_sources/raw/DR-019.pdf`, `source_sha256` f1028e33d30f356b228acc8446ba5c096abcfa3b4b8bae094ebb832a1a5e2347 (ตรวจ hash ไฟล์แล้วตรง) | 24 ต.ค. |
| 8 Knowledge | Publisher PDF 21 ไฟล์ ↔ 42 records | 21 / 42 | E04 catalog.json (`source_file` distinct = 21, records = 42) | 24 ต.ค. |
| 13 Architecture | หนึ่ง FastAPI service · AI Workflow · Document Worker (subprocess) · BM25 · encrypted state SQLite/PostgreSQL · providers นอกขอบเขต | — | E06 `docs/architecture.md`; E07 `services/business_agent.py`, `agent_tools.py`, `runtime_skills.py`; `services/document_worker.py`; E09 `services/evidence_search.py`, `services/business_store.py` | 24 ต.ค. อ่าน source บางส่วน |
| 15 Processing Flow | 5 ขั้น · stop / handoff · user confirmation · unit stop | — | E07, E08 `routers/business.py`, `services/report_reader_v2.py`, `services/lab_units.py`; E10 `docs/safety.md`, `services/answer_checks.py`, `services/conversation_guard.py` | brief §3 |
| 16 Evaluation | Run 12 Oct 2026 · LIVE_PROVIDER_LOCAL_UI · 4.0.0-rc3 · d4ec212 | — | E12 `docs/evidence/current/expanded-live-20261012-01/run.json` | 24 ต.ค. |
| 16 Evaluation | 10 คำถาม 6 PASS / 2 PARTIAL / 2 FAIL · median 13.67 s (9.307–24.207) | Q01,Q02 PARTIAL · Q07,Q10 FAIL | E12 `docs/final-submission/report/TEST_RESULTS.csv` (run_id `expanded-live-20261012-01`, `report_verdict`, `latency_seconds`) | 24 ต.ค. คำนวณ median ซ้ำ |
| 16 Evaluation | 5 ภาพ 1 FAIL / 4 ERROR · median 44.44 s (23.440–60.325) | I01 FAIL · I02–I05 ERROR | E12 TEST_RESULTS.csv | 24 ต.ค. |
| 16 Evaluation | 5 safety PASS · median 1.64 s (0.338–11.872) | S01–S05 | E12 TEST_RESULTS.csv | 24 ต.ค. |
| 16 Evaluation | automated 15 PASS / 1 FAIL / 4 ERROR แยกจากผลตรวจเนื้อหา | — | E12 TEST_RESULTS.csv `original_verdict` | 24 ต.ค. |
| 16, 18 Evaluation | ชุดขยายพบข้อผิดพลาดของ input guard · ชุดขยายพลาด 6 จาก 12 (backup: TP6 FN6 FP1 TN11) | 24 inputs | E14 `docs/evidence/current/full-course-report-20261012/classifier-metrics.json` | 24 ต.ค. |
| Backup | Independent text 62 scenarios 9 / 20 / 22 / 11 | — | E13 `docs/evidence/current/full-course-report-20261012/semantic-review-summary.json` | 24 ต.ค. |
| Backup | Later image stage, UI 37/38, offline 12/12 + 10/10, NOT_RUN 30 | — | brief §4 (อ้าง E13, E15) — ไม่ได้เปิดไฟล์ต้นทางซ้ำในงานนี้ | ตาม brief |

## Images

ไฟล์ภาพทั้งหมดถูกคัดลอกมาไว้ใน `slides/img/` ไม่ได้แก้ไฟล์ต้นฉบับ การ crop ทำด้วย CSS (`--cx --cy --cw --ch` เป็นพิกัดพิกเซลของภาพต้นทาง กว้าง 1920 เว้นแต่ระบุ `--sw`) ยกเว้นภาพ KM ที่ render จาก PDF

| ไฟล์ในสไลด์ | ต้นฉบับ | Mode / วันที่ | Crop | ใช้ที่ | SHA-256 (สำเนา) |
| --- | --- | --- | --- | --- | --- |
| `w01-home-mock-20261017.png` | `docs/final-submission/clip/assets/captures/tour-20261017/shots/t01-home.png` | OFFLINE_MOCK_UI · 17 ต.ค. 2026 | x360 y120 w1200 h1060 | สไลด์ 1 | e9c2b434… |
| `w02-packages-mock-20261017.png` | `…/tour-20261017/shots/t02-packages.png` | OFFLINE_MOCK_UI · 17 ต.ค. | x386 y129 w1151 h400 | สไลด์ 5 (spotlight ที่ "18 รายการ") | 0d8f0448… |
| `s01-compare-mock-20261017.png` (S01) | `…/tour-20261017/shots/t04-compare.png` | OFFLINE_MOCK_UI · 17 ต.ค. | x392 y292 w1136 h440 | สไลด์ 9 (spotlight แถวราคา → แถวไขมัน/ALT) | a7efd333… |
| `s02-knowledge-mock-20261017.png` (S02) | `…/tour-20261017/shots/t20-mgr-knowledge.png` | OFFLINE_MOCK_UI · 17 ต.ค. | — | Backup | ec477517… |
| `s03a-request-sent-mock-20261017.png` (S03) | `…/tour-20261017/shots/t13-book-sent.png` | OFFLINE_MOCK_UI · 17 ต.ค. | x396 y92 w1128 h378 | สไลด์ 10 (spotlight สถานะรอการยืนยัน) | 8c9cf6bb… |
| `s04-trace-live-20261013.png` (S04) | `…/live-20261013/shots/06-process-explainability.png` | LIVE_PROVIDER_LOCAL_UI · 13 ต.ค. | x726 y668 w734 h256 (ไม่รวมกล่องราคาโรงพยาบาลภายนอก) | สไลด์ 12 (spotlight ไล่ 4 แถว), Backup | 0ad1bd78… |
| `s05a-report-review-live-20261013.png` (S05) | `…/live-20261013/shots/10-report-review.png` | LIVE_PROVIDER_LOCAL_UI · 13 ต.ค. | x742 y622 w712 h248 | สไลด์ 11 (spotlight แถบเตือน → ปุ่ม) | bcd64b59… |
| `s05b-report-withheld-live-20261013.png` (S05) | `…/live-20261013/shots/12-report-explained.png` | LIVE_PROVIDER_LOCAL_UI · 13 ต.ค. — แสดง withheld / error จริง | — | Backup | 764b4dfb… |
| `km-dr019-p2-glucose.png` | `knowledge/medical_sources/raw/DR-019.pdf` หน้า 2 (คู่มือการส่งตรวจ ภาควิชาพยาธิวิทยาคลินิก คณะแพทยศาสตร์ศิริราชพยาบาล) | Publisher PDF | render ด้วย PyMuPDF 220 dpi, clip (60, 20)–(585, 400) pt · กรอบไฮไลต์แถว "อายุ > 15 ปี 74-99" วาดด้วย CSS | สไลด์ 8 คลิก 9 | 9b6f7716… |
| `ev-q05-pass-live-20261012.png` (Q05 PASS) | `docs/evidence/current/expanded-live-20261012-01/screenshots/Q05-r1-view.png` | LIVE_PROVIDER_LOCAL_UI · 12 ต.ค. | ภาพกว้าง 1280 · x400 y128 w740 h340 | สไลด์ 17 | 7a8b84eb… |
| `ev-q07-fail-live-20261012.png` (Q07 FAIL) | `…/expanded-live-20261012-01/screenshots/Q07-r1-view.png` | LIVE_PROVIDER_LOCAL_UI · 12 ต.ค. | ภาพกว้าง 1280 · x400 y128 w740 h330 · กรอบแดงรอบประโยค "7 วันทำการ" วาดด้วย CSS | สไลด์ 17 คลิก 22 | 957408a2… |
| `ev-i04-error-live-20261012.png` (I04 ERROR) | `…/expanded-live-20261012-01/screenshots/I04-r1-view.png` | LIVE_PROVIDER_LOCAL_UI · 12 ต.ค. | ภาพกว้าง 1280 · x400 y300 w740 h345 | สไลด์ 18 | 94c72122… |
| `ev-s01-pass-live-20261012.png` (S01 PASS) | `…/expanded-live-20261012-01/screenshots/S01-r1-view.png` | LIVE_PROVIDER_LOCAL_UI · 12 ต.ค. | ภาพกว้าง 1280 · x400 y128 w740 h340 | สไลด์ 18 คลิก 24 | f6423e3e… |

provenance ของภาพ tour อยู่ที่ `…/tour-20261017/tour.json` และของ live อยู่ที่ `…/live-20261013/capture-run.json`

**สิทธิ์ภาพ PDF:** record ระบุ `rights: Public source; redistribution/commercial-use permission not established` สไลด์ใช้เฉพาะบางส่วนพร้อมระบุที่มา เพื่อการศึกษา ถ้าจะเผยแพร่ลิงก์ Vercel แบบสาธารณะในวงกว้าง ควรพิจารณาเปิด Deployment Protection

## RAG slide (สไลด์ 14 · Plan, Search, Cite)

ข้อความทุกช่องมาจากโค้ดที่ commit `a9fc0b3` (ไฟล์ใน `services/` เหมือนกับ branch นำเสนอ)

| ข้อความบนจอ | ไฟล์ · บรรทัด |
| --- | --- |
| Planner เขียน query เป็นชื่อการตรวจภาษาอังกฤษ ไม่ใส่ชื่อคนหรือค่าในรายงาน | `services/business_agent.py` L74–75 (คำสั่งของ planner) |
| query ว่าง → ใช้ alias ที่เจอในข้อความ | `services/business_agent.py` L200–203 · `services/answer_checks.py` `medical_terms()` L39–48 |
| ค้นได้เฉพาะบทบาทที่อ่าน medical | `services/business_agent.py` L257 · `services/agent_tools.py` L219–220 (tool scope `medical`) |
| record ที่พักไว้ถูกตัดออก | `services/knowledge_admin.py` `active_records()` L25–27 · `services/evidence_search.py` L65–66 |
| ตรวจ hash ทุก record ตอนโหลด | `services/evidence_search.py` `corpus()` L21–42 |
| แยกคำ: ละติน + คู่อักษรไทย (`น้ำตาล` → น้ ้ำ ำต ตา าล) | `services/evidence_search.py` `tokens()` L45–51 |
| alias ที่ตรงขึ้นก่อน แล้วเรียงตามคะแนน | `services/evidence_search.py` L75–80, L92–93 |
| คืน 6 รายการเป็นค่าเริ่มต้น (ตั้งได้ 1–8) | `services/harness_config.py` L41 |
| อ้างได้เฉพาะ id ที่ค้นเจอ ไม่ผ่าน → ไม่แสดงคำตอบ | `services/conversation_agent.py` `validate_answer()` L245–253 |
| แก้ได้ 1 ครั้งแล้วหยุด | `services/business_agent.py` L330–337 |
| กราฟคะแนน query `glucose` | คำนวณซ้ำ 24 ต.ค. ด้วยสูตรเดียวกับ `lexical()` บน `knowledge/evidence/catalog.json` ทั้ง 148 records (สมมติว่าไม่มี record ถูกพัก): mlp-blood-glucose 4.78 · siriraj-glucose-glucose-07 4.75 · kku-glucose-glucose-08 4.74 · nlm-a1c 4.73 · rajavithi-fbs-hba1c 1.40 (alias ตรง) · niddk-diabetes-tests 4.96 (alias ไม่ตรง) |

## Appendix code references (สไลด์ 22–24)

ลิงก์บนสไลด์ชี้ไปที่ `github.com/siriponsri/LabClear/blob/a9fc0b35c5f557ff990762ee7a6a5c5d802cc733/…` (commit `a9fc0b3` บน `origin/main`) ตรวจแล้วว่าไฟล์ด้านล่างที่ commit นี้เหมือนกับ branch `presentation-20261025` และบรรทัดตรงตามที่ระบุ (24 ต.ค. 2026 · อ่านด้วย `git show`)

| สไลด์ | ข้อกล่าวอ้าง | ไฟล์ · บรรทัด |
| --- | --- | --- |
| 22 | คลังความรู้เป็น JSON: id · aliases · content · URL · hash | `knowledge/evidence/catalog.json` L1–23 |
| 22 | โหลด catalog และตรวจ id ซ้ำ · sha256 · URL https | `services/evidence_search.py` `corpus()` L21–42 |
| 22–23 | แยกคำละติน + คู่อักษรไทย · นับความถี่ด้วย `Counter` · cache ด้วย `lru_cache` | `services/evidence_search.py` L45–61 |
| 22–23 | คะแนน BM25 · alias ที่ตรงหัวข้อขึ้นก่อน | `services/evidence_search.py` `lexical()` L64–93 (สูตร L89–90) |
| 22 | `retrieve_evidence` → `ctx.search` → `evidence_search.search()` → `lexical()` mode `"lexical"` | `services/agent_tools.py` L169–171 · `services/business_agent.py` L226 · `services/evidence_search.py` L96–100 |
| 22–23 | เรียกค้น · ใส่ `EVIDENCE` ใน payload · ส่งให้ writer | `services/business_agent.py` L257–260, L286, L326–328 (บรรทัด 286 บนสไลด์ตัดบางส่วนด้วย …) |
| 24 | รับไฟล์ผ่าน `UploadFile` | `routers/organization_sources.py` `upload()` L64–77 |
| 24 | `.txt` / `.md` · ไม่เกิน 256 KiB · decode UTF-8 | `services/organization_sources.py` L39–50 |
| 24 | เก็บ text · sha256 · version · สถานะ `draft` | `services/organization_sources.py` L59–65 |
| 24 | JSON เข้ารหัส → `rs_entities.payload` | `services/business_store.py` L63–64 |
| 24 | `data/business.sqlite3` (`BUSINESS_DB_PATH`) · PostgreSQL เมื่อตั้ง `DATABASE_URL` | `services/business_store.py` L112–113, L146–161 |
| 24 | ค้นเฉพาะ `approved` · นับคำตรงต่อบรรทัด · สูงสุด 6 | `services/organization_sources.py` `retrieve()` L97–110 |
| 24 | ใส่ในบริบทแชตเมื่อเปิด `ORG_REFERENCE_INFERENCE_ENABLED` | `routers/business.py` L465–466 |
| 24 | สวิตช์ทั้งสองเป็น `False` เป็นค่าเริ่มต้น | `config.py` L19–20 |

ไม่มีขั้น embedding และไม่มี vector database ในเส้นทางทั้งสอง ตัวแปร `vectors` ใน `_index()` คือ `Counter` ของความถี่คำ

## What was not done

- ไม่ได้เรียก LLM / OCR / provider ใด ๆ ไม่ได้เปิดแอปจริง และไม่ได้อ่าน `.env`
- ไม่ได้ตรวจเว็บ `labclear.onrender.com` แบบสด ลิงก์ในสไลด์สุดท้ายเป็นลิงก์ให้กดเองเท่านั้น
- ตัวเลขในหน้า Backup ใช้ตามทะเบียนใน brief หัวข้อ 4 โดยไม่ได้เปิดไฟล์ต้นทางซ้ำทุกชุด
