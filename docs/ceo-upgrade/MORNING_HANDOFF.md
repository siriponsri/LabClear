# Morning handoff — disabled-by-default candidate

## Read first

This delivery is a software candidate, not project completion or clinical approval.
No live inference, OCR, embeddings or provider Test call was made. Production data,
ENV, keys, DNS, hosting resources and saved provider settings were not changed.
The existing Render entry point and dependency declarations remain unchanged.

Baseline: `b95621f45da55cba88f70fe62bac796a994bf0ba` on `main`, initially identical
to fetched `origin/main`, with no outgoing commits. Evidence hashes and the final
local delivery identity are recorded in `evidence/candidate-manifest.json` and the
local `test-results/ceo-delivery/` manifest. Post-push results are local-only to
respect the single-push authorization.

## Delivered

- Six default-off feature flags; explicit analyzer/composer settings without inherited keys.
- Strict medical evidence/analysis packets, hash-checked Thai runtime modules,
  conservative budget fixes and privacy-safe provider error logging.
- Guest UI clears synchronously on signup/sign-in; delayed Guest workspace responses
  cannot repaint the signed-in account. The browser regression exercises that race.
- Organization upload/review/version/revoke/delete, scoped citations/downloads and
  prevention of revoked private evidence entering later model context.
- Separate Thai/English interactive landing preview and official hospital links page.
- Acquisition queue with duplicate/provenance fields, source review notes and a Thai report addendum.
- Current docs index, exact config precedence, isolated tests and responsive screenshots.

## Evidence and its limits

| Check | Result |
|---|---|
| Full Python suite | 265 passed, 0 skipped, 1 dependency deprecation warning |
| Legacy browser | 36 passed, 0 failed; real local UI/auth/storage, mocked AI/OCR |
| Upgrade browser | 10 scenarios passed, including admin controls and source lifecycle |
| Offline model/skill fixture matrix | 60 checks passed; no model ranking or skill-benefit claim |
| Render entrypoint smoke | Uvicorn started/stopped, 8 route checks, no new keys; isolated SQLite |
| Production PostgreSQL / live providers | NOT_RUN |

Screenshots cover 390/768/1440 widths. The initial mobile upload clipping was fixed
and rechecked at the control boundary. All runs use synthetic input. See
[IMPLEMENTATION.md](IMPLEMENTATION.md#verification-commands) for commands and
[PROGRESS.md](PROGRESS.md) for failed attempts, fixes and final gate audit.

## Owner gates and remaining work

| Gate / task | State and next step |
|---|---|
| G-UI / LC-08 | Review the local landing preview, then explicitly decide rollout scope |
| G-DATA / LC-03b | Real documents and new clinical evidence pending rights, section review and qualified approval |
| G-API / LC-12 | No live test tonight; verify pricing/quota/retention and authorize bounded synthetic evaluation |
| New medical path | Built-in sample only; unsupported real-report route fails closed |
| Clef | API/coverage/calibration spike still required; registry metadata is not an adapter |
| Embeddings | Deferred until a retrieval comparison establishes benefit; no new vector store |
| Guard normalization | Typed coverage helper is offline-only; legacy guards remain active unchanged |
| Model resilience | No new account-quota manager or cross-request circuit breaker; existing request bounds/caps remain |
| R1 coverage | Active corpus remains 58 records / 4 publisher groups; no new expert-approved clinical source |
| R6 mappings | Two official destinations; unknown variants/inclusions never mapped into booking or clinical advice |
| Coursework/report | Final Project.docx/Week 11 rubric not found; Thai Markdown addendum provided, Word/PDF layout NOT_RUN |
| CI / Render | Must verify separately after push; no repository CI workflow at baseline |

No claim that all R1–R6 or coursework requirements are fully complete. The current
candidate can be reviewed and deployed with new features disabled while these gates remain open.

## Morning procedure

1. Check GitHub commit and Render deployment identity. Do not use an old health
   response as proof of the new commit. Keep all new flags false initially.
2. Read [ENV_HANDOVER.md](ENV_HANDOVER.md). Inspect Admin configuration labels;
   saving a model is not live verification and Test may spend money.
3. Open the isolated local preview with the documented runner. Review baseline/after
   screenshots and the report interaction in Thai and English for G-UI.
4. Exercise authored synthetic organization documents with two separate organizations:
   assign membership, upload draft, approve, search/cite, replace, revoke and verify denial.
   Keep ORG_REFERENCE_INFERENCE_ENABLED false until provider data policies are reviewed.
5. Reconcile existing spend without resetting counters. Maintain the current 300 THB
   cap unless the owner explicitly changes it. Plan all-stage live comparison within
   an authorized $1 benchmark and the remaining project cap, including uncertain failures.
6. Check real model/guard correctness with a qualified reviewer before expanding data
   or clinical use. No provider is selected as a live winner by the scripted fixtures.

## Rollback and recovery

First disable the six new flags and restart using the normal owner workflow.
Resetting a new Admin role disables it; preserve legacy slots and saved credentials.
If code rollback is required, the owner can select the previously known Render
deployment or approve a normal revert of the candidate commit. Do not force-push,
reset database contents, rotate BUSINESS_DATA_KEY or reset spend to recover code.
Code rollback does not undo data changes. This candidate adds no database schema;
new organization records are ordinary encrypted entities and remain dormant while disabled.

Delivery artifacts are a source **delta** ZIP and incremental Git bundle requiring
the recorded baseline. Their manifest includes hashes and verification results.
They exclude owner intake archives, raw documents, secrets, databases and vendor/font
collections. `course_eval_round4.json` must retain SHA-256
`1f37d206692524b9ce06ba2fb179506be7c7a8bcecc580be4504bff87dbb39d2`.

## Publication status

This committed document records pre-publication evidence. Read local
`test-results/ceo-delivery/POST_PUSH_STATUS.md` for the independent statuses
LOCAL_GATES_PASS, PUSH_VERIFIED, CI_RESULT, RENDER_STATUS and LIVE_API_NOT_RUN.
Its absence means publication verification has not been recorded. No second push
is authorized merely to update these statuses.
