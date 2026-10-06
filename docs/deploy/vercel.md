# Deploy LabClear to Vercel

Vercel detects the FastAPI `app` in `main.py` and runs it as one Vercel Function. LabClear needs a PostgreSQL database because a function has no lasting disk; Vercel's Neon integration provides one.

**Time:** about 10 minutes · **You need:** a GitHub account, a Vercel account, and API keys for the AI providers you want to use.

## 1. Import the project

Vercel → **Add New → Project** → import your LabClear repository. Vercel detects the Python app; keep the default settings. [`vercel.json`](../../vercel.json) allows each request up to 120 seconds, enough for the five AI calls of one message.

## 2. Add a database

In the project: **Storage → Create Database → Neon (Postgres)** → connect it to the project. Vercel adds `DATABASE_URL` to the project's environment variables.

## 3. Create an encryption key

LabClear encrypts all business data, including saved API keys, with this key. Generate it once and keep it safe.

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## 4. Set the environment variables

Project → **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `BUSINESS_DATA_KEY` | Key from step 3 |
| `APP_ENV` | `production` |
| `PROVIDER_NETWORK_ENABLED` | `true` to allow AI calls |
| `PROVIDER_BUDGET_CYCLE_ID` | Any name, e.g. `labclear-1` |
| `CLOUD_CALL_LIMIT` | Maximum AI calls, e.g. `500` (one message uses five) |
| `PROJECT_BUDGET_PRIOR_SPEND_THB` | `0` for a new project |
| `DEMO_ACCESS_CODE` | Optional. 12+ characters to require a code before using the AI |

AI provider keys can be added here too (`LLM_PROVIDER`, `LLM_API_KEY`, `GUARD_PROVIDER`, `GUARD_API_KEY`, `VISION_ENABLED`, `VISION_API_KEY`), but the admin page in step 6 is easier.

Then **Deployments → Redeploy** so the new variables apply. Open `https://<your-project>.vercel.app/health`; it should return `"status": "ok"`.

## 5. Create a manager account

From your computer, using the database connection string from **Storage → Neon → .env.local** and the same key:

```bash
DATABASE_URL="<postgres connection string>" BUSINESS_DATA_KEY="<key>" \
  python scripts/create_staff.py --email you@example.com --role manager
```

On Windows PowerShell set the variables first: `$env:DATABASE_URL="..."; $env:BUSINESS_DATA_KEY="..."`.

## 6. Choose the AI providers

Sign in at `/staff` → **AI providers**, pick a provider for each step, paste the key and press **Test**. Settings are shared by every function instance through the database (changes apply within about 10 seconds).

## Differences from Render

| | Vercel | Render |
|---|---|---|
| Cold start | Seconds | About a minute after 15 idle minutes |
| Upload size | 4.5 MB per request (Vercel limit), so read one or two report pages at a time | 10 MB |
| Rate limit | Kept per function instance | One instance |
| LINE background worker | Not available; the simulator's "Run worker once" button still works | Available with `BUSINESS_WORKER_ENABLED=true` |

Never commit `.env` or any key.
