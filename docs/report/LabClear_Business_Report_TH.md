# LabClear 4.0.0-rc3 รายงานเชิงธุรกิจ

**วิชา** 06048308 Intelligent Chatbot Development · Final Project

**ผู้พัฒนา** นายวัชรินทร์ บัวสอน (68076055) · นายศิริพล ศรีเฮงไพบูลย์ (68076060)

**รุ่น** 4.0.0-rc3 · **วันที่** 11 ตุลาคม 2569

> LabClear เป็นธุรกิจจำลองตามโจทย์รายวิชา ราคา สาขา นโยบาย และใบผลทั้งหมดเป็นข้อมูลสมมติ ไม่มีการโอนเงินจริงและไม่ใช่บริการทางการแพทย์จริง รายงานนี้อธิบายรูปแบบธุรกิจ ลูกค้า สินค้า เส้นทางลูกค้า การดำเนินงาน ต้นทุน AI ความเสี่ยง และการตัดสินใจที่เจ้าของต้องทำ ตัวเลขทุกตัวมาจากไฟล์ข้อมูลใน repository และเอกสารวิจัยของทีม ส่วนที่ยังไม่มีข้อมูลเว้นเป็น [รอข้อมูล]

## 1. สรุปสำหรับผู้บริหาร

LabClear เป็น **ต้นแบบธุรกิจจำลอง** ของศูนย์ตรวจสุขภาพ 3 สาขา มีแพ็กเกจตรวจเน้นแล็บ 18 รายการ ตัวอย่างราคาในแคตตาล็อก 290–2,890 บาท และ AI Lab Report แบบ Free/Plus ตัวเลขราคาและสาขาทั้งหมดเป็นข้อมูล demo ไม่ใช่ข้อเสนอขายจริง แชตช่วยตอบจากข้อมูลของร้าน เปรียบเทียบแพ็กเกจ และส่งงานให้เจ้าหน้าที่ โดยไม่วินิจฉัย

| ประเด็น | สรุป |
|---|---|
| สมมติฐานปัญหาที่ต้องตรวจสอบ | ลูกค้าบางกลุ่มอาจต้องการเปรียบเทียบราคาและแพ็กเกจ ขอข้อมูลนอกเวลาทำการ หรือทบทวนค่าบนใบผล; ยังไม่มี customer research ยืนยันขนาดหรือความถี่ของปัญหา |
| คุณค่าที่ตั้งใจออกแบบ | คำตอบพร้อมแหล่งอ้างอิง การเปรียบเทียบแพ็กเกจตามงบ และคำอธิบายใบผลเทียบช่วงที่พิมพ์บนใบเดียวกัน; เป็นขอบเขตการออกแบบ ไม่ใช่ผลลัพธ์ที่วัดกับลูกค้าจริง |
| ข้อเสนอคุณค่า | ช่วยเปรียบเทียบรายการตรวจและส่งคำขอนัดที่เจ้าหน้าที่ยืนยัน; ตัวอย่างราคาเป็นข้อมูล demo ไม่ใช่ข้ออ้างว่าถูกกว่าตลาด |
| รายได้ | ค่าแพ็กเกจรายครั้ง แพ็กเกจองค์กรรายหัว (20 คนขึ้นไป) และสมาชิก Plus |
| สถานะ | Full Playwright UAT รอบ `final03` ผ่าน `37 PASS / 0 FAIL / 0 browser errors`, exit code 0 และมี screenshot ใหม่ 63 ภาพตาม raw JSON. Full offline pytest 547 ผ่าน/1 warning. LLM/OCR เป็น mock; live smoke เดิมของ Typhoon/OpenThai อย่างละ 1 คำขอใช้ยืนยัน connectivity/format เท่านั้น ยังไม่มีหลักฐานอุปสงค์ ต้นทุนต่อหน่วย คุณภาพโมเดล/คลินิก หรือความพร้อมเชิงพาณิชย์ |
| การตัดสินใจที่รอ | ยืนยันกลุ่มลูกค้าและเศรษฐศาสตร์, privacy/clinical/retention gates, review รายงาน และการอนุมัติ release แยกต่างหาก; ยังไม่ merge/deploy |

## 2. ปัญหาและโอกาส

### 2.1 สมมติฐานปัญหาของลูกค้าและร้าน

| ฝ่าย | สมมติฐานที่ต้องตรวจสอบ | ผลที่อาจเกิด (ยังไม่ได้วัด) |
|---|---|---|
| ลูกค้า | บางคนอาจต้องการเปรียบเทียบรายการตรวจ ราคา และเงื่อนไขของแพ็กเกจ | อาจใช้เวลาตัดสินใจมากขึ้น; ต้องทดสอบกับกลุ่มเป้าหมาย |
| ลูกค้า | บางคนอาจต้องการคำอธิบายค่าที่พิมพ์บนใบผล | ความเข้าใจและการตัดสินใจด้านสุขภาพยังไม่ได้ประเมิน; ไม่ใช้แทนแพทย์ |
| ลูกค้า | ความต้องการข้อมูลนอกเวลาทำการยังไม่มีหลักฐานในโครงการ | ผลต่อการเลือกผู้ให้บริการหรือยอดจองยังไม่ทราบ |
| ร้าน | คำถามซ้ำเรื่องราคา เวลา การยกเลิก หรือการชำระเงินอาจใช้เวลาพนักงาน | ปริมาณคำถามและเวลาที่ใช้ยังไม่ได้เก็บ |
| ร้าน | ระบบตอบอัตโนมัติอาจแสดงราคา ส่วนลด หรือคำแนะนำเกินขอบเขต | เป็นความเสี่ยงการออกแบบที่ต้องทดสอบและควบคุม ไม่ใช่เหตุการณ์ที่วัดแล้ว |

### 2.2 ข้อมูลตลาดจากการทบทวนของทีม

ข้อมูลที่มีในโครงการอยู่ในชุดรายการ `business_data/hospital_links.json` รุ่น `2026-10-09-review2` ซึ่งบันทึกไว้ 7 รายการจาก 6 โรงพยาบาล ณ 12 ต.ค. 2569 กฎในระบบจัด 4 รายการเป็นราคาที่ยืนยันและยังอยู่ในช่วงขาย (5,500, 6,500, 7,500 และ 13,500 บาท), 2 รายการยังยืนยันไม่ได้ และ 1 รายการหมดช่วงขาย ตัวเลขเหล่านี้เป็นราคาจากหน้าแหล่งข้อมูลที่ตรวจเมื่อ 9 ต.ค. ไม่ใช่ราคาเฉลี่ยหรือตัวแทนตลาด

ข้อมูลรายการตรวจที่รวมและไม่รวมยังว่าง จึงเปรียบเทียบขอบเขตบริการ เงื่อนไข และความคุ้มค่าของแต่ละรายการไม่ได้ ในโครงการไม่มีหลักฐานรองรับช่วงราคาเริ่มต้น 1,600–3,900 บาท ระดับกลาง 4,000–12,000 บาท หรือระดับพรีเมียม 12,000–34,900 บาท รวมถึงไม่มีหลักฐานว่าราคา LabClear ต่ำกว่าตลาด จึงไม่นำช่วงราคาเหล่านี้มาใช้ ขนาดตลาด ความต้องการซื้อ และจำนวนลูกค้าเป้าหมายยังเป็น [รอข้อมูล]

