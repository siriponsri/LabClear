# LabClear HTML Presentation Delivery Report

## Delivery Status

`PASS` for the HTML presentation and fresh browser QA. Spoken rehearsal remains `NOT_RUN`.

- Primary deliverable: [`index.html`](index.html), Thai-first, 16:9 Reveal.js deck.
- Core: 10 slides, estimated speaker notes total 8:30; 0:30 reserve; planned total 9:00.
- Appendix: 5 slides, outside the core timing.
- HTML is the final format. There is no PPTX backend or claim of WYSIWYG editing. Content can be changed in HTML, CSS, inline SVG, notes, and the companion infographic DSL.
- Factual content remains text/SVG in the source; decorative motion has static, print, and reduced-motion fallbacks.

## Candidate and Environment

- Repository: `C:\Users\User\Desktop\myProject\LabClear`.
- Branch / source HEAD during QA: `main` / `38e39f03a8a21a294001cbb2bd146a4c7ea611eb`; worktree dirty, with exact source hashes in raw JSON.
- Final QA run: `docs/evidence/current/presentation-html-final-20261012-final/`.
- UTC, exact hashes and screenshot inventory: `html-deck-qa.json` in the current evidence folder.
- Environment: Windows `win32`, Node `v24.19.0`, Playwright `1.56.1`, Chromium `141.0.7390.37`; desktop `1440×900`, mobile `390×844`.
- HTML, PDF and companion SHA-256 values: recorded in `html-deck-qa.json` in the current evidence folder.
- Result: 16 PASS, 0 FAIL, 0 BLOCKED, exit code 0; 39 screenshots.
- Static PDF: 15 pages; SHA-256 `527943468f9dd454368707bed2b2f5ece3d0f36520782b13e4073b543ffef5dd`.
- Current report PDF render QA: [`report-render-final-20261012-05`](../docs/evidence/current/report-render-final-20261012-05/) records page counts and hashes for the business report, architecture report, and slide fallback. It checks for empty pages, Thai text, replacement glyphs, and image objects. Contact sheets and representative full-size pages were visually inspected. Existing IBM Plex Sans Thai fallback was used because TH Sarabun New is not installed on this Windows environment.
- Test mode: local HTML; no API, LLM, OCR, payment, or deployment calls. External requests were blocked for companion tests; AntV Infographic `0.2.20` is served from the local vendor bundle.

## Requirement → Test → Evidence

| Requirement | Test | Expected / actual | Status | Evidence |
|---|---|---|---|---|
| Core 8–10 slides, separate appendix, complete notes, <=9:00 planned speech | HTML-01 | 15 total = 10 core + 5 appendix; 510 seconds; notes complete | PASS | `html-deck-qa.json` |
| Architecture, journey, and handoff diagrams match approved density | HTML-02 | 7 architecture nodes, 5 journey steps, 3 roles, no nested slides | PASS | `html-deck-qa.json`; slide captures |
| LabClear theme and Thai typography | HTML-03 | Local body/display fonts loaded; document language is Thai | PASS | `html-deck-qa.json`; `THEME_AUDIT.md` |
| Navigation, notes, and slide counter | HTML-04 | Next/back, notes, and counter behaved as expected | PASS | `html-deck-qa.json` |
| Desktop slide fit | HTML-05 | 15/15 slides fit their frames | PASS | 15 fresh desktop captures |
| Required image and mobile-reading controls/layout | HTML-06–08 | Image loaded; controls restore; 15/15 mobile slides have no horizontal overflow | PASS | 15 fresh mobile captures; JSON |
| Workflow companion and its reduced-motion/no-JavaScript modes | HTML-09, HTML-10, HTML-14 | Scroll, step, replay, pause, completion, mobile and no-JS fallback passed | PASS | Companion captures; JSON |
| Static print and PDF export | HTML-11, HTML-12 | 15 print pages; one slide per page; valid PDF signature; 15 PDF page objects | PASS | `PRES-PRINT-01-static-opening.png`; `LabClear-static-print.pdf`; JSON |
| Accessible labels, local source links, no browser errors | HTML-13, HTML-16 | Expected Thai labels/links; 0 browser errors | PASS | JSON |
| Editable interactive infographic and offline fallback | HTML-15 | Local render, text edit, SVG export, mobile/no-JS fallback, zero external requests | PASS | Infographic captures and exported SVG |
| Business wording and pricing claims match local demo evidence | BR-01 | Catalog wording corrected; configured prices remain demo values; demand and unit economics remain unverified | PASS for source review only | Business report; `SOURCE_MAP.md`; current business-review record |

## Business Review

The GL-05 Marketing review at `docs/evidence/current/gl05-settlement-role-fence-20261011/marketing-review-gl05-20261011.md` applies to an older `73d24b9` candidate and is retained only as historical advice. A read-only business review of the current source found demo-catalog wording and UAT-provenance mismatches; follow-up confirmed those corrections. The review record is `docs/evidence/current/business-review-presentation-20261012.md`. Its reviewer was a generic subagent applying marketing-strategy/pricing-offers, not a configured Marketing Agent, and separate account authentication was not established. Neither review is customer research, financial validation, or formal marketing approval.

## Before and After

- Earlier run `presentation-html-final-20261012-v7`: 14 PASS, 1 FAIL, 1 BLOCKED. The interactive flow assertion expected a complete first frame instead of step 0, and the infographic depended on remote modules/resources.
- A fresh run exposed the export-path mismatch: the test printed the normal HTML route and counted 28 PDF pages. The actual static-deck export path is Reveal.js `?print-pdf`; the test now opens that exact route and asserts one slide per page. The final PDF has 15 pages.
- Current run `presentation-html-final-20261012-final`: 16 PASS, 0 FAIL, 0 BLOCKED. It records 39 fresh screenshots. Its HTML SHA-256 is `55bb0d3ea0e1d24c2c4ab8e799fae89e307507e866c469bf345c93c4ce289609`; the static PDF SHA-256 is `527943468f9dd454368707bed2b2f5ece3d0f36520782b13e4073b543ffef5dd`. The v7 run remains as before/fix regression evidence; the intermediate final4 JSON-only record preserves the 28-page pagination regression.

## Evidence Limits and Remaining Risks

- The 37/37 app UAT is local workflow evidence from synthetic fixtures with mocked LLM/OCR. It is not real-user acceptance, model quality, clinical accuracy, or evidence of production privacy/reliability.
- Package, price, booking, payment, and settlement examples are simulated. No live catalog price or plan was changed.
- Clinical validation, live model/OCR evaluation, production privacy, retention/restore, reliability, market demand, and unit economics remain `NOT_RUN` or `NOT_VERIFIED` in their source reports.
- Spoken rehearsal was not recorded. The 8:30 notes plus 0:30 reserve are planned arithmetic, not proof of delivery time.
- HTML source editing is available; separate no-code slide-editor editing is not claimed. The static PDF is a view/export artifact and is not editable slide source.
