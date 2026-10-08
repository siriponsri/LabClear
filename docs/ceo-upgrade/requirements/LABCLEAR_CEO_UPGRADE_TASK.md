# LabClear — CEO Upgrade: Single-Model Execution Task (r4 OVERNIGHT)

> r4 active: ให้เริ่ม implementation, local commits และ conditional main push เพื่อบริการ Render เดิม auto-deploy ตาม `06_OVERNIGHT_AUTHORIZATION_TH.md` และ `07_RELEASE_GATE_TH.md` ข้อความสิทธิ์ของ r1–r3 ที่เก็บเป็นประวัติไม่ใช่คำสั่งให้หยุดรออนุมัติ push ซ้ำ ไม่เปิด inference จริง/ENV/DNS/production schema หรือ rollout UI ใหม่ก่อน gate ที่เกี่ยวข้อง

> เอกสารสั่งงานสำหรับ Codex บนเครื่อง owner ไม่ใช่รายงานว่าได้แก้โค้ดหรือทดสอบแล้ว
> วันที่จัดทำ: 8 ตุลาคม 2026 · เขตเวลา: Asia/Bangkok
> สถานะเริ่มต้น: READY_FOR_OFFLINE_IMPLEMENTATION — r4 เพิ่ม commit/push/Render release แบบมีเงื่อนไข; ยังไม่มี implementation หรือ application tests ใหม่จากการทำเอกสารนี้
> active copy อยู่ใน `docs/ceo-upgrade/intake-20261008-overnight/LABCLEAR_CEO_UPGRADE_TASK.md`; ไม่ทับ root task เดิมอัตโนมัติ ให้ targeted-merge หลังอ่าน checkpoint

> r2 companion: อ่าน `LABCLEAR_MODEL_HARNESS_CONTRACT_DRAFT.md` ควบคู่กับไฟล์นี้ รายการโมเดลเป็น candidate สำหรับ offline implementation/evaluation ไม่ใช่อนุมัติเรียก API จริง ข้อกำหนด CEO และ gates เดิมยังคงอยู่

## 0. วิธีเริ่มงานและข้อตกลงหลัก

ใช้ **GPT-6 Astra / High** เป็นโมเดลเดียวตลอดงาน โดย owner เลือกใน Codex ก่อนเริ่ม ไม่สลับโมเดลตาม phase และไม่ตั้งระบบ multiagent หรือ FO ใหม่เพียงเพื่อทำงานนี้ หากจำเป็นต้องตรวจงาน ให้โมเดลเดิมทำ review pass แยกจาก implementation และเรียกว่า self-review ไม่ใช่ independent review

ตัวเลือกนี้เป็นคำแนะนำสำหรับงาน LabClear ที่ให้ความสำคัญกับคุณภาพและการรักษาบริบท ไม่ใช่คำรับประกันว่าโมเดลนี้ทำ UI ได้สวยที่สุดหรือทำงานจบใน session เดียว การเพิ่ม reasoning เป็น Extra High ไม่ใช่ข้อบังคับ และไม่ให้เปลี่ยน setting หรือ global configuration เอง [S01–S03]

**ภารกิจ:** อ่านระบบเดิม ตรวจ CEO requirements แล้วลงมือปรับ LabClear ให้มีแหล่งอ้างอิงและเอกสารเฉพาะองค์กรที่ตรวจย้อนกลับได้ รักษา Guest privacy รักษา Render runtime เดิมในรอบนี้และเตรียม morning handoff โดยไม่ย้าย Workers ใช้ OpenRouter อย่างมีงบประมาณ และยกระดับ UI ภาษาไทยโดยไม่ทำลายดีไซน์และฟังก์ชันเดิม

**วิธีทำงาน:** ดำเนินงานที่อยู่ใน scope ต่อเนื่องเป็นชุดเล็กที่ทดสอบได้ ไม่จบแค่แผน ไม่ถาม “ให้ทำต่อไหม” ทุกขั้น และไม่รอ owner เมื่อยังมีงานอื่นที่ทำต่อได้อย่างปลอดภัย

**ข้อสำคัญ:** การมี task document ช่วยเก็บข้อกำหนดและสถานะ แต่ไม่ได้เพิ่มโควตา ให้อำนาจใหม่ หรือทำให้ Codex รันไม่จำกัด หาก session ถูกหยุด ให้กลับมาทำต่อจากไฟล์และหลักฐาน ไม่ใช่เริ่มวางแผนใหม่ [S03–S04]

---

## 1. Repository และข้อเท็จจริงตั้งต้น

| รายการ | ข้อมูลสำหรับเริ่มตรวจ |
|---|---|
| Repository | https://github.com/siriponsri/LabClear |
| Workspace | `C:\Users\User\Desktop\myProject\LabClear` |
| Branch ที่ owner ใช้งาน | `main` |
| Commit ที่ owner รายงานล่าสุด | `b95621f` — Record 3.0.2 verification and handover evidence |
| Untracked file ที่ owner รายงาน | `course_eval_round4.json` |
| UI ที่ต้องใช้เป็น baseline | UI เดิมของ LabClear ใน repository ไม่ใช่สร้าง design ใหม่จากศูนย์ |
| Codex model | GPT-6 Astra / High ตัวเดียว |
| งบ API ของแอป | เป้าหมาย USD 10; เพดาน USD 20 ต่อรอบงบ รวมทุกบริการในงบ ไม่ใช่งบ Codex; G-API ยังไม่ผ่าน |
| Hosting | รอบ overnight ใช้ Render เดิมตาม workflow owner; ไม่เปลี่ยน tier/DNS/ENV; Workers เป็น future option |
| Preferred domain | bangkokaiservice.com ตามชื่อที่ owner เห็นด้วย; ยังไม่ยืนยันการจดทะเบียน |
| Local agent references | C:\Users\User\.agent-kit: ให้อ่านแบบ read-only เมื่อเข้าถึงได้จริง; ไม่แก้ global setup |

ข้อมูล branch/commit/untracked ข้างต้นมาจาก output ที่ owner ส่งในแชต **ต้องตรวจสภาพจริงใหม่ก่อนแก้ไฟล์** ห้าม reset กลับ commit นี้หากเครื่องเดินหน้าไปแล้ว

บริบทจากเอกสาร repository ที่ถูกอ่านในแชตก่อนหน้า: มี FastAPI/Jinja/JavaScript, BM25 retrieval, provider integration ที่รวม OpenRouter, และ release 3.0.2 ที่อธิบาย Guest แบบชั่วคราว รายละเอียดเหล่านี้เป็นจุดเริ่มตรวจเท่านั้น ไม่ใช่ผล audit ของ working tree ปัจจุบัน และไม่ใช้จำนวน tests/แหล่งข้อมูลใน README เป็นผลตรวจรอบนี้โดยอัตโนมัติ

### การตรวจเริ่มต้นแบบไม่เปลี่ยนข้อมูล

รันจาก PowerShell ใน workspace:

```powershell
Set-Location "C:\Users\User\Desktop\myProject\LabClear"
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
git remote -v
git log -5 --oneline
```

ตรวจ `AGENTS.md`, `AGENTS.override.md` และข้อกำหนดที่มีผลกับ path ที่จะทำงานก่อน ไม่ให้ task นี้ override system/developer instructions, security policy หรือสิทธิ์ของ runtime [S05]

หากไม่ได้อยู่บน `main` หรือ remote ไม่ตรง ให้บันทึกสิ่งที่พบและขอ owner เฉพาะเรื่อง branch/repository ที่ถูกต้อง ห้าม switch/reset/rebase เพื่อแก้ความต่างเอง สามารถอ่านและตรวจงานที่ไม่เปลี่ยนข้อมูลต่อได้

หาก worktree ไม่สะอาด ให้แยกไฟล์ owner ออกจากไฟล์งานนี้ก่อน ไม่จำเป็นต้องหยุดทุกงานเพราะมี untracked file ที่ไม่เกี่ยวข้อง หากชนไฟล์เดียวกับที่ต้องแก้ ให้ใช้ diff และขอคำตัดสินเฉพาะจุด ห้าม stash หรือทับโดยอัตโนมัติ

---

## 2. อำนาจดำเนินงานและ gates

อ่าน `06_OVERNIGHT_AUTHORIZATION_TH.md` ก่อน ลงมือพัฒนาและทดสอบใน workspace ได้ ทำ local commits และ push `origin main` ปกติหนึ่งครั้งเมื่อ `07_RELEASE_GATE_TH.md` ผ่าน ไม่ต้องถาม owner ซ้ำในขอบเขตนี้

