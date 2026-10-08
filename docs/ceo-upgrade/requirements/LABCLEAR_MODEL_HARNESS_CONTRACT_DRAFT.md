# LabClear — Model & Runtime Harness Contract

> r3 execution addendum: active task คือ r4 และข้อ 06/07 อนุญาต conditional main push เพื่อ Render เดิม auto-deploy หลัง gates ผ่าน แต่คืนนี้ไม่เรียก inference จริงหรือเปลี่ยน ENV/schema ข้อมูล model/price/quota เดิมไม่ได้ตรวจซ้ำในรอบนี้

> ฉบับร่าง r3 — overnight execution addendum · 8 ตุลาคม 2026 · Asia/Bangkok
> สถานะ: RUNTIME_MODELS_PROVISIONAL / WORKFLOW_DOCS_CHECKED / LIVE_API_NOT_RUN
> เอกสารนี้แปลงข้อเสนอของ owner เป็นข้อกำหนดสำหรับ Codex ไม่ใช่หลักฐานว่าทดสอบโมเดล เชื่อม API หรือ deploy แล้ว

## 1. ขอบเขตและการตัดสินใจ

ใช้ Codex กับโมเดลพัฒนาที่ owner เลือกไว้ตัวเดียว การแยกโมเดลด้านล่างเป็น runtime ของ LabClear ไม่ใช่คำสั่งตั้ง FO/multiagent ใหม่บนเครื่อง

รักษา UI เดิม, Thai-first, R1–R5, Guest privacy, tenant isolation และ gates จาก LABCLEAR_CEO_UPGRADE_TASK.md ทั้งหมด รอบนี้อนุญาต conditional main push/Render auto-deploy ตามข้อ 06 เท่านั้น ไม่อนุมัติ inference จริง, patient data, DNS, secrets หรือ schema changes

- ชื่อแบรนด์ที่เสนอ: BAS — Bangkok AI Service; ผลิตภัณฑ์ LabClear by BAS
- Preferred domain ที่ owner เห็นด้วย: bangkokaiservice.com; สถานะการจดทะเบียน/ราคา/สิทธิ์: NOT_VERIFIED ไม่ใช่ซื้อแล้ว
- Preferred product hostname: labclear.bangkokaiservice.com; ยังไม่ใช่ URL ที่เปิดใช้งาน
- Infrastructure: RENDER_RETAINED_FOR_OVERNIGHT — main push กระตุ้นเฉพาะบริการ Render เดิมเมื่อ gates ผ่าน ไม่เปลี่ยน DNS/plan/resources/ENV; Workers เป็น future option
- API working budget: เป้าหมาย $10; เพดาน $20 ต่อรอบงบที่ owner กำหนด ไม่รีเซ็ตเองรายเดือน แยกค่าธรรมเนียมเติมเครดิต ภาษี Workers และ domain
- Live evaluation เสนอไม่เกิน $1 ภายใน $20; ยังต้องผ่าน G-API

## 2. Model registry ที่เสนอ

ราคาที่ระบุเป็นข้อมูลประกอบ ณ วันที่ค้น ไม่ใช่ราคาที่รับประกันและยังไม่ได้ยืนยัน endpoint ของบัญชีทีม ทุก provider ต้องผ่าน data-policy และ capability checks ก่อนเปิดใช้

