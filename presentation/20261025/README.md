# LabClear — งานนำเสนอ 25 ต.ค. 2026

สไลด์ HTML 16:9 จำนวน 21 หน้า + ภาคผนวก 12 หน้า กับหน้าบทพูดแยก ทำตาม `docs/presentation/LABCLEAR_PRESENTATION_BRIEF_TH.md` โดยคง 8 section และเวลาเดิม (เนื้อหา 9:00 · สำรอง 1:00 · Q&A 5:00) แต่ละหน้ามีประเด็นเดียว คลิกไม่เกิน 1 ครั้ง ภาพเคลื่อนไหวหลักเล่นเองตอนเปิดหน้า บนสไลด์ไม่มีชื่อหรือรหัสผู้พูด ชื่อผู้พูดอยู่ในหน้าบทพูดเท่านั้น

```
presentation/20261025/
├─ slides/            ← Vercel project labclear-presentation-20261025
│  ├─ index.html      สไลด์หลัก 21 หน้า + ภาคผนวก 12 หน้า
│  ├─ backup.html     หน้าสำรอง Q&A (กด Q จากสไลด์)
│  ├─ css/ js/ fonts/ img/
│  └─ vercel.json
├─ script/            ← Vercel project labclear-script-20261025
│  ├─ SPEAKER_SCRIPT_TH.md   ไฟล์บทพูด (แก้ไฟล์นี้ไฟล์เดียว)
│  ├─ index.html + css/ js/ fonts/
│  └─ vercel.json
├─ SOURCE_MAP.md      ตัวเลข/ภาพ → ไฟล์ต้นทาง, crop, hash
└─ README.md
```

ไม่มี build step ไม่มี CDN ไม่มี API call ทุกไฟล์อยู่ในโฟลเดอร์ (ฟอนต์ IBM Plex Sans Thai + Geist จาก `static/fonts/`) `vercel.json` ตั้ง CSP ให้โหลดได้เฉพาะไฟล์ของตัวเอง และใส่ `noindex`

## สไลด์

| # | Section | หัวข้อ | คลิกในหน้า |
| --- | --- | --- | --- |
| 1–2 | Overview | LabClear · Five Chapters, One Line | 0 · 0 |
| 3–5 | Business | One Source for Every Answer · Users & Responsibility · Service Scope | 0 · 1 · 0 |
| 6–8 | Knowledge | Two Kinds of Data · Medical Reference Library · Traceable Sources (PDF DR-019) | 0 · 0 · 1 |
| 9–12 | Functions | Service Information · Appointment & Handoff · Report Review · Sources & Explainability | 0 · 0 · 0 · 0 |
| 13–14 | Architecture | One Service, Clear Boundaries · Plan, Search, Cite (RAG ของ LabClear) | 1 · 1 |
| 15 | Processing Flow | Retrieve, Write, Check | 1 |
| 16–18 | Evaluation | Recorded Evaluation · Real Cases (Q05 / Q07) · Real Cases (I04 / S01) | 0 · 1 · 1 |
| 19–21 | Conclusion | Project Outcome · Next Steps · Thank You (หน้าปิด) | 0 · 0 · 0 |
| 22–33 | Appendix (Q&A) | Index · Real Catalog Records · One Chat Turn · AI Roles and Prompts · How Retrieval Works · RAG Real Case Q08 · Three Real Outcomes · Code Map · Uploading .md Sources · Company Harness · Safety and Data Boundaries · What Is Not Measured Yet | 0 |

จากหน้าแรกถึงหน้า Thank You กด 27 ครั้ง ตรงกับป้าย `[คลิก 1]`–`[คลิก 27]` ในบทพูด ภาคผนวกไม่นับในเวลา ใช้ตอน Q&A: กด → ต่อจากหน้า Thank You จะเปิดหน้าสารบัญ (สไลด์ 22) คลิกหัวข้อเพื่อไปหน้านั้น และกด ↩ Index (มุมซ้ายล่าง) เพื่อกลับ ชื่อไฟล์บนภาคผนวกเป็นลิงก์ไป GitHub ที่ commit `a9fc0b3` ตรงบรรทัด

