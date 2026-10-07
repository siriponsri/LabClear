# Deploy LabClear to Render

Render runs LabClear as one Python web service with a managed PostgreSQL database. Both work on the free plan.

**Time:** about 10 minutes · **You need:** a GitHub account, a Render account, and API keys for the AI providers you want to use.

## 1. Create the database

Render → **New → Postgres** → plan **Free** → **Create Database**.
When it is ready, copy the **Internal Database URL**.

> Free Render databases expire after 30 days. Upgrade the database or create a new one before then.

## 2. Create an encryption key

LabClear encrypts all business data, including saved API keys, with this key. Generate it once on your computer and keep it safe; data cannot be read without it.

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## 3. Create the web service

Render → **New → Blueprint** → select your LabClear repository. Render reads [`render.yaml`](../../render.yaml) and asks for these values:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Internal Database URL from step 1 |
| `BUSINESS_DATA_KEY` | Key from step 2 |
| `PROVIDER_NETWORK_ENABLED` | `true` to allow AI calls |
| `PROVIDER_BUDGET_CYCLE_ID` | Any name, e.g. `labclear-1` (a new name restarts the count) |
| `CLOUD_CALL_LIMIT` | Maximum AI calls, e.g. `500` (one message uses five) |
| `PROJECT_BUDGET_PRIOR_SPEND_THB` | `0` for a new project |
| `LLM_PROVIDER`, `LLM_API_KEY` | Optional. Leave empty and set providers in the admin page instead |
| `GUARD_PROVIDER`, `GUARD_API_KEY` | Optional, as above (`iapp_systemone`, `typesafe_jev` or `llama_guard`) |
| `VISION_ENABLED`, `VISION_API_KEY` | Optional, as above (`true` turns on report reading) |
| `DEMO_ACCESS_CODE` | Optional. Set 12+ characters to require a code before using the AI; leave empty for open access |

Press **Apply**. The first build takes a few minutes. Open `https://<your-service>.onrender.com/health`; it should return `"status": "ok"`.

## 4. Create a manager account

Render's free plan has no shell, so run this from your computer against the Render database. Use the **External Database URL** (Postgres → Connect) and the same `BUSINESS_DATA_KEY`:

```bash
# macOS / Linux
DATABASE_URL="<external database url>" BUSINESS_DATA_KEY="<key>" \
  python scripts/create_staff.py --email you@example.com --role manager

# Windows PowerShell
$env:DATABASE_URL="<external database url>"; $env:BUSINESS_DATA_KEY="<key>"
python scripts/create_staff.py --email you@example.com --role manager
```

## 5. Choose the AI providers

Sign in at `/staff` → **AI providers**. For each step pick a provider, paste its key and press **Test**. The status pill on `/app` turns to **Assistant online** once the language model and the safety check are both set up.

| Step | Recommended | Get a key |
|---|---|---|
| Language model | Typhoon | [playground.opentyphoon.ai](https://playground.opentyphoon.ai) |
| Safety check | iApp OpenThai-SystemOne | [iapp.co.th](https://iapp.co.th/en/docs/llm/openthai-systemone) |
| Report reading | Typhoon OCR (same Typhoon key) | [playground.opentyphoon.ai](https://playground.opentyphoon.ai) |

## Troubleshooting

| Message | What to do |
|---|---|
| First page load takes about a minute | Free services sleep after 15 minutes without traffic; the first request wakes them. |
| `Assistant offline` | Set `PROVIDER_NETWORK_ENABLED=true`, then make sure the language model and safety check show **Saved here** or **From server environment**. |
| `… rejected the request (HTTP 401)` | The key for the named service is wrong. Paste it again on the AI providers page. |
| `… rejected the request (HTTP 402)` or `429` | The account is out of credit or over its rate limit. |
| `The model's plan / answer / review could not be verified (…)` | The model did not return the JSON the chat needs, even after one retry. Press **Test** on the language model; if it reports no JSON, choose another model. The names in brackets are the fields it got wrong (also written to the Render log as `model_output_invalid`). |
| `PROVIDER_BUDGET_CYCLE_ID` / `CLOUD_CALL_LIMIT` | Set both; the call count is kept in the database. |
| `budget_exhausted` | The call cap or the 300 THB budget is used up. Start a new cycle name or raise the limit. |
| `Hosted business features require a durable PostgreSQL DATABASE_URL` | `DATABASE_URL` is missing or not a PostgreSQL URL. |

Never commit `.env` or any key. Keys belong in the Render dashboard or the AI providers page.
