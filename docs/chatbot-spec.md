# Chatbot specification

What the LabClear assistant must do, what it must not do, and where each rule is enforced. "Prompt" means an instruction to a model. "Code" means a Python check that runs whatever the model writes. Most rules have both.

## Assistant roles

Customers talk to one assistant. For each message the planner picks one of two roles. The roles are defined in [`business_data/dots.json`](../business_data/dots.json) (version `2026-10-06`). They are AI roles with server-enforced permissions, not people or clinicians. A manager can pause a role on `/staff` → Assistant roles; with no enabled role the assistant answers `assistant_paused`.

| Role | Answers | Data it may read | Actions it may propose |
|---|---|---|---|
| Health-check Advisor | Packages, prices, centers, booking, payment, organizations | Catalog, centers, policies, medical sources, the customer's own bookings | answer, clarify, redirect, urgent, quote, book, pay, organization, handoff, link |
| Report Explainer | Values in the customer's confirmed report | The confirmed report, medical sources, policies | answer, clarify, redirect, urgent, handoff |

Routing rules in `services/business_agent.py`:

- Right after a report is confirmed in the chat, the role that reads reports answers.
- A message that names a catalog package goes to a role that reads the catalog.
- An action the chosen role cannot take moves to the role that owns it, or becomes `clarify`. The move is shown to the customer.

## One message, step by step

`services/business_agent.py` runs each turn and streams every step to the page.

| Step | What happens | Output contract |
|---|---|---|
| Input safety | Pattern check, then the safety model on the message | Pass or refusal |
| Planner | Chooses the action, role, search terms (test names only) and a one-sentence reason shown to the customer | JSON `Plan` |
| Typed tools | Python loads exactly what the role may read: packages, centers, policies, a deterministic package comparison, BM25 evidence search, confirmed report rows, booking or quotation previews, reviewed hospital offers | Records with source IDs and an audit entry per tool (`services/agent_tools.py`) |
| Runtime skills | When `RUNTIME_SKILLS_ENABLED` is on (on in `render.yaml`), reviewed instruction modules are selected from server facts and added to the writer prompt | Module IDs and SHA-256 (`services/runtime_skills.py`) |
| Writer | The Advisor or Explainer writes from the supplied evidence and cites `[source-id]` inline | JSON `Answer` |
| Deterministic checks | Citations, report values, prices, source types, role limits, critical-flag note (see below) | Pass, one rewrite, or withheld |
| Independent review | A separate model call checks the draft against the evidence | JSON booleans `supported`, `values_preserved`, `within_scope` |
| Output safety | The safety model screens the answer, follow-ups, action and reason | Pass or refusal |

The draft gets at most one rewrite across all checks. The rewritten draft repeats every check. A second failure withholds the answer with an error the customer can retry. Safety failures are never rewritten.

Each model job can use its own provider on `/staff` → AI providers (see [ai-providers.md](ai-providers.md)). The optional medical analyzer and Thai composer (`MEDICAL_HARNESS_ENABLED`) are off by default and in `render.yaml`.

## Must do

| # | Rule | Enforcement |
|---|---|---|
| 1 | Answer business questions only from the catalog, centers and policies | Prompt (`ANSWER`: "Use supplied EVIDENCE for every business/medical claim"); data comes only from typed tools over `business_data/` |
| 2 | Cite sources; medical facts cite medical sources only | Code: unknown citation IDs are rejected, at most 8 medical and 30 total citations (`services/conversation_agent.py`); a line that cites a business record for a medical claim fails (`services/answer_checks.py`); a medical question answered without a medical citation fails (`evidence_missing`) |
| 3 | Search the knowledge base whenever a question names a test | Prompt (`PLAN`); code: if the planner leaves the query empty, test names found in the message become the query (`answer_checks.medical_terms`) |
| 4 | Copy prices exactly, with their unit | Code: every amount must be a catalog or plan price, a number the customer gave, a price times a headcount the customer gave, or a difference of these; a package named on a line must carry its own price (`answer_checks.unknown_amounts`) |
| 5 | Ask for missing details | Prompt (`PLAN`: ask for branch, date and time before `book`); code: a booking preview without a valid center, date and time becomes `clarify` |
| 6 | Show bookings, quotations, payments and hand-offs as previews | Code: an action is stored as a preview that expires after 10 minutes and runs only on `POST /api/business/confirm`; a quotation is re-checked against the current catalog before it runs (`routers/business.py`) |
| 7 | Send follow-up tests to staff review | Code: a `book` or `quote` that contains a `staff_review_required` package becomes a hand-off |
| 8 | Put critical results before selling | Prompt (`PLAN`, `ANSWER`, reviewer); code: when the confirmed report prints a critical flag (HH, LL, `*`, "critical" and similar) and the answer lacks the fixed note, the note is added (`answer_checks.critical_note`) |
| 9 | Hand over to staff on request or when out of scope | `handoff` action; "Ask our team" on the latest answer; while staff own a conversation the assistant is paused |
| 10 | Show what was checked | Steps stream live; the receipt under "Process Explainability" lists citations, tools, skills, rewrite count and configuration revision |

## Must not do