| Gate | สถานะรอบนี้ | งานที่ทำต่อได้ |
|---|---|---|
| G-PUSH | CONDITIONAL_AUTHORIZED เฉพาะ siriponsri/LabClear/main | ตรวจ tests/outgoing commits แล้ว push ปกติหนึ่งครั้ง |
| G-DEPLOY-RENDER | CONDITIONAL_AUTHORIZED | เฉพาะผลของ push ที่ Render เดิม deploy แบบ backward-compatible |
| G-UI | PENDING_OWNER สำหรับ rollout | landing preview จริงและ regression fixes ที่รักษาดีไซน์เดิม |
| G-API | OWNER_MORNING_ACTION | mocks/harness/admin integration; คืนนี้ไม่เรียก inference จริงแม้ free |
| G-DATA | PENDING_OWNER สำหรับข้อมูลสุขภาพ/องค์กรจริง | synthetic workflows, rights review queue, public external-link metadata ที่ตรวจแล้ว |
| G-DEPLOY-OTHER | NOT_AUTHORIZED | runbook เท่านั้น ไม่เปลี่ยน DNS/plan/resources/ENV/schema |

พักเฉพาะงาน gated และเดินหน้าส่วนอิสระต่อ การอนุญาต push ไม่เปิดสิทธิ์อื่นโดยปริยาย

ห้าม reset --hard, git clean, force push, skip hooks, auto-rebase/merge เมื่อ remote เคลื่อนไหว ห้ามลบ/แก้/commit course_eval_round4.json หรืองาน owner โดยอัตโนมัติ ห้ามเผยแพร่ unrelated outgoing commits เดิมหรือ stage intake ทั้งโฟลเดอร์โดยไม่ตรวจ

อ่าน `.agent-kit` แบบ read-only เท่านั้น ห้ามเปลี่ยน global .codex/.agent/.agents หรือ agent setup โปรเจกต์อื่น, managed permissions, security/power settings ถาวร, bootstrap/install hooks หรือ overwrite AGENTS.md เดิมโดยพลการ

ใช้ sandbox/Auto-review ที่ owner/client อนุญาตจริง ไม่เปิด bypass-all หรือ workaround หลังถูกปฏิเสธ ห้าม commit secrets/.env/DB/PHI/เอกสารที่ไม่มีสิทธิ์ ห้ามใช้ production DB หรือ provider keys จริงใน tests รักษา legacy behavior และปิดฟีเจอร์ใหม่จน ENV/approval พร้อม ไม่ลด tests/guards เพื่อให้ผ่าน

---

## 3. Source gate: เอกสารและข้อมูลที่ต้องอ่าน

สำรวจ README, source ของเส้นทางใช้งานหลัก, provider/guard/vision pipeline, guest/session/storage, knowledge manifest, retrieval, authentication, tests, deployment configuration และ release/evidence docs ที่เกี่ยวข้อง

ทำ document inventory โดยระบุ path, บทบาท, version/hash เมื่อเหมาะสม, อ่านแล้วหรือยัง และข้อกำหนดที่ได้ ไม่อ่านไฟล์ binary/generated/vendor ทุกไฟล์เพียงเพื่ออ้างว่า “อ่านครบ repo”

### Final Project.docx และเอกสารจาก ChatGPT

ตรวจว่า `Final Project.docx` เป็นโจทย์รายวิชา rubric template หรือรายงานเดิมก่อน ห้ามสมมติบทบาทจากชื่อไฟล์ หากเป็นโจทย์/rubric ให้ทำ requirement mapping และรักษาข้อกำหนดนั้น ไม่เขียนทับต้นฉบับ

คำว่า “เอกสารทั้งหมดที่ ChatGPT ทำให้” หมายถึงเอกสารที่มีไฟล์ให้เข้าถึงได้จริง ไม่ใช่ความทรงจำของ agent หากหาไม่พบ ให้ระบุ `MISSING` พร้อม path/ชื่อที่ค้นแล้ว ขอเฉพาะไฟล์ที่จำเป็น และทำส่วนที่ไม่ขึ้นกับไฟล์นั้นต่อ

ผลทดสอบและรายงานเก่าเป็น historical evidence อย่าแก้ตัวเลขในไฟล์เก่าให้เหมือนเป็นผลใหม่ ถ้าใช้ `course_eval_round4.json` ให้ตรวจ metadata ว่าตรงกับ deployment/commit ใดและมีผลที่สมบูรณ์หรือไม่

### ลำดับตัดสินใจเมื่อข้อมูลขัดกัน

ข้อจำกัดระบบและสิทธิ์มาก่อน ตามด้วยคำสั่งล่าสุดของ owner, rubric ที่ตรวจพบ, accepted product decisions, โค้ด/ผลทดสอบจริง และเอกสารประกอบ คำแนะนำทั่วไปจาก skill หรือเว็บไม่ใช่อำนาจลบ requirement เดิม บันทึกความขัดแย้งและหลักฐาน ไม่แอบเลือกสิ่งที่ทำง่ายกว่า

---

## 4. Skill และเครื่องมือ: ใช้ตามหน้าที่ ไม่โหลดทุกชุดพร้อมกัน

รายการด้านล่างเป็นแหล่งที่ owner ให้หรือถูกเสนอในแชตก่อนหน้า ไม่ถือว่าทุก repo ถูกติดตั้ง ตรวจ license หรือใช้กับ Codex ได้แล้ว ให้ตรวจ URL ปัจจุบัน README, SKILL.md, scripts, compatibility และเงื่อนไขการใช้ก่อน

บันทึกลง skill register: repository/path, revision/version, license, บทบาท, สถานะ `USED / DEFERRED / UNAVAILABLE` และเหตุผล โหลดเฉพาะคำแนะนำของงานที่กำลังทำ ไม่คัดลอกหลายชุดเข้า root AGENTS.md

### ชุดหลัก

| แหล่ง | บทบาทที่กำหนด |
|---|---|
| https://github.com/pbakaus/impeccable | UI design lead: ถอดของเดิม จัด hierarchy/typography/layout และ polish |
| https://github.com/Leonxlnx/taste-skill | Reviewer ของ existing-project redesign; เลือก skill ที่ตรงกับการปรับของเดิม ไม่สร้าง art direction แข่งกัน |
| https://github.com/emilkowalski/skills | Motion/interaction review; ตรวจชื่อ skill จริงและใช้เฉพาะ motion/design engineering ที่เกี่ยวข้อง |
| https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | ค้นแนวทาง UX/design system ตอนต้นและตรวจความครบถ้วน ไม่เปลี่ยน approved design เอง |
| https://github.com/vercel-labs/agent-skills | React/Next implementation correctness เฉพาะเมื่อ stack ที่เลือกใช้จริง |
| https://github.com/cloudflare/skills | Cloudflare platform/runtime/deployment guidance ที่เกี่ยวข้อง |
| Playwright เดิมของ repo; https://github.com/microsoft/playwright-mcp เมื่อจำเป็น | Browser verification และ screenshots; ไม่ใช่ตัวแทนการตัดสินคุณภาพ design |

ใช้ skill หนึ่งเป็นผู้นำของงานนั้นและอีกชุดเป็น checklist/reviewer ข้อขัดแย้งต้องคลี่ด้วย design brief และ constraints ไม่ผสมกฎจน UI มีหลายบุคลิก

### ชุด optional

- Three.js: https://github.com/alton47/threejs-skills และ https://github.com/cesartevisual/threejs-skills — เลือกไม่เกินหนึ่งชุดเมื่อมี 3D ที่ช่วยผู้ใช้จริง ไม่เพิ่ม XR/physics/postprocessing เพื่อโชว์เทคโนโลยี
- Components: https://github.com/21st-dev/claude-code-plugin และ https://github.com/21st-dev — ตรวจเส้นทางใช้กับ Codex/MCP/CLI จริงก่อน ไม่ถือว่า Claude plugin ลงใน Codex ได้ตรง ๆ ตรวจค่าใช้จ่าย/สิทธิ์ก่อนเรียกบริการ
- Thai report: https://github.com/we-ever/Thai-Report-Format-skill — ลิงก์ที่ owner ให้เดิมคือ https://github.com/we-ever/Thai-Report-Format; ตรวจ redirect และ skill path ก่อนใช้งาน
- Technical writing: https://github.com/gwagjiug/technical-writing
- Humanizer: https://github.com/blader/humanizer — เกลาสำนวนเท่านั้น ห้ามเปลี่ยนข้อเท็จจริง citations ตัวเลขหรือข้อจำกัด
- Diagram: https://github.com/cathrynlavery/diagram-design
- Slides: https://github.com/jameshemson/slides — ใช้เมื่อ rubric/deliverable ต้องมี ไม่เพิ่มงาน slide โดยอัตโนมัติ
- Font references: https://github.com/jeffmcneill/thai-font-collection และ https://github.com/epsilonxe/SIPAFonts — ตรวจสิทธิ์รายฟอนต์ ไม่คัดลอกหรือแจก collection ทั้งชุด

