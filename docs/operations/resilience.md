# Request resilience and the 502 runbook

How LabClear bounds, cancels, streams, admits and traces AI requests, how the browser recovers when a
request fails, and how to tell an application error from a platform failure. Implemented in 4.0.0-rc3
from the resilience handoff of 9 October 2026 (P0-A to P0-D).

| Part | Where |
|---|---|
| Execution context, admission, stream protocol, structured logs | [`services/execution.py`](../../services/execution.py) |
| Workflow routes (chat, retry, report reading, report answer, Stop) | [`routers/business.py`](../../routers/business.py) |
| Provider calls: budgets, error classes, cost settlement | [`services/conversation_transport.py`](../../services/conversation_transport.py) |
| Document worker process | [`services/document_worker.py`](../../services/document_worker.py), [`services/document_render.py`](../../services/document_render.py) |
| Request IDs, size limits, `/health`, `/ready`, startup | [`main.py`](../../main.py) |
| SIGTERM drain, entry point | [`scripts/run_business.py`](../../scripts/run_business.py) |
| Bounded storage waits, readiness probe | [`services/business_store.py`](../../services/business_store.py) |
| Browser client | [`static/js/stream.js`](../../static/js/stream.js), used by `workspace.js`, `dock.js`, `api.js` |
| Fault suite R01–R12 | [`scripts/benchmark_resilience.py`](../../scripts/benchmark_resilience.py), [`tests/resilience/`](../../tests/resilience) |

The architecture stays one Python web service with one Uvicorn process. No queue, cache or extra
Render service was added.

## Configuration

Validated at startup by [`config.py`](../../config.py): an invalid value stops the process, so a bad
deploy never takes traffic. The values are per instance and are pilot settings, not Render limits or
performance results.

