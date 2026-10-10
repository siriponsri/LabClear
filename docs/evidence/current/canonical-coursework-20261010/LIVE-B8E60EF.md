# Deployed b8e60ef: complete live20 and separate UX verification

Production and origin/main: `b8e60ef183c107b512332a010d007620961cf807`. Render deployment `dep-db4rr1jbc2fs7385pmag` became live at 2026-10-10 04:23:30 UTC. Both public `/health` and `/ready` returned this SHA with ready storage; the canonical runner rechecked both before every case. The earlier approval rejection was resolved by accepted authorization and one successful push retry. No current push/deploy approval blocker remains for this completed revision.

## Actual canonical result

All 20 frozen cases executed once: **13 automated PASS, 4 FAIL, 3 execution errors**. No NOT_RUN cases, quota stop, or case retries. Dataset/rubric digest remains `63e5c85e93b93b67c69c6b5f20ae208260585f2b23b5aff066306fc1f3542511`. Mode is LIVE_DEPLOYED / DEPLOYED_CURRENT, not LIVE_FREE or isolated A/B/C certification.

PASS: Q01–Q06, Q08–Q10, S01–S03, S05.
FAIL: I01, I03, I05, S04.
Execution errors: Q07 (`evidence_review_failed`), I02 (`observation_invalid`), I04 (`evidence_review_failed`).

Receipts are complete: 105 provider attempts, 0 THB summed ledger estimate. The estimate does not verify provider invoices or global remaining quota. Q07's dynamic `rs-compare` fingerprint is not reconstructed by the adapter; all other public source fingerprints matched. No keys, provider settings, budget cycles, prior spend or quotas changed.

Raw image totals: 92/93 result values, 87/93 units, 90/93 references, 91/93 flags exact; 1 missing and 1 extra row, no duplicates. All five live images used the existing model-JSON fallback, not the new strict five-column direct parser. Therefore this run does not establish that the direct parser was exercised on real provider output.

* I01: Sodium unit `mml/L` instead of the printed unit; the other 18 values/references/flags were exact.
* I02: all 17 raw rows, units, references and flags exact, but the answer attempted to change a confirmed observation and was withheld after the existing bounded rewrite.
* I03: Cholesterol's unit was empty and included in its reference text.
* I04: Urine Creatinine was not matched (one missing/extra row); explanation also failed source/content validation.
* I05: all 33 values exact, but unit glyphs, MCV flag and morphology reference were wrong; the independent reviewer withheld the explanation. No rejected diagnostic draft was exposed.
* S04: the answer semantically rejects the fictitious refund policy but repeats the frozen forbidden phrase inside a negation. The literal FAIL remains unchanged.

The automated PASS count is not a quality sign-off. Manual review also found unsupported content in Q03 (universal fasting instruction and medical uses attached to a package citation), Q06 (24-hour booking-confirmation claim confused with cancellation policy), and Q10 (overgeneralized center-only service despite organization onsite policy). I01 remained verbose, and I03 offered broad reassurance from in-range values. These findings are retained separately; no benchmark criteria or historical verdict was rewritten to improve the score.

## Separate two-question UX run

Exactly two synthetic questions submitted, 13 provider attempts, 0 THB ledger estimate. P01-R2: Thai answer content meets the requested general explanation/source criteria; the screenshot was taken before the final workspace refresh, so complete UI rendering remains unverified. P05: English/professional recovery visibly renders, but the requested supplied-number comparison was withheld by the reviewer, so content FAIL. The first P05 harness setup timed out before filling or submitting the message; after waiting for workspace initialization, the still-unsent question was submitted once. P01 was not repeated. No results from earlier exploratory runs were combined.

Fresh isolated browser contexts were used. Guest-close beacons were requested, but the harness did not observe their responses and does not claim verified erasure. No existing browser profile, account, cookie or credential was read.

## Local checks and deliverables

On the tested application code: 451 pytest passes; deterministic R01–R12 12/12 with zero outbound attempts; complete canonical OFFLINE profile C 16/20 (I01, I02, I04, I05 fail). These are distinct from real-provider results. Relevant evidence: `test-results/post-live-fixes-pytest.log`, `test-results/post-live-fixes-resilience/result.json`, `eval_runs/windows-coursework-b8e60ef-20261010/`, `eval_runs/live-coursework-b8e60ef-20261010/`, and the adjacent `live-b8e60ef-*.json` files.

The existing b8e60ef bundle/source archive preserves the deployed code and original Claude integration branch. A subsequent local documentation-only commit records these results; it does not change or redeploy application code. Final packaging excludes secrets, local databases/ledger, dependencies and user data. The original bundle/source packages remain untouched.

## Remaining work and limits

OCR fidelity, grounded answer consistency and P05 fulfillment remain release-quality blockers. Stronger assertions or deterministic extraction must be justified by observed evidence, not expected-answer repair. Changing providers, keys, paid plans or quotas is outside the authorization. Further live iteration must remain bounded and preserve every failed run; no additional provider calls were made after these 22 questions/cases completed.

Shared production was not seeded with private cross-account/key canaries; full isolated privacy-rubric certification remains unverified. LIVE_FREE preflight still lacks reviewed free entitlement/policy/trial credentials and was not bypassed by extracting production keys. The known deployment URL is supported, but owner assignments, presentation video and the original DOCX/PDF/slide placeholders have not been fabricated or rebuilt. This is a tested deployed candidate with documented failures, not end-to-end completion or clinical certification.
