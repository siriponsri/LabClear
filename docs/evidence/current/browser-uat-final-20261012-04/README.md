# Browser UAT `final04`

## Run Identity

- Candidate application commit: `38e39f03a8a21a294001cbb2bd146a4c7ea611eb`.
- Start / finish: `2026-10-12T05:46:45.127Z` / `2026-10-12T05:49:27.416Z`.
- Result: **37 PASS, 0 FAIL, 0 browser errors**, exit code `0`.
- Environment: Windows `win32` x64, Node `v24.19.0`, Playwright `1.56.1`, Chromium `141.0.7390.37`, Python `3.12.10`, timezone `Asia/Bangkok`.
- Fixture: isolated temporary SQLite, synthetic test data, provider networking disabled, LLM and OCR doubles (`MOCKED_TEST_ONLY`).
- Start state: clean worktree; empty `git diff --binary` SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Screenshots: 63. Filenames, case IDs, viewport sizes, and SHA-256 values are recorded in `browser-uat.json` under `screenshot_evidence`.

## Reproduction

The raw run manifest does not record the original shell invocation. The runner and an equivalent reproduction command are:

```powershell
$env:TEST_PYTHON = ".venv/Scripts/python.exe"
$env:UAT_OUT = "docs/evidence/current/browser-uat-final-20261012-04"
node tests/browser/uat.cjs
```

The command above is a reproduction recipe, not a claim that these exact shell lines were captured for the original run. The raw case records contain the scenario name (the exercised workflow), expected result, actual result, and status; individual low-level selectors are maintained in [the runner](../../../../tests/browser/uat.cjs).

## Case Results

For every row, the expected result is “All scenario assertions and required UI steps complete.” The raw run recorded “All scenario assertions passed.” as the actual result and `PASS`. The scenario column is copied from the runner's case record; it describes the tested action sequence. Screenshot-to-case mapping and per-file hashes are in `browser-uat.json`.

| Case | Scenario / exercised steps | Status |
|---|---|---|
| UI-01 | Home: segmented-tab keyboard control, audience toggle, persistent theme toggle, search to filtered catalog, no overflow | PASS |
| UI-02 | Catalog: filter, URL state, chip removal, empty state, reset, sort, browser back/forward | PASS |
| UI-02b | Catalog network failure shows a recoverable error state | PASS |
| UI-03 | Package comparison: tray limit, comparison table, assistant handoff link, clear | PASS |
| UI-04 | Package detail to booking; guest account gate; invalid package returns 404 | PASS |
| UI-05 | Create account, updated account label, survives reload | PASS |
| UI-06 | Booking form: center, date, live slots, request awaits confirmation | PASS |
| UI-07 | Chat proposal does not book; submitting request creates exactly one additional request | PASS |
| UI-08 | Failed chat reply is marked; retry avoids duplicate message; sources render | PASS |
| UI-09 | Report upload with OCR double, source image, edit, explicit confirmation, context chip, reload | PASS |
| UI-10 | Organization inquiry validation and submission for signed-in account | PASS |
| UI-11 | Separate manager sign-in; inbox shows organization request details | PASS |
| UI-12 | Staff takeover; quotation version 1 and revision version 2 | PASS |
| UI-13 | Staff confirms one request and declines another with a reason | PASS |
| UI-14 | Customer notifications, calendar file, quotation versions/PDF, accepts latest quotation | PASS |
| UI-15 | Simulated PromptPay test payment; signed success; paid state persists | PASS |
| UI-16 | Customer requests a team; staff takeover and reply; customer confirms assistant resume | PASS |
| UI-16b | Unassigned staff queue does not preselect or reveal chat history | PASS |
| UI-17 | Manager price edit persists to public demo catalog; branch staff cannot access manager tools | PASS |
| UI-18 | LINE simulator event through adapter and worker; simulated delivery recorded | PASS |
| UI-28 | Manager saves provider; key is masked and never returned | PASS |
| UI-23 | Staff dashboard values, capacity, center edit, role pause/resume, audit log | PASS |
| UI-25 | Staff customer/payment lists, customer history dialog, payment-state filter | PASS |
| UI-24 | Public assistant dock is page-aware, labels role, shortcut opens booking form | PASS |
| UI-19 | Customer cannot use staff APIs; staff views require sign-in | PASS |
| UI-20 | Visible keyboard focus; Escape closes dialog | PASS |
| UI-26 | Free AI Lab Report, upgrade prompt, Plus via test payment, multi-image read, history dashboard, printable report | PASS |
| UI-27 | Website product tabs, Ctrl+K search, navigation dropdown, AI Lab Report page | PASS |
| UI-29 | Typed demo sign-in, admin routes, test-02 Plus entitlement | PASS |
| UI-30 | Chat report thumbnail, live steps, values card, one-click confirmation answers question | PASS |
| UI-31 | Chats/projects: create, rename, switch; mobile drawer | PASS |
| UI-32 | Header sign-in with typed demo account, account menu, sign-out, journey section, agents page | PASS |
| UI-33 | Guest upload/preview; no persisted token; reload revokes chat/image; no history after sign-up | PASS |
| UI-34 | Delayed view cannot override latest click; booking fields survive sign-in; customer cannot open staff URL | PASS |
| UI-21-tablet | Tablet pages, navigation drawer, filter toggle, reduced-motion setting, no horizontal overflow | PASS |
| UI-21-mobile | Mobile pages, navigation drawer, filter toggle, reduced-motion setting, no horizontal overflow | PASS |
| UI-22 | No uncaught browser JavaScript errors | PASS |

## Limits

- This is local workflow and permission evidence, not customer acceptance or a production trial.
- OCR and LLM quality were not tested; their doubles were used to complete UI flows.
- Durable retention/backup/restore, production privacy/reliability, clinical quality, live settlement, and commercial demand were not tested (`NOT_RUN` or unknown).
- Package, price, booking, and payment behavior in this run is simulated. No live catalog price or real payment changed.
