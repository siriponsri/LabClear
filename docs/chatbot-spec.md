<!-- ceo-upgrade-20261008 -->

## Optional analyzer/composer contract

The new medical path accepts only a built-in confirmed sample while data and clinical
gates remain pending. Analyzer output must preserve observation fields exactly and
cite supplied IDs; composer and reviewer receive original evidence. Runtime skills
are allowlisted and hash checked. Schema validity is not medical correctness.
Legacy input/output guards and reviewer remain mandatory. See the
[implementation contract](ceo-upgrade/IMPLEMENTATION.md#models-and-guards).

The 2026-10-08 upgrade is a disabled-by-default software candidate. Its current scope, evidence, configuration and remaining owner gates are recorded in the [upgrade index](ceo-upgrade/README.md). Earlier release counts and screenshots below are historical; they do not establish live model or clinical validation.

# Chatbot specification

What the LabClear assistant must do, what it must never do, and how each rule is enforced. "Enforced in code" means a Python check that runs whatever the model writes; "prompt" means an instruction to the model that the code then verifies where it can.

## Assistant roles

Customers talk to one assistant. Behind it, a planner chooses one of two roles for each answer. Roles are configured in [`business_data/dots.json`](../business_data/dots.json) and can be paused by a manager on `/staff → Assistant roles`.

| Role | Answers | Data it may read | Actions it may propose |
|---|---|---|---|
| Health-check Advisor | Packages, prices, centers, booking, payment, organizations | Catalog, centers, policies, medical sources, the customer's own bookings | answer, clarify, redirect, urgent, quote, book, pay, organization, handoff, link |
| Report Explainer | The values in the customer's confirmed lab report | The confirmed report, medical sources, policies | answer, clarify, redirect, urgent, handoff |

The Report Explainer has no sales tools: an answer from it that names or prices a package is withheld (`role_violation`). After a report is confirmed in the chat, the explanation always comes from the role that reads the report, whatever the planner chose.

## Agents and model calls

| Agent | Job | Output contract |
|---|---|---|
| Planner | Choose the action, the role, the search terms (test names only, never values or identity) and a one-sentence reason shown to the customer | JSON `Plan` |
| Writer (Advisor or Explainer) | Write the answer from the supplied evidence, cite sources inline as `[source-id]`, copy report values exactly | JSON `Answer` |
| Reviewer | Check the draft against the evidence: supported, values preserved, within scope | JSON `EvidenceReview` (three booleans) |
| Safety check | Classify the message, the answer and any uploaded report | One label (System One) or `safe` / `unsafe Sx` (Llama Guard) |
| Report reader | Read a report image into rows of name, value, unit, printed range and flag | JSON `Extraction` |

All agents share one language model unless a manager gives one its own provider on `/staff → AI providers` (see [ai-providers.md](ai-providers.md)).

## Must do

| # | Rule | How it is enforced |
|---|---|---|
| 1 | Answer only from the catalog, the policies and the 58 reviewed sources, and show the sources | Prompt; a question that names a test is always searched; inline citations must exist in the retrieved evidence (`validate_answer`); the reviewer checks support |
| 2 | Reply in the customer's language (Thai or English) | Prompt; the planner records the language |
| 3 | Ask back when details are missing (center, date, time, budget) | Prompt; a booking preview without a valid center, date and time becomes a clarifying question (code) |
| 4 | Show bookings, quotations, payments and hand-offs as previews the customer confirms | Code: actions are stored as previews that expire after 10 minutes and run only on `POST /confirm` |
| 5 | Keep every report value, unit and range exactly as printed | Code: every report value an answer points to must match the confirmed row as printed (spacing aside) or the answer is withheld; the value cards always show the server's row |
| 6 | Compare a value only with the range printed on the same report | Code: the status (within, above, below) is computed in Python, never by the model |
| 7 | Advise prompt professional care for critical values or severe symptoms | Prompt (`urgent` action); code adds a fixed advice line when the report prints a critical flag (HH, LL) and the answer lacks one |
| 8 | Hand over to staff on request or when out of scope | `handoff` action; "Ask our team" on every answer |
| 9 | Explain a report only after the customer confirms the values | Code: unconfirmed reports never enter the context; one click confirms in the chat |
| 10 | Show what was checked | The steps stream live and stay under "How this was checked" |

## Must not do

| # | Rule | How it is enforced |
|---|---|---|
| 1 | Invent prices, packages, policies, result times or preparation rules | Prompt; business data comes only from the JSON files; code checks every amount against catalog and plan prices, asks the writer to fix it once, then withholds the answer |
| 2 | Diagnose, prescribe, give a dose or change a treatment | Prompt; safety check (`medical_advice` label); reviewer scope check |
| 3 | Grant a discount or a refund | Policy text; quotes are recomputed by the server from the catalog; refunds are staff actions |
| 4 | Book or charge before the customer confirms | Code: previews only; staff confirm every appointment |
| 5 | Sell a package because a value is abnormal | The planner sees only the test names in a report, never the values; the Explainer has no sales tools; a follow-up check is offered only when the customer asks |
| 6 | Reveal other customers' data, the system prompt or API keys | Code: every record is owner-scoped; keys are encrypted and never returned; safety check (`privacy`, `prompt_attack`) |
| 7 | Follow instructions hidden in a message, a report image or the chat history | Pattern check plus safety check on messages and documents; all supplied text is labelled untrusted data |
| 8 | Show links, images or HTML from the model | Code: links, images and HTML in an answer are removed before it is shown (a known citation stays); the browser also sanitizes Markdown |
| 9 | Use public reference ranges instead of the printed one | Prompt; status computed from the printed range only |
| 10 | Guess an unreadable value | Reader prompt; the customer can edit the values before confirming |

## Actions

| Action | Effect | Who completes it |
|---|---|---|
| answer, clarify, redirect, urgent | A reply only | — |
| quote | Package preview with server-computed price | Customer keeps it |
| book | Appointment request preview (center, date, time) | Customer sends it; staff confirm or decline |
| pay | Test payment preview for a confirmed booking | Customer opens the payment simulator |
| organization, handoff | Request to staff; the assistant pauses | Staff reply in the inbox |
| link | LINE account-link invitation | Customer accepts while signed in |

## Language and tone

Short, plain answers in the customer's language; one useful follow-up question when needed; professional terms and units kept as printed; a short reminder that the answer is not a diagnosis where it applies.
