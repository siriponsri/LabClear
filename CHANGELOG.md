# Changelog

Dates are in 2026. Test counts are software evidence with test doubles, not live model results.

## Local safety candidate after 7343d7a (2026-10-10, not deployed)

- Recorded I02 API exposure of unsupported personal disease staging and retesting advice, with explicit limits on what browser evidence exists.
- Bind confirmed-report explanations to exact row IDs; preserve role validation, uncertainty and critical notices. Reject provable cross-row OCR fallback changes and retain human confirmation.
- Render published refund/home-service policy fields; preserve withheld-review status and output Safety Guard. No additional provider requests, retries, credentials or budget changes.
- Final local validation: 531 pytest, R01–R12 12/12, business UAT 36/36, TH/EN renderer 2/2. Frozen offline20 remains incomplete; [evidence and remaining limitations](docs/evidence/current/bound-output-20261010/README.md). No push or deployment in this phase.

## Deployed 7343d7a (2026-10-10)

- Owner-approved push and Render auto-deploy verified at the exact SHA. One unchanged live20 completed: 12 PASS, 5 FAIL, 3 errors; separate UX chats both rendered with content caveats. No case retries or provider/key/budget changes.
- Recorded raw OCR regressions, request-scoped rejection reasons, unsupported policy/clinical statements and browser evidence. [Complete measured result](docs/evidence/current/canonical-coursework-20261010/LIVE-7343D7A.md). Quality acceptance remains open.

## Candidate after b8e60ef (2026-10-10, pre-deployment record)

- Preserve explicit native OCR table columns and glyphs; guarded fallback and human confirmation remain. Resolve answer observation IDs against authoritative confirmed rows.
- Narrow organization and medical writer context, improve named-analyte retrieval, compare only explicit unambiguous supplied intervals, and reject unsupported refund percentages even inside denials.
- Wait for initial workspace and final answer rendering before enabling controls. Join disconnected workflow cleanup with a bounded wait while retaining unfinished work in admission accounting.
- Preserve every existing test and frozen scoring rule. [Evidence and remaining live blockers](docs/evidence/current/next-candidate-20261010/README.md) distinguish local passing checks from incomplete OCR and production acceptance. Production at that checkpoint was b8e60ef; the later approved 7343d7a deployment result is recorded above.

## Local follow-up (2026-10-10)

- Added a separate synthetic health-check Hub: discovery, filters, details, up-to-three comparison and a local inquiry preview. No provider partnership, real prices, real booking or external transmission is implied. The existing three-center catalog and landing remain intact.
- Conversation tone and reviewer recovery now preserve useful clarification, expose withheld-review status honestly, and keep rejected drafts private. Follow-up grounding/language regressions and emergency refusal guidance were added after live failures. See the [measured evidence](docs/evidence/current/reviewer-tone-20261010/README.md); live acceptance remains open.

## 4.0.0-rc3 (2026-10-09)

This release.

- **One interface.** The FastAPI website (Jinja templates and vanilla JavaScript) is again the single
  UI for the site, `/app` and `/staff`. The Next.js website (`web/`), the Cloudflare deployment
  (`deploy/`), `vercel.json` and `Dockerfile` are removed from the repository.
- **Thai first, TH/EN switch.** Thai is the default on every page, with an in-place TH/EN switch kept
  in the `labclear_language` cookie. The dictionary sources moved to `i18n/` and are built into
  `static/i18n/th.js` by `scripts/build_i18n.mjs`; API messages have Thai entries; Thai loanwords are
  kept on one line.
- **Fonts.** IBM Plex Sans Thai (body) and Trirong (headings), self-hosted under the SIL OFL.
- **Company Harness admin.** Managers switch runtime skills on or off, add company wording per skill,
  pause typed tools and lower their limits, set sources per search and answer length. Core,
  evidence-citation and scope-uncertainty modules are locked. Each save is an audited revision that
  can be restored.
