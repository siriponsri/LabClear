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
| `DEMO_ACCOUNTS` | Optional. `true` turns on the shared demo accounts `test-01`, `test-02` and `admin` (password `1234`); they are typed in the sign-in dialog, not listed; set it back to `false` after the demo |

AI provider keys can be added here too (`LLM_PROVIDER`, `LLM_API_KEY`, `GUARD_PROVIDER`, `GUARD_API_KEY`, `VISION_ENABLED`, `VISION_API_KEY`), but the admin page in step 6 is easier.

Then **Deployments → Redeploy** so the new variables apply. Open `https://<your-project>.vercel.app/health`; it should return `"status": "ok"`.

## 5. Create a manager account

For a class demo you can set `DEMO_ACCOUNTS=true` and sign in as `admin` / `1234` instead; turn it off afterwards.

Otherwise, from your computer, using the database connection string from **Storage → Neon → .env.local** and the same key:

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
| Live steps in the chat | Shown if the function streams; otherwise they appear all at once with the answer | Shown as they happen |
| LINE background worker | Not available; the simulator's "Run worker once" button still works | Available with `BUSINESS_WORKER_ENABLED=true` |

Never commit `.env` or any key.

## Sign in with Google (optional)

The same as on Render; the redirect address is `https://<your-project>.vercel.app/api/business/auth/google/callback`.

Customers can sign in with a Google account when an OAuth client is set. Staff and managers keep their password.

1. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project, then **APIs & Services → OAuth consent screen**: user type **External**, app name LabClear, your email as support and developer contact. While the app is in **Testing**, add the Google accounts that may sign in under **Test users**.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Web application**.
3. Under **Authorized redirect URIs** add `https://<your-service>/api/business/auth/google/callback` (for a local run also `http://localhost:8000/api/business/auth/google/callback`, and set `GOOGLE_REDIRECT_URI` to it).
4. Copy the client ID and secret into the host's environment as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (never into Git), and redeploy.

The sign-in dialogs then show **Continue with Google**. LabClear asks only for `openid email profile`, checks the state, PKCE verifier, nonce, audience, issuer, expiry and verified email, and creates a customer account for a new email (keeping the chats made before signing in).
