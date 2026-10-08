<!-- ceo-upgrade-20261008 -->

## Upgrade deployment compatibility

The overnight candidate retains `render.yaml`, `scripts/run_business.py`, dependencies
and storage schema. No new key is required; all six new flags default false. An
isolated smoke check started/stopped the actual entrypoint and checked eight routes.
Production PostgreSQL and deployment identity remain separate checks. Follow the
[config and rollback handoff](../ceo-upgrade/ENV_HANDOVER.md); preserve saved settings,
encryption key, prior spend and counters. No ENV change is authorized by publication alone.

The 2026-10-08 upgrade is a disabled-by-default software candidate. Its current scope, evidence, configuration and remaining owner gates are recorded in the [upgrade index](../ceo-upgrade/README.md). Earlier release counts and screenshots below are historical; they do not establish live model or clinical validation.

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
| `DEMO_ACCOUNTS` | Optional. `true` turns on the shared demo accounts `test-01`, `test-02` and `admin` (password `1234`). Anyone who knows them can sign in, `admin` included, so set it back to `false` after the demo. They are typed in the sign-in dialog, not listed |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Turns on **Continue with Google** for customers (see below) |
| `BUSINESS_PUBLIC_URL` | Optional. `https://<your-service>.onrender.com`; used for Google's redirect address |

Press **Apply**. The first build takes a few minutes. Open `https://<your-service>.onrender.com/health`; it should return `"status": "ok"`.

## 4. Create a manager account

**Quick option for a class demo:** set `DEMO_ACCOUNTS=true`, redeploy, and sign in as `admin` / `1234`. Signing in with a manager account on `/app` opens the service desk at `/staff`. Turn it off after the demo.

**Your own account:** Render's free plan has no shell, so run this from your computer against the Render database. Use the **External Database URL** (Postgres → Connect) and the same `BUSINESS_DATA_KEY`:

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
| A report sent in the chat is not read | `VISION_ENABLED=true` and a report reader must be set. The error under the image names the step that stopped (reading, safety check or rows). |
| `Hosted business features require a durable PostgreSQL DATABASE_URL` | `DATABASE_URL` is missing or not a PostgreSQL URL. |

Never commit `.env` or any key. Keys belong in the Render dashboard or the AI providers page.

## Sign in with Google (optional)

Customers can sign in with a Google account when an OAuth client is set. Staff and managers keep their password.

1. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project, then **APIs & Services → OAuth consent screen**: user type **External**, app name LabClear, your email as support and developer contact. While the app is in **Testing**, add the Google accounts that may sign in under **Test users**.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Web application**.
3. Under **Authorized redirect URIs** add `https://<your-service>/api/business/auth/google/callback` (for a local run also `http://localhost:8000/api/business/auth/google/callback`, and set `GOOGLE_REDIRECT_URI` to it).
4. Copy the client ID and secret into the host's environment as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (never into Git), and redeploy.

The sign-in dialogs then show **Continue with Google**. LabClear asks only for `openid email profile`, checks the state, PKCE verifier, nonce, audience, issuer, expiry and verified email, and creates a customer account for a new email (without importing the temporary guest chat).

### Guest privacy in 3.0.2

Use the supplied single-process entrypoint for this pilot. Guest rows live only in bounded process memory (100 page sessions, 64 MiB total, 20-minute inactivity expiry). They never enter PostgreSQL/SQLite. Multiple workers without affinity may return 401 for a guest page; do not add workers until the temporary-session architecture has been reviewed. Registered accounts remain in encrypted durable storage.

The first store transaction runs an idempotent migration that deletes old unregistered website guests and their owned rows, plus linked notifications/audits. Password/Google accounts and verified LINE identities are preserved. Historical deployment/database backups follow the owner's existing retention policy. New guest sessions use a page-memory header token, never a cookie or local/session storage. Page close sends a best-effort revocation; the expiry sweep covers an unclean browser exit.
