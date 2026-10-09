# API reference

Endpoints of LabClear 4.0.0-rc3, grouped by router. Paths are complete. The interactive schema is at
`/docs` when the app runs.

## Conventions

- Start with `GET /api/business/session`. It returns the CSRF token and, for a visitor who is not
  signed in, a guest token. Signed-in sessions use the `labclear_session` cookie; guests send
  `X-LabClear-Guest` from page memory.
- Every `POST`, `PUT`, `PATCH` and `DELETE` that needs a session sends `X-Business-CSRF`.
- The browser `Origin` must match the service host (or an entry in `TRUSTED_ORIGINS`).
- Errors return `{"code": "...", "message": "..."}` with an HTTP status. `/api/*` responses are
  `Cache-Control: no-store`.
- Chat endpoints stream with `Accept: application/x-ndjson`: one JSON object per line,
  `{"type":"step",…}` for each step, then `{"type":"done","result":…}` or `{"type":"error",…}`.
  Without that header they return the plain JSON result.

| Access | Meaning |
|---|---|
| Public | No session needed |
| Session | Guest or signed-in session |
| Account | Signed-in account; guests get `account_required` |
| AI | Session, plus `X-LabClear-Access` when `DEMO_ACCESS_CODE` is set, plus the per-client rate limit |
| Staff | Role `staff`, `clinical` or `manager`; staff and clinical see their own center |
| Manager | Role `manager` |
| Signed | Verified by a webhook signature or a shared secret |
| *Flag* | Returns 404 unless the named feature flag is `true` |

## main.py

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Status, app, environment, version and deployed commit |
| GET | `/app` | Public | Customer workspace page |
| GET | `/staff` | Public | Service desk page (data needs a staff session) |
| GET | `/static/{path}` | Public | CSS, JavaScript, fonts, images, Thai dictionary |

## routers/site.py (website pages)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/` | Public | Home |
| GET | `/packages` | Public | Package catalog with search and filters |
| GET | `/packages/{package_id}` | Public | Package detail |
| GET | `/compare` | Public | Side-by-side comparison (`?ids=`) |
| GET | `/centers` | Public | Demo centers and hours |
| GET | `/organizations` | Public | Organization health checks and request form |
| GET | `/help` | Public | Help and policies |
| GET | `/privacy` | Public | Privacy notice |
| GET | `/sources` | Public | Knowledge records the assistant can currently search |
| GET | `/lab-reports` | Public | AI Lab Report product page |
| GET | `/lab-report/{report_id}` | Public | Printable Lab Report page; values load with the owner's session |
| GET | `/pay/sim/{txn_id}` | Public | Payment simulator page; data loads with the owner's session |
| GET | `/hospital-links` | Public, *HOSPITAL_LINKS_ENABLED* | Official hospital package pages |
| GET | `/preview/landing` | Public, *LANDING_PREVIEW_ENABLED* | Landing page preview |
| GET | `/organization-references` | Public, *ORG_DOCUMENTS_ENABLED* | Organization reference documents page |

## routers/public.py (read-only site data)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/site/features` | Public | Optional feature flags as booleans |
| GET | `/api/business/site/common` | Public | Catalog, centers, policies, plans, roles, source counts |
| GET | `/api/business/site/home` | Public | Home page data |
| GET | `/api/business/site/sources` | Public | Knowledge records and publisher counts |
| GET | `/api/business/site/packages/{package_id}` | Public | Package detail with related packages |
| GET | `/api/business/site/compare` | Public | Comparison of `?ids=` |
| GET | `/api/business/site/hospital-links` | Public, *HOSPITAL_LINKS_ENABLED* | Reviewed official hospital offers |
| GET | `/api/business/site/membership` | Public | Caller's own organization role, if any |

## routers/business.py (`/api/business`)

### Session and account

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/session` | Public | Read or create a session; returns user, CSRF token, active chat |
| POST | `/api/business/guest/close` | Public | Revoke a guest session (guest token and CSRF in the body) |
| GET | `/api/business/me` | Public | Who is signed in, for the site header; never creates a session |
| POST | `/api/business/register` | Session | Create an account (password 12+ characters) |
| POST | `/api/business/login` | Public | Sign in with an email or a demo username |
| POST | `/api/business/logout` | Session | End the session |
| GET | `/api/business/workspace` | Session | Chat, chats, bookings, reports, plan, notifications |

### Chat

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/business/chat` | AI | Send a message; streams steps, then the answer |
| POST | `/api/business/chat/retry` | AI | Retry the latest failed message |
| POST | `/api/business/stop` | Session | Stop the running reply |
| POST | `/api/business/new-chat` | Session | Start a new chat (older clients) |
| GET | `/api/business/history` | Session | Earlier chats (older clients) |
| POST | `/api/business/confirm` | Session | Confirm a preview: booking request, quote, payment or hand-off |
| POST | `/api/business/handoffs` | Account | Ask for a person |

