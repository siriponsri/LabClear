# Windows integration checkpoint, 10 October 2026

Repository: `C:/Users/User/Desktop/myProject/LabClear` (absent before this task).
Origin main was independently checked at `3c15550cb00bd1942e0f4ce95dc2757a3e6d22c4`.
Downloaded rc3 bundle SHA-256: `7728ddc94abb1dc0d42779751c6d0f5fc4fef4e44f6eec5d19962655c651152b`.
`git bundle verify` passed after clone completed. Its branch is preserved at
`b29cb13edeb94be15ab264aec8ffd2ef58a54bac`; local main was fast-forwarded without resetting history.
No pre-existing checkout, database, .env or untracked user files were overwritten.

## Corrections

- Unexpected workflow exceptions previously wrote exception messages and traceback source lines
  into request logs. A synthetic private-data canary reproduced the leak in both JSON and NDJSON
  workflows (see `log-privacy-before.log`). The handler now records only request ID and exception
  type, preserving generic client errors and releasing admission slots. Two regression cases cover it.
- The resilience harness counted Windows asyncio's internal socketpair as outbound. It now observes
  actual denials by the existing offline guard across connect, connect_ex, create_connection and DNS.
  A regression proves socketpair works while all four forbidden entry points remain denied/counted.
- Each offline run now owns its TEMP/TMP/TMPDIR. R07 previously sampled the shared Windows Temp
  directory and reported unrelated concurrent test files as leaks. Isolation retains leak detection
  for this run and its workers; it does not exclude arbitrary filenames to make the test pass.
- The Thai judge subprocess uses UTF-8 pipes explicitly and a 15-second response bound; an exited
  judge fails the check instead of leaving an unresolved promise. The first full language audit was
  interrupted while investigating slow workspace progress; retain its raw log as incomplete evidence.
- Removed executable examples that reset prior spend to zero or replace the existing budget cycle
  and quota. Actual stored cost history and secrets were never read or changed.

## Executed checks

All provider calls below are in-process test doubles, never live AI/OCR requests.
Python 3.12.10, Node 24.19.0, Playwright 1.56.1; Python dependency versions are recorded alongside.

| Check | Actual result | Evidence |
|---|---|---|
| Imported candidate baseline | 371 passed | pytest.log |
| Final full Python suite | 374 passed; 1 third-party Starlette deprecation warning | pytest-final2.log / pytest-final2.xml |
| Business browser UAT | 36/36 | browser-uat.json |
| Upgrade browser | 10/10 | upgrade-browser.json |
| Browser recovery | 10/10, no page errors | resilience-ui.json |
| R01-R12, seed 20261010 | 12/12; accepted; 0 skipped, 0 outbound | release-seed-20261010.json |
| R01-R12, seed 7 | 12/12; accepted; 0 skipped, 0 outbound | release-seed-7.json |
| Deterministic score | Both final seeds d80c1670d1856fc1 | same JSON reports |
| Coursework A/B/C re-score | Each 15/20, exactly equals recorded score object | rescore-A/B/C.json |
| Full language audit | 43/43, TH/EN at 390/768/1440 px, no uncaught page errors | i18n-audit.json / i18n.log |

Commands: `python scripts/offline_check.py pytest -q`; `node tests/browser/uat.cjs`;
`node tests/browser/upgrade.cjs`; `node tests/browser/resilience.cjs`;
`python scripts/benchmark_resilience.py --offline --seed <20261010 or 7> --json-out <path>`;
`python -X utf8 scripts/score_benchmark.py docs/evidence/current/rc3-coursework-<A/B/C> --out <path>`.
Set UAT_OUT to a fresh directory and use `.venv/Scripts/python.exe`. Browser screenshots and complete
working logs remain in ignored `test-results/windows-integration/`. Historical evidence was preserved.

## Why OFFLINE 15/20 is not a pass

Independent scoring of the frozen recorded runs matches all three historical score objects exactly.
Questions are 10/10 and safety cases 5/5; all five images fail. Profile C examples:

