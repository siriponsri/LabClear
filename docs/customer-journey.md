# Customer journey

LabClear has one story: from the report you have to the check you need. A customer can start without an account. An account is needed to book, pay, subscribe, request a quotation and keep reports across visits.

Pages are server-rendered by [`routers/site.py`](../routers/site.py) (templates in [`templates/site/`](../templates/site)). The customer workspace `/app` and the service desk `/staff` use [`templates/workspace.html`](../templates/workspace.html) and [`static/js/workspace.js`](../static/js/workspace.js). All API routes below are under `/api/business` unless stated otherwise; see [api.md](api.md) for the full list.

## Main path: from a lab report to a booked check

| Step | The customer | LabClear | Where |
|---|---|---|---|
| 1. Send the report | Attaches a photo or PDF in the chat (paperclip, drag and drop or paste), with an optional question, or picks a synthetic sample | Shows the file in the message, reads it and streams each step | `/app` chat; `POST /chat/report` |
| 2. Confirm the values | Compares the rows with the image and clicks **Values are correct, this is my report**, or **Edit values** first | Nothing is explained, saved to the dashboard or used later before this click. A draft can be discarded | `POST /chat/report/confirm`, `POST /chat/report/discard` |
| 3. Understand each value | Reads the explanation and its numbered sources | The Report Explainer compares each value only with the range printed on the same report and cites sources; no diagnosis | Chat answer, "Process Explainability" |
| 4. Ask about a follow-up check | Clicks **Find a follow-up check** or asks in their own words | The Health-check Advisor shows matching packages and prices; follow-up tests need staff review | Chat, `/packages?segment=individual&review=only` |
| 5. Request a time | Picks a center, date and 30-minute slot | Staff confirm or decline with a reason; payment opens after confirmation | `/app?view=book`, `/app?view=bookings` |

Step 4 is always the customer's choice. The assistant never offers a package because a value is outside its range.

## Flows

### Guest chat

| Item | Behaviour | Code |
|---|---|---|
| Start | `/app`, or **Ask LabClear** on any website page (the page being viewed is sent as context) | `static/js/dock.js`, `GET /session` |
| Session | A temporary guest session; its token lives in page memory and is sent in a header | `routers/business.py`, `static/js/api.js` |
| Chat | Answers stream step by step; a failed message can be retried; **Stop** ends the turn | `POST /chat`, `POST /chat/retry`, `POST /stop`, `POST /new-chat` |
| Storage | Guest chats and images stay in server memory only, never in the database, disk or browser storage. Refreshing, leaving, closing the page or signing in discards them; idle data expires after 20 minutes | `services/guest_memory.py`, `POST /guest/close` |
| Limits | One free AI reading. Booking, payment, quotations, Plus, chat history and projects need an account | `services/business_plans.py`, `routers/business.py` |

A signed-in customer gets the same conversation in `/app` and in the website dock, a chat list with projects (`/api/business/chats`, `/api/business/projects`) and saved reports.

### Packages and comparison

| Step | Route |
|---|---|
| Browse and filter by text, segment, staff review, center, price; sort | `/packages` (`GET /catalog/search`) |
| Package detail with tests, price and actions (ask, request a time, organizations) | `/packages/{id}` |
| Compare two or three packages test by test | `/compare?ids=P01,P02` (`GET /catalog/compare`) |
| Ask the assistant about a comparison | `/app?compare=P01,P02` prefills the question; when the planner proposes two to four packages, the comparison tool gives the writer a deterministic table |

### Appointment request, confirmed by staff

1. The customer picks a package, center, date and slot on `/app?view=book` (`GET /slots`, `POST /bookings`), or confirms a `book` preview from the chat (`POST /confirm`).
2. The server checks the slot: within 30 days, Monday to Saturday, 07:00–15:30 on the hour or half hour, capacity 3 per slot. Follow-up packages cannot be booked directly.
3. The request appears on `/staff` → Appointments. Staff confirm or decline with a note (`POST /staff/bookings/{id}/decision`). The customer is notified and can add a confirmed appointment to a calendar (`GET /bookings/{id}/calendar.ics`).
4. Changes go through `POST /bookings/{id}/change`: a request can be withdrawn; a confirmed appointment can be cancelled or rescheduled 24 hours or more before the slot (a new slot needs a new staff confirmation); later changes and refund requests become a staff ticket.

### Simulated payment

