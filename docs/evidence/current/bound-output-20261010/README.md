# Local safety containment after deployed 7343d7a

Local candidate on main, based on e6b41da. **Not pushed or deployed.** Production remains
7343d7a with its measured 12 PASS / 5 FAIL / 3 errors; no new live requests were made here.
The I02 explanation exposed unsupported personal disease staging and a numeric retesting
schedule, despite passing model checks. [Exact exposure and proposed mitigation](I02-EXPOSURE.md)
distinguishes delivered API content from withheld/error cases and states the screenshot limit.

## Implemented controls

- Confirmed report explanations retain every old draft validation and role check, then replace
  free clinical prose with deterministic text bound to selected immutable row IDs. Exact printed
  cells, conservative interval comparisons, uncertainty, general-source links and critical notices
  remain useful. A novel unsafe paraphrase cannot survive merely by evading a phrase regex.
- Duplicate names, flags inside references, conflicting flags and unit discrepancies prevent
  confident comparisons. Human confirmation cannot silently restore an uncertain status; values,
  units, ranges and printed flags themselves are never repaired. The full table remains available.
- HTML fallback structuring must match distinct cells on one unused source row. Provable shifted
  references, changed unit glyphs and reused rows fail before publication. Unknown layouts remain
  unverified and require checking against the original; both document guards remain.
- Refund/home-service answers use whole published policy fields, preserving their actual source
  language. A reviewer rejection still reports withheld even when useful original policy is shown;
  the output guard can still block it. No hardcoded expected percentage, negated forbidden phrase
  workaround, invented translation or service-time promise is substituted.
- Thai/English staging variants and numeric personal retesting schedules have additional bounded
  checks. Structural rendering is the primary control, not a claim of complete regex detection.
- Q02 iApp 502 remains a bounded upstream failure. No safety bypass, retry loop, new provider,
  larger budget or new credential was introduced. R02/R05/R12 continue to exercise failure,
  cancellation, accounting and privacy contracts.

All baseline tests, frozen inputs and scoring rules are unchanged. The 41 new regressions include
the actual synthetic I02 reply, API/persistence exposure, bilingual names, duplicates, cross-row
references, superscripts, comparators, novel clinical inference, policy negation/source changes,
review withholding, guard rejection and confirmation-state behavior. No approved landing, fonts,
Thai default, database schema or single-service architecture changed.

## Completed local validation

| Check | Actual result | Evidence |
|---|---|---|
| Complete pytest, final implementation | 531 passed; one existing Starlette/httpx deprecation warning | [log](pytest-final.log) |
| R01–R12, final seed 20261013 | 12/12, zero skipped and zero outbound connection attempts | [result](resilience-final.json) |
| Earlier R01–R12, seed 20261012 | 12/12 before the final role/confirmation fixes | [historical result](resilience-before-final-role-confirmation.json) |
| Business browser UAT, final implementation | 36/36 | [result](business-uat-final.json) |
| Exact TH/EN rendering in real UI | 2/2, no JS errors or page overflow; decimals, bilingual names, exponent and comparator glyphs visible | [result](render-results.json), [Thai](render-th.png), [English](render-en.png) |
| Frozen OFFLINE coursework C, raw confirmation | 20/20 completed; 16 PASS, 4 FAIL, 0 errors | [score](offline20-score.json), [summary](offline20-summary.json), [run](offline20-run.json) |

The first full pytest run had 529 passed/1 failed: rendering removed a forbidden sales draft
before the Explainer role rejection could run. The implementation now checks draft role rules
before rendering as well as afterward. The original test was preserved, and the complete final
suite passed. [Initial failure retained](pytest-first-regression.log).

Browser UAT uses existing model/OCR doubles; the extra TH/EN visual check injects actual
server-rendered synthetic replies into a local workspace response. It verifies UI rendering,
not a live model conversation. The real API/persistence boundary is covered by the pytest
regression. The visual helper initially hit a Windows temporary-cwd cleanup error after writing
its fixture; it was corrected and regenerated successfully. No application change was needed.

## Remaining gaps and provenance

Offline failures are **I01, I02, I04, I05**, with 85/93 values,
78/93 units, 70/93 references
and 86/93 flags exact. This is the existing Tesseract-backed
stand-in, not Typhoon. It remains incomplete. The unchanged harness recorded 21
attempts and 1 retry; its synthetic ledger estimates are simulated and are not
actual spend. No production ledger, prior spend, quota, key, provider or budget cycle was read
or changed. The frozen digest remains
`63e5c85e93b93b67c69c6b5f20ae208260585f2b23b5aff066306fc1f3542511`.

All five historical live734 images used model_json fallback; their raw OCR transcription was
not retained. New adversarial fixtures reproduce the observed failure patterns, not an exact
replay of unavailable OCR bytes. Same-row binding cannot detect OCR errors already present in
source cells, infer ambiguous column semantics or certify that every printed row was recognized.
Unknown layouts continue to require careful confirmation. Manual correction does not certify a
personal clinical interpretation. Free clinical elaboration is deliberately curtailed in the
confirmed-report role; unrelated general educational/no-report conversations and other roles
still depend on their existing grounding/review controls. Q03 fasting and Q07 confirmation-time
semantic errors remain known risks outside the narrow exact-policy rendering introduced here.

Model reviewer false rejections, provider/OCR variation and a fresh final-candidate live score
remain unproven. LIVE_FREE entitlement/policy/key approval and missing owner/video/project-report
data remain blocked; no owner or result was invented. The DOCX/PDF/slide deliverables were not
regenerated to imply those missing facts were complete. Existing source artifacts are preserved.

Artifact commit labels correctly show e6b41da plus uncommitted implementation. [Source hashes](tested-files.json)
bind the final tested code to the resulting local candidate without changing those historical
labels. No new bundle was prepared. A new exact-SHA deployment and further live benchmark need
separate approval; this phase ends with a tested local safety candidate, not end-to-end acceptance.
