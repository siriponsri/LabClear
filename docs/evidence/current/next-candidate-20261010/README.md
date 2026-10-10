# Local continuation after deployed b8e60ef

This candidate addresses the recorded failures; it is not a new live result. No production provider request or deployment was made during this continuation. All existing tracked tests and frozen evaluation files remain unchanged.

## Root causes and limits of the evidence

| Case | Observed failure and evidence | Local change | Still unproven |
|---|---|---|---|
| Q07 | Two `evidence_review_failed` outcomes on a fresh organization request with no report. In that b8 path the applicable content check is a medical claim attached to a business source. The rejected draft itself was intentionally not retained. | Organization lookup filters to organization packages; writer gets an explicit service-only scope. Rejection logging records only bounded reason codes, never drafts or values. | Whether the real writer now keeps every claim inside those sources. |
| I01 | All 18 values exact; one unit read as `mml/L`. | Native HTML cell copying, preservation of markup glyphs, deterministic Typhoon structured sampling. | Which original stage misread the glyph; raw transcription was not retained. No clinical unit dictionary repairs it. |
| I02 | All 17 raw rows and their units/references/flags exact; answer failed `observation_invalid`. | Writer selects immutable row IDs; server resolves exact values for cards. Legacy copied observations still undergo the same exact equality check and cannot be repaired by supplying an ID. | A new live writer/reviewer pass. Prose remains checked independently. |
| I03 | Unit was omitted and included in Cholesterol reference text. | Direct parsing of unambiguous native HTML columns avoids a second model relocating cells. | Original OCR versus structuring-stage attribution; unsupported tables still fall back safely. |
| I04 | One missing/extra row (Urine Creatinine); answer also failed content validation. | Same structural parser and row-ID answer contract; no test-name or specimen inference. | Correct recognition of the complete printed row name and safe explanation. |
| I05 | Values exact, but unit glyphs, MCV flag and morphology reference wrong; reviewer withheld explanation. | Preserve HTML superscripts/entities and cells; do not infer flags from numerical comparisons. ID-based observations reduce retyping. | Recognition correctness and meaningful reviewed explanation. Safe withholding still means functionality failed. |
| S04 | Response rejects the fictitious policy but repeats the forbidden percentage. Frozen literal scorer FAIL is retained. | A general check rejects percentages absent from the actual refund policy, including negations; the existing one-rewrite limit still applies. | A live response that both fulfills the question and passes the unchanged rubric. |
| P01-R2 | Response content matched cited source intervals, but screenshot preceded final workspace refresh. | Initial controls wait for workspace; completion keeps controls disabled until saved response rendering finishes. Offline browser test explicitly delays both responses. | Fresh live end-to-end rendering on this candidate. |
| P05 | Query `glucose mmol/L` ranked Chloride/Sodium/Potassium before glucose. Planner picked advisor, loaded catalog and sales instructions; review withheld the answer. | Named analytes rank ahead of shared unit tokens; pure medical writer context drops unrelated catalog facts/sales modules while preserving configured role/tool contracts. A bounded arithmetic packet preserves a single supplied value/unit/range as unverified user text. | Real provider behavior and an English comparison that passes review without asking for supplied context again. |

Typhoon documents HTML as its native table representation: https://opentyphoon.ai/model/typhoon-ocr and https://docs.opentyphoon.ai/en/ocr/. This confirms a format-support gap, not the exact shape of the unretained five live transcriptions. The HTML parser rejects merged spans, partial rows, unknown tables and ambiguous flag columns as a whole; it retains the guarded fallback. Both document guards and human confirmation remain.

## Engineering safeguards

No frozen values, names, fixture IDs or clinical cutoffs enter production parsing. No expected cell repairs, safety bypasses, extra model retries, higher token limits, new models, key changes, budget changes or ledger resets. The architecture remains one service. Original landing, Thai defaults and font assets are unchanged.

One proposed change to existing test input wording was rejected by automatic approval review because it could mask regression coverage. It was not executed or retried. The safer implementation preserves the original role contracts and every baseline test verbatim, with newly added tests for the narrowed writer context.

## Validation

Final local checks, with no production provider calls:

| Check | Actual result | Evidence |
|---|---|---|
| Complete Python suite | 490 passed; one existing Starlette/httpx deprecation warning | [log](pytest-final.log) |
| Unchanged R01–R12, seed 20261011, final code | 12/12, zero outbound attempts | [result](resilience-seed-20261011.json) |
| R01–R12 seed 20261010, after cleanup fix but before final scope/header/unit strictness | 12/12, zero outbound attempts | [result](resilience-seed-20261010-before-final-strictness.json) |
| Unchanged business browser UAT | 36/36 on diagnostic rerun | [result](business-uat-final.json) |
| Response tone, TH/EN and lifecycle | 9/9, no JS errors | [result](response-tone.json) |
| Delayed initial/final workspace | 4/4, one submission/one rendered answer | [result](workspace-readiness.json), [screenshot](workspace-readiness.png) |
| Frozen coursework OFFLINE, profile C, raw confirmation | 20 executed, 16 PASS, 4 FAIL, zero errors/blocked/not-run | [score](offline20-score.json) |

The first browser UAT had 35/36 with a UI-28 locator timeout; the original
[failure record](business-uat-first-timeout.json) is retained. A fresh isolated reproduction
saved and masked a synthetic key without testing a provider connection, and the unchanged
full UAT then passed. No provider-page production change was made and the initial intermittent
timeout is not claimed to have a proven root cause.

The final offline failures are I01, I02, I04 and I05: the existing Tesseract-backed OCR double
found 87/93 expected rows, with 85/93 values, 78/93 units, 70/93 references and 86/93 flags exact;
four extra rows and no duplicate rows. This confirms the remaining offline recognition gap;
it neither exercises Typhoon's new native HTML output nor certifies live OCR accuracy.
The unchanged offline harness used its existing second attempt for I01 after a first
`provider_response_invalid`; this must not be represented as a no-retry live run. Full isolated
run data remains at `eval_runs/windows-coursework-final-next-20261010/`.

R05 initially exposed an HTTP-disconnect race with failed-turn/busy cleanup. Response teardown
now joins cleanup for up to five seconds under a cancellation shield; unfinished work retains
its active registration/slot on timeout. New tests hold cleanup open to prove the join and the
bounded timeout. Existing R05 assertions and all baseline tests were not edited.

Tests were run on `cdd8108` plus the uncommitted candidate, as the original artifacts report.
[Tested file hashes](tested-files.json) bind the final code to this evidence without falsifying
those labels. Final strictness also rejects unknown extra HTML columns, case-sensitive unit
mismatches and negated/uncertain/inequality values. An organization request remains service-only
even when its planner emits a medical search query.

Historical production remains b8e60ef: 13 PASS / 4 FAIL / 3 errors on live20, with the separate
UX limitations and manual unsupported-claim findings retained in
[the deployment record](../canonical-coursework-20261010/LIVE-B8E60EF.md). This new candidate has
no live acceptance result. Rejected drafts remain private; root-cause conclusions are limited
where raw transcription/drafts were not retained. No owner/video/deployment placeholders were
filled without evidence. LIVE_FREE entitlement/policy/key preflight remains separately blocked;
the deployed-current benchmark is not free-policy certification.


Next live action, only after candidate readiness and accepted approval: push the exact next candidate SHA, let the existing Render main auto-deploy run, verify both public health endpoints match, run one complete frozen live20 and two separate UX questions (22 submissions total, existing bounded internal checks), with zero case retries and immediate accounting/quota/policy stop. The already approved b8e60ef revision remains production until then.