| Variable | Default | Allowed | Meaning |
|---|---:|---|---|
| `CHAT_DEADLINE_SECONDS` | 220 | 30–600 | Whole chat workflow: admission, storage, every agent and tool, the rewrite and JSON repair, finalization |
| `REPORT_DEADLINE_SECONDS` | 150 | 30–600 | Whole report reading: file preparation, OCR, document guard, rows, storage. The answer after confirmation is a chat workflow with its own 220 s |
| `STREAM_HEARTBEAT_SECONDS` | 10 | 2–30 | A `heartbeat` line after this long without output |
| `AI_MAX_IN_FLIGHT` | 2 | 1–16 | AI workflows at once; one HTTP workflow holds one slot whatever the number of agents |
| `OCR_MAX_IN_FLIGHT` | 1 | 1–16, ≤ AI limit | Report readings at once, counted inside the AI limit |
| `PROVIDER_TRANSPORT_RETRIES` | 0 | 0 only | Automatic retries are not implemented (P1); the variable documents and enforces that |
| `DOCUMENT_WORKER_SECONDS` | 30 | 2–120 | Wall-clock limit of one document worker process (never more than the workflow's time left) |
| `DOCUMENT_WORKER_MEMORY_MB` | 384 | 192–4096 | Address-space limit of the worker (POSIX). Measured need for the largest allowed input: under 192 MB |
| `SHUTDOWN_DRAIN_SECONDS` | 20 | 1–25 | On SIGTERM, time for in-flight workflows before they are cancelled |

Fixed in code: a step or provider call does not start with less than 1 s left; cleanup after a
workflow is bounded to 5 s; a provider call never gets more than `min(provider timeout, 75 s,
time left)`; storage waits are bounded (SQLite busy wait 10 s; PostgreSQL `connect_timeout=10`,
`statement_timeout=15 s`, `lock_timeout=10 s`); the readiness probe takes at most 1 s.

## Error contract

Every response carries `X-Request-ID` (`req_` + 16 hex characters). LabClear's own errors are JSON:

```json
{"code": "server_busy", "message": "LabClear is busy with other requests. Try again in a few seconds.",
 "origin": "app", "request_id": "req_4f0c2a91d7b3e6a5"}
```

`origin` says where the failure started: `client` (the request or the user), `app` (LabClear's own
checks, limits or deadline) or `upstream` (an AI provider). A response **without** `X-Request-ID`, or
an HTML page, did not come from LabClear: it is a gateway or platform response (for example Render's
proxy while the instance is starting, restarting or unreachable).

| Code | HTTP | Origin | Retryable | Meaning |
|---|---:|---|---|---|
| `request_timeout` | 504 | app | yes | The workflow deadline ended the request |
| `upstream_timeout` | 504 | upstream | yes | One provider call used its whole budget (including a provider that trickles bytes) |
| `upstream_unavailable` | 502 | upstream | yes | The provider answered 5xx |
| `upstream_rate_limited` | 503 | upstream | yes | The provider answered 429 |
| `service_unavailable` | 502 | upstream | yes | Network error reaching the provider |
| `provider_response_invalid` | 502 | upstream | yes | The provider's reply was not usable JSON, too large or incomplete |
| `provider_rejected` | 502 | upstream | yes | The provider refused the request (4xx: key, model, credit) |
| `guard_invalid` | 502 | app | yes | The safety check returned no usable verdict: the answer is withheld (fail closed) |
| `server_busy` | 503 | app | before start | Admission limit reached; `Retry-After: 5`; no provider call was made |
| `server_draining` | 503 | app | yes | The service is restarting; `Retry-After: 5` when refused, terminal event when cancelled |
| `cancelled` | 409 (Stop) / 499 (disconnect, logs only) | client | yes | Stop or a closed connection ended the request |
| `storage_unavailable` | 503 | app | yes | The database did not answer within its bounded wait |
| `document_timeout` | 422 | client | no | The file took longer than the worker's limit to prepare |
| `document_too_complex` | 422 | client | no | The file needed more memory than the worker's limit |
| `pdf_invalid`, `pdf_page_limit`, `page_limit` | 422 | client | no | Unreadable PDF, more than three pages |
| `file_too_large`, `image_dimensions_too_large` | 413 | client | no | Over 3 MB, or more decoded pixels than allowed |
| `unsupported_image`, `empty_image` | 415 / 400 | client | no | Not a PDF, PNG or JPEG; empty file |

"Retryable" means the chat keeps the message with a **Retry** button. Validation and safety errors
are never retried automatically and keep the existing codes; nothing is turned into a 200.

## Stream protocol

`POST /api/business/chat`, `/chat/retry`, `/chat/report`, `/chat/report/confirm` and
`/chat/report/answer` answer NDJSON (`application/x-ndjson`) when the request sends
`Accept: application/x-ndjson`; otherwise the same workflow answers plain JSON. `/reports/read` and
`/demos/{id}/read` use the same machinery and usually answer JSON.

| Event | When | Fields |
|---|---|---|
| `accepted` | First, once the request is admitted | `request_id`, `deadline_ms`, `heartbeat_ms` |
| `step` | Each step as it starts and ends | `id`, `state` (`running`, `done`, `error`, or after a failure `timeout`, `cancelled`, `unavailable`, `blocked`, `error`), `label`, `detail`, `elapsed_ms`, `duration_ms` |
| `heartbeat` | After `STREAM_HEARTBEAT_SECONDS` without output | `elapsed_ms`. A connection signal, not model progress |
| `done` | Exactly once on success | `result`, `request_id` |
| `error` | Exactly once on failure | `code`, `message`, `status`, `origin`, `request_id`, `step` |

Refusals before admission (`server_busy`, `server_draining`, origin, CSRF, session, size) are plain
HTTP errors, not streams. Once headers are sent the HTTP status stays 200 and a failure arrives as the
terminal `error` event; steps that were still running are sent first with their final state and
duration. Step events wait in a bounded queue (256); if a reader is too slow, further step events are
dropped and counted (`dropped_events`), never the terminal event. The finished trace is also in the
`done` result and stored with the answer.

## Deadlines, cancellation and cost

- **Deadline.** The route creates the execution context before any work; its monotonic deadline
  covers storage, every agent, tool and provider call, OCR and finalization. Each step checks the
  time left before it starts (`checkpoint`), including the JSON repair call and the single rewrite.
- **Per-call budget.** A provider call gets `min(provider timeout, 75 s, time left)`, enforced for
  the whole call, so a provider that keeps sending bytes slowly still ends (`upstream_timeout`).
- **Stop.** `POST /stop` first moves the conversation to a new version (a late answer is never
  added), then cancels the running workflow of that account: the provider HTTP client closes, a
  document worker is killed and reaped, the slot is released. The stopped message is not marked.
- **Closed connection.** The stream response listens for the client disconnecting and cancels the
  workflow; plain JSON requests check every second. The message is kept as failed with `cancelled`
  and can be retried.
- **Guest privacy.** Closing a guest page (`/guest/close`) or signing out cancels that account's
  running work as well.
- **Cleanup.** Marking the message and freeing the conversation run in `finally`, in a worker thread,
  bounded to 5 s; a cleanup failure is logged and never replaces the original error. The
  conversation's busy marker also expires on its own (time left + 5 s) if the process dies.
- **Cost.** A cancelled or timed-out provider call keeps its full cost reservation and counts
  against the call cap: the provider may have processed and billed it. Nothing is refunded on cancel.

## Admission and event-loop protection

- **Admission.** One slot per AI workflow, taken after the session check and before any file
  processing or provider call. Beyond the limits the request gets `503 server_busy` with
  `Retry-After: 5` at once; there is no waiting queue. Report readings take an OCR slot, which counts
  inside the AI limit.
- **Uploads.** The request body is capped first (10 MB for report routes, 4 MB otherwise). Then, before
  admission: one to three files, at most 3 MB each, PDF/PNG/JPEG signature. Then, in the worker and
  before rendering anything: at most three pages in total and the decoded-pixel limit of every page.
  Files are rasterized once per upload.
- **Document worker.** PDF rendering and image decoding run in a separate process
  (`python -I services/document_render.py`) with a minimal environment (no application secrets),
  in-memory pipes (no temporary files), a wall-clock limit, and on POSIX an address-space limit, a CPU
  limit and no writable files. On timeout, Stop, disconnect, deadline or shutdown it is killed and
  reaped before the slot is released. The stored-report viewer renders one page in a thread.
- **Storage off the event loop.** Route handlers that only use storage run in the server's thread
  pool; the AI workflows run each storage transaction in a worker thread. Database waits are bounded
  (see Configuration) and a slow or locked database ends as `storage_unavailable` instead of holding
  the request. `/health`, heartbeats and other requests keep being served while a request waits.
- **One process.** Guest chats live in process memory, so the service runs one Uvicorn process.
  Adding web workers would need a new session store first.

## Health, readiness and shutdown

| Endpoint | Meaning | Checks |
|---|---|---|
| `GET /health` | Liveness | The process and its event loop answer. Nothing else |
| `GET /ready` | Readiness (Render `healthCheckPath`) | Startup finished, not draining, storage answers a read-only `SELECT 1` within 1 s. Never calls a provider or OCR; never creates tables |

`/ready` answers 200 or 503 with `{"status", "checks": {"startup", "draining", "storage"}, "load",
"version", "commit"}`; storage errors are reported as `timeout`, `unavailable` or `unconfigured`,
never with connection details. A provider outage does not fail readiness, so it cannot cause restart
loops. Tables are created once at startup.

On SIGTERM (deploys and restarts) `scripts/run_business.py` drains: `/ready` turns 503 and new AI work
gets `503 server_draining` at once; in-flight workflows get `SHUTDOWN_DRAIN_SECONDS` (20 s) to finish;
the rest are cancelled with a terminal `server_draining` event and their workers killed; then Uvicorn
stops listening and the process exits with status 0, inside Render's shutdown window (30 s by
default). Non-AI pages keep being served during the drain. A second signal stops at once. The entry
point binds `0.0.0.0:$PORT` with one worker process.

