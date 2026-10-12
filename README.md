# LabClear

LabClear is a Thai-first health-check assistant built for the course 06048308 Intelligent Chatbot
Development. It runs a simulated health-check business: the packages, prices, centers, payments and
lab reports are not real, and LabClear is not a clinic.

Version **4.0.0-rc3**. Hosted demo: <https://labclear.onrender.com> (Render free plan; the first
request after an idle period is slow).

## What it does

- **Compare packages.** Customers browse and compare 18 simulated health-check packages at three
  demo centers, in Thai or English.
- **Explore the demonstration Hub.** `/hub` separately compares synthetic hospital/clinic programs by location, category and demo price. Its inquiry preview never sends a request or creates a booking. [Scope and data](docs/checkup-hub.md).
- **Request appointments.** The assistant prepares a preview; the customer confirms it; staff then
  confirm or decline the request. Nothing is booked or paid without these confirmations.
- **Read a lab report.** A customer attaches an image or PDF in the chat. The AI reads the rows,
  shows them for checking, and explains them only after the customer confirms the values. Each value
  is compared only with the reference range printed on that report.
- **Cite sources.** Medical answers cite records from a local knowledge library of 148 records;
  prices and policies cite the business data. Answers that fail a check are withheld.
- **Service desk.** Staff handle the inbox, take over chats, confirm appointments, issue corporate
  quotations and record simulated payments at `/staff`.
- **No-code admin.** Managers change AI providers, assistant roles, prices, capacity, the Company
  Harness (skills and tool limits) and the Knowledge library without editing code.

## Key features

| Area | Summary |
|---|---|
| Multi-agent pipeline | Input guard, planner, role choice, typed tools, BM25 evidence search, runtime skills, writer, deterministic checks, independent reviewer, output guard |
| Process Explainability | Every answer keeps its steps: which tools ran, which skills were loaded, how long each step took |
| Report reading | OCR, document safety check, rows, customer confirmation; status computed by Python from the printed range |
| Knowledge library | 148 records from 29 publishers, BM25 retrieval without an embedding API, PDF view in Admin |
| Official hospital links | Reviewed links to real hospital package pages, kept separate from LabClear's simulated catalog |
| Interface language | Thai by default, TH/EN switch on every page, IBM Plex Sans Thai and Trirong self-hosted |
| Spending controls | AI off by default, durable call cap, project-total THB ledger, optional free-only policy |
| Request resilience | Whole-workflow deadlines, admission limits, cancellation on Stop or disconnect, NDJSON heartbeats, request IDs, readiness and graceful drain; fault suite R01–R12 at 12/12 ([details](docs/operations/resilience.md)) |
| Security | Same-origin checks, CSRF tokens, role and ownership checks, rate limits, encrypted storage |

## Architecture in brief

One Render Python web service runs FastAPI, Jinja templates and vanilla JavaScript. There is no
Node.js at runtime. Business data is stored in one encrypted table: SQLite locally, PostgreSQL when
hosted. AI providers are called over HTTPS from inside the same service.

Details, a component table and a walkthrough of one chat message are in
[docs/architecture.md](docs/architecture.md). The synthetic booking, support handoff and
manager-only simulated center-payment path is shown in the [business workflow diagram](docs/assets/business-flow.svg).

## Quick start

Requires **Python 3.12**. Without AI keys, the website, catalog, booking and service desk work;
chat replies and report reading stop with an error that names the missing setting.

### Windows

Double-click `START.bat`. It runs [`scripts/start.ps1`](scripts/start.ps1), which:

1. creates `.venv` with `py -3.12` if it does not exist,
2. installs `requirements.txt`,
3. copies `.env.example` to `.env` if `.env` does not exist,
4. opens <http://127.0.0.1:8000> and starts `uvicorn main:app` on `127.0.0.1:8000`.

