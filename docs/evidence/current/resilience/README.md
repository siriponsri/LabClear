# Resilience evidence

Recorded on 10 October 2026 (Asia/Bangkok) in a Linux container (Python 3.12, Node.js 22) for
LabClear 4.0.0-rc3. Everything here uses provider doubles and synthetic files; no provider was called
and nothing was charged. What the cases check and how to run them:
[../../../operations/resilience.md](../../../operations/resilience.md#verification).

## Fault suite R01–R12

[`resilience-benchmark.json`](resilience-benchmark.json), from
`python scripts/benchmark_resilience.py --offline --seed 20261010` at commit `3191f93`.

| Result | Value |
|---|---|
| Score | **100** (12/12 required cases, equal weight) |
| Skipped | 0 |
| Outbound connection attempts | 0 (external provider calls: 0) |
| Assertions | 183, all passed |
| Score hash | `7ec88f1376d2d778`; the same with `--seed 7` (another case order) |
| Run time | about 39 s: server cases 10 s (virtual clock), client 0.1 s, SIGTERM 5 s, regression 24 s |

| Case | Scenario | Assertions |
|---|---|---:|
| R01 | Provider hangs or sends data slowly without end | 23 |
| R02 | Provider 502/503/429 and malformed output | 37 |
| R03 | A proxy answers with an HTML 502/503/504 page | 14 |
| R04 | Idle stream, a stream cut before done, an invalid line | 14 |
| R05 | Stop or a closed connection while waiting for AI | 13 |
| R06 | More users than the concurrency limit | 14 |
| R07 | Broken PDF, too many pages, too many pixels, a stuck worker | 13 |
| R08 | Slow storage: connection, query or lock | 13 |
| R09 | SIGTERM during a chat and a report read | 10 |
| R10 | Retry clicked twice, or while the original request is active | 11 |
| R11 | Cold start and pages that are not JSON | 11 |
| R12 | Request IDs, logs without secrets, existing regressions (157 tests) | 10 |

[`artifacts/`](artifacts/) holds the logs of each part (no failure files: nothing failed). The score
is the pass rate of this deterministic suite. It is not an uptime SLA, not latency on Render and not
model accuracy; the virtual-clock times inside it are not speeds.

## Chat recovery in a browser

[`ui/resilience-ui.json`](ui/resilience-ui.json), from `node tests/browser/resilience.cjs`: **10/10**,
no page errors. A real Chromium on the browser fixture, with the chat endpoint's reply replaced by an
HTML 502 and 504, an HTML 200, a stream cut before its terminal event, an invalid line, a connection
reset, LabClear's own `503 server_busy` and a terminal upstream error. Each time the spinner ended, the
Thai message was shown (never the proxy page), the message went back into the composer, and the
interrupted step and the request reference were visible. Screenshots: `UI-R02-upstream-1440.png`,
`UI-R03-502-*.png`, `UI-R04-eof-*.png`. Supplementary evidence, not part of the score.

## Local measurements

[`local-measurements.json`](local-measurements.json), from `python scripts/measure_resilience.py` at
commit `3191f93`: one Uvicorn process on 127.0.0.1 (2 CPUs, SQLite), offline doubles, so **model and
OCR latency are excluded**. These describe LabClear's own overhead on this machine, not Render.

| Measure | Samples | Result |
|---|---:|---|
| Process start to `/health` / `/ready` | 1 | 670 ms / 673 ms |
| Chat, time to first event (`accepted`) | 20 | p50 3 ms, p95 5 ms |
| Chat completion, one at a time | 20 | p50 73 ms, p95 91 ms |
| Chat completion, two at a time | 20 | p50 173 ms, p95 200 ms |
| Report read completion (A4 PNG, worker process) | 5 | p50 239 ms, p95 244 ms |
| Memory: web process at ready / peak | | 67 MiB / 81 MiB |
| Memory: document worker peak | | 81 MiB |
| Exit after SIGTERM with nothing in flight | 1 | 366 ms, status 0 |

Render Free adds its own wake-up after 15 idle minutes (about a minute, per Render's documentation),
network time and provider latency; none of that is measured here.

## Notebook rollouts

[`demo-rollouts.json`](demo-rollouts.json), written by section 8 of
`notebooks/LabClear_Harness_Demo.ipynb`: a successful answer, a provider that never answers (ends at
its 60 s call budget as `upstream_timeout`, 6 heartbeats) and a Stop while the writer runs (`cancelled`,
the provider call closed). Events as the browser receives them and the structured log line; virtual
seconds; no prompts or model reasoning.
