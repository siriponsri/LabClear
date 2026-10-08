<!-- ceo-upgrade-20261008 -->

## Official external offers

The optional hospital-links catalog is separate from this simulated clinic. Official
URLs do not establish partnership, current eligibility or a confirmed booking.
Unknown prices/inclusions stay unknown; stale prices are hidden. No external offer
is automatically mapped to a clinical recommendation or local appointment.

The 2026-10-08 upgrade is a disabled-by-default software candidate. Its current scope, evidence, configuration and remaining owner gates are recorded in the [upgrade index](ceo-upgrade/README.md). Earlier release counts and screenshots below are historical; they do not establish live model or clinical validation.

# The business

LabClear is a simulated, small multi-branch health-check clinic built for the course 06048308 Intelligent Chatbot Development. Every package, price, center, policy, payment and lab report in this repository is synthetic. No real person's data is used.

The source of truth for everything on this page is the JSON in [`business_data/`](../business_data). The website, the chatbot and the staff desk all read the same files, so an answer can never quote a price or a policy that the website does not show.

## What LabClear sells

| Product | What the customer gets | How it is paid |
|---|---|---|
| Health-check packages | A visit to one of three centers for a set of laboratory tests | Per visit, at the center or by test PromptPay or card after staff confirm the booking |
| AI Lab Report | The AI reads a photo or PDF of a lab report, the customer confirms the values, and the Report Explainer explains each one with sources | Free plan: one reading. LabClear Plus: ฿355 for 30 days, no automatic renewal |

## Target customers

| Group | What they need | Where LabClear serves them |
|---|---|---|
| Adults with a lab report in hand | Understand what each value means, without a diagnosis | Chat: attach the report, confirm, ask |
| Adults planning a check-up | Choose a package by need and budget, then book | Health checks, Request a time, Health-check Advisor |
| People following a result | See the same test over several reports | Lab dashboard (LabClear Plus) |
| HR teams (20 or more people) | Corporate packages, on-site service and a quotation | Organizations page, staff quotation |
| Clinic staff and managers | Confirm bookings, answer customers, set prices and AI providers | Service desk at `/staff` |

## Packages

Catalog version `2026-10-05-proposed`, 18 items (the brief asks for at least 15).

| ID | Package | Tests | Price (THB) | Booking |
|---|---|---|---|---|
| P01 | Essential Check | CBC, fasting glucose, creatinine/eGFR, urinalysis | 1,190 | Book directly |
| P02 | Workday Check | CBC, fasting glucose, lipid profile, creatinine/eGFR, ALT, urinalysis | 1,690 | Book directly |
| P03 | Comprehensive Check | CBC, HbA1c, lipid profile, creatinine/eGFR, liver panel, urinalysis | 2,890 | Book directly |
| P04 | Family Pair | Essential Check for two adults | 2,290 per pair | Book directly |
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

Follow-up tests are reviewed by staff before booking, so a value outside its range never turns into an automatic sale.

## Centers

| ID | Center | Hours | Visits per 30-minute slot |
|---|---|---|---|
| BKK01 | Bangkok Ari Demo Center | Mon–Sat 07:00–16:00 | 3 |
| CNX01 | Chiang Mai Suthep Demo Center | Mon–Sat 07:00–16:00 | 3 |
| KKC01 | Khon Kaen City Demo Center | Mon–Sat 07:00–16:00 | 3 |

Appointments can be requested up to 30 days ahead, Monday to Saturday, 07:00–15:30.

## Policies

Version `2026-10-06-customer-copy` in [`business_data/policies.json`](../business_data/policies.json). The chatbot quotes these and nothing else.

| Topic | Policy |
|---|---|
| Discounts | There are no automatic discounts. Only a promotion approved by an authorized manager can change a quotation. |
| Cancel and reschedule | A request can be withdrawn at any time. Once confirmed, rescheduling or cancelling is free 24 hours or more before the slot; closer than that, and for any refund, staff review the request. |
| Refunds | Staff review refunds for paid appointments. Approval and processing time are not guaranteed. |
| Payment | At the center, or with a test PromptPay or card payment that moves no real money. A screenshot is not proof of payment; card numbers are never asked for in chat. |
| Preparation and results | Preparation and result timing come from staff for each appointment. No universal fasting rule or turnaround time is promised. |
| On-site service | For organizations only; staff check feasibility and quote any travel fee. No home visits. |
| Staff hours | Monday to Saturday, 07:00–16:00 Bangkok time. Outside those hours requests wait in the queue. Urgent health concerns should go to emergency or medical services. |
| Privacy | Synthetic data only. Employers receive coordination information, never an employee's lab results. |
| Quotations | Valid 7 days. Organizations need at least 20 people. |

## AI Lab Report plans

| Plan | Price | Includes |
|---|---|---|
| Free | ฿0 | AI reads one report image; Lab Report with every value on its printed range; questions to the Report Explainer with sources; synthetic sample reports |
| LabClear Plus | ฿355 for 30 days | Everything in Free; readings without the one-report limit, up to 3 pages or images each; lab dashboard over time; change since the previous report; printable Lab Report |

## Why customers send images

The image scenario required by the brief is the lab report itself. A customer photographs or exports the report they received (from LabClear or another laboratory) and attaches it in the chat. Six synthetic reports in three layouts are bundled in [`examples/thai_lab_reference_v3`](../examples) for testing; they contain invented names and values only.

## Ten frequent questions

| # | Question | Answer, from clinic data |
|---|---|---|
| 1 | What packages are there and how much? | 18 items from ฿290. Core packages: Essential ฿1,190, Workday ฿1,690, Comprehensive ฿2,890, Family Pair ฿2,290 per pair. |
| 2 | Which package fits my budget? | The Health-check Advisor compares tests and prices from the catalog and gives options with reasons. |
| 3 | What does a package include? How do two packages differ? | Lists the real tests; the comparison view shows up to three packages test by test. |
| 4 | Where are the centers and when are they open? | Three centers, Monday to Saturday 07:00–16:00. |
| 5 | How do I book, and when is it confirmed? | Choose a package, center, date and 30-minute slot; staff confirm or decline and the customer is notified. |
| 6 | Can I cancel or reschedule? | Free 24 hours or more before a confirmed slot; later changes are reviewed by staff. |
| 7 | How can I pay? | At the center or by test PromptPay or card, after staff confirm. |
| 8 | Can I get a refund? | Staff review refunds; approval is not guaranteed. |
| 9 | Can my company book check-ups for employees? | Yes, for 20 or more people; staff issue a versioned quotation with a PDF. |
| 10 | Can you read my lab report? What does this value mean? | Attach it in the chat, confirm the values, then ask. Answers cite sources and never diagnose. |
