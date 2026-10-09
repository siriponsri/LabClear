# Evidence — integration 4.0.0-rc2 (free-first harness)

Regression results of the **integrated candidate 4.0.0-rc2**: Codex `main` `c970410` + selected Claude
4.0.0 web work (rc1) + the free-first harness (typed tools, per-task runtime skills, synthetic-fixture
uploads, free-only provider policy, coursework benchmark). Recorded on 2026-10-09 in the Claude Cowork
cloud workspace (Linux) with synthetic data, isolated temporary databases and test doubles for the
language model and OCR. **No real provider API was called, no production ENV or Render service was
changed, nothing was pushed or deployed.** These are software/UI-flow results, not model, OCR or
clinical quality results.

Tested commit: `6f41a78046dc73d31b34f486da3114bfa42d5625` (branch `integration/labclear-4.0-rc1`) for the
Python suite, the Codex browser suites, the offline evaluation and the boot smoke. The web gate (type
check, Thai dictionary, production build, both web UATs) was rerun on `a4aec07` (`web-gate-commit.txt`),
whose only code change after `6f41a78` is the local web-UAT mock API (`scripts/dev_mock_api.py`, see
"Web UAT reruns" below). Later commits change documentation, reports, slides and evidence only; the
delivery manifest records the final head and `git diff --stat 6f41a78 HEAD -- . ':!docs' ':!README.md' ':!presentation'`.

| Check | Command | Result | File |
|---|---|---|---|
| Python suite (Codex 265 + rc1 12 + rc2 51) | `python scripts/offline_check.py pytest -q --junitxml=…` | **328 passed**, 0 failed, 0 skipped | `pytest.xml`, `pytest.log` |
| Codex legacy browser suite (Jinja UI, real API, doubles) | `TEST_PYTHON=… UAT_OUT=… node tests/browser/uat.cjs` | **36/36** | `codex-legacy-browser/browser-uat.json` |
| Codex upgrade browser suite (preview, hospital links, org lifecycle) | `TEST_PYTHON=… UAT_OUT=… node tests/browser/upgrade.cjs` | **10/10** | `codex-upgrade-browser/` |
| Codex offline model/skill fixture matrix | `python scripts/offline_check.py evaluation` | **60 fixture checks**; `LIVE_MODEL_EVALUATION=NOT_RUN` | `offline-evaluation.json` |
| Render entrypoint smoke (unchanged `scripts/run_business.py`) | `python scripts/offline_check.py boot` | **PASS**, 8 route checks | `boot.json`, `boot.log` |
| Next.js type check | `cd web && npx tsc --noEmit` | pass | `web-typecheck.log` |
| Thai dictionary completeness | `cd web && npm run i18n:check` | pass, **2,297** Thai strings (rc1 2,260 + 37) | `web-i18n.log` |
| Next.js production build | `cd web && npm run build` | pass, 16 app routes | `web-build.log` |
| Web UAT, Codex flags as in the browser fixture | `npm run start:render` + `scripts/dev_mock_api.py` + `node tests/uat.mjs` | **53/53** on `a4aec07`, 0 browser errors; now also checks the harness receipt and the staff free-policy/harness panels. Two earlier runs on `6f41a78` were 52/53 (below) | `web-uat/uat.json`, screenshots incl. `app-receipt-1440.png` |
| Web UAT, every new Codex flag off | `UAT_FLAGS=off scripts/dev_mock_api.py` + `node tests/uat-flags-off.mjs` | **5/5**; the one listed browser error is the expected 404 of `/hospital-links` when its flag is off (same as rc1) | `web-uat-flags-off/uat.json` |

The 51 new Python tests: `test_agent_tools.py` (15), `test_runtime_skills_select.py` (6),
`test_synthetic_fixtures.py` (3), `test_free_first_harness.py` (16), `test_benchmark_harness.py` (11).

Benchmark runs (OFFLINE, REPLAY) and the LIVE_FREE preflight are in [../free-first/](../free-first/README.md).

## Web UAT reruns (UI-22)

| Run | Commit | Result | Files |
|---|---|---|---|
| run 1 | `6f41a78` | 52/53 — UI-22 failed: one `500` on admin `/staff` | `web-uat-run1.json`, `web-uat-run1.log`, `web-uat-run1-next-server.log` |
| run 2 | `6f41a78` | 52/53 — same UI-22 failure | `web-uat-run2.json`, `web-uat-run2.log`, `web-uat-run2-next-server.log` |
| gate | `a4aec07` | **53/53**, flags off 5/5 | `web-uat/uat.json`, `web-uat.log`, `web-uat-next-server.log` |
| repeat 1, 2 | `a4aec07` | **53/53**, **53/53** (screenshots not kept) | `web-uat-repeat1.json`, `web-uat-repeat2.json` and `.log` |

The Next.js server log of runs 1–2 shows `Failed to proxy http://127.0.0.1:8000/api/business/staff/notifications
Error: socket hang up (ECONNRESET)`: the `/api` rewrite reuses an idle keep-alive connection from
Node's agent (5 s idle timeout) while uvicorn closes idle connections after its default 5 s, so a
request can land on a socket the server is closing. This is our reading of the logs, not a proven
root cause. The gate run's server log has no `socket hang up`; its four `The destination stream closed
early` lines also appear in the failing runs and did not fail any scenario. `a4aec07` makes the local mock API keep idle connections for 65 s so the client always
closes first; the product code, the Render entrypoint `scripts/run_business.py` and Render ENV are
unchanged. **Open item for a future Next.js-in-front-of-API deployment:** the same 5 s / 5 s race
would apply to `scripts/run_business.py` (uvicorn defaults); it is not changed in this candidate.

## Notes that affect interpretation

- `docs/ceo-upgrade/evidence/` (Codex's own evidence) is unchanged: the evaluation and boot scripts
  write there, so their outputs were copied here and the folder restored with `git checkout`.
- rc1 results (`../integration-4.0-rc1/`, commit `c8f3547`) and the Claude 4.0.0 branch results
  (commit `95bf3d7`) are historical and are not results of this candidate.
- Production PostgreSQL, Render deployment identity, live providers, live OCR, real devices and screen
  readers: **NOT_RUN**.