ข้อเสนอให้วาง LabClear เป็นบริการเปรียบเทียบข้อมูลการตรวจและให้ภาพ/รังสีเป็นบริการเสริมผ่านผู้ให้บริการภายนอก เป็นสมมติฐานด้านตำแหน่งทางธุรกิจ ไม่ใช่ผลวิจัยตลาดหรือข้อตกลงพันธมิตร

## 3. ลูกค้าเป้าหมายและคุณค่าที่ส่งมอบ

| กลุ่มลูกค้า | งานที่ต้องการทำ | คุณค่าที่ LabClear ให้ | ช่องทาง |
|---|---|---|---|
| ผู้ใหญ่วัยทำงานที่มีใบผลแล็บ | เข้าใจค่าแต่ละตัวโดยไม่ถูกวินิจฉัย | อ่านใบผล ให้ยืนยันค่า แล้วอธิบายเทียบช่วงบนใบเดียวกันพร้อมแหล่งอ้างอิง แนะนำพบแพทย์เมื่อมีค่าวิกฤต | แชต, AI Lab Report |
| ผู้ที่วางแผนตรวจสุขภาพ | เลือกแพ็กเกจตามงบและจองเวลา | เทียบรายการตรวจและราคาจากแคตตาล็อกจริง จองช่วงเวลา 30 นาที | แชต, หน้าแพ็กเกจและเปรียบเทียบ |
| ผู้ติดตามผลต่อเนื่อง | ดูการเปลี่ยนแปลงของค่าเดิมในหลายครั้ง | ภาพรวมผลแล็บตามเวลาและเทียบกับครั้งก่อน | LabClear Plus |
| ฝ่ายบุคคลขององค์กร | ตรวจสุขภาพพนักงาน 20 คนขึ้นไป | แพ็กเกจองค์กรรายหัว บริการนอกสถานที่ ใบเสนอราคา PDF แบบมีรุ่น | หน้าองค์กร, เจ้าหน้าที่ |
| เจ้าหน้าที่และผู้จัดการของร้าน | ลดงานตอบซ้ำและควบคุมคุณภาพคำตอบ | กล่องข้อความ การยืนยันนัด ใบเสนอราคา และการตั้งค่า AI โดยไม่ต้องเขียนโค้ด | ศูนย์บริการลูกค้า `/staff` |

ข้อเสนอสำหรับการทดลองนำร่อง (ยังไม่ผ่านการยืนยันกับลูกค้าจริง): เริ่มจากผู้ที่กำลังเลือกและเปรียบเทียบแพ็กเกจตรวจ เพราะเส้นทาง catalog → compare → booking request มีหลักฐาน workflow ใน UAT แล้ว ส่วน HR/องค์กรและสมาชิก Plus เป็นสมมติฐานรอง; Plus ต้องผ่าน privacy/clinical gate และทบทวนต้นทุนก่อนเสนอจริง

## 4. สินค้า บริการ และราคา

### 4.1 แพ็กเกจตรวจสุขภาพ

| กลุ่ม | จำนวน | ช่วงราคา (บาท) | วิธีจอง |
|---|---|---|---|
| แพ็กเกจหลัก (Essential, Workday, Comprehensive, Family Pair) | 4 | 1,190–2,890 (Family Pair 2,290 ต่อคู่) | จองได้ทันที รอเจ้าหน้าที่ยืนยัน |
| ตรวจติดตามและรายการเสริม (เช่น Glucose, Lipid, Kidney, Liver, Thyroid, HbA1c, Direct LDL, Ferritin) | 11 | 290–990 | เจ้าหน้าที่พิจารณาก่อนจอง |
| แพ็กเกจองค์กร (Corporate Essential, Workday, Extended) | 3 | 990–2,390 ต่อคน | 20 คนขึ้นไป ผ่านใบเสนอราคา |

ราคาใน `business_data/catalog.json` ตั้งไว้เป็นข้อมูลตัวอย่างสำหรับการจำลองตามรายวิชา ไม่ใช่ราคาที่คำนวณจากต้นทุนหรือความเต็มใจจ่ายแล้ว ตัวอย่างราคาในเอกสารนี้คงเดิมและไม่มีการแก้รายการที่แสดงแก่ลูกค้าในจุดทบทวนนี้ แม้เจ้าของอนุญาตให้พิจารณาแก้ราคา แต่หลักฐานปัจจุบันยังไม่รองรับตัวเลขใหม่

การตรวจติดตามต้องผ่านเจ้าหน้าที่ก่อนเสมอ ค่าที่อยู่นอกช่วงในใบผลจึงไม่กลายเป็นการขายอัตโนมัติ ซึ่งเป็นหลักการสำคัญด้านจริยธรรมของบริการสุขภาพ รายการเต็มอยู่ในภาคผนวก ก

### 4.2 AI Lab Report

| แผน | ราคา | สิทธิ์ |
|---|---|---|
| Free | 0 บาท | AI อ่านใบผล 1 ใบ (1 ภาพ), Lab Report แสดงทุกค่าเทียบช่วงที่พิมพ์บนใบผล, ถาม Report Explainer พร้อมแหล่งอ้างอิง |
| LabClear Plus | 355 บาท ต่อ 30 วัน ไม่ต่ออายุอัตโนมัติ | อ่านใบผลไม่จำกัดครั้ง ครั้งละ 3 หน้า, ภาพรวมผลตามเวลา, เทียบกับครั้งก่อน, พิมพ์ Lab Report |

แผน Free เป็นประตูให้ลูกค้าลองบริการ และนำไปสู่การจองแพ็กเกจหรือสมัคร Plus อัตราการเปลี่ยนเป็นสมาชิก [รอข้อมูล: วัดหลัง deploy]

ราคา Plus 355 บาท/30 วันและสิทธิ์อ่านหลายครั้งเป็นค่าในตัวอย่างของ `business_data/plans.json`; ก่อนใช้จริงต้องวัดต้นทุนระบบปัญญาประดิษฐ์ การอ่านข้อความจากภาพ ที่เก็บข้อมูล และการช่วยเหลือต่อสมาชิก พร้อมกำหนดขีดจำกัดการใช้อย่างโปร่งใส การไม่มีข้อมูลความเต็มใจจ่ายหรือกำไรต่อลูกค้าไม่รองรับการขึ้นหรือลดราคาในตอนนี้

### 4.3 ลิงก์แพ็กเกจของโรงพยาบาล

