# LabClear 4.0.0 — ตามความเห็น CEO 5 ข้อ

วันที่ 8 ตุลาคม 2569 · ต่อจาก 3.1.0 (`3cf9076`) · เอกสารนี้คือข้อเท็จจริงของรุ่นนี้ ใช้อ้างอิงในรายงาน สไลด์ และคู่มือ

## สรุปสั้น

| ข้อ | ความเห็น CEO | สิ่งที่ทำในรุ่นนี้ | หลักฐาน |
|---|---|---|---|
| 1 | แหล่งอ้างอิงน้อยและเจาะจงบางโรงพยาบาล ให้เพิ่มการ upload เอกสารเฉพาะโรงพยาบาลในกลุ่มลูกค้าองค์กร | ฐานความรู้สาธารณะจาก 58 เป็น **135 รายการ จาก 24 ผู้เผยแพร่** (หน่วยงานรัฐไทย 5, สมาคมวิชาชีพไทย 13, ห้องแล็บโรงพยาบาลไทย 49, หน่วยงานสากล 27, แหล่งอ้างอิงสากล 41) และระบบ **เอกสารอ้างอิงขององค์กร**: องค์กร/โรงพยาบาลมีรหัสเข้าร่วม ผู้ดูแลองค์กรอัปโหลด PDF/DOCX/TXT/MD เจ้าหน้าที่ LabClear ตรวจก่อนเปิดใช้ แชตของสมาชิกค้นและอ้างอิงเอกสารนั้นโดยระบุชื่อองค์กร | `knowledge/`, `services/org_knowledge.py`, `routers/org.py`, `tests/test_release_400.py` |
| 2 | ถ้าไม่ได้ Log in ระบบจะไม่เก็บประวัติเมื่อ Refresh | ผู้ใช้เลือก **ล้างทุกครั้งที่ Refresh** (เน้นความเป็นส่วนตัว) จึงคงพฤติกรรมนี้และทำให้ชัดและแน่นขึ้น: token อยู่ในหน่วยความจำของหน้าเท่านั้น, beacon ลบข้อมูลใน RAM ของเซิร์ฟเวอร์ทันทีเมื่อปิด/รีเฟรช, หน้า bfcache ถูกโหลดใหม่, แถบแจ้ง "โหมดผู้เยี่ยมชม" ตลอดเวลา, เบราว์เซอร์ถามก่อนออกจากหน้าเมื่อมีข้อความ, และตอนเข้าสู่ระบบเลือก "เก็บแชตนี้ไว้ในบัญชี" ได้ | `web/lib/api/client.ts`, `web/components/chat/guest.tsx`, `routers/business.py` (`adopt_guest_chat`), UAT R4-03/R4-04 |
| 3 | ย้ายจาก Render ไป Cloudflare (โดเมนที่ทีมซื้อไว้) | Worker `labclear-web` (Next.js ผ่าน OpenNext) รับทุก request บนโดเมนเดียว ส่ง `/api/*` และ `/health` ไปยัง Worker `labclear-api` ผ่าน service binding ซึ่งรัน FastAPI ใน **Cloudflare Container** (Workers Paid USD 5/เดือน) ฐานข้อมูล PostgreSQL ภายนอก (เช่น Neon) ผ่าน `DATABASE_URL` ตั้งโดเมนด้วย `npm run cf:domain -- <โดเมน>` มีสคริปต์ deploy และ GitHub Actions | `web/wrangler.jsonc`, `web/worker.ts`, `deploy/cloudflare/`, `scripts/deploy-cloudflare.sh`, `.github/workflows/deploy-cloudflare.yml`, `docs/deploy/cloudflare.md` |
| 4 | ใช้ OpenRouter key ของทีมเป็นหลัก เลือกโมเดลถูก ดี เร็ว งบ API USD 10 พิจารณา embedding | ทุกส่วนใช้ **OpenRouter key เดียว**: planner `qwen/qwen3-30b-a3b-instruct-2507`, ผู้เขียนคำตอบ (Advisor/Explainer) และ OCR `google/gemini-3.1-flash-lite` (ปิด reasoning), reviewer และ safety classifier `openai/gpt-4.1-mini`, embedding `qwen/qwen3-embedding-8b` (ตัดเหลือ 1024 มิติ เก็บใน DB สร้างอัตโนมัติ) ตรวจความปลอดภัยขาเข้าพร้อม planner และขาออกพร้อม reviewer, ข้าม reviewer สำหรับคำทักทาย, routing เลือก endpoint ที่เร็วที่สุดภายใต้เพดานราคาและ ZDR งบในระบบ 360 บาท (USD 10 ที่ 36 บาท/USD) | `config.py`, `services/providers.py`, `services/business_agent.py`, `services/conversation_guard.py`, `services/semantic_search.py` |
| 5 | หน้าเว็บเน้นภาษาไทย ใช้ Next/React/Three ได้ ให้เด่น เข้าใจง่าย มีลูกเล่น | ย้ายทั้งเว็บไป **Next.js 16 + React 19 + React Three Fiber** ภาษาไทยเป็นค่าเริ่มต้น (สลับ EN ได้, ข้อความแปลไทย 2,000+ รายการ) คงดีไซน์เดิมที่ owner ชอบ หน้าแรกมี DNA helix 3 มิติที่ประกอบตัวจากอนุภาค, รายงานผลตัวอย่างที่กดดูคำอธิบายพร้อมแหล่งอ้างอิงได้, ขั้นตอนตรวจ 5 ชั้นก่อนตอบ, แหล่งอ้างอิงแยกตามประเภท | `web/` |

