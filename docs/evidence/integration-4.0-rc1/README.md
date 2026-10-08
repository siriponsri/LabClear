# Evidence — integration 4.0.0-rc1

Results of the **integrated candidate** (Codex `main` c970410 + selected Claude 4.0.0 web work),
recorded on 2026-10-09 in the Claude Cowork cloud workspace (Linux). Every run used synthetic data,
an isolated temporary database and test doubles for the language model and OCR. **No real
provider API was called, no production ENV or Render service was changed, and nothing was
deployed.** These are software/UI-flow results, not model, OCR or clinical quality results.

Tested commit: `c8f35476921b1037699b2280da2e8bc498c22e05` (branch `integration/labclear-4.0-rc1`).
Commits after it change documentation, diagrams, reports and slides only; see the delivery
manifest for the final head and the `git diff --stat` that shows no code change.

| Check | Command | Result | File |
|---|---|---|---|
| Python suite (Codex 265 + 12 integration) | `python scripts/offline_check.py pytest -q --junitxml=…` | **277 passed**, 0 failed, 0 skipped | `pytest.xml`, `pytest.log` |
| Codex legacy browser suite (Jinja UI, real API, doubles) | `TEST_PYTHON=… UAT_OUT=… node tests/browser/uat.cjs` | **36/36 passed** | `codex-legacy-browser/browser-uat.json` |
| Codex upgrade browser suite (preview, hospital links, org lifecycle) | `TEST_PYTHON=… UAT_OUT=… node tests/browser/upgrade.cjs` | **10/10 passed** | `codex-upgrade-browser/upgrade-browser.json` |
| Codex offline model/skill fixture matrix | `python scripts/offline_check.py evaluation` | **60 fixture checks passed**; `LIVE_MODEL_EVALUATION=NOT_RUN` | `offline-evaluation.json` |
| Render entrypoint smoke (unchanged `scripts/run_business.py`) | `python scripts/offline_check.py boot` | **PASS**: started/stopped, 8 route checks, isolated SQLite | `boot.json`, `boot.log` |
| Next.js type check | `cd web && npx tsc --noEmit` | **pass** | `web-typecheck.log` |
| Thai dictionary completeness | `cd web && npm run i18n:check` | **pass** (2,260 Thai strings) | `web-i18n.log` |
| Next.js production build | `cd web && npm run build` | **pass**, 16 routes | `web-build.log` |
| Web UAT, Codex flags as in the browser fixture (org documents, hospital links, landing preview on) | `npm run start:render` + `scripts/dev_mock_api.py` + `node tests/uat.mjs` | **53/53 passed**, 0 browser errors | `web-uat/uat.json`, screenshots |
| Web UAT, every new Codex flag off (default deployment) | `UAT_FLAGS=off scripts/dev_mock_api.py` + `node tests/uat-flags-off.mjs` | **5/5 passed** | `web-uat-flags-off/uat.json` |

The web UAT ran against `next build` + `next start` (the Render start script), with `/api` proxied
to the real Codex FastAPI app on another port, so it also exercised the `TRUSTED_ORIGINS` path.

## Notes that affect interpretation

- **UI-33 (Codex legacy suite).** Before commit c8f3547 the test decoded a guest thumbnail before
  its private blob had been fetched. On this Linux workspace the untouched Codex baseline c970410
  passed UI-33 in one run and failed it in another; the candidate failed it twice. An instrumented
  run showed the blob `src` arriving a moment later and the image decoding. The test now waits for
  the blob `src`; the product code is unchanged. Results above are after that fix.
- `browser-uat.json` reports `working_tree_dirty: true` only because this evidence folder was being
  written while the suite ran; no tracked file was modified.
- The Claude 4.0.0 branch's own results (pytest 261, UAT 51/51 on the OpenNext/Cloudflare preview,
  Cloudflare dry runs) are **historical** and belong to commit `95bf3d7` on `release/4.0.0`. They are
  not results of this candidate and are not copied here.
- Codex's own pre-publication evidence stays in `docs/ceo-upgrade/evidence/` unchanged.
- Production PostgreSQL, Render deployment identity, live providers, live OCR, real devices and
  screen readers: **NOT_RUN**.
