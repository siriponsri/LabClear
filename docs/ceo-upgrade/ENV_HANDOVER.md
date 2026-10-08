# ENV / Admin handover

No new secret is required at boot. All new flags default to false. Production ENV
and saved configuration were not read or changed. Candidate identity and byte hashes
are recorded in the evidence manifest; delivery commit is recorded in the local handoff.

## Effective precedence

1. `scripts/run_business.py` loads `.env` without overriding existing process ENV.
2. `config.py:Settings` reads process ENV, then `.env`, then class defaults.
3. `services/providers.py:runtime` uses an encrypted saved slot before ENV fallback.
   An unsaved legacy agent uses shared `llm`, which itself prefers saved settings to ENV.
   New analyzer/composer roles have **no shared or ENV fallback** and start disabled.
4. Price precedence: both saved per-slot prices, then exact-model `MODEL_PRICES_THB`,
   then legacy preset estimates. New roles require explicit prices at save time.
   Preset estimates and registry metadata are not current-price verification.
5. Server network permission, cycle/call cap and project ledger apply independently
   of saved provider settings. Saving a key never enables provider network traffic.

The storage layer reads process ENV directly, not the Settings object. The normal
entry point makes `.env` available before startup. Tests use the isolated runner.

| Actual setting | Source | Default | Boot required / sensitive | Admin override | Apply / disable |
|---|---|---|---|---|---|
| LANDING_PREVIEW_ENABLED | config.py Settings | false | no / no | none | restart; false hides preview |
| ORG_DOCUMENTS_ENABLED | config.py Settings | false | no / no | none | restart; false disables API/UI/source access |
| ORG_REFERENCE_INFERENCE_ENABLED | config.py Settings | false | no / no | none | restart; false stops private retrieval for AI |
| HOSPITAL_LINKS_ENABLED | config.py Settings | false | no / no | none | restart; false hides external offer page |
| RUNTIME_SKILLS_ENABLED | config.py Settings | false | no / no | none | restart; false restores baseline prompts |
| MEDICAL_HARNESS_ENABLED | config.py Settings | false | no / no | none | restart; false restores baseline explainer |
| LLM_PROVIDER / LLM_MODEL / LLM_API_KEY / LLM_BASE_URL | config.py, providers.py | typhoon / empty / empty / empty | no / key sensitive | saved llm or legacy role | ENV restart; Admin immediate/cache refresh |
| GUARD_PROVIDER / GUARD_MODEL / GUARD_API_KEY / GUARD_BASE_URL | same | iapp_systemone / empty / empty / empty | no / key sensitive | saved guard | missing key blocks guarded inference |
| VISION_ENABLED / VISION_PROVIDER / VISION_MODEL / VISION_API_KEY / VISION_BASE_URL | same | false / typhoon_ocr / empty / empty / empty | no / key sensitive | saved vision | disabled stops OCR |
| LLM_TIMEOUT_SECONDS / GUARD_TIMEOUT_SECONDS / VISION_TIMEOUT_SECONDS | config.py | 60 / 20 / 60 | no / no | none | restart |
| PROVIDER_NETWORK_ENABLED | config.py, transport | false | no / no | none | restart; false stops provider calls |
| PROVIDER_BUDGET_CYCLE_ID / CLOUD_CALL_LIMIT | config.py, conversation_transport.py | empty / 200 | calls require cycle / no | none | restart; never change cycle to evade counts |
| COST_LEDGER_ENABLED / PROJECT_BUDGET_THB | config.py, cost_ledger.py | true / 300 | no / no | none | restart; keep ledger enabled |
| PROJECT_BUDGET_PRIOR_SPEND_THB | same | empty | calls require known prior spend / financial metadata | none | restart; unknown blocks calls |
| MODEL_PRICES_THB / COST_IMAGE_TOKEN_ESTIMATE | same | empty / 1500 | no / no | per-slot prices win | restart; image estimate needs verification |
| DATABASE_URL / BUSINESS_DATA_KEY | business_store.py | absent | required for durable production / yes | none | preserve existing values; do not rotate key casually |
| BUSINESS_DB_PATH / BUSINESS_KEY_PATH | business_store.py | data/business.sqlite3 / data/business.key | local only / key file sensitive | none | tests override to temporary paths |
| PORT / BUSINESS_WORKER_ENABLED | scripts/run_business.py | 8000 / off unless true | Render supplies PORT / no | none | unchanged entry point |
| BUSINESS_EXTERNAL_ENABLED / DEMO_ACCOUNTS | business integration/session code | off unless true | no / no | none | keep real integrations off; demos only controlled use |

