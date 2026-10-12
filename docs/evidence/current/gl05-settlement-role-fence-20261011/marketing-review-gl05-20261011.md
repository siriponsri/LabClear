# Marketing and pricing review - GL-05 checkpoint

## Scope

Read-only review of the current worktree at `73d24b9cc4281b74829b63603786427d14cbe5c7`, using the existing Business Report, go-live plan, catalog, plans, and the repository's marketing-strategy/pricing-offers contracts. No files, catalog prices, provider settings, budgets, external channels, or live systems were changed.

The review was performed by a platform Marketing subagent because no dedicated FORGE Marketing route is configured. It is not customer research, market validation, or independent release sign-off.

## Findings

| Question | Evidence-based conclusion | Status |
|---|---|---|
| Primary audience/trigger | People planning a health check who need to compare included tests and prices before requesting an appointment. The catalog -> compare -> booking workflow is executable in UAT, but UAT proves workflow behavior, not demand. | Recommendation |
| Secondary hypotheses | HR/organization buyers and Plus subscribers remain secondary hypotheses. No demand, acquisition, attendance, CAC, retention, or willingness-to-pay baseline is present. | Unknown |
| Current demo catalog price | Keep all demo prices unchanged. Current data is marked `is_demo=true`; verified package costs and willingness-to-pay are missing. | DECISION: no price change |
| Packaging | Keep individual entry/core/comprehensive plus family-pair ladder; retain staff review for follow-up packages; keep corporate packages quote-led with the 20-person minimum. | Recommendation |
| Plus offer | Define transparent fair-use limits before commercialization because current plan data permits uncapped reads. | Open decision |

## Bounded experiment recommendation

After release gates and owner decisions are complete, measure only aggregate funnel events: package view -> comparison -> booking request -> staff confirmation -> attendance. Keep prices fixed, collect no health content, use no paid media, and cap paid spend at **0 THB**. Bound the pilot at **4 weeks or 30 booking-intent sessions**, whichever comes first. Stop earlier for demo-price confusion, privacy/clinical concern, or unapproved spend. Treat any result as directional until a baseline exists.

## Economics required before pricing

Collect package lab/collection cost, staff time, capacity/utilization, tax/payment fees, cancellation/refund/no-show cost, channel CAC, AI/OCR/storage/hosting/support cost, and Plus usage distribution. Do not infer margin from one live provider smoke request or from simulator results.

## Evidence limits

No customer interviews, recruitment, outreach, competitor validation, spending, live price change, or external action was performed. This review does not authorize a live catalog change and does not establish commercial readiness.

