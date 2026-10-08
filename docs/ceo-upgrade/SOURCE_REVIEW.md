# Source coverage and acquisition review

## Before / after

| Measure | Baseline | Candidate |
|---|---:|---:|
| Active catalog records | 58 | 58 |
| Publisher groups in active catalog | 4 | 4 |
| Newly approved clinical source families | 0 | 0 |
| Proposed acquisition records | — | 15 |
| Proposals matching an existing source URL | — | 6 |
| New complete clinical documents ingested | 0 | 0 |

The 58 records are catalog entries, not 58 independent clinical guidelines. No
coverage gain or expert approval is claimed from this queue. Existing source
records and review history are retained. `knowledge/acquisition/medical_sources.json`
adds duplicate links, current review status, null content hashes and empty reviewed
sections. Its prior access notes are inherited intake evidence, not fresh downloads.

| Topic gap | Acquisition priority | Release boundary |
|---|---|---|
| Appropriate screening / avoiding unnecessary tests | DMS screening guideline | Rights and section-level clinical review pending |
| Diabetes / HbA1c | Thai diabetes guideline family | Mirrored PDFs count as one family; full text not ingested |
| Renal / lipid / laboratory interpretation | Professional guidelines and public education | Match scope, population, year and assay before approval |
| Organization-specific instructions | Authored synthetic document lifecycle | Real organizations require G-DATA, membership/retention review |

Acquisition workflow: identify canonical publisher and version; record landing and
download URLs; verify access/rights; hash acquired bytes; deduplicate by family and
version; review named sections and applicability; record reviewer/date; approve
explicit records; only then add to active retrieval. Failed access remains queued.
Metadata ownership does not grant redistribution rights. This candidate contains
no downloaded full guideline, protected portal export or organization original.

## Official offer checks on 2026-10-08

- [Samitivej diabetes and health check program](https://www.samitivejhospitals.com/package/detail/advance-diabetic-check-up-program):
  official page showed 7,500 THB, Sukhumvit branch, included doctor/hospital fees,
  Thai/resident eligibility and sale end 2026-12-31. Service end and exact test
  mapping remain unknown. Review validity is conservatively limited to the check
  date, so subsequent dates hide the price until reviewed again.
- [Bangkok Hospital annual health check packages](https://www.bangkokhospital.com/th/bangkok/package/health-check-up-packages):
  multi-variant page, not a single fixed offer. Candidate stores no exact price,
  no inferred inclusions and no invented sale/service deadline; status UNVERIFIED.

`knowledge/acquisition/hospital_research.json` retains six research proposals. Only
the two checked official destinations are in the opt-in public links page. Neither
establishes partnership or a booking. The existing simulated catalog stays separate.
Tests cover expired sale versus service date, future sale, stale review, unknown
price/variant and forbidden outbound query/fragment/userinfo/private host URLs.

## Runtime documentation checks

- [Santé model page](https://openrouter.ai/inclusionai/ling-3.0-flash-sante:free):
  response-format enforcement unavailable; use application schema validation.
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection):
  new role requests restrict reviewed endpoint IDs and disable routing fallback.
- [Typhoon OCR documentation](https://docs.opentyphoon.ai/en/ocr/): reviewed as a
  compatibility reference; existing app OCR adapter remains. No helper dependency
  or OCR request was added.
- [MedlinePlus laboratory ranges](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/):
  educational link in the synthetic preview; personal ranges must come from the report.

Exact account pricing, quota, retention guarantees, resolved model version, Clef
coverage and clinical performance are NOT_VERIFIED. No provider catalog search
or successful schema check substitutes for a live evaluation.
