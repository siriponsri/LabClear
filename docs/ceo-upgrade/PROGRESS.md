# Overnight upgrade progress

## Latest checkpoint — local release gates pass; conditional publication next

2026-10-08. Baseline full SHA is recorded below. No commit or push yet at this checkpoint.
Current state: LOCAL_GATES_PASS for the disabled-by-default candidate; publication not yet claimed.
All six new feature flags remain false. No live inference or production write occurred.

### Requirement acceptance matrix

| Requirement / task | Current software evidence | Remaining boundary |
|---|---|---|
| R1, LC-03/03a | 15 acquisition records, 6 URL duplicates, hashes/section review queue; baseline corpus unchanged | LC-03b rights/clinical approval pending; no claimed coverage gain |
| R1, LC-04 | Synthetic upload/review/search/cite/version/revoke/delete; tenant, reader/editor, Guest and revoked-history tests | G-DATA; TXT/MD only, no full-document OCR or real organization data |
| R2, LC-05 | Existing Guest ephemeral storage/account history regression and UI-33 pass | No change to production retention policy |
| R3, LC-07/07a/07b | Render kept; exact entrypoint boot with isolated env; missing/legacy/saved config matrix | Production PostgreSQL and actual Render deployment not tested locally |
| R4, LC-06/a/b/c/d | Explicit roles, packet validation, runtime skills integration, price/endpoint controls, concurrency/cancellation tests, 60 fixture cases | G-API; Clef/embeddings adapters, calibrated semantics and circuit breaker not implemented |
| R5, LC-02 | Actual separate TH/EN preview, report explorer, source link; 390/768/1440 screenshots | G-UI / LC-08 rollout pending |
| R6, LC-04b/09b | Two checked official links, date/variant/unknown price/PHI URL tests | Clinical mappings and real booking/partnership absent by design |
| LC-00/00a/01 | Authoritative Git baseline, selected requirements, skill register, preserved owner file | Rubric/Final Project.docx not found |
| LC-09/09a | 265 Python tests, 36 legacy + 10 upgrade browser scenarios, screenshot self-review, staged source/secret audit | No independent reviewer, per owner single-model instruction |
| LC-10 | Thai report addendum, Mermaid architecture and current documentation links | Coursework compliance / Word/PDF pagination NOT_RUN |
| LC-11/a/b | Morning/config handoff authored | Candidate commit, artifacts and conditional push pending audit |
| LC-12 | No live calls; independent post-push checks planned | G-API and Render identity verification pending |

### Exact final checks so far

- `rtk proxy .venv/Scripts/python.exe scripts/offline_check.py pytest -q --junitxml=docs/ceo-upgrade/evidence/candidate-pytest.xml`: exit 0, 265 passed, no skips, one Starlette/httpx deprecation warning; final run 54.00 seconds after runner boot mode added.
- `rtk proxy node tests/browser/uat.cjs`: exit 0, 36 passed / 0 failed. Updated six-role assertion and scoped Reviewer form selection for the two opt-in additions.
- `rtk proxy node tests/browser/upgrade.cjs`: exit 0, 10 passed, 0 browser errors, including final Admin screenshots at all three widths. Earlier visual review detected upload controls clipped despite page-level overflow check; CSS min-width/grid bounds and a direct control assertion fixed it. Expanded Admin control bounds then found another mobile grid overflow; scoped provider-grid fixes and the final rerun passed.
- `rtk proxy .venv/Scripts/python.exe scripts/offline_check.py evaluation`: exit 0, 60 fixture checks. Clinical/language/semantic ratings, model latency and cost are NOT_RUN.
- `rtk proxy .venv/Scripts/python.exe scripts/offline_check.py boot`: exit 0, actual unchanged Render entrypoint/Uvicorn startup and graceful stop, eight route checks with defaults/no new keys. Repository dotenv is suppressed, temporary SQLite used, outbound denied, no provider doubles. Production DB NOT_RUN.
- Initial full candidate run: 260 passed/1 failed because an old test expected provider response body logging. Replaced that assertion with metadata presence plus absence of private text; subsequent full suite passed.
- Impeccable detector ran once on the new surfaces, exit 0; existing-font warning retained to preserve owner design. Visual review found/fixed the actual mobile control defect. No global skill/config updates or subagents.