## Request IDs and logs

Each API request produces at most two JSON log lines on the `labclear.request` logger, linked by
`request_id`:

```json
{"event":"workflow","at":1791567508.92,"request_id":"req_15aa9526daf239f9","route":"/chat","kind":"ai","stream":true,
 "outcome":"cancelled","status":503,"code":"server_draining","origin":"app","step":"plan","duration_ms":3594,"attempts":2,"dropped_events":0}
{"event":"http","at":1791567508.92,"request_id":"req_15aa9526daf239f9","method":"POST","route":"/api/business/chat","status":200,"duration_ms":3597}
```

`attempts` counts provider calls made by the request (a JSON repair or a rewrite counts). Other events:
`admission_refused`, `document_worker` (`ok`, `timeout`, `crashed`, `cancelled`), `drain_started`,
`drain_finished`, `startup`, `cleanup_incomplete`. `http` lines are written for every non-GET API
request and every API error. Only the documented keys are written: never prompts, messages, report
images or values, API keys, tokens or personal identifiers. Provider error bodies are not logged.

## In the browser

[`static/js/stream.js`](../../static/js/stream.js) classifies every outcome before parsing anything:

| Kind | Example | What the customer sees (Thai by default) |
|---|---|---|
| `app` | LabClear JSON error or terminal `error` event | The server's message; the failed steps with their state and duration; the request reference |
| `gateway` | HTML 502/503/504 from a proxy | "LabClear could not be reached right now…" (the page itself is never shown) |
| `unexpected` | 200 with an HTML page | "LabClear sent an unexpected page instead of an answer…" |
| `network` | Connection reset | "The connection was interrupted before the answer finished…" |
| `malformed` | A line that is not JSON | "The reply could not be read…" |
| `eof` | Stream ends before `done`/`error` | "The reply stopped before it finished…" |
| `idle` | Nothing for 35 s (heartbeats arrive every 10 s) | "No response for 35 seconds…" |
| `overall` | Server budget (from `accepted`) + 10 s | "This took longer than the time allowed…" |
| `aborted` | Stop | Nothing; the Stop notice |

