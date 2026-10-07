# Customer journey

LabClear tells one story everywhere, on the home page, in the empty chat and in the slides: **from the report you have to the check you need.** A customer can start without an account; signing in keeps reports and appointments across devices.

| Step | The customer | LabClear | Where |
|---|---|---|---|
| 1. Send your lab report | Attaches a photo or PDF in the chat (paperclip, drag and drop, or paste), with an optional question | Shows the image in the message, reads it and streams each step | `/app` chat |
| 2. Confirm the values | Compares the rows with the image; clicks **Values are correct, this is my report**, or **Edit values** first | Nothing is explained, saved to the dashboard or used in a later answer before this click | Report card in the chat |
| 3. Understand each value | Reads the explanation and the numbered sources | The Report Explainer explains each value against the range printed on the same report, with sources; no diagnosis | Chat answer, "How this was checked" |
| 4. Ask about a follow-up check | Clicks **Find a follow-up check** or asks in their own words | The Health-check Advisor shows matching packages and prices; follow-up tests need staff review | Chat, Health checks |
| 5. Request a time | Picks a center, date and 30-minute slot and sends the request | Staff confirm or decline with a reason; payment opens after confirmation (at the center or by test payment) | Request a time, My appointments |

Step 4 is always the customer's choice: the assistant never offers a package because a value is outside its range.

## Other ways in

| Customer | Path |
|---|---|
| Wants a check-up without a report | Home → **Request a time**, or Health checks → compare → book |
| Has a question only | Chat, or **Ask LabClear** on any website page (the same conversation) |
| Follows results over time | Signs in → Lab dashboard (LabClear Plus) |
| Books for a company | Organizations → request form → staff quotation (PDF, versioned) → accept |

## Signing in

| Where | How |
|---|---|
| Any website page | **Sign in** in the header opens a sign-in dialog; once signed in, the avatar menu links to the chat, appointments, results, the service desk (staff) and **Sign out** |
| `/app` | **Sign in** at the top right; when signed in, the avatar opens a menu with My appointments, My reports, Plan, Service desk (staff), Website and **Sign out** |
| `/staff` | The sign-in dialog opens automatically; staff and managers who sign in on `/app` are taken to `/staff` |

Demo accounts (password `1234`) are on for local runs and off on a hosted site unless `DEMO_ACCOUNTS=true`:

| Username | Account |
|---|---|
| `test-01` | Customer on the Free plan (one AI reading) |
| `test-02` | Customer with LabClear Plus (simulated) |
| `admin` | Manager with full access to the service desk |

## Chats and projects

The chat list on the left of `/app` works like Claude or ChatGPT: **New chat**, open an earlier chat, rename it, move it to a project or delete it from the ⋯ menu. Projects group chats, for example "Annual check-up 2026"; deleting a project keeps its chats. Deleting a report also clears the chats that used it.

## What staff do

| Customer event | Staff action on `/staff` |
|---|---|
| Appointment request | Confirm or decline with a reason (Appointments) |
| "Ask our team" or a hand-off | Take over, reply, hand back to the assistant (Inbox) |
| Organization request | Issue a quotation; the customer accepts the latest version |
| Payment at the center | Record it; approve refunds |
| Prices, centers, assistant roles, AI providers, budget | Managers only |
