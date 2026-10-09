# Current evaluation evidence

All runs below are OFFLINE. Provider doubles, including an allow-all reviewer, test orchestration only. These results do not measure Typhoon or iApp quality. No new live model run has been completed.

| Run | Profile | Cases | Automated pass | Exact OCR values |
|---|---|---:|---:|---:|
| owner-coursework-A | A | 20 | 15 | 88/93 |
| owner-coursework-B2 | B | 20 | 15 | 88/93 |
| owner-coursework-C | C | 20 | 15 | 88/93 |
| owner-ocr-C | C | 12 | 0 | 217/252 |

The score includes all planned cases. A file passes raw OCR only when every required value, unit, range and flag matches and no row is missing, duplicated or extra. All 12 uploaded-file cases completed, but none achieved perfect extraction with the Tesseract stand-in. This is an observed limitation, not a Thai API result.

A/B/C have the same aggregate automated pass count. The data do not establish an accuracy improvement from adding skills or agents. Recorded tool/skill traces establish that those components ran. Timings include local stand-ins and shared test-machine load; do not compare them with hosted latency. Source changes across recorded runs are captured in their provenance, so this is a descriptive comparison, not a controlled causal result.

`score_benchmark.py` was run twice on each run with byte-identical output. Recompute, for example:

```bash
python scripts/score_benchmark.py docs/evidence/current/owner-ocr-C
```

`pytest.txt` records 331 passed, 1 skipped. `demo-rollout.json` records full synthetic prompts and observable outputs. Raw synthetic evidence contains no real patient record or provider credential.