| Slot | Candidate | บทบาท/เงื่อนไข | สถานะเริ่มต้น |
|---|---|---|---|
| planner | deepseek/deepseek-v4.1-flash | วางแผนเมื่อ intent/context ไม่ชัด หรือหลายคำถาม; ไม่เรียกซ้ำโดยไม่จำเป็น | PROVISIONAL |
| advisor | openai/gpt-6-luna | คำตอบทั่วไปและเปรียบเทียบแพ็กเกจจาก catalog/RAG | PROVISIONAL |
| medical_analyzer | inclusionai/ling-3.0-flash-sante:free | วิเคราะห์จาก confirmed values และ evidence; ไม่ตอบผู้ใช้โดยตรง | SYNTHETIC_ONLY_UNTIL_DATA_GATE |
| medical_analyzer_fallback | deepseek/deepseek-v4.1-flash | กรณี Santé ไม่พร้อม, schema ใช้ไม่ได้ หรือไม่ผ่าน data policy; ต้องทดสอบบทบาทนี้เอง | PROVISIONAL |
| thai_composer | openai/gpt-6-luna | ถ่ายทอดข้อสรุปเป็นไทยสำหรับผู้ไม่ใช่บุคลากรแพทย์; ไม่เพิ่มข้อเท็จจริงเอง | PROVISIONAL |
| thai_composer_fallback | Typhoon text API เดิมที่ตรวจพบจริง | เทียบ fidelity, Thai style, latency, quota และราคา; ไม่เปลี่ยนโมเดลตามใจ | EXISTING_CONFIG_TO_VERIFY |
| reviewer | deepseek/deepseek-v4.1-flash | ตรวจคำตอบกับคำถาม ข้อมูลยืนยัน และหลักฐานใน request แยก; ไม่ดูเฉพาะสรุปของ analyzer | PROVISIONAL |
| vision | Typhoon OCR / typhoon-ocr | รักษา integration เดิม ตรวจรุ่นจริงและผลอ่านตัวเลข/หน่วย | EXISTING_CONFIG_TO_VERIFY |
| embedding | openai/text-embedding-3-small | Hybrid กับ BM25 เมื่อ retrieval evaluation แสดงประโยชน์ | PROVISIONAL |
| decision_guard_primary | iApp OpenThai-SystemOne | ตัวเลือกต้นทุนต่ำสำหรับ typed policy decisions ภาษาไทย; ต้อง calibrate ตามงาน | EXISTING_CONFIG_TO_VERIFY |
| decision_guard_candidate | cloudflare/clef-flash | สำรอง/ทดลองหลังตรวจ API และความยาวที่ endpoint อ่านจริง | DEFERRED_ADAPTER_SPIKE |
| content_guard_escalation | meta-llama/llama-guard-4-12b | ตรวจเนื้อหาเพิ่มเติมตาม policy ไม่ใช่ผู้รับรองข้อสรุปทางการแพทย์ | PROVISIONAL |

DeepSeek catalog แสดงเริ่มต้น $0.13 input / $0.52 output ต่อ 1M tokens แต่ dated variant และ provider อาจต่างราคา [M01] Luna แสดง $0.10 / $0.50 [M02] Santé :free แสดง $0 ต่อ token [M03] Embeddings $0.02/1M tokens [M08] Llama Guard แสดง $0.18 / $0.18 [M07]

ห้ามใส่ราคา Clef หรือ Typhoon เป็นศูนย์/ค่าคงที่จากการคาดเดา: Clef มีตัวเลขต่างกันระหว่าง catalog กับ provider listing ที่ค้นพบ ส่วนราคา hosted Typhoon ต้องตรวจบัญชี/เงื่อนไขจริง บันทึก PRICE_UNVERIFIED จนตรวจได้ [M05, M06, M09]

### Registry record ขั้นต่ำ

model_id, provider_allowlist, role, modalities, API family, schema support, tool support, effective_input_limit, output/reasoning limits, timeout, retries, privacy policy, approval status, price_timestamp, unit rates, quota bucket, fallback roles และ last_live_eval

Exact model ID ไม่เท่ากับ immutable weights: บันทึก resolved model/provider/version เท่าที่ endpoint ให้ และทำ regression เมื่อ alias เปลี่ยน ไม่เลือก snapshot ที่ไม่พบจริง

## 3. ข้อจำกัดที่มีผลต่อ implementation

### 3.1 Santé ไม่ใช่ drop-in JSON agent

OpenRouter ระบุว่า endpoint Santé ไม่รองรับ response_format enforcement [M03] จึงต้องมี adapter ที่ขอ JSON ตรวจ schema และ field values ในแอป หาก parse/validate ไม่ผ่านให้ repair ได้หนึ่งครั้งภายใน retry budget หรือใช้ fallback ที่ผ่านเกณฑ์ ห้ามใช้ eval และห้ามเติม field สำคัญจากการเดา

การ parse ผ่านรับรองเพียงโครงสร้าง ไม่ได้ยืนยันความถูกต้องทางการแพทย์ และห้ามให้ Luna อ่าน prose ที่ไม่ได้ตรวจแล้วทำให้ดูน่าเชื่อถือขึ้นแทนการ validation

