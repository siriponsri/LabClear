# Playwright evidence: GL-03 checkpoint

รอบนี้เป็นหลักฐานใหม่จาก local offline/mock run ของ LabClear หลัง commit `101e5e21968cc5ea8204f953ef60ceb9097bb677` (`Bind staff handoffs to requesting chat`) เมื่อ 10 ตุลาคม 2569 เวลา 19:01–19:03 น. เวลาไทย

## ขอบเขตและข้อจำกัด

- สั่งรันด้วย `node tests/browser/uat.cjs` และ `UAT_OUT=test-results/uat-gl03-20261010` จาก repository เดียวกัน
- ใช้ `scripts/offline_check.py browser` ซึ่งใช้ SQLite ชั่วคราวและปิด outbound provider network
- LLM และ OCR เป็น test doubles; payment, LINE และ hospital/package integration เป็น simulator/mock เท่านั้น
- หลักฐานนี้ยืนยัน UI, HTTP route, storage, session, permission และ state transition ไม่ยืนยันคุณภาพ LLM/OCR, live provider, เงินโอนจริง หรือ deployment
- ข้อมูลที่ใช้เป็น synthetic เท่านั้น ไม่มี secret, บัญชีธนาคาร, ข้อมูลสุขภาพจริง หรือ PII จริง
- `working_tree_dirty=true` ใน raw JSON เพราะมีไฟล์ untracked เดิมของงานอยู่ แต่ candidate source ที่ทดสอบผูกกับ commit ข้างต้น

## สภาพแวดล้อม

| รายการ | ค่า |
|---|---|
| OS/shell | Windows PowerShell |
| Node.js | v24.19.0 |
| Python | 3.12.10 (`.venv`) |
| Playwright | 1.56.1 |
| Candidate SHA | `101e5e21968cc5ea8204f953ef60ceb9097bb677` |
| Raw result SHA-256 | `10b8fb2968a9f32a996960eb521364efdcd7ef61a2a3b8af133ea289cc2965d3` |
| Full pytest log SHA-256 | `1c1067b8363745a0007ac856b389035d821993700fe8565b8903d434430a38ff` |
| Browser mode | headless Chromium, 1440/1000, 768/1000, 390/1000 |
| Result | 36 PASS, 0 FAIL, 0 browser errors |

ไฟล์ `browser-uat.json` เป็นผลดิบจาก runner และ PNG ในโฟลเดอร์นี้ถูกคัดลอกจาก run เดียวกันทันทีหลังจบการทดสอบ ไม่ใช้ภาพจาก run ก่อนหน้า

PDF ที่ rebuild จากรายงานนี้มี SHA-256 ดังนี้: Business `600b614dc96f26ef8ceff97171b340d4810bed7e8ac65a43f3dadbb0d2a63583`, Architecture `93386382a5b8e447ae1d395891005388fd399dedd2515c78b52340decdfd1f00`

## คำสั่งที่ตรวจสอบได้

```text
node tests/browser/uat.cjs
```

ผลดิบ: [`browser-uat.json`](browser-uat.json)  
แผนทดสอบ: [`playwright-test-plan.md`](playwright-test-plan.md)  
ตารางหลักฐาน: [`evidence-matrix.md`](evidence-matrix.md)