### Durable implementation decisions

Source provenance/clinical review and commercial offers remain separate. Real hospital pages were read without buying or booking. New analyzer/composer need exact model/prices and reviewed OpenRouter endpoints; no automatic routing fallback. The free analyzer is blocked from the normal customer packet path. Guard coverage helper is an offline contract; existing guards remain the live route. No model ranking is inferred from scripted fixtures.

Organization queries use POST, preventing private search text in URL logs. Private source IDs survive uncited model output, are excluded from future context after revoke and are rechecked before answer persistence. Existing account history is not silently rewritten. Provider error bodies are no longer logged. Budget retains 300 THB and prior spend; no USD conversion or counter reset.

Runtime skill files are marked `-text` in .gitattributes so Git cannot change their
hash-checked bytes between Windows and Linux. Dependency/lockfile/render.yaml/
run_business.py/business_store.py diffs are empty. No configured hooksPath and no
active local Git hooks were found. No repository .github workflow exists.

Final UAT rerun exposed a timing-dependent Guest-to-account display race (35/36).
The signup response correctly discarded server Guest data, but the old DOM remained
until the account workspace loaded and a delayed Guest poll could repaint it.
Signed-in transition now clears Guest UI synchronously; refresh ignores responses
from a previous identity/token. UI-33 now deliberately holds a Guest poll across
signup, then releases it and checks both private text absence and account identity.
Final `rtk proxy node tests/browser/uat.cjs`: exit 0, 36/36. Final upgrade suite:
exit 0, 10/10. No test was removed or skipped.

Selected requirement copies and acquisition JSON were whitespace-normalized to
pass `git diff --cached --check`; owner intake originals are untouched. Runtime
module hashes match staged blobs. After manifest newline normalization,
`rtk proxy .venv/Scripts/python.exe scripts/offline_check.py pytest -q tests/test_model_harness.py`:
exit 0, 10 passed. No application Python changed after the 265-test full run.

### Next executable action

Create local candidate and verified source delta ZIP/bundle; fetch remote again.
Push once only if origin/main still equals baseline and the committed bytes match
the manifest. Record remote/CI/Render statuses locally without a second push.

### Release gate audit

| Gate | Local result | Evidence |
|---|---|---|
| RG-01 | PASS; final fetch recheck required immediately before push | main/base/origin match, initial outgoing empty, only explicit staged paths |
| RG-02 | PASS | boot.json: unchanged entrypoint, real Uvicorn start/stop, eight routes; configuration matrix tests |
| RG-03 | PASS | candidate-pytest.xml: 265 passed; final Python unchanged except newline-only manifest; focused hash tests 10 passed |
| RG-04 | PASS | legacy-browser 36 and upgrade-browser 10, 390/768/1440 screenshots; final Guest race regression |
| RG-05 | PASS within software scope | tenant/revoke/revoke-during-answer tests, Guest privacy, budget concurrency/idempotence, inert upload text, metadata-only logs |
| RG-06 | PASS | missing/legacy/new config tests, saved > ENV, new role reset disables, no automatic Test, all six default-off flags |
| RG-07 | PASS | no diffs to storage schema, deployment entrypoint, render.yaml or dependencies; existing baseline initialization/purge unchanged |
| RG-08 | PASS within external-link scope | reviewed official URLs, no raw clinical ingestion; stale/expiry/unknown price/variant/outbound tests |
| RG-09 | PASS | reviewed staged diff; git diff --cached --check exit 0; high-specificity secret/scope scan; owner hash preserved |
| RG-10 | PASS | MORNING_HANDOFF, ENV_HANDOVER, implementation/source docs, rollback; clearly named open owner/clinical/coursework gates |

`rtk proxy .venv/Scripts/python.exe scripts/check_candidate.py`: exit 0,
104 staged files checked before adding its output manifest; source digest
`c3d766e724a56759573757cdd79b3051a2b070e04b6d985f4d5e8cb9025ab996`.
The digest covers changed source/config/test blobs, with unchanged files inherited
from baseline; docs/evidence excluded to avoid self-reference. Source bytes equal
Git-normalized working files used by tests. High-specificity scanning supplements
manual review; it is not proof that arbitrary secrets are mathematically absent.

