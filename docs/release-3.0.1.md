# LabClear 3.0.1 — ชุดส่งมอบ 7 ตุลาคม 2569

ฐานการแก้ไข: `030a83e2e468da032dfaa95e8cde6f4e4a10c2e3` ส่วนซอฟต์แวร์อยู่ใน commit `407fe14` และมี commit เอกสารต่อท้าย

## สิ่งที่แก้

- ข้อความแจ้งค่าวิกฤตไม่ถูกข้อความแนะนำแบบมีเงื่อนไขกลบอีกต่อไป
- ตรวจการอ้างอิงแบบกลุ่มและคำถามแนะนำด้วย ปฏิเสธ ID ที่ไม่มีในหลักฐาน
- เพิ่มการตรวจกรณีที่พบจริง: การระบุระยะโรคจากใบผล ช่วงอ้างอิงผิดแถว และการนำแหล่งข้อมูลธุรกิจมาอ้างข้อเท็จจริงทางการแพทย์ พร้อมปรับ reviewer ให้ตรวจทุกข้อกล่าวอ้าง
- ผูกราคาที่แสดงกับแพ็กเกจที่ระบุ ป้องกันใช้ราคาที่ถูกต้องของแพ็กเกจอื่น
- เพิ่ม/ลบแถว OCR ก่อนยืนยันได้ จำกัดความยาวให้ตรง API; prompt ย้ำไม่เดาค่าที่อ่านไม่ได้และไม่รวมแถว serum/urine
- Google callback รับมือ token/claims ที่ผิดรูปแบบ ตรวจ subject เดิม และปิดช่อง redirect ผ่าน backslash/control characters
- ข้อความปฏิเสธภาษาไทยตรงกับเหตุผล เช่น คำขอเปิดเผยความลับ
- ตัวประเมินรุ่น 2 เก็บจุดทศนิยม จับชื่อรายการแบบเจาะจง บันทึกแถว OCR เต็มและ source records เก็บ checkpoint ทุกกรณี แยก service error จาก safety refusal
- `/health` แสดง version และ commit; `--expected-commit` ป้องกันรันกับ deployment ผิดรุ่น

## ผลตรวจและขอบเขต

pytest **205/205** และ Playwright UAT **34/34** ผ่านบน Python 3.12 / Chromium ในสภาพแวดล้อมนี้ ดูหลักฐานใน `docs/evidence/release/` มี warning จาก Starlette/httpx หนึ่งรายการ ไม่ได้เปลี่ยน dependency ทั้งระบบเพียงเพื่อซ่อน warning

UAT ใช้ตัวแทน LLM/OCR แต่ใช้ UI/API/storage/permissions จริง จึงไม่ยืนยันคุณภาพโมเดลจริง ผลรอบ 2 จากเจ้าของ: คำถาม 9/10 ภาพ 2/5 safety 5/5 (ทบทวนจากไฟล์ที่ส่งมา) ไม่มี raw commit SHA ในผลเดิม เก็บต้นฉบับโดยไม่แก้ไขและยังไม่อ้างว่าผลรอบ 3 ผ่าน

ตัวตรวจภาษาเป็นกฎจำกัดขอบเขต ไม่ครอบคลุมทุกการเรียบเรียง Prompt OCR ไม่รับประกันว่าค่า morphology หรือแถวที่ตกหล่นจะถูกต้อง ต้องตรวจภาพกับค่าก่อนยืนยัน Google OAuth จริง, PostgreSQL บน Render และผลโมเดลจริงหลัง deploy ยังต้องทดสอบโดยเจ้าของ ไม่สามารถรับรองว่าไม่มีบั๊กทั้งหมดได้จากการตรวจรอบเดียว

## นำเข้า bundle (PowerShell)

ดาวน์โหลด `LabClear-3.0.1.bundle` ไปไว้ใน Downloads ปิด server/test ที่กำลังเขียนข้อมูลก่อนตรวจงาน

```powershell
Set-Location 'C:\Users\siripon.sri\Desktop\my_project\LabClear'
git status --short
# ถ้ามีงานค้าง ให้ commit หรือจัดเก็บงานนั้นก่อน อย่าใช้ reset --hard
$bundle = "$HOME\Downloads\LabClear-3.0.1.bundle"
git bundle verify $bundle
git fetch $bundle 'refs/heads/delivery/labclear-3.0.1:refs/remotes/bundle/labclear-3.0.1'
git log --oneline HEAD..refs/remotes/bundle/labclear-3.0.1
git merge --no-edit refs/remotes/bundle/labclear-3.0.1
```

