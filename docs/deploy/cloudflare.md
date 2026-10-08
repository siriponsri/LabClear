> **สถานะ: งานที่เลื่อนไว้ (DEFERRED) — ไม่ใช่เป้าหมาย deploy ของ integration 4.0.0-rc1**
>
> เป้าหมายปัจจุบันคือ **Render เดิม** ตาม [render.md](render.md) และเว็บ Next.js แบบบริการที่สองตาม [render-web.md](render-web.md)
> คู่มือนี้เป็นงานของ Claude branch 4.0.0 (Workers Paid + Containers) เก็บไว้เป็นทางเลือกภายหลังตามคำสั่งเจ้าของ ไม่ได้ทดสอบกับ backend ของ Codex
> ค่า `vars` ใน `deploy/cloudflare/wrangler.jsonc` บางตัว (`OPENROUTER_SORT`, `PARALLEL_CHECKS`, `EMBEDDING_ENABLED`, `GUARD_PROVIDER=openrouter_guard`, `PROJECT_BUDGET_THB=360`) อ้างถึงการตั้งค่าที่ backend ของ Codex ไม่มีหรือมีค่าเริ่มต้นต่างกัน ต้องทบทวนกับ [ENV_HANDOVER](../ceo-upgrade/ENV_HANDOVER.md) ก่อนใช้งาน ดู [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
> Cloudflare **Free** ใช้เป็น DNS/proxy หน้า Render ได้ในอนาคตโดยไม่ต้องใช้ไฟล์ชุดนี้ (ดูหัวข้อท้าย [render-web.md](render-web.md))

# Deploy LabClear 4.0.0 บน Cloudflare

คู่มือนี้พาทีมขึ้นระบบบนบัญชี Cloudflare ของทีม (แพ็กเกจ Workers Paid และโดเมนที่ซื้อไว้ใน Cloudflare) ตั้งแต่สร้างฐานข้อมูลจนตรวจรับ ใช้เวลาประมาณ 1 ชั่วโมงสำหรับครั้งแรก

> **สถานะ:** ยังไม่ได้ deploy จากสภาพแวดล้อมที่เขียนเอกสารนี้ เพราะไม่มีสิทธิ์เข้าบัญชีทีมและไม่มีคีย์ OpenRouter สิ่งที่ตรวจแล้วคือ `opennextjs-cloudflare build` กับ `wrangler dev` บน worker ที่ build แล้ว และ `wrangler deploy --dry-run` ของทั้งสอง worker (container ใช้ `--containers-rollout=none` เพราะเครื่องที่ตรวจดึง base image จาก Docker Hub ไม่ได้) ยังไม่เคย build Docker image, ยังไม่เคยต่อ PostgreSQL จริง และยังไม่เคยเรียก OpenRouter จริง ดูรายละเอียดใน [release-4.0.0.md](../release-4.0.0.md)

คู่มือ Render ของรุ่นรวมอยู่ที่ [render.md](render.md) และ [render-web.md](render-web.md)

## ภาพรวมของระบบที่จะขึ้น

> แผนภาพ Cloudflare เดิมอยู่ใน `docs/assets/architecture-4.0.png` ของ `release/4.0.0` (commit `95bf3d7`) ไฟล์ชื่อเดียวกันใน branch นี้เป็นแผนภาพ Render ของรุ่นรวมแล้ว

| ส่วน | ไฟล์ตั้งค่า | ทำอะไร |
|---|---|---|
| Worker `labclear-web` | [`web/wrangler.jsonc`](../../web/wrangler.jsonc), [`web/worker.ts`](../../web/worker.ts) | รับทุก request บนโดเมนของทีม หน้าเว็บ Next.js (OpenNext) ตอบเอง ส่วน `/api/*` และ `/health` ส่งต่อผ่าน service binding ชื่อ `API` |
| Worker `labclear-api` | [`deploy/cloudflare/wrangler.jsonc`](../../deploy/cloudflare/wrangler.jsonc), [`deploy/cloudflare/src/index.ts`](../../deploy/cloudflare/src/index.ts) | ไม่มี hostname สาธารณะ (`workers_dev: false`) ส่ง request เข้า Cloudflare Container ที่รัน FastAPI หนึ่ง instance |
| Container | [`Dockerfile`](../../Dockerfile), [`scripts/container_start.py`](../../scripts/container_start.py) | Python 3.12 + FastAPI ตรวจ `DATABASE_URL` และ `BUSINESS_DATA_KEY` ก่อนรับ traffic หลับหลังไม่มี request 25 นาที |
| PostgreSQL ภายนอก | secret `DATABASE_URL` | เก็บบัญชี แชต รายงาน นัด เอกสารองค์กร และ vector index แบบเข้ารหัส Fernet |
| OpenRouter | secret `OPENROUTER_API_KEY` | คีย์เดียวของทีมสำหรับ planner, ผู้เขียนคำตอบ, OCR, reviewer, safety classifier และ embedding |

หน้าเว็บและ API อยู่บน origin เดียวกัน cookie `labclear_session`, CSRF header และการตรวจ Origin จึงทำงานเหมือนตอนรันในเครื่อง

## สิ่งที่ต้องมี

- บัญชี Cloudflare ที่เปิด **Workers Paid** แล้ว (Containers ใช้ไม่ได้บนแพ็กเกจฟรี) และโดเมนของทีมอยู่ในบัญชีเดียวกัน
- **Node.js 22** และ npm
- **Docker** ที่เปิดอยู่ (Docker Desktop บน Windows/macOS) เพราะ wrangler build image ของ container จาก `Dockerfile` บนเครื่องที่สั่ง deploy
- **Python 3.12** พร้อม `pip install -r requirements.txt` (ใช้สร้างคีย์และบัญชีผู้จัดการ)
- Git และสำเนา repo ที่ commit ครบแล้ว (สคริปต์ deploy ไม่ยอมทำงานถ้ามีไฟล์ค้าง)
- คีย์ OpenRouter ของทีมที่มีเครดิต (งบโครงการ USD 10)

เข้าสู่ระบบ Cloudflare หนึ่งครั้งต่อเครื่อง:

```bash
cd deploy/cloudflare
npm ci
npx wrangler login      # เปิดเบราว์เซอร์ให้เลือกบัญชีของทีม
npx wrangler whoami     # ตรวจว่าเป็นบัญชีที่ถูกต้อง
```

## ขั้นที่ 1 สร้างฐานข้อมูล PostgreSQL

ตัวอย่างนี้ใช้ Neon แบบ free tier ผู้ให้บริการ PostgreSQL อื่นก็ใช้ได้ถ้ารองรับ TLS

1. สมัครที่ [neon.tech](https://neon.tech) แล้วสร้าง project ใหม่ เลือก region ใกล้ผู้ใช้ เช่น AWS Asia Pacific (Singapore)
2. ที่หน้า **Connect** เลือก database และ role แล้วคัดลอก connection string แนะนำให้ปิด *Connection pooling* (ใช้ direct connection) เพราะแอปเปิด connection ใหม่ทุก transaction และยังไม่ได้ทดสอบผ่าน pooler
3. ตรวจว่า URL ลงท้ายด้วย `sslmode=require` เช่น

   ```text
   postgresql://labclear_owner:รหัสผ่าน@ep-xxxx.ap-southeast-1.aws.neon.tech/labclear?sslmode=require
   ```

   ถ้า Neon ใส่ `&channel_binding=require` มาด้วยให้คงไว้ได้ container จะไม่ยอมเริ่มถ้า `sslmode` ไม่ใช่ `require`, `verify-ca` หรือ `verify-full`

ไม่ต้องสร้างตาราง แอปสร้าง `rs_entities` และ `rs_mutex` เองตอนเชื่อมต่อครั้งแรก

ถ้าจะย้ายข้อมูลจากฐานของรุ่น 3.x ให้ใช้ `pg_dump` / `pg_restore` ไปยังฐานใหม่ แล้วใช้ `BUSINESS_DATA_KEY` เดิมของฐานนั้นในขั้นที่ 2

## ขั้นที่ 2 เตรียม BUSINESS_DATA_KEY

ทุกแถวในฐานข้อมูลเข้ารหัสด้วยคีย์ Fernet นี้

- **ฐานข้อมูลใหม่:** สร้างคีย์ใหม่

  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```

- **ฐานข้อมูลที่มีข้อมูลอยู่แล้ว:** ใช้คีย์เดิมที่คู่กับฐานนั้นเท่านั้น ห้ามสร้างคีย์ใหม่ทับ ข้อมูลเดิมจะอ่านไม่ได้อีก

เก็บคีย์ไว้ใน password manager ของทีม ถ้าคีย์หาย ข้อมูลทั้งหมดในฐานจะถอดรหัสไม่ได้ ตอนเริ่ม container จะลองถอดรหัสแถวแรกในฐาน ถ้าคีย์ไม่ตรงจะหยุดก่อนรับ traffic

## ขั้นที่ 3 ผูกโดเมนกับเว็บ

เลือก hostname เช่น `labclear.<โดเมนของทีม>` แล้วรัน:

```bash
cd web
npm ci
npm run cf:domain -- labclear.<โดเมนของทีม>
git add wrangler.jsonc
git commit -m "Set the LabClear domain"
```

สคริปต์ [`web/scripts/set-domain.mjs`](../../web/scripts/set-domain.mjs) เขียน `"routes": [{ "pattern": "labclear.<โดเมน>", "custom_domain": true }]` ลง `web/wrangler.jsonc` ตอน deploy Cloudflare สร้าง DNS record และใบรับรอง TLS ให้เอง ถ้า hostname นี้มี DNS record อยู่แล้ว ให้ลบ record นั้นก่อน ต้อง commit การเปลี่ยนแปลงนี้ เพราะสคริปต์ deploy และ GitHub Actions ใช้ไฟล์ที่ commit แล้ว

ระหว่างยังไม่ผูกโดเมน เว็บยังเปิดได้ที่ `labclear-web.<subdomain>.workers.dev` เพราะ `workers_dev: true`

## ขั้นที่ 4 ตั้ง secret ของ API worker

ตั้งทีละชื่อจากโฟลเดอร์ `deploy/cloudflare` แล้วพิมพ์ค่าเมื่อ wrangler ถาม อย่าใส่ค่าลงในไฟล์ใน Git หรือในแชต

```bash
cd deploy/cloudflare
npx wrangler secret put DATABASE_URL
```

ถ้ายังไม่เคย deploy `labclear-api` wrangler จะถามว่า *There doesn't seem to be a Worker called "labclear-api". Do you want to create a new Worker…* ให้ตอบ `y` worker เปล่าจะถูกแทนที่ตอน deploy ในขั้นที่ 5

| ชื่อ | ค่า | จำเป็น |
|---|---|---|
| `DATABASE_URL` | connection string จากขั้นที่ 1 (`…?sslmode=require`) | ใช่ |
| `BUSINESS_DATA_KEY` | คีย์จากขั้นที่ 2 | ใช่ |
| `OPENROUTER_API_KEY` | คีย์ OpenRouter ของทีม | ใช่ |
| `BUSINESS_PUBLIC_URL` | `https://labclear.<โดเมนของทีม>` ไม่มี `/` ท้าย ใช้ตรวจ Origin และสร้าง callback ของ Google | ใช่ |
| `PROVIDER_NETWORK_ENABLED` | `true` เมื่อพร้อมใช้ AI จริง (ตั้ง `false` ไว้ก่อนได้ถ้าจะตรวจเว็บโดยไม่เสียเงิน) | ใช่ |
| `PROVIDER_BUDGET_CYCLE_ID` | ชื่อรอบ เช่น `labclear-cf-2026-10` เปลี่ยนชื่อรอบ = เริ่มนับจำนวนครั้งใหม่ แต่ไม่รีเซ็ตยอดเงิน | ใช่ |
| `CLOUD_CALL_LIMIT` | เพดานจำนวนครั้งเรียก AI ต่อรอบ นับรวม safety check และครั้งที่ล้มเหลว ค่าเริ่มต้นในโค้ดคือ `3000` | แนะนำ |
| `PROJECT_BUDGET_PRIOR_SPEND_THB` | ยอดที่ใช้ไปแล้วเป็นบาทก่อนเริ่ม ledger (ดูจากหน้า Activity ของ OpenRouter × 36) ใส่ `0` เฉพาะเมื่อคีย์และโครงการใหม่จริง ถ้าไม่ตั้ง ระบบจะไม่เรียก AI | ใช่ |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client ของ Google ตั้ง redirect URI เป็น `https://labclear.<โดเมน>/api/business/auth/google/callback` | ไม่ |
| `GOOGLE_MAPS_EMBED_KEY` | คีย์แผนที่ในหน้าศูนย์บริการ | ไม่ |
| `DEMO_ACCESS_CODE` | รหัส 12 ตัวอักษรขึ้นไปที่ผู้ใช้ต้องกรอกก่อนใช้ AI (กันคนนอกใช้งบระหว่างสาธิต) | ไม่ |

`PROJECT_BUDGET_THB` **ไม่ต้องตั้งเป็น secret** ค่า `360` (USD 10 ที่ 36 บาท/USD) อยู่ใน `vars` ของ [`deploy/cloudflare/wrangler.jsonc`](../../deploy/cloudflare/wrangler.jsonc) แล้ว Cloudflare ไม่ยอมให้ var กับ secret ใช้ชื่อเดียวกัน ถ้าจะเปลี่ยนงบให้แก้ค่าในไฟล์นั้นแล้ว commit ค่าอื่นใน `vars` (`OPENROUTER_ZDR`, `OPENROUTER_SORT`, `EMBEDDING_ENABLED`, `PARALLEL_CHECKS`, `DEMO_ACCOUNTS=false` ฯลฯ) ก็แก้ที่ไฟล์เดียวกัน

ตรวจรายชื่อ secret ที่ตั้งแล้ว (ไม่แสดงค่า):

```bash
npx wrangler secret list
```

## ขั้นที่ 5 Deploy: API ก่อน แล้วเว็บ

ต้อง deploy `labclear-api` ก่อนเสมอ เพราะ service binding ของ `labclear-web` อ้างถึง worker ชื่อนี้ เลือกวิธีใดวิธีหนึ่ง

### วิธี A: สคริปต์ bash (macOS, Linux, WSL)

```bash
scripts/deploy-cloudflare.sh            # dry run: type check และ build ไม่อัปโหลด
scripts/deploy-cloudflare.sh --deploy   # deploy API (container) แล้วตามด้วยเว็บ
```

### วิธี B: PowerShell (Windows)

```powershell
.\scripts\Deploy-LabClearCloudflare.ps1           # dry run
.\scripts\Deploy-LabClearCloudflare.ps1 -Deploy   # deploy จริง
```

ทั้งสองสคริปต์ตรวจว่า Docker เปิดอยู่และ working tree สะอาด รัน `npm ci` กับ type check ในทั้งสองโฟลเดอร์ แล้วส่ง commit ปัจจุบันเป็น `LABCLEAR_COMMIT_SHA` ให้ `/health` แสดง การ deploy ครั้งแรกใช้เวลานานกว่าปกติเพราะต้อง build และ push image ของ container สคริปต์ PowerShell ยังไม่เคยรันบน Windows จริง

### วิธี C: GitHub Actions

[`.github/workflows/deploy-cloudflare.yml`](../../.github/workflows/deploy-cloudflare.yml) รัน pytest, type check และ `i18n:check` ทุกครั้ง แล้ว deploy เฉพาะเมื่อเปิดใช้

1. สร้าง API token ที่ Cloudflare → My Profile → API Tokens ให้สิทธิ์แก้ไข Workers Scripts, Containers และ Workers Routes ของบัญชีทีม
2. ที่ GitHub → Settings → Secrets and variables → Actions เพิ่ม **secrets** `CLOUDFLARE_API_TOKEN` และ `CLOUDFLARE_ACCOUNT_ID` (ดู Account ID ได้จากหน้า Workers & Pages)
3. เพิ่ม **variable** `CLOUDFLARE_DEPLOY=true` และ (ไม่บังคับ) `LABCLEAR_PUBLIC_URL=https://labclear.<โดเมน>` เพื่อให้ workflow รอ `/health` ตอบ commit ใหม่
4. push ขึ้น `main` (การแก้เฉพาะ `docs/`, `*.md` หรือ `presentation/` ไม่ทริกเกอร์) หรือกด **Run workflow** ที่แท็บ Actions

secret ของแอป (`DATABASE_URL` ฯลฯ) อยู่ใน Cloudflare จากขั้นที่ 4 ไม่ต้องใส่ใน GitHub

## ขั้นที่ 6 ตั้งค่าครั้งแรกหลัง deploy

1. **เปิด `/health`** ที่ `https://labclear.<โดเมน>/health` ครั้งแรก container ต้องตื่นและเชื่อมฐานข้อมูล อาจได้ `503 service_starting` ให้รอประมาณ 10 วินาทีแล้วลองใหม่ ผลที่ถูกต้อง:

   ```json
   {"status": "ok", "app": "LabClear", "environment": "production", "version": "4.0.0", "commit": "<SHA ของ commit ที่ deploy>"}
   ```

2. **สร้างบัญชีผู้จัดการ** จากเครื่องของทีม โดยชี้ไปที่ฐานข้อมูล production ชั่วคราว (ค่าที่ตั้งใน shell มีลำดับเหนือ `.env`):

   ```bash
   DATABASE_URL='postgresql://…?sslmode=require' BUSINESS_DATA_KEY='…' APP_ENV=production \
     python scripts/create_staff.py --email manager@<โดเมน> --role manager
   ```

   PowerShell:

   ```powershell
   $env:DATABASE_URL='postgresql://…?sslmode=require'; $env:BUSINESS_DATA_KEY='…'; $env:APP_ENV='production'
   python scripts/create_staff.py --email manager@<โดเมน> --role manager
   Remove-Item Env:DATABASE_URL, Env:BUSINESS_DATA_KEY, Env:APP_ENV
   ```

   สคริปต์ถามรหัสผ่าน (12 ตัวอักษรขึ้นไป) ห้ามเก็บค่าทั้งสองลงไฟล์ `.env` ถาวร

   ทางเลือกที่ไม่แนะนำ: ตั้ง `DEMO_ACCOUNTS` เป็น `"true"` ใน `vars` แล้ว deploy เข้าด้วย `admin` / `1234` จากนั้นตั้งกลับเป็น `"false"` และ deploy อีกครั้งทันที ใครที่รู้รหัสนี้ก็เข้าเป็นผู้จัดการได้ระหว่างนั้น

3. **เลือกชุดโมเดล** เข้า `/staff` → **ผู้ให้บริการ AI** กด **ใช้ชุดโมเดล OpenRouter แบบเร็วและประหยัด** ปุ่มนี้บันทึก planner, ผู้เขียนคำตอบ, OCR, reviewer, safety classifier และ embedding ให้ใช้คีย์ OpenRouter ของทีม จำเป็นเมื่อใช้ฐานข้อมูลเดิมจาก 3.x เพราะค่าที่บันทึกในฐาน (เช่น Typhoon หรือ iApp) มีลำดับเหนือ environment บนฐานใหม่ก็กดได้โดยไม่มีผลเสีย
4. กด **ตรวจความพร้อมโดยไม่เรียก AI** แล้วกด **Test** ของ language model, safety check และ embedding การ Test แต่ละครั้งเรียก AI จริงหนึ่งครั้งและนับเข้างบ ผ่านแล้วแปลว่าคีย์และ routing ใช้ได้ ยังไม่ได้บอกคุณภาพคำตอบ
5. **Vector index สร้างเอง** ครั้งแรกที่มีการค้นฐานความรู้ ระบบเรียก Qwen3 Embedding 8B หนึ่งชุด (ประมาณ 60k tokens น้อยกว่า USD 0.001) แล้วเก็บแบบเข้ารหัสในฐานข้อมูล ระหว่างสร้างคำตอบใช้ BM25 อย่างเดียว container ที่ restart ไม่ต้องสร้างใหม่

## ขั้นที่ 7 ตรวจรับ

ทำครบทุกข้อก่อนให้คนอื่นใช้ ติ๊กเมื่อผ่าน

- [ ] `/health` ตอบ `version` `4.0.0` และ `commit` ตรงกับ `git rev-parse HEAD`
- [ ] หน้าแรกเป็นภาษาไทย สลับ EN ได้ และ `/sources` แสดง 135 รายการ
- [ ] เข้าสู่ระบบที่ `/staff` ด้วยบัญชีผู้จัดการได้ และสมัครบัญชีลูกค้าใหม่ที่ `/app` ได้
- [ ] ผู้เยี่ยมชม: ถามหนึ่งข้อใน `/app` เห็นแถบ "โหมดผู้เยี่ยมชม" กดรีเฟรชแล้วแชตหายและไม่มีข้อมูลใน localStorage/sessionStorage
- [ ] เข้าสู่ระบบจากแถบผู้เยี่ยมชมโดยติ๊ก **เก็บแชตนี้ไว้ในบัญชีของฉัน** แล้วแชตยังอยู่หลังรีเฟรช
- [ ] แนบภาพผลตรวจตัวอย่างในแชต เห็นการ์ดค่า กดยืนยัน แล้วได้คำอธิบายพร้อมแหล่งอ้างอิง
- [ ] ถามคำถามความรู้ เช่น "HbA1c คืออะไร" ได้คำตอบภาษาไทยพร้อมแหล่งอ้างอิงที่กดเปิดได้
- [ ] ขอเวลานัดในฐานะลูกค้า ผู้จัดการยืนยันที่ `/staff` แล้วลูกค้าเห็นสถานะยืนยัน
- [ ] เอกสารองค์กร: ผู้จัดการสร้างองค์กร ลูกค้าเข้าร่วมด้วยรหัส ถูกตั้งเป็นผู้ดูแลองค์กร อัปโหลดไฟล์ .txt ผู้จัดการอนุมัติที่ **ตรวจเอกสารอ้างอิง** แล้วแชตของสมาชิกอ้างอิงเอกสารนั้นโดยระบุชื่อองค์กร
- [ ] `/staff` → **ผู้ให้บริการ AI** แสดงจำนวนครั้งและยอดเงินที่ใช้ไปเพิ่มขึ้นตามการทดสอบ
- [ ] รัน `python scripts/course_eval.py --base https://labclear.<โดเมน>` หรือ `scripts/Run-LabClearEval.ps1 -Round 5 -Base https://labclear.<โดเมน>` เก็บผลดิบไว้และให้คนตรวจทุกกรณี (การประเมินนี้มีค่าใช้จ่าย)

## ย้อนกลับรุ่น (rollback)

Cloudflare เก็บรุ่นเก่าของแต่ละ worker ไว้ ย้อนทีละ worker:

```bash
cd web && npx wrangler versions list && npx wrangler rollback            # เว็บ
cd deploy/cloudflare && npx wrangler versions list && npx wrangler rollback   # API
```

`npx wrangler rollback` โดยไม่ระบุรุ่นจะย้อนไปรุ่นก่อนหน้า ถ้าจะเลือกรุ่นให้ใส่ version ID จาก `versions list` rollback ไม่ย้อนข้อมูลในฐานข้อมูลและไม่ย้อน secret ถ้ารุ่นใหม่เปลี่ยนรูปแบบข้อมูล ให้ restore ฐานจาก backup ของ Neon ด้วย

## ค่าใช้จ่าย

| รายการ | ค่าใช้จ่าย |
|---|---|
| Cloudflare Workers Paid | USD 5 ต่อเดือน รวมโควตาการใช้งาน Workers จำนวนหนึ่ง |
| Cloudflare Containers | คิดตามเวลาที่ container ทำงาน (vCPU, หน่วยความจำ, ดิสก์) ส่วนที่เกินโควตาของแพ็กเกจ instance `basic` หนึ่งตัวที่หลับหลัง 25 นาทีช่วยลดค่าใช้จ่าย ดูราคาปัจจุบันที่ [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/) |
| OpenRouter | ประมาณ USD 0.008 ต่อคำตอบ (สมมติฐานในตารางของ [release-4.0.0.md](../release-4.0.0.md)) งบ USD 10 ≈ 1,250 คำตอบ ระบบหยุดเรียก AI เมื่อ ledger ถึง 360 บาท |
| PostgreSQL | Neon free tier ไม่มีค่าใช้จ่าย ถ้าเกินโควตาฟรีต้องอัปเกรด |
| โดเมน | ทีมซื้อไว้แล้ว |

ตัวเลขของ OpenRouter เป็นค่าประมาณจากราคาวันที่ 7 ต.ค. 2569 ต้องยืนยันด้วย usage จริงหลัง deploy ledger ในระบบปัดราคาขึ้นจึงหยุดก่อนใช้ครบ USD 10 จริงเล็กน้อย

## แก้ปัญหา

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| `403 origin_rejected` "Use this website to continue." | Origin ของเบราว์เซอร์ไม่ตรงกับ host ที่ API รู้จัก ตั้ง `BUSINESS_PUBLIC_URL` ให้เป็น `https://` + hostname ที่ผู้ใช้เปิดจริง ไม่มี `/` ท้าย แล้วรอ container รอบใหม่ (deploy ใหม่หรือรอให้หลับแล้วตื่น) |
| `503 service_starting` หรือหน้าแรกโหลดช้าหลังเงียบไปนาน | container หลับหลัง 25 นาทีและกำลังตื่น ลองใหม่ใน 10–20 วินาที หน้าเว็บสาธารณะใช้ข้อมูล seed ถ้า API ไม่ตอบใน 2.5 วินาที แชตผู้เยี่ยมชมที่ค้างอยู่ใน RAM หายเมื่อ container restart |
| `503 storage_setup` "The service owner must configure durable storage." | API worker ไม่เห็น `DATABASE_URL` หรือ `BUSINESS_DATA_KEY` ตรวจด้วย `npx wrangler secret list` ใน `deploy/cloudflare` |
| `/health` ไม่ตอบเลย หรือ `503` ไม่หาย | container หยุดตอนตรวจตอนเริ่ม ดู log ด้วย `npx wrangler tail` ใน `deploy/cloudflare` หรือ Observability ใน dashboard ข้อความ `Startup validation failed: DATABASE_URL must use sslmode=require…` ให้แก้ URL; `Set the existing BUSINESS_DATA_KEY…` คือคีย์ผิดรูปแบบ; `Database connectivity or encryption-key validation failed.` คือเชื่อมฐานไม่ได้หรือคีย์ไม่ตรงกับข้อมูลเดิม |
| `api_unavailable` "The LabClear API is not connected." | เว็บ deploy ก่อน API หรือชื่อ service binding ไม่ตรง deploy `labclear-api` ก่อนแล้ว deploy เว็บอีกครั้ง |
| `offline` "AI is not connected yet…" หรือแชตขึ้นว่า AI ออฟไลน์ | `PROVIDER_NETWORK_ENABLED` ยังไม่เป็น `true` |
| `cycle_required` หรือ `budget_prior_unknown` | ยังไม่ได้ตั้ง `PROVIDER_BUDGET_CYCLE_ID` / `CLOUD_CALL_LIMIT` ที่มากกว่า 0 หรือ `PROJECT_BUDGET_PRIOR_SPEND_THB` ว่างหรือไม่ใช่ตัวเลข |
| `call_limit_exhausted` หรือ `budget_exhausted` | ครบเพดานจำนวนครั้ง (`CLOUD_CALL_LIMIT`) หรือครบงบบาท ดูยอดที่ **ผู้ให้บริการ AI** เปลี่ยน `PROVIDER_BUDGET_CYCLE_ID` เริ่มนับจำนวนครั้งใหม่เท่านั้น ไม่คืนงบเงิน |
| OpenRouter ตอบ "No endpoints found matching your data policy" หรือ "no endpoints" | ไม่มี endpoint ของโมเดลนั้นที่ผ่านเงื่อนไข ZDR + ไม่เก็บข้อมูล + เพดานราคา ตรวจที่หน้าโมเดลบน OpenRouter ก่อน ทางแก้คือเปลี่ยนโมเดลของขั้นนั้น หรือตั้ง `OPENROUTER_ZDR` เป็น `"false"` ใน `vars` ซึ่งยอมให้ provider ที่ไม่รับประกัน zero data retention รับข้อความสุขภาพของผู้ใช้ได้ ต้องให้เจ้าของโครงการตัดสินใจก่อน |
| `price_unknown` | ตั้งโมเดล OpenRouter ที่ไม่มีราคาใน `OPENROUTER_PRICES` ใส่ราคา (บาทต่อล้าน tokens) ในหน้า **ผู้ให้บริการ AI** หรือใน `MODEL_PRICES_THB` |
| เข้าสู่ระบบ Google แล้วได้ `redirect_uri_mismatch` | redirect URI ใน Google Cloud Console ต้องเป็น `BUSINESS_PUBLIC_URL` + `/api/business/auth/google/callback` ตรงทุกตัวอักษร |
| `npm run cf:domain` แล้ว deploy ไม่ผูกโดเมน | ยังไม่ได้ commit `web/wrangler.jsonc` หรือ hostname อยู่นอกบัญชี Cloudflare ที่ login |

## อ้างอิง

[Cloudflare Containers](https://developers.cloudflare.com/containers/get-started/) · [Container class](https://developers.cloudflare.com/containers/api/container-class/) · [Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) · [Wrangler rollback](https://developers.cloudflare.com/workers/wrangler/commands/#rollback) · [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) · [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
