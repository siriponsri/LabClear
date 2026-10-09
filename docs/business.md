# The business

LabClear is a simulated multi-branch health-check clinic with an AI lab-report reader. It was built for the course 06048308 Intelligent Chatbot Development. The packages, prices, centers, payments, staff accounts and lab reports are synthetic. No real person's data is used.

The source of truth is the JSON in [`business_data/`](../business_data). The website, the chatbot and the service desk read the same files, so the assistant cannot quote a price or a policy that the website does not show.

## What LabClear sells

| Product | What the customer gets | How it is paid |
|---|---|---|
| Health-check packages | A visit to one of three centers for a set of laboratory tests | At the center, or by test PromptPay or card after staff confirm the appointment |
| AI Lab Report | The AI reads a photo or PDF of a lab report, the customer confirms the values, and the Report Explainer explains each value with sources | Free plan: one reading. LabClear Plus: 355 THB for 30 days, no automatic renewal |

## Target customers

| Group | Need | Where LabClear serves them |
|---|---|---|
| Adults with a lab report | Understand each value without a diagnosis | Chat: attach the report, confirm the values, ask |
| Adults planning a check-up | Choose a package by need and budget, then book | Health checks, comparison, Request a time, Health-check Advisor |
| People following their results | See the same test across several reports | Lab dashboard (LabClear Plus) |
| HR teams of 20 or more people | Corporate packages, on-site service, a quotation | Organizations page, staff quotation |
| Clinic staff and managers | Confirm appointments, answer customers, manage prices and AI settings | Service desk at `/staff` |

## Packages

[`catalog.json`](../business_data/catalog.json), version `2026-10-05-proposed`, currency THB. 18 packages in two segments: 15 `individual` and 3 `organization`. Every package is offered at all three centers. Each record is marked `is_demo: true` and `clinical_approval: false`.

| ID | Package | Tests | Price (THB) | Booking |
|---|---|---|---:|---|
| P01 | Essential Check | CBC, fasting glucose, creatinine/eGFR, urinalysis | 1,190 | Direct request |
| P02 | Workday Check | CBC, fasting glucose, lipid profile, creatinine/eGFR, ALT, urinalysis | 1,690 | Direct request |
| P03 | Comprehensive Check | CBC, HbA1c, lipid profile, creatinine/eGFR, liver panel, urinalysis | 2,890 | Direct request |
| P04 | Family Pair | Essential Check for two adults | 2,290 per pair | Direct request |
| P05 | Glucose Follow-up | Fasting glucose, HbA1c | 590 | Staff review first |
| P06 | Lipid Follow-up | Total cholesterol, triglycerides, HDL, direct LDL | 590 | Staff review first |
| P07 | Kidney Follow-up | BUN, creatinine/eGFR, urinalysis | 690 | Staff review first |
| P08 | Liver Follow-up | ALT, AST, ALP, albumin, bilirubin | 890 | Staff review first |
| P09 | Blood Count Review | CBC | 390 | Staff review first |
| P10 | Thyroid Function Review | TSH, free T4 | 990 | Staff review first |
| P11 | Urine Albumin Review | Urine albumin to creatinine ratio | 590 | Staff review first |
| P12 | Electrolyte Review | Sodium, potassium, chloride, bicarbonate | 490 | Staff review first |
| P13 | HbA1c Add-on | HbA1c | 350 | Staff review first |
| P14 | Direct LDL Add-on | Direct LDL cholesterol | 290 | Staff review first |
| P15 | Ferritin Review | Ferritin | 650 | Staff review first |
| P16 | Corporate Essential | As P01 | 990 per person | Organizations (20+) |
| P17 | Corporate Workday | As P02 | 1,490 per person | Organizations (20+) |
| P18 | Corporate Extended | As P03 | 2,390 per person | Organizations (20+) |

The website groups the catalog as core checks (P01–P04), follow-up tests (P05–P15, `staff_review_required: true`) and organization packages (P16–P18). A follow-up test is reviewed by staff before booking, so a value outside its range never becomes an automatic sale.

## Centers

[`branches.json`](../business_data/branches.json). Each pin is an area marker only; no clinic operates there.

| ID | Center | Area | Hours | 30-minute slot capacity |
|---|---|---|---|---:|
| BKK01 | Bangkok Ari Demo Center | Phaya Thai, Bangkok | Mon–Sat 07:00–16:00 | 3 |
| CNX01 | Chiang Mai Suthep Demo Center | Suthep, Chiang Mai | Mon–Sat 07:00–16:00 | 3 |
| KKC01 | Khon Kaen City Demo Center | Mueang Khon Kaen | Mon–Sat 07:00–16:00 | 3 |

All centers are closed on Sunday. An appointment can be requested up to 30 days ahead, Monday to Saturday, for a half-hour slot from 07:00 to 15:30 (enforced in `routers/business.py`).

## Policies

[`policies.json`](../business_data/policies.json), version `2026-10-06-customer-copy` (source ID `RS-POLICY-20261005`). The chatbot quotes these and nothing else.

