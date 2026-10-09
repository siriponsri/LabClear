# Evidence — free-first coursework benchmark (4.0.0-rc2)

Raw runs behind [`docs/ceo-upgrade/COURSEWORK_BENCHMARK_REPORT_TH.md`](../../ceo-upgrade/COURSEWORK_BENCHMARK_REPORT_TH.md).
Recorded on 2026-10-09 in the Claude Cowork cloud workspace with synthetic data only.

**Read this first.** Every run here is **OFFLINE** or **REPLAY**. No run is LIVE_FREE: no provider
API was called, so nothing in this folder is a Typhoon, Typhoon OCR or OpenThai-SystemOne result,
and nothing is a clinical result. Automated verdicts are pipeline verdicts; every case is
`PENDING_REVIEW` for a human.

| Mode | What runs | What is a stand-in |
|---|---|---|
| OFFLINE | The real app over HTTP (routes, guest sessions, CSRF, pipeline, validators, typed tools, runtime skills, call cap, THB ledger, free-only policy and quota) | Provider calls only, served in-process by `tests/benchmark/doubles.py` 1.1.0 behind `httpx.MockTransport`: rule planner, extractive writer, approve-all reviewer, allow-all guard, copy analyzer, Tesseract 5.3.4 (eng) as the OCR stand-in. Outbound sockets are refused (`scripts/offline_check.py benchmark`). |
| REPLAY | Same app; provider responses are the ones recorded by an OFFLINE run, served in stage order | A different request order stops the run with `REPLAY_MISMATCH`. Replaying OFFLINE recordings is still not a live result. |
| LIVE_FREE | `scripts/live_free_server.py`, isolated trial server | **Not run.** Preflight `BLOCKED` (below). |

## LIVE_FREE status

- `live-free-preflight.json` — `BLOCKED` on commit `4127bb5`: no `LABCLEAR_TRIAL_TYPHOON_API_KEY` /
  `LABCLEAR_TRIAL_IAPP_API_KEY` in the runner's environment; policy `eval/policies/free_only.example.json`
  not reviewed (reviewer, date, account label empty); the three endpoints are
  `FREE_STATUS_UNVERIFIED`; providers' data terms not reviewed.
- `live-free-run-blocked.txt` — the run command exits 2 before starting a server:
  "nothing was sent to any provider".
- `trial-boot-check.json` + `trial_boot_check.py` — the trial server boots with the example policy and
  no keys, reports `free_policy_active`, a zero quota counter and `inference_calls_made: 0`.

## Runs (`runs/<id>/`)

Each folder has `run.json`, `summary.json`, `raw.jsonl` (one line per attempt), `report_th.md`,
per-kind CSVs, `MANIFEST.json` (SHA-256 of the files), `server.log` and the gzipped provider
call log / replay recording. `summary.json` → `candidate` records the commit and whether the
working tree was clean.

| Run | Mode | Profile | Suite | Commit | Completed | Pipeline pass | Pipeline fail | Blocked (policy/quota) | Calls outside policy |
|---|---|---|---|---|---|---|---|---|---|
| `R0-A` | OFFLINE | A | regression | `b7d6643` | 28/28 | 22 | 6 | 0 | 0 |
| `R0-B` | OFFLINE | B | regression | `b7d6643` | 28/28 | 22 | 6 | 0 | 0 |
| `R0-C` | OFFLINE | C | regression | `b7d6643` | 23/28 | 22 | 1 | 5 | 0 |
| `R0-Ctrap` | OFFLINE | C | regression | `b7d6643` | 23/28 | 22 | 1 | 5 | 25 |
| `R1-A` | OFFLINE | A | regression | `aa89aed` | 28/28 | 22 | 6 | 0 | 0 |
| `R1-C` | OFFLINE | C | regression | `aa89aed` | 23/28 | 22 | 1 | 5 | 0 |
| `R2-B` | OFFLINE | B | regression | `599f407` | 28/28 | 22 | 6 | 0 | 0 |
| `R2-C` | OFFLINE | C | regression | `599f407` | 23/28 | 22 | 1 | 5 | 0 |
| `R3-C` | OFFLINE | C | regression | `4d75818` | 28/28 | 22 | 6 | 0 | 0 |
| `R3-Ctrap` | OFFLINE | C | regression | `4d75818` | 28/28 | 22 | 6 | 0 | 30 |
| `R4-C` | OFFLINE | C | regression | `c082a05` | 26/28 | 21 | 5 | 2 | 0 |
| `R4-Ctrap` | OFFLINE | C | regression | `c082a05` | 1/28 | 1 | 0 | 27 | 0 |
| `G-A` | OFFLINE | A | regression | `4127bb5` | 28/28 | 22 | 6 | 0 | 0 |
| `G-B` | OFFLINE | B | regression | `4127bb5` | 28/28 | 22 | 6 | 0 | 0 |
| `G-C` | OFFLINE | C | regression | `4127bb5` | 28/28 | 22 | 6 | 0 | 0 |
| `G-C-free` | OFFLINE | C | coursework | `4127bb5` | 20/20 | 15 | 5 | 0 | 0 |
| `G-C-replay` | REPLAY | C | coursework | `4127bb5` | 20/20 | 15 | 5 | 0 | 0 |
| `G-Ctrap-free` | OFFLINE | C | coursework | `4127bb5` | 1/20 | 1 | 0 | 19 | 0 |