หาก skill ต้อง restart จึงโหลดได้ ให้ checkpoint และแจ้งตามจริง ไม่อ้างว่า skill ถูกเรียกแล้ว หากอ่านคำแนะนำและทำตามเอง ต้องบันทึกว่าใช้เป็น reference ไม่ใช่ installed invocation และไม่ติดตั้ง global เพื่อเลี่ยงข้อจำกัด

---

## 5. R1 — เพิ่มแหล่งอ้างอิงและเอกสารเฉพาะองค์กร

### ผลลัพธ์ที่ผู้ใช้ต้องได้

คำตอบอธิบายแหล่งที่มาที่ตรวจย้อนกลับได้ แหล่งข้อมูลครอบคลุมช่องว่างจริงมากกว่าจำนวนโรงพยาบาลเพียงไม่กี่แห่ง ผู้ใช้ขององค์กรหนึ่งต้องไม่เห็นข้อมูลส่วนตัวของอีกองค์กร และเอกสารใหม่ต้องไม่เข้า retrieval โดยไม่ผ่านการตรวจอนุมัติ

### 5.1 Knowledge coverage และ provenance

Audit ตามหัวข้อที่ระบบรองรับ เช่น การเตรียมตัวตรวจ การอธิบายผลตรวจ หน่วย/ช่วงอ้างอิง และการใช้งานบริการ ทำ coverage matrix ก่อน/หลัง ระบุ source diversity, คุณภาพ, วันที่, ขอบเขต และช่องว่าง

เพิ่มแหล่งที่น่าเชื่อถือจากสถาบัน/แนวทางทางการหลายแห่งตามช่องว่างจริง ไม่ scrape หรือทำสำเนาที่ละเมิดสิทธิ์ ไม่เพิ่ม sources ซ้ำเพื่อทำให้จำนวนดูสูง และไม่อ้างเอกสารที่ยังไม่ได้อ่าน

แยกประเภทอย่างน้อย: medical evidence, lab-specific reference information, service/catalog/policy และ organization-private reference ข้อมูลบริการขององค์กรไม่ทำให้ข้อเท็จจริงทางการแพทย์เปลี่ยน และช่วงอ้างอิงของต่างแล็บไม่ควรถูกนำมาปนโดยละเลยหน่วย วิธีตรวจหรือบริบท

ใช้ manifest/schema เดิมเมื่อเหมาะสม และให้มีข้อมูลที่จำเป็นต่อการตรวจย้อนหลัง: stable source ID, institution/title, URL หรือ private file ID, version/date/accessed date, page/section, source type/scope, organization ID เมื่อเกี่ยวข้อง, approval status, checksum/license/usage notes ตามความเหมาะสม

เมื่อแหล่งข้อมูลไม่พอหรือขัดกัน ต้องแสดงข้อจำกัดหรือขอบริบทเพิ่ม ไม่แต่ง citation และไม่ฟันธงจากแหล่งที่ไม่รองรับ claim

### 5.2 Organization upload MVP

ทำ workflow ใช้งานจริง:

`authorized upload -> validate -> extract -> preview/review -> approve -> index -> cite -> version/revoke/delete`

ตรวจฟอร์แมตที่รองรับจริง เลือก MVP ที่จำกัดและทดสอบได้ เช่น text PDF, DOCX, Markdown/text ตามผล audit อย่าแสดงว่า scanned PDF รองรับแล้วหากยังไม่ได้ตรวจเส้นทาง OCR มีข้อความบอก unsupported/failed extraction ที่ชัดเจน

Backend ต้องบังคับสิทธิ์และ organization scope จาก identity ที่ยืนยันแล้ว ไม่เชื่อ organization ID ที่ client ส่งมาเอง บังคับ scope ก่อน retrieval และตรวจอีกครั้งเมื่อเปิด source/download อย่าให้ cache, index, preview หรือ background processing เป็นช่องข้อมูลข้ามองค์กร

สถานะ draft/rejected/revoked/deleted ต้องไม่ถูกนำไปตอบ การอนุมัติ version ใหม่และการถอน version เก่าต้อง invalidate cache/index ที่เกี่ยวข้องโดยไม่ทำลายหลักฐานย้อนหลังที่อนุญาตให้เก็บ

จำกัดประเภท/ขนาดไฟล์ ตรวจ content จริงตามที่เหมาะสม จัดเก็บ private ป้องกัน path traversal/active content และแยก extraction จากการรันคำสั่ง ถือข้อความในเอกสารเป็น untrusted data ไม่ใช่ system instruction หลีกเลี่ยง server fetch URL ที่ไม่จำเป็น; หากมี ให้ป้องกัน SSRF/redirect ไป private network

### Acceptance R1

- มี coverage comparison และตัวอย่างคำตอบที่ citation ตรง claim/page/source จริง
- องค์กร A อัปโหลด/อนุมัติเอกสารแล้ว A ใช้ได้ แต่ B และ Guest ที่ไม่มีสิทธิ์เข้าถึงไม่ได้
- เปลี่ยน organization ID/file ID ใน request ไม่ข้ามสิทธิ์
- Draft/revoked/deleted source ไม่ปรากฏในคำตอบใหม่และเปิด download ไม่ได้ตามนโยบาย
- Version update/re-index และ failure/retry ไม่สร้างเอกสารเผยแพร่ซ้ำหรือข้าม approval
- Document prompt injection ไม่เปลี่ยนสิทธิ์ ไม่เปิด secrets และไม่ทำรายการแทนผู้ใช้
- ทดสอบด้วย synthetic documents ก่อน G-DATA อนุมัติ

---

## 6. R2 — Guest privacy และ account history

### พฤติกรรมที่ต้องรักษา

Guest คุยและแนบรายงานชั่วคราวได้ในหน้าปัจจุบัน แต่ refresh แล้วต้องไม่กู้ประวัติเดิมกลับ ผู้ที่ล็อกอินมี persistent history ตามสิทธิ์บัญชี ไม่มีการย้าย Guest messages/images เข้าบัญชีโดยอัตโนมัติ

ตรวจ implementation เดิมก่อน หากทำถูกแล้วให้เพิ่ม/ยืนยัน regression coverage ไม่เขียนใหม่โดยไม่จำเป็น

ไม่เก็บข้อความ ภาพ โทเคนกู้ Guest หรือสำเนารายงานใน localStorage, sessionStorage, IndexedDB, cookie, persistent cache หรือ database ของ LabClear ตรวจ logs/telemetry/request bodies ที่อาจกลายเป็นประวัติแฝง ข้อมูลชั่วคราวฝั่ง server ต้องจำกัดทรัพยากรและมี cleanup ที่ตรวจได้

ระบุให้ชัดว่าคำขอ AI/OCR อาจส่งข้อมูลให้ provider ตามสิทธิ์และนโยบายที่อนุมัติ การไม่เก็บประวัติใน LabClear ไม่เท่ากับการรับประกันนโยบาย retention ของผู้ให้บริการ

ถ้า runtime ใหม่ไม่สามารถรักษา guest state แบบเดิมได้ ให้ทำ spike และบันทึก tradeoff ห้ามย้าย Guest ไป durable storage เงียบ ๆ เพื่อแก้ปัญหา session

### Acceptance R2

ตรวจ refresh, full navigation, new chat, close/pagehide, expiry, login/logout, กลับจาก browser history/bfcache และแยก tabs ผู้ใช้ไม่ควรพบข้อมูลชั่วคราวที่ถูกยกเลิกกลับมา

ตรวจ in-flight AI/OCR response หลัง refresh/new chat/logout, upload cancellation และ concurrency ไม่ให้ข้อมูลกลับไปอยู่ผิดแชตหรือฟื้น session ที่ลบแล้ว

ยืนยันว่า logged-in history ยังอยู่หลัง refresh, ownership ถูกบังคับ, Guest ไม่กลายเป็นบัญชีถาวร และ test harness ไม่เขียนข้อมูลลงฐานข้อมูลจริง

---

## 7. R3 — รักษา Render และตรวจ deployment compatibility

owner ขอใช้ main push ให้บริการ Render เดิม auto-deploy แล้วตั้ง ENV ตอนเช้า รอบนี้ไม่ย้าย Workers ไม่เปลี่ยน plan/DNS/domain และไม่สร้าง resource ใหม่ ใช้ข้อ 06/07 เป็นขอบเขต active; 01_HOSTING_DECISION_TH.md เป็นข้อมูลเปรียบเทียบที่เก็บประวัติไว้

