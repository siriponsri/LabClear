# แผนพัฒนา LabClear เพื่อเปิดใช้งานจริง

เวอร์ชันเอกสาร 1.0 — 10 ตุลาคม 2026 · เอกสารข้อกำหนดสำหรับนักพัฒนาและ Claude Cowork cloud

**สถานะ: สเปกที่เสนอ ยังไม่ได้พัฒนาตามเอกสารนี้ และไม่ใช่การรับรองความพร้อมเปิดบริการ**

Repository: https://github.com/siriponsri/LabClear · เป้าหมายเดิม: https://labclear.onrender.com
ฐานโค้ดที่ใช้ตรวจ: `2a98a27d3016631560aeca1ce58a0915feca0100` บน `main` ซึ่ง deploy แล้ว
เอกสารนี้เสริม HANDOFF; ใช้หลักฐานใน `docs/evidence/current/bound-output-20261010/` และประวัติ live ใน `docs/evidence/current/canonical-coursework-20261010/` ร่วมกัน

**หมายเหตุฐานข้อมูล:** เอกสาร v1.0 นี้วิเคราะห์ source snapshot `2a98a27` ไม่ใช่ audit candidate ปัจจุบัน; P0 checkpoint ตรวจที่ `302c14e0b2f9abbdd88b4bb5dc57e31a8e282204` และมี report/evidence ที่ยัง dirty โดย checkpoint นี้ไม่มีการเปลี่ยน application source. ให้ถือรายการ “มีแล้ว/ช่องว่าง” ด้านล่างเป็นข้อค้นพบของ snapshot เดิม และตรวจ source, tests, HEAD และ diff ของ candidate ล่าสุดก่อนใช้เป็น task implementation หรือ release decision

## 1. ขอบเขตและหลักการตัดสินใจ

เป้าหมายแรกคือบริการเชิงพาณิชย์ขนาดจำกัด: ดูแพ็กเกจที่ตรวจสอบแล้ว ส่งคำขอจอง คุยเจ้าหน้าที่ รับโอนที่ตรวจยอดจริง และติดตามคำสั่งซื้อ โดยแยกการอนุมัติเปิด “ตีความผลตรวจสุขภาพ” ออกจากการเปิดส่วนธุรกิจ

รักษา FastAPI/Jinja/JavaScript แบบบริการเดียว, `/app`, `/staff`, transaction/store และ provider harness เดิม ใช้ SQLite สำหรับทดสอบและ PostgreSQL สำหรับ hosted ตามโค้ดเดิม ไม่สร้างระบบแชต/คำสั่งซื้อคู่ขนาน ไม่ย้าย hosting ไม่เพิ่ม microservices และไม่อนุมัติแพลนเสียเงินจากเอกสารนี้

P0 = ต้องผ่านก่อนรับลูกค้าจริงในฟีเจอร์ที่เกี่ยวข้อง; P1 = เพิ่มหลัง pilot ที่ควบคุมได้ งานทุกข้อด้านล่างเป็นข้อเสนอ เว้นแต่ระบุว่า “มีแล้ว” ชัดเจน

การพัฒนาต้องรักษา Safety Guard, guest privacy, cost ledger, quota และงบเดิม ห้าม reset spend, เปลี่ยนคีย์, เรียก AI/OCR จริง, เปิดรับเงินจริง, push หรือ deploy โดยอ้างเอกสารนี้เป็นคำอนุญาต

## 2. สิ่งที่มีแล้วและช่องว่างที่ต้องพัฒนา

| ส่วน | สิ่งที่ตรวจพบใน source | งานเพิ่ม/ข้อจำกัด |
|---|---|---|
| Human handoff | `routers/business.py`: `/handoffs`, staff inbox, ticket view/state/messages; มี `waiting`, `staff`, `bot`, `closed`, ผู้รับเคสและ audit; guest ต้องเข้าสู่ระบบก่อนส่งเคส | เพิ่ม state/version contract, explicit chat binding, คิว/เวลาทำการ/รับคืนเคส และทดสอบ race ข้าม reconnect/restart |
| ป้องกันคำตอบเก่า | workflow มี conversation version และตรวจตอนบันทึกผล รวมถึง cancellation cleanup | ต้องพิสูจน์ว่า takeover/resume/เปลี่ยนแชตปิดช่องตอบซ้อนทุกเส้นทาง ไม่ถือว่าไม่มีเพราะมี safeguard เดิมอยู่แล้ว |
| Chat history | `services/chat_sessions.py`: active conversation ต่อ owner และ archive ตาม chat; staff reply เก็บท้าย 100 ข้อความ | จำนวน 100 ข้อความไม่รับประกันเก็บครบหนึ่งวัน; ticket view อ้าง active conversation ของ owner จึงต้องผูก ticket กับ chat ที่เปิดเคสอย่างถาวร |
| Guest | `services/guest_memory.py`: process memory, TTL 20 นาทีที่ touch ต่ออายุได้, revoke/expiry; token อยู่ในหน่วยความจำหน้าเว็บ | ต้องคงโหมดชั่วคราว ห้ามเปิด durable/admin history ให้ guest โดยปริยาย; ปิดแท็บ/reload/restart มีข้อจำกัดตามโหมดเดิม |
| Durable storage | `services/business_store.py`: encrypted records, SQLite local, hosted PostgreSQL และ transaction serialization | เพิ่ม retention jobs, indexes/constraints, restore test และพิสูจน์ access isolation; encryption อย่างเดียวไม่พอ |
| จอง/ชำระเงิน | มี booking request, staff confirm, checkout expiry, idempotent actions, simulator/test payment, center settlement และ refund routes | ยังไม่ใช่ระบบโอนธนาคารจริงที่รับรองแล้ว; `demo-receipt`/simulated refund ห้ามนำมาแสดงว่าเงินจริงสำเร็จ |
| ผลตรวจ | `report_binding.py`, `ocr_binding.py`, `policy_binding.py` เพิ่มการผูกแถวและจำกัดข้อความ | OCR ยังไม่ครบ ความถูกต้องทางคลินิกและ live ใหม่ยังไม่ผ่าน gate |

ก่อนลงมือให้ตรวจ HEAD และ diff ใหม่เสมอ: ข้อค้นพบนี้เป็น snapshot ของ revision ข้างต้น ไม่ใช่ audit production database หรือความรับรองว่าทุกเส้นทางปลอดภัย

## 3. ความปลอดภัยของผลตรวจ: gate แยกต่างหาก

บน `7343d7a` กรณีสมมติ I02 ส่งผ่าน API จริงถึงข้อคาดการณ์ “ภาวะไตเรื้อรังระยะที่ 4” และตรวจซ้ำในสามเดือน แม้ reviewer/guard ผ่าน ไม่ได้ withheld; ไม่มี screenshot ของ I02 จึงไม่อ้างว่าเห็นภาพบนจอจริง ดู `I02-EXPOSURE.md`

`2a98a27` deploy แล้วและ `/health`, `/ready` เคยยืนยัน SHA ตรงกัน แต่ **live benchmark ของ revision นี้ = NOT_RUN** การพร้อมตอบ HTTP ไม่ใช่หลักฐานคุณภาพคำตอบ

