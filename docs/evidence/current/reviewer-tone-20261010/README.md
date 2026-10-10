# Reviewer recovery and conversation tone — 2026-10-10

Base: main f2194876200223ba1119ea8a15b9f6273709d916. Results below were measured on this working tree before commit. No real patient data was used.

## Diagnosis and changes

The real request req_7dd2467d9f343f12 ended in review_failed after one rewrite (2026-10-10 02:02:47 UTC). Its outer HTTP 200 was an NDJSON transport response, not a successful explanation. Historical logs cannot identify which review boolean failed; the specific medical draft was not inspected or replayed. This does not prove that the original rejection was false.

Code inspection found that the writer received the authorized conversation history while the reviewer did not. Both now receive the same bounded, permission-filtered history. The reviewer distinguishes confirmed report rows, cited source facts, explicitly conditional examples, and nonclinical clarification/refusal. Faithful paraphrases and bounded analogies are allowed; unsupported clinical claims, changed values, diagnoses/doses, unsafe instructions, and inadequate citations remain rejected.

After one rewrite, a rejected draft is discarded. A local nonclinical response admits the verification failure, states that it does not mean the user omitted information, and offers a general next step or staff help. No rejected reply, observation, citation, action, or sales offer is released. Critical-report referral is retained. The output Safety Guard still runs. Provider failures and deterministic validation failures remain failures; there is no fail-open review path. The receipt reports independent_review=withheld and answer_mode=verification_recovery rather than a passed review.

Review logs contain only request ID, stage, attempt, and fixed codes (evidence_not_supported, report_values_not_preserved, outside_allowed_scope). No reviewer prose, user text or report value is logged by this change.

Company Harness runtime skills 0.4.0 improve useful detail, context-aware clarification, plain explanation, bounded analogy and appropriate tone in Thai/English. A user can decline personal details. No new agent hop, model call, tool, service or credential is introduced. Clinical validation and native/lay-reader review remain pending.

## Response tone

The chat composer offers Professional, Normal (default), and Playful. The existing chat PATCH endpoint validates a strict enum, ownership and CSRF; arbitrary instructions cannot become a tone. The preference is scoped to the current conversation. Existing member archives retain it; guest state stays in the existing server memory store and never becomes browser history/storage. New guest chats/reloads return to Normal. Changing tone preserves the draft and is disabled during an active turn. Facts, exact values, citations, uncertainty and safety thresholds are invariant; humor is suppressed for alarming findings, severe symptoms, emergencies and sensitive suffering.

## Measured offline validation

- pytest: 391 passed, one upstream TestClient deprecation warning.
- Business UI: 36/36, real UI/routes/storage/permissions; model/OCR doubles.
- Tone UI: 9/9 across 390/768/1440, TH/EN labels, all choices, draft preservation, two turns, new chat and guest reload, no tone/history browser storage; screenshots in test-results/review-tone-browser.
- Recovery browser: 10/10; no page errors.
- R01–R12: 12/12, zero outbound connection attempts. This is fault-injection evidence, not an uptime SLA or model-quality claim.
- Full language audit: 43/43 at 390/768/1440 in TH/EN, including in-place switching and the corrected report-date view; see i18n-final.json.

The first full pytest run had 389 passes and one stale version assertion expecting runtime skills 0.3. The first R01–R12 run had 5/12 because the offline provider selected stages by the old reviewer prompt prefix, preventing the intended faults from reaching review/output guard. The first language audit setup failed for the same fixture reason. The fixture now recognizes the current prompt; a regression locks this dispatch. Failed runs are retained. The initial tone browser run reached every layout but used the hidden mobile New chat button on desktop; the runner now uses the visible desktop control. No product safety assertion was removed to obtain passing results.

## Live and release status

Pending at this pre-release checkpoint: commit/push/deploy and bounded synthetic positive/negative UI conversations. Local scripted tests do not establish actual model quality or reduction in over-rejection. No live calls, credential changes, budget resets or paid-plan changes occurred during offline validation. Previously confirmed coursework OCR remains 15/20 on all profiles (all five images failed); these checks do not close that gap. Owner/video/coursework live-result placeholders are not invented.
