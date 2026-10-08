# CEO upgrade candidate — 2026-10-08

This directory records a disabled-by-default software candidate. Mocks establish
software behavior, not model quality or clinical suitability.

| Start here | Purpose |
|---|---|
| [MORNING_HANDOFF.md](MORNING_HANDOFF.md) | Owner sequence, remaining gates, rollback |
| [ENV_HANDOVER.md](ENV_HANDOVER.md) | Actual configuration and precedence |
| [PROGRESS.md](PROGRESS.md) | Baseline, task ledger, commands, release decisions |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Architecture, API, scope and limitations |
| [SOURCE_REVIEW.md](SOURCE_REVIEW.md) | Acquisition queue and public offer verification |
| [Thai report addendum](../report/LabClear_CEO_Upgrade_Report_TH.md) | Current implementation and evidence |
| [evidence/](evidence/) | Isolated tests, screenshots and fixture evaluation |

The owner-provided `intake-20261008-overnight/` and root task remain local source
material. Selected task, authorization, gates and harness requirements are retained
in `requirements/`; the baseline ZIP, raw archives and unrelated owner work are
excluded from publication. Historical reports and previous release evidence are
preserved under their original names.

## Repository map

- `services/model_harness.py`, `runtime_skills/`: typed packets and pinned runtime instructions.
- `services/providers.py`, `routers/ai_admin.py`: saved provider settings and diagnostics.
- `services/organization_sources.py`, `routers/organization_sources.py`: scoped references.
- `knowledge/acquisition/`: research metadata only; not read by active clinical retrieval.
- `business_data/hospital_links.json`: independently dated external offer metadata.
- `templates/site/*preview*`, `*references*`, `hospital_links.html`: opt-in UI surfaces.
- `scripts/offline_check.py`: isolated environment, ephemeral storage, outbound denial.

No dependency declarations, deployment entry point, historical binaries, fonts,
vendor assets or production schema are changed by this candidate.