แชตแสดงลิงก์ภายนอกได้ไม่เกิน 3 รายการต่อคำตอบ จาก 7 รายการที่บันทึกไว้เมื่อ 9 ต.ค. 2569 มี 4 รายการที่ยืนยันแล้วและยังอยู่ในช่วงขาย (สมิติเวช 7,500 บาท, กรุงเทพ 5,500 และ 13,500 บาท, วิชัยยุทธ 6,500 บาท); อีก 2 รายการยังยืนยันไม่ได้ และ 1 รายการหมดช่วงขาย ระบบไม่แสดงราคาให้รายการที่ยืนยันไม่ได้หรือหมดอายุ ลิงก์เหล่านี้ไม่ใช่พันธมิตรและไม่ใช่การจองผ่าน LabClear; รายได้จากการแนะนำต่อ [รอข้อมูล: หากมีข้อตกลงในอนาคต]

### 4.4 ข้อเสนอด้านราคา ณ จุดทบทวน

**คงราคาตัวอย่างปัจจุบันไว้ ไม่ตั้งราคาใหม่และไม่เปลี่ยนรายการบริการ** จนกว่าจะทราบต้นทุนตรวจต่อแพ็กเกจ ภาษีและค่ารับชำระ เวลาเจ้าหน้าที่ ค่าใช้ระบบปัญญาประดิษฐ์ การอ่านข้อความจากภาพ ที่เก็บข้อมูล และการช่วยเหลือ พร้อมมีข้อมูลความเต็มใจจ่ายและอัตราการขอจองที่วัดได้ ตัวเลขจากรายการโรงพยาบาลเป็นข้อมูลเฉพาะรายการและวันที่ตรวจ ไม่ใช้ยืนยันราคาเฉลี่ยหรือความได้เปรียบ การทดลองราคาในอนาคตต้องมีข้อเสนอที่ตรวจต้นทุนแล้ว ตัวชี้วัดและเงื่อนไขหยุดการทดลองชัดเจน และได้รับอนุมัติก่อนเปลี่ยนราคาที่ลูกค้าเห็น

ผู้ช่วยด้านการตลาดได้ทบทวนเอกสารแบบอ่านอย่างเดียว ข้อสรุปนี้ไม่ใช่การวิจัยลูกค้าหรือการอนุมัติด้านการเงิน: ให้ใช้การเปรียบเทียบแพ็กเกจสำหรับผู้ที่กำลังวางแผนตรวจเป็นสมมติฐานหลัก ส่วนตลาดองค์กรและสมาชิก Plus เป็นสมมติฐานรอง ยังไม่มีหลักฐานความต้องการซื้อ ข้อเสนอคือทดสอบแนวคิดและความเข้าใจเป็นเวลา 2 สัปดาห์กับผู้ใช้เป้าหมาย 8–10 คน ใช้หน้าจอและข้อมูลสร้างขึ้น ไม่รับข้อมูลสุขภาพ ไม่จองหรือชำระเงินจริง และวัดความสามารถเปรียบเทียบแพ็กเกจ ความเข้าใจว่าเป็นตัวอย่าง และการทำงานจนเสร็จ ควรหยุดหากผู้เข้าร่วมเข้าใจว่าเป็นบริการแพทย์จริงหรือกังวลเรื่องความเป็นส่วนตัว การติดต่อหรือรับสมัครคนจริงยังต้องขออนุมัติและตรวจเรื่องความยินยอม/ความเป็นส่วนตัวก่อน ส่วนการทดลองนำร่องจริงต้องยืนยันสถานที่ ผู้ให้บริการ การอนุมัติทางคลินิก ต้นทุน และกำลังเจ้าหน้าที่ก่อน จึงอาจทดลองหนึ่งแพ็กเกจไม่เกิน 4 สัปดาห์หรือ 30 ครั้งที่ผู้ใช้แสดงความตั้งใจจอง (อย่างใดถึงก่อน) ข้อเสนอเหล่านี้ยังไม่เริ่ม และไม่ได้อนุมัติการติดต่อผู้ใช้หรือทดลองเปรียบเทียบราคา ดู [ผลทบทวนด้านการตลาดและราคา](../evidence/current/gl05-settlement-role-fence-20261011/marketing-review-gl05-20261011.md)

## 5. เส้นทางของลูกค้า

| ขั้น | สิ่งที่ลูกค้าทำ | สิ่งที่ระบบทำ | ผู้รับผิดชอบ |
|---|---|---|---|
| 1. ค้นพบ | เข้าหน้าแรก ค้นการตรวจ เช่น HbA1c | แสดงแพ็กเกจ แหล่งอ้างอิง 148 รายการ และผู้ช่วยแบบ dock ทุกหน้า | ระบบ |
| 2. ถาม | ถามราคา งบ หรือความหมายของค่าแล็บ | ตอบจากแคตตาล็อกและคลังความรู้พร้อมแหล่ง แสดงขั้นตอนการทำงาน | แชทบอท |
| 3. เปรียบเทียบ | เทียบแพ็กเกจสูงสุด 3 รายการ | ตารางรายการตรวจและราคา demo จากแคตตาล็อกจำลอง | ระบบ |
| 4. ขอนัด | เลือกสาขา วัน เวลา หรือกดยืนยันตัวอย่างจากแชต | สร้างคำขอเมื่อลูกค้ากดยืนยันเท่านั้น | ลูกค้า |
| 5. ยืนยันนัด | รอการแจ้งเตือน | เจ้าหน้าที่ยืนยันหรือปฏิเสธพร้อมเหตุผล ลูกค้าได้ไฟล์ปฏิทิน | เจ้าหน้าที่ |
| 6. ชำระเงิน | จ่ายที่ศูนย์หรือ PromptPay/บัตร (จำลอง) | ตรวจลายเซ็นของ webhook ไม่รับภาพหน้าจอเป็นหลักฐาน | ระบบ, เจ้าหน้าที่ |
| 7. รับผลและอ่านผล | ส่งภาพใบผลในแชต ยืนยันค่า แล้วถาม | อ่านใบผล ให้ยืนยัน อธิบายพร้อมแหล่ง แนะนำพบแพทย์เมื่อจำเป็น | แชทบอท |
| 8. ติดตาม | ตรวจซ้ำ ดูแนวโน้ม | ภาพรวมผลตามเวลา (Plus) และส่งต่อเจ้าหน้าที่ได้ทุกเมื่อ | ระบบ, เจ้าหน้าที่ |

## 6. การดำเนินงาน

### 6.1 งานของคนและงานของระบบ

| งาน | แชทบอท | เจ้าหน้าที่ | ผู้จัดการ |
|---|---|---|---|
| ตอบคำถามซ้ำ ราคา นโยบาย | ✓ | – | – |
| อธิบายใบผลที่ลูกค้ายืนยันแล้ว | ✓ | – | – |
| เสนอการจองและใบเสนอราคา | เสนอเป็นตัวอย่าง | ยืนยันนัด ออกใบเสนอราคา | – |
| คืนเงิน ส่วนลด ข้อยกเว้น | ไม่ทำ | พิจารณา | อนุมัติโปรโมชัน |
| เรื่องที่เกินขอบเขต | ส่งต่อ | รับเรื่องในกล่องข้อความ | – |
| ราคาและความจุสาขา | – | – | แก้ราคาและความจุ |
| คุณภาพ AI | – | – | ผู้ให้บริการ AI, Company Harness, คลังความรู้ |

