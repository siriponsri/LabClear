# Render QA: reports after GL-03 update

Render command (using the Playwright Chromium installed in this Windows environment):

```text
CHROMIUM=C:\Users\User\AppData\Local\ms-playwright\chromium-1194\chrome-win\chrome.exe node scripts/build_docs_pdf.mjs business
CHROMIUM=C:\Users\User\AppData\Local\ms-playwright\chromium-1194\chrome-win\chrome.exe node scripts/build_docs_pdf.mjs architecture
```

## Checks

| Artifact | Result |
|---|---|
| `LabClear_Business_Report_TH.pdf` | 15 pages; all pages contain text; Thai text and GL-03 section extracted; no replacement glyph found |
| `LabClear_Architecture_Report_TH.pdf` | 27 pages; all pages contain text; Thai text and GL-03 section extracted; no replacement glyph found |
| Images | PDF builder image completeness check passed; existing architecture figures remain present |
| Tables | New tables rendered with the existing purple header rule/tint and repeated header on page continuation |
| Page breaks | New business table continues across pages without clipping; architecture GL-03 section continues across pages without overlap |
| Font/theme | Existing CSS/template and purple accent theme unchanged. `TH Sarabun New` is not installed in this Windows environment, so the builder's existing embedded `IBM Plex Sans Thai` fallback was used and rendered Thai glyphs correctly. |

Representative fresh page renders are stored here: business pages 11 and 13, architecture pages 24 and 25. They are QA renders of the rebuilt PDFs, not product screenshots or substitute Playwright evidence.
