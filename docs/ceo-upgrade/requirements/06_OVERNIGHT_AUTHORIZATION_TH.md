# คำอนุมัติและขอบเขตการทำงานข้ามคืน

ID: `AUTH-LABCLEAR-20261008-OVERNIGHT`
สถานะ: **อนุญาต implementation และ conditional main push สำหรับรอบงานนี้**
ที่มา: คำสั่ง owner ในแชตวันที่ 8 ตุลาคม 2026 ให้ Codex รันต่อเนื่อง อนุญาต commit + push main เพื่อให้ Render auto-deploy และ owner จะตั้ง ENV/ทดสอบ API ตอนเช้า

## 1. สิ่งที่เปลี่ยนจาก review package

คำขอเดิมให้ทบทวนเอกสารและห้าม push ถูกแทนที่เฉพาะดังนี้: ลงมือพัฒนาได้ ทำ local commits ได้ และ push `origin main` ได้หลังผ่าน `07_RELEASE_GATE_TH.md` ไม่ต้องถาม owner ซ้ำเพื่อยืนยัน commit/push ที่อยู่ในขอบเขตนี้

การ push ไป branch ที่ Render เชื่อมไว้เป็นการอนุญาต deploy ทางอ้อมของ **บริการ Render เดิม** ไม่ใช่อนุญาตสร้างบริการใหม่ เปลี่ยน plan ย้ายฐานข้อมูล เปลี่ยน DNS หรือย้ายไป Workers

คำว่าให้รันยาวไม่ใช่สิทธิ์ให้ฝืน managed permissions หรือเปิด unrestricted access เอกสารนี้เลือกใช้ Auto-review สำหรับคำขอที่เข้าเกณฑ์แทน bypass-all ตามคู่มือการเริ่มงาน หากสิทธิ์ไม่พอให้ทำงานส่วนปลอดภัยและบันทึก blocker ไม่หาเส้นทางอ้อมไปทำคำสั่งที่ถูกปฏิเสธ

## 2. Scope ที่ทำได้

- อ่าน source/tests/docs, ข้อกำหนดรายวิชาที่มีอยู่จริง และอ่าน `C:\Users\User\.agent-kit` เฉพาะไฟล์ที่เกี่ยวข้องแบบ read-only ไม่อ่าน credential/session stores
- พัฒนา model adapters, Python harness, provider admin settings, runtime skills, catalog/provenance, organization upload แบบ synthetic, Guest/account regression และ landing preview
- ทดสอบด้วย mock providers / synthetic fixtures / isolated database รวม browser screenshots; public web research และ dependency retrieval ที่จำเป็นทำได้ภายใต้สิทธิ์จริง
- ใช้ main เดิม ไม่สร้าง branch/worktree ใหม่เอง; รักษาไฟล์ owner และ historical evidence
- ทำ local commits ขนาดตรวจได้โดย stage explicit paths; push main ปกติหนึ่งครั้งตอนท้ายเมื่อทุก pre-push gate ผ่าน
- อ่าน GitHub checks/Render status หลัง push ได้เมื่อมีสิทธิ์ โดยไม่แก้บัญชี cloud; read-only smoke ต้องไม่กระตุ้น AI หรือเปลี่ยนข้อมูล

## 3. ขอบเขตที่ยังไม่เปิด

| Gate | สถานะในรอบกลางคืน | ความหมาย |
|---|---|---|
| G-UI | PENDING_OWNER สำหรับ rollout ใหม่ | ทำ landing preview ได้ แต่ไม่แทนดีไซน์ทั้งแอปก่อน owner เลือก; regression fixes ที่รักษาหน้าเดิมทำได้ |
| G-API | OWNER_MORNING_ACTION | ไม่เรียก paid หรือ free inference endpoints ในรอบนี้ รวม Test, OCR, embeddings และ warmup; key มีอยู่ไม่ใช่สิทธิ์ให้ใช้ |
| G-DATA | PENDING_OWNER | ไม่ใช้ข้อมูลผู้ป่วย/เอกสารองค์กรจริง; public-source metadata และ external-link MVP ทำได้ตาม provenance/rights ไม่เท่ากับอนุมัติ full-text RAG |
| G-PUSH | CONDITIONAL_AUTHORIZED | ปลายทาง siriponsri/LabClear, branch main เท่านั้น; ผ่าน gates และตรวจ outgoing history |
| G-DEPLOY-RENDER | CONDITIONAL_AUTHORIZED | เฉพาะผลของ main push ที่บริการ Render เดิมรับไป deploy แบบ backward-compatible |
| G-DEPLOY-OTHER | NOT_AUTHORIZED | ไม่มี DNS/domain/Workers/plan/resources/secrets changes หรือ manual production deploy |

