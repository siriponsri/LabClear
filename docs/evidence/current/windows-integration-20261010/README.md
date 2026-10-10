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

## Authorized Render deployment and production smoke check

The user subsequently authorized commit/push/deploy and non-secret settings on the existing
Python Free service `srv-db2o3c0m7kps73blhpb0`, https://labclear.onrender.com. Main was pushed
without force at `b5e62e786a95df3b58dadf17f93fab95a3b91839`. Render's automatic commit deploy
and Blueprint sync deployed that SHA; the final Blueprint deployment `dep-db4npojpegos7395f2dg`
was live at 2026-10-09T23:49:03Z. No manual duplicate deployment was requested.

Added only RUNTIME_SKILLS_ENABLED=true and HOSPITAL_LINKS_ENABLED=true via Save only. The
existing Blueprint then applied its tracked non-secret resilience values and `/ready` health path.
Compute remains Free, one Python process/instance, same build and start commands. Secret values,
prior spend, budget cycle and quota were not revealed or edited; the Blueprint leaves these
owner-managed values as `sync: false`.

HTTP checks at 23:48 UTC returned 200 for `/health` and `/ready`, version 4.0.0-rc3 and the exact
pushed SHA; readiness reported startup done, not draining, storage ok, AI limit 2/OCR limit 1.
The public landing, package P01 and hospital-links pages rendered. The Thai landing retains its
approved design, IBM Plex Sans Thai body and Trirong heading font stacks.

After explicit action-time confirmation of irreversible deletion, only obsolete Node service
`labclear-web` (`srv-db49c3bncjis73c937jg`) was deleted. Its project showed Services (0), and the
connector service list no longer contained it. Python labclear remained active. PostgreSQL
`result-scopr-db` (`dpg-db2e02ui0phs73ebaofg-a`) remained available and was not changed; its free
instance reports an expiry of 2026-11-05. The unrelated suspended resultscope service was untouched.

## Production language regression follow-up

The production smoke check exposed incomplete in-place TH-to-EN translation of inline sentences
and the document title. A fresh page in English was correct, explaining why the earlier 43-case
fresh-page checks passed. The new assertion reproduced the defect before the fix (switch-before.json).
The DOM walker now restores saved sentence nodes before skipping generated Thai nodes, and title
tracking keeps the English source separately from the last rendered title. The targeted landing
retest passed at 390/768/1440 (switch-after.json). The strengthened full audit also checks every
switch for untranslated interface text, while retaining the no-reload and draft-preservation checks.

The strengthened full run passed 42/43 cases and exposed one additional date-formatting defect
in the printable report (`i18n-switch-full.json`). The report now rerenders its already-loaded
data on language changes, without a refetch; a focused rerun covers the affected report and
asserts that analyte names and values do not change. The focused rerun passed 4/4 at 390/768/1440, including the affected report and zero uncaught page errors (`report-switch.json`). The failed full-run evidence is retained; the full 43-case audit was not rerun after this report-only fix.

## Remaining gates

- No live AI/OCR calls or credential setup were performed. Free policy/entitlement and provider
  credentials still require their authorized owner flow; no claim of end-to-end AI completion.
- Coursework owner/contribution data, actual live 10-question/5-image/5-safety results and
  video are still incomplete. The deployed URL and initial release verification are now evidenced. Original report placeholders were not invented.
- Supplied course context: Oct 10 progress report/exam, Oct 17 final submission, Oct 24 presentation;
  exact class time unknown. A video no longer than 3 minutes satisfies the supplied conflicting limits.
- Library handoff was read successfully through Library, but local materialization returned HTTP 403.
- `send_message_to_thread` could not resolve the cloud parent (thread not found); this report is the
  persisted checkpoint for the platform's automatic return to the parent.


Follow-up: the reviewer/tone patch reran the strengthened full language audit successfully (43/43), including the report-date fix. See ../reviewer-tone-20261010/README.md and i18n-final.json. This supersedes the earlier full-audit gap above.
