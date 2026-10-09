# รายงานการรวมงาน LabClear 4.0.0-rc2 (Claude integration)

> วันที่ 9 ต.ค. 2026 · branch `integration/labclear-4.0-rc1` · ฐาน Codex `c970410b46bed02c2c20c66bc30a1b9055b2f919`
> commit โค้ดที่ทดสอบ `6f41a78` (ชุดเว็บรันซ้ำบน `a4aec07` ซึ่งต่างกันเฉพาะ API จำลองของ web UAT) · commit ส่งมอบ ดู `MANIFEST-SHA256.txt` ในชุดส่งมอบ
> ทำใน Claude Cowork Cloud ด้วยข้อมูลสังเคราะห์ ไม่ได้เรียก API ผู้ให้บริการจริง ไม่ได้แก้ ENV ของ Render ไม่ได้ push/merge `main` และไม่ได้ deploy

## 1. ผลลัพธ์รอบนี้

| ที่ต้องส่ง | สถานะ |
|---|---|
| Integration candidate บน Codex `c970410` ที่รักษา component/UI TH-EN/รายงานของ Claude | **เสร็จ** 4.0.0-rc2 (rc1 = รวมเว็บ, rc2 = free-first harness) |
| Deploy target กลับเป็น Render เดิม, Cloudflare เก็บเป็นทางเลือก | **เสร็จ** `render.yaml` ไม่เปลี่ยน, เว็บ Next.js เป็นบริการที่สองแบบเลือกได้, `deploy/cloudflare/` คงไว้ (DEFERRED) |
| Harness ที่รวม runtime skills + typed tools ใน pipeline จริงของแอป | **เสร็จ** `services/agent_tools.py`, `services/runtime_skills.py` 0.3.0 |
| แยก OFFLINE / REPLAY / LIVE_FREE + free-only policy + preflight | **เสร็จ** `scripts/benchmark_labclear.py`, `services/free_policy.py`, `scripts/live_free_server.py` |
| Benchmark 10 คำถาม + 5 ภาพ + 5 safety พร้อมคำตอบจริง ผ่าน/ไม่ผ่าน เวลาตอบ | OFFLINE **รันครบ** (ผลระดับ pipeline) · LIVE_FREE **ยังไม่ได้รัน: blocker มีหลักฐาน** |
| 3 จุดปรับปรุงก่อน–หลัง | **เสร็จ** วัดจริงแบบจับคู่ commit ใน OFFLINE; ผลต่อคุณภาพคำตอบ live ยังวัดไม่ได้ |
| ปรับรายงาน Claude/README/runbook ให้ตรงผลจริง | **เสร็จ** (หัวข้อ 6) |
| Source ZIP + Git bundle + SHA-256 | **เสร็จ** (หัวข้อ 9) |

**Blocker ของ LIVE_FREE (หลักฐาน `docs/evidence/free-first/live-free-preflight.json`):** ไม่มี `LABCLEAR_TRIAL_TYPHOON_API_KEY` และ `LABCLEAR_TRIAL_IAPP_API_KEY` ในสภาพแวดล้อมนี้ (และไม่ได้ขอ key ทางแชต), endpoint ทั้ง 3 ยังเป็น `FREE_STATUS_UNVERIFIED` เพราะยังไม่มีผู้ตรวจบัญชีจริง และเครื่องมือค้นเว็บของ Cowork ใช้ไม่ได้ในรอบนี้ (WebSearch ถูกปิดสำหรับองค์กร, WebFetch ไม่ได้รับอนุญาตทันเวลา) จึงตรวจหน้าราคา/rate limit/OCR path ซ้ำไม่ได้ ตัวรันปฏิเสธ live ด้วย exit 2 โดยไม่เรียก API ใด owner รันต่อได้ตาม `docs/ceo-upgrade/FREE_PROVIDER_PREFLIGHT.md`

## 2. แหล่งที่ใช้และแหล่งที่ขาด

| แหล่ง | ใช้อย่างไร |
|---|---|
| Codex `main` `c970410` (ตรวจ ancestor ด้วย `git merge-base --is-ancestor`) | ฐานของรุ่นรวม |
| Claude branch `release/4.0.0` (`95bf3d7`) | เว็บ `web/`, รายงาน สไลด์ แผนภาพ เอกสาร deploy (อยู่ใน bundle เป็นประวัติ) |
| เอกสารเสริม free-first r1 ของ owner (ZIP 9 ต.ค. 2026) | ข้อกำหนดรอบนี้ (ไม่ใช่โค้ด) ตรวจของจริงก่อนใช้ทุกคำสั่ง |
| `Final Project.docx`, `Week 12.pdf`, `Week11.pdf` ใน Project | อ่านเป็นข้อความที่ระบบแปลงให้ **ยืนยัน SHA-256 ต้นฉบับตาม MANIFEST ของ owner ไม่ได้** |
| `ENV_HANDOVER.md`, `MORNING_HANDOFF.md`, `PROGRESS.md` | ใช้ฉบับใน repo ที่ `c970410` (ไม่ได้รับไฟล์แยกจาก owner) |