- Profiles: **A** runtime skills off, medical harness off · **B** skills on · **C** skills on + medical
  harness. Typed tools are on in every profile from `aa89aed`.
- `Ctrap`: a leftover Admin-saved reviewer slot that points at a paid OpenRouter model (the
  precedence problem fixed by improvement 3). "Calls outside policy" counts requests the doubles
  received for that non-allowlisted endpoint; they never left the process.
- `-free`: the free-only policy is enforced with `eval/policies/free_only.offline.json`
  (`OFFLINE_DOUBLES_ONLY`; Typhoon/iApp endpoints served by doubles) and the proposed quotas
  (iApp 20 requests/min, 300 conservative guard decisions per run).
- Regression suite = 20 rubric cases + 5 benign controls + 3 development conversations.
  Coursework suite = the 10 questions, 5 images and 5 safety cases. The 5 holdout cases were
  **not run**.
- The 5 image failures in `G-*` are the rule of the spec: rows read wrongly by the OCR stand-in and
  confirmed as read (`RAW_AS_READ`) cannot pass. The `R0/R1/R2-C` blocks are improvement 2's
  `data_policy` refusal of multipart uploads.
- `G-*` ran on `4127bb5`, which has the same code as the regression-tested commit `6f41a78` (the
  difference is evidence files only). Later commits do not touch the benchmark path.

## Paired comparisons (`compare-<before>-vs-<after>.json`)

Written by `scripts/benchmark_labclear.py compare`, which lists the variable under test and any
confound from `git diff` of the two commits.

| File | Shows |
|---|---|
| `compare-R0-C-vs-R1-C.json`, `compare-R0-A-vs-R1-A.json` | Typed tools commit: no regression |
| `compare-R1-C-vs-R2-C.json` | Improvement 1 — per-task runtime skills (+ `skill-route-matrix.json`: wrong/missing modules 5/8 → 0/8) |
| `compare-R2-C-vs-R3-C.json` | Improvement 2 — multipart synthetic images reach the explanation (0/5 → 5/5), raw rows kept |
| `compare-R3-Ctrap-vs-R4-Ctrap.json`, `compare-R3-C-vs-R4-C.json` | Improvement 3 — free-only policy and shared quota (paid calls 30 → 0; the 28-case suite needs 330 decisions > cap 300) |
| `compare-G-A-vs-G-B.json`, `compare-G-B-vs-G-C.json` | Profiles on the final commit |

## Reproduce

```bash
# OFFLINE starts the app itself through `scripts/offline_check.py benchmark <config>` (sockets denied)
python scripts/benchmark_labclear.py run --mode offline --suite coursework --profile C --free-only --record-replay --run-id X
python scripts/benchmark_labclear.py run --mode replay  --suite coursework --profile C --replay-from X --run-id Y
python scripts/benchmark_labclear.py run --mode offline --suite regression --profile C --trap-paid-review-slot --run-id Z
python scripts/benchmark_labclear.py preflight --profile free-only --profile-letter C --policy eval/policies/free_only.example.json --suite coursework --dry-run
python scripts/benchmark_labclear.py compare --before R2-C --after R3-C
python scripts/skill_route_matrix.py
```

LIVE_FREE: follow [`docs/ceo-upgrade/FREE_PROVIDER_PREFLIGHT.md`](../../ceo-upgrade/FREE_PROVIDER_PREFLIGHT.md).
Keys go only into the runner's environment through the owner's secure channel, never into chat,
files or the ZIP.