เวลาทำการของเจ้าหน้าที่คือจันทร์–เสาร์ 07:00–16:00 น. นอกเวลาคำขอรอในคิว แชทบอทบอกลูกค้าตรง ๆ ว่ายังไม่มีเวลาตอบที่รับประกัน และเรื่องสุขภาพเร่งด่วนต้องติดต่อบริการฉุกเฉิน

### 6.2 นโยบายที่ปกป้องธุรกิจ

| นโยบาย | สาระ |
|---|---|
| ส่วนลด | ไม่มีส่วนลดอัตโนมัติ เฉพาะโปรโมชันที่ผู้จัดการอนุมัติ |
| ยกเลิกและเลื่อน | ฟรีเมื่อแจ้งล่วงหน้าอย่างน้อย 24 ชั่วโมง น้อยกว่านั้นเจ้าหน้าที่พิจารณา |
| คืนเงิน | เจ้าหน้าที่พิจารณา ไม่รับประกันการอนุมัติ |
| ใบเสนอราคา | อายุ 7 วัน องค์กรอย่างน้อย 20 คน |
| ความเป็นส่วนตัว | องค์กรเห็นเฉพาะข้อมูลการประสานงาน ไม่เห็นผลแล็บของพนักงาน แชตของผู้เยี่ยมชมไม่ถูกเก็บ |

## 7. ต้นทุนและการควบคุมค่าใช้จ่าย AI

### 7.1 ปริมาณการเรียก AI

| งาน | จำนวนการเรียกโมเดล |
|---|---|
| ข้อความปกติ 1 ข้อความ | 5 ครั้ง (ตรวจความปลอดภัยขาเข้า, วางแผน, เขียน, ตรวจทาน, ตรวจความปลอดภัยขาออก) |
| ข้อความที่ต้องแก้คำตอบ | สูงสุด 12 ครั้ง |
| อ่านใบผล 1 ครั้ง (Typhoon) | สูงสุด 7 ครั้ง (OCR หน้าละครั้ง ไม่เกิน 3 หน้า) |
| คำขอที่มีคำสั่งแทรกชัดเจน | 0 ครั้ง (หยุดก่อนเรียกโมเดล) |

### 7.2 สถานะค่าบริการของผู้ให้บริการ (ตรวจจากเอกสารทางการ 10 ต.ค. 2569)

| บริการ | ที่ใช้ | สิ่งที่เอกสารระบุ |
|---|---|---|
| Typhoon text (`typhoon-v2.5-30b-a3b-instruct`) | วางแผน เขียน ตรวจทาน | ฟรีสำหรับการใช้งานเบา 5 คำขอต่อวินาที 200 ต่อนาที งาน production ให้ใช้แผน Pro |
| Typhoon OCR | อ่านใบผล | ไม่ได้ระบุว่าฟรีหรือราคาเท่าไร 2 คำขอต่อวินาที 20 ต่อนาที |
| iApp OpenThai-SystemOne | ตรวจความปลอดภัย | ระบบเครดิต 1.25 บาทต่อเครดิต (0.89 บาทเมื่อซื้อจำนวนมาก) ได้ 50 เครดิตเมื่อสมัคร ไม่ระบุโควตาฟรีของ SystemOne |
| Render (โฮสต์) | เว็บและฐานข้อมูล | แผนฟรีหลับเมื่อไม่มีการใช้งาน ราคาแผนที่ไม่หลับ [รอข้อมูล: ราคาแผน Render ที่เลือก] |

รอบ live checkpoint มีเพียง Typhoon 1 คำขอและ iApp OpenThai-SystemOne 1 คำขอ จึงไม่ใช่ตัวอย่างพอคำนวณต้นทุนต่อข้อความ; iApp ใช้ระบบเครดิตและยังไม่ทราบว่าคำขอนี้ใช้/หักกี่เครดิต ส่วน OCR ยังไม่ได้เรียก ต้นทุนต่อข้อความและรายงาน [รอข้อมูล: usage/billing ของบัญชีจริงและจำนวนงานที่วัดได้]

ยังคำนวณ margin ไม่ได้ สูตรที่ต้องเติมด้วยข้อมูลจริงคือ contribution ต่อ package = รายรับสุทธิหลังภาษี − ต้นทุนตรวจ − ค่ารับชำระ − แรงงานผันแปร − CAC; contribution ต่อ Plus = รายรับสุทธิ − ค่า AI/OCR/storage/support/payment

### 7.3 กลไกควบคุมค่าใช้จ่าย

- **สวิตช์เครือข่าย** ระบบเรียกผู้ให้บริการไม่ได้จนกว่าเจ้าของจะเปิด `PROVIDER_NETWORK_ENABLED`
- **เพดานจำนวนครั้ง** `CLOUD_CALL_LIMIT` ต่อรอบงบ นับทุกการเรียกรวมที่ล้มเหลว
- **บัญชีบาท** งบโครงการ 300 บาท ระบบจองค่าใช้จ่ายก่อนเรียกทุกครั้ง และหยุดเมื่อเงินไม่พอ
- **นโยบายเรียกเฉพาะบริการฟรี** สำหรับรอบทดลอง เรียกได้เฉพาะ endpoint ที่เจ้าของยืนยันว่าฟรีสำหรับบัญชีนั้น พร้อมโควตากลาง
- **ไม่ลองเรียกซ้ำอัตโนมัติ** และไม่มีผู้ให้บริการสำรองที่อาจคิดเงิน
- **จำกัดงานพร้อมกัน** AI 2 งาน OCR 1 งาน ลดความเสี่ยงค่าใช้จ่ายพุ่งจากการใช้งานพร้อมกัน

## 8. ตัวชี้วัดที่ควรติดตาม

ระบบมีข้อมูลจำลองสำหรับบางขั้นตอน เช่น คำตอบ การตรวจ และคำขอนัด แต่ยังไม่มี baseline ลูกค้าจริง, acquisition, attendance, CAC หรือ retention จึงยังไม่กำหนดเป้าหมายเชิงธุรกิจ ให้เก็บเฉพาะ aggregate event ที่จำเป็นและไม่บันทึกเนื้อหาสุขภาพเพิ่มเพื่อทำ funnel

| ตัวชี้วัด | นิยาม | เป้าหมาย |
|---|---|---|
| อัตราตอบสำเร็จ | ข้อความที่ได้คำตอบ ÷ ข้อความทั้งหมด | [รอข้อมูล] |
| อัตราคำตอบที่ถูกระงับ | คำตอบที่ไม่ผ่านการตรวจ ÷ ข้อความทั้งหมด | [รอข้อมูล] |
| เวลาตอบ p95 | วินาทีจากส่งข้อความถึงคำตอบ | [รอข้อมูล] |
| อัตราเปลี่ยนเป็นนัด | คำขอนัดที่ยืนยันแล้ว ÷ ผู้ที่ถามเรื่องแพ็กเกจ | [รอข้อมูล] |
| อัตราส่งต่อเจ้าหน้าที่ | การขอคุยกับทีม ÷ บทสนทนา | [รอข้อมูล] |
| อัตราสมัคร Plus | ผู้สมัคร Plus ÷ ผู้ใช้แผน Free ที่อ่านใบผลแล้ว | [รอข้อมูล] |
| ต้นทุน AI ต่อข้อความที่ตอบสำเร็จ | ค่าใช้จ่ายในบัญชีบาท ÷ ข้อความที่ได้คำตอบ | [รอข้อมูล] |
| เหตุการณ์ความปลอดภัย | คำขอที่ถูกบล็อก และการรั่วไหล (เป้าหมายการรั่วไหลคือ 0) | 0 การรั่วไหล |