แหล่งที่ขาดหรือเข้าไม่ถึง:
- commit ส่งมอบของ 3.1.0 ไม่อยู่ใน history ของ Codex `main` (ระบุไว้ตั้งแต่ rc1)
- `C:\Users\User\.agent-kit` ไม่อยู่ใน Cloud **ไม่ได้อ่าน** และไม่ได้เปลี่ยน global setup ใด
- เอกสารทางการของ Typhoon/iApp ไม่ได้เปิดซ้ำ (เหตุผลข้างต้น) ตัวเลขโควตาในแม่แบบนโยบายมาจากเอกสารเสริมของ owner
- ไม่มีผู้ตรวจทางคลินิกหรือผู้อ่านไทยที่ไม่ใช่บุคลากรแพทย์ในรอบนี้

## 3. Components ที่นำกลับมาใช้

| จาก Claude 4.0.0 | ในรุ่นรวม |
|---|---|
| เว็บ Next.js 16 + React 19 + R3F (หน้าแรก DNA helix, แพ็กเกจ, เปรียบเทียบ, ศูนย์, ช่วยเหลือ, ความเป็นส่วนตัว, แหล่งอ้างอิง) | ใช้ตามเดิม แก้ข้อความให้ตรงข้อมูล Codex |
| Design system, ฟอนต์ไทย, ธีม, ตัวสลับ TH/EN, พจนานุกรมไทย | ใช้ตามเดิม คำแปลไทย 2,297 ข้อความ (rc1 2,260 → rc2 +37) |
| แชตแบบขั้นตอนสด การ์ดค่า โปรเจกต์ dock, พื้นที่ลูกค้า, staff desk | ใช้ตามเดิม เพิ่มบรรทัด “ข้อมูลที่เซิร์ฟเวอร์ดึงมาใช้” และ “โมดูลคำแนะนำที่ผ่านการตรวจแล้ว” ใต้ “การตรวจสอบคำตอบนี้” |
| Staff AI providers | ปรับตามสัญญา Codex (rc1) + แผงนโยบาย free-only และแผง harness (rc2) |
| รายงานไทย .docx/.pdf, รายงานเทคนิค, สไลด์, แผนภาพ, release notes | ปรับไฟล์เดิม ไม่สร้างชุดใหม่ |
| `scripts/dev_mock_api.py`, web UAT | ปรับให้รันบน fixture ของ Codex, UAT 53 + flags-off 5 |
| Cloudflare Workers/Containers | เก็บไว้ครบ ไม่ใช้ (DEFERRED) |

ไม่ได้นำมา (ขัดกับ backend/security/สัญญา API ของ Codex): `routers/org.py`, `org_knowledge.py`, ตัวเลือก keep-chat, ชุดโมเดลเร็ว, semantic search, ค่าเริ่มต้น OpenRouter ของ Claude (ยังอยู่ใน `release/4.0.0` ใน bundle)

## 4. Codex ที่รักษาไว้

Backend FastAPI, session/CSRF/origin/rate limit, Fernet store, Guest privacy (ล้างเมื่อ refresh, ลบเมื่อเข้าสู่ระบบ), model harness (analyzer/composer ปิดเป็นค่าเริ่มต้น), runtime skills (ตรวจ hash), เอกสารองค์กร, ลิงก์โรงพยาบาล, call cap + THB ledger 300 บาท, สัญญา API และ flag ใหม่ 6 ตัวที่ปิดเป็นค่าเริ่มต้น Codex tests เดิม 265 ข้อยังผ่านทั้งหมด

## 5. สิ่งที่เปลี่ยนในรอบ rc2 (free-first)

