# Admin guide for managers

This guide covers the manager views of the service desk at `/staff`. No code changes are needed for
anything here. Every save is checked by the server and written to the audit log.

## Before you start

- Sign in with a manager account. Locally, or on a demo with `DEMO_ACCOUNTS=true`, use `admin` /
  `1234`. Otherwise create one with `python scripts/create_staff.py --email you@example.com --role manager`.
- The **Manage** group in the sidebar is visible to managers only: Catalog and prices, Centers and
  capacity, Assistant roles, Company Harness, Knowledge library, AI providers, Channels and budget,
  Audit log.
- Environment settings (feature flags, budget, database, keys in the environment) are changed by the
  server owner in the Render dashboard, not here. See [deploy/render.md](deploy/render.md).

## Company Harness

Choose which reviewed skills and typed tools the assistants use. Changes apply from the next message.
Every answer records the skills and tools it actually ran under **Process Explainability**.

### General settings

| Setting | Range | Effect |
|---|---|---|
| Use runtime skills | on / off | Off sends only the base instructions to the writer |
| Sources per search | 1–8 (default 6) | How many knowledge records one search returns |
| Maximum answer length (tokens) | 500–4,000 (default 2,400) | Output limit of the writer |

Always on and not editable here: safety checks on every message and answer, ownership checks,
citation checks and customer confirmation before anything is booked.

Before the first save, "Use runtime skills" follows the server setting `RUNTIME_SKILLS_ENABLED`
(on in `render.yaml`). After a save, the saved revision decides.

### Runtime skills

Reviewed instruction modules. The server picks the relevant ones for each message from the answering
role, the task, the confirmed report and the evidence loaded.

| Skill | ID | Can be switched off |
|---|---|---|
| Core rules | `core` | No (Locked) |
| Thai writing style | `thai-style` | Yes |
| Citing sources | `evidence-citation` | No (Locked) |
| Scope and uncertainty | `scope-uncertainty` | No (Locked) |
| Explaining a test | `lay-explanation` | Yes |
| Explaining a confirmed report | `patient-explanation` | Yes |
| Package advice | `package-advice` | Yes |
| Package comparison | `package-compare` | Yes |

For each skill:

- **Use this skill when relevant** switches it on or off (locked skills stay on).
- **Company wording (optional)**, up to 4,000 characters, adds tone, explanation style or service
  wording. It is placed under the reviewed text and cannot override evidence or safety rules.
- **Reviewed base instructions** shows the checked-in text and version. That text cannot be edited
  here.

The badge shows **Locked**, **On**, **Off** or **Customized**.

### Typed tools

Server-side data lookups with fixed schemas. Each assistant role can use only the data its role
allows. You can pause a tool or set a lower limit. You cannot raise a limit or widen a permission.

| Tool | ID | Permission | Time limit up to | Maximum items up to |
|---|---|---|---:|---:|
| Look up packages | `lookup_packages` | Catalog | 2 s | 40 |
| Compare packages | `compare_packages` | Catalog | 2 s | 1 |
| Look up centers | `lookup_branches` | Centers | 2 s | 1 |
| Look up policies | `lookup_policies` | Policies | 2 s | 1 |
| Search medical knowledge | `retrieve_evidence` | Medical knowledge | 10 s | 8 |
| Read the confirmed report | `get_confirmed_report_rows` | Confirmed report | 2 s | 1 |
| Prepare a booking preview | `preview_booking` | Catalog | 2 s | 1 |
| Official hospital packages | `get_external_hospital_offer` | Catalog | 2 s | 20 |

What pausing does:

- Look up packages, centers or policies, Search medical knowledge and Read the confirmed report are
  required data. When one is paused, answers that need it stop with an error rather than answer
  without the data.
- Compare packages and Official hospital packages are extras. When paused, answers continue without
  the comparison table or the hospital links.
- When Prepare a booking preview is paused, booking and quote requests become a hand-off to the team.

Each tool also shows its **Input schema** and version for review.

### Saving and restoring

- **Save changes** creates a new revision. The line next to it shows the revision number and the
  first characters of its SHA-256.
- If another tab saved first, the save is refused ("Settings changed in another tab"). Reload and
  try again.
- **Version history** lists earlier revisions. **Restore this revision** saves those settings again as
  a new revision, so the change stays in the audit log (`harness.saved`).

## Knowledge library

Every record the assistant can search and cite: 148 records (58 reviewed earlier and 90 summaries
approved by the owner on 2026-10-09 whose source check is still pending).

- **Search the library** filters by title, publisher, content or ID.
- **Show** filters: All records, Owner approved (source check pending), Reviewed records, Paused.
- Select a record to read it as PDF pages with **Previous page** and **Next page**, or use
  **Open PDF**, **Download PDF** and **Original source**.

Badges on a record:

| Badge | Meaning |
|---|---|
| Owner approved / Reviewed record | Approval route of the record |
| Source check pending / Source reviewed | Whether the summary has been checked against the live page |
| Publisher PDF | A stored copy of the publisher's page, checked against its SHA-256 (42 records) |
| LabClear summary PDF | A PDF generated from the record text, labelled as not the publisher's original |
| Searchable / Paused | Whether the assistant can find it |

