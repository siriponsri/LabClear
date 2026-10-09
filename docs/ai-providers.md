# AI providers and spending

LabClear calls external AI services for three jobs and up to six agents. AI is off until the server
owner allows it, and every call passes a call cap and a THB ledger first. Sources:
[`services/providers.py`](../services/providers.py),
[`services/conversation_transport.py`](../services/conversation_transport.py),
[`services/cost_ledger.py`](../services/cost_ledger.py),
[`services/free_policy.py`](../services/free_policy.py).

## Slots

| Slot | Job | Default provider | Environment fallback |
|---|---|---|---|
| `llm` | Language model shared by the agents | Typhoon `typhoon-v2.5-30b-a3b-instruct` | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |
| `guard` | Safety check on messages, answers and report text | iApp OpenThai-SystemOne | `GUARD_PROVIDER`, `GUARD_API_KEY`, `GUARD_MODEL`, `GUARD_BASE_URL` |
| `vision` | Report reading (OCR) | Typhoon OCR `typhoon-ocr` | `VISION_ENABLED`, `VISION_PROVIDER`, `VISION_API_KEY`, `VISION_MODEL`, `VISION_BASE_URL` |

Timeouts: `LLM_TIMEOUT_SECONDS` (60), `GUARD_TIMEOUT_SECONDS` (20), `VISION_TIMEOUT_SECONDS` (60).
`VISION_ENABLED` defaults to `false` in `config.py`; `.env.example` sets it to `true`.

## Agents

| Agent | Slot | Default |
|---|---|---|
| Planner | `agent_plan` | Shared `llm` |
| Health-check Advisor | `agent_advisor` | Shared `llm` |
| Report Explainer | `agent_explainer` | Shared `llm` |
| Reviewer | `agent_review` | Shared `llm`; a different model family makes the review more independent |
| Medical analyzer | `agent_medical_analyzer` | Disabled; no shared or environment fallback |
| Thai composer | `agent_thai_composer` | Disabled; no shared or environment fallback |

The medical analyzer and Thai composer run only with `MEDICAL_HARNESS_ENABLED=true` and a confirmed
synthetic report. Saving them requires an exact model and explicit prices. With OpenRouter they
also require reviewed provider endpoint IDs, and the request is sent with fallbacks off, data
collection denied and zero data retention requested. The medical analyzer refuses models whose ID
ends in `:free`.

## Providers

| Provider | ID | Slots | Default model | THB per 1M tokens, in / out (preset estimate) |
|---|---|---|---|---|
| Typhoon (SCB 10X) | `typhoon` | llm | `typhoon-v2.5-30b-a3b-instruct` | 10 / 10 |
| Typhoon OCR | `typhoon_ocr` | vision | `typhoon-ocr` | 10 / 10 |
| OpenAI | `openai` | llm, vision | `gpt-4.1-mini` | 15 / 60 |
| Anthropic (Claude) | `anthropic` | llm | `claude-haiku-4-5` | 36 / 180 |
| Google Gemini | `gemini` | llm, vision | `gemini-flash-latest` | 11 / 90 |
| Hugging Face | `huggingface` | llm | `openai/gpt-oss-120b` | 6 / 25 |
| OpenRouter | `openrouter` | llm, vision | `openai/gpt-4.1-mini` | 15 / 60 |
| xAI (Grok) | `xai` | llm | `grok-4.7` | 72 / 216 |
| Moonshot (Kimi) | `moonshot` | llm | `kimi-k2.6` | 22 / 90 |
| Alibaba (Qwen) | `qwen` | llm | `qwen-plus` | 15 / 45 |
| DeepSeek | `deepseek` | llm | `deepseek-chat` | 10 / 15 |
| Custom (OpenAI-compatible) | `custom` | llm, vision | set by you | 0 / 0 |
| iApp OpenThai-SystemOne | `iapp_systemone` | guard | `openthai-systemone` | 0 / 0 |
| TypeSafe Jev | `typesafe_jev` | guard | `jev-latest` | 10 / 0 |
| Llama Guard 4 (OpenRouter) | `llama_guard` | guard | `meta-llama/llama-guard-4-12b` | 7 / 7 |

