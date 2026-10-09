# Free-only provider preflight และ runbook ของ LIVE_FREE

> รุ่นรวม 4.0.0-rc2 · ฐาน Codex `c970410` · สถานะ: **LIVE_FREE ยังไม่ได้รัน** (ไม่มี key และยังไม่มีผู้ตรวจสิทธิ์ใช้ฟรีของบัญชีจริง)
> เอกสารนี้ตอบข้อ 4 และ 9 ของ `LABCLEAR_FREE_FIRST_BENCHMARK_ADDENDUM_TH.md` ที่ owner ส่งมา และใช้คู่กับ
> [COURSEWORK_BENCHMARK_REPORT_TH.md](COURSEWORK_BENCHMARK_REPORT_TH.md)

## 1. สามโหมดที่แยกกันชัด

| โหมด | คำสั่ง | สิ่งที่เรียก | ใช้เป็นหลักฐานอะไรได้ |
|---|---|---|---|
| OFFLINE | `python scripts/benchmark_labclear.py run --mode offline ...` | แอปจริงทั้งเส้นทาง แต่ผู้ให้บริการเป็นตัวแทน (test doubles) หลัง `httpx.MockTransport` ใน process เดียวกัน รันผ่าน `scripts/offline_check.py benchmark` ซึ่งปิด socket ขาออกทุกตัว | การดึงหลักฐาน/เครื่องมือ, validators, guard ที่ไม่ใช้โมเดล, side effects, บัญชีการเรียกและงบ ไม่ใช่คุณภาพคำตอบ ไม่ใช่ Typhoon OCR |
| REPLAY | `run --mode replay --replay-from <run-id>` | แอปจริง + คำตอบผู้ให้บริการที่บันทึกไว้ (`replay.jsonl`) เล่นตามลำดับ ถ้าลำดับไม่ตรงหยุดทันที (`REPLAY_MISMATCH`) | parsing/UI/regression เท่านั้น ห้ามนับเป็นคะแนนหรือเวลาตอบ live |
| LIVE_FREE | `run --mode live-free --policy <ไฟล์นโยบายที่ตรวจแล้ว> ...` | แอปจริง + Typhoon/iApp จริง ผ่านเซิร์ฟเวอร์ทดลองแยก (`scripts/live_free_server.py`) | ผลคำตอบจริงของรุ่นนี้ แต่ยังต้องให้คนตรวจความถูกต้องทางเนื้อหา |

ตัวรัน offline ไม่เปิดเครือข่ายแบบเงียบ ๆ: `offline_check.py` ยังแทน `socket.connect`/`create_connection`/`getaddrinfo` ด้วยฟังก์ชันที่ raise
และ `tests/test_free_first_harness.py::test_offline_runner_denies_outbound_network` ตรวจทุกครั้งที่รัน pytest ผ่าน offline runner

## 2. นโยบาย free-only (ปิดโดยค่าเริ่มต้น)

ตั้ง `FREE_ONLY_POLICY_PATH` ได้เฉพาะในเซิร์ฟเวอร์ทดลอง (ตัวรันตั้งเอง ไม่ต้องแก้ Render ENV) เมื่อเปิด
ทุกการเรียกใน `services/conversation_transport.post_json` ผ่าน `services/free_policy.py` **ก่อน** call cap, THB ledger และ network:

1. ต้องตรง (https host, path, model) ที่ระบุในนโยบายแบบตรงตัว ปลายทางอื่น เช่น Admin slot ที่เคยบันทึกไว้เป็น OpenRouter แบบเสียเงิน
   จะถูกปฏิเสธด้วย `free_policy_blocked` และไม่มี request ออกไป (redirect ไม่ถูก follow)
2. รายการนั้นต้องเป็น `VERIFIED_FREE_FOR_THIS_ACCOUNT` มี `verified_at` ไม่เกิน 7 วัน มี `evidence` และราคาเป็น 0
   ไม่ใช่ค่าศูนย์โดยปริยาย สถานะอื่นได้ `free_policy_unverified`
3. โควตากลางเก็บใน business database หนึ่งระเบียนต่อ run ทุก role และทุก process ใช้ร่วมกัน: อัตราต่อนาทีของแอป
   เพดาน text/OCR/decisions ต่อ run เวลา run สูงสุด และ decisions ต่อวันของ iApp เมื่อหน้าต่างนาทีเต็มจะ**รอ**ไม่เกิน 65 วินาที
   เมื่อถึงเพดานจะปฏิเสธด้วย `free_quota_exhausted` และนับการปฏิเสธไว้ resume แล้วยอดเดิมยังอยู่
4. iApp System One นับ decisions แบบเผื่อไว้ = จำนวนคำถาม × จำนวน label (ข้อความลูกค้า/คำตอบ 5 label เอกสาร 3 label)
   ไม่สมมติว่า 1 request = 1 decision จนกว่าจะยืนยันสัญญาของผู้ให้บริการ