- **Knowledge library.** 148 records are searchable: 58 reviewed earlier and 90 summaries approved by
  the owner on 2026-10-09 (source check pending). Managers can read each record as a publisher PDF
  or a labelled LabClear summary PDF, and pause or resume it with a reason.
- **Official hospital links in chat.** A question naming a hospital gets its reviewed offers as cited
  evidence; general package questions get up to three verified links attached after every check.
  Offers re-checked on 2026-10-09 (7 offers, 6 hospitals).
- **Process Explainability.** Each typed tool and the skill selection report their own step with
  timing; answers record the harness revision and its SHA-256.
- **Deployment.** `render.yaml` defines a single auto-deployed `labclear` service from `main` with
  runtime skills and hospital links on.
- **Evaluation.** Deterministic scorer `scripts/score_benchmark.py`, an OCR file suite (12 synthetic
  PNG and PDF files), a recorded demo rollout and `notebooks/LabClear_Harness_Demo.ipynb`. Recorded
  evidence in `docs/evidence/current` is OFFLINE only: coursework profiles A, B and C each 15/20
  automated pass; OCR file suite 0/12 fully correct, 217/252 exact values. LIVE_FREE was not run.
- **Request resilience (P0-A to P0-D of the 502 handoff).** Every AI request runs in one execution
  context with a request ID, a whole-workflow deadline (`CHAT_DEADLINE_SECONDS=220`,
  `REPORT_DEADLINE_SECONDS=150`) that covers storage, every agent, the rewrite and JSON repair, and a
  cancellation scope: Stop, a closed connection, the deadline and shutdown cancel the provider call
  (cost reservation kept), kill the document worker and free the slot. Timeouts are
  `request_timeout`/`upstream_timeout` (504); provider failures are classified with an `origin`
  (`upstream_unavailable`, `upstream_rate_limited`, …); no automatic retries
  (`PROVIDER_TRANSPORT_RETRIES=0`).
  - NDJSON stream with `accepted`, 10-second heartbeats and exactly one terminal event; a bounded event
    queue; interrupted steps shown with their state and duration in Process Explainability, with the
    request reference.
  - Admission: `AI_MAX_IN_FLIGHT=2`, `OCR_MAX_IN_FLIGHT=1`, otherwise `503 server_busy` with
    `Retry-After: 5`, no queue. Upload limits are checked before any decoding; PDF and image work runs
    in a killable worker process with time and memory limits and no secrets; storage runs off the
    event loop with bounded waits.
  - `GET /ready` (readiness, Render `healthCheckPath`), `/health` unchanged; graceful drain on SIGTERM
    (`SHUTDOWN_DRAIN_SECONDS=20`); `X-Request-ID` on every response and in JSON errors and stream
    events; structured JSON log lines without prompts, report data or keys.
  - Browser client `static/js/stream.js`: gateway HTML, JSON errors, network resets, invalid lines and
    early ends are classified and shown in plain Thai; 35-second idle and budget + 10 s watchdogs; the
    message returns to the composer (page memory only); Retry is inert while a request runs; a wait
    for `/ready` before sending after a pause. Scripts are served with content-hash URLs.
  - Deterministic fault suite `scripts/benchmark_resilience.py` (R01–R12, virtual clock, provider
    doubles, a real SIGTERM): 12/12. Runbook: `docs/operations/resilience.md`. Not implemented (P1):
    circuit breaker, retry policy, durable jobs.
- **Reports and slides.** Three Thai reports in the style of the 4.0.0 technical report, written with
  the Thai Report Format skill: the Final Project submission report (Word, `scripts/build_report.py`,
  placeholders for facts still missing), a business report and an architecture, tech stack and agent
  flow report (PDF from Markdown, `scripts/build_docs_pdf.mjs`). The deck is rewritten in English for
  rc3 (12 slides). Diagrams show admission, the deadline, the heartbeat and `/ready`; screenshots in
  `docs/assets/screenshots` are current Thai captures. The 4.0.0 report, its builder and page map are
  removed.
