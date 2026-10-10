# Reports

Three Thai reports and the English slide deck for LabClear 4.0.0-rc3. All facts come from the
repository (`business_data/`, `knowledge/`, the code, `docs/evidence/`). Live-model results are the
3.0.x runs on Render; 4.0.0-rc3 has OFFLINE, regression and resilience results only, because its
LIVE_FREE run is blocked at the preflight.

| File | What it is | Built by |
|---|---|---|
| [`LabClear_Final_Project_Report_TH.docx`](LabClear_Final_Project_Report_TH.docx) | Coursework submission report, structured on the Final Project brief. Word only. Missing facts are yellow placeholders `[รอข้อมูล: …]` for the team to fill in Word | `python3 scripts/build_report.py` |
| [`LabClear_Business_Report_TH.pdf`](LabClear_Business_Report_TH.pdf) ([source](LabClear_Business_Report_TH.md)) | Business report: problem, customers, products and prices, customer journey, operations, AI cost control, KPIs, risks, owner decisions | `node scripts/build_docs_pdf.mjs business` |
| [`LabClear_Architecture_Report_TH.pdf`](LabClear_Architecture_Report_TH.pdf) ([source](LabClear_Architecture_Report_TH.md)) | Architecture, tech stack and agent flow in detail, with file references | `node scripts/build_docs_pdf.mjs architecture` |
| [`LabClear_Slides.pdf`](LabClear_Slides.pdf) | The English deck ([`presentation/index.html`](../../presentation/index.html)) as PDF, 12 slides with speaker notes in the HTML | `node scripts/build_docs_pdf.mjs slides` |

## Format

- **Thai Report Format skill** ([`template/`](template/), from
  [we-ever/Thai-Report-Format-skill](https://github.com/we-ever/Thai-Report-Format-skill)): A4, TH Sarabun
  New 16 pt body, real TOC / list of figures / list of tables fields, figure captions below and centred,
  table captions above and left, header rows bold and centred, cells top-aligned, 6 pt after every
  paragraph, no forced line breaks.
- **Report style** follows the LabClear technical report of 4.0.0-rc2: purple headings with a rule under
  chapter titles, tinted header rows with accent rules, a summary call-out, and a footer with the title and
  page number. These visual accents are the only departures from the template. In the Word report the
  chapter titles are left-aligned and purple instead of centred and black, and data tables use 14 pt.
- The Word report asks Word to update fields when it opens (`updateFields`), so the contents pages and page
  numbers are recalculated with the font installed on that machine. Press F9 after filling the placeholders.

## Rebuilding

Needs Python 3 with python-docx, lxml, Pillow and pypdfium2, LibreOffice (`soffice`), Node with
`npm ci` (playwright-core) and Chromium, and the TH Sarabun New font. The font is not stored in this
repository (its licence belongs to the designer); a copy is available from
[Phonbopit/sarabun-webfont](https://github.com/Phonbopit/sarabun-webfont) (`fonts/thsarabunnew*.ttf`).
Install it locally, for example into `~/.local/share/fonts`, then run `fc-cache -f`.

```bash
python3 scripts/build_report.py --check-pdf /tmp/report-check.pdf   # Word report (+ a LibreOffice render to review)
node scripts/build_docs_pdf.mjs all                                 # business, architecture, slides
```

The PDF builder lays TH Sarabun New out with a 1.5 em line box (`ascent-override` in the page CSS) so
stacked Thai marks do not spill onto the previous page.


## Engineering evidence addendum — 2026-10-10

The existing DOCX/PDF/slides are frozen coursework artifacts and have not been rebuilt for the subsequent chat and Hub work. Current evidence is recorded separately in [reviewer/tone validation](../evidence/current/reviewer-tone-20261010/README.md). Eight bounded synthetic UI attempts were measured on the deployed chat follow-ups; results were **not all pass** and are not the coursework LIVE_FREE 10/5/5 evaluation. The latest grounding/language patch is deployed at ebcdc06, but its two planned live checks remain pending approval. The original coursework offline score remains 15/20 for each profile; fresh OCR, owner/contribution data, video and coursework live results remain open. Do not replace missing values with these partial tests.