5. ledger และ call cap ยังทำงานทุกครั้ง (`COST_LEDGER_ENABLED` ห้ามปิด) ค่า `observed_cost` เป็น null เพราะแอปมองไม่เห็นบิลจริง
   โค้ดรับประกันไม่ได้ว่าบิลภายนอกเป็นศูนย์ owner ต้องดู console ของผู้ให้บริการเอง

ค่าตั้งต้นในแม่แบบ (`eval/policies/free_only.example.json`) ตามข้อ 5 ของเอกสารเสริม: Typhoon text ไม่เกิน 30 ครั้ง/นาที, OCR 5 ครั้ง/นาที,
iApp 20 ครั้ง/นาที, ต่อ run ไม่เกิน 60 นาที 400 text 20 OCR 300 decisions, retry ต่อ logical call ไม่เกิน 2 และ concurrency 1
**ตัวเลขเหล่านี้เป็นข้อเสนอของงานนี้ ไม่ใช่เพดานของผู้ให้บริการ** และต้องไม่สูงกว่าโควตาจริงของบัญชี

## 3. Preflight (ไม่เรียก inference เลย)

```bash
python scripts/benchmark_labclear.py preflight --profile free-only --profile-letter C \
       --policy <reviewed-policy.json> --suite coursework --dry-run --json preflight.json
```

ตรวจ: candidate SHA และ working tree สะอาด, รูปแบบนโยบายและผู้ตรวจ/วันที่/บัญชี, `data_policy_reviewed`, สถานะฟรีของแต่ละ endpoint,
credentials มีอยู่ (บอกเฉพาะ present/missing), **effective slots** ที่เซิร์ฟเวอร์ทดลองจะใช้จริง (รันใน process สะอาด ไม่มี `.env`
ฐานข้อมูลชั่วคราว รวม Admin slot ที่บันทึก และ analyzer/composer ของโปรไฟล์ C) ต้องอยู่ในนโยบายทุกตัว และประมาณการโควตาแบบ worst case
(planner, writer + rewrite 1 ครั้ง, reviewer + rewrite 1 ครั้ง, JSON retry) ไม่เกินเพดาน ผลมี `inference_calls_made: 0` เสมอ

`LLM_PROVIDER=typhoon` อย่างเดียวไม่รับประกันว่าทุก role ใช้ Typhoon: slot ที่ manager บันทึกใน `/staff → AI providers` มาก่อน ENV
(ดู [ENV_HANDOVER.md](ENV_HANDOVER.md)) เซิร์ฟเวอร์ทดลองจึงใช้ฐานข้อมูลใหม่ทุก run และ preflight ตรวจ slot ที่มีผลจริง

### ผล preflight ใน Cowork วันที่ 9 ต.ค. 2026

สถานะ **BLOCKED** หลักฐานอยู่ที่ [docs/evidence/free-first/live-free-preflight.json](../evidence/free-first/live-free-preflight.json):

- `FREE_STATUS_UNVERIFIED` ทั้ง 3 endpoint (Typhoon text, Typhoon OCR, iApp System One) เพราะยังไม่มีผู้ตรวจบัญชีจริง
- `NO_CREDENTIALS` ไม่มี `LABCLEAR_TRIAL_TYPHOON_API_KEY` และ `LABCLEAR_TRIAL_IAPP_API_KEY` ในสภาพแวดล้อมนี้ และไม่ได้ขอ key ทางแชต
- `POLICY_NOT_REVIEWED` และ `DATA_POLICY_NOT_REVIEWED` ในแม่แบบ
- ในรอบนี้เครื่องมือค้นเว็บของ Cowork ใช้ไม่ได้ (WebSearch ถูกปิดสำหรับองค์กร, WebFetch ไม่ได้รับอนุญาตทันเวลา) จึง**ไม่ได้**ตรวจหน้า
  ราคา/rate limit/OCR path ของ Typhoon และ iApp ซ้ำ ตัวเลขในแม่แบบมาจากเอกสารเสริมของ owner [W01–W06] เท่านั้น

effective slots ที่ resolve ได้ (ไม่มี key) ตรงกับนโยบายทั้งหมด: llm, planner, advisor, explainer, reviewer → `api.opentyphoon.ai/v1/chat/completions`
`typhoon-v2.5-30b-a3b-instruct`; vision → path เดียวกัน model `typhoon-ocr`; guard → `api.iapp.co.th/v3/store/openthai/systemone`
เส้นทาง OCR นี้คือสิ่งที่ adapter เดิมเรียก (`report_reader_v2` → `conversation_transport.complete`) ไม่ได้เดาใหม่ owner ต้องยืนยันกับเอกสาร Typhoon OCR ก่อนทำเครื่องหมายว่าตรวจแล้ว