| Topic | Policy |
|---|---|
| Discounts | No automatic discounts. Only a promotion approved by an authorized manager can change a quotation. |
| Cancel and reschedule | A request can be withdrawn at any time. A confirmed appointment can be rescheduled or cancelled free of charge 24 hours or more before the slot. Closer than that, and for any refund, staff review the request. |
| Refunds | Staff review refunds for paid appointments. Approval and processing time are not guaranteed. |
| Payment | At the center, or by a test PromptPay or card payment that moves no real money. A screenshot is not proof of payment. Card numbers are never requested in chat. |
| Preparation and results | Staff give preparation and result timing for each appointment. No universal fasting rule or turnaround time is promised. |
| On-site service | Organizations only. Staff check feasibility and quote any travel fee. No home visits. |
| Staff hours | Monday to Saturday, 07:00–16:00 Bangkok time. Requests outside those hours wait in the queue. Urgent health concerns go to emergency or medical services. |
| Privacy | Synthetic data only. Employers receive coordination information, never an employee's lab results. |
| Quotations | Valid for 7 days. Organizations need at least 20 people. |

## AI Lab Report plans

[`plans.json`](../business_data/plans.json), version `2026-10-06-plans`. Entitlements are enforced on the server (`services/business_plans.py`).

| Plan | Price | Includes |
|---|---|---|
| Free | 0 THB | One AI reading of one image; a Lab Report with every value on its printed range; questions to the Report Explainer with sources; synthetic sample reports (free, not counted) |
| LabClear Plus | 355 THB for 30 days | Everything in Free; readings without the one-report limit, up to 3 pages or images each; lab dashboard over time; change since the previous report; printable Lab Report |

Plus is paid through the payment simulator and does not renew automatically.

## Knowledge base

The assistant cites medical facts only from [`knowledge/evidence/catalog.json`](../knowledge/evidence/catalog.json), version `2026-10-09-owner-approved-148`: 148 records, of which 58 are legacy reviewed records and 90 are summaries approved by the owner on 2026-10-09. The 90 added records carry the status `OWNER_APPROVED_SOURCE_CHECK_PENDING`: their links and paraphrases have not been checked against the source pages, and none is clinically validated.

## Ten frequent questions

The coursework test questions (see [testing.md](testing.md)) use the same topics.

| # | Question | Answer from LabClear data | Source |
|---|---|---|---|
| 1 | What packages are there, and how much? | 18 packages from 290 THB. Core: Essential 1,190, Workday 1,690, Comprehensive 2,890, Family Pair 2,290 per pair | `catalog.json` |
| 2 | I have 1,500 THB. Which package fits? | Essential Check (1,190) is within budget. Workday Check (1,690) adds a lipid profile and ALT. No discount is offered | `catalog.json`, `policies.json` (discounts) |
| 3 | What does Workday Check include, and how does it differ from Essential Check? | The catalog test lists; the comparison view and the comparison tool show up to three packages test by test | `catalog.json` |
| 4 | Where are the centers, and when are they open? | Three demo centers, Monday to Saturday 07:00–16:00, closed Sunday | `branches.json` |
| 5 | How do I book, and when is it confirmed? | Choose a package, center, date and 30-minute slot up to 30 days ahead. Staff confirm or decline with a reason | `branches.json`, `policies.json` |
| 6 | Can I cancel or reschedule? | Free 24 hours or more before a confirmed slot; later changes are reviewed by staff | `policies.json` (cancellation) |
| 7 | How can I pay? | At the center, or by test PromptPay or card after staff confirm. No real money moves | `policies.json` (payment) |
| 8 | Can I get a refund? | Staff review refunds; approval and timing are not guaranteed | `policies.json` (refund) |
| 9 | Can my company book check-ups for employees? Do you come to our office or home? | Yes, for 20 or more people: Corporate Essential 990, Workday 1,490, Extended 2,390 per person. Staff issue a versioned quotation (PDF), valid 7 days. On-site service is for organizations; no home visits | `catalog.json`, `policies.json` (on-site, quotations) |
| 10 | Can you read my lab report? What does this value mean? | Attach a photo or PDF in the chat and confirm the values. Each value is compared only with the range printed on the same report, with cited sources and no diagnosis. Free reads one report | Knowledge base, confirmed report, `plans.json` |

## Official hospital links

[`hospital_links.json`](../business_data/hospital_links.json) (version `2026-10-09-review2`) lists 7 package pages on official hospital websites, all with the check date 2026-10-09. One of them (HOSP-005) could not be re-read automatically on that date and stays unverified. These offers are real external pages, not part of the simulated clinic. No partnership or booking is implied, and no offer is mapped to a clinical recommendation. A price is shown only while the offer is current (state `VERIFIED`); unknown prices stay unknown and expired offers show no price. On 2026-10-09, four offers had a current price, two were unverified and one sale period had ended. The page is enabled by `HOSPITAL_LINKS_ENABLED` (on in [`render.yaml`](../render.yaml)).

## What is simulated

| Item | Status |
|---|---|
| Packages, prices, centers, staff accounts | Simulated (`is_demo: true`). Center pins are area markers only |
| Payments | Built-in payment simulator with signed events; no real money. A Stripe test path exists only when `BUSINESS_EXTERNAL_ENABLED=true` (off on Render) |
| LINE channel | Simulator on the service desk |
| Lab reports | Synthetic sample reports in [`examples/`](../examples); uploads must be synthetic |
| Assistant roles | AI roles with server-enforced permissions, not people or clinicians |
| Medical explanations | Paraphrased public references; not clinically validated |
| Hospital links | Real public pages, quoted as recorded on the check date |
| AI | Live only when the owner connects providers; otherwise the assistant says it is unavailable |
