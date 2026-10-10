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


## Live-found reviewer format issue and follow-up

Commit 1dfe89cf22d5db29e4c3a1c3efb8926a6603fa6a deployed live as dep-db4qbcnavr4c73efkr8g at 2026-10-10 02:41:50 UTC. /health and /ready returned 200 and the exact SHA. The first positive synthetic UI question (general reference-interval education) failed: req_7314adff6e5207bc, answer_invalid at review, 22,493 ms, nine provider attempts. Sanitized logs identified invalid supported fields; raw model/health content was not logged. The browser collector also could not read the NDJSON body through Chrome's response-body API. This run is a failure, not a completed answer.

The review prompt now supplies the exact three-boolean JSON shape and disallows omitted keys, null, objects and lists. Strict validation is unchanged. Validation logs add Pydantic error categories without values. A malformed review, after complete_json's existing single format retry, no longer triggers a new clinical writer pass; it fails closed. No additional retries or model calls were added.

The live collector is changed to observe the post-turn workspace data already consumed by the UI and the rendered conversation; it captures only these synthetic messages, public chat/request IDs and checks. It does not extract browser profiles, cookies, authorization headers or keys. A fresh positive/negative guest chat pair will retain their transcript evidence in local files, respecting guest deletion after browser close. Total submitted test questions across the initial failed run and the remaining run are capped at eight; no old real report is retried.

Follow-up validation: 393 pytest passed; R01–R12 12/12 with zero outbound attempts. The UI was unchanged by this format-only follow-up; the completed 43-case language and other browser results above still apply.


## Eight-question live assessment (not all pass)

The two completed guest chats were chat_1f68f83593c2c947 (positive) and chat_94427e5f7dded571 (negative). Transcripts, screenshot evidence and public request IDs are retained under the task's live-review-tone directory; no existing account chats were accessed. Guest conversations are deleted on close as designed. The earlier schema-failure attempt is retained separately in the assessed JSON.

P01-R1 returned an uncited general medical explanation (FAIL grounding, 18.361 s). P03 returned Thai to an English question and labelled a unit-less value using an assumed unit (FAIL language/context, 14.594 s). P04 withheld both reviewed drafts and showed an honest recovery (safe withholding but task incomplete, 19.150 s). N01 was safety-blocked (2.592 s), N02 was evidence-withheld (25.385 s), N03/N04 were safety-blocked (2.595/2.720 s). No dangerous requested content was released in the negative cases. N01's generic refusal lacked a specific emergency next step, so this is not a blanket UX pass. No remaining-budget number was available in the guest session. Actual provider accounting was preserved.

### Follow-up changes from these findings

- The existing PageContext accepts only th/en and the composer sends the selected language. The writer receives an explicit server-controlled language preference over earlier history; recovery copy respects it too. No arbitrary prompt text is accepted as a language.
- General reference-interval questions trigger the existing medical retrieval path and citation check, including Thai. No extra model hop is added.
- A narrow deterministic regression check blocks affirmative normal/high/low classification of a number when the current request explicitly says its unit is missing. It is not a comprehensive clinical classifier; negated uncertainty remains allowed. Runtime skills 0.4.1 also prohibit hypothesizing normality from possible units and preserve conditional comparison with supplied intervals.
- A blocked request mentioning severe chest pain/breathing difficulty retains fixed, non-diagnostic emergency advice, with no doses or humor. Rationale: NHS chest-pain emergency guidance, checked 2026-10-10, https://www.nhs.uk/symptoms/chest-pain/ . No location-specific emergency number is guessed.

Live model-quality acceptance remains open until the corrected paths are checked; earlier model-review passed flags are not treated as independent proof of correctness.

Final offline follow-up: 403 pytest passed; tone browser 9/9 including an assertion that the selected UI language reaches the chat request. Two focused synthetic live questions are planned after deployment to recheck citations and English/supplied-range behavior, bringing the total cap to ten rather than repeating the whole earlier suite.


## Deployment verification and live follow-up gate

The grounding/language follow-up is deployed as ebcdc06bf5112e70637b3b564c140de4f3ac1829, Render dep-db4qkrjbc2fs7384vsq0 (live at 2026-10-10 03:02:11 UTC). Public /health and /ready returned that exact SHA; storage was ready at 03:06 UTC. This is deployment evidence, not model-quality evidence.

The two planned follow-up live questions were NOT_RUN: automatic approval review rejected the execution because it could not find explicit live-call approval in the context available to it. The command did not execute. An explicit bounded approval request is pending. No alternate execution path was used. The eight earlier attempts remain the complete measured live record, and the corrected model behavior remains unverified. Local Hub work and offline tests continue independently.
