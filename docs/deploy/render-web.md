# เว็บ Next.js บน Render (บริการที่สอง) — integration 4.0.0-rc2

**เป้าหมาย deploy ของรุ่นรวมคือ Render เดิม** บริการ API `labclear` ตาม [`render.yaml`](../../render.yaml) และ [render.md](render.md) ไม่เปลี่ยน
เว็บ Next.js จาก Claude branch (`web/`) เป็น **บริการ Web Service ตัวที่สองแบบเลือกได้** ที่ส่ง `/api/*` และ `/health` ต่อไปยังบริการ API เดิม
งาน Cloudflare (Workers Paid) เก็บไว้เป็นทางเลือกภายหลัง ดู [cloudflare.md](cloudflare.md) และ [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)

> **สถานะ:** ยังไม่ได้สร้างบริการนี้บน Render จริง ยังไม่ได้แก้ ENV ของ production และยังไม่ได้เรียกโมเดลจริง
> สิ่งที่ตรวจแล้วคือ `npm run build` แล้ว `npm run start:render` บนเครื่องพัฒนา ต่อกับ API จริงของ Codex ที่ใช้ตัวแทนโมเดล
> (`scripts/dev_mock_api.py`) ผ่าน browser UAT ดู [evidence](../evidence/integration-4.0-rc1/README.md)

## ภาพรวม

```text
เบราว์เซอร์ ──https──▶ labclear-web (Render, Node 22, Next.js 16)
                         ├─ หน้าเว็บ /, /packages, /app, /staff, ... (ภาษาไทยเป็นค่าเริ่มต้น สลับ EN ได้)
                         └─ rewrite /api/* และ /health ──https──▶ labclear (Render, Python, FastAPI ของ Codex)
                                                                     └─ PostgreSQL (Render) + ผู้ให้บริการ AI
```

- เบราว์เซอร์เห็น origin เดียวคือ `labclear-web` cookie `labclear_session` จึงเป็นของโดเมนเว็บ (host-only)
- API ตรวจ Origin เทียบกับ Host ของตัวเอง เมื่อมีเว็บอยู่ด้านหน้า ต้องใส่ origin ของเว็บใน `TRUSTED_ORIGINS` ของ API แบบตรงตัว
  (scheme + host + port ไม่มี wildcard) ถ้าว่างไว้ API ทำงานแบบเดิมทุกอย่าง
- หน้า Jinja เดิมของ Codex ที่ `https://labclear.onrender.com/` ยังใช้งานได้ตามเดิม

## ขั้นที่ 1 บริการ API เดิม (ไม่ต้องสร้างใหม่)

ใช้บริการ `labclear` ที่มีอยู่ ตรวจ `/health` ว่าเป็น commit ของรุ่นรวมหลังเจ้าของ merge และ deploy แล้ว
**อย่าเปิด flag ใหม่ทั้ง 6 ตัว** จนกว่าจะผ่านขั้นตอนใน [ENV_HANDOVER](../ceo-upgrade/ENV_HANDOVER.md)

เมื่อสร้างบริการเว็บในขั้นที่ 2 แล้ว เจ้าของระบบเพิ่ม ENV นี้ที่บริการ API (เป็นการแก้ ENV ของ production ทีมต้องทำเอง):

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `TRUSTED_ORIGINS` | `https://labclear-web.onrender.com` | origin ของบริการเว็บแบบตรงตัว ถ้ามีโดเมนของทีมให้ใส่ทั้งสองค่าคั่นด้วยจุลภาค |

## ขั้นที่ 2 สร้างบริการเว็บ

Render → **New → Web Service** → เลือก repository เดียวกัน แล้วตั้งค่า:

| ช่อง | ค่า |
|---|---|
| Name | `labclear-web` |
| Root Directory | `web` |
| Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start:render` |
| Health Check Path | `/health` (ส่งต่อไปที่ API) |
| Plan | Free ได้ (หลับหลังไม่มี request 15 นาทีเหมือน API) |

Environment ของบริการเว็บ (ไม่มีความลับ):

| ตัวแปร | ค่า |
|---|---|
| `NODE_VERSION` | `22` |
| `API_ORIGIN` | `https://labclear.onrender.com` (URL ของบริการ API) |
| `NEXT_TELEMETRY_DISABLED` | `1` |

ตัวอย่าง blueprint ของบริการนี้อยู่ที่ [`deploy/render/web-service.example.yaml`](../../deploy/render/web-service.example.yaml)
ไฟล์นี้ไม่ถูก Render อ่านอัตโนมัติ และ `render.yaml` ไม่ถูกแก้ ถ้าจะใช้ blueprint ให้ทีมตรวจแล้วคัดลอกเข้า `render.yaml` เอง

## ขั้นที่ 3 ตรวจรับ

1. `https://labclear-web.onrender.com/health` ต้องแสดง `version` เป็น `4.0.0-rc2` และ `commit` ตรงกับ git
2. เปิดหน้าแรก แชตแบบผู้เยี่ยมชม Refresh แล้วแชตต้องหาย
3. สมัครบัญชีทดสอบ (ข้อมูลจำลอง) ถ้า POST ได้ 403 `origin_rejected` แปลว่า `TRUSTED_ORIGINS` ของ API ยังไม่ตรง
4. ใน `/staff` ตรวจว่า AI providers แสดง 6 agents และบทบาทใหม่ 2 ตัวยังปิด

## ข้อจำกัดที่ต้องรู้

| เรื่อง | ผลกระทบ | ทางแก้ภายหลัง |
|---|---|---|
| Rate limit ของ API นับตาม IP ที่ต่อเข้ามา | ทุกคนที่ใช้ผ่านเว็บถูกนับเป็น IP ของบริการเว็บรวมกัน (120 คำขอ/นาที) | ให้ API เชื่อ `X-Forwarded-For` เฉพาะจากเว็บ หรือรวมเป็นบริการเดียว ต้องทบทวนความปลอดภัยก่อนแก้ |
| Free plan หลับทั้งสองบริการ | ครั้งแรกหลังหลับรอนานขึ้น หน้าเว็บสาธารณะใช้ข้อมูล seed ระหว่างรอ API | ใช้ plan แบบเสียเงิน หรือปลุกก่อนนำเสนอ |
| Sign in with Google | ยังไม่ได้ตรวจผ่านเว็บที่ proxy (redirect URI อิง Host ของ API) | ปิดไว้ (ไม่ตั้ง `GOOGLE_CLIENT_ID`) จนกว่าจะทดสอบ |
| Guest chat อยู่ใน RAM ของ process เดียว | API ต้องรัน 1 instance เหมือนเดิม | ตามการออกแบบของ Codex |

## Cloudflare Free เป็น DNS/proxy (อนาคต ยังไม่ได้ทำ)

ถ้าทีมใช้โดเมนของตัวเองบน Cloudflare แผนฟรี:

1. Render → บริการเว็บ → Settings → Custom Domains → เพิ่มโดเมน เช่น `labclear.example.com`
2. Cloudflare DNS → CNAME `labclear` → `labclear-web.onrender.com` เริ่มแบบ DNS only จน Render ออกใบรับรอง แล้วจึงเปิด Proxied
3. SSL/TLS mode ตั้งเป็น **Full (strict)**
4. เพิ่ม `https://labclear.example.com` ใน `TRUSTED_ORIGINS` ของ API
5. ไม่ต้องใช้ Workers, Containers หรือไฟล์ใน `deploy/cloudflare/`

ขั้นตอนนี้ยังไม่ได้ทดลอง และต้องให้เจ้าของโดเมนทำเอง