### macOS and Linux

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 127.0.0.1 --port 8000
```

`python scripts/run_business.py` is the entry point Render uses. It listens on `0.0.0.0` and the
port in `PORT` (default 8000), and it can also start the LINE worker when
`BUSINESS_WORKER_ENABLED=true`.

Local data goes to `data/business.sqlite3`, encrypted with a key generated in `data/business.key`.
To match the hosted feature set, add `RUNTIME_SKILLS_ENABLED=true` and `HOSPITAL_LINKS_ENABLED=true`
to `.env`.

### Demo accounts

[`services/demo_accounts.py`](services/demo_accounts.py) creates three shared accounts. They are not
listed on the site; type the username and password in the sign-in dialog.

| Username | Password | Account |
|---|---|---|
| `test-01` | `1234` | Customer, Free plan |
| `test-02` | `1234` | Customer, LabClear Plus (simulated) |
| `admin` | `1234` | Manager with full access to `/staff` |

`DEMO_ACCOUNTS` controls them. Empty means on for a local run and off when hosted (Render, or
`APP_ENV=production`). Set `true` to use them on a hosted demo and `false` again afterwards: anyone
who knows them can sign in, `admin` included. To create a personal manager account, run
`python scripts/create_staff.py --email you@example.com --role manager`.

### Turn on the AI

1. Set `PROVIDER_NETWORK_ENABLED=true` in `.env` and restart.
2. Sign in as a manager and open `/staff` → **AI providers**.
3. Choose a provider for the language model, the safety check and report reading, paste each key,
   save, and press **Test connection**.

The defaults are Typhoon (language model), iApp OpenThai-SystemOne (safety check) and Typhoon OCR
(report reading). See [docs/ai-providers.md](docs/ai-providers.md).

### Offline UI without keys

```bash
python scripts/dev_mock_api.py
```

This serves the real application on `127.0.0.1:8000` (`PORT` overrides) with temporary storage,
demo accounts on and outbound network blocked. Chat messages run the real pipeline (guards, planner,
roles, typed tools, runtime skills, checks, reviewer) with offline provider doubles at the HTTP
transport, so answers are stand-ins, not model output. `UAT_FLAGS=off` turns the optional feature
flags off. Never deploy this script.

## Presentation

The final presentation is the Thai-first 16:9 Reveal.js deck at
[`presentation/index.html`](presentation/index.html). It contains 10 timed core slides (8:30 planned
speaking time), a 0:30 transition/demo reserve, and five appendix slides. The deck is an HTML
deliverable; there is no PPTX authoring backend. Its print output is a static fallback, not the primary
presentation format.

Serve the repository root so the deck can load its local fonts, screenshots, and pinned Reveal.js
files:

```bash
python -m http.server 8000
```

Open <http://127.0.0.1:8000/presentation/>. The workflow diagram and AntV infographic are linked
from the handoff slide. The infographic uses the locally bundled AntV Infographic 0.2.20 library and
can export SVG; the files and test results are documented in [`presentation/DELIVERY_REPORT.md`](presentation/DELIVERY_REPORT.md).

To reproduce the browser QA run on Windows PowerShell:

```powershell
  $env:PRESENTATION_EVIDENCE_OUT = "docs/evidence/current/presentation-html-final-20261012-final"
