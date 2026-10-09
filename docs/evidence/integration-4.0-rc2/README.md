# Evidence — integration 4.0.0-rc2 (free-first harness)

Regression results of the **integrated candidate 4.0.0-rc2**: Codex `main` `c970410` + selected Claude
4.0.0 web work (rc1) + the free-first harness (typed tools, per-task runtime skills, synthetic-fixture
uploads, free-only provider policy, coursework benchmark). Recorded on 2026-10-09 in the Claude Cowork
cloud workspace (Linux) with synthetic data, isolated temporary databases and test doubles for the
language model and OCR. **No real provider API was called, no production ENV or Render service was
changed, nothing was pushed or deployed.** These are software/UI-flow results, not model, OCR or
clinical quality results.

Tested commit: `6f41a78046dc73d31b34f486da3114bfa42d5625` (branch `integration/labclear-4.0-rc1`).
Later commits change documentation, reports, slides and evidence only; the delivery manifest records
the final head and `git diff --stat d4b1025 HEAD -- . ':!docs' ':!README.md' ':!presentation'`.

| Check | Command | Result | File |
|---|---|---|---|
| Python suite (Codex 265 + rc1 12 + rc2 51) | `python scripts/offline_check.py pytest -q --junitxml=…` | **328 passed**, 0 failed, 0 skipped | `pytest.xml`, `pytest.log` |
| Codex legacy browser suite (Jinja UI, real API, doubles) | `TEST_PYTHON=… UAT_OUT=… node tests/browser/uat.cjs` | **36/36** | `codex-legacy-browser/browser-uat.json` |
| Codex upgrade browser suite (preview, hospital links, org lifecycle) | `TEST_PYTHON=… UAT_OUT=… node tests/browser/upgrade.cjs` | **10/10** | `codex-upgrade-browser/` |
| Codex offline model/skill fixture matrix | `python scripts/offline_check.py evaluation` | **60 fixture checks**; `LIVE_MODEL_EVALUATION=NOT_RUN` | `offline-evaluation.json` |
| Render entrypoint smoke (unchanged `scripts/run_business.py`) | `python scripts/offline_check.py boot` | **PASS**, 8 route checks | `boot.json`, `boot.log` |
| Next.js type check | `cd web && npx tsc --noEmit` | pass | `web-typecheck.log` |
| Thai dictionary completeness | `cd web && npm run i18n:check` | pass, **2,295** Thai strings (rc1 2,260 + 35) | `web-i18n.log` |
| Next.js production build | `cd web && npm run build` | pass, 16 app routes | `web-build.log` |
| Web UAT, Codex flags as in the browser fixture | `npm run start:render` + `scripts/dev_mock_api.py` + `node tests/uat.mjs` | **53/53**, 0 browser errors; now also checks the harness receipt and the staff free-policy/harness panels | `web-uat/uat.json`, screenshots incl. `app-receipt-1440.png` |
| Web UAT, every new Codex flag off | `UAT_FLAGS=off scripts/dev_mock_api.py` + `node tests/uat-flags-off.mjs` | **5/5**; the one listed browser error is the expected 404 of `/hospital-links` when its flag is off (same as rc1) | `web-uat-flags-off/uat.json` |

The 51 new Python tests: `test_agent_tools.py` (15), `test_runtime_skills_select.py` (6),
`test_synthetic_fixtures.py` (3), `test_free_first_harness.py` (16), `test_benchmark_harness.py` (11).

Benchmark runs (OFFLINE, REPLAY) and the LIVE_FREE preflight are in [../free-first/](../free-first/README.md).

## Notes that affect interpretation

- `docs/ceo-upgrade/evidence/` (Codex's own evidence) is unchanged: the evaluation and boot scripts
  write there, so their outputs were copied here and the folder restored with `git checkout`.
- rc1 results (`../integration-4.0-rc1/`, commit `c8f3547`) and the Claude 4.0.0 branch results
  (commit `95bf3d7`) are historical and are not results of this candidate.
- Production PostgreSQL, Render deployment identity, live providers, live OCR, real devices and screen
  readers: **NOT_RUN**.
