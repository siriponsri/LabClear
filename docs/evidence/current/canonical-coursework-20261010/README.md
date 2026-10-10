# Canonical coursework benchmark continuation — 2026-10-10

The frozen 1.0.0 dataset and rubric are unchanged: Q01–Q10, I01–I05, S01–S05. Dataset digest: `63e5c85e93b93b67c69c6b5f20ae208260585f2b23b5aff066306fc1f3542511`. All five images were visually inspected: DEMO reports with fictional people, not real health records. Expected values are read by the scorer only.

## Known baseline and scope

`eval_runs/windows-coursework-baseline-20261010` completed all 20 offline cases: 15 PASS, I01–I05 FAIL. This does not establish live-provider accuracy. Earlier eight reviewer/tone requests are a separate exploratory run, not coursework20. Two proposed later tone retests were not executed after an approval rejection. The user's subsequent authorization covers the complete canonical live benchmark with the existing providers and unchanged budgets; it does not authorize new credentials, paid plans or budget resets.

## Changes

* Workflow terminal events now include a receipt containing the existing ledger's per-request estimated settlement, attempt count, and fingerprints of public writer evidence. No prompts, report values, private source IDs, credentials, global balance or prior spend are exposed. The ledger calculation, reservation and idempotent settlement rules are unchanged.
* `scripts/benchmark_deployed.py` runs all twenty frozen cases through fresh guests on the deployed service. It requires the exact deployment SHA and explicit benchmark authorization, stops on missing receipts, disabled accounting, quota/policy failures or a conservative 10 THB task estimate ceiling, and performs no automatic case retries. It never reads keys. Hash-matched public evidence is reconstructed for the original scorer; mismatches remain unverified.
* This adapter is labelled **LIVE_DEPLOYED**, not LIVE_FREE or A/B/C. Shared deployment does not seed private customer/key canaries. Even 20 automated passes would not certify the complete isolated-trial rubric or clinical accuracy. The existing LIVE_FREE preflight still requires reviewed free entitlement and trial credentials; it was not bypassed.
* The image scorer now fails an explanation withheld by independent review. A recovery message is not a completed explanation. Frozen cases, expected labels, row exactness and assertions were not relaxed.
* The offline OCR double supports the upstream-recommended Windows tesserocr wheel, preserves column spacing and full printed references, and separates a visibly attached numeric result from a label. It does not repair uncertain values from gold data or clinical knowledge. Remaining recognition errors must fail.

## Reproducible checks and artifacts

Run `python scripts/offline_check.py pytest -q`, the offline R01–R12 suite, and `python scripts/benchmark_labclear.py run --mode offline --suite coursework --profile C --run-id <unique>`. Run deterministic scoring with UTF-8 enabled on Windows (`python -X utf8 scripts/score_benchmark.py eval_runs/<id> --out <file>`). Do not combine focused passes from different revisions.

Final candidate results are saved under `test-results/canonical-candidate-*` and uniquely named `eval_runs/` directories. Each deployed run retains exact SHA, unchanged dataset hashes, raw outcomes, request IDs, cost estimates, errors, not-run cases, and coverage limitations. Results are local evidence; this document deliberately does not claim an unexecuted final pass.

## Windows OCR dependency provenance

Installed into `.venv` only, not system-wide. Upstream `sirfz/tesserocr` links the `simonflueckiger/tesserocr-windows_build` Windows wheels.

* Wheel: `tesserocr-2.11.0-cp312-cp312-win_amd64.whl`, release `tesserocr-v2.11.0-tesseract-5.5.3`.
* SHA256, matched GitHub release asset digest: `74604b65547b6e988dcdab0d6d7366964ec588a9fd28a526b2ca9b9f8b8d3dea`.
* Engine: Tesseract 5.5.3 / Leptonica 1.87.0.
* English model: `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/eng.traineddata`, downloaded 2026-10-10; SHA256 `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`. The content hash pins the model; the moving upstream branch is not a release pin.
* Dependencies/model are not included in source packages or Git bundles.

Deployment URL is known; owner names, presentation video, full LIVE_FREE 10/5/5 results and complete isolated canary coverage remain unsupported. Do not replace yellow report placeholders with guessed values. The original DOCX/PDF/slides have not been rebuilt by this continuation.