Fresh `rtk proxy git fetch origin` succeeded. Baseline and fetched main remain
`b95621f45da55cba88f70fe62bac796a994bf0ba`. No active hooks were found, and dependency
scripts contain only the existing optional browser UAT command. Intake archives,
root task, owner evaluation JSON, .env, DBs, raw documents and vendor/font collections
are outside the candidate. Selected requirement copies differ only in whitespace.

Publication outcomes are deliberately not asserted here. After candidate creation,
use the ignored local `test-results/ceo-delivery/delivery-manifest.json` and
`POST_PUSH_STATUS.md` for exact delivery SHA/artifact hashes and independent
PUSH_VERIFIED / CI_RESULT / RENDER_STATUS / LIVE_API_NOT_RUN states. No second push
will be made merely to update this committed record.

---

## Historical checkpoint 1

2026-10-08, Asia/Bangkok. Main at `b95621f45da55cba88f70fe62bac796a994bf0ba`.
Fetched origin/main is identical; no outgoing commits. Fetch/push URL:
`https://github.com/siriponsri/LabClear.git`. Initial untracked paths: root task
and `docs/ceo-upgrade/` intake. Owner `course_eval_round4.json` is preserved.
Single assistant; no delegation or global configuration changes. Owner requests
Astra High; client model/effort selection cannot be independently verified here.

## Task ledger and acceptance

| IDs | Status | Evidence / next action |
|---|---|---|
| LC-00/00a | PASS | HEAD, remote, fetch and outgoing history checked; RTK instructions read |
| LC-01 | IN_PROGRESS | Task r4, authorization, release gates and harness contract read; source inventory underway |
| LC-02 | NOT_RUN | Inspect baseline browser; implement separate landing preview |
| LC-03/03a/03b | NOT_RUN | Coverage, rights queue, section review; clinical approval remains gated |
| LC-04/04b | NOT_RUN | Synthetic organization workflow and external hospital links |
| LC-05 | IN_PROGRESS | Existing ephemeral Guest implementation found; isolated regression pending |
| LC-06/06a/06b/06c/06d | IN_PROGRESS | Existing slots, transport and ledger inspected; adapters/harness/diagnostics pending |
| LC-07/07a/07b | IN_PROGRESS | Render retained; isolated boot compatibility pending |
| LC-08 | PENDING_OWNER | G-UI applies only to rollout; preview work proceeds |
| LC-09/09a/09b | NOT_RUN | Full regression, browser, security and offer checks |
| LC-10 | NOT_RUN | Update current docs; preserve historical reports/evidence |
| LC-11/11a/11b | NOT_RUN | Candidate, handoff, artifacts and conditional single push |
| LC-12 | PENDING_OWNER | Live inference prohibited tonight; Render read-only checks after eligible push |

R1–R6 remain unproven until implementation and corresponding gates have evidence.
No tests, production behavior or clinical quality are claimed from historical results.

## Owner gates

AUTH-LABCLEAR-20261008-OVERNIGHT permits local implementation/commits and one
conditional normal main push. G-UI rollout and G-DATA real documents remain
pending. G-API is owner morning action, including free APIs, OCR and embeddings.
No production ENV, secrets, schema migration, resources or DNS changes permitted.

## Document / skill inventory

- Read: intake 00, 06, task r4, model harness contract, 07; README and provider/release docs (initial inspection).
- Read: config, app entrypoint, business store, providers, transport, Guest/provider tests and browser fixture.
- Used: implementation skill and team contract under `C:/Users/User/.agents/skills`.
- Read-only reference: `.agent-kit/skills-source/skills/implementation/SKILL.md` and `agents/security-reviewer.toml`; no agent launched.
- Root AGENTS.md and existing PROGRESS.md absent. User-provided RTK.md applies.
- Final Project.docx/rubric search pending; historical report files are not assumed to be the rubric.

## Decisions and discoveries

- Reuse existing encrypted entity store and provider infrastructure; no new startup schema.
- Tests import configuration before fixtures. Added `scripts/offline_check.py` to
  load config in a temporary directory with sanitized environment, isolated DB/key,
  and outbound socket denial before test collection. No real keys used.