## สถาปัตยกรรม 4.0.0

```
ผู้ใช้ (เบราว์เซอร์) ──HTTPS──▶ Cloudflare: Worker labclear-web (โดเมนของทีม)
                                   ├─ หน้าเว็บ: Next.js (OpenNext) — /, /packages, /sources, /app, /staff …
                                   └─ /api/*, /health ──service binding──▶ Worker labclear-api
                                                                            └─ Cloudflare Container: FastAPI (Python 3.12, 1 instance)
                                                                                 ├─ PostgreSQL ภายนอก (Fernet-encrypted rows)
                                                                                 ├─ OpenRouter: Qwen3 30B · Gemini 3.1 Flash Lite · GPT-4.1 mini · Qwen3 Embedding 8B
                                                                                 └─ ฐานความรู้ 135 รายการ (BM25 + vectors) + เอกสารองค์กรที่ผ่านการตรวจ (BM25)
```

- หน้าเว็บสาธารณะเป็น server component อ่าน `/api/business/site/*` (ไม่มีข้อมูลส่วนบุคคล) ถ้า container ยังไม่ตื่นภายใน 2.5 วินาที ใช้ข้อมูล seed ที่ bundle ไว้ หน้าเว็บจึงไม่ค้าง
- แชต จอง รายงาน และ staff desk เป็น client component เรียก API เดิมแบบ same-origin (cookie `labclear_session` แบบ httpOnly + CSRF header) ขั้นตอนของแชตส่งแบบ NDJSON ทีละบรรทัด
- FastAPI ไม่เปลี่ยนสัญญา API เดิม เพิ่ม `routers/org.py` และ `routers/public.py`; หน้า Jinja เดิมยังอยู่ในโค้ดแต่ไม่ถูก route จาก Cloudflare

## ข้อความ 1 ข้อความเดินทางอย่างไร (4.0.0)

1. เบราว์เซอร์ POST `/api/business/chat` (Accept: application/x-ndjson) → Worker web → service binding → container
2. ตรวจ session/CSRF/origin/rate limit; บันทึกข้อความ (บัญชี → PostgreSQL, ผู้เยี่ยมชม → RAM ชั่วคราว)
3. ตรวจรูปแบบการโจมตีในเครื่อง (regex) — ถ้าเจอ หยุดโดยไม่เรียกโมเดลใด
4. **พร้อมกัน**: safety classifier ขาเข้า (GPT-4.1 mini) และ planner (Qwen3 30B) — ใช้แผนเฉพาะเมื่อข้อความปลอดภัย
5. ค้นความรู้: BM25 + vector (ถ้ามี index) บนฐานสาธารณะ และ BM25 บนเอกสารขององค์กรที่ผู้ใช้เลือก
6. ผู้เขียนคำตอบตามบทบาท (Gemini 3.1 Flash Lite) เขียน JSON พร้อม citation
7. Python ตรวจ citation, ค่าผลตรวจ, ราคา, ขอบเขตบทบาท (แก้ได้ 1 รอบ)
8. **พร้อมกัน**: reviewer (GPT-4.1 mini) และ safety classifier ขาออก — ข้าม reviewer เมื่อเป็นคำทักทาย/ถามกลับที่ไม่มีข้อเท็จจริงหรือแหล่งอ้างอิง
9. บันทึกคำตอบ แหล่งอ้างอิง และขั้นตอน แล้วส่งผลลัพธ์บรรทัดสุดท้าย

ทุกการเรียกโมเดลผ่านเพดานจำนวนครั้ง (`CLOUD_CALL_LIMIT`) และบัญชีค่าใช้จ่ายบาท (`PROJECT_BUDGET_THB`) ก่อนเสมอ ล้มเหลวแล้วหยุด (fail closed)

## ค่าใช้จ่ายโดยประมาณต่อคำตอบ (ราคา OpenRouter snapshot 7 ต.ค. 2569)