### Reports

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/business/chat/report` | AI | Read one to three files (or a `demo_id`) into a chat card |
| POST | `/api/business/chat/report/confirm` | AI | Confirm the card's values (optionally edited), then explain them |
| POST | `/api/business/chat/report/answer` | AI | Retry the explanation of a confirmed card |
| POST | `/api/business/chat/report/discard` | Session | Discard an unconfirmed card and its report |
| POST | `/api/business/reports/read` | AI | Read a report on My reports |
| GET | `/api/business/demos` | Public | List synthetic sample reports |
| POST | `/api/business/demos/{id}/read` | AI | Read a synthetic sample |
| POST | `/api/business/reports/confirm` | Session | Confirm edited values and that the report is the customer's |
| POST | `/api/business/reports/select` | Session | Use a confirmed report in the chat |
| POST | `/api/business/reports/compare` | Session | Choose a confirmed report for comparison |
| GET | `/api/business/reports/trends` | Session | Values over time (Plus) |
| GET | `/api/business/reports/{id}/lab-report` | Session | Printable Lab Report data |
| GET | `/api/business/reports/{id}/source` | Session | Original page image (`?page=`) |
| GET | `/api/business/reports/{id}` | Session | One report without the original file |
| DELETE | `/api/business/reports/{id}` | Session | Delete a report and clear chats that used it |

### Catalog, booking, plans and payments

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/catalog` | Public | Full catalog |
| GET | `/api/business/branches` | Public | Centers |
| GET | `/api/business/policies` | Public | Service policies |
| POST | `/api/business/quotes` | Session | Price preview for one to five packages |
| GET | `/api/business/slots` | Session | Free half-hour slots (`?branch_id=&date=`) |
| POST | `/api/business/bookings` | Account | Request an appointment (idempotent) |
| POST | `/api/business/bookings/{id}/change` | Session | Cancel, reschedule or ask for a refund |
| POST | `/api/business/quotes/accept` | Account | Accept a corporate quotation |
| GET | `/api/business/plans` | Public | Free and Plus plans |
| GET | `/api/business/subscription` | Session | Current plan and allowance |
| POST | `/api/business/subscriptions/checkout` | Session | Start a simulated Plus payment |
| POST | `/api/business/payments/checkout` | Session | Start payment for a confirmed booking |
| POST | `/api/business/payments/webhook` | Signed | Stripe webhook (external integrations off by default) |
| POST | `/api/business/account/line/link` | Account | Link a LINE identity (recent sign-in and consent) |
| POST | `/api/business/account/line/unlink` | Session | Unlink LINE |
| POST | `/api/business/line/webhook` | Signed | LINE webhook |
| POST | `/api/business/worker/run` | Signed | Run the LINE worker once (`Bearer BUSINESS_WORKER_SECRET`) |

### Service desk

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/staff/inbox` | Staff | Cases and counts |
| GET | `/api/business/staff/tickets/{id}` | Staff | A case with its conversation and bookings |
| POST | `/api/business/staff/tickets/{id}/state` | Staff | Take over, hand back to the assistant, or close |
| POST | `/api/business/staff/tickets/{id}/messages` | Staff | Reply to the customer (after take-over) |
| POST | `/api/business/staff/bookings/{id}/settle` | Staff | Record a payment at the center |
| GET | `/api/business/staff/operations` | Staff | Bookings, catalog and LINE jobs |
| POST | `/api/business/staff/quotes` | Staff | Issue a versioned corporate quotation |
| PUT | `/api/business/staff/catalog/{id}` | Manager | Change a package price or availability |
| POST | `/api/business/staff/bookings/{id}/refund` | Manager | Refund a settled payment (simulated) |
| POST | `/api/business/staff/subscriptions/{id}/refund` | Manager | Refund a Plus period (simulated) |

## routers/business_ops.py (`/api/business`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/catalog/search` | Public | Search and filter packages |
| GET | `/api/business/catalog/compare` | Public | Compare `?ids=` |
| GET | `/api/business/catalog/{package_id}` | Public | Package detail |
| GET | `/api/business/modes` | Public | Integration modes (live, simulated, unavailable) |
| GET | `/api/business/dots` | Public | Assistant roles |
| GET | `/api/business/notifications` | Session | Customer notifications |
| POST | `/api/business/notifications/read` | Session | Mark notifications read |
| GET | `/api/business/bookings/{booking_id}/calendar.ics` | Session | Calendar file of a confirmed booking |
| POST | `/api/business/organizations/inquiries` | Account | Organization request (20+ people) |
| GET | `/api/business/organizations/inquiries` | Session | Own organization requests |
| GET | `/api/business/quotes/{quote_id}/document.pdf` | Session | Quotation PDF (owner, or staff in scope) |
| GET | `/api/business/payments/simulator/{txn_id}` | Session | Simulated transaction status |
| POST | `/api/business/payments/simulator/{txn_id}/events` | Session | Send a simulated payment outcome |
| POST | `/api/business/payments/simulator/webhook` | Signed | Simulator webhook |
| GET | `/api/business/staff/notifications` | Staff | Staff notifications |
| POST | `/api/business/staff/notifications/read` | Staff | Mark staff notifications read |
| POST | `/api/business/staff/bookings/{booking_id}/decision` | Staff | Confirm or decline an appointment request |
| GET | `/api/business/staff/tickets/{ticket_id}/inquiry` | Staff | Organization request and quotations of a case |
| GET | `/api/business/staff/dashboard` | Staff | Overview metrics (`?branch=&days=`) |
| GET | `/api/business/staff/customers` | Staff | Customers in scope (`?q=`) |
| GET | `/api/business/staff/customers/{owner}` | Staff | One customer's records |
| GET | `/api/business/staff/payments` | Staff | Payments in scope |
| PUT | `/api/business/staff/dots/{dot_id}` | Manager | Pause or turn on an assistant role |
| GET | `/api/business/staff/budget` | Manager | THB ledger, call cap, network and free-policy status |
| PUT | `/api/business/staff/branches/{branch_id}` | Manager | Visits per half-hour slot |
| GET | `/api/business/staff/audit` | Manager | Audit log (`?limit=`, up to 300) |
| POST | `/api/business/staff/line-simulator/events` | Manager | Send a signed simulated LINE event |
| GET | `/api/business/staff/line-simulator/outbox` | Manager | LINE jobs and simulated deliveries |
| POST | `/api/business/staff/line-simulator/run` | Manager | Run the LINE worker once |