node scripts/verify_html_deck.mjs
```

The run uses synthetic/local data only and makes no API, LLM, OCR, payment, or deployment requests.
The HTML contains editable source text and diagrams; the static PDF is only a fallback export.
See the [`theme audit`](presentation/THEME_AUDIT.md),
[`storyboard`](presentation/STORYBOARD_TH.md), [`source map`](presentation/SOURCE_MAP.md), and
[`QA report`](presentation/QA_REPORT.md).

## Deployment

The repository deploys as a single Render web service named `labclear` from the
[`render.yaml`](render.yaml) Blueprint. Render deploys automatically on every commit to `main` and
checks readiness at `/ready` (`/health` stays the liveness check). On SIGTERM the service drains
in-flight requests before it exits. Secrets (`DATABASE_URL`, `BUSINESS_DATA_KEY`, provider keys) are
entered in the Render dashboard and never committed. Step-by-step guide:
[docs/deploy/render.md](docs/deploy/render.md); failures, timeouts and the 502 runbook:
[docs/operations/resilience.md](docs/operations/resilience.md).

## Testing

```bash
pip install -r requirements-dev.txt
python scripts/offline_check.py pytest -q
```

The offline Python suite runs with isolated storage, no `.env` and outbound sockets denied. The
latest recorded run on candidate `38e39f0` passed 547 tests with one
deprecation warning; counts can change between revisions. Browser suites use Playwright
(`npm install`, then `npx playwright install chromium`):

| Suite | Command |
|---|---|
| Business UAT | `TEST_PYTHON=.venv/bin/python npm run uat` |
| Upgrade scenarios | `TEST_PYTHON=.venv/bin/python UAT_OUT=test-results/upgrade node tests/browser/upgrade.cjs` |
| TH/EN language audit | start `scripts/dev_mock_api.py`, then `node tests/browser/i18n_audit.mjs` |
| Chat recovery (gateway pages, cut streams) | `TEST_PYTHON=.venv/bin/python node tests/browser/resilience.cjs` |

On Windows PowerShell, set the Python path with PowerShell environment syntax before running a
browser suite:

```powershell
$env:TEST_PYTHON = ".venv\Scripts\python.exe"
npm run uat
```

More detail: [docs/testing.md](docs/testing.md).

## Evidence classes and operating boundaries

LabClear uses separate evidence classes. Do not combine their results into a production or
clinical claim:

| Class | What it proves | What it does not prove |
|---|---|---|
| Offline / mock | Real local UI, API, storage, permissions and state transitions with provider doubles | Live model or OCR quality, clinical accuracy, uptime, demand or production retention |
| Authorized live smoke | Connectivity and response handling for the explicitly recorded synthetic requests | A benchmark score, free entitlement, absence of provider cost, or clinical validation |
| Production / hosted | Only the exact deployed revision and checks recorded for that revision | Behavior of an unrecorded dirty worktree or a different deployment |

The current GL-05 checkpoint is tracked in
[`docs/evidence/current/gl05-settlement-role-fence-20261011/`](docs/evidence/current/gl05-settlement-role-fence-20261011/).
Each browser run contains case IDs, expected/actual status, fresh screenshot hashes, candidate
identity and environment notes. A suite with any `FAIL`, `BLOCKED` or missing evidence is not a
passing release gate.

### Booking, handoff and simulated payment

- A customer request starts as awaiting confirmation. Staff may confirm or decline it; this is
  not a booking or payment authorization by itself.
- The center-payment action is a simulator-only event. The server permits it to `manager` only
  after the appointment is confirmed. `staff` and `clinical` receive `403` before payment,
  receipt, audit or customer-notification mutation.
- Support handoff requires explicit customer selection of messages or bookings. Unassigned staff
  views do not receive unselected history; a staff member takes over before replying. The customer
  can resume the assistant or leave the thread closed.
- Prices, packages, centers, hospital offers, payment flows and receipts are synthetic demo data.
  No bank transfer, card charge or real settlement is performed by the simulator.

### Maintainer verification

Run the offline suite before changing providers, credentials or deployment settings:

```bash
python scripts/offline_check.py pytest -q
```

For a fresh browser evidence bundle, use an isolated output directory and an unused loopback
port. The browser fixture disables outbound provider networking and uses temporary SQLite storage.
On macOS/Linux:

```bash
UAT_OUT=docs/evidence/current/browser-uat-new-run UI_TEST_PORT=8176 \
  TEST_PYTHON=.venv/bin/python node tests/browser/uat.cjs
