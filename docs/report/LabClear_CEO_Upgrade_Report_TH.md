# ภาคผนวกรายงาน LabClear: การปรับปรุงรอบ 8 ตุลาคม 2569

## 1. วัตถุประสงค์และขอบเขต

รอบนี้พัฒนาระบบให้ตรวจสอบที่มาของข้อมูลและขอบเขตการใช้โมเดลได้ชัดขึ้น
โดยคงบริการ Render และเส้นทางใช้งานเดิม เพิ่มหน้าทดลองภาษาไทย
การจัดการเอกสารองค์กรด้วยข้อมูลจำลอง และลิงก์แพ็กเกจจากเว็บไซต์โรงพยาบาล
ฟีเจอร์ใหม่ทั้งหมดปิดเป็นค่าเริ่มต้น ไม่มีการเรียกโมเดล OCR หรือ embeddings จริง
ไม่มีการใช้ข้อมูลผู้ป่วย และไม่มีการเปลี่ยนฐานข้อมูลหรือ ENV บน production

เอกสารนี้เป็นรายงานเพิ่มเติมของ implementation ปัจจุบัน ไม่แก้รายงานและผลทดลองเดิม
ค้นไม่พบ Final Project.docx หรือ rubric Week 11 ใน workspace และ attachment
จึงยังตรวจความครบถ้วนตามเกณฑ์รายวิชาไม่ได้ รายงานฉบับ Word/PDF และการตรวจจัดหน้า
ตาม Thai Report Format ยังไม่จัดทำในรอบนี้ ไม่อ้างว่า Markdown ผ่านการตรวจ pagination

## 2. สถาปัตยกรรมและการไหลของข้อมูล

