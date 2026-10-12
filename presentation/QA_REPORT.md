# LabClear HTML Presentation QA Report

Date: 12 October 2026 (Asia/Bangkok)  
Candidate source HEAD: `73d24b9cc4281b74829b63603786427d14cbe5c7` (`main`, dirty worktree)  
Run: `docs/evidence/current/presentation-html-final-20261012-release/`
Overall: `PASS` for HTML/deck QA; spoken rehearsal `NOT_RUN`

## Environment and Command

```powershell
$env:PRESENTATION_EVIDENCE_OUT = "docs/evidence/current/presentation-html-final-20261012-release"
node scripts/verify_html_deck.mjs
```

Environment: Windows `win32`, Node `v24.19.0`, Playwright `1.56.1`, Chromium `141.0.7390.37`; desktop `1440×900`, mobile `390×844`. The runner starts a local companion server, blocks external requests for the infographic, and makes no API/LLM/OCR/payment/deployment calls. Raw results and hashes are in `html-deck-qa.json`.

## Requirement-to-Test Results

| Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| HTML-01 | 15 slides; 10 core; 5 appendix; notes complete; <=540 sec | 15; 10; 5; complete; 510 sec | PASS | `html-deck-qa.json` |
| HTML-02 | 7 architecture nodes; 5 journey steps; 3 handoff roles; no nested slides | Exact | PASS | JSON; slide screenshots |
| HTML-03 | Thai/body/display fonts available | `true`, `true`, `loaded` | PASS | JSON |
| HTML-04 | Next/back navigation updates notes and counter | Exact | PASS | JSON |
| HTML-05 | 15/15 desktop slides fit | 15/15 | PASS | `PRES-*-desktop.png` |
| HTML-06 | Required local image loads | `true` | PASS | JSON |
| HTML-07 | Mobile controls can be disabled/restored | Exact | PASS | JSON |
| HTML-08 | 15/15 mobile slides have no horizontal overflow | 15/15 | PASS | `PRES-*-mobile.png` |
| HTML-09 | Workflow scroll reaches its final step and notice | Exact | PASS | Companion desktop/mobile screenshots |
| HTML-10 | Reduced-motion preference disables repeated animation | Duration `0.001 ms`; one iteration | PASS | JSON |
| HTML-11 | Static export has 15 pages, one slide per page, no animation | 15 pages; 15 slides; one per page; `0s` | PASS | `PRES-PRINT-01-static-opening.png`; JSON |
| HTML-12 | PDF has valid signature, nonzero bytes, and 15 pages | `%PDF-`; 522,869 bytes; 15 pages | PASS | `LabClear-static-print.pdf`; SHA-256 in JSON |
| HTML-13 | Thai document, named controls, local links | Exact | PASS | JSON |
| HTML-14 | Workflow starts at step 0; step/replay/pause/complete/mobile/no-JS pass | Exact; 0 browser errors | PASS | Workflow desktop/mobile/no-JS screenshots |
| HTML-15 | Local infographic renders, text edits, exports SVG, mobile/no-JS works, no network calls | All true; exported SVG 25,198 bytes; `externalRequests: []` | PASS | Infographic edited/mobile/no-JS screenshots; SVG |
| HTML-16 | Browser errors | 0 | PASS | JSON |

## Before / After and Regression Diagnosis

- Before: retained run `presentation-html-final-20261012-v7` recorded 14 PASS, 1 FAIL, 1 BLOCKED. HTML-14 expected a completed initial workflow frame although step mode starts at 0; HTML-15 relied on remote assets and did not finish reliably.
- A fresh export assertion then caught 28 pages because the test PDF was generated from the normal HTML route. Reveal.js's actual static slide export is `?print-pdf`; the normal route reflows its print layout. The PDF builder already used `?print-pdf`, but the test did not.
- After: the runner now uses the same `?print-pdf` route as the builder and checks its 15 per-slide page wrappers plus the generated PDF page count. The local AntV bundle and fallback remove companion network dependencies. The release run records 16 PASS, 0 FAIL, 0 BLOCKED and 39 fresh screenshots.
- The JSON-only `presentation-html-final-20261012-final4/html-deck-qa.json` preserves the intermediate 28-page regression result; its screenshots and PDF are not used as final evidence. Other duplicate runs were removed during hygiene.
- The release evidence folder contains only the successful run used for delivery; older runs remain historical until reference review and are not used as final evidence.

## Visual and Artifact Review

- Desktop and mobile contact sheets and the opening print-page capture were generated from the release run and visually inspected. The Thai text, image, diagrams, tables, and page composition are present; no clipping or overlapping content was observed in the tested frames.
- Machine checks verify 15/15 desktop and mobile slide bounds, Thai font availability, print animation `0s`, one slide per PDF page, and a valid PDF signature/page count.
- Release screenshot inventory: 15 desktop slides, 15 mobile slides, 1 print opening, 2 contact sheets, and 6 workflow/infographic captures = 39 screenshots.
- Exact tested HTML, PDF and companion hashes: `html-deck-qa.json` in the release evidence folder.
- Rebuilt report PDFs were separately rendered and inspected in [`report-render-final-20261012-03`](../docs/evidence/current/report-render-final-20261012-03/): 58 pages, 0 empty pages, 0 pages without Thai text, 0 replacement glyphs, and 2 image objects. Contact sheets cover all pages; representative pages show tables, figures, and page boundaries. The existing IBM Plex Sans Thai fallback was used because TH Sarabun New is absent on this Windows machine.

## App UAT Context and Limits

The presentation cites `docs/evidence/current/browser-uat-final-20261012-03/browser-uat.json`: candidate HEAD `73d24b9cc4281b74829b63603786427d14cbe5c7`, recorded worktree fingerprint `8c54565a7085bd57e8c463b0f9977690872b0ab98cad9c8394c58e8f2693b2dd`, 37 PASS, 0 FAIL, 63 screenshots, exit code 0. This is local UI/API/storage/permission workflow evidence with synthetic data and mocked LLM/OCR; it is not user research, live-provider quality, clinical validation, or proof of production privacy.

The HTML deck is editable in its source (HTML/CSS/SVG/DSL). It does not claim click-and-drag editing in a separate slide editor or editable PPTX export because HTML is the approved final format. No spoken rehearsal was recorded; timing is estimated from speaker notes. Package, price, booking, payment, and settlement are simulated. Production retention/restore, privacy, reliability, market demand, unit economics, and clinical/model/OCR quality remain open.
