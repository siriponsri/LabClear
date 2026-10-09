# Safety

LabClear combines rules, classifier models and deterministic checks in code, so no single layer has to be perfect. Layers fail closed: a missing verdict, an unknown label, a provider error or an invalid model reply stops the turn instead of letting an unchecked answer through. This page lists the controls that are implemented and the file that implements each one.

## Safety models on input and output

File: [`services/conversation_guard.py`](../services/conversation_guard.py).

| Item | Behaviour |
|---|---|
| Providers | iApp OpenThai-SystemOne (default `GUARD_PROVIDER=iapp_systemone`), TypeSafe Jev (both System One decision models), or Llama Guard 4 through an OpenAI-compatible API such as OpenRouter. Chosen on `/staff` → AI providers |
| Directions | `input` (every customer message), `output` (every answer with its follow-ups, action and reason, classified together with the customer's message) and `document` (text read from an uploaded report, and again the structured rows) |
| System One labels | Messages and answers: `safe`, `medical_advice`, `prompt_attack`, `privacy`, `harmful`. Documents: `safe`, `prompt_attack`, `harmful`. Anything other than `safe` blocks |
| Llama Guard | `unsafe` with any category blocks. For a document only S6 (specialised advice) and S7 (privacy) are allowed, because a lab report legitimately contains the customer's own health data |
| Fail closed | No configured guard returns `provider_not_configured`; a malformed or unknown verdict returns `guard_invalid` |

## Prompt injection

| Control | File |
|---|---|
| A pattern check for instruction overrides in English and Thai ("ignore previous instructions", "reveal the system prompt", "ลืมคำสั่ง", "ละเลยคำสั่ง") runs on messages and documents before any model call | `services/conversation_guard.py` |
| Every prompt labels history, sources, reports and user text as untrusted data; the report reader and the OCR instruction say not to follow instructions in the document | `services/business_agent.py`, `services/report_reader_v2.py` |
| The planner only proposes. Package IDs, centers, dates, booking IDs and page shortcuts are re-checked against server data; an action the role cannot take is moved or becomes `clarify` | `services/business_agent.py`, `services/business_dots.py` |
| Typed tools have strict inputs (unknown fields such as `actor` are rejected), a scope checked against the role's `reads`, a timeout, an output limit and an audit record. No shell, code execution, URL fetch or file path | `services/agent_tools.py` |
| Runtime skills are chosen from server facts only and each module's SHA-256 must match `manifest.json` | `services/runtime_skills.py` |
| Provider endpoints come only from server configuration and must use HTTPS; redirects are not followed | `services/conversation_transport.py` |
| Hospital links are limited to reviewed HTTPS hosts without query strings or credentials | `services/hospital_links.py` |

## Refusals for out-of-scope or harmful requests

- A blocked message gets a fixed refusal in the customer's script (Thai or English). Requests for a diagnosis, medicine or dose point to a doctor or pharmacist; requests for the system prompt or keys get a refusal that reveals nothing; a blocked document asks for a clear photo or PDF of the report (`services/conversation_guard.py`).
- The planner can choose `redirect` or `urgent`; severe symptoms and critical results get advice to seek prompt professional care (`services/business_agent.py`).
- Without suitable evidence the writer must clarify or offer staff instead of answering from memory (`ANSWER` prompt; `evidence_missing` check in `services/business_agent.py`).
- A document that is not a lab report is refused (`not_a_report`, `services/report_reader_v2.py`).

## Prices and discounts

| Control | File |
|---|---|
| Prices reach the model only from the catalog and plan files | `services/agent_tools.py`, `business_data/` |
| Every amount in an answer must be a catalog or plan price, a number the customer gave, a price times a headcount the customer gave, or a difference of these. A package named on a line must carry its own price. Otherwise one rewrite, then the answer is withheld | `services/answer_checks.py` (`unknown_amounts`) |
| Quotation previews are computed by the server; on confirmation the preview must equal the current catalog quote (`quote_changed`) | `services/business_store.py`, `routers/business.py` |
| Organization quotations are computed from the catalog price times the headcount plus a travel fee entered by staff | `routers/business.py` (`/staff/quotes`) |
| Only a manager can change catalog prices; each change is audited | `routers/business.py` (`/staff/catalog/{id}`) |
| Policy: no automatic discounts | `business_data/policies.json` |

## Other customers' data and roles

| Control | File |
|---|---|
| Every customer record is read through an owner check; another owner's record returns 404 `not_found` | `services/business_store.py` (`own`) |
| Staff see tickets and bookings of their own branch; managers see all; manager-only routes check the role | `routers/business.py`, `routers/business_ops.py` |
| Quotation PDFs are served only to their owner or to staff of that branch | `routers/business_ops.py` |
| Demo accounts cannot be used while `DEMO_ACCOUNTS` is off | `services/demo_accounts.py` |
| Provider keys are stored encrypted and only a masked form (last four characters) is returned to the manager page | `services/providers.py`, `routers/ai_admin.py` |

## Sessions, CSRF and same-origin

| Control | File |
|---|---|
| Session cookie `labclear_session`: HttpOnly, SameSite=Strict, Secure when hosted (Render or `APP_ENV=production`), 24 hours. Guest tokens live in page memory and travel in a header | `routers/business.py`, `static/js/api.js` |
| Every state-changing request must send the session's CSRF token (`X-Business-CSRF`), compared in constant time | `routers/business.py` (`session_row`) |
| Requests with `Sec-Fetch-Site: cross-site`, or an `Origin` that differs from the service's own host, are rejected unless the origin is listed exactly in `TRUSTED_ORIGINS` (empty by default). CORS is off unless `CORS_ALLOWED_ORIGINS` is set | `routers/business.py`, `routers/samples.py`, `services/trusted_origins.py`, `main.py` |
| Optional access code for AI endpoints (`DEMO_ACCESS_CODE`, header `X-LabClear-Access`) | `routers/samples.py` |
| Sign-in: 8 attempts per 15 minutes per client address; new passwords need 12 characters or more | `routers/business.py` |
| Sign in with Google: authorization code flow with PKCE, state and nonce; customers only | `routers/google_auth.py` |
| LINE linking needs a recent password sign-in (10 minutes) and explicit consent | `routers/business.py` |

## Rate and size limits

| Limit | Value | File |
|---|---|---|
| Requests per client address | 120 per 60 seconds (`CHAT_RATE_LIMIT_REQUESTS`, `CHAT_RATE_LIMIT_WINDOW_SECONDS`), in process memory; a multi-instance deployment needs shared infrastructure | `services/request_limits.py` |
| Message length | 8,000 characters (staff messages 4,000) | `routers/business.py` |
| Business API request body | 4 MB; 10 MB for report uploads; enforced while streaming the body | `main.py` |
| One turn at a time per conversation; a turn times out after 220 seconds | | `routers/business.py` |

## Model calls and cost

| Control | File |
|---|---|
| No provider call is made unless `PROVIDER_NETWORK_ENABLED=true` (default false) | `services/conversation_transport.py` |
| Durable call cap: each call counts against `PROVIDER_BUDGET_CYCLE_ID` up to `CLOUD_CALL_LIMIT` (default 200), stored in the database; failed calls count; a new cycle ID starts a new count | `services/conversation_transport.py` |
| Project-total THB ledger (`PROJECT_BUDGET_THB`, default 300): the worst-case cost is reserved before each call; an unstated prior spend or an unpriced model blocks the call | `services/cost_ledger.py` |
| Optional free-only policy (`FREE_ONLY_POLICY_PATH`): the exact host, path and model must be listed as verified free for the account within the last 7 days; a shared quota limits calls per minute and per run. It runs before the call cap and the ledger | `services/free_policy.py` |
| One attempt per call, no fallback provider; error logs keep the slot and HTTP status only | `services/conversation_transport.py` |
| Organization context (off by default) is sent only to configured, non-free providers | `services/business_agent.py` |

## Image validation

| Control | File |
|---|---|
| PNG or JPEG only, identified by file signature and confirmed by decoding | `services/image_validation.py` |
| 3 MB per file (`IMAGE_MAX_BYTES`) and 12 million pixels (`IMAGE_MAX_PIXELS`); decompression bombs are rejected | `services/image_validation.py` |
| EXIF orientation applied, metadata stripped, image re-encoded before use | `services/image_validation.py` |
| PDF: 1–3 pages rendered to JPEG within the pixel limit; locked or broken PDFs are refused; at most 3 pages or images per reading | `services/report_reader_v2.py` |
| Transcriptions over 50,000 characters are refused; uploaded file names are sanitized | `services/report_reader_v2.py`, `routers/business.py` |

## Private data

| Control | File |
|---|---|
| Synthetic data only, stated in the policy and on every page | `business_data/policies.json`, `templates/site/base.html` |
| Signed-in data is stored encrypted with Fernet (`BUSINESS_DATA_KEY`) | `services/business_store.py` |
| Guest data stays in server memory only: 20-minute idle expiry, at most 100 guests and 64 MB, cleared on page close or sign-in | `services/guest_memory.py` |
| The original image and the raw OCR rows of a report are never sent to a model; the OCR omits identity fields; the planner sees test names only | `routers/business.py`, `services/report_reader_v2.py`, `services/business_agent.py` |
| Deleting a report also clears the chats that used it | `routers/business.py`, `services/chat_sessions.py` |
| Audit records hold actions and IDs, not message contents | `services/business_store.py` |
| Pages and API responses send `X-Robots-Tag: noindex, nofollow`; API responses are `no-store` | `main.py` |

## Deterministic answer checks

These run in Python on every draft, before the reviewer. Files: [`services/conversation_agent.py`](../services/conversation_agent.py), [`services/answer_checks.py`](../services/answer_checks.py), [`services/business_dots.py`](../services/business_dots.py).

| Check | Failure |
|---|---|
| Inline citations must be IDs of evidence the writer received; at most 8 medical and 30 total | `citation_invalid` |
| Links, images and HTML are removed; any left fail the answer | `answer_invalid` |
| Report values, units and ranges the answer reports must match the confirmed row | `observation_invalid` |
| Amounts must be catalog or plan prices or allowed arithmetic (see above) | `price_invalid` |
| No business source for a medical claim; no changed printed range on a named row; no personal disease staging | `evidence_review_failed` |
| A medical question needs a medical citation | `evidence_missing` |
| The Report Explainer may not name a package or a price | `role_violation` |
| A printed critical flag adds a fixed advice line when the answer lacks it | (added, not failed) |

## Independent reviewer

A separate model call (its own slot, `agent_review`) receives the evidence, the confirmed report, the preview and the draft. It must return three booleans: `supported` (every clause is supported by the content of its cited record), `values_preserved` (values, units and ranges match the same named row) and `within_scope` (no personal diagnosis, cause, treatment, completed transaction or authorization). Any `false` triggers the single rewrite; a second failure withholds the answer (`review_failed`). File: [`services/business_agent.py`](../services/business_agent.py).

## Output handling in the browser

- Markdown is rendered with marked and sanitized with DOMPurify using a short tag allowlist (`static/js/turns.js`, `static/js/workspace.js`).
- Content-Security-Policy (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy` (`main.py`).

## Mapping to the OWASP Top 10 for LLM applications

| Risk | Controls |
|---|---|
| LLM01 Prompt injection | Pattern check, safety models, untrusted-data labels, re-checked plans, typed tools, reviewer |
| LLM02 Sensitive information disclosure | Owner checks, encrypted storage, masked keys, guest memory, private report fields |
| LLM05 Improper output handling | Link and HTML removal, DOMPurify, CSP |
| LLM06 Excessive agency | Previews and customer confirmation; staff confirm appointments; no tool can write without confirmation |
| LLM09 Misinformation | Evidence-only answers, citation and value checks, reviewer, status computed in Python |
| LLM10 Unbounded consumption | Rate and size limits, call cap, THB ledger, free-only policy |

The five safety test cases and their results are in [testing.md](testing.md).