ใช้ FastAPI และ encrypted entity store เดิม การตรวจ session, CSRF, ownership,
input guard, reviewer และ output guard ยังคงอยู่ ผังปัจจุบันอยู่ใน
[IMPLEMENTATION.md](../ceo-upgrade/IMPLEMENTATION.md#request-flow)

เอกสารองค์กรต้องผ่าน draft → approved ก่อนค้นหา ผู้ใช้เข้าถึงได้เฉพาะองค์กรที่
ผู้จัดการกำหนด การแทนรุ่นจะถอนรุ่นเดิม การถอนสิทธิ์มีผลกับการค้นและดาวน์โหลดครั้งถัดไป
ประวัติคำตอบที่อาศัยเอกสารถูกถอนจะไม่ถูกนำเข้าโมเดลในคำถามใหม่
ข้อความที่ผู้ใช้เคยเห็นหรือดาวน์โหลดแล้วไม่สามารถเรียกคืนได้

## 3. กระบวนการ AI และข้อจำกัด

เพิ่ม medical analyzer และ Thai composer เป็นบทบาทที่ยังไม่ตั้งค่า
Python ตรวจ packet, source ID และค่าตรวจที่ต้องคงเดิม ส่วนโมเดลมีหน้าที่อธิบายและ
สังเคราะห์ภายใต้หลักฐาน reviewer ยังตรวจคำตอบกับข้อมูลต้นทาง
เส้นทางใหม่รองรับเฉพาะรายงานตัวอย่างที่ระบบเตรียมไว้ และไม่เปิดใช้ free analyzer
กับ packet ลูกค้าผ่านเส้นทางปกติ

Runtime skills เป็นไฟล์ที่กำหนดรายการและ hash ไว้ ไม่อ่าน development skills
หรือคำสั่งจากไฟล์อัปโหลดเป็น system prompt การผ่าน schema ไม่ยืนยันความถูกต้อง
ทางการแพทย์หรือความคงเดิมเชิงความหมาย เช่น การปฏิเสธและระดับความไม่แน่นอน
Clef และ embedding ยังเป็นข้อเสนอ ไม่มี adapter ใหม่ที่เปิดใช้งาน

## 4. แหล่งอ้างอิงและแพ็กเกจ

จำนวน active catalog คงเดิม 58 records จาก 4 publisher groups มี acquisition queue
15 รายการ โดย 6 รายการตรง URL เดิม ไม่มีเอกสารคลินิกใหม่ได้รับอนุมัติ
ต้องตรวจสิทธิ์ ปี รุ่น กลุ่มประชากร และ section ที่ใช้ก่อนเพิ่มเข้า RAG
ดู [SOURCE_REVIEW.md](../ceo-upgrade/SOURCE_REVIEW.md)

หน้าลิงก์โรงพยาบาลแยกจากการจองจำลอง แสดงปลายทางทางการสองแห่ง
ราคาไม่ทราบหรือหมดอายุการตรวจจะถูกซ่อน ไม่สมมติรายการตรวจ วันใช้สิทธิ์
หรือความเป็นพันธมิตร และไม่ใช้ข้อความการตลาดเป็นหลักฐานทางคลินิก

## 5. ส่วนติดต่อผู้ใช้

หน้าทดลอง `/preview/landing` ใช้ภาษาไทยเป็นหลัก มีรายงานจำลองที่เลือกแถวด้วย
เมาส์หรือคีย์บอร์ดได้ ตัวเลข หน่วย และช่วงอ้างอิงคงเดิมเมื่อเปลี่ยนภาษา
เก็บภาพก่อนและหลังที่ 390, 768 และ 1440 พิกเซล พบและแก้ form อัปโหลดล้นกรอบ
บนมือถือ พร้อมตรวจขอบเขต control โดยตรง ยังไม่ rollout หน้าตาใหม่ทั้งแอป

## 6. ผลทดสอบซอฟต์แวร์

| ชุดหลักฐาน | ผล | ความหมาย |
|---|---|---|
| Python regression | 265 ผ่าน, 0 ล้มเหลว | isolated DB และ test doubles |
| Browser เดิม | 36 ผ่าน, 0 ล้มเหลว | Guest/login/account/booking/staff/admin และ responsive flows |
| Browser ส่วนใหม่ | 10 ผ่าน, 0 ล้มเหลว | preview/ลิงก์โรงพยาบาล/เอกสารจำลอง |
| Offline evaluation fixture | 60 ผ่าน | 10 cases × 3 planned arms × เปิด/ปิด skills |
| Live model / OCR / embeddings | NOT_RUN | ไม่ได้รับอนุญาตในรอบนี้ |

ทั้งสาม planned arms ใช้ scripted fixture จึงใช้จัดอันดับโมเดลหรือสรุปประโยชน์ของ
skills ไม่ได้ ไม่มีตัวเลข clinical accuracy, Thai comprehension, live latency
หรือค่า API จริงที่วัดในรอบนี้ ผลลัพธ์และ hash อ้างอิงอยู่ใน
[evidence](../ceo-upgrade/evidence/)

## 7. ความเป็นส่วนตัว ความปลอดภัย และค่าใช้จ่าย

Guest ใช้หน่วยความจำชั่วคราว ไม่มี token หรือรายงานคงอยู่ใน Web Storage
account มีประวัติที่แยกตามเจ้าของ เอกสารองค์กรเข้ารหัสและตรวจสิทธิ์ทุกการอ่าน
error log ของ provider เก็บ metadata แทน response body ที่อาจสะท้อนข้อมูลส่วนตัว

การจองงบเป็น atomic reservation ก่อน request ใช้ UTF-8 bytes สำหรับประมาณข้อความไทย
ตรวจค่าไม่เป็นจำนวนจำกัดและการ settle ซ้ำ timeout/cancellation เก็บเงินประมาณไว้
เพราะอาจถูกคิดค่าบริการแล้ว คงงบเดิม 300 THB และ prior spend เดิม ไม่เพิ่มเป็น $20
โดยอัตโนมัติ ราคา ภาษี image allowance และการนับ token ของ endpoint ต้องตรวจอีกครั้ง

## 8. การส่งมอบและงานที่ยังค้าง

แยกผล local tests, GitHub push, CI และ Render deployment ออกจากกัน
ไม่มี workflow CI ใน repository ณ baseline จึงไม่อ้างว่ามี CI ผ่านโดยอัตโนมัติ
HTTP 200 ของเว็บไซต์เดิมไม่ยืนยันว่า commit ใหม่ deploy แล้ว

งานค้าง: G-UI, G-DATA, G-API, clinical/Thai semantic evaluation, expert source review,
quota/price/retention checks, Clef coverage adapter spike, retrieval comparison ก่อน embeddings,
rubric และรายงานจัดหน้า ใช้ [MORNING_HANDOFF.md](../ceo-upgrade/MORNING_HANDOFF.md)
และ [ENV_HANDOVER.md](../ceo-upgrade/ENV_HANDOVER.md) สำหรับขั้นตอนถัดไป

สถานะนี้เป็น software candidate ที่ปิดฟีเจอร์ใหม่ไว้ ไม่ใช่การประกาศว่าทั้งโครงการ
เสร็จสมบูรณ์ ผ่านการรับรองทางคลินิก หรือผ่านการตรวจ production
