# Provider free-tier check (documentation only)

Checked on 10 October 2026 from the providers' public pages. This is a documentation check, not an
account check: the free-only policy still needs the owner to confirm each endpoint on the provider's
console for the exact account before it may be marked `VERIFIED_FREE_FOR_THIS_ACCOUNT`.

| Endpoint in the policy | What the official page says | Policy value | Status kept |
|---|---|---|---|
| Typhoon text, `typhoon-v2.5-30b-a3b-instruct` | Docs home lists "Typhoon API (Free Tier)", "zero cost for light usage", and this model in the free-tier table. Rate limits page: 5 requests/s, 200 requests/min. Production use is pointed to "API Pro" / Together AI | 5 rps, 200 rpm; app limit 30/min | `FREE_STATUS_UNVERIFIED` until the account is checked |
| Typhoon OCR, `typhoon-ocr` | OCR page: `typhoon-ocr` (Typhoon OCR 1.5) is the default model; PNG, JPEG and PDF, one page per call (multi-page PDFs need a loop). Rate limits: 2 requests/s, 20 requests/min. Free use or price is **not stated** on the OCR or rate-limit pages | 2 rps, 20 rpm; app limit 5/min | `FREE_STATUS_UNVERIFIED` |
| iApp OpenThai-SystemOne guard | Pricing page: credits (IC) at 1.25 THB each (0.89 THB at volume), 50 IC free at sign-up, purchased credits do not expire; **no free quota or per-call price is listed for SystemOne**. The free OpenThai 2.0 Legal API (a different endpoint) ended on 3 October 2026 | 100 rpm, 1,000 decisions/day (template proposals) | `FREE_STATUS_UNVERIFIED`; expect credit charges |

Conclusions:

- The rate limits in `eval/policies/free_only.example.json` match the published Typhoon limits.
- Only the Typhoon text model is described as free (for light usage). Typhoon OCR's free status is not
  published, and the iApp guard is credit-based. A LIVE_FREE run must not assume either is free.
- The OCR adapter sends one image per call, which matches the documented one-page-per-call contract.

Sources: [Typhoon docs](https://docs.opentyphoon.ai/en/), [Typhoon rate limits](https://docs.opentyphoon.ai/en/rate-limits/),
[Typhoon OCR](https://docs.opentyphoon.ai/en/ocr/), [iApp pricing](https://www.iapp.co.th/pricing),
[iApp OpenThai 2.0 Legal free period](https://iapp.co.th/blog/openthai2p0-legal-free-extended).

Preflight re-run on the clean candidate `8445db6` ([live-preflight.json](live-preflight.json)):
`BLOCKED`, 0 inference calls. Remaining blockers: policy not reviewed, data terms not reviewed, free
status unverified for all three endpoints, no trial keys. The earlier `WORKING_TREE_DIRTY` blocker is gone.
