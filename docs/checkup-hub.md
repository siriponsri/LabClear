# Checkup Hub (coursework demo)

The read-only Hub at `/hub` is separate from the existing three-center LabClear catalog. It reuses the single FastAPI service, public template shell, fonts, design tokens and Thai-first translation engine. No partner integration has been implemented.

All six providers, package names, prices, locations and included-test lists are synthetic examples. Every card, detail and comparison carries “Demo only. No partnership agreements.” (Thai: “สาธิต ยังไม่มีข้อตกลงพาร์ตเนอร์”) and fictional-price disclosures. No real names, logos, endorsements, reviews, discounts or current offers are asserted. The HDmall reference was used for discovery/filter/detail concepts only, not copied content or styling.

## Behavior and boundary

- Search (Thai/English aliases), location, provider type, category, maximum demo price and order.
- Details with included and excluded items; compare two or three examples.
- On-screen inquiry simulation with fixed time/topic choices only: no names, contact fields, health details or free text. The completion message explicitly says no appointment, payment or contact occurred.
- Hub JavaScript uses only page memory. It does not call fetch, persist selection, create a booking or write to the business database.
- The server accepts read-only GET routes; there is no Hub POST or provider endpoint. Public filters are URL query parameters, so the interface does not request sensitive information.
- Existing official hospital references retain their separate provenance/expiry logic and are not treated as Hub offers or partner agreements.
- Choosing more tests is not presented as a clinical recommendation.

## Local verification

Run `python scripts/offline_check.py pytest -q tests/test_checkup_hub.py`.
After integrating the router and rebuilding the i18n dictionary, run the existing isolated offline browser fixture and `node tests/browser/hub.cjs` with `BASE` set to its loopback URL. The test refuses a non-loopback origin. It covers filters/empty/reset, details, comparison limit/remove/clear, the demo inquiry, no inquiry network traffic or persistent storage, Thai/English, mobile and the unchanged three-center catalog.

No live provider, real booking, payment or deployment verification is implied by these local tests.

## Verified local result (2026-10-10)

- Focused offline pytest: **18 passed** (final run 0.87s). One inherited Starlette/httpx deprecation warning; no failures.
- Offline browser: **13/13 groups passed** at 320, 390, 768 and 1440 pixels, including translated provider names after screenshot review. Zero JavaScript errors and zero external requests.
- Inquiry actions produced zero requests and no local/session storage changes. Native GET filters also passed with JavaScript disabled and a blank budget.
- Existing `/centers` still showed exactly three centers. No original catalog data was edited.
- Evidence: `test-results/hub-pytest.log`, `test-results/hub-browser-run.log`, `test-results/hub-browser/results.json` and screenshot PNGs beside it. Root integration owns combined-suite evidence, commit and any later release decision.

This result verifies the local demo only. No Hub deployment, partnership, real booking or payment has been performed.

### Screenshot geometry follow-up

The tall full-page PNGs can appear compressed in a resized preview. An independent offline DOM inspection found no trailing layout region: at 390px, document height was 5142px and the footer bottom 5140.70px; at 1440px, 2850px and 2848.81px. No element with `[hidden]` occupied a nonzero rectangle. Original-resolution captures show the footer at the page end and normal text sizes. No CSS correction was needed. See `test-results/hub-browser/layout-inspection.json` and the added `hub-390-viewport.png` / `hub-1440-viewport.png` for readable viewport evidence.