| ขั้น | โมเดล | สมมติ tokens (เข้า/ออก) | USD |
|---|---|---|---|
| Planner | Qwen3 30B A3B (0.048/0.193 ต่อล้าน) | 7,000 / 300 | 0.0004 |
| เขียนคำตอบ | Gemini 3.1 Flash Lite (0.25/1.50) | 6,000 / 1,200 | 0.0033 |
| Reviewer | GPT-4.1 mini (0.40/1.60) | 7,000 / 50 | 0.0029 |
| Safety ×2 | GPT-4.1 mini | 1,500 / 10 ต่อครั้ง | 0.0012 |
| Embedding query | Qwen3 Embedding 8B (0.01) | ~30 | ~0 |
| **รวม** | | | **≈ 0.008** |

งบ USD 10 ≈ 1,250 คำตอบ (คำทักทายถูกกว่าเพราะไม่มี reviewer) อ่านใบผลตรวจ 1 หน้า ≈ USD 0.002 + คำอธิบาย ≈ 0.008 สร้าง vector index ครั้งเดียว ≈ 60k tokens (< USD 0.001) ตัวเลขเป็นสมมติฐาน ต้องยืนยันด้วย usage จริง; ledger ในระบบใช้ราคาบาทที่ปัดขึ้นและหยุดเมื่อครบ 360 บาท

เหตุผลการเลือก: Gemini Flash Lite เป็นตระกูลที่เร็วและภาษาไทยดี ราคาถูก รองรับภาพจึงใช้เป็น OCR ด้วย; Qwen3 30B A3B เป็น MoE ที่ active 3B ตอบ JSON สั้นได้เร็วและถูกที่สุด; GPT-4.1 mini เป็นโมเดลต่างตระกูลสำหรับตรวจทานและจัดประเภทความปลอดภัย ซึ่งต่างจาก Llama Guard ตรงที่กำหนดได้ว่าการอธิบายช่วงอ้างอิงบนใบผลถือว่าปลอดภัย; Qwen3 Embedding 8B ราคาต่ำสุดในกลุ่มและรองรับหลายภาษา

## สิ่งที่ตรวจแล้ว

| การตรวจ | ผล |
|---|---|
| Python tests (`python -m pytest -q`) | 261 ผ่าน (รวม 11 ข้อใหม่ใน `tests/test_release_400.py`) |
| Browser UAT บน Next.js (`cd web && npm run uat`) | 51 สถานการณ์ — ดู `docs/evidence/release-4.0.0/uat.json` |
| Type check + ภาษาไทยครบ (`npx tsc --noEmit`, `npm run i18n:check`) | ผ่าน |
| `opennextjs-cloudflare build` + `wrangler dev` บน worker ที่ build แล้ว | หน้าเว็บ, `/api` ผ่าน worker, แชตแบบ stream, ล้างแชตผู้เยี่ยมชมเมื่อรีเฟรช ทำงาน |
| `wrangler deploy --dry-run` ทั้งสอง worker | ผ่าน (container ใช้ `--containers-rollout=none` เพราะเครื่องนี้ดึง base image จาก Docker Hub ไม่ได้) |

## สิ่งที่ยังไม่ได้ตรวจ (ต้องทำบนบัญชีจริงของทีม)

- ยังไม่ได้เรียก OpenRouter จริง (ไม่มีคีย์ในสภาพแวดล้อมนี้) — คุณภาพภาษาไทย, JSON, OCR, ความเร็วจริง และราคาจริงต้องวัดด้วย `scripts/course_eval.py` หลัง deploy
- ยังไม่ได้ build Docker image และยังไม่ได้ deploy ขึ้น Cloudflare จริง (ไม่มีสิทธิ์เข้าบัญชีทีม)
- ลิงก์ของแหล่งอ้างอิงใหม่ 77 รายการเขียนจากความรู้โดยไม่ได้เปิดเว็บ (ระบบนี้ไม่มีอินเทอร์เน็ต) ทุกรายการติดธง `verification.url_checked=false` ต้องรัน `python scripts/verify_sources.py` และให้คนอ่านเทียบ; ร่าง 13 รายการของโรงพยาบาลที่ไม่มีลิงก์บทความเฉพาะถูกแยกไว้ใน `knowledge/evidence/pending.json` และไม่ถูกค้น
- การทำงานจริงบนมือถือ (คีย์บอร์ดเสมือน) และ screen reader

## วิธีอัปเกรดจาก 3.x

1. นำเข้า bundle (ดู `README-TH.md` ในชุดส่งมอบ)
2. ติดตั้ง: `pip install -r requirements.txt` และ `cd web && npm ci`
3. รันในเครื่อง: `uvicorn main:app --port 8000` + `TRUSTED_ORIGINS=http://localhost:3000` แล้ว `cd web && npm run dev` เปิด http://localhost:3000
4. Deploy ตาม `docs/deploy/cloudflare.md`
5. หลัง deploy: Staff → AI providers → กด "ใช้ชุดโมเดล OpenRouter แบบเร็วและประหยัด" (ค่าที่เคยบันทึกไว้ใน DB มีลำดับเหนือ environment)