## Role readiness

| Role | Candidate/config | Adapter | Software evidence | Live |
|---|---|---|---|---|
| planner/advisor/explainer/reviewer | existing saved > shared settings; registry proposals never overwrite | existing chat protocols | legacy UAT, provider/guard tests | NOT_RUN |
| medical_analyzer | exact owner-selected ID, no default; Santé is synthetic-only and blocked in normal path | chat + strict packet validation; optional bounded fallback helper | test_model_harness.py | NOT_RUN |
| thai_composer | exact owner-selected ID, no default | existing chat + validated analysis/original evidence | pipeline fixture | NOT_RUN |
| vision | existing Typhoon OCR configuration | existing OCR adapter | OCR doubles | NOT_RUN |
| decision guard | existing iApp/other saved guard | existing protocol-specific adapters | legacy safety tests | NOT_RUN |
| Clef / embeddings | proposal only | new adapter NOT_IMPLEMENTED | coverage contract only / no embedding test | NOT_RUN |

Admin labels: DISABLED, NOT_CONFIGURED, SCHEMA_CHECK_ONLY. `ready` means local
configuration only. `live_test_status` remains NOT_RUN; Test results are returned
for that request and are not stored as durable certification. OCR Test explicitly
returns NOT_RUN and requires a separate synthetic upload when authorized.

## Owner morning sequence

1. Read the gate table and evidence before enabling anything. Confirm candidate
   identity on Render; HTTP 200 alone cannot establish which commit is running.
2. Keep current keys, database, saved provider settings, budget cycle and ledger.
   Reconcile prior spend, including all services and uncertain timed-out calls.
   The existing 300 THB cap is retained; the $20 ceiling does not automatically
   increase it. Any currency conversion/tax allowance is an explicit owner decision.
3. Review `/preview/landing` through the local fixture for G-UI. Do not roll out
   the new design across `/app` or `/staff` from this preview approval alone.
4. For synthetic document review, enable only ORG_DOCUMENTS_ENABLED in an approved
   test environment. Provision membership, upload authored text, inspect, approve,
   search, cite, replace and revoke. Keep reference inference off initially.
5. Before G-API: verify exact model/provider availability, current price, data
   retention/ZDR support, quotas, input coverage and original guard requirements.
   Save new roles with exact prices and reviewed endpoint IDs. Never press Test
   merely to see whether saving worked; Test and OCR may incur charges.
6. If separately authorized, run a synthetic benchmark capped at $1 within the
   remaining existing cap. Evaluate all pipeline calls, uncertainty/negation,
   Thai comprehension and reviewer/guard failures. Do not use real records.
7. MEDICAL_HARNESS_ENABLED currently supports only the built-in sample. Real report
   support, free analyzer evaluation and new Clef routing need further implementation
   and calibrated evidence before activation. No flag overrides that boundary.

## Disable and rollback

Set the six new flags false and restart through the normal owner-controlled process.
Delete/resetting only a new Admin role returns it to disabled. Do not reset the
shared LLM or existing ledger to roll back this candidate. Restoring the previous
code commit is an owner operation (see MORNING_HANDOFF); no database rollback is
introduced here. Already approved organization records remain encrypted but inaccessible
while the feature is disabled. Existing baseline schema initialization and one-time
legacy Guest purge are unchanged, not newly introduced migrations.
