# Browser UAT final03

This directory is the fresh Playwright evidence bundle for the LabClear local UAT checkpoint.
It was produced by a real browser run; the screenshots are not mock images or copies of an older run.

## Result

- Status: `PASS`
- Cases: `37 PASS / 0 FAIL / 0 browser errors`
- Exit code: `0`
- Case IDs: `UI-01` through `UI-34`, including the `UI-02b` and `UI-16b` cases recorded in `browser-uat.json`
- Screenshots: `63` PNG files; each file has a SHA-256 entry in `browser-uat.json`
- Raw case record: [`browser-uat.json`](browser-uat.json)

Each record in the raw JSON contains `id`, `name`, `expected`, `actual`, `status`, and duration. The screenshot paths in the same file map the case evidence to the fresh PNG files in this directory.

## Environment and provenance

- Candidate commit: `73d24b9cc4281b74829b63603786427d14cbe5c7`
- Worktree dirty: `true`
- Dirty-worktree fingerprint captured by the runner: `8c54565a7085bd57e8c463b0f9977690872b0ab98cad9c8394c58e8f2693b2dd`
- Windows x64, Node.js `v24.19.0`, Python `3.12.10`, Playwright `1.56.1`, Chromium `141.0.7390.37`
- Fixture: isolated temporary SQLite, synthetic data, provider networking disabled
- Mode: real local UI/API/storage/permission behavior with mocked LLM/OCR; this is not live model or OCR quality evidence

## Scope

The run covers customer and staff/manager flows, package comparison and booking gates, bot-to-staff handoff and resume/close behavior, history and guest privacy, simulated payment and manager authorization, mobile/tablet layouts, and negative/network/permission cases. Production retention and restore, live provider quality, clinical validation, real settlement, production load, demand, and unit economics remain `NOT_RUN` or unknown.