ตรวจ build/start, Python/OCR/PDF dependencies, database persistence/expiry, encryption, Guest memory, streaming/cancellation, OAuth และ configuration loading จาก code จริง ไม่อ่านค่า secret มาใส่รายงาน

ทดสอบ legacy configuration ด้วย doubles และกรณีไม่มี key ใหม่ให้ boot/admin/core flows ผ่าน ห้าม reseed/overwrite saved provider settings หรือ reset budget ฟีเจอร์ใหม่ต้อง opt-in/disabled ไม่เริ่ม schema/data migrations บน production โดยอัตโนมัติ

เมื่อฟีเจอร์ต้อง migration ให้เก็บหลัง disabled flag และทำ migration plan หากแยกอย่างปลอดภัยไม่ได้ให้เก็บ local candidate ไม่ฝืน push ไม่รอให้ ENV เช้ามาแก้ระบบที่พังจากคืนนี้

### Acceptance R3

มี Render compatibility evidence และ morning config/rollback handoff ที่ผูก candidate จริง แยก LOCAL_VERIFIED, GITHUB_PUSH_VERIFIED, CI_RESULT, RENDER_DEPLOY_STATUS และ LIVE_API_NOT_RUN ไม่ใช้ HTTP 200 ของหน้าเก่ายืนยันรุ่นใหม่

Workers/DNS เป็น future option ไม่ใช่ blocker ของรอบนี้ และไม่อ้างว่าบรรลุ migration แล้ว

---

## 8. R4 — OpenRouter, model evaluation และงบ USD 20

### 8.1 Provider integration

Audit integration เดิมและใช้ต่อเมื่อเหมาะสม ไม่สร้าง provider abstraction ใหม่ซ้ำซ้อน ใช้ OpenRouter เป็นผู้ให้บริการหลักเมื่อผ่าน evaluation แต่ไม่ทำให้ช่องทางอื่นที่ยังมีเหตุผลใช้งานเสีย

แยกหน้าที่ planner, answer generation, reviewer, guard และ OCR/vision ตาม architecture/rubric จริง โมเดลสำหรับพัฒนาใน Codex ไม่ใช่ตัวเดียวกับโมเดล runtime ของ LabClear โดยอัตโนมัติ

ตรวจ model IDs, modality, structured output/tool support, context limits, privacy/routing และ pricing จากเอกสารต้นทาง ณ วันที่ลงมือ ไม่เลือกจากชื่อ “latest” โดยไม่บันทึกตัวจริง และไม่เอาราคาที่ hardcode ใน repo มาเป็นราคาปัจจุบันโดยไม่ตรวจ

ทุก key อยู่ server-side/secret store ไม่ลง frontend, Git, screenshots หรือ logs ไม่ใช้ shared team key ที่ไม่มีขอบเขตงบชัดเจน แนะนำ project-scoped key/limit สำหรับ LabClear ตามบริการรองรับจริง

### 8.2 เกณฑ์เลือกโมเดล

ใช้ owner-proposed shortlist และ role mapping ใน LABCLEAR_MODEL_HARNESS_CONTRACT_DRAFT.md เป็นจุดเริ่ม ไม่เริ่มเลือกใหม่ทั้งตลาดโดยไม่มีเหตุผล เทียบอย่างน้อย Luna/RAG baseline, Santé -> Luna และ DeepSeek analyzer -> Luna ภายใต้ evidence/เกณฑ์เดียวกัน ไม่ต้องเปลี่ยนทุก slot ให้เป็นโมเดลเดียวหรือบังคับ provider เดียว: Typhoon OCR และ iApp เป็นข้อยกเว้นที่เสนอไว้

ก่อน paid requests ทำ evaluation harness ด้วย synthetic/de-identified cases และ doubles ให้ครบ แล้วเสนอ live benchmark ไม่เกิน USD 1 ซึ่งนับรวมใน USD 20 รอ G-API อนุมัติ ผู้ใช้ต้องทราบว่าปุ่ม Test และ OCR/embeddings ก็อาจคิดค่าใช้จ่าย

ประเมินทั้งภาษาไทย, structured output, citation grounding, lab report row/unit fidelity, scope refusal, อัตรา block ผิด, failure/retry, latency และต้นทุนทั้ง pipeline รวม guard/reviewer/OCR ไม่ใช้ HTTP 200 หรือ JSON valid เป็นหลักฐานว่าคำตอบทางการแพทย์ถูกต้อง

กำหนด rubric, cases, จำนวนตัวอย่าง และเกณฑ์เลือกก่อน live benchmark บันทึก p50/p95 เฉพาะเมื่อ sample พอ; หากไม่พอให้แสดงตัวอย่างและข้อจำกัด ไม่อ้างความแม่นยำทางคลินิกจาก evaluation เล็ก ๆ

เมื่อยังไม่เรียกจริง ให้สถานะ `PROVISIONAL_SELECTION / LIVE_EVAL_NOT_RUN` ไม่ประกาศว่าโมเดล “แม่นที่สุด” หรือ “ผ่าน” จากข้อมูลผู้ขายอย่างเดียว

### 8.3 งบและการป้องกันค่าใช้จ่าย

ถือ USD 20 เป็นเพดานรวมของโปรเจกต์จน owner กำหนดรอบใหม่ ไม่ใช่งบรายเดือนอัตโนมัติ และไม่ใช่งบ USD 20 ต่อ key/โมเดล/agent

นับยอดเดิมที่ตรวจสอบได้ + live evaluation + normal calls + retry + guard + vision + embedding/indexing รวมอยู่ในเพดาน หากยอด prior spend ไม่ทราบ อย่าเริ่มจากศูนย์เองสำหรับการเรียกเงินจริง

ตรวจ/เพิ่ม persistent budget ledger ที่ reserve งบแบบ atomic ก่อน call รองรับ concurrent requests, timeout, retries และ reconciliation จาก usage/cost ที่ provider ส่งจริง กำหนด conservative reservation และ hard stop ที่ไม่ยอม overspend โดยตั้งใจ Provider key limit เป็นอีกชั้นหนึ่ง ไม่ใช่ใช้แทน app ledger

จำกัด token/output, per-user/guest rate, concurrency และ retries ไม่สร้าง retry storm ไม่ reset counters เมื่อ restart/redeploy หากใช้หลาย instance ต้องใช้ ledger ที่เห็นยอดร่วมกันจริง

เมื่อไม่มี key หมดงบ หรือ provider ล่ม ให้แสดงสถานะจริง ไม่ fallback เป็น simulated answer ที่แกล้งเหมือน LLM ตอบ และไม่ข้าม guard เพื่อลดค่าใช้จ่าย

### 8.4 Embeddings

OpenRouter embeddings เป็นสิ่งให้สำรวจจาก catalog/docs ปัจจุบัน ไม่ใช่ dependency ที่ต้องเพิ่มให้ได้ เปรียบเทียบกับ BM25 เดิมด้วย retrieval relevance/citation coverage และต้นทุน indexing/query

เพิ่ม semantic/hybrid retrieval ต่อเมื่อมีประโยชน์ที่ตรวจได้และผ่านงบ/ข้อมูลที่อนุมัติ ต้องรักษา organization ACL, versioning, revocation และ cache isolation เหมือนเดิม ห้ามทำให้ “ใช้ embeddings แล้ว” เท่ากับ “RAG ถูกต้องขึ้นแล้ว” โดยไม่มีหลักฐาน

### Acceptance R4

มี provider/config tests, budget-concurrency/retry tests, missing-key/limit behavior, evaluation harness และ model/cost comparison ที่มีวันที่และ sources

แยก `SOFTWARE_TESTS_WITH_DOUBLES` จาก `LIVE_MODEL_EVALUATION` อย่างชัดเจน การขาด G-API ไม่ขวาง offline implementation แต่ห้ามเรียก selection ว่า live validated

---

## 9. R5 — Thai-first UI ที่โดดเด่นโดยรักษาของเดิม

### 9.1 Design brief

ใช้ LabClear ปัจจุบันเป็น visual baseline ถอดสี โลโก้ typography spacing components navigation และรูปแบบที่ owner ชอบก่อน สร้างภาพ “ผลิตภัณฑ์สุขภาพที่น่าเชื่อถือ อบอุ่น ชัดเจน” ไม่ใช่เว็บเปิดตัว AI แบบทั่วไป

ไทยเป็นค่าเริ่มต้น ครอบคลุม navigation, buttons, forms, validation, errors, empty/loading states, chat, reports, citations และ staff pages รักษา TH/EN switch ที่มีอยู่และไม่ให้แปลแค่ landing

ตรวจการตัดคำไทย วรรณยุกต์ baseline/line-height ข้อความผสมอังกฤษ ชื่อแพ็กเกจ ตัวเลขและหน่วย อย่าแก้ด้วยการยัด `<br>`, `nowrap` หรือซ่อน overflow แบบเหมารวม ไม่บังคับเปลี่ยนฟอนต์หากของเดิมอ่านดีและเหมาะกับ owner อยู่แล้ว

