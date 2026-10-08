# Release gates — ก่อน commit/push และหลัง Render รับงาน

ใช้ควบคู่ `06_OVERNIGHT_AUTHORIZATION_TH.md` เกณฑ์ด้านล่างเป็นข้อกำหนดให้ Codex ตรวจ ไม่ใช่ผลที่แพ็กเกจนี้ทำให้แล้ว

## A. ตรวจเริ่มต้น

บันทึก full HEAD, branch, git status, remote fetch/push URLs, fetched origin/main และ outgoing range ตรวจ `AGENTS.md`/`AGENTS.override.md` และ `.agent-kit` แบบ read-only รักษา `course_eval_round4.json`, untracked files และงานแก้เดิม ไม่ stash/clean/reset อัตโนมัติ

เอกสาร intake เป็น reference ไม่ต้อง stage ทั้งโฟลเดอร์โดยอัตโนมัติ โดยเฉพาะ baseline ZIP/ข้อมูล local ทางเลือกคือ targeted merge เฉพาะ task, contract และ deliverables ที่ต้องเก็บใน repo หลังตรวจความลับและสิทธิ์

## B. สิ่งที่ต้องผ่านก่อน push

| ID | เกณฑ์ | หลักฐานขั้นต่ำ |
|---|---|---|
| RG-01 | Repo/main/outgoing scope ถูกต้อง | SHA เริ่มต้น + remote SHA + รายการ outgoing commits/diff; ไม่มี commit owner ที่ไม่ทราบสิทธิ์ |
| RG-02 | Build/boot แบบเดิมและยังไม่มี ENV ใหม่ทำงาน | คำสั่งจริง+exit code; ทดสอบ configuration matrix ด้วย doubles และไม่มี outbound provider requests |
| RG-03 | Unit/integration/regression ของส่วนที่เกี่ยวข้อง | suite ที่รันจริง, counts, skipped และเหตุผล; code ที่เปลี่ยนไม่ใช้ผลก่อนแก้แทน |
| RG-04 | Browser flows และ Thai UI | guest refresh/new chat, login/account history, staff/admin, booking เดิม, source display; screenshot 390/768/1440 ที่ candidate นี้ |
| RG-05 | Privacy/security/budget | ownership/tenant isolation, revoked source, guest no persistence, sanitizer, budget concurrency/retries, no key leakage |
| RG-06 | Provider/settings compatibility | saved-config precedence ที่ทดสอบแล้ว; old provider defaults ไม่ถูกเปลี่ยน; no automatic Test/live calls; new routes disabled |
| RG-07 | ไม่มีผลข้างเคียง production แฝง | ไม่มี startup destructive/schema migration, reseed, new required secrets, resource/plan change; diff render.yaml/entrypoint ตรวจเฉพาะจุด |
| RG-08 | ข้อมูลแหล่งอ้างอิง/แพ็กเกจจริงไม่หลอกผู้ใช้ | approved metadata แยก synthetic, stale prices/expiry/variant/branch tests, external link ไม่ยืนยัน booking/partnership; unapproved RAG ไม่ active |
| RG-09 | Diff/dependencies/secrets/publication scope | diff --check, staged and full outgoing diff; ตรวจ package scripts/lockfile; ไม่ commit keys, .env, DB, PHI, raw documents, logs หรือ vendor/font collections |
| RG-10 | Handoff และ rollback plan ใช้ได้ | MORNING_HANDOFF, actual config map, flags/defaults, candidate/test evidence, blockers; ไม่ใช่แค่สรุปว่าเสร็จ |

`NOT_RUN` ไม่ใช่ `PASS` และข้อจำกัดที่จำเป็นต่อ release เช่นไม่มี browser verification สำหรับหน้าที่แก้ทำให้ยัง push ไม่ได้ งานที่ไม่เกี่ยวข้องจริงใช้ `N/A_WITH_REASON` พร้อมหลักฐาน ไม่ใช้ N/A ซ่อนงานที่ยังทำไม่เสร็จ