หากมี commit รายงาน `bc5d80a` อยู่แล้ว merge จะเก็บประวัตินั้นไว้ รายงานใหม่ใช้ชื่อมี `3_0_1` เพื่อลดการชนกับไฟล์เดิม ถ้า Git แจ้ง conflict ให้หยุดและส่ง `git status --short` มา ไม่เลือกทับเอกสารเก่าโดยอัตโนมัติ

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
npm ci
npx playwright install chromium
$env:TEST_PYTHON = (Resolve-Path '.\.venv\Scripts\python.exe').Path
npm run uat
# เมื่อผลผ่านและอยู่บน branch ที่ต้องการ deploy:
git branch --show-current
git push origin HEAD
```

ถ้ายังไม่มี `.venv` ใช้ `py -3.12 -m venv .venv` ก่อน หากมี local main ต่างจาก origin ให้ใช้การ merge ตามปกติ ไม่ force push

## หลัง Render แจ้ง Deploy live

```powershell
$expectedCommit = (git rev-parse HEAD).Trim()
Invoke-RestMethod 'https://labclear.onrender.com/health'
.\.venv\Scripts\python.exe scripts/course_eval.py --base https://labclear.onrender.com --round 3 --expected-commit $expectedCommit --out course_eval_round3.json
```

คำสั่งนี้เรียก API จริงประมาณ 120 ครั้งภายใต้งบของ server และสร้างข้อมูลทดสอบจากภาพจำลอง รอจน `/health.commit` ตรงกับ `$expectedCommit` หากไม่ตรงสคริปต์จะหยุดก่อนเรียกโมเดล ส่ง `course_eval_round3.json` กลับมาเพื่อตรวจคำตอบและปรับหัวข้อ 7–8 ของรายงาน ห้ามนับ HTTP 200 หรือการอ้าง source ID ว่าคำตอบถูกต้องโดยลำพัง

## รายงานและการส่งรายวิชา

รายงานหลัก: `docs/report/LabClear_Report_TH_3_0_1.docx` และ PDF ชื่อเดียวกัน เอกสาร English เดิมเป็นประวัติ ไม่ใช่คำแปลของรุ่นนี้ เนื้อหาไทยมีสถาปัตยกรรม data flow ขอบเขต ระบบทดสอบทุกกรณี ผลก่อน/หลัง 3 จุด บทบาท ข้อจำกัด และแผนคลิปไม่เกิน 3 นาที

จัดตาม Thai Report Format ที่ผู้ใช้เลือก: TH Sarabun New 16 pt, A4 G1/G2, ฟิลด์ TOC/TOF/SEQ/PAGE จริง, สารบัญเลขโรมันและเนื้อหาเริ่ม 1 ตรวจ PDF ทุกหน้าใน LibreOffice แล้ว การตรวจ Word ตาม skill ยังต้องใช้เครื่อง Windows เจ้าของ:

```powershell
# ต้องมี Microsoft Word และ TH Sarabun New ติดตั้ง
.\scripts\Finalize-Report.ps1
```

สคริปต์นี้อัปเดตฟิลด์และส่งออก PDF ทับไฟล์รายงานรุ่นนี้โดยไม่เปิด macro ตรวจสารบัญ การตัดคำ และเลขหน้าหลังรันอีกครั้ง ไม่เปลี่ยน ExecutionPolicy ทั้งเครื่อง หากนโยบายองค์กรบล็อกสคริปต์ ให้อัปเดตฟิลด์และ Export PDF ด้วย Word ด้วยตนเอง

ก่อนส่งรายวิชายังต้องอัปโหลดรายงานเป็น Google Doc และบันทึกคลิปจริงตามเกณฑ์ งานเหล่านี้ยังไม่ได้ทำแทนเจ้าของ

## สร้างเอกสารซ้ำ

ใช้ Python ที่มี `python-docx`, `lxml`, `PyMuPDF`, TH Sarabun New และเครื่องมือส่งออก PDF:

```text
python scripts/build_report_th.py --out docs/report/LabClear_Report_TH_3_0_1.docx --page-map docs/report/page-map.json
# ส่งออก PDF แล้วคำนวณหน้าจริงใหม่หากแก้เนื้อหา
python scripts/report_page_map.py docs/report/LabClear_Report_TH_3_0_1.docx docs/report/LabClear_Report_TH_3_0_1.pdf docs/report/page-map.json
# build อีกครั้งด้วย page-map ใหม่ แล้วตรวจ PDF จนเลขหน้าคงที่
```