### 9.2 Signature interaction

ทำจุดเด่นที่สื่อคุณค่าของ LabClear เช่น “รายงานแลปจำลองที่กดสำรวจค่า เปิดคำอธิบาย และดูแหล่งอ้างอิง” หรือแนวทางที่ดีกว่าพร้อมเหตุผล ตัวอย่างต้องระบุว่าเป็นข้อมูลจำลอง

Landing มีเอกลักษณ์ได้ แต่หน้าแชตและรายงานต้องสงบ อ่านง่าย และให้การกระทำหลักเด่นกว่าการตกแต่ง ห้ามสร้างรีวิว สถิติ โลโก้ลูกค้า คำรับรอง หรือ clinical validation ที่ไม่มีหลักฐาน

React/Next/Three.js เป็นตัวเลือก ไม่ใช่ข้อบังคับ เลือก stack จากข้อจำกัดจริงและ migration decision ถ้าใช้ 3D ต้องมีเหตุผลต่อผู้ใช้ มี lazy loading, fallback, reduced-motion support และวัดผลกระทบ ไม่สร้าง particle/glow/spinning object เพียงเพื่อให้ดูใช้ AI

Microinteraction ต้องตอบสนองการกระทำ: focus, validation, loading, citation expansion, tab/menu และ cancellation ตรวจ interruption, enter/exit, easing/duration ตามบริบท ไม่ใส่ animation ทุกข้อความหรือ motion ที่ทำให้การอ่านสะดุด

### 9.3 Preview และ owner gate

ทำ recommended landing direction หนึ่งแบบที่เปิดและกดได้จริง แยก route/preview area ไม่แทนหน้าจริงทันที เสนอ hero alternative เพิ่มหนึ่งแบบเฉพาะเมื่อมีความไม่แน่ใจสำคัญ ไม่ต้องสร้างสองแอปหรือหลาย theme เต็มชุด

เก็บ baseline + after screenshots และ run instructions ระบุสิ่งที่รักษาและสิ่งที่เปลี่ยน ให้ owner พิจารณา G-UI ก่อนขยาย design ไปทั้งแอป

ระหว่างรอ ทำงาน backend/security/offline evaluation/runtime spike ต่อได้ เมื่อ owner อนุมัติ ให้บันทึกทิศทางและ scope ที่อนุมัติ ห้ามแก้ redesign ครั้งใหญ่รอบใหม่โดยไม่มีเหตุผลจาก regression หรือ feedback

### Acceptance R5

ตรวจด้วย browser อย่างน้อยที่ความกว้าง 390, 768 และ 1440 px พร้อมเส้นทางหลัก keyboard navigation, focus visibility, reduced motion, long Thai text, error/loading/empty states และ zoom ตามความเหมาะสม

Screenshots ต้องมาจากแอปที่รันจริงและ commit/working-tree candidate ที่ระบุ ไม่ใช่ภาพ mockup หรือ image-generation output แทน implemented UI ต้องเปิดดูภาพ แก้สิ่งผิด แล้ว capture ใหม่หลังแก้

ทุก control มี behavior จริง หรือระบุว่าเป็น preview/disabled พร้อมเหตุผล ไม่มี dead CTA, misleading success หรือเมนูที่ไปผิดหน้า วัดความเร็วจากสภาพแวดล้อมที่ระบุ และเทียบกับ baseline ไม่อ้าง “production fast” จาก local screenshot

---

## 10. ลำดับงานและ task ledger

ให้ใช้ ID ต่อไปนี้ ไม่ renumber เมื่อต้องเพิ่มงานย่อย ให้เพิ่ม suffix เช่น `LC-04a`

| ID | งาน | Dependency | ผลลัพธ์หลัก |
|---|---|---|---|
| LC-00 | ตรวจ workspace/HEAD/dirty files/agent rules | ไม่มี | baseline ที่ตรวจจริงและขอบเขตไฟล์ owner |
| LC-01 | Source inventory, rubric mapping, skill register | LC-00 | รู้ข้อกำหนดและสิ่งที่ยังขาด |
| LC-02 | Baseline browser + design brief + landing preview | LC-01 | preview จริงและ G-UI request |
| LC-03 | Knowledge coverage และ source provenance | LC-01 | manifest/coverage/citation tests |
| LC-04 | Organization upload/review/index/ACL | LC-03 | synthetic end-to-end และ isolation tests |
| LC-05 | Guest/account privacy regression | LC-01 | privacy tests และแก้เฉพาะ gap |
| LC-06 | OpenRouter integration/budget/offline eval | LC-01 | offline-ready pipeline และ G-API request |
| LC-06a | Model registry/adapters/policy-aware fallback | LC-06 | chat/decision/OCR contracts และ error tests |
| LC-06b | Evidence packet + protected facts + composer/reviewer | LC-06a | semantic/numeric fidelity cases |
| LC-06c | Runtime skills + compiler + offline ablation harness | LC-06b | versioned instruction modules และ evaluation fixtures |
| LC-07 | Hosting decision/selected-path compatibility spike | LC-01, ประสาน LC-04/05/06 | architecture/config/runbook |
| LC-08 | ขยาย Thai-first approved design | LC-02 + G-UI | หน้าแอปจริงและ browser evidence |
| LC-09 | Full regression/security/visual review | งานที่เปลี่ยนเสร็จ | defect fixes และ evidence manifest |
| LC-10 | รายงานไทย/diagram/rubric completion | หลักฐานของงานที่ทำแล้ว | report ที่ตรง implementation |
| LC-11 | Local delivery: commits, bundle, ZIP, handoff | LC-09/10 ตาม scope ที่ส่ง | verified local candidate/manifest |
| LC-12 | Live evaluation และ cloud deployment validation | G-API/G-DEPLOY ตามงานย่อย | ผลจริงหลังได้รับอนุมัติเท่านั้น |

LC-03 ถึง LC-07 ไม่จำเป็นต้องรอ G-UI ให้โมเดลเดียวทำตามลำดับที่ลด rework และบันทึก dependency ที่ค้นพบจริง ห้ามใช้ “รอ design” เป็นเหตุหยุดงานที่ไม่เกี่ยวข้อง

LC-10/11 ส่งแบบ local candidate ที่ระบุสิ่งค้างได้ แต่ **ห้ามประกาศ project complete** หาก LC-08/12 หรือ acceptance ที่จำเป็นยังไม่ผ่าน

เมื่อ dependency ยังไม่พร้อม ให้เลือก task พร้อมทำถัดไป อธิบายการเปลี่ยนลำดับเฉพาะเมื่อมีผลสำคัญ ไม่เปิดรอบวางแผนใหม่ทั้งชุด

---

## 11. Durable progress: ทำต่อได้เมื่อ context ถูกย่อหรือ session หยุด

### 11.1 ไฟล์หลักและไฟล์สถานะ

คงข้อกำหนดใน `LABCLEAR_CEO_UPGRADE_TASK.md` ไม่เปลี่ยน requirement/gate เอง และให้สร้าง **ไฟล์สถานะหลักเพียงหนึ่งไฟล์**:

`docs/ceo-upgrade/PROGRESS.md`

แยกผลลัพธ์ที่จำเป็น เช่น design, migration, model evaluation หรือ report ไปไฟล์เฉพาะตามขนาดจริง หลีกเลี่ยงเอกสารสรุปซ้ำหลายฉบับ เก็บ evidence ใต้ `docs/ceo-upgrade/evidence/` หรือโครงสร้างเดิมที่สอดคล้อง แล้ว link จาก PROGRESS

### 11.2 PROGRESS.md ต้องมีหัวข้อเหล่านี้

1. **Current checkpoint:** เวลา + timezone, branch, full HEAD SHA, worktree status, task ปัจจุบัน, actual model/effort ที่เห็นได้ หากตรวจ setting ไม่ได้ให้ระบุ owner-selected/unverified
2. **Task ledger:** ID, status, implementation paths, evidence, dependency และ next action
3. **Requirement acceptance matrix:** R1–R5, R6 เมื่อ owner อนุมัติ และ rubric requirements -> implementation -> evidence -> remaining gap
4. **Owner gates:** คำขออนุมัติ ขอบเขต วันที่ และหลักฐานคำตอบ; ไม่ถือว่าสิ่งที่ agent เสนอคืออนุมัติแล้ว
5. **Document/skill inventory:** อะไรอ่านแล้ว ใช้แล้ว ขาด หรือ deferred พร้อมแหล่งและ revision
6. **Decision log:** ทางเลือกที่พิจารณา การตัดสินใจ เหตุผล ผลกระทบ และสิ่งที่ทำให้ต้องทบทวน
7. **Discoveries/blockers:** สิ่งที่พบ ลองแก้อย่างไร ผลจริง และงานอื่นที่ยังทำได้
8. **Verification:** exact commands, exit codes, test results, environment/candidate, screenshot paths และข้อจำกัด
9. **Next executable action:** ขั้นถัดไปที่เริ่มได้ทันที ไม่เขียนเพียง “ทำต่อ”
10. **Outcome/retrospective:** สิ่งที่เสร็จ สิ่งที่ไม่เสร็จ สถานะ deployment/live model ที่แยกกัน และข้อควรทราบ

