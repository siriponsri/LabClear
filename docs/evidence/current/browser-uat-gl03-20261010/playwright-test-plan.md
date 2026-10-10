# แผนทดสอบ Playwright ตาม requirement

แผนนี้ใช้กับฟังก์ชันที่มีจริงใน candidate `101e5e2` และแยกผล `OFFLINE/MOCKED_TEST_ONLY` ออกจาก live โดยตั้งใจไม่เรียก LLM/OCR API จริง ไม่ทำธุรกรรมเงินจริง และไม่ deploy

| Requirement | ความเสี่ยง/สิ่งที่ต้องยืนยัน | Test cases | ระดับ | เกณฑ์ expected |
|---|---|---|---|---|
| R-CUSTOMER | ลูกค้าเลือกบริการ ถามข้อมูล อัปโหลดใบผล และส่งคำขอได้โดยไม่เกิด booking/payment โดยไม่ยืนยัน | UI-01, UI-05–UI-10, UI-24, UI-26, UI-30 | E2E | หน้าจอและข้อมูลสอดคล้องกัน, action สำคัญต้องยืนยัน, reload ไม่ทำข้อมูลหายโดยผิดขอบเขต |
| R-ADMIN | staff/manager เห็นเฉพาะงานตามสิทธิ์ จัดการ inbox, quote, catalog, roles และ audit ได้ | UI-11–UI-13, UI-17, UI-23, UI-25, UI-28, UI-32 | E2E/permission | staff flow ทำงาน, manager-only controls ไม่รั่ว, audit/payment state ถูกต้อง |
| R-HANDOFF | bot กับคนรับช่วงต่อบนเคสเดียวกัน และ late bot result ไม่เขียนทับคำตอบคน | UI-16, UI-18, UI-34; pytest GL-03 regression | E2E/API | Take over หยุด bot, reply ไปยัง customer chat ที่ถูกต้อง, stale/mismatch ได้ 409/404 |
| R-HISTORY | chat/project/history และ notification แยกตามเจ้าของและ chat | UI-14, UI-25, UI-31, UI-33 | E2E/privacy | เปิด chat เดิมเห็นเฉพาะ transcript เดิม, guest ไม่มี durable history |
| R-RETENTION-PRIVACY | guest close/reload/signup และ cross-user/role access ต้อง fail closed | UI-19, UI-33, UI-34; existing privacy pytest | E2E/security | ไม่เผย token/chat/report ข้าม session และ staff API ปฏิเสธ customer |
| R-PACKAGE-PAY | catalog/filter/compare/booking และ package plan/payment จำลองไม่กลายเป็นเงินจริง | UI-02–UI-04, UI-06–UI-07, UI-15, UI-26–UI-27 | E2E | ราคา/แพ็กเกจตรง source, payment แสดง simulation ชัด, invalid route/error กู้คืนได้ |
| R-MOBILE | desktop/tablet/mobile ไม่มี horizontal overflow และ controls ใช้งานได้ | UI-21-tablet, UI-21-mobile, UI-31 | visual/E2E | drawer/filter/app controls ไม่ถูกตัด, overflow false, reduced motion ทำงาน |
| R-NEGATIVE | invalid input, network error, 404, permission, retry, stale navigation และ dialog escape | UI-02b, UI-04, UI-08, UI-19–UI-20, UI-22, UI-33–UI-34 | negative/E2E | error เป็น recoverable หรือ fail closed, ไม่เกิด uncaught JS error, ไม่ duplicate mutation |

## ขั้นตอนร่วม

1. เริ่ม isolated fixture server ผ่าน `tests/browser/uat.cjs` และรอ `/health` สำเร็จ
2. เปิด browser context ด้วย synthetic account/session; customer และ staff ใช้ context แยกกัน
3. ทำ action ตาม case ID ด้วย locator/keyboard/HTTP assertion ของ runner
4. ตรวจ state ที่ผู้ใช้เห็นและ state จาก API/workspace เมื่อ case ระบุ storage/permission
5. บันทึก screenshot เฉพาะเมื่อ runner capture หลัง state ที่ระบุ; ถ้าไม่มีภาพ state นั้นให้ระบุ `NOT_RUN`
6. ปิด browser/server และเขียน raw JSON พร้อม candidate SHA, status, errors และ screenshot list

## สิ่งที่อยู่นอกแผนรอบนี้

`LIVE_FREE`, live LLM/OCR, OCR accuracy, production Render, push/deploy, real bank transfer, real card/PromptPay settlement, retention purge ตามเวลาจริง และ quota จริงเป็น `NOT_RUN` ไม่ใช่ PASS