| Image | Exact values / expected | Exact units | Exact references | Missing / duplicate rows |
|---|---|---|---|---|
| I01 | 18/18 | 17 | 17 | 0/0 |
| I02 | 16/17 | 15 | 16 | 1/1 |
| I03 | 13/13 | 12 | 0 | 0/0 |
| I04 | 11/12 | 5 | 5 | 1/0 |
| I05 | 30/33 | 24 | 29 | 2/0 |

The stand-in uses Tesseract plus a generic whitespace-table parser. Recorded problems include a
lost decimal in a printed range, a missing/duplicated analyte, and reference units/qualitative fields
not preserved by that parser. These are not measurements of Typhoon OCR. Frozen fixtures and scoring
thresholds were not changed, and expected answers were not injected into the provider double.
Tesseract is absent on this Windows machine, so a fresh OCR extraction benchmark remains BLOCKED;
re-scoring existing raw extractions is complete. Live model/OCR quality remains NOT_RUN.

## Render checkpoint (no push/deploy yet)

Target: Python Free service `srv-db2o3c0m7kps73blhpb0`, https://labclear.onrender.com.
Its dashboard is accessible in Chrome. Main tracks the existing repository; last deployed commit
was 3c15550. The following env NAMES were observed, values kept masked:
APP_ENV, BUSINESS_DATA_KEY, BUSINESS_EXTERNAL_ENABLED, CLOUD_CALL_LIMIT, DATABASE_URL,
DEMO_ACCOUNTS, GUARD_API_KEY, LLM_API_KEY, MODEL_PRICES_THB, PROJECT_BUDGET_PRIOR_SPEND_THB,
PROVIDER_BUDGET_CYCLE_ID, PROVIDER_NETWORK_ENABLED, PYTHON_VERSION, TRUSTED_ORIGINS,
VISION_API_KEY, VISION_ENABLED. Presence does not verify validity or entitlement.

Missing from the observed list: RUNTIME_SKILLS_ENABLED, HOSPITAL_LINKS_ENABLED and the named
resilience env overrides. Resilience values have application defaults; the intended feature flags
and /ready health path still need controlled application to the confirmed existing service.
Preserve database/data-key/cost variables and all current secrets. Do not use a bulk env replacement.

Obsolete frontend: `srv-db49c3bncjis73c937jg`, labclear-web.onrender.com, Node Free, root web/.
Auto-Deploy was changed from On Commit to Off and verified in its saved dashboard field, so it
will no longer rebuild on the subsequent main push. No service was deleted or suspended.
No custom domains were listed, no linked environment groups were listed, and its only env names
were API_ORIGIN, NEXT_TELEMETRY_DISABLED, NODE_VERSION. Values were not revealed.
Deletion dialog says: "All resources for labclear-web will stop working immediately. This action
cannot be undone." It requires typing `sudo delete web service labclear-web`. The dialog was cancelled.
Parent must obtain action-time irreversible-deletion confirmation; preserve the separate PostgreSQL.

## Remaining gates

- Finish primary Render non-secret settings/health readiness, commit/push, deployment and read-only
  browser verification of the exact deployed SHA. Existing free plan must remain unchanged.
- No live AI/OCR calls or credential setup were performed. Free policy/entitlement and provider
  credentials still require their authorized owner flow; no claim of end-to-end AI completion.
- Coursework owner/contribution data, actual live 10-question/5-image/5-safety results, deployed
  release verification and video are still incomplete. Original report placeholders were not invented.
- Supplied course context: Oct 10 progress report/exam, Oct 17 final submission, Oct 24 presentation;
  exact class time unknown. A video no longer than 3 minutes satisfies the supplied conflicting limits.
- Library handoff was read successfully through Library, but local materialization returned HTTP 403.
- `send_message_to_thread` could not resolve the cloud parent (thread not found); this report is the
  persisted checkpoint for the platform's automatic return to the parent.