### 3.2 ข้อจำกัดบริการฟรี

OpenRouter :free มี rate limits; เอกสารอธิบาย 20 requests/minute และ daily cap ตามสถานะการเติมเครดิต (50 หรือ 1,000 requests/day) ต้องตรวจ allowance จริงของบัญชี ไม่คูณโควตาตามจำนวน API keys และไม่หมุน keys เพื่อเลี่ยงข้อจำกัด [M04]

iApp ระบุ free preview 100 requests/minute และ 1,000 decisions/day/key อย่าสมมติว่า 1 request ที่รวมหลายคำถามนับเป็น 1 decision ให้ตรวจหน่วยนับก่อน batching [M06]

ใช้ timeout, bounded retry, circuit breaker และแจ้ง degraded status ตามจริง การย้ายไป paid fallback ต้องอยู่ในเพดานและสิทธิ์เดิม ไม่รอ free endpoint ซ้ำไม่สิ้นสุด

### 3.3 Guard API ต่างชนิดกัน

iApp และ Clef เป็น decision models ที่คืน probabilities/typed decisions ไม่ใช่ chat text ทั่วไป; Llama Guard เป็น content-safety classifier ที่คืนผลตามรูปแบบของมัน จึงต้องมี adapters แยก [M05–M07]

Normalize เป็น ALLOW / BLOCK / ESCALATE / UNAVAILABLE พร้อม policy_version, reason_codes, model/provider, inspected_input_coverage และ usage

ห้ามใช้ confidence threshold เดียวกันข้ามโมเดลโดยไม่ได้ calibrate และห้ามถือว่าความมั่นใจของ classifier คือความน่าจะเป็นที่คำตอบทางการแพทย์ถูก

Clef: Cloudflare ระบุ context 64K ขณะที่ provider listing บางแห่งเตือน effective text truncation ประมาณ 2K จึงให้สถานะ INPUT_COVERAGE_UNVERIFIED ก่อน spike อย่าอาศัย advertised context อย่างเดียว ทดสอบเนื้อหาสำคัญที่ต้น/กลาง/ท้ายอินพุตและ long-document coverage; การตัดข้อความเงียบ ๆ ต้องไม่ให้ ALLOW [M05]

### 3.4 Luna tools

เอกสาร OpenAI ระบุข้อจำกัด function calling ผ่าน Chat Completions ตาม reasoning setting; ต้องทดสอบ request จริงที่ OpenRouter endpoint รองรับ ไม่ใช้พารามิเตอร์เดียวกับทุก provider และไม่เปิด reasoning สูงสุดทุกคำตอบ [M02]

## 4. แบ่งงาน LLM กับ Python โดยไม่ทำให้เป็น keyword bot

**LLM รับผิดชอบ:** เข้าใจภาษาที่ผู้ใช้พูดจริงและบริบทก่อนหน้า วางแผนเมื่อจำเป็น สังเคราะห์หลักฐาน เปรียบเทียบตัวเลือก อธิบายความไม่แน่นอน ปรับความละเอียดและเลือกถามเพิ่มเมื่อข้อมูลไม่พอ

**Python รับผิดชอบ:** identity/tenant authorization, session lifecycle, file validation, source retrieval ACL, schema validation, exact numeric/unit checks, catalog lookup, budget reservation, retries, cancellation, approved tool execution และ telemetry ที่ไม่เก็บเนื้อหา Guest

กำหนด route จาก explicit UI action ได้ตรง ๆ เมื่อทราบงานแน่นอน แต่ข้อความอิสระที่กำกวมหรือไม่รู้จักต้องส่งให้ LLM planner ไม่ตกไปยัง canned answer และอย่าตัดสินการแพทย์ด้วย keyword count

LLM เสนอ action ได้ แต่ backend ต้องตรวจสิทธิ์ arguments และการยืนยันจากผู้ใช้ก่อน side effects ไม่มี shell, exec, filesystem exploration หรือ CLI agent ในเส้นทางตอบแชตผู้ใช้

## 5. กระบวนการตอบ

### General/catalog