- The spinner always ends; running steps are marked **Interrupted** and partial output is never shown
  as a checked answer.
- If the server did not keep the message as retryable, the text and the chosen files go back into the
  composer, in page memory only (no `localStorage` or `sessionStorage`), so it can be sent again from
  the same page. Guest data is still not kept after the page closes.
- Send and **Retry** do nothing while a workflow is active; a POST is never re-sent automatically.
- After more than 60 s without contact, the next send first polls `GET /ready` (up to 90 s) so a
  sleeping free instance can wake; the message is then posted once.
- JavaScript files are served with content-hash URLs so a deploy never mixes old and new scripts.

## Runbook: a customer reports a 502

1. **Ask for the request reference** shown under the failed message, or the time. A reference
   (`req_…`) means LabClear answered: search the Render logs for it and read the `workflow` line
   (`code`, `origin`, `step`, `attempts`). No reference, or an HTML error page, means the request never
   reached the application: a platform failure.
2. **Application errors** (`origin` app or upstream):
   - `upstream_*`, `service_unavailable`, `provider_*`: the AI provider. Check its status page, the key
     and credit on `/staff` → **AI providers** (**Test connection** makes one small, counted call).
   - `request_timeout`: the chain was slow; look at which `step` ran out and the provider's latency.
   - `server_busy`: more simultaneous AI requests than `AI_MAX_IN_FLIGHT`; expected under load on one
     free instance.
   - `storage_unavailable`: check the PostgreSQL instance (status, connections, expiry of the free plan).
3. **Platform failures** (no reference): in the Render dashboard open the `labclear` service.
   - **Events**: a deploy, a restart or a failed health check at that time.
   - **Logs**: `drain_started`/`drain_finished`, `startup`, Python tracebacks, out-of-memory kills.
   - **Metrics**: memory near the instance limit (512 MB on the free plan) or CPU saturation.
   - The free plan sleeps after 15 minutes without traffic; the first request waits for the instance
     to start (about a minute) and may fail at the proxy.
4. **Verify the deployed version**: `GET /health` returns `commit`; it must equal the commit Render
   shows for the live deploy. A `live` deploy proves the deployment, not that every AI flow works.
5. **After a deploy**: `/ready` must return 200, then run one synthetic chat and one sample report read.
6. **Rollback**: Render → service → **Events** → choose the last good deploy → **Rollback**. Check
   `/health` (`commit`) and `/ready` again. With auto-deploy on, a new commit to `main` deploys again.

**Before a demo:** open the site a few minutes early, check `/ready` (200), and run the synthetic smoke
flow. A keep-alive ping is not an availability guarantee. Avoiding sleep entirely needs a paid compute
plan for the web service: an owner decision with the current price from Render's pricing page; this
bundle does not change the plan.

## Verification

```bash
python scripts/benchmark_resilience.py --offline --seed 20261010 \
  --json-out docs/evidence/current/resilience/resilience-benchmark.json   # R01–R12
python scripts/offline_check.py pytest -q tests/test_resilience.py       # unit checks
TEST_PYTHON=.venv/bin/python UAT_OUT=docs/evidence/current/resilience/ui node tests/browser/resilience.cjs
python scripts/measure_resilience.py --json-out docs/evidence/current/resilience/local-measurements.json
```

The benchmark needs Python and Node.js only (no browser, no keys). It exits non-zero unless all
twelve cases pass with none skipped and no outbound connection attempt. The score is
`100 × passed cases / 12`; a case passes only when every one of its assertions passes. It measures
this fault suite with provider doubles and synthetic files; it is not an uptime SLA, Render latency or
model accuracy.

