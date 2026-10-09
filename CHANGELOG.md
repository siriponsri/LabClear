# Changelog

Dates are in 2026. Test counts are software evidence with test doubles, not live model results.

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
- **Removed documentation.** `docs/ceo-upgrade/`, older release notes and older evidence folders.
- Python tests: 345.

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
