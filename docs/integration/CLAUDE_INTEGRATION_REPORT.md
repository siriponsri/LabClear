# LabClear 4.0.0-rc3 integration report

| | |
|---|---|
| Date | 10 October 2026 |
| Branch | `integration/labclear-4.0-rc1` |
| Base | `main` at `3c15550` (4.0.0-rc2, checked with `git ls-remote` before the work) |
| Candidate | code `3191f93`, evidence and documentation up to the head of the branch |
| Environment | Claude Cowork cloud workspace, synthetic data only |
| Not done by this work | push, merge into `main`, pull request, deploy, changes to Render, DNS, production environment or databases, paid plan changes, live AI/OCR calls |

## 1. Acceptance matrix

Requirements as the owner stated them (Thai) and how they were met.

| # | Requirement (owner) | Requirement (English) | Status | Evidence |
|---|---|---|---|---|
| 1 | ใช้เว็บ FastAPI แบบเดิม ฟอนต์ไทยสวย (IBM Plex Sans Thai + Trirong) สลับ TH/EN ลื่น | One FastAPI website, Thai fonts, smooth TH/EN switch | Done | `templates/`, `static/`, `i18n/`; TH/EN audit 43/43 |
| 2 | Provider API ในหน้า Admin ตั้งค่าใช้งานได้จริง | Admin AI providers usable | Done | `/staff` → AI providers, test receipts; `tests/test_ai_providers.py` |
| 3 | Skills + Tools ขึ้นใน Process Explainability | Skills and tools shown in Process Explainability | Done | per-tool and skill steps with durations; `tests/test_chat_explainability_rc3.py` |
| 4 | เปิด harness ใน render.yaml | Harness on in `render.yaml` | Done | `RUNTIME_SKILLS_ENABLED="true"` |
| 5 | Deploy ผ่าน Blueprint auto deploy ไป labclear.onrender.com | One Blueprint service, auto-deploy from `main` | Done (not deployed) | `render.yaml`; [deploy guide](../deploy/render.md) |
| 6 | เพิ่มแหล่งความรู้ 90 รายการ (owner approve) | Add the 90 owner-approved sources | Done | 148 searchable records; source check still pending |
| 7 | แพ็กเกจโรงพยาบาลจริง แชตอ้างอิงลิงก์ | Hospital packages enabled and cited | Done | `HOSPITAL_LINKS_ENABLED="true"`; `tests/test_hospital_links.py` |
| 8 | Admin ปรับ skills/tools แบบ no-code (อิสระแต่มีกรอบความปลอดภัย) | No-code skills/tools editor within safety rails | Done | Company Harness (locked core modules, limits can only be lowered) |
| 9 | Knowledge ใน Admin แสดงแบบ PDF (Viewer A4) + `/sources` สาธารณะคงไว้ | Knowledge library with an A4 PDF viewer; public `/sources` kept | Done | `routers/knowledge_admin.py`; `tests/test_admin_harness_knowledge.py` |
| 10 | Evaluation benchmark แบบ deterministic พร้อม script | Deterministic evaluation benchmark and scorer | Done | `scripts/benchmark_labclear.py`, `scripts/score_benchmark.py`; scores reproduce the owner's runs |
| 11 | Notebook แสดง multi-agent พร้อม prompt และ rollout | Multi-agent notebook with prompts and rollout | Done | `notebooks/LabClear_Harness_Demo.ipynb` (executed) |
| 12 | Repo hygiene: เหลือ blueprint ที่ใช้จริง, report/presentation ล่าสุด | Repository hygiene | Done | unused deploy targets, old reports and evidence removed (kept in git history) |
| 13 | README/docs/presentation เป็นภาษาอังกฤษแบบ professional | English README, docs and presentation | Done | README, `docs/`, `presentation/index.html` (12 slides) and `docs/report/LabClear_Slides.pdf` |
| 14 | Report ยึดการตอบโจทย์ Final Project.docx (3 ฉบับ ตามสไตล์ Technical Report และ skill Thai Report Format) | Thai reports: Final Project (Word, placeholders), business, architecture and agent flow (PDF) | Done (placeholders to fill) | [docs/report/README.md](../report/README.md) |
| 15 | แผนลด 502: P0-A ถึง P0-D + benchmark R01–R12 | Resilience P0-A to P0-D and fault suite R01–R12 | Done | [operations/resilience.md](../operations/resilience.md); fault suite 12/12 |
| 16 | ตรวจ free tier จากเอกสารทางการ, รัน preflight ใหม่ | Free-tier check from official documentation; preflight again | Done (LIVE_FREE still blocked) | [provider-free-tier-check.md](../evidence/current/provider-free-tier-check.md), `live-preflight.json` |
| 17 | Regression เต็มบน candidate สุดท้าย | Full regression on the final candidate | Done | section 4 |

## 2. What changed

| Commit | Change |
|---|---|
| `f04c089` | Next.js website translations (before its removal) |
| `5114b94` | FastAPI site Thai-first with TH/EN switch, IBM Plex Sans Thai and Trirong, hospital links and harness steps in chat |
| `2fd68f6` | The owner's benchmark pack: Company Harness admin, Knowledge library, 148-record corpus, deterministic scorer |
| `4ef068e` | Repository hygiene, English documentation, provider test receipts in Admin |
| `02599aa` | Diagrams generated from code (`scripts/build_diagrams.py`), unused fonts removed |
| `feb94af` | rc3 benchmark evidence, multi-agent notebook, browser suites for the Thai-first UI |
| `36336b4` | i18n override order, organization page states |
| `92f1d9e` | Request resilience P0-A to P0-D (section 3) |
| `ebdaa6f`, `3191f93` | Reproducible score hash; turn ID in the execution context and logs |
| `da10abf`, `8445db6`, `8356fb8` | Evidence, notebook execution, provider free-tier check, this report |
| last commit | Three Thai reports, English slides, updated diagrams and screenshots |

