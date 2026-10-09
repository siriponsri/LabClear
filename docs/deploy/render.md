# Deploy LabClear to Render

LabClear 4.0.0-rc3 deploys as **one** Render web service from the Blueprint in
[`render.yaml`](../../render.yaml). The FastAPI service serves the website, the API and the admin
views. There is no separate front-end service.

## What the Blueprint defines

| Field | Value |
|---|---|
| Service | `type: web`, `name: labclear`, `runtime: python`, `plan: free` |
| Repository | `https://github.com/siriponsri/LabClear`, `branch: main` |
| Deploys | `autoDeployTrigger: commit` (every commit to `main`) |
| Build | `pip install -r requirements.txt` |
| Start | `python scripts/run_business.py` |
| Health check | `healthCheckPath: /ready` (readiness: started, not draining, storage answering; never an AI call) |
| Fixed values | `PYTHON_VERSION=3.12.10`, `APP_ENV=production`, `BUSINESS_EXTERNAL_ENABLED=false`, `RUNTIME_SKILLS_ENABLED=true`, `HOSPITAL_LINKS_ENABLED=true`, and the request-resilience defaults (below) |
| Secrets | Every other variable is `sync: false`: entered in the dashboard, never committed |
| Region | Not set, so Render's default (Oregon) applies to a new service |

`MEDICAL_HARNESS_ENABLED` stays off. The PostgreSQL database is created separately (step 1) and
connected through `DATABASE_URL`.

## First deployment

1. **Create the database.** Render → **New → Postgres**. When it is ready, copy its **Internal
   Database URL**. Render's free PostgreSQL plan expires after a fixed period; upgrade it before then
   or the data is lost.
2. **Create the encryption key.** It encrypts all business data, including saved API keys. Generate
   it once and keep it somewhere safe; data cannot be read without it.

   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

3. **Create the Blueprint.** Render → **New → Blueprint** → select the LabClear repository. Render
   reads `render.yaml`.
4. **Review the plan Render shows.** It matches services by name. If a service named `labclear`
   already exists, check that the plan updates it rather than creating a new one, and keep its
   region: if the existing service is not in Oregon, first add `region: <its region>` to the
   service in `render.yaml` and commit. The region cannot change after creation.
5. **Enter the values** Render asks for (see the table below). At minimum: `DATABASE_URL`,
   `BUSINESS_DATA_KEY`, `PROVIDER_BUDGET_CYCLE_ID`, `CLOUD_CALL_LIMIT`,
   `PROJECT_BUDGET_PRIOR_SPEND_THB`. Render asks for `sync: false` values only when it creates them;
   values already set on an existing service are kept.