สถานะงานที่อนุญาต: `NOT_STARTED`, `IN_PROGRESS`, `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`, `PENDING_OWNER`, `N/A_WITH_REASON`

`PASS` ต้องมีหลักฐานตาม acceptance; การเขียนโค้ดเสร็จแต่ไม่ได้รันไม่ใช่ PASS
`NOT_RUN` ไม่ใช่ FAIL และไม่ใช่ PASS; `PENDING_OWNER` ใช้เฉพาะงานที่ต้องอนุมัติจริง
`N/A_WITH_REASON` ใช้ได้เมื่อพิสูจน์ว่าไม่เกี่ยวข้อง ไม่ใช่ข้าม requirement ที่ทำยาก

### 11.3 รอบทำงานมาตรฐาน

`อ่าน checkpoint -> เลือก task ที่พร้อม -> inspect code -> implement -> focused test -> browser/visual check เมื่อเกี่ยวข้อง -> self-review diff -> fix -> checkpoint -> ไป task ถัดไป`

อัปเดต PROGRESS หลังแต่ละชุดงานที่ตรวจได้ ก่อน risky change ก่อน context handoff/compaction เมื่อทำได้ และก่อนหยุด ให้การเขียน progress เป็นงานสั้น ไม่ต้องอ่าน source ทั้ง repo หรือ full test suite ใหม่ทุกการแก้เล็กน้อย

ใช้ focused tests ระหว่างพัฒนาและ full suite เมื่อ milestone/closeout เหมาะสม หาก code เปลี่ยนหลัง capture/test ให้ตรวจส่วนที่ได้รับผลกระทบใหม่ ไม่ถือผลเก่าครอบทุก diff

หาก failure เดิมไม่คืบหลังลองอย่างน้อยสองแนวทางที่ต่างกันและมีเหตุผล ให้บันทึกหลักฐาน ระบุ local blocker และไปงานที่ไม่ติด ห้ามวนคำสั่งเดิมโดยไม่เปลี่ยนสมมติฐานหรือใช้ retry ไม่สิ้นสุด

### 11.4 Resume protocol

เมื่อเริ่ม session ใหม่หรือได้รับคำสั่ง resume:

- อ่าน task file และ PROGRESS ก่อน
- ตรวจ HEAD/worktree จริงเทียบ checkpoint
- อ่าน diffs/decisions/evidence ที่เกี่ยวข้อง ไม่พึ่งข้อความสรุปเก่าเพียงอย่างเดียว
- รักษางานที่ผ่านแล้ว ไม่ reopen โดยไม่มี regression evidence
- ทำ `Next executable action` ต่อ หรืออัปเดตเหตุผลที่ต้องเปลี่ยน
- ไม่ติดตั้ง skills ซ้ำ ไม่ตั้ง agent system ใหม่ ไม่เริ่ม source gate ทั้งโครงการใหม่โดยไม่จำเป็น

หาก quota/permission/runtime ทำให้หยุดจริง ให้เก็บสิ่งที่ทำได้และสถานะไว้ ห้ามอ้างว่าทำต่อใน background ได้เองหรือรับประกันการ resume อัตโนมัติ

---

## 12. Verification และหลักฐานขั้นต่ำ

ค้นคำสั่งตรวจจาก repo จริงก่อน หากคำสั่งเก่าใช้ไม่ได้ ให้แก้ harness อย่างมีเหตุผลและบันทึก ไม่แต่งชื่อ script หรือผล tests ขึ้นมา

### Software and security

ตรวจ unit/integration/browser suites ที่เกี่ยวข้อง, lint/build/type checks ตาม stack, `git diff --check`, regression ของ core flows และ new negative cases

เน้น tenant isolation, account ownership, guest cleanup, source revocation, document injection, rendering/HTML sanitization, budget concurrency/retries และ cancellation ตรวจว่า network calls ของ tests ถูกควบคุมจริง

จำแนก existing failure กับ new regression และห้าม claim ว่า independent review ผ่านเมื่อมีเพียงโมเดลเดิม self-review

### Browser and visual

บันทึก tested routes, viewport, user role, data fixture, screenshot path, console errors และ network behavior เปิดดู screenshot ทุกหน้าที่แก้และแก้ปัญหาที่เห็น ไม่อ้าง “สวย” จาก DOM assertions อย่างเดียว

ถ้า browser/tool/dependency ใช้ไม่ได้ ให้รายงาน `NOT_RUN/BLOCKED` และส่งสิ่งที่ตรวจได้จริง ไม่ใช้ screenshot คนละ version แทน

### Evidence integrity

ทุกชุดหลักฐานต้องระบุ run ID, เวลา, full commit SHA หรือ base SHA + working-tree diff digest, command และ environment ที่ไม่เผย secrets หาก commit หลังทดสอบเปลี่ยนเฉพาะเอกสาร ให้ระบุ test candidate และ delivery SHA แยกกัน ไม่เปลี่ยน provenance ให้เหมือนทดสอบ final SHA แล้ว

ไฟล์ผล live/model tests ต้องระบุ provider/model/cases/cost ตามที่เกิดจริง และไม่มีข้อมูลอ่อนไหวที่ไม่อนุญาตให้เผยแพร่ Historical evidence ให้คงเดิม

---

## 13. รายงานภาษาไทยและงานส่งรายวิชา

LC-10 ต้องอิง rubric/Final Project.docx ที่ตรวจพบและ implementation จริง ไม่ใช้ template เป็นเหตุเปลี่ยนโจทย์รายวิชา

หาก Final Project.docx เป็นต้นฉบับ requirement ให้เก็บไว้และสร้างรายงานใหม่คนละชื่อ เช่น `docs/report/LabClear_CEO_Upgrade_Report_TH.docx` โดยตรวจชื่อ/เวอร์ชันที่เหมาะสมกับโครงสร้างเดิมก่อน

เนื้อหาควรครอบคลุมปัญหา/วัตถุประสงค์, ขอบเขต, architecture, data/provenance, AI workflow/guardrails, UI, evaluation, API cost, privacy/security, deployment status, limitations และ references ตาม rubric ที่มีจริง

ใช้ Thai Report Format เมื่อใช้งานได้ ตรวจ Thai font/line breaking, heading, TOC, captions, diagrams, tables และ pagination ด้วยการ render/เปิดดูจริง หากเครื่องไม่มี renderer ที่ใช้ได้ ให้ระบุข้อจำกัด อย่าอ้างว่าตรวจ layout แล้ว

ห้ามใส่จำนวน tests, ความแม่นยำ, latency, API spending, screenshots หรือสถานะ deployment ที่ไม่มีหลักฐาน การเกลาภาษาไม่ลดทอนข้อจำกัด การมี chatbot prototype ไม่เท่ากับ clinical validation

Slides ทำเฉพาะเมื่อ rubric หรือ owner กำหนด และใช้ evidence เดียวกับ report ไม่สร้างตัวเลขใหม่เพื่อการนำเสนอ

---

## 14. Local commits, conditional main push และ delivery bundle

ใช้ main เดิมและ explicit staged paths ทำ commit ขนาดตรวจได้ อ่าน `07_RELEASE_GATE_TH.md` ก่อนส่ง candidate

อนุญาต push origin main ปกติหนึ่งครั้งท้ายรอบเมื่อ gates ผ่าน เฉพาะ diff ของงานนี้และบริการ Render เดิม ไม่ใช่ unknown outgoing history หรือ production settings

ตรวจ remote fetch/push URLs, recorded origin/main และ outgoing range ก่อน/หลังงาน หาก remote เคลื่อนไหวหรือมีประวัติไม่เข้าใจให้พัก push ห้าม force/rebase/merge หรือข้าม hooks/permissions

LC-11 ให้มี candidate SHA, test evidence, source ZIP/Git bundle ที่ตรวจเมื่อสร้าง, manifest/hash, MORNING_HANDOFF.md, ENV_HANDOVER.md และ backlog/gates ที่ค้าง ห้าม zip ทั้ง worktree หรือรวม secrets/DB/PHI/raw documents/vendor/font collections