**Motion:** ตอนเปลี่ยนบทมีแผ่นสีม่วงขึ้นชื่อบทราว 1 วินาที และจุดบนเส้นเรื่องด้านบนเลื่อนไปบทใหม่ ภายในหน้าใช้ Web Animations API ของเบราว์เซอร์ (ไม่มี library เพิ่ม) เช่น เส้นวาดตัวเอง กรอบไฮไลต์ไล่บนภาพหน้าจอ จุดวิ่งตามขั้นตอน ตราประทับ PASS / FAIL ทุกอย่างเลือกให้ใหญ่และช้าพอที่จะเห็นผ่าน Teams สถานะสุดท้ายของทุกชิ้นคือ CSS ปกติ ถ้า motion ไม่ทำงาน เนื้อหาก็ยังครบ

## Deploy บน Vercel

ทั้ง 2 project ตั้ง Root Directory ไว้แล้ว (`presentation/20261025/slides` และ `presentation/20261025/script`) · Framework Preset = Other · ไม่มี build

deploy ด้วย CLI จากสำเนาที่มีเฉพาะโฟลเดอร์ `presentation/20261025/` เพื่อไม่ให้ไฟล์อื่นใน repo ติดขึ้นไป

(แนะนำ) Settings → Deployment Protection ถ้าไม่อยากให้คนนอกเปิดบทพูดหรือภาพ PDF ศิริราช

## นำเสนอบน Microsoft Teams

- ศิริพลเปิดลิงก์สไลด์ใน Chrome/Edge → กด **F** เต็มจอ → Teams แชร์แบบ **Screen** (ทั้งจอ)
- วัชรินทร์เปิดลิงก์บทพูดบนมือถือ กดปุ่ม **วัชรินทร์** เพื่อเน้นบทตัวเอง และกด **เริ่ม** ที่นาฬิกาตอนพูดคำแรก
- ศิริพลกดทุกคลิก (27 คลิก) ตามป้าย `[คลิก n]` ในบทพูด
- ถ้าอาจารย์ขอดูโค้ด กด → ต่อจากหน้าขอบคุณ หรือกด **9** แล้วคลิกชื่อไฟล์บนสไลด์เพื่อเปิด GitHub

| คีย์ | ทำอะไร |
| --- | --- |
| → ↓ Space PgDn Enter | คลิกถัดไป (ใช้ presenter clicker ได้) |
| ← ↑ PgUp Backspace | ย้อนกลับ |
| G | ภาพรวมทุกสไลด์ จัดกลุ่มตามบท พิมพ์ค้นหาเลขหรือหัวข้อ แล้ว Enter หรือคลิก |
| เลข + Enter | ไปสไลด์นั้นทันที เช่น 1 7 Enter = สไลด์ 17 (Backspace ลบ · Esc ยกเลิก) |
| Home / End | หน้าแรก / หน้าสุดท้าย |
| F | เต็มจอ (ถ้าเบราว์เซอร์ไม่ยอม ใช้ F11) |
| L | เลเซอร์พอยน์เตอร์ (จุดแดงตามเมาส์) |
| Q | หน้าสำรอง Q&A · Esc เพื่อกลับ |
| H หรือ ? | คีย์ลัด |

ลิงก์ตรงไปหน้าได้ เช่น `…/#/16` หรือ `…/#/16.1` (หน้า 16 หลังคลิก)

**ตอนอาจารย์ขอดูสไลด์เดิม:** กด **G** จะเห็นทุกสไลด์เป็นภาพย่อ แบ่งตามบท (Overview, Business, Knowledge, Functions, Architecture, Evaluation, Conclusion, Appendix) พิมพ์เลขหน้าหรือคำ เช่น `5`, `business`, `harness`, `น้ำตาล` สไลด์ที่หัวข้อตรงจะเด่น สไลด์ที่มีคำนั้นในเนื้อหาจะจางลง เลือกด้วยลูกศรแล้ว Enter หรือคลิก ถ้ารู้เลขหน้าอยู่แล้ว พิมพ์เลขแล้ว Enter ได้เลยโดยไม่ต้องเปิดภาพรวม ปุ่ม ▦ ในแถบควบคุมก็เปิดภาพรวมได้

## แก้บทพูดโดยไม่เขียนโค้ด