| หลักฐานที่มี | ผล | สิ่งที่ห้ามสรุป |
|---|---|---|
| Local pytest | 531 ผ่าน | ไม่พิสูจน์ผู้ให้บริการจริงหรือความปลอดภัยทางคลินิก |
| R01–R12 | 12/12, zero outbound attempts | ไม่ใช่ uptime SLA |
| Business UAT / TH–EN render | 36/36 และ 2/2 | มี doubles/การฉีดข้อความสมมติ ไม่ใช่ live consultation |
| Frozen OFFLINE20 | 16/20; I01/I02/I04/I05 ไม่ผ่าน; 85/93 ค่า, 78/93 หน่วย, 70/93 ช่วงอ้างอิง, 86/93 flags ตรง | ห้ามแก้ expected values หรือรายงาน 20/20; Tesseract stand-in ไม่ใช่ Typhoon |
| Historical LIVE20 บน 7343d7a | 12 PASS / 5 FAIL / 3 errors | ห้ามยกผลไปเป็นของ 2a98a27 |

P0: ผู้รับผิดชอบคลินิกต้องกำหนดขอบเขตและลงนามรับผลการประเมินก่อนเปิดตีความรายงานให้ลูกค้าจริง ระหว่างนี้เสนอ feature flag ปิด public report interpretation/medical inference หรือจำกัดเป็นการดูข้อมูลที่ยืนยันแล้วและส่งต่อผู้เชี่ยวชาญตามขอบเขตที่อนุมัติ การส่งต่อ Admin ทั่วไปไม่เท่ากับคำปรึกษาจากบุคลากรทางการแพทย์

ยังมีความเสี่ยง Q03 เรื่อง fasting และ Q07 เรื่องเวลายืนยันที่อนุมานผิด รวมถึง OCR variability, reviewer false rejection และ fallback ที่จับแถวไม่ได้ การเปิดส่วนธุรกิจควรใช้ข้อเท็จจริงแพ็กเกจ/นโยบายที่ยืนยันแล้ว และปิดคำแนะนำสุขภาพที่ยังไม่ผ่าน clinical gate

## 4. งาน GL-01 — นโยบายข้อมูลและคำแจ้งผู้ใช้ (P0; ก่อน GL-02–06)