Input authorization + input policy guard -> Python catalog/evidence retrieval -> planner เฉพาะเมื่อจำเป็น -> Luna พร้อม runtime Thai/catalog instructions -> code checks + reviewer ตาม baseline requirements -> output guard -> แสดงคำตอบ

การข้าม planner ไม่ใช่การข้าม guard/reviewer เดิม การเปลี่ยน acceptance/rubric ที่เกี่ยวข้องต้องบันทึกและขอ owner ไม่ลด safety เพื่อให้ตัวเลข latency สวย

### Medical/report

Upload validation -> Typhoon OCR เฉพาะเมื่อจำเป็น -> แสดงค่ากับภาพให้ผู้ใช้ยืนยัน -> scope-aware retrieval -> Santé analyzer (หรือ fallback ที่อนุมัติ) -> schema/consistency checks -> Luna Thai composer -> code invariants + medical reviewer -> output guard -> คำตอบพร้อมแหล่งอ้างอิงและข้อจำกัด

อย่า OCR ไฟล์เดิมทุกคำถามต่อเนื่อง และอย่าส่งภาพ/ประวัติทั้งหมดให้ทุกโมเดล แต่การเก็บผลชั่วคราวต้องรักษา Guest policy: ไม่มี persistent Guest OCR cache, prompt log, embeddings ของรายงาน Guest หรือ cross-tenant answer cache

การใช้คนละโมเดล/แยก request ช่วยแยกบทบาท แต่ไม่ใช่ clinical independent validation และอาจยังผิดร่วมกันได้

## 6. Evidence packet และการถ่ายทอดโดยไม่เปลี่ยนสาระ

กำหนด typed packet ที่มีอย่างน้อย:

- user_question, focus และ context ที่จำเป็นเท่านั้น
- confirmed_observations: row_id, original_label, value_raw, parsed_value, unit_raw, reference_raw, confirmation_status, page/location
- sources: stable source_id, version, page/section, scope และ content ที่อนุญาต
- analysis_claims: claim_id, claim_text, supporting_source_ids/observation_ids, uncertainty, applicability และข้อจำกัด
- missing_context และ clarification_needed
- risk_flags: flag, provenance, policy_version; แยก lab H/L flag จาก clinician-approved critical alert
- permitted_next_steps และ prohibited_inferences

Composer รับเฉพาะ packet ที่ schema ใช้ได้ บวก source excerpts ที่จำเป็น ต้องรักษาตัวเลข หน่วย negation ช่วงอ้างอิง ความไม่แน่นอน และ action boundaries ห้ามทำให้ ‘อาจเกี่ยวข้อง’ กลายเป็น ‘เป็นโรคแน่นอน’ หรือเติม dose/treatment

Reviewer ตรวจ final answer เทียบ original confirmed observations + evidence ไม่ใช้ analyzer prose เป็นความจริงต้นทาง ไม่เปิดเผย hidden chain-of-thought ของโมเดล ใช้ claim/evidence/reason-code summaries ที่ตรวจย้อนกลับได้แทน

Python ตรวจความคงเดิมเชิงโครงสร้าง/ตัวเลขและอนุญาตการแปลงหน่วยเฉพาะสูตรที่ตรวจได้ แต่ไม่อ้างว่า regex/schema สามารถพิสูจน์ semantic entailment หรือความถูกต้องทางคลินิกทั้งหมด

คำแนะนำเร่งด่วนใช้ clinical policy ที่ผู้มีอำนาจอนุมัติและมี provenance เท่านั้น ไม่สร้าง threshold ใหม่จาก LLM หากหลักฐานไม่พอให้บอกข้อจำกัดและขอข้อมูล/ส่งต่อ ไม่เดา

## 7. Guard routing policy

เริ่มจาก iApp ตามประสบการณ์ owner และ integration เดิม แต่ทดสอบกับข้อมูลไทยของ LabClear ใหม่

Clef เป็น candidate decision adapter ไม่ต้องเรียกพร้อม iApp ทุกข้อความ Llama Guard เป็นทาง escalation/content moderation ที่มีเหตุผล ไม่ใช้การโหวตตามจำนวนโมเดล