แก้ `script/SPEAKER_SCRIPT_TH.md` บนหน้าเว็บ GitHub (ปุ่มดินสอ) แล้ว Commit จากนั้น deploy ใหม่ รูปแบบบรรทัด: `A:` บทวัชรินทร์ · `B:` บทศิริพล · `[คลิก n]` จุดกด · `> TRANSITION:` ประโยคเชื่อม · `**คำ**` คำเน้น

ถ้าแก้ลำดับหรือจำนวนคลิกในบท ต้องให้ตรงกับสไลด์ รวม 27 ครั้ง

## เปิดดูในเครื่อง

```bash
python -m http.server 8811 --directory presentation/20261025/slides
```

เปิด `http://localhost:8811` · หน้าบทพูดต้องเปิดผ่าน server เพราะโหลดไฟล์ .md

- `?still` แสดงทุกการเคลื่อนไหวแบบทันที (สำหรับเครื่องช้าหรือถ่ายภาพ)
- จอแคบกว่า 760px หรือแนวตั้ง จะเป็นโหมดอ่านที่ไหลลง
- พิมพ์ / Save as PDF ได้ 1 หน้าต่อแผ่น แนวนอน ทุกขั้นเปิดครบ

## สิ่งที่ตรวจแล้ว (24 ต.ค. 2026)

- ตัวเลขผลทดสอบคำนวณซ้ำจาก `TEST_RESULTS.csv` ตรงกับ brief · ตัวเลขคลังนับจาก `catalog.json` · hash ของ DR-019.pdf ตรงกับ record
- กรณีจริงในภาคผนวก (Q08, EXP-UNCLEAR-07, S03) อ่านจาก `cases.jsonl` ของรอบ 12 ต.ค. และค้น "HbA1c" ซ้ำแบบ offline ได้ 6 แหล่งตรงกับรอบจริง 6/6
- ข้อเท็จจริงเรื่อง agent, prompt, harness และ safety ในภาคผนวกตรวจกับโค้ดที่ commit `a9fc0b3` (ไม่ได้รันแอปหรือเรียก provider)
- คะแนน BM25 บนสไลด์ 14 (query "glucose") คำนวณซ้ำด้วยสูตรเดียวกับ `lexical()` บน `catalog.json` ทั้ง 148 records
- ตำแหน่งโค้ดในสไลด์ 14 และภาคผนวกอ่านจาก commit `a9fc0b3` ด้วย `git show` ทุกช่วงบรรทัด และไฟล์เหล่านั้นเหมือนกับ branch นำเสนอ
- สคริปต์ตรวจ layout ที่ 1920×1080: ทั้ง 33 หน้าไม่มีข้อความชนกัน ไม่ล้นการ์ด ไม่ทับ footer และจุดบนเส้นเรื่องอยู่กลางเส้นพอดี
- พิมพ์ PDF ด้วย headless Chrome ได้ 33 หน้า และตรวจภาพทุกหน้า
- จับภาพกลาง animation ด้วย Playwright: แผ่นเปลี่ยนบท การประกอบภาพ จุดวิ่ง ตราประทับ และการกดรัว 30 ครั้งติด ไม่มี error ใน console
- หน้าบทพูดบนจอ 375px ไม่มี horizontal overflow · 27 จุดคลิก · ป้ายชื่อผู้พูดทุกบล็อก
- ภาพผลทดสอบเป็นภาพจริงจาก run 12 ต.ค. ป้าย PASS / FAIL / ERROR ตรงกับผลที่บันทึกไว้

## สิ่งที่ยังไม่ได้ทำ

- **ยังไม่ได้ซ้อมจับเวลาจริง** หลังเพิ่มสไลด์ RAG บทพูดยาวขึ้นราว 3% จากชุดที่ประมาณไว้ 8:30 จึงน่าจะอยู่ราว 8:45 ต้องซ้อมต่อเนื่องและเช็กจุด 3:10 / 4:50 / 7:25 / 8:30 / 9:00 ถ้าเกินให้ตัดประโยคที่มีป้าย "ตัดได้"
- ยังไม่ได้ทดสอบแชร์จอผ่าน Teams จริง ว่า motion ยังลื่นพอหลังบีบอัดภาพ
- ฟีเจอร์รับไฟล์ `.md` ขององค์กรปิดไว้เป็นค่าเริ่มต้น ยังไม่ได้เปิดสาธิตสด