## 9. ความเสี่ยงและการรับมือ

| ความเสี่ยง | ระดับ | การรับมือในระบบ | สิ่งที่เจ้าของต้องทำต่อ |
|---|---|---|---|
| ถูกมองว่าให้คำแนะนำทางการแพทย์ | สูง | ไม่วินิจฉัย ไม่บอกยา เทียบเฉพาะช่วงบนใบผล แนะนำพบแพทย์เมื่อมีค่าวิกฤต ข้อความเตือนทุกหน้า | ให้ผู้มีคุณสมบัติทางคลินิกตรวจคำตอบก่อนใช้จริง |
| ข้อมูลสุขภาพรั่วไหล (PDPA) | สูง | เข้ารหัสข้อมูล แยกตามเจ้าของ แชตผู้เยี่ยมชมไม่ถูกเก็บ log ไม่มีข้อความลูกค้า | ทบทวนความยินยอม การเก็บรักษา และข้อตกลงกับผู้ให้บริการ AI ก่อนใช้ข้อมูลจริง |
| คำตอบผิดหรือแต่งข้อมูล | กลาง | อ้างได้เฉพาะหลักฐาน ตรวจราคาและค่าในโค้ด reviewer ตรวจอีกชั้น ระงับเมื่อไม่ผ่าน | วัดคุณภาพด้วยรอบ LIVE_FREE และตรวจโดยคน |
| ค่าใช้จ่าย AI เกินงบ | กลาง | เพดานจำนวนครั้ง บัญชีบาท ไม่ลองซ้ำ จำกัดงานพร้อมกัน | ตั้งงบและรอบงบก่อนเปิดเครือข่าย |
| ผู้ให้บริการขัดข้องหรือช้า | กลาง | deadline ต่อคำขอ ข้อความกู้คืนภาษาไทย ไม่ค้าง | พิจารณาผู้ให้บริการสำรองที่ตรวจราคาแล้ว |
| ระบบหลับหรือ 502 บนแผนฟรี | กลาง | `/ready`, การปิดอย่างนุ่มนวล, ข้อความกู้คืนในแชต | เลือกแผน Render ที่ไม่หลับเมื่อเปิดให้ลูกค้าจริง |
| ข้อมูลของโรงพยาบาลอื่น | ต่ำ | ใช้เฉพาะลิงก์และราคาที่หน้าเว็บทางการเผยแพร่ ระบุว่าไม่ใช่พันธมิตร ตรวจวันหมดอายุ | ตรวจลิงก์ทุกเดือน |
| การชำระเงินและ LINE ยังเป็นระบบจำลอง | ต่ำ | ปิดการเชื่อมต่อจริงใน Blueprint | ทำสัญญาและทดสอบกับผู้ให้บริการจริงก่อนเปิด |

## 10. แผนงานและการตัดสินใจที่รอ

| ลำดับ | งาน | ผู้ตัดสินใจ | สถานะ |
|---|---|---|---|
| 1 | ตรวจรับและ merge รุ่น 4.0.0-rc3 เข้า main ให้ Render deploy อัตโนมัติ | เจ้าของ | รอ |
| 2 | Live smoke Typhoon และ iApp OpenThai ด้วย synthetic input | เจ้าของ | ผ่าน connectivity อย่างละ 1 request; ไม่ใช่ quality/clinical test; entitlement/เครดิต iApp ยังไม่ยืนยัน |
| 3 | ผู้ตรวจทางคลินิกและผู้อ่านไทยตรวจคำตอบ | เจ้าของ | รอ |
| 4 | เลือกแผน Render และงบ AI ต่อเดือน | เจ้าของ | [รอข้อมูล] |
| 5 | ถ่ายคลิปสาธิตและส่งรายงานรายวิชา (17 ต.ค. 2569) | ทีม | รอ |
| 6 | ระยะถัดไป: ชำระเงินจริง LINE OA จริง และข้อตกลงกับโรงพยาบาลพันธมิตร | เจ้าของ | ยังไม่เริ่ม |
| 7 | เก็บ funnel แบบ aggregate: package view → compare → booking request → staff confirmation → attendance; วัด free report → Plus แยกต่างหาก | ทีม/เจ้าของ | ข้อเสนอเพื่อเรียนรู้เท่านั้น; หากผ่าน privacy/clinical/fulfillment gates ให้จำกัดไม่เกิน 4 สัปดาห์หรือ 30 booking-intent sessions (อย่างใดถึงก่อน); ยังไม่มี baseline และยังไม่เริ่ม outreach |
| 8 | เก็บต้นทุนต่อ package/Plus, ค่า provider/hosting, ค่ารับชำระ, แรงงานและ CAC; คำนวณ contribution ก่อนตัดสินใจราคา | เจ้าของ/การเงิน | รอข้อมูล; ห้ามสรุป margin จาก smoke 1 ครั้ง |
| 9 | ทบทวนราคาและกำหนด controlled price test พร้อม stopping rule | เจ้าของ | ยังไม่เปลี่ยน demo catalog; เปลี่ยนได้เมื่อมีหลักฐานและอนุมัติค่าที่ต้องการ |
| 10 | เตรียม concept/usability test สำหรับผู้ที่กำลังเลือกแพ็กเกจ | ทีมการตลาด/เจ้าของ | เสนอ 8–10 คน ภายใน 2 สัปดาห์ ด้วยข้อมูลและหน้าจอสังเคราะห์; วัด unaided comparison, การเข้าใจสถานะ demo และ task completion; stop เมื่อเข้าใจผิดว่าเป็นบริการจริงหรือมี privacy concern. NOT_RUN; ขออนุมัติ recruitment/consent ก่อนติดต่อคนจริง; ไม่ใช้เพื่ออ้าง demand หรือ willingness-to-pay |

## 11. ผลการทดสอบ checkpoint GL-03 และการตรวจรับฟังก์ชัน

checkpoint นี้แยกหลักฐาน offline/mock ออกจาก live API smoke: Playwright ใช้ LLM/OCR doubles และปิดเครือข่าย provider; live Typhoon/OpenThai เป็นหลักฐานเดิมอย่างละหนึ่ง request ด้วย synthetic input ไม่เรียกซ้ำในรอบนี้ ไม่ใช้ OCR API ไม่โอนเงินจริง ไม่ push/deploy application source ถูกแก้ใน worktree เพื่อให้ closed ticket ปฏิเสธ chat/report mutations และให้เปิดแชตใหม่ได้; candidate commit สำหรับรอบทดสอบคือ `73d24b9cc4281b74829b63603786427d14cbe5c7` โดย source/test files ยัง dirty และมี SHA-256 แยกใน evidence manifest