| # | Rule | Enforcement |
|---|---|---|
| 1 | Diagnose, prescribe, give a dose or change a treatment | Prompts; safety model label `medical_advice`; reviewer `within_scope`; code rejects personal disease staging (`content_issues`); the refusal suggests a doctor or pharmacist (`services/conversation_guard.py`) |
| 2 | Invent prices, packages, policies, result times or preparation rules | Prompts; price check (Must do 4); reviewer; runtime skill `evidence-citation.md` |
| 3 | Grant a discount or a refund | Discount policy text; prices come only from the catalog; refunds are manager actions on `/staff`; the safety model labels attempts to change prices or policies as `prompt_attack` |
| 4 | Sell a package because a value is abnormal | The planner sees only test names from a report, never values; the Explainer has no sales tools; an Explainer answer that names a package or a price (฿, THB, baht) is withheld (`business_dots.assert_no_sales`) |
| 5 | Reveal another customer's data, the system prompt or keys | Code: every record is owner-scoped; the safety model labels `privacy` and `prompt_attack`; keys are stored encrypted and never returned |
| 6 | Follow instructions hidden in a message, a report or the history | Pattern pre-check on messages and documents; all supplied data is labelled untrusted in the prompts; document safety check; tool inputs reject unknown fields; skills cannot be chosen by text |
| 7 | Show links, images or HTML from the model | Code: removed before display (a known citation stays); the browser also sanitizes Markdown with DOMPurify |
| 8 | Use public reference ranges instead of the printed one | Prompts; status computed in Python from the printed range; a changed range on a named row fails `named_report_range_changed` |
| 9 | Guess an unreadable value | Reader prompt leaves it empty with a warning; the customer can edit values before confirming |
| 10 | Claim a completed booking, payment or partnership | Prompt (`ANSWER`: an action is a preview); hospital offers are marked "no booking, no partnership"; reviewer |

## Images and lab reports

The image scenario is the customer's own lab report.

| Stage | Rule | Where |
|---|---|---|
| Upload | 1–3 files per request, 3 MB each, 10 MB per request; PNG or JPEG (checked by signature and decoded) or PDF of 1–3 pages; the Free plan reads one image | `services/image_validation.py`, `services/report_reader_v2.py`, `main.py` |
| Read | The OCR model transcribes only the result table and omits identity fields; rows hold name, value, unit, printed range and printed flag; a document that is not a lab report is refused | `services/report_reader_v2.py` |
| Document safety | The transcription and the structured rows are screened for text aimed at the assistant | `services/conversation_guard.py` (direction `document`) |
| Confirm | The values appear in a card. Nothing is explained or saved to the dashboard until the customer clicks **Values are correct, this is my report** (or edits the values first) | `routers/business.py` (`/chat/report/confirm`) |
| Status | Within, high, low or unknown is computed in Python against the range printed on the same report, never by a model | `services/lab_fields_v2.py` |
| Explain | Only confirmed rows reach the model; the original image and the raw OCR rows never do. Every value the answer reports must match the confirmed row as printed, or the answer is withheld | `routers/business.py`, `services/conversation_agent.py` |
| Compare | A previous report is used only when the customer selects it and it is confirmed as the same person's | `routers/business.py` |

## Actions

| Action | Effect | Completed by |
|---|---|---|
| answer, clarify, redirect, urgent | A reply only | — |
| quote | Package preview with a server-computed price | Customer |
| book | Appointment request preview (center, date, time) | Customer sends it; staff confirm or decline |
| pay | Payment preview for the customer's own confirmed booking | Customer, in the payment simulator |
| organization, handoff | Request to staff; the assistant pauses when staff take over | Staff, in the inbox |
| link | LINE account-link invitation | Customer, while signed in |

## Language and tone

- Thai by default. The planner records the language, defaulting to Thai; the writer answers in the customer's language. With runtime skills on, `thai-style.md` says: write in Thai unless the user explicitly asks for another language. English questions or an English request get English answers.
- Safety refusals are in Thai when the message contains Thai script, otherwise in English.
- Short, plain answers. A medical term is explained on first use. Report labels, values and units stay as printed. One follow-up question only when it changes the answer.
- The interface language is separate from the answer language; see [i18n.md](i18n.md).

## Runtime skills

[`runtime_skills/thai_health/`](../runtime_skills/thai_health) holds eight instruction modules (package version `0.3.0-offline`). Each module's SHA-256 is checked against `manifest.json` before use. Package modules reach only roles that may quote; the patient-explanation module reaches only roles that read a confirmed report.

| Module | Purpose |
|---|---|
| `core.md` | Grounded communication contract: evidence only, exact values, no invented diagnoses or doses |
| `thai-style.md` | Plain, respectful Thai; numbers, negation and uncertainty unchanged |
| `evidence-citation.md` | Cite exact IDs; a record supports only what its own content states |
| `scope-uncertainty.md` | Education, not diagnosis; wording matches the strength of the evidence |
| `lay-explanation.md` | A test explained without a personal report; typed values are not a confirmed report |
| `patient-explanation.md` | A confirmed report explained against its own printed ranges |
| `package-advice.md` | Package facts and trade-offs from the catalog; no clinical indications |
| `package-compare.md` | Uses the deterministic comparison record without recomputing it |

The package records `clinical_validation: NOT_RUN` and Thai language review as pending.