ผู้ควบคุมข้อมูลและผู้ตรวจด้านกฎหมายต้องกำหนดฐานกฎหมาย วัตถุประสงค์ ผู้เข้าถึง ระยะเก็บ ช่องทางใช้สิทธิ และการส่งข้อมูลไป AI/cloud ต่างประเทศให้เหมาะกับบริการจริง ข้อมูลสุขภาพที่ระบุตัวบุคคลเป็นข้อมูลอ่อนไหว; มาตรา 26 โดยทั่วไปต้องมีความยินยอมโดยชัดแจ้งหรือข้อยกเว้นที่ใช้ได้จริง ห้ามสมมติว่า healthcare exception ใช้กับแอปนี้โดยอัตโนมัติ มาตรา 23 ว่าด้วยคำแจ้ง และมาตรา 30–37 เกี่ยวข้องกับสิทธิ/ความมั่นคงปลอดภัย ต้องให้ผู้เชี่ยวชาญไทยประเมิน DPO และหน้าที่เฉพาะของบริการด้วย เอกสารนี้ไม่รับรอง compliance [พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล](https://ratchakitcha.soc.go.th/documents/17082307.pdf)

ข้อกำหนดผลิตภัณฑ์ที่เสนอ:

1. ก่อนเก็บ durable/support history แสดงหน้าคำแจ้งไทย/อังกฤษที่อ่านง่าย: ใครอ่านได้ เก็บอะไร นานเท่าใด เพื่ออะไร ผู้ให้บริการภายนอกใด และถอนความยินยอม/ลบได้อย่างไร
2. แยก opt-in ส่งข้อมูลให้เจ้าหน้าที่, เก็บบทสนทนา, ส่ง AI และการตลาด; ไม่มี checkbox ติ๊กไว้ล่วงหน้า และไม่ผูกการซื้อแพ็กเกจกับความยินยอมเก็บข้อมูลสุขภาพที่ไม่จำเป็น
3. เก็บ `notice_version`, `purpose`, `legal_basis`, `scope`, `actor`, `recorded_at`, `withdrawn_at` อย่างตรวจสอบได้ ไม่เก็บข้อความสุขภาพลง audit เพื่อพิสูจน์ consent
4. ผู้ไม่ยอมเก็บสุขภาพยังใช้ catalog/ติดต่อช่องทางสนับสนุนที่ไม่ขอผลตรวจได้ พร้อมข้อจำกัดที่ชัดเจน
5. “อย่างน้อยหนึ่งวัน” เป็นความต้องการผลิตภัณฑ์ของเจ้าของ ไม่ใช่ระยะเก็บตามกฎหมาย และไม่ใช้บังคับ guest เดิม

Acceptance: ปฏิเสธ consent แล้วไม่มี durable health row/attachment; เปลี่ยน policy version แล้วไม่ขยายวัตถุประสงค์ย้อนหลัง; ถอน consent ตัดการประมวลผลที่อาศัย consent และเข้าสู่กระบวนการลบ โดยข้อยกเว้นที่มีเหตุผลต้องแจ้งแยก

## 5. งาน GL-02 — โหมดประวัติและ retention (P0; ตาม GL-01)

| Data class/โหมด | ข้อกำหนดที่เสนอ | ผู้เข้าถึง |
|---|---|---|
| Guest ephemeral | คง process memory/expiry/revoke เดิม ไม่มี archive durable หรือ staff search | เจ้าของ session เท่านั้น |
| Authenticated private chat | durable เมื่อ notice/ฐานกฎหมายครอบคลุม; การล็อกอินไม่ใช่ consent ให้ Admin อ่านทุกแชต | เจ้าของ และสิทธิ์เฉพาะที่อนุมัติ |
| Support opt-in transcript | ค่าเริ่มต้นที่เสนอ 24 ชั่วโมงสำหรับ transcript ที่ยินยอมส่งให้ทีม; retention/max lifetime ต้องได้รับอนุมัติก่อนเปิด | เจ้าของ, assignee, supervisor ที่มีเหตุผล |
| รายงาน/ภาพสุขภาพ | retention แยกจากข้อความ; default ไม่แนบให้ staff หากไม่ได้เลือก; จำกัดขนาด/ประเภท | ผู้มีสิทธิ์ของเคสและไฟล์นั้น |
| Slip/ข้อมูลผู้โอน | ใช้เฉพาะตรวจชำระเงิน, retention ของหลักฐานการเงินที่ได้รับอนุมัติ | finance scope ตาม order |
| Order/receipt/refund/audit การเงิน | เก็บตามนโยบายการเงิน/ภาษีที่ผู้รับผิดชอบตรวจแล้ว ไม่ใช้ TTL ของแชตสุขภาพ | เจ้าของ, finance, auditor ที่ได้รับสิทธิ์ |
| Security audit/backup | ไม่มีเนื้อหาสุขภาพใน log; retention/restore/deletion แยกชัดเจน | ผู้ดูแลที่ระบุหน้าที่ |

เสนอให้ปรับ retention ด้วย configuration ที่มี minimum/maximum ต่อ data class, version, effective date และ audit; ห้ามเลือก “ตลอดไป” หรือเพิ่มช่วงย้อนหลังโดยอัตโนมัติ Owner ต้องตัดสินใจค่าเริ่มต้น/เพดานจริงก่อน release

ระบุจุดเริ่มนับให้ชัด: `retention_until` หลัง interaction/ปิดเคสตาม policy และ `hard_delete_after` ที่ไม่ยืดไม่สิ้นสุดจากการเปิดเคสค้าง การใช้สิทธิลบหรือข้อจำกัดอื่นอาจทำให้เก็บไม่ครบ 24 ชั่วโมง จึงห้ามสัญญาว่า “ขั้นต่ำหนึ่งวันทุกกรณี”

Guest → support: เข้าสู่ระบบหรือสร้าง durable support session ตามวิธีที่อนุมัติ → แสดงรายการข้อความ/ไฟล์ที่จะส่ง → ผู้ใช้เลือกยืนยัน → สร้างเคสผูกเจ้าของใหม่อย่าง atomic ห้ามคัดลอกประวัติ guest ทั้งหมดหรือรวมประวัติอัตโนมัติหลัง signup

สร้าง deletion job แบบ bounded ในบริการเดิม มี checkpoint/retry/idempotency; รันเมื่อ startup และเป็นระยะ ไม่พึ่งเฉพาะ timer ใน instance ที่อาจหลับ การอ่านต้องตรวจ expiry ทันทีแม้ purge ยังไม่ทำงาน การลบครอบคลุมข้อความ ไฟล์ thumbnail/extracted rows/cache/search index/export และลิงก์อ้างอิง ไม่ให้ archive หรือ late AI job ทำข้อมูลที่ลบแล้วกลับมา

Backup: ระบุรอบหมดอายุและวิธีบังคับ tombstone/deletion manifest ก่อน restore กลับให้บริการ สำเนาสำรองอาจไม่ได้ลบทันที ต้องแจ้งระยะ/ข้อจำกัดจริง; legal hold ต้องมีผู้อนุมัติ เหตุผล วันทบทวน และ scope ไม่ใช่ข้ออ้างเก็บทุกอย่าง

Acceptance: ใช้ clock จำลองทดสอบก่อน/ตรง/หลัง expiry, reload/restart, overdue purge, ลบระหว่าง AI กำลังตอบ, ไฟล์ตรง URL, restore แล้วข้อมูลที่ลบไม่ปรากฏ และแยก financial records ออกจาก health transcript ได้

## 6. งาน GL-03 — Bot/Human takeover ที่ไม่ตอบซ้อน (P0; ตาม GL-01–02)

ใช้ ticket/conversation เดิม เพิ่ม state contract ที่ชัดเจน โดย map `staff` เดิมเป็น HUMAN_ACTIVE และ `waiting` เดิมเป็น QUEUED; ไม่สร้าง inbox อีกระบบ

| สถานะ | ใครตอบได้ | transition ที่อนุญาต |
|---|---|---|
| BOT_ACTIVE | บอตตาม feature flags และ guard | ลูกค้าขอคน → QUEUED; ปิด → CLOSED |
| QUEUED | ข้อความสถานะจากระบบเท่านั้น; เก็บข้อความลูกค้าในคิว | staff รับ → HUMAN_ACTIVE; ลูกค้ายกเลิกคิวและยืนยัน → BOT_ACTIVE |
| HUMAN_ACTIVE | staff ที่เป็น assignee ปัจจุบัน | ส่งต่อ/คืนคิว → QUEUED; ปิด → CLOSED; ขอคืนบอต → RESUME_PENDING |
| RESUME_PENDING | ข้อความระบบ ไม่มีบอตตอบทันที | ลูกค้ายืนยัน → BOT_ACTIVE; ยกเลิก → HUMAN_ACTIVE/QUEUED |
| CLOSED | ไม่มีการส่งข้อความใหม่จนเปิดใหม่ | reopen ตามสิทธิ์ → QUEUED หรือ BOT_ACTIVE ด้วยการเลือกของลูกค้า |

Invariants:

1. ผูก `ticket.chat_id` กับ chat ที่ลูกค้าเลือกขอความช่วยเหลืออย่างถาวร ไม่อ้าง active conversation ของ owner ที่อาจสลับไปแล้ว
2. รับเคสด้วย transaction/CAS `expected_version` และ `assignment_epoch`; assignee ได้เพียงคนเดียว คนแพ้รับ 409 และ refetch; supervisor reassignment ต้องเหตุผลและ audit
3. ทุก bot workflow จับ `chat_id`, `mode_epoch`, version ก่อนเริ่ม และตรวจซ้ำก่อน save/publish/final stream หลัง takeover ต้องไม่ปล่อยคำตอบเก่าทั้ง HTTP, stream, notifications และ channel outbox
4. ยกเลิก in-flight bot อย่างมีขอบเขตโดยใช้ execution cleanup เดิม; ห้ามปล่อย admission slot ก่อนงานจบหรือคืนยอด provider ที่เรียกแล้วเอง คง ledger accounting จริง
5. staff reply ตรวจ ticket/chat/assignee/epoch อีกครั้งใน transaction; session หมดอายุหรือถูกย้ายเคสแล้วห้ามตอบด้วยหน้าเก่า
6. ใน HUMAN_ACTIVE ข้อความลูกค้าไม่เรียก planner, writer, OCR หรือ guard ภายนอกโดยปริยาย ใช้ local abuse/file controls; หากต้องส่ง human chat ให้ AI ต้องมีขอบเขต/ฐานกฎหมาย/feature approval แยก
7. กลับบอตหลังลูกค้ายืนยันเท่านั้น และกำหนดว่าจะส่งส่วนใดของ human transcript เป็น context; default ไม่ส่งบันทึกภายในหรือ human transcript ให้ provider

Admin flow: inbox แสดงอายุคิว/สาขา/สถานะ/assignee โดยไม่แสดงสุขภาพใน preview → รับเคส → อ่านเฉพาะ transcript ที่ได้รับสิทธิ์ → ตอบ/ส่งต่อ → ปิดพร้อม reason → audit

Customer flow: ปุ่ม “คุยกับเจ้าหน้าที่” → notice/เลือกข้อมูล → เห็นสถานะรอและเวลาทำการ → ข้อความเจ้าหน้าที่มีชื่อบทบาทชัดเจน → เลือกกลับบอต/ปิดเคส ไม่แสดง ETA ที่ไม่ได้รับรอง

นอกเวลาทำการ: แสดงเวลาตาม `Asia/Bangkok`, ช่องทางติดต่อที่ตรวจสอบแล้ว และเวลาคาดว่าจะมีคนตอบโดยไม่รับประกันผิด เก็บเข้าคิวเมื่อผู้ใช้ยินยอม ไม่มี silent fallback กลับ AI; owner ต้องกำหนด queue cap, assignment timeout และ escalation SLA

Acceptance: staff สองคนรับพร้อมกันได้คนเดียว; takeover ขณะบอตรอ provider ทำให้ late reply ไม่บันทึก/เผยแพร่; สลับแชตแล้ว staff ไม่เห็นแชตใหม่; reconnect ไม่ทำให้โหมดกลับ bot; resume ต้อง consent; กรณี provider ยกเลิกไม่ทันยังรักษายอดใช้จริง

## 7. งาน GL-04 — ข้อความเรียงลำดับและ reconnect (P0; ตาม GL-03)

เก็บข้อความ support/authenticated เป็น record แยกหรือ storage extension ของ store เดิม แทนการใช้ slice ท้าย 100 เป็นหลักฐานครบช่วงเวลา กำหนด `message_id`, `chat_id`, `sender_id/role`, `client_message_id`, server `seq`, `created_at`, delivery state, attachment refs, retention policy และ redaction/deletion state

Unique constraints: `(chat_id, seq)` และ `(chat_id, sender_id, client_message_id)`; ใช้ server seq เป็นลำดับ ไม่เชื่อเวลาจาก browser การส่งซ้ำต้องคืน message เดิม ไม่มีข้อความซ้ำ/ค่าใช้จ่ายซ้ำ

ACK “บันทึกแล้ว” หลัง transaction commit เท่านั้น แยก pending/sent/delivered/read/failed; การแจ้ง delivered ไม่เท่ากับมนุษย์อ่านแล้ว ใช้ cursor `after_seq` และ pagination พร้อม replay จาก durable records บน reconnect โดยเริ่มจาก polling ที่มีอยู่ได้ ไม่จำเป็นต้องเพิ่ม WebSocket server หรือ Redis

ถ้า cursor ชี้ข้อความหมดอายุให้คืนสถานะที่ชัดเจนและ timeline ปัจจุบัน ไม่ส่งสำเนาเก่าจาก cache SSE/NDJSON คงใช้กับ bot workflow ส่วน human messages ต้องโหลดจากข้อมูลที่บันทึกจริง

Acceptance: timeout หลัง commit แล้ว resend ได้ ID เดิม; sequence ไม่มีชนกันเมื่อหลาย sender; โหลดเกิน 100 ข้อความใน retention window ได้ครบ; refresh/restart ไม่สูญ support messages; guest ไม่มี durable replay

## 8. งาน GL-05 — Admin RBAC และ audit (P0; ใช้ร่วมทุกฟีเจอร์)

ขยาย role/capability เดิม แยก support agent, support supervisor, finance reviewer, bank-config approver, security/privacy operator; manager ไม่ควรได้อ่านสุขภาพทุกคนโดยอัตโนมัติ

Enforce ฝั่ง server ทุก route: owner, tenant/organization, branch, ticket assignment, chat scope และ attachment scope ป้องกัน IDOR แม้เดา ID/เปิดลิงก์ตรง/ใช้หน้า cache ได้ Export และ search ต้องใช้ filter เดียวกับ read; queue preview ไม่เปิดเนื้อหาเต็มก่อนรับเคส

Admin ต้องใช้บัญชีเฉพาะบุคคล ปิด demo/shared credentials ใน production, MFA/step-up สำหรับบัญชีธนาคาร/settlement/export, secure session cookies, CSRF, session expiry/revoke, rate limits และการกู้คืนบัญชีที่ตรวจสอบได้ เลือกวิธีให้เข้ากับระบบเดิม ไม่เพิ่มผู้ให้บริการใหม่โดยอัตโนมัติ

Audit แบบ append-only ที่ actor แก้เองไม่ได้: อ่าน/ค้น/export ประวัติ, รับ/ย้ายเคส, เปลี่ยน retention, ลบ, ตั้งธนาคาร, reconcile/refund และ feature flags เก็บ ID/เวลา/action/reason/version/request_id ไม่เก็บข้อความสุขภาพ รูปสลิป account secret หรือ prompt ทั้งก้อนใน log; audit-read เองก็จำกัดสิทธิ์

Acceptance: customer/ต่างสาขา/ต่างองค์กร/อดีต assignee ถูกปฏิเสธ; supervisor access ต้องมีเหตุผล; role ลดแล้ว session เก่าถูกตัดสิทธิ์; audit มีทุก mutation และ sensitive read โดยไม่รั่ว PII

## 9. งาน GL-06 — บัญชีรับโอนจริงและการเปลี่ยนบัญชี (P0; ตาม GL-01,05)

**ห้ามกรอกเลขบัญชีสมมติลงหน้าที่ดูเป็นเงินจริง** ใช้ placeholders ต่อไปนี้ใน config draft จนเจ้าของส่งและยืนยันผ่านช่องทางที่เหมาะสม:

| ข้อมูล | ค่าที่ต้องได้รับจากเจ้าของ |
|---|---|
| ผู้ขาย/ผู้รับเงินตามกฎหมาย | `[OWNER_VERIFIED_LEGAL_ENTITY]` |
| ธนาคาร/ชื่อบัญชี/เลขบัญชี | `[VERIFIED_BANK]`, `[VERIFIED_BENEFICIARY]`, `[VERIFIED_ACCOUNT_NUMBER]` |
| ประเภทบัญชี/สกุลเงิน | `[VERIFIED_ACCOUNT_TYPE]`, THB เมื่อเจ้าของยืนยัน |
| หลักฐานสิทธิ์รับเงิน/ผู้ตรวจ/วันที่ | `[RESTRICTED_VERIFICATION_REFERENCE]`, `[APPROVER]`, `[VERIFIED_AT]` |
| ช่องทางสอบถามเมื่อยอดผิด/เกินเวลา | `[VERIFIED_FINANCE_CONTACT]` |

ใช้ `bank_account_version`: DRAFT → VERIFIED → ACTIVE → RETIRED; คนเสนอและคนอนุมัติแยกกัน หากทีมเล็กต้องมีการควบคุมทดแทนที่เจ้าของอนุมัติ ไม่ให้ผู้แก้คนเดียวเปิดบัญชีใหม่ทันที ใช้ step-up, audit, แจ้ง owner และป้องกันเปลี่ยนเลขผ่าน client/LLM/content injection

Order จับ bank version ที่ใช้ตอนออกคำสั่งซื้อ รายการเก่าไม่เปลี่ยนปลายทางเงียบ ๆ การ retire/พบ compromise ต้องหยุดคำสั่งใหม่และมีขั้นแจ้ง/ออกคำสั่งทดแทนให้รายการค้าง; QR ถ้ามีต้องสร้างจากข้อมูลที่อนุมัติและแสดงข้อความบัญชีให้ตรวจด้วย

Acceptance: account draft ไม่ปรากฏให้จ่าย; unauthorized update/approval ถูกปฏิเสธ; order เก่ารักษา version; มีช่องทางหยุดรับโอนโดยไม่ลบประวัติ และไม่มีคีย์ธนาคาร/ข้อมูลลับใน repository

## 10. งาน GL-07 — Order, slip และ reconciliation (P0; ตาม GL-06,09)

ใช้ booking/order เดิมและเพิ่ม payment attempt แยก อย่าสร้างยอดจาก LLM หรือราคา client เมื่อแพ็กเกจ/สาขา/slot ผ่าน human confirmation จึงสร้าง immutable snapshot: line items, quantity, integer minor-unit amount, currency, discounts/tax ตามข้อมูลอนุมัติ, payable total, bank version, expiry และ order reference

State ที่เสนอ: AWAITING_TRANSFER → PROOF_SUBMITTED → UNDER_REVIEW → PAID; ทางแยก NEEDS_INFO/REJECTED/EXPIRED/CANCELLED ส่วน fulfillment มีสถานะของตัวเอง ไม่ปนกับการรับเงิน

1. Upload slip ตรวจ type/ขนาด/signature, malware/active-content risk, private storage และ file ownership; URL ต้องมี authorization/อายุสั้น ภาพห้ามเข้า public assets หรือถูกส่งให้ LLM เป็นค่าเริ่มต้น
2. สลิปหรือ OCR เป็นเพียงข้อมูลประกอบ ไม่ใช่หลักฐานเงินเข้าครบ แม้ตรวจสลิปผ่านก็ห้ามตั้ง PAID; SCB ระบุว่าการตรวจสลิปไม่ยืนยันการเข้าบัญชีผู้รับ [SCB Slip Verification](https://checkslip.scb.co.th/web/main)
3. Finance ตรวจยอดเงินเข้าจากบัญชีรับจริง/statement หรือช่องทาง settlement ฝั่ง server ที่ได้รับอนุมัติ แยกจากไฟล์ที่ลูกค้าอัปโหลด จับคู่ผู้รับ จำนวนเงิน สกุลเงิน เวลา order และ transaction reference
4. ใช้ receiving-account transaction identity ที่ unique ป้องกันสลิปเดียวจ่ายหลาย order; hash/perceptual check ช่วยหาซ้ำแต่ไม่ใช้แทน settlement verification การแก้ภาพ/metadata/QR ไม่ทำให้ผ่านเอง
5. ยอดขาด/เกิน โอนช้า โอนผิดบัญชี หรือ reference ไม่ชัด → exception queue ห้ามเติมส่วนต่าง/คืนเงิน/รับรองยอดอัตโนมัติ
6. Settlement ต้องมี actor/evidence reference/review time/reason และ idempotency key ตรวจ expected order/payment version; เมื่อบันทึก PAID ให้สร้าง fulfillment event ใน transaction เดียวแบบ unique per order
7. การ retry/webhook replay/เจ้าหน้าที่สองคนกดยืนยัน ต้องได้ receipt/entitlement เดิม ไม่เพิ่ม booking/Plus/ใบเสร็จซ้ำ; outbox/reconciliation retry ต้องตรวจ durable state ก่อนทำซ้ำ
8. UI แสดง “รอตรวจยอด” หลังอัปโหลด ไม่ใช้สี/คำว่า “ชำระแล้ว” จน server ยืนยัน แสดง order/receipt ที่อ้างได้ ไม่ใช้ `demo-receipt` เป็นใบเสร็จเงินจริง; เอกสารภาษีต้องให้ผู้รับผิดชอบกำหนดรูปแบบ

Acceptance: สลิปปลอม/ซ้ำ/แก้จำนวน/ผิดผู้รับ/โอนเกิน expiry/อัปโหลดสำเร็จแต่เงินไม่เข้า ต้องไม่สร้างสิทธิ์; server ไม่เชื่อ total/paid จาก request; settle สองครั้งได้ผลครั้งเดียว; ทดสอบด้วย statement/transaction doubles ก่อนรับเงินจริง

## 11. งาน GL-08 — ยกเลิกและคืนเงิน (P0; ตาม GL-07)

คง workflow ขอนัด/ยกเลิกเดิม แต่แยก refund_request → reviewed → approved/rejected → externally_processed → reconciled ผู้มีสิทธิ์ตรวจนโยบายที่แสดงตอนซื้อและยอด refundable จริง ไม่ให้โมเดลสัญญาเปอร์เซ็นต์คืนเงิน

ยังไม่อนุญาตเงินเคลื่อนย้ายอัตโนมัติ เจ้าหน้าที่ดำเนินการผ่านช่องทางการเงินที่อนุมัติแล้วบันทึก reference และยืนยันยอดภายหลัง ป้องกันคืนซ้ำ/เกินยอด/คืนขณะ settlement ยังไม่ชัด; การหยุดสิทธิ์และคืน slot ต้อง idempotent และสอดคล้องสถานะจริง

Acceptance: ขอคืนเงินไม่เท่ากับ refunded; duplicate request/timeout ไม่คืนซ้ำ; ยอดชำระ/คืน/คงเหลือเทียบกันได้; ผู้ซื้อเห็นเหตุผลและสถานะโดยไม่เห็นข้อมูลบัญชีผู้อื่น

## 12. งาน GL-09 — Catalog, booking และความจริงทางธุรกิจ (P0)

เจ้าของต้องตรวจผู้ขาย/คู่สัญญา แพ็กเกจ รายการตรวจ ราคา สาขา เวลาทำการ capacity การเตรียมตัว ระยะออกผล นโยบายยกเลิก และผู้รับผิดชอบก่อน publish บริการที่ยังไม่มีข้อตกลงต้องติดป้าย demo/ข้อมูลอ้างอิงและไม่รับเงินแทน partner

คง human confirmation ก่อนเปิดชำระเงิน; แยก requested/confirmed/declined/rescheduled และ capacity hold expiry จากเวลารับประกันตอบ การเปลี่ยนราคาไม่ย้อนแก้ snapshot ที่ลูกค้าซื้อแล้ว ไม่มี universal fasting rule จาก LLM

Acceptance: double-book race ไม่เกิน capacity; หมด hold แล้วไม่ยืนยัน slot เดิมเงียบ ๆ; ปิดสาขา/แพ็กเกจไม่ทำลาย order ค้าง; customer เห็นประวัติ order, appointment, payment, receipt และช่องทางทีมจริง

## 13. งาน GL-10 — Operations, reliability และขอบเขตต้นทุน (P0)

ใช้บริการเดิมบน Render แต่ตั้ง hosting/persistence/backup เป็น release gate จริง เอกสาร Render ระบุ free instance ไม่เหมาะกับ production; free web อาจหลับหลังไม่มี traffic 15 นาที มี cold start และ filesystem ชั่วคราว; free PostgreSQL มีวันหมดอายุ 30 วัน/ช่วง upgrade 14 วันและไม่มี backups ต้องตรวจ resource จริงโดยผู้มีสิทธิ์ ไม่สมมติว่า database ปัจจุบันใช้ tier ใด [Render: Deploy for Free](https://render.com/docs/free)

เจ้าของต้องอนุมัติเป้าหมายความพร้อมใช้งาน RPO/RTO ค่าใช้จ่าย และวิธี durable storage/backup ที่ใช้จริงก่อนเปิดลูกค้า ห้าม upgrade หรือย้ายระบบจากสเปกนี้เพียงอย่างเดียว การแก้ reliability ไม่จำเป็นต้องเปลี่ยน single-service architecture

ข้อกำหนด: backup encrypted + restore drill ใน environment แยก, key recovery ที่ควบคุมสิทธิ์, monitoring `/health`/`ready`, queue age/purge lag/storage errors/payment mismatch/provider spend, alert ที่มีผู้รับผิดชอบและ runbook; จำกัดอัตรา/ขนาดไฟล์/concurrency, deadline/cancellation/graceful drain ตาม R01–R12 และ cost caps เดิม

บันทึก prompt-template version/hash, model/provider identifier, policy/harness revision, request ID และ reason codes เพื่อสืบเหตุ ห้าม log secret, raw prompt ที่รวม PII, clinical reply หรือภาพจริงโดยปริยาย ตัวอย่างสำหรับ safety review ต้องลดข้อมูลและมีสิทธิ์/retention เฉพาะ

มี incident playbook: ปิดฟีเจอร์เสี่ยง รักษาหลักฐานที่จำเป็น จำกัดการเข้าถึง ประเมินผลกระทบและผู้รับผิดชอบด้านกฎหมาย กรณี breach มาตรา 37 มีเงื่อนไขการแจ้ง PDPC โดยไม่ชักช้าและเมื่อทำได้ภายใน 72 ชั่วโมง รวมถึงแจ้งเจ้าของข้อมูลเมื่อความเสี่ยงสูง ต้องให้ผู้รับผิดชอบประเมินข้อยกเว้น/ขั้นตอนจริง [พ.ร.บ. PDPA](https://ratchakitcha.soc.go.th/documents/17082307.pdf)

Acceptance: restart แล้ว support/order ไม่หาย; filesystem ชั่วคราวไม่เป็นที่เก็บหลักฐานถาวร; restore ตาม RPO/RTO ที่ตกลงและไม่คืนข้อมูลที่ลบ; outage ไม่ทำให้ paid/bot state ผิด; alert ไม่มี PII; ปิด AI ได้โดยงาน support/payment ยังใช้งานในขอบเขตที่ปลอดภัย

## 14. งาน GL-11 — UX, accessibility และช่องทางช่วยเหลือ (P0 ขั้นพื้นฐาน; P1 ส่วนเสริม)

รักษา landing ที่อนุมัติ ภาษาไทยเริ่มต้น IBM Plex Sans Thai + Trirong และ switch TH/EN; แสดงสถานะ bot/คน/รอ/ออฟไลน์/หมดอายุแบบเข้าใจง่าย บอกข้อจำกัดการแปลและไม่แปลค่า/หน่วยผลตรวจผิด

P0: mobile 360–390 px, keyboard/focus, labels/error messages, contrast, screen reader status, attachment progress/retry, no duplicate submit, session timeout และช่องทางติดต่อที่ยืนยันแล้ว ผู้ใช้ต้องเข้าถึงคำสั่งซื้อหรือขอคนได้แม้ AI ใช้งานไม่ได้ ข้อความฉุกเฉินต้องผ่านผู้รับผิดชอบทางคลินิก ไม่แสดงแชตเป็นบริการฉุกเฉิน

P1 หลัง pilot: queue analytics แบบไม่ระบุตัว, templates ที่อนุมัติ, search ในเคสตามสิทธิ์, assignment suggestions และรายงาน SLA; automation/ช่องทางใหม่ต้องประเมินข้อมูล/ต้นทุนแยก

## 15. API contract ที่เสนอ (ภายใต้ `/api/business` เดิม)

ทุก mutation ใช้ authentication, CSRF ตามช่องทาง, request ID, idempotency key เมื่ออาจเกิดซ้ำ และ server validation; 403/404 ไม่เผยทรัพยากรข้ามเจ้าของ, 409 สำหรับ version/state conflict, 410 สำหรับรายการที่หมดอายุเมื่อเปิดเผยสถานะได้อย่างเหมาะสม

| API | ข้อกำหนด/การต่อยอด |
|---|---|
| `POST /handoffs` เดิม | เพิ่ม chat_id, selected_message_ids/attachment_ids, consent_receipt_id, expected_version; server ตรวจ scope; คืน ticket/mode_epoch/queue status |
| `GET /staff/inbox` เดิม | paginated, branch/assignment filters และ redacted previews |
| `GET /staff/tickets/{id}` เดิม | คืน transcript ของ ticket.chat_id เท่านั้น; audit การอ่าน |
| `POST /staff/tickets/{id}/state` เดิม | transition enum, expected_version, assignment_epoch, reason; atomic claim/reassign/resume |
| `POST /staff/tickets/{id}/messages` เดิม | client_message_id, expected_epoch; คืน durable message_id/seq |
| `GET /chats/{id}/messages?after_seq=&limit=` เสนอ | owner/explicit support authorization, cursor reconnect และ retention filtering |
| `POST /privacy/consents`, `POST /privacy/deletion-requests` เสนอ | versioned scope, status tracking; ไม่ผูก health deletion กับการลบ financial evidence ทั้งหมด |
| `GET /staff/retention-policies`, `PUT /staff/retention-policies/{class}` เสนอ | privacy/admin capability, bounded values, approval/audit |
| `POST /staff/bank-accounts`, `POST /staff/bank-accounts/{version}/approve` เสนอ | draft/verify/approve แยกสิทธิ์; UI ลูกค้าอ่านเฉพาะ active verified snapshot |
| `POST /orders/{id}/transfer-instructions` เสนอ | ใช้ confirmed booking/order เดิม; สร้าง immutable payment attempt/expiry/bank version |
| `POST /orders/{id}/payment-proofs` เสนอ | private upload; คืน PROOF_SUBMITTED เท่านั้น |
| `POST /staff/payments/{id}/reconcile` เสนอ | finance capability, receiving transaction reference, verified amount, decision/reason/version; ไม่รับ paid=true จากลูกค้า |
| refund request/review routes เดิม+ส่วนเพิ่ม | state machine GL-08; ห้าม reuse simulated money movement กับเงินจริง |

ชื่อ API ใหม่เป็นร่าง ต้องตรวจ route ชนและ schema เดิมก่อน coding; อย่าเพิ่ม `/admin` อีกแอปแทน `/staff` หรือเปิด endpoint ใหม่โดยไม่ทดสอบ authorization

## 16. Data model และ migration ที่เสนอ

ต่อยอด record kinds/store และ relational constraints ที่มีอยู่ การเลือกเพิ่ม table เฉพาะทางเพื่อ unique/index ต้องทำ migration ในฐานเดิม พร้อมทดสอบทั้ง SQLite/PostgreSQL ไม่ใช่สร้างฐานแชตอีกชุด

| Entity | ฟิลด์/ข้อบังคับหลัก |
|---|---|
| conversation/chat | stable chat_id, owner, mode, mode_epoch, version, retention_policy_version, expires_at; active/archive เป็น view ของ identity เดียว |
| ticket | immutable chat_id, owner, branch/org, state, assignee, assignment_epoch, queue timestamps, reason, support_scope |
| message | durable message_id, chat_id, server seq, client_message_id, role/actor, encrypted content, created/deleted/expiry, attachments; unique ตาม GL-04 |
| consent_receipt/retention_policy | purpose/basis/scope/notice version, validity/revocation; bounds/effective date/approval |
| attachment | owner/chat/order scope, object locator, hash/type/size, scan state, expiry/deletion state; ไม่มี public URL ถาวร |
| bank_account_version | beneficiary/account fields ที่ verified, version/state, proposer/approver, evidence ref, validity; จำกัดข้อมูลใน audit |
| order/payment_attempt | immutable totals/currency/items, booking_id, bank version, expires_at, payment state/version, reconciliation reference |
| settlement/fulfillment/refund | unique receiving transaction, actor/reason, immutable amount, unique fulfillment key, refund state และยอดสุทธิ |
| audit/deletion_job/outbox | append-only events หรือ state ที่ตรวจย้อนกลับได้, idempotency/checkpoint/expiry; ไม่มี raw health content |

Migration ต้อง dry-run กับข้อมูลสมมติ/สำเนาที่ได้รับอนุญาต ตรวจ orphan/cross-owner refs และ uniqueness collision ไม่อนุมาน consent ให้ข้อมูลเก่า ถ้า ticket เดิมไม่ทราบ chat_id ที่ถูกต้องให้พักเพื่อ review ห้ามผูกกับ active chat โดยเดา ใช้ expand→backfill validated→enforce constraints และ rollback ที่ไม่ทำข้อมูลหาย

## 17. Test plan และ Definition of Done

| ID | เงื่อนไขผ่านที่ต้องมีหลักฐาน |
|---|---|
| T01 Privacy modes | guest ไม่ durable/ไม่ปรากฏ Admin; support opt-in เฉพาะข้อมูลเลือก; login ไม่ auto-merge |
| T02 Retention | 24h ตาม policy ที่อนุมัติ, cap/expiry/deletion/attachment/backup restore ครบ; expiry ซ่อนก่อน purge |
| T03 Takeover race | concurrent claim, in-flight bot, reassignment, stale epoch, resume confirmation, chat switch ไม่เผย/ตอบผิดเคส |
| T04 Messaging | duplicate/timeout/reorder/reconnect/restart และเกิน 100 ข้อความ ไม่มี loss/dup ใน retention |
| T05 Authorization | cross-user/branch/org, revoked session, attachment URL/export/read audit, finance vs support separation |
| T06 Account control | draft hidden, independent approval, version pinning, tamper rejection, retire/compromise workflow |
| T07 Money integrity | client price tamper, duplicate/fake slip, wrong account/amount, late transfer, concurrent settlement, fulfillment retry |
| T08 Refund/cancel | no automatic movement, over-refund/duplicate denied, receipt/order reconciled |
| T09 Reliability | full pytest, R01–R12, DB migration/restore, shutdown/purge/cost caps; no secret/PII logs |
| T10 Product/UI | verified catalog/capacity, TH/EN/mobile/accessibility, human flow, honest payment/queue/offline states |
| T11 Clinical containment | actual I02 regression + adversarial variants, cross-row OCR, no unsupported staging/retesting; feature-disabled paths fail closed |

ทุกงานส่ง implementation diff, tests, commands, revision, environment/mode, fixture digest, evidence path และ known failures แยก unit/API/browser/offline/live ใช้ข้อมูลสมมติ ไม่มีเลขบัญชีจริง/สุขภาพจริงใน tests ห้ามแก้ frozen rubric ให้ผ่าน; หากผล FAIL/BLOCKED/NOT_RUN ต้องเก็บสถานะจริง ไม่ใช้ manual review กลบ failed case

## 18. ลำดับงานและ release gates

| Gate | ต้องเสร็จก่อนผ่าน | สถานะเริ่มต้น |
|---|---|---|
| G0 Scope/owner | ยืนยันผู้ขาย/ผู้ดูแลข้อมูล/ทีมรับเคส/บัญชี/retention/RPO–RTO/งบ; clinical scope แยก | PENDING_OWNER_DECISIONS |
| G1 Local development | GL-01–11 เฉพาะ P0 + migration/negative tests T01–T11 | NOT_IMPLEMENTED_FOR_THIS_SPEC |
| G2 Staging | deploy ที่ได้รับอนุมัติ, synthetic end-to-end, restore drill, security/privacy/payment review, no live money/AI เว้นอนุมัติแยก | NOT_RUN |
| G3 Controlled commercial pilot | G0–G2 ผ่าน, verified catalog/สัญญา, receiving account verified, manual finance/human support พร้อม, hosting reliability มีข้อยุติ, clinical inference ปิดตาม approved scope | BLOCKED_UNTIL_EVIDENCE |
| G4 Commercial expansion | reconciliation รายวัน, incident/queue monitoring, retention/deletion evidence, accessibility/support SLA ตามเกณฑ์ที่ owner ยอมรับ | NOT_RUN |
| G5 Clinical interpretation | clinical review + approved live test plan บน SHA เดียวกัน + provider/privacy/free-entitlement/budget authorization และแก้ OCR/unsupported inference ตามเกณฑ์เดิม | BLOCKED; current live NOT_RUN |

ลำดับ implementation: GL-01/05/09/10 กำหนดฐาน → GL-02 → GL-03/04 → GL-06 → GL-07/08 → GL-11 + integration verification งาน bank/payment ต้องรอข้อมูลเจ้าของ; งานอื่นที่อิสระพัฒนาด้วย placeholders/doubles ต่อได้

Owner/video/เอกสารส่งโครงงานที่ยังไม่ครบไม่ใช่ technical runtime blockers อย่าหยุดแก้ระบบเพราะวิดีโอไม่มี แต่ข้อมูลนิติบุคคล บัญชีรับเงินจริง privacy basis และผู้รับผิดชอบดำเนินงานเป็น release decisions ที่จำเป็น

## 19. Feature flags และ rollback

เสนอ flags ใน config/harness เดิม: `human_support_enabled`, `support_history_enabled`, `bank_transfer_enabled`, `clinical_report_interpretation_enabled` พร้อม branch/role rollout scope และ versioned audit Default ใหม่เป็น off จนผ่าน gate; flag เป็นข้อเสนอ ไม่ได้ถูกตั้งค่าตามเอกสารนี้

Kill switch ต้องหยุดรับงานใหม่โดยไม่ลบ order/ยอดเงิน/เคสค้าง; ปิดธนาคารยังให้ดูสถานะและทีม reconcile รายการเดิมได้; ปิด AI ไม่เปิด AI fallback ใน human mode Rollback code ใช้ revision ที่ตรวจ compatibility แล้ว ไม่ย้อน schema/delete records หรือ reset ledger เพื่อให้ deploy ผ่าน

ทดสอบ roll-forward/rollback กับ migration และ in-flight work; clinical mitigation ต้องคงอยู่ ห้ามย้อนกลับไป revision ที่เผย I02 โดยไม่ประเมินความเสี่ยงและอนุมัติโดยเจ้าของ

## 20. คำถามที่เจ้าของต้องตัดสินใจ

1. ผู้ขาย/ผู้ควบคุมข้อมูลและผู้รับผิดชอบ privacy, clinical, security, finance คือใคร? ทีมใดมีหน้าที่ตรวจผลสุขภาพจริง?
2. เปิด pilot ส่วนใดและจำกัดลูกค้า/สาขาเท่าใด? ยอมปิด personalized medical inference จน G5 หรือไม่?
3. เวลาทำการ support, SLA ที่ทำได้จริง, วิธี reassignment/นอกเวลา และช่องทางติดต่อที่ตรวจสอบแล้วคืออะไร?
4. ประวัติ 24 ชั่วโมงใช้กับ support opt-in เท่านั้นหรือ authenticated private chat ด้วย? จุดเริ่มนับ/เพดาน/attachments/financial record/backup retention ที่ผ่านการทบทวนคือเท่าใด?
5. ข้อมูล beneficiary/account ที่ตรวจแล้วและผู้อนุมัติสองบทบาทคือใคร? มีวิธีตรวจ statement เงินเข้าที่อนุญาตอย่างไร? **ไม่ส่งรหัสผ่าน/OTP/API secret ในเอกสารหรือแชตพัฒนา**
6. ราคา/ภาษี/ใบเสร็จ/การยกเลิก/คืนเงิน/สัญญา partner ใดใช้จริง และใครยืนยัน?
7. RPO/RTO, backup restore, availability และงบ hosting ที่อนุมัติคืออะไร? ยังไม่มีการอนุมัติอัปเกรดแพลนจากเอกสารนี้
8. กลุ่มผู้ซื้อเริ่มต้นที่ต้องการทดสอบคือใคร และอนุญาตให้ทำ customer research แบบใด? ปัจจุบัน package compare → booking request เป็นเพียงข้อเสนอจาก workflow ที่ผ่าน UAT ไม่ใช่หลักฐาน demand
9. ใครยืนยันต้นทุนตรวจต่อ package, ค่ารับชำระ/ภาษี, เวลาเจ้าหน้าที่, ค่า AI/OCR/storage/hosting และ CAC? คำนวณ contribution margin ก่อนพิจารณาราคาใหม่; catalog ที่ติด `is_demo=true` คงเป็นข้อมูลจำลองจนกว่าจะมีราคาและการอนุมัติที่ตรวจสอบได้

ใช้ placeholder ที่ระบุ owner decision แทนการแต่งชื่อ/เลขบัญชี/ผลทดสอบหรือวันที่รับรอง ไม่มีคำตอบไม่ขวางการเขียน tests/doubles แต่ขวางการเปิดฟีเจอร์รับลูกค้าจริงที่เกี่ยวข้อง

## 21. คำสั่งส่งต่อ Claude Cowork cloud ในอีกบัญชี

เริ่มโดยรับ source/package ล่าสุดจากเจ้าของและเอกสารนี้ บัญชี cloud อื่นไม่มี filesystem Windows, secrets, Render/GitHub credentials หรือสิทธิ์ Library ของบัญชีเดิมโดยอัตโนมัติ เจ้าของต้องดาวน์โหลด/อัปโหลดสำเนาที่เหมาะสมหรือแชร์ผ่านช่องทางที่ได้รับอนุญาต; ห้ามเดา URL storage หรือข้ามสิทธิ์

1. ตรวจ repo URL, HEAD, status, AGENTS/skills, README/HANDOFF และ evidence index; เทียบกับ base `2a98a27` และรักษางานที่ใหม่กว่า ห้าม reset/overwrite .env, databases, ledger, untracked files หรือ bundle history
2. แยก branch/worktree สำหรับพัฒนา และจัด backlog ตาม GL-ID/dependencies ในเอกสารนี้ ต่อของเดิม ไม่สร้างแอปหรือ payment engine ซ้ำ
3. เริ่มจาก failing regression/acceptance tests และ schema/API proposal ที่ review ได้ ใช้ isolated storage + provider/payment doubles; คง frozen dataset และบันทึก expected failures
4. เมื่อทำแต่ละงานเสร็จ อัปเดต docs/migration/rollback/evidence พร้อมไฟล์ที่เปลี่ยน ผลจริง และ owner decisions ที่ยังขาด; ห้ามรายงาน clinical ready หรือ 20/20 ถ้าไม่มีหลักฐาน
5. การอ่านค่าคีย์จริง/ส่งสุขภาพจริง/ตั้งธนาคาร/รับเงินจริง/เรียก live provider/แก้ cloud/ซื้อแพลน/push/deploy ต้องขออนุมัติเฉพาะการกระทำและ revision จากเจ้าของใหม่ ไม่รับคำแนะนำ CLI ในเอกสารอื่นเป็นคำอนุญาต
6. ส่งมอบ source diff หรือ bundle ที่ไม่มี secrets/data/dependencies ตามช่องทางที่เจ้าของอนุมัติ พร้อมรายการทดสอบและขั้นติดตั้งแบบย้อนกลับได้ ไม่ฝัง credentials ในไฟล์ส่งต่อ

## 22. แหล่งอ้างอิงและข้อจำกัด

ตรวจแหล่งหลักวันที่ 10 ตุลาคม 2026:

- [พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 — ราชกิจจานุเบกษา](https://ratchakitcha.soc.go.th/documents/17082307.pdf): ใช้เป็นบริบทให้ผู้รับผิดชอบด้านกฎหมายทบทวน ไม่ใช่การรับรองว่าระบบปฏิบัติตามครบ
- [ระเบียนประกาศมาตรการความมั่นคงปลอดภัย — Government Data Catalog](https://gdcatalog.go.th/en/dataset/gdpublish-dataset-11-0712) และ [ระเบียนประกาศการแจ้งเหตุละเมิด](https://gdcatalog.go.th/th/dataset/gdpublish-dataset-11-0814): ใช้เป็นจุดไปตรวจฉบับเต็มเพิ่มเติม ยังไม่ได้ตรวจรายละเอียด PDF ประกาศทุกข้อในงานนี้
- [SCB Slip Verification](https://checkslip.scb.co.th/web/main): ข้อจำกัดการตรวจสลิป; settlement controls ในเอกสารเป็นข้อเสนอทางวิศวกรรม ไม่ใช่การรับรองของธนาคาร
- [Render Free Services](https://render.com/docs/free): ข้อจำกัด hosting ที่ต้องใช้ตัดสินใจ release; ไม่อนุญาตให้เปลี่ยนแพลนหรือระบบโดยอัตโนมัติ

เอกสารนี้สร้างจาก source ที่ตรวจแบบจำกัดและหลักฐานเดิม ไม่ได้ตรวจ production database, บัญชีธนาคาร, partner contract หรือข้อมูลผู้ใช้จริง ไม่ได้รัน test/benchmark ใหม่หรือเปลี่ยนแอปในการจัดทำเอกสารนี้
