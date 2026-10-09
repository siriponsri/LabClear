# LabClear 4.0.0-rc2 — รุ่นรวม (integration candidate)

วันที่ 9 ตุลาคม 2569 · branch `integration/labclear-4.0-rc1` · ฐานคือ Codex `main` `c970410` · commit ที่ทดสอบ `6f41a78` (ชุดเว็บรันซ้ำบน `a4aec07`)
rc2 = rc1 (`c8f3547`) + free-first harness และชุดทดสอบตามโจทย์ ผลของ rc1 เป็นประวัติ ไม่ใช่ผลของ rc2
เอกสารนี้คือข้อเท็จจริงของรุ่นรวม ใช้อ้างอิงในรายงานภาษาไทย รายงานเทคนิค สไลด์ และคู่มือ

> **สถานะ:** candidate สำหรับตรวจรับ ยังไม่ได้ merge เข้า `main` ยังไม่ได้ deploy ยังไม่ได้เรียก API ของผู้ให้บริการ AI จริง
> (LIVE_FREE ถูก preflight หยุดไว้: ไม่มี key และยังไม่มีผู้ยืนยันว่าบัญชี/endpoint ใช้ฟรี) และไม่ได้แก้ ENV ของ production
> flag ใหม่ทั้ง 6 ตัวของ Codex ยังเป็น `false` และนโยบาย free-only ไม่ทำงานจนกว่าจะตั้ง `FREE_ONLY_POLICY_PATH`
>
> เอกสารฉบับนี้เคยเป็น release notes ของ **Claude branch 4.0.0** (`release/4.0.0`, commit `95bf3d7`, 8 ต.ค. 2569) ซึ่งเลือก Cloudflare
> Workers Paid และชุดโมเดล OpenRouter แบบเร็ว รุ่นรวมนี้ไม่ได้ใช้ทางเลือกสองข้อนั้น ผลทดสอบของ Claude branch ย้ายไปไว้ในหัวข้อ
> [ประวัติ](#ประวัติ-claude-branch-400-ไม่ใช่ผลของรุ่นรวม) และ **ไม่ใช่ผลของรุ่นรวม**

## ที่มาของแต่ละส่วน

| ส่วน | มาจาก | สถานะในรุ่นรวม |
|---|---|---|
| Backend FastAPI, ความปลอดภัย (session, CSRF, origin, rate limit, Fernet), Guest privacy, model harness, runtime skills, เอกสารองค์กร, ลิงก์โรงพยาบาล, สัญญา API | Codex `main` | คงไว้ทั้งหมด เพิ่มเฉพาะส่วนต่อขยายด้านล่าง |
| ส่วนต่อขยาย backend | รุ่นรวม (ดัดแปลงจาก Claude) | `routers/public.py` อ่านอย่างเดียว, `services/trusted_origins.py` + `TRUSTED_ORIGINS` (ว่างเป็นค่าเริ่มต้น), `GET /api/business/site/membership`, `VERSION = 4.0.0-rc2` |
| Free-first harness (rc2) | รุ่นรวม ตามเอกสารเสริมของเจ้าของ | typed tools 8 ตัว (`services/agent_tools.py`), runtime skills เลือกตามงาน 0.3.0-offline, ภาพสังเคราะห์ผ่านการอัปโหลดเฉพาะ `APP_ENV=test`, นโยบาย free-only + โควตากลาง (`services/free_policy.py`), ตัวรัน `scripts/benchmark_labclear.py` และชุดข้อมูล `eval/coursework/` |
| เว็บ Next.js 16 + React 19 + React Three Fiber ภาษาไทยเป็นค่าเริ่มต้น สลับ EN | Claude 4.0.0 (`web/`) | นำมาใช้ คงดีไซน์และ component ปรับเฉพาะส่วนที่สัญญา API ของ Codex ต่างไป |
| Deploy | Codex (Render เดิม) | `render.yaml` ไม่เปลี่ยน เว็บ Next.js เป็นบริการ Render ตัวที่สองแบบเลือกได้ ([render-web.md](deploy/render-web.md)) |
| Cloudflare Workers Paid + Containers | Claude 4.0.0 (ต่อจากงานเตรียมใน 3.1.0) | **เลื่อนไว้ (deferred)** เก็บไฟล์ไว้ครบ ไม่ใช้ ไม่ทดสอบซ้ำ ([deploy/cloudflare/README.md](../deploy/cloudflare/README.md)) |
| ฐานความรู้ที่ระบบค้น | Codex | 58 รายการที่ตรวจแล้ว 4 ผู้เผยแพร่ (BM25) |
| ระเบียนความรู้ที่ Claude เขียนเพิ่ม | Claude 4.0.0 | 90 รายการ (77 จาก catalog + 13 จาก pending) ย้ายไป `knowledge/acquisition/claude_candidates_400.json` สถานะ `NOT_APPROVED` ไม่ถูกค้น |
| รายงานไทย รายงานเทคนิค สไลด์ แผนภาพ | Claude 4.0.0 | ปรับเนื้อหาให้ตรงรุ่นรวม (ไม่ได้สร้างชุดใหม่) |

## ความเห็น CEO 5 ข้อ ในรุ่นรวม

| ข้อ | ความเห็น CEO | ผลในรุ่นรวม | หลักฐาน |
|---|---|---|---|
| 1 | แหล่งอ้างอิงน้อยและเจาะจงบางโรงพยาบาล ให้เพิ่มการอัปโหลดเอกสารเฉพาะโรงพยาบาลสำหรับลูกค้าองค์กร | ฐานความรู้ที่ใช้งานคง **58 รายการที่ตรวจแล้ว** ส่วนแหล่งใหม่ (Codex: แหล่งการแพทย์ 15 รายการและลิงก์โรงพยาบาล 6 รายการ, Claude: 90 รายการ) อยู่ในคิว acquisition รอตรวจสิทธิ์และความถูกต้องทางคลินิก **เอกสารองค์กร** ใช้ระบบของ Codex: ผู้จัดการกำหนดสมาชิก (reader/editor) editor อัปโหลด TXT/MD UTF-8 ≤ 256 KiB เป็นร่าง ตรวจตัวอย่าง อนุมัติ/ไม่อนุมัติ ออกรุ่นใหม่ ถอน หรือลบ ค้นได้เป็นข้อความต้นฉบับเฉพาะในองค์กรเดียวกัน ผู้ช่วยใช้ข้อความที่อนุมัติแล้วก็ต่อเมื่อเปิด `ORG_REFERENCE_INFERENCE_ENABLED` และผู้ให้บริการทุกตัวที่รับข้อมูลผ่านการตั้งค่าแล้ว เพิ่มหน้า **ลิงก์แพ็กเกจจากเว็บไซต์โรงพยาบาล** (ข้อมูลของ Codex) ในเว็บ Next.js | `services/organization_sources.py`, `web/components/workspace/views/Orgs.tsx`, `web/app/(site)/hospital-links/`, UAT R4-05, R4-15 |
| 2 | ถ้าไม่ได้ Log in ระบบไม่เก็บประวัติเมื่อ Refresh | คงการล้างทุกครั้งที่ Refresh (ผู้ใช้เลือก) และใช้กฎของ Codex: **การเข้าสู่ระบบหรือสมัครบัญชีลบแชตผู้เยี่ยมชม** (ตัวเลือก "เก็บแชตนี้ไว้ในบัญชี" ของ Claude ไม่ได้นำมา) หน้าเว็บล้างแชตทันทีก่อนปิดหน้าต่างเข้าสู่ระบบ และทิ้งคำตอบ `/workspace` ที่ขอไว้ในนามผู้เยี่ยมชมเดิม | `web/lib/api/client.ts`, `web/components/workspace/Workspace.tsx`, UAT R4-02, R4-03, R4-04, UI-33 |
| 3 | ย้ายจาก Render ไป Cloudflare บนโดเมนของทีม | เจ้าของเปลี่ยนเป้าหมายกลับเป็น **Render เดิม** บริการ API ไม่เปลี่ยน เว็บ Next.js เป็นบริการที่สองที่ส่ง `/api` ต่อไปยัง API (API ต้องตั้ง `TRUSTED_ORIGINS` ให้ตรง origin ของเว็บ) Cloudflare Free ใช้เป็น DNS/proxy ได้ในอนาคต งาน Cloudflare Workers Paid เก็บไว้เป็นทางเลือก | `docs/deploy/render-web.md`, `deploy/render/web-service.example.yaml`, `scripts/offline_check.py boot` |
| 4 | ใช้ OpenRouter key ของทีม โมเดลถูก ดี เร็ว งบ USD 10 พิจารณา embedding | ใช้ model harness ของ Codex: ผู้จัดการเลือกผู้ให้บริการและโมเดลต่อ slot/agent (OpenRouter เป็นหนึ่งในตัวเลือก) บทบาทใหม่ Medical analyzer และ Thai composer **ปิดเป็นค่าเริ่มต้น** ต้องระบุโมเดลตรงตัว ราคาที่ตรวจแล้ว และรหัส endpoint ของ OpenRouter ที่ทบทวนแล้ว งบคงเพดาน **300 บาท** ของโครงการและเพดานจำนวนครั้ง embedding **เลื่อนไว้** จนกว่าจะมีผลเปรียบเทียบการค้นคืน ชุดโมเดล "เร็วและประหยัด" ของ Claude ไม่ได้นำมา rc2 ใช้ **Typhoon text/OCR + OpenThai-SystemOne** เป็น baseline แบบ free-first และพักโมเดล OpenRouter/embedding ไว้ (`free_first_benchmark` ใน registry) โดยไม่ลบ integration | `services/providers.py`, `services/model_harness.py`, `runtime_skills/model_registry.json`, `web/components/staff/views/AiProviders.tsx`, UAT R4-06 |
| 5 | หน้าเว็บเน้นภาษาไทย ใช้ Next/React/Three ให้เด่นและเข้าใจง่าย | ใช้เว็บ Next.js ของ Claude ทั้งหมด (หน้าแรก DNA helix 3 มิติ แชตแบบขั้นตอนสด พื้นที่ลูกค้า staff desk) ภาษาไทยเป็นค่าเริ่มต้น สลับ EN ได้ คำแปลไทย 2,297 ข้อความ (rc2 เพิ่ม 37) หน้า Jinja เดิมของ Codex และ landing preview (flag) ยังอยู่ใน API | `web/`, UAT R4-01, R4-13, R4-14 |

## สถาปัตยกรรมรุ่นรวม

```text
ผู้ใช้ (เบราว์เซอร์) ──HTTPS──▶ Render: labclear-web (Node 22, Next.js 16)   [บริการที่สอง เลือกได้]
                                  ├─ หน้าเว็บ /, /packages, /sources, /hospital-links, /app, /staff …
                                  └─ rewrite /api/*, /health ──HTTPS──▶ Render: labclear (Python 3.12, FastAPI ของ Codex)
                                                                          ├─ ตรวจ Origin: Host ของตัวเอง หรือ TRUSTED_ORIGINS ที่ตรงตัว
                                                                          ├─ Render PostgreSQL (rs_entities เข้ารหัส Fernet)
                                                                          ├─ ฐานความรู้ 58 รายการ (BM25) · เอกสารองค์กรเฉพาะสมาชิก (flag)
                                                                          ├─ คิว acquisition (ไม่ถูกค้น)
                                                                          └─ ผู้ให้บริการ AI ตาม slot: ค่าเริ่มต้น Typhoon · iApp SystemOne · Typhoon OCR
                                                                             ผ่าน PROVIDER_NETWORK_ENABLED, เพดานจำนวนครั้ง และบัญชี 300 บาท ก่อนทุกครั้ง
หน้า Jinja เดิม (/, /app, /staff ของ API) ยังใช้งานได้ที่บริการ API โดยตรง
Cloudflare Workers Paid: เลื่อนไว้ · Cloudflare Free DNS/proxy: อนาคต
```

## ข้อความ 1 ข้อความเดินทางอย่างไร (Codex pipeline)

1. เบราว์เซอร์ POST `/api/business/chat` (Accept: application/x-ndjson) ไปที่เว็บ แล้ว rewrite ไปยัง FastAPI
2. ตรวจ session/CSRF/origin/rate limit บันทึกข้อความ (บัญชี → PostgreSQL ผู้เยี่ยมชม → RAM ชั่วคราว)
3. ถ้าเปิดเอกสารองค์กร: ตรวจซ้ำว่าเอกสารส่วนตัวที่เคยใช้ในประวัติยังอนุมัติและยังเป็นขององค์กรเดิม ถ้าไม่ ตัดออกจาก context
4. ตรวจความปลอดภัยขาเข้า (regex แล้ว safety model) → planner เลือก action และบทบาท
5. ดึงข้อมูลผ่าน typed tools ตามสิทธิ์อ่านของบทบาท (catalog สาขา นโยบาย BM25 บนฐาน 58 รายการ แถวใบผลที่ยืนยัน) input แบบ strict มีเวลา/ขนาดจำกัด audit ใน `checks.tools` และถ้าเปิด `ORG_REFERENCE_INFERENCE_ENABLED` ค้นข้อความที่อนุมัติแล้วขององค์กร (ผู้ให้บริการทุกตัวที่รับข้อมูลต้องตั้งค่าแล้วและไม่ใช่ `:free`)
6. ผู้เขียนคำตอบตามบทบาทเขียน JSON พร้อม citation (ถ้าเปิด `RUNTIME_SKILLS_ENABLED` เพิ่มโมดูลคำสั่งภาษาไทยที่ตรวจ hash แล้ว เลือกตามบทบาท action ใบผล ชนิดหลักฐาน และเครื่องมือที่ใช้ รายงานใน `checks.skills` ถ้าเปิด `MEDICAL_HARNESS_ENABLED` และเป็นใบผลจำลองในระบบ ใช้ Medical analyzer + Thai composer)
7. Python ตรวจ citation ค่าผลตรวจ ราคา บทบาท (แก้ได้ 1 รอบ) → reviewer → ตรวจความปลอดภัยขาออก
8. บันทึกคำตอบ แหล่งอ้างอิง (รวม version/section/sha256 ของเอกสารองค์กร) และขั้นตอน แล้วส่งบรรทัดสุดท้าย

ทุกการเรียกโมเดลผ่าน `PROVIDER_NETWORK_ENABLED`, นโยบาย free-only เมื่อตั้งไว้ (host/path/โมเดลตรงรายการที่ตรวจแล้วและโควตายังเหลือ), เพดานจำนวนครั้ง (`CLOUD_CALL_LIMIT`, ค่าเริ่มต้น 200) และบัญชีบาท (`PROJECT_BUDGET_THB`, 300) ก่อนเสมอ ล้มเหลวแล้วหยุด (fail closed) รุ่นรวมไม่มีการตรวจขนานของ Claude branch

## งานของ Claude ที่นำมาใช้และที่ปรับ

| งานของ Claude 4.0.0 | ในรุ่นรวม |
|---|---|
| Design system, ฟอนต์ไทย, ธีมสว่าง/มืด, ตัวสลับ TH/EN, พจนานุกรมไทย | ใช้ตามเดิม เพิ่มคำแปล 174 ข้อความสำหรับส่วนที่ปรับ |
| หน้าแรก R3F DNA helix, หน้าแพ็กเกจ เปรียบเทียบ ศูนย์ ช่วยเหลือ ความเป็นส่วนตัว แหล่งอ้างอิง องค์กร | ใช้ตามเดิม แก้ข้อความเรื่องเอกสารองค์กร การเข้าสู่ระบบ และจำนวนแหล่งให้ตรง Codex |
| แชต (ขั้นตอนสด การ์ดค่า โปรเจกต์ dock) พื้นที่ลูกค้า staff desk | ใช้ตามเดิม ยกเว้นจุดที่ระบุด้านล่าง |
| เข้าสู่ระบบพร้อม "เก็บแชตนี้" | **เปลี่ยน**: ส่งเฉพาะ email/password แชตผู้เยี่ยมชมถูกลบ ล้างหน้าจอทันที และกันคำตอบเก่าจากตัวตนเดิม |
| My organization (รหัสเข้าร่วม PDF/DOCX staff ตรวจ) | **เขียนใหม่ตามสัญญา Codex** บนโครงหน้าและ class เดิม: สมาชิกจากผู้จัดการ, ร่าง/ตัวอย่าง/อนุมัติ/รุ่นใหม่/ถอน/ลบ, ค้นข้อความต้นฉบับ |
| Staff: Organizations + Reference document review | **แทนที่** ด้วย Organization membership (ผู้จัดการกำหนด reader/editor) เพราะ Codex ให้ editor ขององค์กรเป็นผู้ตรวจ หน้าตรวจเอกสารของ staff ไม่ได้นำมา |
| Staff: AI providers + ปุ่มชุดโมเดลเร็ว + แผงความพร้อม | **ปรับ**: 3 slot และ 6 agents, บทบาทใหม่ปิดเป็นค่าเริ่มต้น, ช่องรหัส endpoint, สถานะการตั้งค่า, รายการโมเดลที่พิจารณา (metadata) ไม่มีปุ่มชุดโมเดลเร็วและแผงความพร้อม (endpoint ไม่มีใน Codex) |
| ป้ายองค์กรในแชต (เลือกองค์กรต่อแชต) | **เปลี่ยน** เป็นป้ายแสดงสถานะ (ใช้กับผู้ช่วย / ค้นหาอย่างเดียว) เพราะ Codex ไม่มีการเลือกต่อแชต |
| `routers/public.py`, `TRUSTED_ORIGINS` | ดัดแปลงแบบต่อขยาย: เทียบ origin แบบตรงตัวทั้ง scheme/host/port, เพิ่ม `/features`, `/hospital-links`, `/membership` |
| `scripts/dev_mock_api.py`, UAT 51 สถานการณ์ | ปรับให้รันบน fixture ของ Codex แยกสภาพแวดล้อมและห้ามเชื่อมต่อออก UAT เป็น 53 สถานการณ์ + ชุด flag ปิด 5 สถานการณ์ |
| Backend อื่นของ Claude (`routers/org.py`, `org_knowledge.py`, keep-chat, ชุดโมเดลเร็ว, ตรวจขนาน, semantic search, ค่าเริ่มต้น OpenRouter) | **ไม่ได้นำมา** เพราะขัดกับ backend/security/สัญญา API ของ Codex ยังอยู่ใน `release/4.0.0` ใน bundle |

## Free-first harness และชุดทดสอบตามโจทย์ (rc2)

ทำตาม `LABCLEAR_FREE_FIRST_BENCHMARK_ADDENDUM_TH.md` และ `LABCLEAR_COURSEWORK_BENCHMARK_SPEC_TH.md` ของเจ้าของ (เอกสารข้อกำหนด ไม่ใช่โค้ด)
ส่วนที่เพิ่มทำงานในแอปตอนรับข้อความ ไม่ใช่ skill ของเครื่องมือเขียนโค้ด รายงานเต็ม: [COURSEWORK_BENCHMARK_REPORT_TH.md](ceo-upgrade/COURSEWORK_BENCHMARK_REPORT_TH.md)

| โหมด | ความหมาย | สถานะ |
|---|---|---|
| OFFLINE | แอปจริงทั้งเส้นทาง ผู้ให้บริการเป็นตัวแทนใน process (`httpx.MockTransport`) socket ขาออกถูกปิด OCR ตัวแทน = Tesseract | รันแล้ว |
| REPLAY | เล่นคำตอบที่บันทึกจาก OFFLINE ตามลำดับ ไม่ตรง = `REPLAY_MISMATCH` | รันแล้ว (ไม่ใช่ผล live) |
| LIVE_FREE | `scripts/live_free_server.py` + Typhoon text/OCR + iApp จริง เฉพาะข้อมูลสังเคราะห์ เมื่อ preflight ผ่าน | **ไม่ได้รัน** preflight `BLOCKED` |

| ผล (OFFLINE ตัวแทนผู้ให้บริการ ไม่ใช่คุณภาพโมเดล ไม่ใช่ผลทางคลินิก) | ค่า | run |
|---|---|---|
| 10 คำถาม + 5 ภาพ + 5 safety (โปรไฟล์ C, free-only แบบ offline) | รันครบ 20/20 ผ่านเกณฑ์ pipeline 15 ไม่ผ่าน 5 (ภาพที่ยืนยันค่าที่อ่านผิด) คนตรวจ `PENDING_REVIEW` | `G-C-free` |
| REPLAY ของ run เดียวกัน | 20/20 ตรงกัน | `G-C-replay` |
| ปรับปรุง 1: runtime skills ตามงาน (`599f407`) | เส้นทางที่ได้โมดูลผิด/ขาด 5/8 → 0/8 | `R1-C` → `R2-C` |
| ปรับปรุง 2: ภาพสังเคราะห์ผ่านการอัปโหลด (`4d75818`) | ภาพที่ไปถึงคำอธิบาย 0/5 → 5/5 | `R2-C` → `R3-C` |
| ปรับปรุง 3: free-only + โควตากลาง (`c082a05`) | การเรียกปลายทางเสียเงินจาก slot ค้าง 30 → 0 | `R3-Ctrap` → `R4-Ctrap` |

ไฟล์ผล: [docs/evidence/free-first/](evidence/free-first/README.md) · ขั้นตอน LIVE_FREE: [FREE_PROVIDER_PREFLIGHT.md](ceo-upgrade/FREE_PROVIDER_PREFLIGHT.md)

## สิ่งที่ตรวจแล้ว (rc2 commit `6f41a78`, เว็บ `a4aec07`)

ทุกการตรวจใช้ข้อมูลจำลอง ฐานข้อมูลชั่วคราว และตัวแทนโมเดล/OCR ไม่ได้เรียกผู้ให้บริการจริง รายละเอียด: [docs/evidence/integration-4.0-rc2/](evidence/integration-4.0-rc2/README.md)
`a4aec07` ต่างจาก `6f41a78` เฉพาะ API จำลองของ web UAT (`scripts/dev_mock_api.py`)

| การตรวจ | ผล |
|---|---|
| Python (`scripts/offline_check.py pytest`) | **328 ผ่าน** (Codex 265 + rc1 12 + rc2 51) |
| Browser เดิมของ Codex (`tests/browser/uat.cjs`) | **36/36** (หลังแก้ race ของการทดสอบ UI-33 ซึ่ง baseline ของ Codex ก็ไม่ผ่าน 1 ใน 2 รอบ) |
| Browser upgrade ของ Codex (`tests/browser/upgrade.cjs`) | **10/10** |
| Offline fixture matrix ของ Codex | **60/60** `LIVE_MODEL_EVALUATION=NOT_RUN` |
| Render entrypoint smoke | **PASS** 8 route |
| เว็บ: type check, i18n check, production build | ผ่าน (ไทย 2,297 ข้อความ, 16 routes) |
| Web UAT (`web/tests/uat.mjs`, flag ตาม fixture) | **53/53** ไม่มี browser error สามรอบบน `a4aec07` (สองรอบบน `6f41a78` ได้ 52/53: UI-22 500 จาก `socket hang up` ของ proxy เก็บผลไว้ทั้งหมด) |
| Web UAT flag ปิดทั้งหมด (`web/tests/uat-flags-off.mjs`) | **5/5** |

ผลของ rc1 (`c8f3547`: pytest 277, 36/36, 10/10, 60/60, 53/53, 5/5) อยู่ใน [integration-4.0-rc1](evidence/integration-4.0-rc1/README.md) เป็นประวัติ

## สิ่งที่ยังไม่ได้ตรวจหรือยังต้องทำ

| เรื่อง | สถานะ / ขั้นต่อไป |
|---|---|
| Merge และ deploy | เจ้าของตรวจรับ bundle แล้ว merge เข้า `main` เอง ตรวจ `/health` ว่า commit ตรง |
| บริการเว็บบน Render | ยังไม่ได้สร้าง ต้องตั้ง `API_ORIGIN` ที่เว็บ และ `TRUSTED_ORIGINS` ที่ API (เจ้าของแก้ ENV เอง) |
| Rate limit ผ่านเว็บ | API นับตาม IP ที่ต่อเข้ามา ผู้ใช้ทุกคนผ่านเว็บจึงใช้ bucket เดียวกัน ต้องออกแบบการเชื่อ `X-Forwarded-For` ก่อนใช้งานจริง |
| Google sign-in ผ่านเว็บ | ยังไม่ได้ตรวจ ปิดไว้จนกว่าจะทดสอบ |
| LIVE_FREE (Typhoon text/OCR + iApp จริง) | `NOT_RUN` preflight `BLOCKED` เจ้าของกรอกนโยบายที่ตรวจแล้ว ใส่ key ใน shell ของเครื่องที่รันเท่านั้น แล้วทำตาม runbook |
| การตรวจโดยคน และ holdout 5 กรณี | `PENDING_REVIEW` ทุกกรณี / holdout ยังไม่ได้รัน |
| เพดาน decisions ต่อ run | ชุด regression 28 กรณีต้องการ 330 decisions เกินเพดาน 300 ที่เสนอ ต้องแบ่งรัน iApp 20 ครั้ง/นาทีเป็นคอขวด |
| Keep-alive ระหว่าง Next.js กับ API | ถ้าวางเว็บหน้า API บน Render ให้พิจารณา `timeout_keep_alive` ของ uvicorn ใน `scripts/run_business.py` (ไม่ได้แก้ในรุ่นนี้) |
| OCR จริง, PostgreSQL production | `NOT_RUN` |
| flag ใหม่ 6 ตัว | ปิดอยู่ เปิดตามประตูของเจ้าของใน `docs/ceo-upgrade/MORNING_HANDOFF.md` |
| แหล่งความรู้ใหม่ | Codex 15 + 6 รายการ และ Claude 90 รายการ รอตรวจสิทธิ์และทางคลินิก ไม่ถูกค้น |
| Embeddings, Clef, ตัวจัดการ quota | เลื่อนไว้ตาม Codex |
| Cloudflare | เลื่อนไว้ ค่า `vars` ใน wrangler ต้องทำใหม่ตาม ENV ของ Codex ก่อนใช้ |
| มือถือจริงและ screen reader | ยังไม่ได้ตรวจ |
| Report ใน Word | สร้างด้วยสคริปต์ render ด้วย LibreOffice ต้องเปิดใน Word อัปเดตฟิลด์และตรวจการตัดคำ |

## วิธีรันในเครื่อง (ข้อมูลจำลอง ไม่เรียกโมเดลจริง)

```bash
pip install -r requirements-dev.txt && npm ci            # root: Playwright สำหรับชุดทดสอบของ Codex
python scripts/offline_check.py pytest -q                # 328 tests
python scripts/dev_mock_api.py                            # API จริง + ตัวแทนโมเดล ที่ 127.0.0.1:8000
cd web && npm ci && npm run build && API_ORIGIN=http://127.0.0.1:8000 npm run start:render
node tests/uat.mjs                                        # web UAT 53 สถานการณ์
python scripts/benchmark_labclear.py run --mode offline --suite coursework --profile C --free-only   # ต้องมี Tesseract
```

## ประวัติ: Claude branch 4.0.0 (ไม่ใช่ผลของรุ่นรวม)

ส่วนนี้คงไว้เพื่อความโปร่งใส ทุกอย่างเป็นของ `release/4.0.0` commit `95bf3d7` (8 ต.ค. 2569) บน 3.1.0 (`3cf9076`) ไม่ได้ทดสอบซ้ำกับรุ่นรวม

| เรื่อง | ผลบน Claude branch |
|---|---|
| Python tests | 261 ผ่าน (backend ของ Claude ที่ไม่ได้นำมา) |
| Browser UAT | 51/51 บน OpenNext production build ผ่าน `wrangler dev` |
| Cloudflare | `opennextjs-cloudflare build`, `wrangler dev`, `wrangler deploy --dry-run` ทั้งสอง worker (container ใช้ `--containers-rollout=none`) ไม่ได้ build Docker image และไม่ได้ deploy จริง |
| ฐานความรู้ | 135 รายการจาก 24 ผู้เผยแพร่ (77 รายการเขียนโดยไม่ได้เปิดเว็บ) |
| ชุดโมเดล OpenRouter และค่าใช้จ่ายประมาณ USD 0.008 ต่อคำตอบ | เป็นสมมติฐานจากราคา snapshot 7 ต.ค. 2569 ไม่เคยเรียกจริง ไม่ได้ใช้ในรุ่นรวม |