### 11.1 ผลก่อนและหลังแก้

| สถานะ | ผลที่ตรวจพบ | การแก้ที่ทำ | ผลหลังแก้ |
|---|---|---|---|
| ก่อนแก้ | handoff ticket ไม่เก็บ chat ที่ร้องขอ และ staff route อ้าง active chat ของ owner ได้ | เพิ่ม immutable `chat_id`, `mode_epoch`, `conversation_version`, `assignment_epoch` และ exact-chat lookup | focused regression ผ่าน; chat อื่นไม่ถูกนำมาแสดง |
| ก่อนแก้ | staff state/reply ไม่มี version precondition | เพิ่ม required `expected_version`/`assignment_epoch`; payload ที่ขาดฟิลด์ถูกปฏิเสธด้วย 422 และ stale request ได้ 409 | stale mutation ไม่เขียน ticket/conversation; legacy client ต้องอัปเดตก่อนใช้งาน |
| ก่อนแก้ | takeover ใช้ version เดิมเป็นกลไกเดียว | bump `version` และ `mode_epoch` เมื่อ handoff/takeover/return | late bot result ถูก discard ตาม finalization guard |
| หลังแก้ | client เดิมส่งเฉพาะ state/message | กำหนดให้ส่ง fields ใหม่ทุกครั้งเพื่อรักษา stale-write guard | regression ยืนยัน legacy payload ถูกปฏิเสธโดยไม่เปลี่ยน state; current payload ผ่าน |
| ก่อนเพิ่มหลักฐาน | UI-04 ระบุว่า guest ต้องมีบัญชี แต่ runner ยังไม่ assert account gate หรือการไม่มี booking request | เพิ่มการเลือก slot, assert account dialog, ตรวจว่าไม่มี POST ไป `/api/business/bookings` และ capture P99 404 | UI-04 PASS ใน UAT รอบ `final03`; รอบล่าสุดเก็บภาพทั้ง account gate และ 404; ไม่มี application behavior change |
| รอบ live provider | OpenThai preflight สองครั้งไม่ผ่าน selector ของ runner ก่อนยิง API | เปลี่ยนไปเลือก provider card จากหัวข้อ DOM ที่แสดงจริง แล้วตรวจ syntax ก่อนรัน | สองครั้งแรก BLOCKED/0 provider calls; รอบสุดท้าย `LIVE-PROV-OPENTHAI-01` PASS/1 call/HTTP 200; ไม่ใช่ app fix |
| UI-28 | รอบก่อนมี `apiRequestContext.get: socket hang up` ระหว่างอ่าน provider state | คง assertion การ mask key และ secret non-return; รัน full suite ด้วย isolated fixture ใหม่ | `PASS` ใน final03; สาเหตุของ historical socket hang-up ยังไม่พิสูจน์ จึงคงเป็น residual diagnostic risk |
| ก่อนแก้ UAT synchronization | historical run คลิก New chat จาก closed history แล้วอ่าน workspace ทันที จึงได้ 36 PASS/1 FAIL จาก race ของ test | เปลี่ยนเฉพาะ UAT ให้รอ POST `/api/business/chats` และรอ composer กลับมาใช้งานก่อนอ่าน workspace; ไม่ลด assertion และไม่แก้ application behavior | UI-16 `PASS` ใน final03; full browser suite `PASS` จาก raw `37/0`, exit code 0 |
| Closed-thread regressions | ก่อนเพิ่ม guard แชตที่ ticket ปิดยังส่งข้อความ/แนบรายงาน/ยืนยันค่ารายงานต่อได้; เปิด history อาจเปลี่ยนกลับเป็น bot | เพิ่ม server-side closed guard, เก็บ mode เมื่อเปิด history, ปิด composer/attachment และเริ่มแชตใหม่แยก thread; เพิ่ม regression 3 กรณี | ก่อนแก้ regression 3 กรณี FAIL; หลังแก้ focused 5 PASS, full offline pytest 547 PASS/1 warning และ UI-16 final03 PASS |

### 11.2 Requirement → test → evidence

| Requirement | Test cases | ผล | หลักฐานรอบ 11 ต.ค. 2569 |
|---|---|---|---|
| ลูกค้าเลือกแพ็กเกจ สมัคร/เข้าสู่ระบบ จอง และใช้แชต/รายงาน | UI-01–UI-10, UI-24, UI-26–UI-27, UI-29–UI-32 | ราย case อยู่ใน raw; suite `FAIL` หากมี case ใด fail | [README/case convention](../evidence/current/browser-uat-final-20261012-03/README.md), [raw JSON](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) |
| เจ้าหน้าที่/ผู้จัดการดู inbox จัดการนัด ใบเสนอราคา ลูกค้า ราคา demo และ audit | UI-11–UI-13, UI-17, UI-23, UI-25, UI-28–UI-29, UI-32 | PASS ตามแต่ละ case ที่ raw ระบุ; ราคา live ไม่เปลี่ยน | [manager simulator](../evidence/current/browser-uat-final-20261012-03/UI-17_manager-price-simulator-1440.png), [raw case results](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) |
| bot↔admin handoff, reply, resume, close, history และป้องกัน stale/cross-chat state | UI-16, UI-18, UI-34 และ GL-03 regression | PASS ใน local fixture; closed mutation, privacy, resume/requeue/history/new chat assertions ครบ | [closed thread](../evidence/current/browser-uat-final-20261012-03/UI-16_handoff-closed-390.png), [raw UAT](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) |
| History, guest privacy, close, expiry และ legacy purge | UI-05, UI-14, UI-16, UI-19, UI-25, UI-31, UI-33; `PY-GL03-CLOSED-01..03`, `PY-GUEST-EXPIRY-01`, `PY-GUEST-PURGE-01` | PASS สำหรับ local behavior ที่ทดสอบ; durable backup/restore NOT_RUN | [guest state](../evidence/current/browser-uat-final-20261012-03/UI-33_guest-temporary-1440.png), [offline pytest XML](../evidence/current/browser-uat-resume-20261012-01/offline-pytest.xml), [raw cases](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) |
| Package, booking และ payment แบบจำลอง | UI-02–UI-07, UI-15, UI-17, UI-26–UI-27; `PY-PAYMENT-EXPIRY-01` | PASS เฉพาะ simulator; real settlement NOT_RUN | [payment simulator](../evidence/current/browser-uat-final-20261012-03/UI-15_payment-simulator-1440.png), [raw cases](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) |
| Mobile/tablet 390×844 และ 768×1024 | UI-21-mobile, UI-21-tablet, UI-31 | PASS ตาม no-overflow/navigation assertions | [mobile](../evidence/current/browser-uat-final-20261012-03/UI-21-mobile_app-390.png), [tablet](../evidence/current/browser-uat-final-20261012-03/UI-21-tablet_app-768.png) |
| Negative, retry, 404, network, permission, guest revoke และ navigation race | UI-02b, UI-04, UI-08, UI-16, UI-19–UI-20, UI-22, UI-33–UI-34 | PASS ทุก case; raw มี 0 failed screenshots และ 0 browser errors | [network error](../evidence/current/browser-uat-final-20261012-03/UI-02b_catalog-network-error-1440.png), [permission gate](../evidence/current/browser-uat-final-20261012-03/UI-19_customer-staff-denied-1440.png), [raw cases](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) |
| Durable backup/restore, clinical/model quality, live settlement, production uptime/deploy, demand and unit economics | ไม่มี production dependency/ข้อมูลลูกค้าจริงในขอบเขตนี้ | NOT_RUN / unknown | [UAT scope and limitations](../evidence/current/browser-uat-final-20261012-03/README.md) |