| Case | Scenario | Verified |
|---|---|---|
| R01 | Provider hangs or trickles | Deadline 220 s ends a slow chain during the rewrite (`request_timeout`); a hung call ends at its own 60 s (`upstream_timeout`); no later agent; call cancelled; reservation kept; slot and busy state free |
| R02 | Provider 502/503/429, malformed output | Six variants classified with origin; each stage called once (no retry); input and output guard fail closed; no answer stored; no echoed key |
| R03 | Proxy HTML 502/503/504 | Client classifies `gateway`, never parses or shows HTML, settles, no resend |
| R04 | Idle, cut and invalid streams | Heartbeats every 10 s; idle watchdog at 35 s; `eof` and `malformed` never success; overall watchdog at budget + 10 s; bounded queue keeps the terminal event |
| R05 | Stop, closed connection | Provider call cancelled; no late answer after 300 s; slot, busy state and registry free; a stuck worker killed and reaped |
| R06 | Over the limit | Third request `503 server_busy` + `Retry-After: 5` before any provider call, not queued; `/health` answers; OCR limit inside the AI limit |
| R07 | Bad files, stuck worker | Broken PDF, 4 pages, 25 MP, > 3 MB, wrong type refused (the last two without a worker); stuck worker stopped at 2 s; no process, slot or temporary file left |
| R08 | Slow storage | Lock wait bounded (`storage_unavailable`), `/health` unaffected; slow probe makes `/ready` 503 within 1 s; PostgreSQL timeouts set on every connection |
| R09 | SIGTERM (real process) | `/ready` 503 and new work `server_draining` at once; in-flight chat and report read end with a terminal event after the drain; worker reaped; exit status 0 |
| R10 | Duplicate retry | Second retry refused (`busy`) with 0 provider calls; one booking and one payment for simultaneous confirmations; client gate |
| R11 | Cold start, HTML 200 | `/ready` JSON 503 before startup; HTML 200 is not success; `/ready` polled before one POST; give up after 90 s without POST |
| R12 | Trace and regressions | Request ID in header, events and log lines; documented log keys only; no key, message text or image data in logs; business, Guest privacy, Guard, ledger and resilience tests pass |

Results: [`docs/evidence/current/resilience/`](../evidence/current/resilience/README.md).

## Known limits (within P0)

- **The platform can still return 502.** A free instance that is asleep, restarting or out of memory
  answers through Render's proxy without LabClear. The browser now recovers cleanly, but only Render
  can remove those failures (a paid plan avoids sleeping, not restarts).
- **Limits are per instance and in memory.** Admission counters, Guest chats, the rate limiter and
  running work live in one process; a restart or redeploy ends in-flight work (after the drain) and
  Guest chats. Durable jobs are P1.
- **Some non-AI routes still use storage inline on the event loop:** the staff refund route, the LINE
  worker (`BUSINESS_WORKER_ENABLED`, off on Render) and the LINE simulator. They log
  `storage_on_event_loop` the first time; the AI workflows are checked in strict mode by the suite.
- **Storage is serialized.** Every transaction holds the database mutex; one slow transaction delays
  others up to the bounded waits, and threads waiting on a long outage can fill the thread pool.
- **Readiness follows the database.** If PostgreSQL is down, `/ready` fails and Render may stop
  routing to or restart the instance, and a new deploy will not go live until storage answers.
- **Windows.** The worker's memory and CPU limits use POSIX `setrlimit`; on Windows only the
  wall-clock limit and the kill apply. The SIGTERM case uses `CTRL_BREAK_EVENT` there and has only been
  run on Linux.
- **Doubles, not providers.** The suite exercises LabClear's handling of provider behaviour with
  in-process doubles. It does not measure live providers or latency on Render; the local measurements
  exclude model and OCR time.
- **Cancelled calls cost money.** A timed-out or cancelled call is charged in full against the ledger.

## Not implemented (P1)

- **Circuit breaker** per provider endpoint and model (three consecutive transient failures, 30 s
  cooldown, one half-open probe; not counting safety rejections, schema failures, user 4xx or client
  cancellation; reset on configuration change; no silent fallback to an unapproved provider).
- **Retry policy.** Automatic retries stay off (`PROVIDER_TRANSPORT_RETRIES=0`). Enabling any retry
  needs proof that it is safe and budget left; a read timeout after a POST may already be billed, and
  a whole multi-agent chain, a booking or a payment is never replayed automatically.
- **Durable jobs and polling** for long OCR, only if measurements show OCR regularly exceeding its
  budget, and without adding paid infrastructure automatically.