- Existing legacy Guest purge runs on first DB transaction. Preserve and audit
  this baseline behavior separately from any newly introduced migrations.
- Self-review only, per owner single-model instruction; no independent-review claim.

## Verification

Executed via `rtk`: `git status --short --branch`, `git remote -v`, `git fetch origin`,
`git rev-parse HEAD`, `git rev-parse origin/main`, `git log origin/main..HEAD --oneline`.
All Git commands exit 0. HEAD and fetched remote equal the SHA above; outgoing empty.
PowerShell `Get-FileHash` unavailable; owner file hashing will use Python.
Software tests/browser: NOT_RUN at this checkpoint. Release gates RG-02–RG-10 NOT_RUN.

## Next executable action

Run `rtk proxy .venv/Scripts/python.exe scripts/offline_check.py pytest -q`, then
inspect baseline browser and implement the bounded upgrade against the acceptance matrix.

## Outcome

IN_PROGRESS. LOCAL_PASS not established; PUSH_NOT_RUN; CI_NOT_RUN;
RENDER_NOT_VERIFIED; LIVE_API_NOT_RUN.

## Checkpoint 2 — implemented and focused checks

- Owner file SHA-256: `1f37d206692524b9ce06ba2fb179506be7c7a8bcecc580be4504bff87dbb39d2`.
- Installed repository-pinned pytest and Playwright dependencies locally; no dependency declarations changed.
- `rtk proxy .venv/Scripts/python.exe scripts/offline_check.py pytest -q --junitxml=docs/ceo-upgrade/evidence/baseline-pytest.xml`: exit 0, 231 passed, 1 Starlette deprecation warning, 42.30s. Initial runner failed because Windows asyncio uses socketpair; fixed narrowly for the internal wakeup pipe.
- `rtk proxy node tests/browser/uat.cjs`: exit 1, 33 passed / 3 failed. Initial home navigation timed out; two demo login failures caused by runner disabling the known synthetic demo accounts. Browser-only demo setting corrected; final rerun pending. No application network is permitted by the runner.
- Provider diagnostics now distinguish disabled/configured/not configured from live verification. OCR Test no longer reports success without an OCR call. Provider rejection logs exclude echoed bodies.
- Cost ledger now reserves UTF-8 text bytes and max_completion_tokens, rejects nonfinite prior spend and prices, and settles reservations once. Existing budget/counters are not reset. Prior tests were updated for a conservative upper bound and truly small input.
- Organization reference API implemented using existing encrypted entities, no schema change. TXT/Markdown only, bounded extraction, authenticated manager membership, editor review, scoped retrieval/download, atomic version replacement/revoke/delete. Disabled by default; real organization documents remain gated.
- Fixed allowlisted runtime modules installed from owner starter (reviewed text only). Package advice adds stale-offer/date/partnership boundaries. Hash verification is tied to committed manifest. Instruction integration and analyzer/composer stages are opt-in; original review/guards remain.
- Added typed evidence/analysis packets, strict fact copying, bounded fallback, guard coverage normalization, and synthetic-only free-model boundary. New agent roles inherit no provider/key by default.
- Focused command `... offline_check.py pytest -q tests/test_upgrade_safety.py tests/test_cost_ledger.py tests/test_ai_providers.py`: exit 0, 29 passed.
- Focused command `... offline_check.py pytest -q tests/test_organization_sources.py`: exit 0, 4 passed.
- Focused command `... offline_check.py pytest -q tests/test_model_harness.py tests/test_ai_providers.py tests/test_guard_repairs_302.py`: exit 0, 38 passed.
- Public official model pages opened (no inference). Santé page confirms response_format unsupported; adapter omits it. Model suitability remains LIVE_EVAL_NOT_RUN.
- Impeccable used as existing-design reference; owner single-model/no-global-change instructions override its optional agent/update/interview workflow. Baseline catalog screenshot inspected. G-UI preview has not yet been implemented.
- Final Project.docx / Week 11 rubric not found in workspace or attachments search. Historical Word/PDF reports remain untouched.

Next: implement preview and organization document UI; source acquisition/official links;
offline comparison harness and registry; final compatibility/regression/browser checks;
current docs/report addendum and handoff; audit release gates before any commit/push.
