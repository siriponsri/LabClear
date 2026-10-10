# Architecture

LabClear 4.0.0-rc3 is one Python web service. It serves the public website, the customer workspace
at `/app`, the service desk at `/staff` and a JSON API under `/api/business`. All AI work runs inside
the same service and calls external model providers over HTTPS.

Diagrams: [system architecture](assets/architecture.svg) and [one chat message](assets/message-flow.svg).

## Runtime

| Item | Choice |
|---|---|
| Hosting | One Render web service (`labclear`, Python runtime) from [`render.yaml`](../render.yaml) |
| Entry point | [`scripts/run_business.py`](../scripts/run_business.py) runs one Uvicorn process for `main:app` on `0.0.0.0:$PORT` and drains on SIGTERM; it also starts the LINE worker when `BUSINESS_WORKER_ENABLED=true` |
| Web | FastAPI, Jinja2 templates, vanilla JavaScript and CSS; no front-end build step |
| Node.js | Not used at runtime. Only for rebuilding the Thai dictionary and running browser tests |
| Storage | SQLite locally, PostgreSQL through `DATABASE_URL` when hosted |
| Health checks | `GET /health` (liveness: status, environment, version, deployed commit); `GET /ready` (readiness: started, not draining, storage answering; Render's health check) |
| Request resilience | One execution context per AI request: request ID, whole-workflow deadline, admission slot, cancellation; NDJSON with heartbeats; storage and file rendering off the event loop. See [operations/resilience.md](operations/resilience.md) |

## Components

| Layer | Module | Responsibility |
|---|---|---|
| Pages | `routers/site.py`, `templates/site/`, `static/js/site.js` | Home, packages, compare, centers, organizations, help, privacy, sources, AI Lab Report, hospital links |
| Workspace | `templates/workspace.html`, `static/js/workspace.js`, `static/js/turns.js` | Customer chat, reports, appointments, plan; staff desk and admin views |
| Admin views | `static/js/admin-harness.js` | Company Harness and Knowledge library |
| API | `routers/business.py`, `routers/business_ops.py`, `routers/chats.py` | Sessions, chat, reports, bookings, payments, notifications, staff desk |
| Admin API | `routers/ai_admin.py`, `routers/harness_admin.py`, `routers/knowledge_admin.py` | Manager-only provider, harness and knowledge settings |
| Public data | `routers/public.py`, `routers/samples.py` | Read-only site data and synthetic sample reports |
| Agent pipeline | `services/business_agent.py` | One answer, step by step (below) |
| Typed tools | `services/agent_tools.py` | Server-side data lookups with role scopes |
| Retrieval | `services/evidence_search.py` | BM25 over `knowledge/evidence/catalog.json` |
| Skills | `services/runtime_skills.py`, `runtime_skills/thai_health/` | Reviewed instruction modules chosen per task |
| Checks | `services/conversation_agent.py`, `services/answer_checks.py` | JSON parsing, citation, value, price and content checks |
| Guard | `services/conversation_guard.py` | Safety check on messages, answers and documents |
| Report reader | `services/report_reader_v2.py`, `services/lab_fields_v2.py` | OCR, rows, status from the printed range |
| Harness config | `services/harness_config.py` | Versioned manager settings for skills and tools |
| Knowledge admin | `services/knowledge_admin.py` | Pause/resume records, PDF documents |
| Hospital links | `services/hospital_links.py`, `business_data/hospital_links.json` | Reviewed official hospital pages |
| Providers | `services/providers.py`, `services/conversation_transport.py` | Provider per slot, bounded HTTPS calls classified by origin (one snapshot of the settings per request) |
| Execution | `services/execution.py` | Request ID, deadline, admission (`AI_MAX_IN_FLIGHT`, `OCR_MAX_IN_FLIGHT`), stream protocol, cancellation, drain, structured logs |
| Document worker | `services/document_worker.py`, `services/document_render.py` | Report files checked and rendered in a separate, killable process with time and memory limits |
| Browser client | `static/js/stream.js` | Stream reading, failure classification, watchdogs, readiness wait before sending after a pause |
| Spending | `services/cost_ledger.py`, `services/free_policy.py` | THB ledger, call cap, optional free-only policy |
| Storage | `services/business_store.py`, `services/guest_memory.py` | Encrypted entities; guest data in memory only |

## Storage

[`services/business_store.py`](../services/business_store.py) keeps all business state in one table:

```text
rs_entities(id, kind, owner, state, branch, payload, created)
```

- `payload` is JSON encrypted with Fernet. The key is `BUSINESS_DATA_KEY`. Locally, when it is not
  set, a key is generated once in `data/business.key`.
- Without `DATABASE_URL` the store is `data/business.sqlite3`. With `DATABASE_URL` it must be a
  PostgreSQL URL.
- A hosted run (`RENDER`, `VERCEL` or `APP_ENV=production` set) refuses to use accounts or bookings
  until both `DATABASE_URL` and `BUSINESS_DATA_KEY` are set. Public pages still render from the seed
  files in `business_data/`.
- A single-row mutex (`SELECT … FOR UPDATE` in PostgreSQL, `BEGIN IMMEDIATE` in SQLite) serializes
  state changes. Provider calls always run outside a transaction.
- Passwords use PBKDF2-SHA256 with 310,000 iterations.
- Guests who have not signed in are kept only in bounded process memory
  ([`services/guest_memory.py`](../services/guest_memory.py): 100 sessions, 64 MiB, 20-minute
  expiry). They never reach the database. This is one reason the service runs as a single process.

| Kind | Holds |
|---|---|
| `user`, `email`, `session` | Accounts, sign-in index, sessions with their CSRF token |
| `conversation`, `archive`, `project` | Active chat, other chats, projects |
| `report` | Uploaded report: original file, rows as read (`raw_fields`), confirmed rows |
| `booking`, `action`, `ticket` | Appointment requests, previews waiting for confirmation, staff cases |
| `corporate_quote`, `org_inquiry` | Organization quotations and requests |
| `payment_txn`, `subscription` | Simulated payments and LabClear Plus periods |
| `line_identity`, `line_job`, `line_outbox` | LINE links, queued events and replies |
| `configuration` | Manager overrides: catalog, centers, roles, AI providers, test receipts, harness, knowledge publication |
| `harness_revision` | Earlier Company Harness settings, for restore |
| `provider_calls`, `cost_ledger`, `cost_entry` | Call cap count and THB ledger |
| `notification`, `audit` | Notifications and the audit log (actions and record IDs only) |

## Agent pipeline

`services/business_agent.run()` produces one answer. Each step is streamed to the browser as it
starts and ends, and the finished steps are stored with the answer as its trace.

1. **Turn setup** (`routers/business.py: turn`). The router checks the session, origin, CSRF token,
   rate limit and optional access code, saves the customer's message and builds the context: the
   last 12 messages, the confirmed report (without the original file or the raw OCR rows), a second
   confirmed report if the customer chose one for comparison, recent bookings and the current page.
2. **Harness step.** `harness_config.load()` takes one snapshot of the Company Harness for the turn:
   revision, whether runtime skills are on, sources per search, answer length, and per-skill and
   per-tool settings.
3. **Input guard.** A pattern check for prompt-injection phrases, then the safety model
   (`guard` slot). Anything not classified as safe stops the turn.
4. **Planner** (`agent_plan` slot). Returns JSON: an action (`answer`, `clarify`, `redirect`,
   `urgent`, `quote`, `book`, `handoff`, `organization`, `link`, `pay`), search terms, package IDs,
   date and time, a role, page shortcuts and a one-line reason. The planner sees the catalog, centers,
   policies and the role roster. Of a confirmed report it sees only the test names, never the values.
5. **Role choice.** Roles come from [`business_data/dots.json`](../business_data/dots.json) (or a
   manager's override): the Health-check Advisor and the Report Explainer. The server, not the
   planner, has the final say. After a report is confirmed, the role that reads reports answers. A
   question that names a package goes to a role that reads the catalog. An action outside the chosen
   role's allowed actions moves to the role that owns it, or becomes `clarify`.
6. **Typed tools** ([`services/agent_tools.py`](../services/agent_tools.py)). The role's `reads` and
   `actions` become the tool scopes. Every call has a strict input schema, a scope check, the
   manager's enable switch and limits (never above the registered ceiling), a timeout, an output size
   limit and an audit entry (tool, version, scope, role, SHA-256 prefix of the arguments, result,
   time, item count). Independent lookups run concurrently. Tools can only read server data or build
   an unconfirmed preview.

   | Tool | Scope | Time limit | Max items |
   |---|---|---:|---:|
   | `lookup_packages` | catalog | 2 s | 40 |
   | `compare_packages` | catalog | 2 s | 1 |
   | `lookup_branches` | branches | 2 s | 1 |
   | `lookup_policies` | policies | 2 s | 1 |
   | `retrieve_evidence` | medical | 10 s | 8 |
   | `get_confirmed_report_rows` | report | 2 s | 1 |
   | `preview_booking` | catalog | 2 s | 1 |
   | `get_external_hospital_offer` | catalog | 2 s | 20 |

7. **Evidence search** ([`services/evidence_search.py`](../services/evidence_search.py)). BM25 over
   the 148-record catalog, minus records a manager has paused. Text is split into Latin words and
   Thai character pairs; each record's Thai aliases are indexed. The number of results is the
   harness "Sources per search" (1–8, default 6). No embedding API is called. If the planner gave no
   search terms but the message names a known test, those test names are searched.
8. **Runtime skills** ([`services/runtime_skills.py`](../services/runtime_skills.py)). When skills
   are on, the server chooses modules from `runtime_skills/thai_health/` from server facts only: the
   role's permissions, the action, whether a confirmed report is present, the evidence classes and
   the tools that ran. Each module is checked against its SHA-256 in `manifest.json`. Package modules
   reach only roles that may quote; the patient explanation reaches only roles that read reports.
   Company wording from the harness is added below the reviewed text.
9. **Medical harness (optional).** With `MEDICAL_HARNESS_ENABLED=true` and a confirmed synthetic
   report, [`services/model_harness.py`](../services/model_harness.py) builds a typed evidence
   packet, the medical analyzer returns a typed analysis that must keep every observation unchanged
   and cite only supplied sources, and the Thai composer writes the answer. Off by default and on
   Render.
10. **Hospital records.** When `HOSPITAL_LINKS_ENABLED=true`, a question that names a hospital adds
    that hospital's reviewed offers as citable `[hosp-…]` evidence.
11. **Writer** (the role's agent slot, or the shared language model). Returns JSON with the reply,
    cited IDs, selected report row IDs and follow-up questions. The server hydrates
    `observation_ids` from the confirmed report without retyping numbers; legacy `observations`
    still require exact equality. The token limit is the harness "Maximum
    answer length" (500–4,000, default 2,400).
12. **Deterministic checks.** Links, images and HTML are removed. Every citation must be an ID that
    was supplied (at most 8 medical and 30 in total). Observations must equal the confirmed rows
    exactly. Every amount must be a catalog or plan price, a number the customer gave, or arithmetic
    on those ([`services/answer_checks.py`](../services/answer_checks.py)). A business record cannot
    support a medical claim; a printed range quoted for a named row must match that row; disease
    staging is rejected. A medical question needs a medical citation. A printed critical flag adds a
    fixed advice line. A role without sales tools may not name or price packages.
13. **Independent reviewer** (`agent_review` slot). Returns `supported`, `values_preserved` and
    `within_scope`. All three must be true. Across steps 12 and 13 the writer gets at most one
    rewrite, and the rewritten draft repeats every check.
14. **Output guard.** The safety model screens the reply, follow-ups, any preview and the plan
    reason.
15. **Hospital links.** For a general package question, up to three hospital offers whose price is
    currently verified are attached after every check. They are never sent to a model.

Any failure stops the turn (fail closed). The message is marked "Not answered" with a reason, and a
Retry button appears when the failure is temporary. A normal turn makes five provider calls (input
guard, planner, writer, reviewer, output guard). A JSON repair retry, the single rewrite or the
medical harness adds calls.

## Report reading

[`services/report_reader_v2.py`](../services/report_reader_v2.py) handles a file sent with
`POST /api/business/chat/report`.

1. One to three files, 3 MB each, three pages in total. PDF pages are rendered with pypdfium2;
   images are validated and size-limited.
2. The plan's reading allowance is reserved before any provider call and returned if reading fails.
3. The `vision` slot transcribes the report. Typhoon OCR makes one call per page; other providers
   make one JSON call.
4. The safety model screens the transcription as a document (hidden instructions, harmful content).
5. For Typhoon OCR, complete unambiguous HTML or Markdown tables with all five required
   columns are copied directly into rows. The HTML path preserves superscript/subscript glyphs
   and rejects missing, merged or unknown columns as a whole. Unsupported layouts use the
   existing guarded model structuring fallback. No clinical dictionary repairs names, values,
   units or flags. The resulting rows are screened again in both paths.
6. Python numbers the rows and computes `within`, `high`, `low` or `unknown` only from the range
   printed on the report ([`services/lab_fields_v2.py`](../services/lab_fields_v2.py)).
7. The rows appear in the chat as a card. Nothing is explained until the customer presses
   "Values are correct, this is my report" (optionally after editing values). The confirmed rows then
   run through the normal turn with the report-reading role.

The original file and the rows as first read (`raw_fields`) are stored but never sent to a model.

## Company Harness configuration

[`services/harness_config.py`](../services/harness_config.py) stores the manager's settings as the
`configuration_harness` row.

- Every save is a new revision. The save must name the current revision; a stale tab gets
  `revision_conflict`. The previous settings are kept as `harness_revision_<n>`, and restore saves
  them again as a new revision. Each save is audited (`harness.saved`).
- `core.md`, `evidence-citation.md` and `scope-uncertainty.md` are locked on.
- Tool time limits and item limits can only be lowered below the registered ceiling.
- Each answer records the revision and a SHA-256 of the settings in `checks.harness`.
- Permissions stay in code and `business_data/dots.json`; the harness cannot widen a role.
- `RUNTIME_SKILLS_ENABLED` sets the default for "Use runtime skills" until the first save.

The manager guide is [admin.md](admin.md).

## Knowledge library

[`services/knowledge_admin.py`](../services/knowledge_admin.py) adds a publication overlay
(`configuration_knowledge`) on top of the fixed catalog. Paused records are left out of search from
the next message. Each record has a PDF: the stored publisher PDF from
`knowledge/medical_sources/raw/` (path and SHA-256 checked), or a LabClear summary PDF generated with
reportlab and labelled as not the publisher's original. Page images are rendered with pypdfium2.
Nothing is fetched from the internet. The corpus is described in
[knowledge/README.md](../knowledge/README.md).

## Official hospital links

[`business_data/hospital_links.json`](../business_data/hospital_links.json) holds 7 reviewed offers
from 6 hospitals, checked on 2026-10-09. [`services/hospital_links.py`](../services/hospital_links.py)
accepts only HTTPS URLs on six official hosts, without query strings or fragments. It computes each
offer's state from its dates: `VERIFIED`, `EXPIRED_SALE`, `EXPIRED_SERVICE`, `NOT_YET_ON_SALE`,
`STALE` or `UNVERIFIED` (`REVOKED` rows are dropped). Only `VERIFIED` offers show a price. Booking and
partnership are always reported as not confirmed. The offers appear on `/hospital-links`, in
`GET /api/business/site/hospital-links` and through the `get_external_hospital_offer` tool, all only
when `HOSPITAL_LINKS_ENABLED=true`.

## Provider layer

[`services/providers.py`](../services/providers.py) resolves a provider for each slot: `llm`,
`vision`, `guard`, and agent slots (`agent_plan`, `agent_advisor`, `agent_explainer`,
`agent_review`, `agent_medical_analyzer`, `agent_thai_composer`). Settings saved by a manager win over
environment variables.

[`services/conversation_transport.py`](../services/conversation_transport.py) makes every call:

```text
PROVIDER_NETWORK_ENABLED → free-only policy (when FREE_ONLY_POLICY_PATH is set)
  → durable call cap (PROVIDER_BUDGET_CYCLE_ID, CLOUD_CALL_LIMIT) → THB ledger reservation → HTTPS request
```

Endpoints come only from server configuration and must use HTTPS. Redirects are not followed,
responses are capped at 1 MB, there is one attempt and no fallback provider. Request bodies are never
logged; provider errors record only the slot and HTTP status. Details: [ai-providers.md](ai-providers.md).

## Security boundaries

| Boundary | Implementation |
|---|---|
| Same origin | The browser `Origin` must equal the request `Host`, or an exact entry in `TRUSTED_ORIGINS` (empty by default). `Sec-Fetch-Site: cross-site` is rejected. CORS is off unless `CORS_ALLOWED_ORIGINS` is set |
| Session | Cookie `labclear_session`: HttpOnly, SameSite=Strict, Secure when hosted, 24 hours. Guests use a token held in page memory (`X-LabClear-Guest`), not a cookie or web storage |
| CSRF | Every state-changing request sends `X-Business-CSRF`, compared with the session's token |
| Roles | `customer`, `staff` (own center), `clinical` (treated as staff), `manager` (all centers and admin). Records are checked for ownership |
| Rate limits | Per client, in process: `CHAT_RATE_LIMIT_REQUESTS` per `CHAT_RATE_LIMIT_WINDOW_SECONDS` (120 per 60 s). Sign-in: 8 attempts per 15 minutes per address |
| Access code | Optional `DEMO_ACCESS_CODE` (12+ characters) sent as `X-LabClear-Access` on AI endpoints |
| Request size | 4 MB for business writes; 10 MB for report uploads, 3 MB per file |
| Headers | Content-Security-Policy (self only), `nosniff`, `no-referrer`, Permissions-Policy, `X-Robots-Tag: noindex`, `no-store` on `/api` |
| Model output | Tools have no shell, `eval`, URL fetch or file path. Actions are previews that the customer confirms. Links and HTML from a model are removed |
| Secrets | Keys are stored encrypted, shown masked (last four characters) and never returned. Logs and the audit log hold no keys, prompts or message text. Test receipts store a SHA-256 of the configuration |

## Interface language

- Thai is the default. The cookie `labclear_language=en` selects English; the server reads it to
  render `<html lang>` ([`routers/site.py`](../routers/site.py)).
- Templates and scripts are written in English. [`static/js/i18n.js`](../static/js/i18n.js)
  translates interface text and `aria-label`, `placeholder`, `title` and `alt` attributes before the
  page paints, and the TH/EN switch changes language in place without a reload.
- The dictionary [`static/i18n/th.js`](../static/i18n/th.js) is generated by
  `node scripts/build_i18n.mjs` from `i18n/th.json` and `i18n/th/*.json`. `--check` fails if an API
  message listed in `i18n/api-messages.en.json` has no Thai entry. `main.py` serves the pre-compressed
  `th.js.gz`. Words in `i18n/th-keep-together.json` are kept on one line.
- Content is not translated: chat messages, model answers, report values and source titles are
  marked `translate="no"` or carry their own `lang`.
- Fonts are self-hosted under the SIL Open Font License: IBM Plex Sans Thai for Thai body text and
  Trirong for Thai headings, with Geist, Geist Mono and Source Serif 4 for Latin text.

Maintainer details: [i18n.md](i18n.md).

## Walkthrough: one chat message

A signed-in customer types "HbA1c คืออะไร" in `/app` and presses Send.

| Stage | What happens | What is stored | Shown live (and kept in Process Explainability) |
|---|---|---|---|
| Request | Browser posts `POST /api/business/chat` with `{"message": …, "page": …}`, the session cookie, `X-Business-CSRF` and `Accept: application/x-ndjson` (after a long pause it first waits for `GET /ready`) | — | Sending (live only) |
| Admission | Session check, then one of `AI_MAX_IN_FLIGHT` slots, or `503 server_busy` at once; the 220 s deadline starts | The message is added to the encrypted conversation; the chat is marked busy | `accepted` with the request ID (heartbeats every 10 s while nothing else is sent) |
| Harness | Settings snapshot for this turn | — | Company Harness · typed tools version · configuration revision · skills on or off |
| Input guard | Pattern check, then one safety-model call | Call cap count and ledger reservation | Your message passed the safety check |
| Planner | One JSON call: action `answer`, search terms `HbA1c`, a role, a reason | Call cap and ledger | Plan: answer the question, as the … (with the reason) |
| Tools | `lookup_policies`, and `lookup_packages` / `lookup_branches` if the role reads them | Tool audit entries (no arguments) | Tool: lookup_policies · items · ms; Loaded business data the … may use |
| Search | `retrieve_evidence` runs BM25 for "HbA1c" | — | Tool: retrieve_evidence; Found n medical sources for "HbA1c" |
| Skills | Server selects modules such as core, thai-style, evidence-citation, scope-uncertainty, lay-explanation | — | Runtime skills loaded · module IDs · SHA-256 prefix |
| Writer | One JSON call with the evidence, role and rules | Call cap and ledger | Draft written and checked · cited sources · report values matched |
| Checks and review | Deterministic checks, then one reviewer call | Call cap and ledger | Second review passed |
| Output guard | One safety-model call on the answer | Call cap and ledger | The answer passed the safety check |
| Result | The answer is streamed last and replaces the live steps | Assistant message with reply, cited sources, follow-ups, role, `checks` (tools, skills, harness revision and SHA-256) and the trace with durations | The answer, its sources, and a **Process Explainability** button that lists the steps above |

If a step fails, times out or is cancelled, the steps still running are shown with their final state
and duration, the terminal error carries the request ID, and the message stays retryable; see
[operations/resilience.md](operations/resilience.md).

Prompts, raw model output and keys are not stored. A guest's chat follows the same path but is kept
only in process memory.


### Candidate follow-up after deployed b8e60ef (2026-10-10)

Named-analyte retrieval prioritizes matching aliases over shared unit tokens. Pure medical
questions exclude unrelated catalog evidence and sales instructions from writer context,
without changing configured role permissions or tool contracts. Organization requests filter
catalog results to the organization segment and keep service claims separate from clinical facts.
A bounded `STATED_COMPARISON` packet may compare one explicit value and interval with identical
units; negation, uncertainty, inequalities, additional values or numbers, reversed ranges and
unit ambiguity prevent the packet. It remains unverified user text, never a confirmed report.
The existing writer, independent reviewer and guards still run. Refund percentages must appear
in the actual policy even when a draft repeats them inside a denial. Rejection logs contain
reason codes, not rejected drafts. See the [candidate evidence](evidence/current/next-candidate-20261010/README.md).