## 3. Request resilience (handoff of 9 October 2026)

- **P0-A** One execution context per AI request: request ID, turn ID, whole-workflow deadline (220 s
  chat, 150 s report reading) covering storage, every agent, the rewrite and JSON repair, and a
  cancellation scope. Timeouts are `request_timeout`/`upstream_timeout` (504); provider failures carry
  an `origin`. Stop, a closed connection, the deadline and shutdown cancel the provider call (cost
  reservation kept), kill the document worker and free the slot.
- **P0-B** NDJSON with `accepted`, a heartbeat every 10 s and exactly one terminal event; bounded
  queue; interrupted steps shown with their state, duration and the request reference. The browser
  client classifies gateway pages, JSON errors, resets, invalid lines and early ends; 35 s idle and
  budget + 10 s watchdogs; the message returns to the composer (page memory only); Retry is inert
  while a request runs; the client waits for `/ready` after a long pause.
- **P0-C** `AI_MAX_IN_FLIGHT=2`, `OCR_MAX_IN_FLIGHT=1`, otherwise `503 server_busy` with
  `Retry-After: 5` before any provider call; upload limits before decoding; report files rendered in a
  killable worker process with time and memory limits and no secrets; storage off the event loop with
  bounded waits; one Uvicorn process.
- **P0-D** `/ready` readiness (Render `healthCheckPath`), `/health` liveness; drain on SIGTERM
  (`SHUTDOWN_DRAIN_SECONDS=20`, exit 0); `X-Request-ID` on every response and in errors and stream
  events; structured JSON logs without prompts, report data or keys; runbook.
- Settings validated at startup and set in `render.yaml`. P1 (circuit breaker, retry policy, durable
  jobs) is not implemented.

## 4. Verification

All runs use synthetic data, temporary storage and provider doubles; outbound sockets are denied.

| Check | Commit | Result | Evidence |
|---|---|---|---|
| Python suite (`scripts/offline_check.py pytest`) | `3191f93` | **371 passed** | `docs/evidence/current/regression/pytest.*` |
| Resilience fault suite R01–R12 | `3191f93` | **100** (12/12, 183 assertions, 0 skipped, 0 outbound connections; same score hash for two seeds) | `docs/evidence/current/resilience/` |
| Chat recovery in a browser | `92f1d9e` | 10/10 | `resilience/ui/` |
| Business UAT | `92f1d9e` tree | 36/36 | `regression/browser-uat.json` |
| Upgrade scenarios | `92f1d9e` tree | 10/10 | `regression/browser-upgrade.json` |
| TH/EN audit (all pages, 390/768/1440 px) | `92f1d9e` tree | 43/43 | `regression/i18n-audit.json` |
| Render entry point boot | `3191f93` | PASS, 8 routes | `boot.json` |
| Offline fixture evaluation | `3191f93` | 60 checks, `LIVE_MODEL_EVALUATION=NOT_RUN` | `offline-evaluation.json` |
| Coursework benchmark A/B/C, OCR file suite (OFFLINE) | rc3 | 15/20 each; OCR 217/252 exact values; scores equal the owner's runs | `rc3-*`, `comparison.json` |
| LIVE_FREE preflight | `8445db6` | **BLOCKED**, 0 inference calls | `live-preflight.json` |
| Local measurements (not Render, model latency excluded) | `3191f93` | `/ready` 673 ms after start; chat p50 73 ms; peak memory 81 MiB | `resilience/local-measurements.json` |

The browser suites ran on the working tree that was committed as `92f1d9e`; their JSON names the
parent `36336b4` with uncommitted changes. Later commits changed only server logging, scripts and
documentation.

None of these results measure Typhoon or iApp quality, latency on Render or clinical accuracy.

## 5. Provider status

The providers' public pages (checked 10 October 2026): the Typhoon text model is listed as free for
light usage (5 requests/s, 200/min); Typhoon OCR's free status is not published (2 requests/s,
20/min); the iApp guard is credit-based (50 IC free at sign-up, no free SystemOne quota listed). The
policy template's rate limits match. LIVE_FREE remains blocked until the owner reviews the policy,
confirms free status on the account and sets the trial keys in the shell.

## 6. Remaining work and risks

| Item | Next step |
|---|---|
| Final Project report placeholders | Team: demo clip link, deployed URL, LIVE_FREE tables, who did each progress item; then update fields in Word and export PDF |
| LIVE_FREE runs | Owner: reviewed policy, keys in the shell, preflight, smoke, coursework A/B/C |
| Render Free | Sleep and restarts can still return 502 at the proxy; a paid plan is the owner's decision (current price not verified here) |
| `/ready` depends on PostgreSQL | A new deploy goes live only when the database answers |
| Storage still inline on the event loop | Staff refund route, LINE worker (off on Render), LINE simulator |
| Windows | Worker memory limits are POSIX-only; the SIGTERM case has only run on Linux |
| Knowledge library | 90 owner-approved records still need a source check; no clinical or lay-reader review |
| Human review | Coursework verdicts `PENDING_REVIEW` |

## 7. Deployment

Steps, Render CLI commands, checks and rollback: [deploy/render.md](../deploy/render.md) and the
runbook in [operations/resilience.md](../operations/resilience.md#runbook-a-customer-reports-a-502).
The merge to `main` deploys automatically; `healthCheckPath` becomes `/ready`.