To pause or resume a record, open **Publication**, set **Searchable by the assistant**, enter a
**Reason for the change** (3–300 characters) and press **Save**. The change applies from the next
message and is audited (`knowledge.paused` or `knowledge.enabled`). Answers already given keep their
citations. Records cannot be added or edited here; see [knowledge/README.md](../knowledge/README.md).

## AI providers

Choose the provider, model and API key for each AI step. A warning appears when the server has AI
calls switched off (`PROVIDER_NETWORK_ENABLED` is not `true`); you can still save settings.

### Slots

| Card | Slot | Default | Used for |
|---|---|---|---|
| Language model | `llm` | Typhoon | Shared by the agents unless they have their own setting |
| Safety check | `guard` | iApp OpenThai-SystemOne | Every message, answer and report |
| Report reading (OCR) | `vision` | Typhoon OCR | Lab report images and PDFs |

The badge shows **Saved here**, **From server environment** or **Not set up**.

Form fields: **Provider**, **Model** (empty uses the provider's default), **API key**, **Endpoint URL**
(custom provider only), **Input price** and **Output price** (THB per 1M tokens), and **Report
reading is on** (report reading only).

- Keys are stored encrypted and shown only as their last four characters. Leave the key empty to
  keep the saved key for the same provider.
- **Use server settings** removes the saved settings so the environment variables apply again.

### Agents

The Planner, Health-check Advisor, Report Explainer and Reviewer share the language model. Choose
**Its own provider** to give one its own model; **Shared language model** returns it. A different
model family for the Reviewer makes the second check more independent.

The Medical analyzer and Thai composer are **Disabled until configured**. They need an exact model,
explicit input and output prices and, for OpenRouter, **Reviewed OpenRouter endpoint IDs**. They are
used only when the server owner sets `MEDICAL_HARNESS_ENABLED=true`. **Disable this new role**
removes their settings.

### Test connection

**Test connection** makes one real call with the slot's current settings (saved here, or from the
server environment). The call counts toward the call cap and the THB budget.

| Slot | Test | Result |
|---|---|---|
| Language model and agents | Asks for a small JSON reply | Passes only if valid JSON comes back; medical accuracy is not tested |
| Safety check | Classifies one normal lab question | Passes if it is classified as safe |
| Report reading | No call | `NOT_RUN`; test it with a synthetic sample on My reports |

When a language-model or safety-check test gets a reply, a receipt is stored: status
(`LIVE_TESTED` or `LIVE_TEST_FAILED`), time and scope, tied to a SHA-256 of the provider, model,
endpoint and key. Changing any of these invalidates the receipt. A call that fails outright (for
example, a rejected key) shows the provider error and stores no receipt. The receipt is returned by
`GET /api/business/staff/ai-providers` as `live_test_status` and `tested_at`, and each test is
audited (`ai_provider.test.passed` or `ai_provider.test.failed`). Provider details are in
[ai-providers.md](ai-providers.md).

## Assistant roles

Two AI roles answer inside one conversation: the **Health-check Advisor** and the **Report
Explainer**. Customers never choose a role. Each card lists what the role can propose, its page
shortcuts and what it can read. These permissions are enforced by the server and cannot be changed
here.

- **Pause this role** sends its questions to the other role or to the team. **Turn on** restores it.
- Pausing every role pauses AI replies. Browsing, booking, payments and the team inbox keep working.
- Changes are audited (`dot.enabled`, `dot.disabled`).

## Catalog and prices

A table of all packages with **Price (THB)** (1–1,000,000) and **Available**. **Save package**
applies at once to the website, the assistant and new previews. Confirmed appointments keep their
agreed price. Each save gives the catalog a new version and is audited (`catalog.updated`).
Hospital links are not affected.

## Centers and capacity

Set **Visits per slot** (1–20) for each center. The change applies to new requests at once; existing
appointments are never cancelled. Audited as `branch.capacity`.

## Channels and budget

- **Integration modes**: whether the conversation model, payments, LINE, calendar, email, maps,
  evidence search and plans are live, simulated or not connected. The server decides these.
- **AI budget (project total)**: cap, spend before this ledger, settled, reserved, remaining, number
  of calls, priced models, provider network, and the call cap ("x of y calls used in cycle z"). The
  values come from the server settings `PROJECT_BUDGET_THB`, `PROJECT_BUDGET_PRIOR_SPEND_THB`,
  `PROVIDER_BUDGET_CYCLE_ID` and `CLOUD_CALL_LIMIT`.
- **LINE channel simulator**: **Send as LINE user** queues a signed, LINE-shaped event; **Run worker
  once** processes it. Replies are stored as simulated deliveries; nothing is sent to LINE.

## Audit log

The latest 150 events: time, actor (role and the last characters of the ID), action code and record.
Message contents and health data are never stored here.

| Action code | Event |
|---|---|
| `harness.saved` | Company Harness saved or restored |
| `knowledge.paused`, `knowledge.enabled` | Knowledge record paused or resumed |
| `ai_provider.saved.<slot>.<provider>`, `ai_provider.reset.<slot>` | AI provider saved or removed |
| `ai_provider.test.passed`, `ai_provider.test.failed` | Test connection result |
| `dot.enabled`, `dot.disabled` | Assistant role turned on or paused |
| `catalog.updated` | Package price or availability changed |
| `branch.capacity` | Center capacity changed |