ห้ามลบ tests, เพิ่ม blanket skip, suppress errors หรือเรียก mock success ว่าทดสอบ provider จริงผ่านเพื่อให้ gate สีเขียว หาก baseline มีปัญหา ให้แยก existing/new แต่ห้ามเพิกเฉย blocker ด้าน boot/privacy/authorization ที่เกี่ยวกับ release

## C. ขั้นตอน Git ที่ต้องมีการตรวจ ไม่ใช่สคริปต์กดแล้ว push ทันที

1. ตรวจทุก staged path และ outgoing commit ไม่ใช้ `git add .` แบบไม่ทบทวน
2. ทำ local commit ที่ตรวจได้ และบันทึก test candidate SHA/working-tree digest ให้ตรง หลักฐานทดสอบ code ก่อน commit สามารถใช้ได้เมื่อ bytes ตรง แต่ต้องระบุความสัมพันธ์ให้ถูก
3. รัน final gates บน candidate และตรวจว่าไม่มี code/dependency/config เปลี่ยนหลังการทดสอบโดยไม่ตรวจซ้ำ
4. `git fetch origin` แล้วเปรียบเทียบกับ recorded remote SHA ตรวจ branch, push URL, outgoing history, hooks และสิทธิ์จริงอีกครั้ง
5. เมื่อครบจึง `git push origin main` ปกติหนึ่งครั้ง ไม่มี force ไม่มีการข้าม hooks หาก remote changed/diverged ให้หยุด push
6. ตรวจ remote SHA กลับมาว่าตรงกับ candidate หาก response timeout อย่าเดาว่าล้มเหลวหรือ push ซ้ำทันที ให้ตรวจ remote ก่อน

## D. หลัง push

แยกสถานะ `LOCAL_GATES_PASS`, `GITHUB_PUSH_VERIFIED`, `CI_RESULT`, `RENDER_DEPLOY_STATUS` และ `LIVE_API_TEST_STATUS` ห้ามใช้แทนกัน

ตาม Render docs [O04] โหมด On Commit กระตุ้น deploy เมื่อ push; After CI Checks Pass ต้องมี checks และไม่ถือว่า zero checks ผ่าน ส่วน `neutral`/`skipped` อาจนับผ่านสำหรับ Render แต่ไม่ใช่หลักฐานว่า test suite รันสำเร็จสำหรับ LabClear ต้องดู workflow/งานทดสอบจริง

ไม่เปลี่ยน Render auto-deploy mode เอง ไม่ใช้ `[skip render]` แอบหลีกเลี่ยง workflow ที่ owner ขอ และไม่อ้างว่ามี CI หากยังไม่ตรวจ repo จริง หากมี CI แนะนำให้มันใช้ synthetic/mocks ไม่ส่ง secrets หรือ call providers; pending CI คือ pending ไม่ใช่ deploy ผ่าน

ตรวจได้เฉพาะ API/logs/health ที่มีสิทธิ์และไม่ทำให้เกิด paid calls หากไม่มีข้อมูลจาก Render ให้ `NOT_VERIFIED` แม้ main push สำเร็จแล้ว ไม่ใช้หน้าเว็บเก่าที่ HTTP 200 เป็นหลักฐานของ commit ใหม่

## E. เมื่อพบปัญหา

ก่อน push: เก็บ local candidate พร้อมหลักฐานและ blockers; ทำงานอิสระต่อจนไม่มีส่วนปลอดภัยที่ทำได้

หลัง push: บันทึก CI/deploy failure โดยไม่วน force/revert/push แก้ไม่จำกัด การ rollback เป็น owner action ตาม runbook เว้นแต่มีคำอนุมัติเฉพาะใหม่; ต้องตระหนักว่า rollback code ไม่ย้อน schema/data changes จึงไม่อนุญาต schema changes ในรอบนี้

สร้าง `docs/ceo-upgrade/ENV_HANDOVER.md` จากชื่อและ precedence ที่พบจริงใน source ห้าม invent ENV variables ขึ้นมาให้ owner ตั้งจนเชื่อว่ารองรับแล้ว