หลัง push บันทึกผลลงไฟล์สถานะในเครื่องโดยไม่ push รอบสองเพื่อรายงานว่ารอบแรกสำเร็จ แยก test SHA, delivery SHA และ post-push local notes

ถ้ามี release-critical NOT_RUN/FAIL/BLOCKED ให้เก็บ local candidate ไม่ฝืนส่ง SAFE_RELEASE_CANDIDATE ไม่เท่ากับ project complete/live model validated/clinical validation

---

## 15. Definition of Done และเงื่อนไขหยุด

### 15.1 จบรอบทำงานที่ได้รับอนุมัติ

ถือว่าจบรอบได้เมื่อทุก task ที่ทำได้ภายใต้สิทธิ์ปัจจุบันมี implementation/evidence หรือ blocker ที่มีหลักฐาน ไม่ใช่หยุดทันทีเมื่อพบ gate แรก

สรุปสั้น ๆ ว่าทำอะไรแล้ว ทดสอบอะไรด้วยวิธีใด อะไรยัง NOT_RUN/BLOCKED/PENDING_OWNER พร้อมไฟล์เปิดดูและคำสั่งถัดไปที่จำเป็น อย่าอ้างว่าควบคุมบัญชี cloud หรือทำงานต่อเองหลังจบ session

### 15.2 จบทั้งโครงการ

ต้องผ่าน R1–R5, R6 ตามขอบเขตที่ owner อนุมัติ และ rubric ที่เกี่ยวข้อง มี owner-approved UI, live model evaluation ตามงบที่อนุมัติ, deployment verification ในระดับที่ owner อนุมัติจริง, regression/evidence ครบ และรายงาน/bundle ตรงกับ candidate

หากยังไม่ได้ production approval สามารถส่ง local/preview release candidate ได้ แต่สถานะ production ต้องคง NOT_DEPLOYED หรือ NOT_RUN ตามจริง ไม่เหมารวมว่า “เสร็จ 100%”

### 15.3 หยุดทันทีเฉพาะความเสี่ยงที่ทำต่อไม่ได้อย่างปลอดภัย

หยุดการกระทำที่เกี่ยวข้องเมื่อพบ secrets/data exposure, destructive migration ที่ไม่มี backup/approval, ownership conflict ที่ยังคลี่ไม่ได้, request ให้ข้ามสิทธิ์ หรือ environment ที่ทำให้เสี่ยง production data จากนั้นเก็บหลักฐานที่ไม่เผยข้อมูลลับและดำเนินส่วนปลอดภัยที่เป็นอิสระต่อเมื่อมี

---

## 16. Start และ resume

ใช้ข้อความทั้งหมดใน `10_CODEX_GOAL.txt` สำหรับเริ่มรอบนี้ ไม่ใช้ review-only prompt ใน baseline และใช้ `11_CODEX_RESUME.txt` เพื่อทำต่อจาก checkpoint เมื่อ session หยุด

คำสั่ง permissions/client อยู่ใน `09_CODEX_SETUP_TH.md` ถ้าไม่มี /goal ให้ใช้ prompt ปกติและรายงานว่าไม่ได้เปิด Goal mode ไม่อ้างว่าใช้งานอัตโนมัติแล้ว การ resume ไม่ขยาย gates และไม่อนุญาต push ซ้ำเมื่อรอบเดิมส่งแล้ว

---

## 17. แหล่งอ้างอิงสำหรับแนวทางการทำงาน

แหล่งด้านล่างตรวจเพื่อเลือก workflow/model ในวันที่จัดทำเอกสาร ไม่ใช่หลักฐานว่า implementation ของ LabClear ผ่านแล้ว Codex ต้องตรวจเอกสาร technical/runtime/model pricing ที่เปลี่ยนได้อีกครั้งเมื่อถึงงานนั้น

- **S01 — OpenAI: GPT-6 Astra model.** ความสามารถทั่วไปและ reasoning levels
  https://developers.openai.com/api/docs/models/gpt-6-astra
- **S02 — OpenAI: Model selection.** แนวทางเลือกโมเดล/effort และ tradeoffs; ไม่ใช่ benchmark ของ LabClear
  https://developers.openai.com/api/docs/guides/model-selection
- **S03 — OpenAI Help: Managing usage with GPT-6 Astra in Work and Codex.** Usage ขึ้นกับงานและ settings; higher effort ไม่รับประกันผลดีกว่า
  https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex
- **S04 — OpenAI Cookbook: Using PLANS.md for multi-hour problem solving.** Living execution plans, milestones, evidence และ resumability; ใช้แนวทาง ไม่ใช้ชื่อโมเดลเก่าในบทความเป็นคำแนะนำปัจจุบัน
  https://developers.openai.com/cookbook/articles/codex_exec_plans
- **S05 — OpenAI: Custom instructions with AGENTS.md.** การอ่านคำสั่งเดิมและ scope ของ repository instructions
  https://developers.openai.com/codex/guides/agents-md/

แหล่งข้อมูลตั้งต้นของผลิตภัณฑ์ที่ Codex ต้องเปิดอ่าน ณ HEAD จริง:
`README.md`, `docs/release-3.0.2.md`, `docs/ai-providers.md` และ source/tests ที่เกี่ยวข้องใน repository ที่ระบุในข้อ 1

## 18. Change control

r4 รับคำอนุมัติ owner ให้ implementation/local commits และ conditional main push เพื่อ Render auto-deploy ตาม `06_OVERNIGHT_AUTHORIZATION_TH.md` ไม่ลด requirements R1–R6 ไม่เปิด inference จริง/production data/UI rollout/DNS/schema เพิ่ม

review r3 เดิมครบทั้งชุดอยู่ใน baseline ZIP แบบ byte-for-byte ข้ออื่นและ work-item IDs คงเดิม การแก้ scope/budget/clinical/data gates เพิ่มต้องมาจาก owner ไม่ใช่ agent ตัดสินใจเปิดเอง

---

## 19. r2 — Owner proposal: models, runtime skills และ deterministic harness

### 19.1 ความหมายของโมเดลเดียว

Astra High ตัวเดียวเป็นโมเดลทำงานของ Codex ส่วน customer chatbot ใช้ role-specific models ได้ตาม contract การพบ agent roles ใน .agent-kit ไม่อนุญาตให้ตั้ง FO ใหม่หรือเปิดหลาย agents แทน owner

### 19.2 Model defaults สำหรับการประเมิน ไม่ใช่ live activation

Planner: DeepSeek V4.1 Flash เมื่อจำเป็น; general/catalog: Luna; medical analyzer: Santé :free เฉพาะข้อมูลที่ได้รับอนุญาต โดยเริ่ม synthetic; Thai composer: Luna, Typhoon เป็น candidate backup; medical analyzer fallback/reviewer: DeepSeek ที่ทดสอบบทบาทนั้น; OCR: Typhoon เดิม; embedding: text-embedding-3-small คู่กับ BM25; decision guard: iApp เดิมเป็น default, Clef เป็น candidate adapter, Llama Guard เป็น escalation/content check

ให้รักษา reviewer/guard และ rubric เดิม การเพิ่ม composer ไม่ใช่การเพิ่ม reviewer อิสระ และไม่มีโมเดลใดรับรองความถูกต้องทางการแพทย์เพียงเพราะมีชื่อ medical

### 19.3 ประเด็นที่ต้องล็อกก่อน live

Santé endpoint ไม่บังคับ response_format ตาม public docs ที่ตรวจ ต้องมี adapter และ schema checks; iApp/โมเดล free มีโควตา; Clef เป็น typed decision API และต้องตรวจ effective input coverage; privacy policy ต้องตรวจทุก provider รวม OCR/guard/embedding; unknown quota/price/privacy ต้องรายงาน ไม่แทนด้วยค่าศูนย์หรือสมมติว่าใช้ได้

### 19.4 Runtime skill starter

ไฟล์ skill.zip ที่แนบมี skill เดียวชื่อ labclear-thai-health-communication พร้อม instruction modules และ deterministic compiler ตัว compiler ไม่เรียกโมเดล ไม่ให้คะแนนความถูกต้องทางการแพทย์ และไม่ติดตั้งอะไรให้ owner อัตโนมัติ

ตรวจ SKILL.md และ README_TH.md ก่อนใช้ ความถูกต้องของ packaging/compiler ไม่ใช่การผ่าน live language/medical evaluation การใช้ instruction module ต้องผูกเข้ากับ request builder ของแอปจริง ไม่ใช่เพียงติดตั้ง skill ให้ Codex แล้วคิดว่า chatbot ได้ใช้ด้วย

แยก development skills จาก runtime skills และไม่โหลด .agent-kit/AGENTS.md ทั้งหมดเป็น customer system prompt ใช้ allowlisted reviewed modules ตาม role, version และ hash เท่านั้น