ไม่อนุญาต real booking/payment API, partnership claims, privileged API scopes ใหม่, credential changes, secrets rotation, destructive data migration หรือการลด guards เพื่อให้ผ่าน tests

## 4. ปลอดภัยก่อน owner ตั้ง ENV

ทดสอบ 3 สภาพแวดล้อมแยก: ไม่มี key ใหม่, configuration เก่า (ใช้ mock secrets/DB), configuration ใหม่ด้วย doubles ห้ามเปิดใช้ `.env` หรือฐานข้อมูลจริงโดยอัตโนมัติ ต้องตรวจว่า test harness ปิด provider network จริง ไม่อาศัย flag เดียวโดยไม่ดูการโหลดค่า

production ต้องยังใช้เส้นทางเดิมที่ตั้งไว้อยู่ หรือปิดเฉพาะฟีเจอร์ใหม่อย่างชัดเจน ต้องไม่บังคับ ENV ใหม่ตอน import/startup, ไม่ reseed/overwrite ค่า provider ที่บันทึกไว้ และไม่ reset budget counters โดยเงียบ ๆ ขณะ owner ยังไม่ตั้งค่า

รักษา `DATABASE_URL` และ `BUSINESS_DATA_KEY` เดิม ไม่สร้าง key ใหม่ ไม่เปลี่ยนการเข้ารหัส ไม่รัน migrations ที่เปลี่ยน schema/data production ในรอบ unattended นี้ หากฟีเจอร์ต้องมี schema migration ให้เก็บ implementation หลัง disabled flag พร้อม migration plan และไม่ activate ตอน startup

ปุ่ม Test ใน admin ต้องเป็น explicit action แสดง model/provider จริง ผ่าน budget guard และไม่เรียกเองเมื่อเปิดหน้า/บันทึกฟอร์ม/refresh health checks; mocked result ต้องไม่ขึ้นว่า provider จริงผ่าน

## 5. Git และการจบรอบ

เริ่มจากบันทึก local HEAD และ remote main ที่ fetch ได้จริง ตรวจ remote fetch/push URLs และ outgoing commits เดิม การมี commit ที่ owner ยังไม่ push ไม่ใช่สิทธิ์เผยแพร่มันโดยอัตโนมัติ หากมี unrelated/unknown outgoing history ให้พัก push และทำ local work ต่อ

ก่อน push ให้ตรวจใหม่ว่า remote ไม่เปลี่ยน และประวัติที่จะออกทั้งหมดเป็น approved range เมื่อ remote เคลื่อนไหวให้หยุด push ไม่ auto-rebase/merge/reset เพื่อแก้เอง ห้าม force push หรือ skip hooks

หลัง push สำเร็จ ให้เขียนผลจริงลง PROGRESS/MORNING_HANDOFF ในเครื่องโดยไม่ push รอบสองเพื่อบันทึกว่า push แล้ว ระบุไว้ว่า post-push status update ยังเป็น local-only ไม่ claim ว่าไฟล์ที่อัปเดตทีหลังอยู่ใน commit ที่ส่งไปแล้ว

ถ้ามีงานที่ gated ให้เก็บ backlog อย่างครบถ้วน งานที่ส่งได้เป็น SAFE_RELEASE_CANDIDATE ของ scope ที่ตรวจผ่าน ไม่ใช่ project complete หรือ clinical approval สิทธิ์รอบนี้หมดเมื่อส่ง candidate/สรุป blocker จบ ไม่มีการวนแก้และ deploy ใหม่ตลอดคืนไม่สิ้นสุด