### 11.3 ขอบเขตหลักฐานและความเสี่ยงคงเหลือ

Playwright รอบ `final03` บันทึกเวลาจริง, candidate SHA, dirty diff SHA, environment, case ID, expected/actual/status และ screenshot hash ไว้ใน [raw UAT](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) พร้อมคำอธิบายชุดหลักฐานใน [README](../evidence/current/browser-uat-final-20261012-03/README.md). ผลรวมจาก raw คือ `37 PASS / 0 FAIL / 0 browser errors`, exit code 0; checkpoint local UAT จึงเป็น `PASS`. Runner ใช้ local `OFFLINE/MOCKED_TEST_ONLY`, temporary SQLite, provider network disabled, LLM/OCR doubles และข้อมูลสังเคราะห์.

Full offline pytest ได้ **547 passed, 1 warning**, exit code 0; warning เดียวเป็น deprecation จาก `starlette.testclient`/`httpx`. Guest expiry/rollback, legacy guest purge และ payment simulator expiry ผ่านในชุด offline; ไม่ใช่หลักฐาน durable backup/restore หรือ production retention. รายละเอียดผลอยู่ใน [raw pytest XML](../evidence/current/browser-uat-resume-20261012-01/offline-pytest.xml).

Rebuild และตรวจ render PDF ทั้งสองฉบับแล้ว: จำนวนหน้า, Thai text, empty pages, ตาราง, ภาพ, font fallback และ page break อยู่ใน [render QA JSON](../evidence/current/report-render-final-20261012-03/report-render-qa.json). รอบนี้ตรวจ 58 หน้า, 0 empty, 0 pages without Thai, 0 replacement glyphs และ 2 image objects. เครื่องนี้ไม่มี TH Sarabun New จึงใช้ IBM Plex Sans Thai ที่ bundled ใน repository ตาม fallback เดิม; ไม่ได้สร้างธีมใหม่.

Live smoke แยกจาก Playwright/offline: `LIVE-PROV-TYPHOON-01` และ `LIVE-PROV-OPENTHAI-01` เคยยิง synthetic request อย่างละ 1 ครั้งและได้ HTTP 200/format ผ่าน. ไม่ยืนยัน model quality, safety efficacy, clinical correctness หรือสิทธิ์ free-credit/debit ของ iApp. รอบ checkpoint นี้ไม่เรียก API ซ้ำ, ไม่เรียก OCR, ไม่โอนเงินจริง, ไม่ push และไม่ deploy.

ความเสี่ยงคงเหลือ: durable backup/restore และ production retention, delivery แบบ durable, race ภายใต้ production load, clinical/model/OCR quality, real settlement, customer demand, unit cost/CAC/contribution และ willingness-to-pay ยัง `NOT_RUN` หรือ unknown. UI-16 และ UI-28 ผ่านใน final03 แต่ historical synchronization/socket-hang root cause ไม่ได้พิสูจน์เชิง production. ข้อเสนอ Marketing/Pricing เป็นสมมติฐานและแผนทดลองเท่านั้น ไม่มี recruitment, outreach, live catalog price change หรือ price test; ดู [review](../evidence/current/gl05-settlement-role-fence-20261011/marketing-review-gl05-20261011.md).

Independent review ต่อ exact candidate รอบนี้ถูกขอจาก Hume และ retry แล้ว แต่ไม่ส่งผลกลับก่อน closeout; MAIN จึงทำ serial review บน staged candidate `HEAD 73d24b9` แทน. ไม่พบ blocking finding ในส่วนที่ตรวจ แต่ independence ลดลงและผลนี้ไม่ใช่ independent approval. การ push ทำหลัง hygiene และ review gate.

## 12. Checkpoint GL-05: จำกัดสิทธิ์การบันทึกใบเสร็จจำลอง

GL-05 แก้เฉพาะเส้นทาง simulator ของการชำระเงินที่ศูนย์ ไม่ใช่การทำ bank settlement หรือรับเงินจริง. ก่อนแก้ endpoint `/api/business/staff/bookings/{id}/settle` อนุญาตบทบาทที่ไม่ใช่ manager ในเส้นทางที่ยืนยันแล้วว่าเปลี่ยนสถานะได้; หลังแก้ server ตรวจ `role == manager` ก่อนอ่าน/เขียน booking และ UI แสดง action เฉพาะ manager. บัญชี `staff` และ `clinical` ถูกปฏิเสธด้วย 403 โดยไม่สร้าง receipt, audit หรือ notification.

### 12.1 ผลก่อนและหลังแก้

| จุดตรวจ | ก่อนแก้ | การแก้ | หลังแก้ | สถานะ |
|---|---|---|---|---|
| Server authorization | regression พบว่า non-manager ยังได้ HTTP 200 จาก settlement simulator | เพิ่ม manager-only fence ใน `routers/business.py` ก่อน mutation | `staff` และ `clinical` ได้ 403; payment ยังคง `pending`, ไม่มี `receipt_id` และไม่มี audit `payment.center_settled` | PASS |
| Manager path | ต้องคงเส้นทางบันทึก receipt เดิม | คง idempotent simulator และข้อความระบุว่าไม่มีเงินจริงเคลื่อนย้าย | manager ยังบันทึก/เห็น action ได้ใน isolated fixture; route สร้าง `demo-receipt-*` เท่านั้น | PASS |
| Staff UI | test เดิมใช้ fixture ที่ชื่อ staff แต่ role เป็น manager ทำให้หลักฐานคลุมเครือ | เพิ่ม synthetic BKK01 `staff` account และยืนยัน `session.user.role` ใน UAT | staff confirm/decline ได้ แต่ไม่เห็น `Record simulated receipt`; manager เห็นหลังเลือก `Confirmed` | PASS |
| Browser regression | UI-13 รอบแรก timeout เพราะ filter/role ไม่ตรงกับ expected; UI-16 รอบก่อนอ่าน state ก่อน POST จบ | แยก context staff/manager, เลือก filter confirmed และรอ POST New chat ใน UI-16 | UI-13 และ UI-16 ผ่านใน final03 พร้อมภาพใหม่; full UAT 37/0 | PASS |

### 12.2 Requirement → test → evidence