| commit | สิ่งที่เปลี่ยน |
|---|---|
| `dbc6e61`, `5d39437`, `b7d6643` | ตัวรัน benchmark (ต่อยอด `course_eval.py`), ชุดข้อมูล frozen + rubric ฝั่ง scorer, test doubles หลัง MockTransport, โหมด `benchmark` ใน `offline_check.py` |
| `aa89aed` | **Typed tools**: catalog, compare, branches, policies, BM25 retrieval, confirmed report rows, booking preview ผ่าน schema เข้ม + scope ตามสิทธิ์ role + timeout + output limit + audit |
| `599f407` | **Runtime skills 0.3.0**: 4 โมดูลใหม่ เลือกตามงานและสิทธิ์ของ role (จุดปรับปรุง 1) |
| `4d75818` | **ภาพสังเคราะห์อัปโหลดได้ใน test env** + เก็บ `raw_fields` แยกจากค่าที่ยืนยัน (จุดปรับปรุง 2) |
| `c082a05` | **Free-only policy + โควตากลาง + LIVE_FREE trial server + preflight** (จุดปรับปรุง 3) |
| `efd8f57`, `6f41a78` | UI TH/EN ของ harness, รุ่น 4.0.0-rc2, ทำเครื่องหมาย BASELINE/DEFERRED ใน registry |
| `3a7d4f4`, `d4b1025` | path หลักฐาน rc2, `compare` แยกตัวแปรที่ทดสอบจาก confound |
| `a4aec07` | API จำลองของ web UAT เก็บการเชื่อมต่อว่าง 65 วินาที (แก้ UI-22 ที่ไม่ผ่านสองรอบ) ไม่แตะโค้ดของระบบหรือ entrypoint ของ Render |
| `812895f` | ผู้ใช้รันบน Windows ได้ 2 failed / 326 passed: Git (`core.autocrlf=true`) แปลงไฟล์ชุดข้อมูลที่ล็อก SHA-256 เป็น CRLF จึงเพิ่มไฟล์เหล่านั้นใน `.gitattributes` (`-text`) แบบเดียวกับ `knowledge/**` และเพิ่มเทสต์กันซ้ำ ทดสอบด้วย clone แบบ `core.autocrlf=true` ได้ 329 passed เนื้อหาชุดข้อมูลไม่เปลี่ยน |
| `991252f` และ commit หลังจากนั้น | แผนภาพ หลักฐาน รายงาน สไลด์ release notes และป้ายรุ่นในเอกสาร deploy เท่านั้น |

โมเดล OpenRouter/DeepSeek/Luna/Santé/Clef/embeddings: **DEFERRED_FOR_THIS_BENCHMARK** ไม่ได้ลบและไม่ได้สรุปว่าไม่เหมาะ

## 6. รายงานและเอกสารที่ปรับ

- `docs/report/LabClear_Report_TH_4_0_0.docx/.pdf` และ `scripts/build_report_th_400.py` — รุ่น rc2, harness, benchmark, ผลจริง, blocker
- `docs/report/LabClear_Technical_Report_4_0_0.md/.pdf`, `presentation/index.html` + `docs/report/LabClear_Slides_4_0_0.pdf` (ภาพในสไลด์เคยยังเป็นแผนภาพ Cloudflare/OpenRouter และภาพหน้าจอของ Claude branch รอบนี้ตัดใหม่จากแผนภาพ 4.0 และ web UAT ของ rc2)
- `docs/deploy/*.md`, `deploy/**` (เฉพาะป้ายรุ่นในข้อความ/คอมเมนต์), `knowledge/README.md`
- `docs/release-4.0.0.md`, `README.md`, `docs/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/testing.md`
- `docs/ceo-upgrade/`: `FREE_PROVIDER_PREFLIGHT.md`, `COURSEWORK_BENCHMARK_REPORT_TH.md` (ใหม่), `ENV_HANDOVER.md`, `PROGRESS.md`, `README.md` (เพิ่มส่วนท้าย ไม่แก้ของ Codex)
- แผนภาพ architecture และ message flow แสดง typed tools, การเลือก skills และประตู free-only

## 7. ผลทดสอบจริงของ candidate (ข้อมูลสังเคราะห์ ไม่เรียกโมเดลจริง)

