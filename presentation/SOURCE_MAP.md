# LabClear Presentation Source and Evidence Map

## Source of Truth

- Product behavior and claims: local LabClear source, reports, and test evidence in this repository.
- Brand: `static/css/` tokens, `static/fonts/`, and existing LabClear UI patterns. References guide composition only; they do not replace LabClear colors or typography. See `THEME_AUDIT.md` and `STORYBOARD_TH.md`.
- Final format: `presentation/index.html`, a 16:9 HTML deck with 10 core slides and 5 appendix slides. Editable content is HTML, CSS, inline SVG, speaker notes, and the companion infographic DSL; this is not a WYSIWYG slide-editor or editable-PPTX claim.

## Candidate and Playwright Run

- Tested source HEAD: `73d24b9cc4281b74829b63603786427d14cbe5c7` on `main`, with a dirty worktree. Source hashes below identify the tested presentation files; the run is not represented as a clean-commit run.
- Run: `docs/evidence/current/presentation-html-final-20261012-release/`.
- UTC, exact hashes and screenshot inventory: `html-deck-qa.json` in the release evidence folder.
- Environment: Windows `win32`; Node `v24.19.0`; Playwright `1.56.1`; Chromium `141.0.7390.37`; desktop `1440×900`; mobile `390×844`.
- Main deck, PDF and companion SHA-256 values: recorded in `html-deck-qa.json` in the release evidence folder.
- Result: 16 PASS, 0 FAIL, 0 BLOCKED, exit code 0; 39 fresh screenshots; 15 desktop slides and 15 mobile slides checked.
- Static PDF: `LabClear-static-print.pdf`, 522,869 bytes, 15 pages, SHA-256 `abe5b4d17b5a5f9d1157554051ff4cba8464cd27d3670999519a920af90d8d16`.
- Mode: local-only. No LLM/OCR/API, payment, or deployment calls. External requests were blocked for companion tests; AntV Infographic `0.2.20` is served from the local vendor bundle.
- Machine-readable case results, asset hashes, and screenshot paths: `html-deck-qa.json` in the run folder.

## App UAT Used by the Deck

- Evidence: `docs/evidence/current/browser-uat-final-20261012-03/browser-uat.json`.
- Candidate source HEAD: `73d24b9cc4281b74829b63603786427d14cbe5c7`; recorded worktree fingerprint: `8c54565a7085bd57e8c463b0f9977690872b0ab98cad9c8394c58e8f2693b2dd`.
- Started `2026-10-12T04:20:30.974Z`; 37 PASS, 0 FAIL, 63 screenshots, exit code 0.
- Synthetic local UI/API/storage/permission fixture; LLM and OCR are mocked. This is not real-user acceptance, provider quality, clinical validation, or production reliability evidence.

## Claim Map

| Slide | Claim / message | Source | Evidence limit |
|---:|---|---|---|
| 1 | LabClear is a prototype for choosing a service, reviewing information, and asking for help. | `README.md`; `static/css/`; synthetic catalog screenshot referenced below. | Not a clinic, diagnostic tool, or validated service. Displayed package and price examples are simulated. |
| 2 | The product problem and value are project hypotheses, not confirmed customer demand. | `docs/report/LabClear_Business_Report_TH.md`. | No customer interviews, demand measurement, or market validation. |
| 3 | The simulated journey covers service selection through staff confirmation. | `tests/browser/uat.cjs`; UI-02/UI-06/UI-11/UI-14 evidence. | Local fixture only; no real booking, fulfillment, or payment. |
| 4 | Parsed report values require user review and confirmation before explanation. | `services/report_reader_v2.py`; architecture report. | Synthetic record and mocked OCR; OCR quality and clinical correctness are NOT_RUN. |
| 5 | Browser requests pass through the Python application into service, storage, and provider boundaries. | `docs/architecture.md`; `routers/`; `services/`. | Simplified current-state view; does not establish production scale, uptime, or every route control. |
| 6 | Retrieval can show sources; source presence does not prove an answer is correct. | `services/evidence_search.py`; `services/agent_tools.py`; UI-08 evidence. | No live model-quality or clinical-quality evaluation. |
| 7 | Handoff uses consent, a staff ticket, permissions, and customer-controlled resumption. | `routers/business.py`; UI-16/UI-16b/UI-19/UI-23 evidence. | Local workflow checks; not a production privacy guarantee or response-time commitment. |
| 8 | The local automated browser workflow passed 37 of 37 checks. | App UAT JSON and 63 screenshots above. | Synthetic fixtures and mocked LLM/OCR; not user acceptance, model quality, or clinical validation. |
| 9 | Clinical quality, live provider quality, retention/restore, production privacy, reliability, demand, and unit economics remain open. | Business/architecture reports and release gates. | NOT_RUN or NOT_VERIFIED as described by the source reports. |
| 10 | Continue only when the listed evidence and human gates support the next step. | Recommendation derived from slide 9. | Recommendation, not a measured outcome or promise. |
| A1 | Browser workflow coverage and run result. | App UAT evidence above. | Local synthetic test only. |
| A2 | Current application path and storage options. | `docs/architecture.md`. | Source structure only; no production-readiness claim. |
| A3 | Tested workflow versus unverified AI and clinical quality. | UAT, report-reader, and retrieval sources above. | No live model/OCR or clinical-quality evaluation. |
| A4 | Exact app-test candidate, run date, worktree fingerprint, mode, and screenshot count. | App UAT JSON above. | App UAT provenance, not HTML-deck QA provenance. |
| A5 | Package pricing and business statements are hypotheses or simulator values. | Business report; simulator UAT; Marketing review. | No live price change, willingness-to-pay evidence, real transaction, or financial validation. |

## Evidence Assets and Privacy

- Catalog evidence: `docs/evidence/current/browser-uat-final-20261012-03/UI-02_catalog-1440.png`, a real local UI capture from a synthetic fixture with a simulation notice. It supports the simulated customer flow and is not a price offer.
- Sensitive-looking report details in UI-09 are excluded from presentation imagery. No secrets or personal data were intentionally placed in the deck screenshots.
- Fresh HTML-deck screenshots are under `docs/evidence/current/presentation-html-final-20261012-release/`: `PRES-CORE-*`, `PRES-APPX-*`, companion cases, contact sheets, and `PRES-PRINT-01-static-opening.png`.
- The HTML static-PDF path uses Reveal.js `?print-pdf`; HTML-11 asserts one slide per page and HTML-12 checks the actual PDF signature and 15 page objects. The PDF is a static fallback, not the primary deck.

## Business and Evidence Limits

- Package, price, booking, payment, and settlement examples are simulated. No live catalog price or plan was changed.
- No spoken rehearsal was recorded; the 8:30 speaker-note total plus 0:30 reserve is arithmetic, not proof of delivery time.
- Production privacy, retention/restore, reliability, clinical validation, live model/OCR quality, customer demand, and unit economics remain open.
- Status vocabulary: `SYNTHETIC` means generated fixture data; `SIMULATED` means non-live commercial flows; `NOT_RUN` and `NOT_VERIFIED` keep missing evidence explicit.
