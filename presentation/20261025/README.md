# LabClear — งานนำเสนอ 25 ต.ค. 2026

สไลด์ HTML 16:9 จำนวน 13 หน้า กับหน้าบทพูดแยก ทำตาม `docs/presentation/LABCLEAR_PRESENTATION_BRIEF_TH.md` โดยคง 8 section และเวลาเดิม (เนื้อหา 9:00 · สำรอง 1:00 · Q&A 5:00) บนสไลด์ไม่มีชื่อหรือรหัสผู้พูด ชื่อผู้พูดอยู่ในหน้าบทพูดเท่านั้น

```
presentation/20261025/
├─ slides/            ← Vercel project labclear-presentation-20261025
│  ├─ index.html      สไลด์หลัก 13 หน้า
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

## สไลด์ 13 หน้า

| # | Section | หัวข้อ | คลิกในหน้า |
| --- | --- | --- | --- |
| 1 | Overview | Project Overview | — |
| 2–3 | Business | Problem & Users · Service Scope in the Prototype | 2 · 1 |
| 4–5 | Knowledge | Two Kinds of Data · Traceable Sources (PDF ศิริราช DR-019) | 2 · 2 |
| 6–7 | Functions | Service & Appointment · Report Review & Sources | 1 · 1 |
| 8 | Architecture | One Service, Clear Boundaries | 4 |
| 9 | Processing Flow | Retrieve, Write, Check | 3 |
| 10–12 | Evaluation | Recorded Evaluation · Real Cases (Q05 PASS / Q07 FAIL) · Real Cases (I04 ERROR / S01 PASS) | 3 · 1 · 1 |
| 13 | Conclusion | Recap · Next Steps | 2 |

รวมคลิกจากหน้าแรกถึงจบ 35 ครั้ง (นับทั้งการเปิดขั้นในหน้าและการเปลี่ยนหน้า) ตรงกับป้าย `[คลิก 1]`–`[คลิก 35]` ในบทพูด

## Deploy บน Vercel

ทั้ง 2 project ตั้ง Root Directory ไว้แล้ว (`presentation/20261025/slides` และ `presentation/20261025/script`) · Framework Preset = Other · ไม่มี build

deploy ด้วย CLI จากสำเนาที่มีเฉพาะโฟลเดอร์ `presentation/20261025/` เพื่อไม่ให้ไฟล์อื่นใน repo ติดขึ้นไป

(แนะนำ) Settings → Deployment Protection ถ้าไม่อยากให้คนนอกเปิดบทพูดหรือภาพ PDF ศิริราช

## นำเสนอบน Microsoft Teams

- ศิริพลเปิดลิงก์สไลด์ใน Chrome/Edge → กด **F** เต็มจอ → Teams แชร์แบบ **Screen** (ทั้งจอ)
- วัชรินทร์เปิดลิงก์บทพูดบนมือถือ กดปุ่ม **วัชรินทร์** เพื่อเน้นบทตัวเอง และกด **เริ่ม** ที่นาฬิกาตอนพูดคำแรก
- ศิริพลกดทุกคลิก (35 คลิก) ตามป้าย `[คลิก n]` ในบทพูด

| คีย์ | ทำอะไร |
| --- | --- |
| → ↓ Space PgDn Enter | คลิกถัดไป (ใช้ presenter clicker ได้) |
| ← ↑ PgUp Backspace | ย้อนกลับ |
| 1–8 | ไปหน้าแรกของ section นั้น |
| Home / End | หน้าแรก / หน้าสุดท้าย |
| F | เต็มจอ (ถ้าเบราว์เซอร์ไม่ยอม ใช้ F11) |
| L | เลเซอร์พอยน์เตอร์ (จุดแดงตามเมาส์) |
| Q | หน้าสำรอง Q&A · Esc เพื่อกลับ |
| H หรือ ? | คีย์ลัด |

ลิงก์ตรงไปหน้าได้ เช่น `…/#/11` หรือ `…/#/8.3` (หน้า 8 ขั้นที่ 3)

## แก้บทพูดโดยไม่เขียนโค้ด

แก้ `script/SPEAKER_SCRIPT_TH.md` บนหน้าเว็บ GitHub (ปุ่มดินสอ) แล้ว Commit จากนั้น deploy ใหม่ รูปแบบบรรทัด: `A:` บทวัชรินทร์ · `B:` บทศิริพล · `[คลิก n]` จุดกด · `> TRANSITION:` ประโยคเชื่อม · `**คำ**` คำเน้น

ถ้าแก้ลำดับหรือจำนวนคลิกในบท ต้องให้ตรงกับสไลด์ รวม 35 ครั้ง

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
- สคริปต์ตรวจ layout ที่ 1920×1080 และ 1280×720: ไม่มีข้อความชนกัน ไม่ล้นการ์ด ไม่ทับ footer ทั้ง 13 หน้า
- พิมพ์ PDF ด้วย headless Chrome ได้ 13 หน้า และตรวจภาพทุกหน้า
- หน้าบทพูดบนจอ 375px ไม่มี horizontal overflow · มีป้ายชื่อผู้พูดทุกบล็อก · 46 บล็อกบทพูด 35 จุดคลิก
- ภาพผลทดสอบเป็นภาพจริงจาก run 12 ต.ค. ป้าย PASS / FAIL / ERROR ตรงกับผลที่บันทึกไว้ ไม่ได้เปลี่ยนผล

## สิ่งที่ยังไม่ได้ทำ

- **ยังไม่ได้ซ้อมจับเวลาจริง** เวลาในบทพูดประมาณจากจำนวนคำ (~8:30) ต้องซ้อมต่อเนื่องและเช็กจุด 3:10 / 4:50 / 7:10 / 8:20 / 9:00
- ยังไม่ได้ทดสอบแชร์จอผ่าน Teams จริง
- motion ทดสอบใน Chromium บนเครื่องนี้ ยังไม่ได้ลองบนเครื่องที่จะใช้นำเสนอ