- **Removed documentation.** `docs/ceo-upgrade/`, older release notes and older evidence folders.
- Python tests: 371.

## 4.0.0-rc2 (2026-10-09)

Free-first harness on the integration branch.

- Typed tools (`services/agent_tools.py`) with strict inputs, role scopes, timeouts, output limits
  and audit records.
- Runtime skills 0.3.0, selected per task from server facts and role permissions.
- Reviewed synthetic reports accepted as uploads in test environments; raw OCR rows stored apart from
  confirmed rows.
- Free-only provider policy, shared quota, LIVE_FREE trial server and preflight
  (`services/free_policy.py`, `scripts/live_free_server.py`).
- Coursework benchmark runner with OFFLINE, REPLAY and LIVE_FREE modes and a frozen dataset in
  `eval/coursework/`.
- Python tests: 328. LIVE_FREE blocked by preflight (no keys, free status unverified).

## 4.0.0-rc1 (2026-10-09)

Integration of the Claude 4.0.0 branch on the Codex backend (`c970410`).

- Read-only site API (`routers/public.py`) and an optional `TRUSTED_ORIGINS` allowlist.
- The Claude branch's Next.js website as an optional second Render service; Cloudflare kept as a
  deferred option.
- The Claude branch's 90 knowledge records queued as unapproved acquisition candidates.

## 4.0.0, Claude branch (2026-10-08)

Built on 3.1.0, which is not part of this repository's history. Not merged; parts were reused in the
release candidates above.

- Next.js website with a Thai-first TH/EN interface.
- Cloudflare Workers deployment and an OpenRouter model set, neither adopted.
- A 135-record knowledge base, 77 records written without opening the pages.

## 3.0.x (2026-10-06 to 2026-10-08)

- **3.0.0** (2026-10-06). FastAPI health-check chatbot for a simulated three-center business:
  18 packages, booking with staff confirmation, simulated payments, AI Lab Report, Thai answers from
  a 58-source BM25 catalog with citations, input and output screening, call cap and 300 THB ledger.
  Then: multi-provider AI with a manager settings page and System One safety check, chats and
  projects, lab reports in the chat with live steps, Sign in with Google, demo accounts.
- **3.0.1** (2026-10-07). Fixes from the second live test round (answer validation, report review,
  evaluation) and the Thai coursework report.
- **3.0.2** (2026-10-07). Guest chats kept only in process memory; fixes from the third test round
  (validation and navigation).
- **2026-10-08.** Disabled-by-default upgrade candidate on 3.0.2: medical analyzer and Thai composer
  roles, runtime skills, organization documents, hospital links and a landing preview, all behind
  flags that default to off.

### Canonical benchmark evidence continuation
Added privacy-preserving per-request ledger/source receipts and a complete deployed coursework20 adapter, with strict quota stops and explicit coverage limits. Fixed withheld-explanation false positives and the offline Windows OCR dependency/parser. Frozen dataset and rubric unchanged; see docs/evidence/current/canonical-coursework-20261010/README.md for provenance and known failures.

### Fixes from the complete live coursework baseline

The deployed21b137b canonical run completed11/20 automated passes, with eight failures and one execution error. Added bounded rejection of answer-schema echoes, generic OCR table column preservation, concise report-output instructions and narrow checks for observed privacy/diagnostic regressions. No frozen benchmark criteria, provider settings, token budget, spending history or quotas changed. Detailed baseline evidence and remaining validation limits are in docs/evidence/current/canonical-coursework-20261010.


## 2026-10-10 — Deployed b8e60ef evidence

Recorded exact-SHA readiness, complete live20 (13 PASS / 4 FAIL / 3 errors), two separate UX questions, receipt totals, and manual grounding findings. Documentation only; no new production revision, provider calls, key/budget changes or acceptance claims. See docs/evidence/current/canonical-coursework-20261010/LIVE-B8E60EF.md.