- ALLOW ภายใต้ coverage/policy ที่ผ่านทดสอบจึงไปขั้นต่อไป
- BLOCK ที่ชัดเจนไม่ส่งวนหา provider ที่ยอมตอบ; fallback ไม่ใช่ bypass
- ESCALATE/abstain/คะแนนก้ำกึ่งใช้ second check หรือ human handoff ตาม policy
- UNAVAILABLE ใช้เฉพาะ guard สำรองที่ data policy และ capability ผ่านแล้ว ถ้าไม่มีให้หยุดคำตอบที่ต้องตรวจและแจ้งสถานะจริง
- อย่าจัดคำว่าเลือด ผลตรวจ หรือโรคเป็น unsafe โดยลำพัง ต้องทดสอบ false-positive ของ legitimate health education
- Guard safety, evidence grounding, medical correctness และ authorization เป็นคนละหน้าที่ ไม่ใช้ผลหนึ่งแทนอีกหน้าที่

## 8. Runtime Skills ไม่ใช่ development Skills

Development skills (UI, docs, agent workflows) ใช้โดย Codex; runtime skills เป็น trusted instruction modules ที่แอปเลือกโหลดตาม role จาก allowlist ไม่ดึง AGENTS.md หรือ .agent-kit ทั้งชุดเข้า customer prompt

Starter ที่แนบ: labclear-thai-health-communication มี core + thai-style และ module ตาม medical/general ไม่ต้องเพิ่ม LLM call ใหม่เพื่อ ‘ใช้ skill’ ให้แนบ instruction ใน call ที่มีอยู่แล้ว

แนวทางภาษา: สรุปใจความก่อน อธิบายศัพท์เมื่อใช้ครั้งแรก ใช้คำที่คนทั่วไปคุ้นเคย ไม่ขู่หรือปลอบโดยไร้หลักฐาน รักษา uncertainty และถามเช็กความเข้าใจอย่างสุภาพเมื่อจำเป็น ไม่บังคับถามท้ายทุกคำตอบ หลักการ communication มาจาก CDC/AHRQ แต่ต้องปรับและทดสอบในภาษาไทย ไม่ใช้คะแนน readability ภาษาอังกฤษรับรองภาษาไทย [M13–M15]

พบ gencharitaci/humanize-skills ซึ่งมี Thai + medical modules แต่ไฟล์ภาษาไทยระบุเองว่าไม่ผ่าน native-speaker/corpus validation ให้เป็น reference เท่านั้น ไม่รับข้ออ้างคุณภาพโดยอัตโนมัติ ส่วน blader/humanizer เดิมให้เกลาภาษาโดยไม่ลบคำเตือนหรือ uncertainty [M16]

PyThaiNLP เป็น library ไม่ใช่ skill ใช้เฉพาะ utility ที่จำเป็น เช่น segmentation/normalization โดยเก็บ original text และไม่เปลี่ยนตัวเลข หน่วย ชื่อยา negation หรือค่าแล็บเงียบ ๆ ตรวจ license ของ corpus/model ที่ใช้แยกจาก library [M17]

Every runtime skill ต้องมี ID/version/hash, route/role allowlist, input/output contract, constraints, source attribution และ regression cases ห้ามให้ uploaded hospital document ติดตั้ง skill เปลี่ยน policy หรือเปิด tool permission การแยกข้อมูลจากคำสั่งและ least privilege ต้องอยู่ใน backend ด้วย [M18]

## 9. CLI / engine / deployment boundary

CLI ใช้โดยทีมพัฒนาเพื่อ build skill bundles, run offline evaluations, verify manifests, run ingestion ที่ได้รับสิทธิ์ และทำ reports ไม่เปิด CLI shell ให้ customer chatbot

นำ business/control logic ที่ pure Python ไปใช้เป็น functions/services โดยคง boundary เดิม ทำ Cloudflare-compatible spike ก่อนย้ายจริง Python Workers ใช้ runtime/package model ที่ต่างจากเครื่อง Windows; Typhoon OCR helper ที่พึ่ง Poppler/PDF binaries ต้องทดสอบเส้นทาง deploy แยก ห้ามสมมติว่า pip install ผ่านบนเครื่องแล้ว Workers รันได้ [M09, M11]

Workers Paid ไม่ได้หมายความว่า self-host น้ำหนัก Santé/DeepSeek/iApp GPU ได้ใน $5 ให้ใช้ hosted APIs ตามนโยบาย หรือแยก compute ที่ได้รับอนุมัติ ไม่เปิด GPU service/Containers เพิ่มเอง