```

On Windows PowerShell:

```powershell
$env:UAT_OUT = "docs/evidence/current/browser-uat-new-run"
$env:UI_TEST_PORT = "8176"
$env:TEST_PYTHON = ".venv\Scripts\python.exe"
node tests/browser/uat.cjs
```

Record the exact command, commit, dirty-worktree fingerprint, screenshot hashes and any failure
screenshots. Do not reuse a screenshot from an earlier run as evidence for a new candidate.

The diagram source is [`scripts/build_diagrams.py`](scripts/build_diagrams.py). Regenerate the
SVG and PNG assets with:

```bash
python scripts/build_diagrams.py
```

The generator runs its PNG export through the repository's local Playwright installation with
network access disabled. Inspect the generated image before describing it as verified.

## Evaluation and benchmark

| Tool | Purpose |
|---|---|
| [`scripts/benchmark_labclear.py`](scripts/benchmark_labclear.py) | Runs the frozen coursework suite (10 questions, 5 images, 5 safety cases) and the OCR file suite in OFFLINE, REPLAY or LIVE_FREE mode through the public API; also `preflight`, `resume`, `compare`, `report` |
| [`scripts/score_benchmark.py`](scripts/score_benchmark.py) | Deterministic scorer of a recorded run: no network, model judge, clock or randomness; re-scoring gives byte-identical output |
| [`scripts/benchmark_resilience.py`](scripts/benchmark_resilience.py) | Deterministic fault suite R01–R12 (`--offline --seed N --json-out PATH`): provider doubles, a virtual clock, synthetic files, a real SIGTERM; exit code 0 only at 12/12 |
| [`notebooks/LabClear_Harness_Demo.ipynb`](notebooks/LabClear_Harness_Demo.ipynb) | Executable walkthrough of the pipeline with offline doubles, including a successful run, a provider timeout and a cancellation; needs `requirements-eval.txt` (`python scripts/execute_notebook.py notebooks/LabClear_Harness_Demo.ipynb`) |

Recorded evidence is in [docs/evidence/current](docs/evidence/current/README.md). All recorded runs
are **OFFLINE**: the real application with provider doubles and a Tesseract stand-in for OCR.

| Run | Cases | Automated pass | Exact OCR values |
|---|---:|---:|---:|
| Coursework, profile A (no runtime skills) | 20 | 15 | 88/93 |
| Coursework, profile B (A + runtime skills) | 20 | 15 | 88/93 |
| Coursework, profile C (B + medical harness) | 20 | 15 | 88/93 |
| OCR file suite, profile C | 12 | 0 fully correct | 217/252 (86.11%) |

These numbers describe the offline pipeline. They are not Thai API scores, latency or clinical
quality. LIVE_FREE has not been run because no provider keys were available.

The resilience fault suite scores 100 (12/12 cases, 0 skipped, 0 outbound connections); see
[docs/evidence/current/resilience](docs/evidence/current/resilience/README.md). It is the pass rate of
deterministic fault cases, not uptime or latency on Render.

## Repository layout

| Path | Contents |
|---|---|
| `main.py`, `config.py` | FastAPI app, request IDs and security headers, `/health`, `/ready`, `/app`, `/staff`; settings and feature flags |
| `routers/` | Website pages and the JSON API (business, chats, staff, admin, public site data) |
| `services/` | Agent pipeline, typed tools, guards, providers, report reader, storage, harness config |
| `templates/`, `static/` | Jinja pages, CSS, JavaScript, self-hosted fonts and vendor scripts |
| `i18n/` | Thai dictionary sources; built into `static/i18n/th.js` |
| `business_data/` | Simulated catalog, centers, policies, plans, assistant roles, hospital links |
| `knowledge/` | Evidence catalog, publisher PDFs, acquisition lists ([README](knowledge/README.md)) |
| `runtime_skills/` | Reviewed instruction modules with SHA-256 manifest; model registry |
| `examples/` | Synthetic Thai lab reports used as samples and test inputs |
| `eval/` | Frozen benchmark datasets, rubric and free-only policy templates |
| `notebooks/` | Harness demonstration notebook |
| `scripts/` | Start, staff setup, i18n build, benchmark, scoring and maintenance scripts |
| `tests/` | Python tests, benchmark doubles, browser suites |
| `docs/` | Documentation, diagrams, evidence, and the [reports](docs/report/README.md) (Final Project report in Word; business and architecture reports in PDF) |
| `presentation/` | Final Thai-first HTML slide deck, storyboard, theme/source audits, speaker guide, and interactive workflow companions; [delivery report](presentation/DELIVERY_REPORT.md) and [Playwright QA](presentation/QA_REPORT.md). |
| `data/` | Local SQLite database and key (git-ignored) |

## Documentation

| Topic | Document |
|---|---|
| Index | [docs/README.md](docs/README.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| API reference | [docs/api.md](docs/api.md) |
| Admin guide for managers | [docs/admin.md](docs/admin.md) |
| AI providers and spending | [docs/ai-providers.md](docs/ai-providers.md) |
| Deploy to Render | [docs/deploy/render.md](docs/deploy/render.md) |
| Resilience and the 502 runbook | [docs/operations/resilience.md](docs/operations/resilience.md) |
| Testing | [docs/testing.md](docs/testing.md) |
| Knowledge library | [knowledge/README.md](knowledge/README.md) |
| Changes | [CHANGELOG.md](CHANGELOG.md) |

## Limitations

- Coursework simulation. Packages, prices, centers, payments, LINE and Stripe flows are simulated.
- Synthetic data only. Do not upload real patient reports.
- Not a clinic and not a medical device. LabClear gives general information, not a diagnosis,
  treatment or dose.
- No clinical validation. The 90 records added on 2026-10-09 are owner-approved summaries whose
  source check is still pending. The Thai wording of the runtime skills has not had a native-speaker
  or lay-reader review.
- Benchmark evidence is OFFLINE. It does not measure live Thai API quality, latency or clinical
  accuracy.
- Single-process design. Guest chats, the request rate limit and the AI admission limits live in
  process memory, so the service runs as one instance with one process.
- The free Render plan sleeps after 15 idle minutes and can restart; its proxy can then answer 502
  before LabClear sees the request. The chat recovers cleanly, but only the platform plan can remove
  those failures.

## Notices

Third-party components, fonts, medical sources and the coursework starter are listed in
[NOTICE.md](NOTICE.md).
