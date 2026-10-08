<!-- ceo-upgrade-20261008 -->

## Current upgrade behavior

Admin now lists four legacy agents and two opt-in roles: Medical analyzer and Thai
composer. The new roles start disabled, inherit no shared key, require exact model
and prices, and require reviewed endpoint IDs for OpenRouter. Saving is a schema/config
check; it does not run Test. OCR Test returns NOT_RUN instead of a success claim.
Resetting a new role disables it. See the [effective config map](ceo-upgrade/ENV_HANDOVER.md).

The 2026-10-08 upgrade is a disabled-by-default software candidate. Its current scope, evidence, configuration and remaining owner gates are recorded in the [upgrade index](ceo-upgrade/README.md). Earlier release counts and screenshots below are historical; they do not establish live model or clinical validation.

# AI providers and agents

A manager chooses which model does each AI job on `/staff → AI providers` (sign in as `admin` locally). Keys are encrypted with the business data key, shown only as the last four characters and never returned to the browser. Every change is written to the audit log without the key. Environment variables are the fallback when nothing is saved.

## Slots

| Slot | Job | Default | Environment fallback |
|---|---|---|---|
| Language model (`llm`) | Shared by every agent below | Typhoon `typhoon-v2.5-30b-a3b-instruct` | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |
| Safety check (`guard`) | Screens messages, answers and uploaded reports | iApp OpenThai-SystemOne | `GUARD_PROVIDER`, `GUARD_API_KEY`, `GUARD_MODEL` |
| Report reading (`vision`) | Reads report images and PDFs | Typhoon OCR | `VISION_ENABLED`, `VISION_PROVIDER`, `VISION_API_KEY`, `VISION_MODEL` |

## Agents

Each agent uses the shared language model unless it is given its own provider, model and key (slot `agent_<id>`). Choose **Its own provider** under Agents on the same page; **Use the shared language model** returns it to the shared setting.

| Agent | Slot | Typical reason to give it its own model |
|---|---|---|
| Planner | `agent_plan` | A small, fast model that follows JSON well |
| Health-check Advisor | `agent_advisor` | A model strong in Thai customer service |
| Report Explainer | `agent_explainer` | A stronger model for medical explanations |
| Reviewer | `agent_review` | A different model family, so the second check is independent of the writer |

The live steps and "How this was checked" name the provider and model each agent used.

## Providers

| Provider | ID | Slots | Default model | THB per 1M tokens (in / out, estimate) |
|---|---|---|---|---|
| Typhoon (SCB 10X) | `typhoon` | language model | typhoon-v2.5-30b-a3b-instruct | 10 / 10 |
| Typhoon OCR | `typhoon_ocr` | report reading | typhoon-ocr | 10 / 10 |
| OpenAI | `openai` | language model, report reading | gpt-4.1-mini | 15 / 60 |
| Anthropic (Claude) | `anthropic` | language model | claude-haiku-4-5 | 36 / 180 |
| Google Gemini | `gemini` | language model, report reading | gemini-flash-latest | 11 / 90 |
| Hugging Face | `huggingface` | language model | openai/gpt-oss-120b | 6 / 25 |
| OpenRouter | `openrouter` | language model, report reading | openai/gpt-4.1-mini | 15 / 60 |
| xAI (Grok) | `xai` | language model | grok-4.7 | 72 / 216 |
| Moonshot (Kimi) | `moonshot` | language model | kimi-k2.6 | 22 / 90 |
| Alibaba (Qwen) | `qwen` | language model | qwen-plus | 15 / 45 |
| DeepSeek | `deepseek` | language model | deepseek-chat | 10 / 15 |
| Custom (OpenAI-compatible) | `custom` | language model, report reading | any | set by you |
| iApp OpenThai-SystemOne | `iapp_systemone` | safety check | openthai-systemone | 0 / 0 (free preview) |
| TypeSafe Jev | `typesafe_jev` | safety check | jev-latest | 10 / 0 |
| Llama Guard 4 (OpenRouter) | `llama_guard` | safety check | meta-llama/llama-guard-4-12b | 7 / 7 |

Prices are estimates used only by the THB budget; set them to the provider's real prices on the page. A custom endpoint must use `https://` (plain `http://` only for localhost) and may not point to a private network address.

## Test button

**Test** makes one real call through the call cap and the budget. For a language model it asks for a JSON reply, because every agent must return JSON; a model that answers in prose is reported as not suitable. For the safety check it classifies a normal lab question, which must come back safe.

## Spending limits

| Setting | Meaning |
|---|---|
| `PROVIDER_NETWORK_ENABLED` | AI calls are off until this is `true` |
| `PROVIDER_BUDGET_CYCLE_ID`, `CLOUD_CALL_LIMIT` | Maximum calls in a cycle; a new cycle name starts a new count. A chat turn uses about five calls (at most eight with corrective retries) |
| `PROJECT_BUDGET_THB`, `PROJECT_BUDGET_PRIOR_SPEND_THB` | Project budget (300 THB) and what was spent before this deployment |

Both limits are kept in the database and checked before every call; the current numbers are on `/staff → Channels and budget`.