## 4. Runbook ให้ owner รันบนเครื่องของตนเอง

1. Checkout commit ของ candidate (ดู `MANIFEST-SHA256.txt` ในชุดส่งมอบ) ตรวจว่า `git status` สะอาด
2. `python -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt`
3. คัดลอก `eval/policies/free_only.example.json` เป็นไฟล์นอก repository เช่น `~/labclear-policy.json` แล้วกรอก:
   `reviewed_by`, `reviewed_at`, `account_label` (ชื่อเรียกบัญชี ไม่ใช่ key), `data_policy_reviewed: true`
   และในแต่ละ endpoint `price_status: VERIFIED_FREE_FOR_THIS_ACCOUNT`, `verified_at` (วันนี้), `evidence` (เช่น หน้าราคาและหน้าบัญชีที่ดูเมื่อใด)
   **ทำเฉพาะ endpoint ที่ตรวจแล้วว่าบัญชีนี้ใช้ฟรีจริง** ถ้าไม่แน่ใจให้คงสถานะเดิม แล้ว preflight จะหยุดเอง
4. ใส่ key ใน environment ของ shell ที่จะรันเท่านั้น (ไม่เขียนลงไฟล์ใน repo ไม่ส่งในแชต):
   `export LABCLEAR_TRIAL_TYPHOON_API_KEY=...` และ `export LABCLEAR_TRIAL_IAPP_API_KEY=...`
5. `python scripts/benchmark_labclear.py preflight --profile-letter C --policy ~/labclear-policy.json --suite smoke --dry-run`
   ต้องได้ `PASS`
6. Smoke ก่อน: `python scripts/benchmark_labclear.py run --mode live-free --suite smoke --profile C --policy ~/labclear-policy.json --record-replay`
7. ถ้า smoke ผ่าน: `run --mode live-free --suite coursework --profile A` แล้ว `--profile B` และ `--profile C` (A/B/C ตามข้อ 11 ของเอกสารเสริม
   เปลี่ยนครั้งละตัวแปร) ระวังโควตาต่อวันของ iApp: 20 กรณีใช้ decisions ประมาณ 230 ต่อโปรไฟล์แบบ worst case
   สามโปรไฟล์ในวันเดียวอาจเกิน 1,000 ต่อวัน ให้ resume วันถัดไปแทนการเปลี่ยน key
8. ถ้าหยุดกลางทาง: `python scripts/benchmark_labclear.py resume --run-id <run-id>` (ยอดโควตาและฐานข้อมูลทดลองอยู่ใน `eval_runs/<run-id>/trial-state`)
9. เทียบ: `python scripts/benchmark_labclear.py compare --before <A> --after <B>` และ `report --run-id <id>`
10. ส่งคำตอบให้ผู้ตรวจที่เหมาะสม (ผู้มีคุณสมบัติทางคลินิกสำหรับ entailment/clinical scope และผู้อ่านไทยที่ไม่ใช่บุคลากรแพทย์สำหรับความเข้าใจ)
    กรอก `human_verdict` เอง script ไม่ตัดสินผ่านทางคลินิก
11. ลบ key ออกจาก shell หลังรัน (`unset ...`) โฟลเดอร์ `eval_runs/` อยู่ใน `.gitignore` คัดเฉพาะผลที่จะใช้ไปไว้ใน `docs/evidence/`

สิ่งที่ห้ามทำ: ปิด ledger/guards, ตั้งราคาศูนย์ให้รายการที่ยังไม่ตรวจ, ใช้ key อื่นเพื่อหลบโควตา, ชี้ `--base` ไปที่ production
(LIVE_FREE ไม่รับ `--base` เลย ตัวรันเปิดเซิร์ฟเวอร์ทดลองบน 127.0.0.1 เอง), retry จนเจอคำตอบที่ผ่านแล้วเก็บเฉพาะครั้งนั้น
(ตัวรันเก็บทุก attempt ใน `raw.jsonl`)

## 5. แหล่งข้อมูล

- เอกสารเสริมของ owner: `LABCLEAR_FREE_FIRST_BENCHMARK_ADDENDUM_TH.md` และ `LABCLEAR_COURSEWORK_BENCHMARK_SPEC_TH.md` (r1, 9 ต.ค. 2026, ZIP SHA ใน MANIFEST.json ของชุดนั้น)
- [W01–W06] ตามเอกสารเสริม: docs.opentyphoon.ai (free tier, rate limits, models, OCR/quickstart), iapp.co.th (OpenThai-SystemOne) — ไม่ได้เปิดซ้ำในรอบนี้
- โค้ด: `services/free_policy.py`, `services/conversation_transport.py`, `scripts/live_free_server.py`, `scripts/benchmark_labclear.py`,
  `eval/policies/free_only.example.json`, `eval/policies/free_only.offline.json`