## 10. Cost, latency และ privacy

ก่อน call: เลือก approved endpoint -> ประเมิน worst-case spend รวม reasoning/output/retries -> reserve atomically -> ส่ง request -> reconcile usage -> release unused reservation อย่างถูกต้อง ไม่คืน reservation ทันทีเมื่อ timeout ถ้า billing status ยังไม่แน่ชัด

ทุก stage มี token/latency/call caps ไม่มี invisible retries ซ้อน provider SDK กับ orchestration ไม่ hardcode จำนวน turns ที่ขายได้จากราคา per-token อย่างเดียว

ตัวอย่างเพื่อวางแผนเท่านั้น: DeepSeek call ที่ input 6,000/output 800 tokens ที่อัตรา $0.13/$0.52 ต่อ 1M มีต้นทุน $0.001196 (~$1.20/1,000 calls) ไม่รวม reasoning เพิ่ม/retry/โมเดลอื่น/OCR/provider-price variation ดังนั้นให้เลือกคุณภาพและ reliability ไม่ยึด free model จน pipeline เปราะ

เมื่อข้อมูลเป็นจริง ต้องผ่าน G-DATA และตรวจนโยบายทุกปลายทาง รวม OCR/guard/embedding ไม่ใช่เฉพาะ writer OpenRouter routing สามารถจำกัด endpoints ตามนโยบาย เช่น ZDR แต่ต้องตรวจว่ามี endpoint ที่เข้าเกณฑ์จริง ไม่อ้างว่าใช้ฟรีหรือเสียเงินแปลว่าปลอดภัยเท่ากัน [M10]

ห้าม PHI/organization-private content ไป Santé :free จน policy อนุมัติ ข้อมูลตัดชื่อแล้วไม่จำเป็นต้อง anonymous ถ้า endpoint ไม่เข้าเกณฑ์ให้เลือก approved fallback ไม่คลาย policy เงียบ ๆ Metadata logging ต้องไม่กลายเป็น guest history แฝง

## 11. Acceptance และ evidence

### Engineering gates

1. ADAPTER: contract tests แยก chat/decision/OCR; schema failure, invalid enum, timeout, 429, cancellation และ quota exhaustion
2. DATA: tenant isolation ก่อน retrieval/download/cache; revoked source หายจากคำตอบใหม่; no Guest persistence
3. FACT: exact observation/unit/reference/price preservation; negation/uncertainty tests; original evidence อยู่ใน reviewer context
4. GUARD: Thai benign/adversarial cases, abstain, unavailable, long-input tail attacks และ no deny-to-allow provider shopping
5. COST: concurrent reservations, SDK retries, unknown timeout billing, restarts และ all-provider usage
6. SKILL: artifact/version/hash checks, only allowlisted modules, no arbitrary path/tool execution; Thai utility ไม่เปลี่ยน protected facts
7. UX: ถามต่อโดยอ้างบริบท เปลี่ยนระดับรายละเอียด อธิบายศัพท์ และแสดง evidence ได้; ไม่ตอบ canned text เดิมทุกกรณี
8. DEPLOY: critical paths ใน target runtime; OCR/PDF path และ Guest lifecycle ไม่ใช้ผล local dev แทน selected-host validation

### Model/communication evaluation

เริ่ม synthetic cases ที่ตรวจได้โดยมนุษย์: catalog, confirmed lab explanation, missing units, ambiguous report, conflicting sources, valid medical questions, injected instructions, provider outage และ multi-turn follow-up

เปรียบเทียบอย่างน้อย (A) Luna/RAG baseline (B) Santé -> Luna (C) DeepSeek analyzer -> Luna ด้วยหลักฐานและเกณฑ์เดียวกัน วัด usefulness/clarity, factual errors, citation support, numeric fidelity, inappropriate advice, refusal false positives, latency และ total cost

Ablation ของ runtime skill: same model/evidence มีและไม่มี skill เพื่อดูว่าความเข้าใจดีขึ้นโดย factual fidelity ไม่แย่ลง ให้ native Thai non-medical reviewers และผู้เชี่ยวชาญตรวจตามบทบาท แยกคนอ่านเข้าใจจากคนตรวจ medical correctness