### 19.5 UX ที่แสดงประโยชน์ของ LLM จริง

ให้ผู้ใช้ถามต่อโดยอิงบริบท เลือกระดับคำอธิบาย ขอดูหลักฐาน และเห็นรายงานค่าที่ตนยืนยันได้ สถานะความคืบหน้าต้องมาจากงานที่ทำจริง ไม่ใช้ animation แสร้งว่ามี agent ตรวจ และไม่เปิดเผย hidden chain-of-thought

### 19.6 Change record r2 — ประวัติ; สิทธิ์ปัจจุบันดูข้อ 06/21

r2 เพิ่ม contract candidate/harness/runtime skills, เปลี่ยน working API ceiling จาก USD 10 เป็น USD 20 ตามการขยายงบที่คุย โดยคงเป้าหมาย USD 10 และ benchmark ไม่เกิน USD 1 ภายในเพดาน; เพิ่ม preferred domain และ Workers Paid target พร้อมข้อจำกัด; เพิ่ม .agent-kit read-only inventory และ LC-06a/b/c

ข้อความประวัติ r2: ในขณะนั้นไม่เปลี่ยน approved UI, Guest policy, tenant/data constraints หรือ gates; ปัจจุบัน G-PUSH/G-DEPLOY-RENDER ให้ใช้ข้อ 06/21 ของ r4 ส่วน UI/data/live-model validation ยังคงแยกตามเดิม ไฟล์ต้นฉบับใน baseline ไม่ถูกแก้

แหล่งอ้างอิงและวันที่ตรวจของรายละเอียดใหม่อยู่ใน companion contract [M01–M18] ค่า model/price/API ที่เปลี่ยนได้ต้องตรวจซ้ำเมื่อ Codex ลงมือ


## 20. r3 — Hosting review, medical acquisition และแพ็กเกจโรงพยาบาลจริง

ข้อ 20 เก็บ requirement เพิ่มจาก r3; ปัจจุบันเริ่ม implementation และ conditional main push ได้ตามข้อ 06/21 ไม่ใช่ review-only อีกต่อไป; rights/live-data/UI gates ยังแยกตามเดิม

### 20.1 R1 เพิ่ม source acquisition register

ใช้ `02_MEDICAL_SOURCE_CATALOG_TH.md` และ `data/medical_sources.json` เป็นคิวค้น/ตรวจ/ขอสิทธิ์ ไม่ใช่ approved knowledge ตรวจเอกสารจริงเป็นรายหน้า/section, publication/version, dedup source family, license/usage, clinical review และ provenance ก่อน ingest

ต้องเทียบกับฐานเดิมก่อนประกาศว่าจำนวน sources เพิ่มขึ้น ห้ามนับ chunks/mirrors เป็นหลักฐานอิสระ และห้ามอ้างว่าดาวน์โหลดหรืออ่านครบเมื่อมีเพียง landing/search metadata

### 20.2 R6 — Official hospital package linking

ใช้ `03_REAL_HOSPITAL_PACKAGE_LINKING_TH.md` และ `data/hospital_packages.json` เป็นข้อเสนอ MVP: ลิงก์ไปหน้าโรงพยาบาลจริง แยกข้อมูลจำลอง/ลิงก์ภายนอก/partner API ห้ามยืนยันการจองหรือ partnership โดยไม่มีหลักฐาน

แยก sale_until กับ service_until, branch, variant, eligibility, fees และราคาไม่ทราบ อย่าให้ราคาที่หมดเขตหรือข้อมูลที่ยังไม่ยืนยันผ่านเข้าคำตอบแบบมั่นใจ ต้องมี source URL และวันที่ตรวจ

Clinical evidence ไม่ใช้ hospital commercial page แทน guideline เพื่อบอกความจำเป็นของการตรวจ และไม่เชียร์การตรวจมากขึ้นเพื่อให้แพ็กเกจดูคุ้มค่า

### 20.3 งานย่อยเพิ่มโดยไม่ renumber เดิม

| ID | งานเพิ่ม | เงื่อนไข | หลักฐานที่ต้องได้ |
|---|---|---|---|
| LC-03a | Acquisition/rights/version register | ต่อจาก LC-03 | source metadata, duplicate check, failed-access queue |
| LC-03b | Expert review และ coverage mapping | ก่อน clinical ingestion/live data gate | approved sections และข้อจำกัดตามบริบท |
| LC-04b | External hospital offer catalog + internal mapping | implement external-link MVP/offline tests ได้; ตรวจ public provenance/expiry ก่อนเผยแพร่ ไม่จองจริง | source-linked variants, date/status logic, no fake booking |
| LC-07a | Hosting decision + selected-path spike | ข้อมูลค่าใช้จ่ายและ owner decision | Render/Workers path ตามที่เลือก ไม่บังคับ Workers |
| LC-09b | Expiry/variant/price/PHI/outbound tests | LC-04b | stale offer, unknown price, no fabricated affiliation |

### 20.4 ขอบเขตเพิ่มเติมที่ต้องอนุมัติ

การเชื่อมข้อมูลจริงกับโรงพยาบาลแบบ API/จอง/ส่งข้อมูลส่วนบุคคลยังนอก external-link MVP และต้องมีข้อตกลงกับโรงพยาบาล + สิทธิ์ข้อมูล + security acceptance ก่อน ไม่ได้อนุมัติผ่านการมี URL สาธารณะ

คง main-only, single Codex model, .agent-kit read-only, Guest policy, tenant isolation และ budget controls; G-PUSH/G-DEPLOY-RENDER ใช้ conditional authorization ตามข้อ 06/21 ส่วน gate อื่นยังแยกกัน การเก็บข้อมูลสาธารณะไม่อนุมัติคัดลอกไฟล์เต็มหรือใช้โลโก้โดยอัตโนมัติ

### 20.5 สถานะเมื่อส่งเอกสาร

ไม่มี deployment, ingestion, live API evaluation หรือ booking integration ใหม่จากแพ็กเกจนี้ ชุดโมเดล/ราคา/โควตาจากรอบก่อนยังเป็น historical proposal ที่ต้องตรวจซ้ำ ไม่ใช้ package checksum เป็นหลักฐานว่า chatbot ผ่านการตรวจ


## 21. r4 — Overnight execution และ morning handoff

### เป้าหมาย

ทำ SAFE_RELEASE_CANDIDATE ของ scope ที่ทำได้ภายใต้ gates พร้อม tests/browser/diff/evidence และ push main ครั้งเดียวเมื่อผ่าน หรือเก็บ local candidate/blocker ที่ตรวจได้เมื่อส่งไม่ได้ ไม่ต้องรันจนครบจำนวนชั่วโมงใด ๆ

### Admin และ config readiness

ตรวจ precedence ระหว่าง ENV, DB provider slots และ per-agent overrides เพิ่ม diagnostics ที่ไม่เผย secrets แยก missing-key/disabled/config-valid ออกจาก live-Test ห้าม Test อัตโนมัติเมื่อเปิดหน้า บันทึกฟอร์ม หรือ health check

รองรับ contract ใหม่ด้วย mocks โดยยังไม่ย้าย defaults หรือใช้ keys จริง รักษา credentials/network flags/budget เดิม ไม่ทำให้ admin ต้องมี ENV ใหม่จึงเปิดได้

| ID | งานเพิ่ม | หลักฐาน |
|---|---|---|
| LC-00a | authorization/permissions/outgoing scope | checkpoint และ gate record |
| LC-06d | admin precedence + disabled/Test boundary | legacy/new/missing config tests ด้วย doubles |
| LC-07b | Render boot ก่อน ENV ใหม่ | boot/core flows และ no production schema changes |
| LC-11a | conditional push gate | reviewed outgoing range/candidate/results |
| LC-11b | MORNING_HANDOFF + ENV_HANDOVER | actual config names, pending live tests และ next steps |

PROGRESS.md เป็นไฟล์สถานะหลักเดิม ไม่เขียนทับใหม่ถ้ามีอยู่ บันทึก full SHA, tests/results, self-review, gates, blockers และ next executable action

MORNING_HANDOFF.md แยก local/PUSH/CI/Render/live-API และ ENV_HANDOVER.md ใช้ template ที่แนบโดยกรอกจาก final code จริง ห้ามแต่ง ENV names/defaults หรือใส่ secret values

หลัง push ไม่วน deploy/revert เพิ่ม ไม่อ้าง auto-review permission เป็น independent code/clinical review และไม่สัญญาว่าทำต่อใน background หลัง session หยุด เอกสาร workflow ที่ตรวจล่าสุดอยู่ใน 99_SOURCES_AND_VERIFICATION_SCOPE.md
