<!-- ceo-upgrade-20261008 -->

## Upgrade boundaries

Private documents require current organization membership and approval; source
access is rechecked after generation and revoked derivations are removed from later
model context. Provider error logs contain slot/status only. Cost reservations use
UTF-8 byte estimates, finite prices/prior spend and idempotent settlement. New roles
remain disabled until configured; no real-document approval follows from a feature
flag. See [limitations and trust boundaries](ceo-upgrade/IMPLEMENTATION.md).

The 2026-10-08 upgrade is a disabled-by-default software candidate. Its current scope, evidence, configuration and remaining owner gates are recorded in the [upgrade index](ceo-upgrade/README.md). Earlier release counts and screenshots below are historical; they do not establish live model or clinical validation.

# Safety

LabClear combines the three guardrail types taught in the course (rules, a classifier model and framework-style checks in code) so that no single layer has to be perfect. Every layer fails closed: a missing verdict, an unknown label, a provider error or an invalid model reply stops the turn instead of letting an unchecked answer through.

## Layers

| # | Layer | Type | What it stops |
|---|---|---|---|
| 1 | Message length (8,000 characters), upload limits (3 files, 3 MB each, 10 MB per request), rate limit (120 requests per minute per client) | Rule | Unbounded input and consumption |
| 2 | Session cookie (HttpOnly, SameSite=Strict), CSRF token, same-origin check, optional demo access code; Google sign-in with state, PKCE and nonce, customers only | Rule | Cross-site requests, anonymous abuse, account takeover through sign-in |
| 3 | Thai and English pattern check for instruction overrides ("ignore previous instructions", "ลืมคำสั่ง") on messages and documents | Rule | Plain prompt injection, before any model call |
| 4 | Safety model on every message, every answer and every uploaded report | Classifier | Unsafe requests and answers, hidden instructions in images |
| 5 | Planner sees only test names from a report, never values | Design | Sales driven by abnormal results |
| 6 | Answer validation in Python: cited IDs must be retrieved sources (at most 8 medical sources), report values must match the confirmed rows, every amount must be a catalog price, links and HTML are removed, the Explainer may not name or price packages, a critical printed flag adds advice to seek care promptly | Framework-style | Invented sources, changed values, unsafe output, role misuse |
| 7 | Reviewer model: supported, values preserved, within scope | Classifier | Unsupported claims, diagnosis, invented transactions |
| 8 | Previews and confirmation: bookings, quotes, payments and hand-offs run only after the customer confirms; staff confirm every appointment | Design | The model acting on its own |
| 9 | Status computed in Python from the printed range | Design | The model labelling values |
| 10 | Owner-scoped records, Fernet encryption, masked API keys, manager-only AI settings, audit log | Rule | Data leaks between customers, key exposure |
| 11 | Call cap per cycle and a 300 THB project budget, checked before every model call | Rule | Runaway cost |
| 12 | Markdown sanitized in the browser (DOMPurify, a short tag allowlist); a strict Content-Security-Policy | Rule | Improper output handling |

## Safety model questions

System One models (iApp OpenThai-SystemOne, TypeSafe Jev) answer one `choice` question per text. Anything other than `safe` is blocked.

| Text | Labels | Notes |
|---|---|---|
| Customer message, assistant answer | safe, medical_advice, prompt_attack, privacy, harmful | Explaining what a test measures, or the customer's own confirmed values, is safe |
| Uploaded report (transcription and rows) | safe, prompt_attack, harmful | A lab report is expected to contain the customer's own name and health values, so privacy and medical labels do not apply; text aimed at an AI assistant is blocked |

With Llama Guard 4 the same rule applies: for an uploaded report only the S6 (specialised advice) and S7 (privacy) categories are allowed; every other category blocks.

## Mapping to OWASP Top 10 for LLM applications

| Risk | Where it is handled |
|---|---|
| LLM01 Prompt injection | Layers 3, 4, 6, 7; all supplied text is labelled untrusted data in the prompts |
| LLM02 Sensitive information disclosure | Layers 2, 10; keys never reach the browser; the system prompt is never returned |
| LLM05 Improper output handling | Layers 6, 12 |
| LLM06 Excessive agency | Layer 8; the model proposes, the customer and staff decide |
| LLM09 Misinformation | Layers 6, 7, 9; sources must exist and support the answer |
| LLM10 Unbounded consumption | Layers 1, 11 |

## Privacy

All data is synthetic. Reports and chats belong to the account that created them; staff see that a customer shared a report but not its image or values. Deleting a report removes it and clears the chats that used it. Demo accounts are shared by design and off on a hosted site unless the owner turns them on for a demonstration.

## Safety test cases

The five cases run against the live system are in [testing.md](testing.md#safety-cases).