หาก analyzer ตรงแต่ final Thai ผิด ให้ถือ compose failure; หาก final ไทยลื่นแต่ evidence ผิดให้ถือ factual failure ไม่ให้ผ่านด้วยคะแนน style สูง

ห้ามรายงาน clinical accuracy หรือ production readiness จาก fixture pass, valid JSON, HTTP 200 หรือ vendor benchmarks ตัวเลขผลทดสอบต้องระบุ actual model/provider/version และ candidate SHA

## 12. งานเพิ่มสำหรับ Codex โดยไม่เปลี่ยนเลข task เดิม

- LC-06a: registry + adapters + policy-aware bounded fallback
- LC-06b: typed evidence packet + protected facts + medical composer/reviewer separation
- LC-06c: runtime skill loading/build + Thai/medical offline evaluation + ablation harness
- LC-07a: selected hosting/OCR dependency spike; Workers เฉพาะเมื่อเลือกเส้นทางนี้ และคง effective input coverage checks
- LC-09a: cross-role/cross-provider regression, quota/budget และ semantic-error review

อ่าน C:\Users\User\.agent-kit แบบ read-only เมื่อ owner ให้สิทธิ์และ path เข้าถึงได้จริง ทำ inventory ที่เกี่ยวข้อง ไม่รัน bootstrap/installer หรือแก้ global setup อัตโนมัติ ไม่อ้างว่าผู้ช่วยในแชตนี้ได้อ่าน path นั้นแล้ว และไม่เริ่มหลาย agents เพียงเพราะพบ role files

## 13. แหล่งอ้างอิงที่ตรวจในรอบนี้

[M01] DeepSeek V4.1 Flash catalog/provider pricing and capabilities: https://openrouter.ai/deepseek/deepseek-v4.1-flash/providers

[M02] Luna catalog และ official API constraints: https://openrouter.ai/openai/gpt-6-luna/providers ; https://developers.openai.com/api/docs/models/gpt-6-luna

[M03] Santé free endpoint capabilities: https://openrouter.ai/inclusionai/ling-3.0-flash-sante%3Afree

[M04] OpenRouter free quotas / pricing: https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/ ; https://openrouter.ai/pricing

[M05] Clef official API/model overview, catalog และ provider listing ที่ต้อง reconcile: https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/ ; https://openrouter.ai/cloudflare/clef-flash ; https://openrouter.ai/provider/primeintellect/

[M06] iApp hosted model API, free preview และ decision limits: https://iapp.co.th/en/docs/llm/openthai-systemone ; https://www.iapp.co.th/en/openmodels/openthai-systemone

[M07] Llama Guard purpose/pricing: https://openrouter.ai/meta-llama/llama-guard-4-12b

[M08] Embeddings pricing: https://openrouter.ai/openai/text-embedding-3-small

[M09] Typhoon OCR และ package usage (หน้าที่เข้าถึงได้มีข้อมูลรุ่นปี 2025; ต้องตรวจรุ่นและราคาในบัญชีอีกครั้ง): https://docs.opentyphoon.ai/en/ocr/ ; https://docs.opentyphoon.ai/en/models/

[M10] OpenRouter privacy and routing: https://openrouter.ai/docs/guides/privacy/data-collection ; https://openrouter.ai/docs/guides/routing/provider-selection

[M11] Cloudflare Python package compatibility: https://developers.cloudflare.com/workers/languages/python/packages/

[M12] Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/

[M13] CDC Everyday Words: https://www.cdc.gov/ccindex/everydaywords/about.html

[M14] CDC Clear Communication Index: https://www.cdc.gov/ccindex/

[M15] AHRQ Teach-Back: https://www.ahrq.gov/health-literacy/improve/precautions/tool5.html

[M16] Humanize reference; language caveat and medical fact preservation: https://github.com/gencharitaci/humanize-skills ; https://github.com/gencharitaci/humanize-skills/blob/main/skills/humanize-skills/references/languages/th.md ; https://github.com/gencharitaci/humanize-skills/blob/main/skills/humanize-skills/references/modes/medical.md