6. **Apply.** The first build takes a few minutes.
7. **Check health.** Open `https://<service>.onrender.com/health` and `/ready` (see [Health check](#health-check)).
8. **Create a manager.** For a class demo, set `DEMO_ACCOUNTS=true`, redeploy, and sign in as
   `admin` / `1234`; set it back to `false` afterwards. For a personal account, run this on your
   computer against the **External Database URL** with the same key:

   ```bash
   DATABASE_URL="<external database url>" BUSINESS_DATA_KEY="<key>" \
     python scripts/create_staff.py --email you@example.com --role manager
   ```

   On Windows PowerShell, set `$env:DATABASE_URL` and `$env:BUSINESS_DATA_KEY` first.
9. **Turn on the AI.** Set `PROVIDER_NETWORK_ENABLED=true`, then sign in at `/staff` → **AI
   providers**, choose providers, paste keys and press **Test connection**. See
   [../ai-providers.md](../ai-providers.md).

## Migrating from the two-service setup

Earlier release candidates could run a second Render web service, `labclear-web`, for a Next.js
website that proxied `/api` to `labclear`. That website has been removed from the repository; the
FastAPI service now serves the whole interface.

1. Deploy `labclear` from the Blueprint as above and confirm `/health` and the website work.
2. If a custom domain points at `labclear-web`, move it to `labclear`.
3. Clear `TRUSTED_ORIGINS` on `labclear` if it was set to the `labclear-web` origin.
4. Suspend or delete `labclear-web` in the Render dashboard.

Keep the same `DATABASE_URL` and `BUSINESS_DATA_KEY` on `labclear`. A different key cannot decrypt
existing data, and a different database starts empty. Also keep `PROVIDER_BUDGET_CYCLE_ID` and
`PROJECT_BUDGET_PRIOR_SPEND_THB` so the call count and the THB ledger continue.

## Environment variables

From [`config.py`](../../config.py), [`render.yaml`](../../render.yaml) and the services that read the
environment directly. Render sets `PORT`, `RENDER` and `RENDER_GIT_COMMIT` itself.

### In `render.yaml`

| Variable | Value or default | Purpose |
|---|---|---|
| `PYTHON_VERSION` | `3.12.10` | Python runtime |
| `APP_ENV` | `production` | Hosted mode: PostgreSQL and the data key are required |
| `BUSINESS_EXTERNAL_ENABLED` | `false` | Keep real payment and LINE integrations off |
| `RUNTIME_SKILLS_ENABLED` | `true` | Default for runtime skills until a manager saves the Company Harness |
| `HOSPITAL_LINKS_ENABLED` | `true` | Official hospital links page, API and chat links |
| `CHAT_DEADLINE_SECONDS` | `220` | Whole chat workflow deadline, storage and every agent included |
| `REPORT_DEADLINE_SECONDS` | `150` | Whole report-reading deadline (file preparation, OCR, rows) |
| `STREAM_HEARTBEAT_SECONDS` | `10` | NDJSON heartbeat after this long without output |
| `AI_MAX_IN_FLIGHT` | `2` | AI workflows at once on the instance; more get `503 server_busy` |
| `OCR_MAX_IN_FLIGHT` | `1` | Report readings at once, inside the AI limit |
| `PROVIDER_TRANSPORT_RETRIES` | `0` | Automatic retries are not implemented; only `0` is accepted |
| `SHUTDOWN_DRAIN_SECONDS` | `20` | On SIGTERM, time for in-flight work before it is cancelled |
| `DATABASE_URL` | secret | PostgreSQL URL (Internal Database URL) |
| `BUSINESS_DATA_KEY` | secret | Fernet key for all stored data |
| `PROVIDER_NETWORK_ENABLED` | `false` if unset | `true` allows AI calls |
| `LLM_PROVIDER`, `LLM_API_KEY` | `typhoon`, empty | Language model fallback when nothing is saved in Admin |
| `GUARD_PROVIDER`, `GUARD_API_KEY` | `iapp_systemone`, empty | Safety check fallback (`iapp_systemone`, `typesafe_jev`, `llama_guard`) |
| `VISION_ENABLED`, `VISION_API_KEY` | `false`, empty | Report reading fallback (Typhoon OCR by default) |
| `PROVIDER_BUDGET_CYCLE_ID` | required for AI | Name of the call-count cycle, e.g. `labclear-1` |
| `CLOUD_CALL_LIMIT` | `200` | Maximum AI calls in the cycle |
| `PROJECT_BUDGET_PRIOR_SPEND_THB` | required for AI | THB already spent before this ledger (`0` for a new project) |
| `DEMO_ACCESS_CODE` | empty | 12+ characters to require a code before AI use |
| `DEMO_ACCOUNTS` | off when hosted | `true` enables `test-01`, `test-02`, `admin` (password `1234`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Sign in with Google for customers |

### Optional, set in the dashboard when needed

| Variable | Default | Purpose |
|---|---|---|
| `LLM_MODEL`, `LLM_BASE_URL`, `VISION_PROVIDER`, `VISION_MODEL`, `VISION_BASE_URL`, `GUARD_MODEL`, `GUARD_BASE_URL` | provider defaults | More provider fallbacks (Admin settings win) |
| `LLM_TIMEOUT_SECONDS`, `VISION_TIMEOUT_SECONDS`, `GUARD_TIMEOUT_SECONDS` | 60, 60, 20 | Provider timeouts |
| `PROJECT_BUDGET_THB` | `300` | Project-total THB budget |
| `COST_LEDGER_ENABLED` | `true` | Keep on |
| `MODEL_PRICES_THB` | empty | JSON price override per model |
| `COST_IMAGE_TOKEN_ESTIMATE` | `1500` | Token allowance per image |
| `CHAT_RATE_LIMIT_REQUESTS`, `CHAT_RATE_LIMIT_WINDOW_SECONDS` | `120`, `60` | Per-client rate limit |
| `BUSINESS_PUBLIC_URL` | empty | Public base URL, used for the Google redirect |
| `GOOGLE_REDIRECT_URI` | empty | Only if the redirect differs from `BUSINESS_PUBLIC_URL` + `/api/business/auth/google/callback` |
| `GOOGLE_MAPS_EMBED_KEY` | empty | Embedded maps on the centers page |
| `CORS_ALLOWED_ORIGINS`, `TRUSTED_ORIGINS` | empty | Only for a separate trusted front end; leave empty |
| `MEDICAL_HARNESS_ENABLED` | `false` | Medical analyzer and Thai composer (synthetic reports only) |
| `LANDING_PREVIEW_ENABLED`, `ORG_DOCUMENTS_ENABLED`, `ORG_REFERENCE_INFERENCE_ENABLED` | `false` | Optional preview and organization-document features |
| `BUSINESS_WORKER_ENABLED`, `BUSINESS_WORKER_SECRET` | off, empty | LINE worker in the same process; secret for `/api/business/worker/run` |
| `DOCUMENT_WORKER_SECONDS`, `DOCUMENT_WORKER_MEMORY_MB` | `30`, `384` | Time and memory limits of the process that prepares uploaded report files |

Not for Render: `FREE_ONLY_POLICY_PATH`, `FREE_ONLY_RUN_ID`, `FREE_ONLY_ALLOW_OFFLINE_DOUBLES` (set by
benchmark trial servers), `SYNTHETIC_FIXTURE_MANIFEST` (test environments only),
`BUSINESS_DB_PATH`, `BUSINESS_KEY_PATH` (local SQLite only).

Settings saved by a manager on `/staff` → AI providers take precedence over the provider variables.
Feature flags, budget values and the resilience settings are read and validated at startup; a change
needs a redeploy or restart, and an invalid value stops the new deploy before it takes traffic.
What each resilience setting does: [../operations/resilience.md](../operations/resilience.md).

## Health check

| Endpoint | Use | Answers |
|---|---|---|
| `GET /health` | Liveness: the process answers | Always 200 while running: `{"status": "ok", "app": "LabClear", "environment": "production", "version": "4.0.0-rc3", "commit": "<40-character SHA>"}` |
| `GET /ready` | Readiness, Render's `healthCheckPath` | 200 when startup finished, the service is not draining and storage answers a read-only probe within 1 s; otherwise 503 with `checks.startup`, `checks.draining`, `checks.storage` (`ok`, `timeout`, `unavailable`, `unconfigured`) |

`/ready` never calls an AI provider or OCR, so a provider outage cannot fail it or restart the service.
It does depend on the database: without a reachable PostgreSQL a new deploy does not go live and the
previous one keeps serving. Compare `commit` with the commit you expect: an HTTP 200 alone does not
show which code is running, and a `live` deploy does not show that every AI flow works.

## Deploys, restarts and draining

Render sends SIGTERM to the old instance during a deploy or restart. `scripts/run_business.py` then
drains: `/ready` answers 503 and new AI requests get `503 server_draining` (`Retry-After: 5`) at once;
in-flight chats and report readings get `SHUTDOWN_DRAIN_SECONDS` (20 s) to finish, the rest end with a
terminal `server_draining` event; then the process exits with status 0, inside Render's default
30-second shutdown window. Website pages keep working during the drain.

## Rollback

1. In the dashboard, open the `labclear` service's **Events**, choose the last good deploy and roll
   back to (or redeploy) it.
2. Check `/health` (`commit` is the expected one) and `/ready` (200), then send one synthetic chat
   message and read one sample report.
3. Keep `DATABASE_URL` and `BUSINESS_DATA_KEY` unchanged. A rollback does not change the database.
4. Auto-deploy stays on, so the next commit to `main` deploys again. Revert the faulty commit on
   `main` before pushing anything else.

To switch features off without a code rollback, set the flags to `false` and redeploy. A manager can
also restore an earlier Company Harness revision or pause records and tools on `/staff`.

## Operating notes

- Run one instance with one process. Guest chats, rate limits and the AI admission counters live in
  process memory; a second instance would return 401 for guest pages and split the limits.
- Free web services spin down after 15 minutes without traffic; the first request afterwards waits
  about a minute and may fail at Render's proxy. The chat waits for `/ready` before sending after a
  long pause, but cannot prevent the platform's own errors. Before a demo, open the site early and
  check `/ready`. Keeping the instance awake needs a paid compute plan: an owner decision, taken with
  the current price on Render's pricing page.
- Never commit `.env`, keys or database URLs. Secrets belong in the Render dashboard or, for provider
  keys, on the AI providers page.
- A user-visible "502": the request reference under the failed message (`req_…`) leads to the log
  line; no reference means a platform failure. Runbook: [../operations/resilience.md](../operations/resilience.md#runbook-a-customer-reports-a-502).

## Troubleshooting

| Symptom | What to do |
|---|---|
| `Hosted business features require a durable PostgreSQL DATABASE_URL` | Set `DATABASE_URL` to the PostgreSQL URL |
| `Configure BUSINESS_DATA_KEY and DATABASE_URL before using accounts` | Set `BUSINESS_DATA_KEY` |
| `AI is not connected yet` | Set `PROVIDER_NETWORK_ENABLED=true` |
| `cycle_required` | Set `PROVIDER_BUDGET_CYCLE_ID` and a positive `CLOUD_CALL_LIMIT` |
| `budget_prior_unknown` | Set `PROJECT_BUDGET_PRIOR_SPEND_THB` (`0` for a new project) |
| `budget_exhausted` | The call cap or THB budget is used up; raise the limit or start a new cycle deliberately |
| `… rejected the request (HTTP 401)` | The key for the named service is wrong; save it again |
| `… (HTTP 402)` or `(HTTP 429)` | The provider account is out of credit or over its rate limit |
| `The safety check is not set up` | Configure the safety check on the AI providers page or with `GUARD_*` |
| Report reading not connected | Turn on report reading and set its key (`VISION_ENABLED=true` or Admin) |
| `server_busy` (503) | More simultaneous AI requests than `AI_MAX_IN_FLIGHT`; the browser asks to retry in a few seconds |
| `request_timeout` / `upstream_timeout` (504) | A slow provider; the log line's `step` names it. Check the provider's status and latency |
| `upstream_unavailable` / `upstream_rate_limited` | The provider answered 5xx / 429; check its status page and plan |
| `storage_unavailable` (503) | PostgreSQL did not answer within the bounded wait; check the database instance |
| `/ready` 503, `storage: unconfigured` | `DATABASE_URL` or `BUSINESS_DATA_KEY` missing or invalid |
| Deploy fails right after start | A resilience variable outside its allowed range; the deploy log names it |

## Sign in with Google (optional)

Customers can sign in with Google when an OAuth client is configured. Staff and managers keep their
password.

1. In Google Cloud Console, configure the OAuth consent screen (External). While the app is in
   Testing, add the accounts that may sign in as test users.
2. Create an OAuth client ID of type **Web application**.
3. Add the redirect URI `https://<service>.onrender.com/api/business/auth/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `BUSINESS_PUBLIC_URL` in the dashboard and
   redeploy.

LabClear requests `openid email profile` and checks the state, PKCE verifier, nonce, audience,
issuer, expiry and verified email. A new email creates a customer account; a guest chat is not
imported.