Preset prices are estimates for the budget only; they are not verified current prices. Set the real
prices on the AI providers page. A custom endpoint must use `https://` (`http://` only for
localhost) and may not contain credentials, a query, a fragment or a private network address.

## Setting keys

Keys can come from two places:

1. **Admin → AI providers** (`/staff`, manager only). Settings and keys are stored in the encrypted
   business database (Fernet, `BUSINESS_DATA_KEY`), shown masked (last four characters) and never
   returned to the browser. Saves are audited without the key.
2. **Environment variables**, used only when nothing is saved for a slot.

Precedence:

- A saved slot wins over the environment. An agent without its own setting uses the shared `llm`
  slot, which itself prefers saved settings to the environment.
- Prices: saved per-slot prices, then an exact-model entry in `MODEL_PRICES_THB`
  (`{"model": {"input_per_mtok": 10, "output_per_mtok": 10}}`), then the preset estimate.
- Saving a key never turns on network traffic. `PROVIDER_NETWORK_ENABLED` does.

The manager steps are in [admin.md](admin.md#ai-providers).

## Network switch, call cap and budget

Every provider call goes through `conversation_transport.post_json` in this order. Any refusal stops
the call before it reaches the network.

| Gate | Setting | Behaviour |
|---|---|---|
| Network switch | `PROVIDER_NETWORK_ENABLED` (default `false`) | Off means no provider call at all |
| Free-only policy | `FREE_ONLY_POLICY_PATH` (empty by default) | Only on trial servers; see below |
| Call cap | `PROVIDER_BUDGET_CYCLE_ID`, `CLOUD_CALL_LIMIT` (default 200) | Count stored in the database per cycle; survives restarts; failed calls count; a new cycle ID starts a new count |
| THB ledger | `PROJECT_BUDGET_THB` (300), `PROJECT_BUDGET_PRIOR_SPEND_THB` | Project total, not monthly. Each call reserves its worst-case cost first and settles with reported usage; failed or cancelled calls keep the reservation. Unknown prior spend or an unpriced model blocks the call |

`COST_LEDGER_ENABLED` (default `true`) must stay on. `COST_IMAGE_TOKEN_ESTIMATE` (1,500) is the token
allowance per image. A normal chat turn makes five calls; retries, the single rewrite and report
reading add calls. Current values are on `/staff` → Channels and budget and in
`GET /api/business/staff/budget`.

Other transport rules: HTTPS endpoints from server configuration only, no redirects, a 1 MB response
cap, one attempt, no fallback provider, no request-body logging. Errors name the slot and HTTP
status, never the key or the prompt.

## Test connection receipts

`POST /api/business/staff/ai-providers/{slot}/test` makes one real call through the network switch,
call cap and ledger.

| Slot kind | Test | Receipt status |
|---|---|---|
| Language model and agents | Requests a small JSON object in JSON mode | `LIVE_TESTED` if valid JSON returns, otherwise `LIVE_TEST_FAILED` |
| Safety check | Classifies "What does an HbA1c test measure?" | `LIVE_TESTED` if classified safe |
| Report reading | No call | Returns `NOT_RUN`; no receipt |

The receipt is stored in `configuration_provider_tests` with its status, time and scope ("one
connectivity/schema probe; model quality not established"). It is bound to a SHA-256 of the
provider, model, endpoint and key and is shown only while they are unchanged
(`live_test_status`, `tested_at` in `GET /api/business/staff/ai-providers`). A call that fails
outright stores no receipt. A receipt does not establish medical accuracy or role suitability.

`GET /api/business/staff/ai-providers/registry` returns read-only model proposals from
`runtime_skills/model_registry.json`. It never changes settings or calls a provider.

## Free-only policy and LIVE_FREE runs

The free-only policy is for benchmark trial servers. It is off unless `FREE_ONLY_POLICY_PATH` names a
reviewed policy file; never set it on Render. When it is on, every call must pass these checks before
the call cap, the ledger and the network:

1. The exact HTTPS host, path and model must be listed in the policy. Anything else, such as a saved
   Admin slot pointing at a paid provider, is refused with `free_policy_blocked`.
2. The entry must be `VERIFIED_FREE_FOR_THIS_ACCOUNT`, with `verified_at` no older than 7 days and a
   written `evidence` note. Other states give `free_policy_unverified`. Zero prices apply only
   because the policy says so.
3. A shared quota, stored once per run in the database, enforces per-minute rates, per-run caps on
   text calls, OCR calls and guard decisions, a run time limit and the provider's daily decision
   limit. A full minute window waits (up to 65 seconds); a reached cap gives `free_quota_exhausted`.
   iApp decisions are counted conservatively as questions × labels.

The ledger and call cap still run. The application cannot see the provider's bill; the owner checks
the provider console.

Template: [`eval/policies/free_only.example.json`](../eval/policies/free_only.example.json). Its
limits (Typhoon text 30/min, OCR 5/min, iApp 20/min; per run 60 minutes, 400 text calls, 20 OCR
calls, 300 decisions, concurrency 1) are proposals for this project, not provider limits, and must
not exceed the account's real quota.

### Preflight

```bash
python scripts/benchmark_labclear.py preflight --profile-letter C \
       --policy <reviewed-policy.json> --suite smoke --dry-run --json preflight.json
```

Preflight never calls inference. It checks a clean commit, the policy's reviewer fields and data
policy review, the free status of each endpoint, that credentials are present (present or missing
only), the effective slots a trial server would call (resolved in a clean process with a fresh
database) and a worst-case quota estimate. The last recorded preflight
([docs/evidence/current/live-preflight.json](evidence/current/live-preflight.json), clean candidate
`8445db6`) is `BLOCKED`: unverified free status, no credentials and an unreviewed policy.
**LIVE_FREE has not been run.**

What the providers publish (checked 2026-10-10, [details](evidence/current/provider-free-tier-check.md)):
Typhoon lists its text model as free for light usage (5 requests/s, 200/min); Typhoon OCR (2/s,
20/min) has no published free status; iApp charges credits (50 free at sign-up) and lists no free
SystemOne quota. Treat OCR and the guard as paid until the account shows otherwise.

### Owner runbook

1. Check out the release commit with a clean working tree and install `requirements.txt` and
   `requirements-dev.txt`.
2. Copy the template to a file outside the repository. Fill `reviewed_by`, `reviewed_at`,
   `account_label` (a name, not a key) and `data_policy_reviewed: true`. For each endpoint you have
   checked on the provider's console and pricing page today, set `price_status` to
   `VERIFIED_FREE_FOR_THIS_ACCOUNT`, `verified_at` and `evidence`. Leave the others unverified.
3. Export `LABCLEAR_TRIAL_TYPHOON_API_KEY` and `LABCLEAR_TRIAL_IAPP_API_KEY` in the shell only.
4. Run preflight until it reports `PASS`.
5. Run the smoke suite first:
   `python scripts/benchmark_labclear.py run --mode live-free --suite smoke --profile C --policy <file> --record-replay`.
6. Then the coursework suite per profile (`--profile A`, `B`, `C`). Watch iApp's daily decision
   limit; resume another day rather than switching keys:
   `python scripts/benchmark_labclear.py resume --run-id <run-id>`.
7. Compare and report: `compare --before <run-id> --after <run-id>`, `report --run-id <run-id>`, and
   score with `python scripts/score_benchmark.py eval_runs/<run-id>`.
8. Have qualified reviewers fill `human_verdict`; the scripts never pass a case clinically.
9. `unset` the keys. Copy only the selected results from `eval_runs/` (git-ignored) to `docs/evidence/`.

Do not disable the ledger or guards, set zero prices on unverified entries, use other keys to avoid
quotas, or keep only a passing retry; the runner records every attempt. LIVE_FREE starts its own
trial server on 127.0.0.1 and never targets production.