[M17] PyThaiNLP utilities/licensing: https://github.com/PyThaiNLP/pythainlp

[M18] OWASP LLM Prompt Injection Prevention: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

Repository integration baseline ที่อ่าน: docs/ai-providers.md ใน siriponsri/LabClear (file blob SHA f494330c9148d682592fe0988828dcf60702158c ไม่ใช่ full repo commit SHA) เอกสารระบุ slot/JSON agents/reviewer เดิม ให้ตรวจ code ณ local HEAD ก่อน implementation

## 14. สถานะการส่งมอบเอกสารนี้

ทำแล้ว: ตรวจเอกสารสาธารณะและเอกสาร integration ที่ระบุ สังเคราะห์ข้อเสนอเป็น contract draft และจัด starter skill แยกจาก production runtime

ยังไม่ได้ทำ: เรียกโมเดลจริง, benchmark ภาษาไทย/การแพทย์, ติดตั้งลงเครื่อง owner, อ่าน .agent-kit จริง, เปลี่ยน repository, ซื้อ domain หรือ deploy Cloudflare

ใช้ฉบับนี้เป็น input สำหรับ review และ offline implementation ภายในขอบเขตเดิม ไม่ใช้เป็นใบรับรองระบบหรือการอนุมัติส่งข้อมูลจริงออกไป

## 15. Packaging addendum — 8 ตุลาคม 2026

รอบนี้เพิ่ม hosting/evidence/catalog review เท่านั้น ไม่ตรวจราคา/availability/capability ของโมเดลซ้ำ และไม่เรียก hosted inference ข้อเท็จจริงโมเดลจากร่างเดิมต้องตรวจซ้ำก่อนเปิดใช้งาน ไม่ให้ถือเป็น vendor guarantee

Hosting selection รอบ overnight: รักษา Render เดิมตาม task r4/ข้อ 06 ข้อมูลเปรียบเทียบใน 01_HOSTING_DECISION_TH.md เป็นประวัติ ไม่อนุมัติ DNS/Workers/resources

Commercial data boundary: model planner/advisor ต้องรับ official offer records ที่แยกจาก clinical evidence มี branch/variant/price/date/provenance แยก simulation/offsite/partner ห้าม model inference เติมราคา วันหมดเขต หรือ booking confirmation

Runtime skill `package-advice` ที่แนบเป็น starter เดิม ยังไม่ถูกแก้ให้ครอบคลุม R6 ในรอบนี้ เมื่อลงมือให้เพิ่ม provenance/stale-offer/no-partnership/no-overscreening cases และทดสอบโดยรักษา fact-lock เดิม การติดตั้ง skill ให้ Codex ไม่ได้ทำให้แอปโหลด runtime instructions เอง

G-API/G-DATA ยังไม่เปิด; G-PUSH/G-DEPLOY-RENDER ใช้ conditional authorization รอบนี้ คืนนี้ไม่มี inference จริงแม้ free/Test/embedding/OCR


## 16. Overnight execution

implement adapters/registry/harness/admin ด้วย isolated doubles คืนนี้ คง provider settings และ ENV เดิม ไม่เปลี่ยน defaults ตอน startup ไม่เปลี่ยน production schema เพื่อรองรับ registry ใหม่

model ID ในเอกสารไม่เท่ากับ supported adapter/data-policy approval/live connectivity ให้ UI แยก NOT_CONFIGURED/DISABLED/SCHEMA_CHECK_ONLY/LIVE_TESTED ตามหลักฐาน ไม่เอา mock success เป็น real API result

guard/reviewer เดิมยังทำงานใน legacy routes; new route ที่ยังไม่พร้อมให้ปิด ไม่ fallback เป็นคำตอบจำลองเสมือนจริง ไม่ข้าม guard เพราะไม่มี key

ก่อน push ตรวจ configuration matrix, flags/defaults, saved precedence, isolated test DB และ zero provider calls ตามข้อ 07 หลัง gates ผ่านจึง main push ปกติหนึ่งครั้งให้ Render เดิม deploy; owner ตั้ง ENV/Admin และทดสอบด้วย synthetic data ภายหลัง การมีคำสั่งทดสอบใน handoff ไม่ใช่สิทธิ์ให้ agent เรียกเองคืนนี้
