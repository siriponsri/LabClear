# LabClear HTML Presentation Asset Manifest

Primary deliverable: `presentation/index.html`, a Thai-first 16:9 Reveal.js presentation. The HTML and local files are authoritative.

| Asset | Source | Use | Handling / status |
|---|---|---|---|
| LabClear mark | `static/img/mark.svg` | Small brand mark in the deck chrome | Current application asset; remains an SVG. |
| Brand fonts | `static/fonts/` | Thai and Latin body, display and code text | Loaded from local project files; HTML-03 verifies the rendered font faces. |
| Reveal.js 5.2.1 | `presentation/vendor/reveal.js-5.2.1/` | Slide navigation and notes support | Bundled locally with upstream license. |
| Core slide artwork | `presentation/index.html` | Opening route, architecture reveal, diagrams, tables and labels | Factual content stays in HTML text/SVG; no factual slide is rasterized. Reduced-motion and print states are static. |
| Workflow diagram | `presentation/labclear-workflow-diagram.html` | Interactive five-step customer/system/staff process | Inline SVG and local styles; supports step/play/pause/replay and has a complete no-JavaScript state. |
| Infographic source | `presentation/labclear-workflow.infographic` | Editable AntV Infographic DSL | Contains synthetic workflow details only. |
| Infographic runtime | `presentation/vendor/antv-infographic-0.2.20.min.js` | Render and export the companion infographic | Pinned package 0.2.20, bundled locally; MIT notice is beside the asset. Browser QA blocks external requests. |
| Infographic fallback | Inline SVG in `presentation/labclear-interactive-infographic.html` | Readable fallback on mobile and desktop when JavaScript/runtime is unavailable | Five factual steps remain readable and responsive. |
| Browser evidence | `docs/evidence/current/presentation-html-final-20261012-release/` | Actual screenshots and machine-readable results | Release is the retained deck QA run; older folders are historical evidence only. No screenshot is recycled as a new-run result. |
| App UAT source | `docs/evidence/current/browser-uat-final-20261012-03/` | Source for the 37/37 local workflow claim | Synthetic fixture, LLM/OCR mocked; not live quality or clinical evidence. |
| Excluded app screenshot | `docs/evidence/current/browser-uat-final-20261012-03/UI-09_report-review-1440.png` | None | Not used in the deck because displayed report values and identifiers are unnecessary. |

## Privacy and Evidence

- Use synthetic information only. Never expose `.env`, credentials, real customer data or personal identifiers.
- Package, price, booking and payment examples are simulated and must remain labelled as such.
- Playwright screenshots must be captured from the exact run reported in `QA_REPORT.md` and keep their case IDs and hashes.
- Local UI/API workflow results do not establish model quality, clinical validity, production privacy, reliability or customer demand.