| Requirement | Test / ขั้นตอน | Expected / Actual | Status | Evidence |
|---|---|---|---|---|
| manager เท่านั้นบันทึก receipt จำลอง | `test_center_settlement_and_refund_need_role`, `test_staff_and_clinical_cannot_settle_center_payment`, `test_settlement_is_idempotent_and_refund_is_terminal` | manager path ผ่าน; staff/clinical 403 และ state/receipt/audit ไม่เปลี่ยน | PASS | [tests/test_business_v3.py](../../tests/test_business_v3.py), `80 passed` focused |
| UI role ตรงกับ server | UI-13: login staff, assert role, confirm/decline, inspect no settlement; login manager, assert role, filter confirmed, inspect action | ผลตรงตาม expected ทั้งสอง role | PASS | [staff screenshot](../evidence/current/browser-uat-final-20261012-03/UI-13_staff-appointments-1440.png), [manager screenshot](../evidence/current/browser-uat-final-20261012-03/UI-13_manager-simulated-receipt-1440.png) |
| customer/admin, handoff, history/privacy, package/payment simulator, mobile, negative paths | UI-01–UI-34 ใน full UAT | Raw final03 มี 37 PASS / 0 FAIL / 0 browser errors, exit code 0 | PASS (local mocked UAT) | [raw UAT](../evidence/current/browser-uat-final-20261012-03/browser-uat.json), [case convention](../evidence/current/browser-uat-final-20261012-03/README.md) |
| retention/backup/restore และเงินจริง | ไม่มี production retention clock, backup target หรือ bank integration ใน fixture | ไม่ได้ทดสอบและไม่มีหลักฐานแทน | NOT_RUN | [scope limitations](../evidence/current/browser-uat-final-20261012-03/README.md) |

### 12.3 หลักฐานรอบใหม่และข้อจำกัด

รอบ Playwright `final03` ใช้ Windows, Node.js 24.19.0, Python 3.12.10, Playwright 1.56.1 และ isolated offline fixture. ผลรวม 37/0, candidate SHA, diff SHA, screenshot hashes และ status porcelain อยู่ใน [raw JSON](../evidence/current/browser-uat-final-20261012-03/browser-uat.json) และ [README](../evidence/current/browser-uat-final-20261012-03/README.md); ไม่มี failure screenshot ในรอบนี้ และ screenshot ทั้งหมดเป็นผลจากการรันจริง

Focused business pytest ได้ **80 passed / 1 warning** และ full offline pytest ได้ **547 passed / 1 warning**, exit code 0. warning เป็น deprecation ของ `starlette.testclient`/`httpx`; runner ปิด outbound socket และใช้ข้อมูลสังเคราะห์. Candidate คือ `73d24b9cc4281b74829b63603786427d14cbe5c7` + dirty worktree; source/diff fingerprint ที่ตรงกับรอบ `final03` อยู่ใน raw JSON. รายงาน PDF ที่ build ใหม่มี Thai text/page count/empty page และ visual checks ตาม [render QA](../evidence/current/report-render-final-20261012-03/report-render-qa.json)

ความเสี่ยงคงเหลือ: retention/backup/restore, real settlement, production finance RBAC, live LLM/OCR quality, demand, unit economics และ willingness-to-pay ยัง NOT_RUN/unknown. UAT synchronization ของ UI-16 ถูกแก้ใน test และผ่าน final03; historical socket-hang ของ UI-28 ไม่ได้ใช้เป็นหลักฐาน production. ข้อเสนอ Marketing ที่ตรวจโดย platform subagent คือคงราคา demo เดิม, งบ paid experiment 0 บาท และวัด aggregate funnel ไม่เกิน 4 สัปดาห์หรือ 30 booking-intent sessions หลัง release gates; ไม่ใช่ customer research และไม่มีการเปลี่ยน live catalog. ดู [marketing/pricing review รอบนี้](../evidence/current/gl05-settlement-role-fence-20261011/marketing-review-gl05-20261011.md).

## ภาคผนวก ก. รายการแพ็กเกจ

| รหัส | แพ็กเกจ | รายการตรวจ | ราคา (บาท) | การจอง |
|---|---|---|---|---|
| P01 | Essential Check | CBC, Fasting glucose, Creatinine/eGFR, Urinalysis | 1,190 | จองได้ทันที |
| P02 | Workday Check | CBC, Fasting glucose, Lipid profile, Creatinine/eGFR, ALT, Urinalysis | 1,690 | จองได้ทันที |
| P03 | Comprehensive Check | CBC, HbA1c, Lipid profile, Creatinine/eGFR, Liver panel, Urinalysis | 2,890 | จองได้ทันที |
| P04 | Family Pair | Essential Check สำหรับผู้ใหญ่ 2 คน | 2,290 ต่อคู่ | จองได้ทันที |
| P05 | Glucose Follow-up | Fasting glucose, HbA1c | 590 | เจ้าหน้าที่พิจารณาก่อน |
| P06 | Lipid Follow-up | Total cholesterol, Triglycerides, HDL cholesterol, Direct LDL cholesterol | 590 | เจ้าหน้าที่พิจารณาก่อน |
| P07 | Kidney Follow-up | BUN, Creatinine/eGFR, Urinalysis | 690 | เจ้าหน้าที่พิจารณาก่อน |
| P08 | Liver Follow-up | ALT, AST, ALP, Albumin, Bilirubin | 890 | เจ้าหน้าที่พิจารณาก่อน |
| P09 | Blood Count Review | CBC | 390 | เจ้าหน้าที่พิจารณาก่อน |
| P10 | Thyroid Function Review | TSH, Free T4 | 990 | เจ้าหน้าที่พิจารณาก่อน |
| P11 | Urine Albumin Review | Urine albumin to creatinine ratio | 590 | เจ้าหน้าที่พิจารณาก่อน |
| P12 | Electrolyte Review | Sodium, Potassium, Chloride, Bicarbonate | 490 | เจ้าหน้าที่พิจารณาก่อน |
| P13 | HbA1c Add-on | HbA1c | 350 | เจ้าหน้าที่พิจารณาก่อน |
| P14 | Direct LDL Add-on | Direct LDL cholesterol | 290 | เจ้าหน้าที่พิจารณาก่อน |
| P15 | Ferritin Review | Ferritin | 650 | เจ้าหน้าที่พิจารณาก่อน |
| P16 | Corporate Essential | CBC, Fasting glucose, Creatinine/eGFR, Urinalysis | 990 ต่อคน | องค์กร 20 คนขึ้นไป |
| P17 | Corporate Workday | CBC, Fasting glucose, Lipid profile, Creatinine/eGFR, ALT, Urinalysis | 1,490 ต่อคน | องค์กร 20 คนขึ้นไป |
| P18 | Corporate Extended | CBC, HbA1c, Lipid profile, Creatinine/eGFR, Liver panel, Urinalysis | 2,390 ต่อคน | องค์กร 20 คนขึ้นไป |

แหล่งข้อมูล: `business_data/catalog.json`, `branches.json`, `policies.json`, `plans.json`, `hospital_links.json`, `docs/evidence/current/provider-free-tier-check.md` และเอกสารทบทวนตลาดของทีม (5 ต.ค. 2569)