| Step | Behaviour | Route |
|---|---|---|
| Start | Only for a confirmed appointment. Methods: card, PromptPay or at the center | `POST /payments/checkout`, or a `pay` preview in the chat |
| Pay | The payment simulator page acts as the payer's test bank app and sends a signed event (success, failure, expire, cancel). No real money moves | `/pay/sim/{txn_id}`, `POST /payments/simulator/{txn_id}/events` |
| At the center | Staff record the payment | `POST /staff/bookings/{id}/settle` |
| Refund | Manager only | `POST /staff/bookings/{id}/refund` |

### AI Lab Report

| Step | Route |
|---|---|
| How it works, plans and sources | `/lab-reports`, `/sources` |
| Read in the chat (main path above), or upload on My reports | `POST /chat/report`, `POST /reports/read` |
| Synthetic samples (free, not counted) | `GET /demos`, `POST /demos/{id}/read`, `GET /api/samples/{id}/{png or pdf}` |
| Confirm on My reports (the customer confirms the report is the same person's) | `POST /reports/confirm` |
| Use a confirmed report in the chat, or compare with an earlier one | `POST /reports/select`, `POST /reports/compare` |
| Lab Report: every value on its printed range, status computed in Python | `/lab-report/{id}` (`GET /reports/{id}/lab-report`) |
| Delete a report; chats that used it are cleared | `DELETE /reports/{id}` |

### LabClear Plus

1. The customer opens `/app?view=plan` and starts a checkout by card or PromptPay (`POST /subscriptions/checkout`). An account is required.
2. The payment simulator completes the order. Plus becomes active for 30 days on a signed success event; it does not renew automatically and can be renewed in the last 7 days.
3. Plus unlocks readings without the one-report limit (up to 3 pages or images each), the lab dashboard over time (`/app?view=labs`, `GET /reports/trends`) and the change since the previous report.
4. A manager can refund a Plus period (`POST /staff/subscriptions/{id}/refund`); Plus then ends.

### Organizations quotation

1. A signed-in customer fills in the form on `/organizations` (organization, headcount of 20 or more, center or on-site, preferred date, packages P16–P18) (`POST /organizations/inquiries`). A staff ticket is created.
2. Staff take over the ticket on `/staff` → Inbox and issue a quotation from the catalog price times the headcount plus any travel fee (`POST /staff/quotes`). A revision supersedes the open version.
3. The customer sees it in My appointments, downloads the PDF (`GET /quotes/{id}/document.pdf`) and accepts the latest version within 7 days (`POST /quotes/accept`). Acceptance creates a confirmed appointment with payment at the center.

### Official hospital links

Shown only when `HOSPITAL_LINKS_ENABLED` is on (on in `render.yaml`).

- `/hospital-links` lists the reviewed package pages from [`business_data/hospital_links.json`](../business_data/hospital_links.json) with the check date, eligibility, fees and sale or service dates. A price appears only for a current, verified offer.
- After a general package answer, up to three current offers are attached as links. Python adds them after every check; the model never sees them. When a message names a hospital, its reviewed offers become cited evidence instead.
- Links open the hospital's own site in a new tab with no referrer. LabClear sends no results or account details, and no booking or partnership is implied.

## Signing in

| Where | How |
|---|---|
| Any website page | **Sign in** in the header opens a dialog: email and password, or **Continue with Google** when it is configured (customers only) |
| `/app` | **Sign in** at the top right; the avatar menu links to appointments, reports, plan, the service desk (staff) and **Sign out** |
| `/staff` | The sign-in dialog opens; staff and managers who sign in on `/app` are sent to `/staff` |

Demo accounts (`test-01` Free, `test-02` Plus, `admin` manager; password `1234`) are on for local runs and off on a hosted site unless `DEMO_ACCOUNTS=true` (`services/demo_accounts.py`). They are not listed in the dialog.

## What staff do

| Customer event | Staff action on `/staff` |
|---|---|
| Appointment request | Confirm or decline with a reason (Appointments) |
| "Ask our team" or a hand-off | Take over, reply, hand back to the assistant or close (Inbox) |
| Organization request | Issue a versioned quotation |
| Payment at the center | Record it; managers approve refunds |
| Prices, centers, assistant roles, Company Harness, knowledge library, AI providers, budget, audit log | Managers only |

## Pages behind feature flags

| Route | Flag | Default and Render |
|---|---|---|
| `/hospital-links` | `HOSPITAL_LINKS_ENABLED` | Off by default; on in `render.yaml` |
| `/preview/landing` | `LANDING_PREVIEW_ENABLED` | Off |
| `/organization-references` | `ORG_DOCUMENTS_ENABLED` | Off |