## routers/chats.py (`/api/business`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/chats` | Session | Chats and projects |
| POST | `/api/business/chats` | Session | New chat, optionally in a project |
| POST | `/api/business/chats/{chat_id}/open` | Session | Switch to a chat |
| PATCH | `/api/business/chats/{chat_id}` | Session | Rename or move a chat |
| DELETE | `/api/business/chats/{chat_id}` | Session | Delete a chat |
| POST | `/api/business/projects` | Session | Create a project |
| PATCH | `/api/business/projects/{project_id}` | Session | Rename a project |
| DELETE | `/api/business/projects/{project_id}` | Session | Delete a project (its chats are kept) |

## routers/google_auth.py

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/auth/google/start` | Public | Start Sign in with Google (customers; needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`) |
| GET | `/api/business/auth/google/callback` | Public | OAuth callback (state, PKCE and nonce checked) |

## routers/ai_admin.py

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/staff/ai-providers` | Manager | Slots, agents, presets, test receipts, free-policy status, harness summary; keys masked |
| GET | `/api/business/staff/ai-providers/registry` | Manager | Read-only model registry proposals |
| PUT | `/api/business/staff/ai-providers/{slot}` | Manager | Save provider, model, key, prices for a slot or agent |
| DELETE | `/api/business/staff/ai-providers/{slot}` | Manager | Remove saved settings (back to environment or shared model) |
| POST | `/api/business/staff/ai-providers/{slot}/test` | Manager | One real test call; stores a test receipt |

Slots: `llm`, `vision`, `guard`, `agent_plan`, `agent_advisor`, `agent_explainer`, `agent_review`,
`agent_medical_analyzer`, `agent_thai_composer`.

## routers/harness_admin.py

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/staff/harness` | Manager | Current settings, SHA-256, skills with their text, tools with schemas, revisions |
| PUT | `/api/business/staff/harness` | Manager | Save settings as a new revision (must name the current revision) |
| POST | `/api/business/staff/harness/restore` | Manager | Save an earlier revision again as a new revision |

## routers/knowledge_admin.py

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/business/staff/knowledge` | Manager | All 148 records with approval, source check, document kind and searchable state |
| PUT | `/api/business/staff/knowledge/{id}` | Manager | Pause or resume a record (`enabled`, `reason` of 3–300 characters) |
| GET | `/api/business/staff/knowledge/{id}/document.pdf` | Manager | Publisher PDF or LabClear summary PDF |
| GET | `/api/business/staff/knowledge/{id}/pages/{page}` | Manager | One PDF page as PNG; `X-Page-Count` and `X-Document-Kind` headers |

## routers/organization_sources.py (*ORG_DOCUMENTS_ENABLED*)

| Method | Path | Access | Purpose |
|---|---|---|---|
| PUT | `/api/business/organization-documents/membership` | Manager | Set a user's organization and role (reader or editor) |
| GET | `/api/business/organization-documents` | Session | Organization documents (editors also see drafts) |
| POST | `/api/business/organization-documents/search` | Session | Search approved documents of the caller's organization |
| POST | `/api/business/organization-documents` | Session | Upload a UTF-8 text or Markdown document (editor) |
| GET | `/api/business/organization-documents/{sid}/download` | Session | Download an approved document |
| GET | `/api/business/organization-documents/{sid}` | Session | Preview a document |
| POST | `/api/business/organization-documents/{sid}/{action}` | Session | `approve`, `reject`, `revoke` or `delete` (editor) |

## routers/samples.py

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/samples/{demo_id}/{format}` | Public | Synthetic sample report as `png` or `pdf` |
