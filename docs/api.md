# API reference

All endpoints are under `/api/business` unless noted. Requests that change state need the session cookie and the `X-Business-CSRF` header from `GET /session` (or `/login`). Errors return `{"code": "...", "message": "..."}` with an HTTP status. The interactive schema is at `/docs` when the app runs.

## Session and accounts

| Method | Path | Purpose |
|---|---|---|
| GET | `/session` | Read or create the session; returns the user, CSRF token, active chat and whether Google sign-in is on |
| GET | `/me` | Who is signed in, for the website header (never creates a session) |
| POST | `/register` | Create an account on the current session (password 12+ characters) |
| POST | `/login` | Sign in with an email or a demo username |
| POST | `/logout` | End the session |
| GET | `/auth/google/start`, `/auth/google/callback` | Sign in with Google (customers; OAuth code flow with PKCE, state and nonce) |
| GET | `/workspace` | Everything the workspace shows: chat, chats and projects, bookings, reports, plan, notifications |

## Chat

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat` | Send a message. With `Accept: application/x-ndjson` the steps stream, then the result |
| POST | `/chat/retry` | Retry the last failed message |
| POST | `/chat/report` | Send a report (files, or `demo_id` for a sample) with a question; returns a values card |
| POST | `/chat/report/confirm` | Confirm the card's values (optionally edited) and answer the question |
| POST | `/chat/report/answer` | Retry the answer for a confirmed card |
| POST | `/chat/report/discard` | Discard an unconfirmed card and its report |
| POST | `/stop` | Stop the running reply |
| POST | `/confirm` | Confirm a preview (booking, quote, payment, hand-off) |
| POST | `/handoffs` | Ask for a person |
| GET | `/modes`, `/dots` | Whether the assistant is online; the assistant roles |

## Chats and projects

| Method | Path | Purpose |
|---|---|---|
| GET, POST | `/chats` | List chats and projects; start a new chat (optionally in a project) |
| POST | `/chats/{chat_id}/open` | Switch to a chat |
| PATCH, DELETE | `/chats/{chat_id}` | Rename or move a chat; delete it |
| POST | `/projects` | Create a project |
| PATCH, DELETE | `/projects/{project_id}` | Rename a project; delete it (its chats are kept) |
| POST | `/new-chat` | Start a new chat (kept for older clients) |
| GET | `/history` | Earlier chats (kept for older clients) |

## Reports and plans

| Method | Path | Purpose |
|---|---|---|
| POST | `/reports/read` | Read a report from My reports |
| GET | `/demos`, POST `/demos/{id}/read` | Synthetic samples |
| POST | `/reports/confirm`, `/reports/select`, `/reports/compare` | Confirm values; use a report in the chat; choose a previous report |
| GET | `/reports/{id}`, `/reports/{id}/source`, `/reports/{id}/lab-report`, `/reports/trends` | A report, its image, its Lab Report, results over time (Plus) |
| DELETE | `/reports/{id}` | Delete a report and the chats that used it |
| GET | `/plans`, `/subscription`; POST `/subscriptions/checkout` | Plans and LabClear Plus (simulated payment) |

## Catalog, booking and payment

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog`, `/catalog/search`, `/catalog/compare`, `/catalog/{package_id}` | Packages |
| GET | `/branches`, `/policies`, `/slots` | Centers, policies, free 30-minute slots |
| POST | `/bookings`, `/bookings/{id}/change`; GET `/bookings/{id}/calendar.ics` | Request, change or cancel an appointment; calendar file |
| POST | `/quotes`, `/quotes/accept`; GET `/quotes/{id}/document.pdf` | Package preview; accept a corporate quotation; its PDF |
| POST, GET | `/organizations/inquiries` | Organization requests |
| POST | `/payments/checkout`; `/payments/simulator/*`; `/payments/webhook` | Simulated payments |
| GET, POST | `/notifications`, `/notifications/read` | Notifications |
| POST | `/account/line/link`, `/account/line/unlink`, `/line/webhook`, `/worker/run` | LINE linking and simulator |

## Service desk (staff; manager where noted)

| Method | Path | Purpose |
|---|---|---|
| GET | `/staff/dashboard`, `/staff/operations`, `/staff/inbox`, `/staff/customers`, `/staff/payments`, `/staff/notifications` | Desk views |
| GET, POST | `/staff/tickets/{id}`, `/staff/tickets/{id}/messages`, `/staff/tickets/{id}/state` | Cases: read, reply, take over, hand back |
| POST | `/staff/bookings/{id}/decision`, `/staff/bookings/{id}/settle`, `/staff/bookings/{id}/refund` | Confirm or decline; record payment; refund |
| POST | `/staff/quotes`; `/staff/subscriptions/{id}/refund` | Corporate quotation; Plus refund |
| PUT | `/staff/catalog/{id}`, `/staff/branches/{id}`, `/staff/dots/{id}` | Manager: prices, centers, assistant roles |
| GET, PUT, DELETE, POST | `/staff/ai-providers`, `/staff/ai-providers/{slot}`, `/staff/ai-providers/{slot}/test` | Manager: AI providers per slot and agent (`llm`, `guard`, `vision`, `agent_plan`, `agent_advisor`, `agent_explainer`, `agent_review`) |
| GET | `/staff/budget`, `/staff/audit` | Call cap and THB budget; audit log |
| GET, POST | `/staff/line-simulator/*` | LINE simulator |

## Other

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service status (outside `/api/business`) |
| GET | `/api/samples/{demo_id}/{format}` | Sample report image or PDF |
