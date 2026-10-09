# Current evaluation evidence

All runs below are OFFLINE. Provider doubles, including an allow-all reviewer, test orchestration only. These results do not measure Typhoon or iApp quality. No new live model run has been completed.

| Run | Profile | Cases | Automated pass | Exact OCR values |
|---|---|---:|---:|---:|
| owner-coursework-A | A | 20 | 15 | 88/93 |
| owner-coursework-B2 | B | 20 | 15 | 88/93 |
| owner-coursework-C | C | 20 | 15 | 88/93 |
| owner-ocr-C | C | 12 | 0 | 217/252 |
| rc3-coursework-A | A | 20 | 15 | 88/93 |
| rc3-coursework-B | B | 20 | 15 | 88/93 |
| rc3-coursework-C | C | 20 | 15 | 88/93 |
| rc3-ocr-C | C | 12 | 0 | 217/252 |

The `owner-*` runs were recorded by the owner on 9 October 2026 (prepared tree on base `3c15550`,
labelled 4.0.0-rc2). The `rc3-*` runs repeat the same suites on the 4.0.0-rc3 candidate (commit
`02599aa`, no code changes after it in those runs). Each rc3 run has the same `score_sha256` as the
matching owner run, so the deterministic scores are reproduced on the candidate.

The score includes all planned cases. A file passes raw OCR only when every required value, unit, range and flag matches and no row is missing, duplicated or extra. All 12 uploaded-file cases completed, but none achieved perfect extraction with the Tesseract stand-in. This is an observed limitation, not a Thai API result.

A/B/C have the same aggregate automated pass count. The data do not establish an accuracy improvement from adding skills or agents. Recorded tool/skill traces establish that those components ran. Timings include local stand-ins and shared test-machine load; do not compare them with hosted latency. Source changes across recorded runs are captured in their provenance, so this is a descriptive comparison, not a controlled causal result.

`score_benchmark.py` was run twice on each run with byte-identical output. Recompute, for example:

```bash
python scripts/score_benchmark.py docs/evidence/current/owner-ocr-C
```

`pytest.txt` is the owner's earlier record (331 passed, 1 skipped); the 4.0.0-rc3 regression results are in `regression/`: Python suite 371 passed, business UAT 36/36, upgrade scenarios 10/10, TH/EN audit 43/43 (the browser runs were made on the working tree committed as `92f1d9e`, so their JSON names the parent commit `36336b4` with uncommitted changes).

## Resilience

The fault suite R01–R12 scores 100 (12/12, 0 skipped, 0 outbound connections), the browser recovery
check passes 10/10, and local measurements are recorded separately from the score:
[resilience/README.md](resilience/README.md). `demo-rollout.json` records full synthetic prompts and observable outputs. Raw synthetic evidence contains no real patient record or provider credential.