| การตรวจ | commit | ผล | หลักฐาน |
|---|---|---|---|
| Python (`scripts/offline_check.py pytest`) | `6f41a78` | **328 ผ่าน** 0 ไม่ผ่าน 0 ข้าม (Codex 265 + rc1 12 + rc2 51) | `docs/evidence/integration-4.0-rc2/pytest.xml` |
| Browser เดิมของ Codex / upgrade | `6f41a78` | **36/36**, **10/10** | `codex-legacy-browser/`, `codex-upgrade-browser/` |
| Offline fixture matrix ของ Codex | `6f41a78` | 60 checks, `LIVE_MODEL_EVALUATION=NOT_RUN` | `offline-evaluation.json` |
| Render entrypoint smoke (`scripts/run_business.py` ไม่เปลี่ยน) | `6f41a78` | PASS 8 route | `boot.json` |
| เว็บ: type check, i18n (ไทย 2,297), build | `a4aec07` | ผ่าน 16 routes | `web-*.log` |
| Web UAT (flag ตาม fixture) | `a4aec07` | **53/53** สามรอบ ไม่มี browser error | `web-uat/uat.json`, `web-uat-repeat*.json` |
| Web UAT (flag ตาม fixture) | `6f41a78` | 52/53 สองรอบ: UI-22 500 บน `/staff` จาก `socket hang up` ของ proxy (ข้อสันนิษฐาน: keep-alive 5 s ทั้งสองฝั่ง) | `web-uat-run1.*`, `web-uat-run2.*` |
| Web UAT flag ใหม่ปิดทั้งหมด | `a4aec07` | **5/5** (404 ของ `/hospital-links` เป็นผลที่คาด) | `web-uat-flags-off/uat.json` |
| Coursework 10 + 5 + 5 OFFLINE (โปรไฟล์ C, free-only offline) | `4127bb5` (โค้ด = `6f41a78`) | รันครบ 20/20 ผ่านเกณฑ์ pipeline 15 ไม่ผ่าน 5 (ภาพที่ยืนยันค่าที่ Tesseract อ่านผิด) คนตรวจ `PENDING_REVIEW` | `docs/evidence/free-first/runs/G-C-free/` |
| REPLAY ของ run เดียวกัน | `4127bb5` | 20/20 ตรงกัน (ไม่ใช่ผล live) | `runs/G-C-replay/` |
| Regression 28 กรณี โปรไฟล์ A / B / C | `4127bb5` | ผ่าน pipeline 22 / 22 / 22 | `runs/G-A`, `G-B`, `G-C` |
| ปรับปรุง 1–3 (คู่ commit ทีละตัวแปร) | `599f407`, `4d75818`, `c082a05` | 5/8 → 0/8 · 0/5 → 5/5 · 30 → 0 | `compare-*.json`, `skill-route-matrix.json` |
| LIVE_FREE preflight | `4127bb5` | **BLOCKED** ไม่ได้ส่งคำขอใด ๆ | `live-free-preflight.json`, `live-free-run-blocked.txt` |

ทุกผลใช้ข้อมูลสังเคราะห์ ฐานข้อมูลชั่วคราว และตัวแทนผู้ให้บริการ ไม่มีผลใดเป็นคุณภาพของ Typhoon/iApp หรือการผ่านทางคลินิก

## 8. งานที่ยังค้าง

| เรื่อง | ใครทำ / ขั้นต่อไป |
|---|---|
| LIVE_FREE smoke + coursework A/B/C | owner: กรอกนโยบายที่ตรวจแล้ว ใส่ key ใน shell รัน preflight แล้วรันตาม runbook |
| ตรวจโดยคน (คลินิก/ภาษา) | ผู้ตรวจที่เหมาะสม กรอก `human_verdict` |
| Holdout H01–H05 | รันครั้งแรกหลังปรับเสร็จ ห้ามใช้ปรับ prompt |
| merge/deploy | owner ตรวจรับ bundle แล้ว merge เอง บริการเว็บบน Render ยังไม่ได้สร้าง (`API_ORIGIN`, `TRUSTED_ORIGINS` owner ตั้งเอง) |
| Keep-alive ระหว่าง Next.js กับ API | ก่อนวางเว็บหน้า API บน Render ให้พิจารณา `timeout_keep_alive` ของ uvicorn ใน `scripts/run_business.py` (รอบนี้ไม่ได้แก้) |
| เพดาน decisions ต่อ run | regression 28 กรณีต้องการ 330 > 300 ต้องแบ่งรัน · iApp 20 ครั้ง/นาทีเป็นคอขวดของเวลาตอบ |
| Rate limit ผ่านเว็บที่ proxy, Google sign-in ผ่านเว็บ | ต้องออกแบบและทดสอบก่อนใช้จริง |
| คลิป ≤ 3 นาที, Google Doc/PDF ใน Drive | ทีม (NOT_DONE) |
| แหล่งความรู้ใหม่ (Codex 15+6, Claude 90) | รอตรวจสิทธิ์และทางคลินิก ไม่ถูกค้น |
| PostgreSQL production, มือถือจริง, screen reader | NOT_RUN |

## 9. ชุดส่งมอบ

| ไฟล์ | คำอธิบาย |
|---|---|
| `LabClear-4.0.0-rc2-source.zip` | `git archive` ของ commit ส่งมอบ (ไม่มี `.env`, ฐานข้อมูล, `node_modules`, `.venv`, `eval_runs/`) |
| `LabClear-4.0.0-rc2.bundle` | Git bundle: `integration/labclear-4.0-rc1` (ทั้ง history จาก `c970410`) + `release/4.0.0` (ประวัติ Claude) + tag `base/codex-main-c970410` (ฐาน Codex `main`) |
| `MANIFEST-SHA256.txt` | ขนาดและ SHA-256 ของทุกไฟล์ในชุด, commit ส่งมอบ, คำสั่งตรวจ |
| `CLAUDE_INTEGRATION_REPORT.md` | ฉบับนี้ |

ตรวจ: `sha256sum -c MANIFEST-SHA256.txt` และ `git bundle verify LabClear-4.0.0-rc2.bundle` แล้ว `git clone LabClear-4.0.0-rc2.bundle -b integration/labclear-4.0-rc1`
