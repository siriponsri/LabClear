# LabClear documentation

Documentation for LabClear 4.0.0-rc3. Start with the [project README](../README.md).

## Product

- [business.md](business.md): the simulated clinic, its packages, centers, policies and plans.
- [customer-journey.md](customer-journey.md): the customer's path from a lab report to a booked check, and what staff do.
- [chatbot-spec.md](chatbot-spec.md): what the assistant must and must not do, and where each rule is enforced.

## System

- [architecture.md](architecture.md): components, storage, the agent pipeline, report reading, security and one message end to end.
- [api.md](api.md): every endpoint, grouped by router, with who may call it.
- [ai-providers.md](ai-providers.md): provider slots, keys, call cap, THB budget, free-only policy and test receipts.
- [safety.md](safety.md): safety layers and the file that implements each one.
- [i18n.md](i18n.md): how the interface switches between Thai and English, for maintainers.

## Operations

- [admin.md](admin.md): no-code admin guide for managers on `/staff`.
- [deploy/render.md](deploy/render.md): Render Blueprint runbook, environment variables, migration and rollback.
- [testing.md](testing.md): Python and browser suites, benchmark modes and recorded evidence.
- [evidence/current/README.md](evidence/current/README.md): recorded OFFLINE benchmark results.

## Data and notices

- [../knowledge/README.md](../knowledge/README.md): the 148-record knowledge library and how retrieval works.
- [../examples/README.md](../examples/README.md): synthetic lab reports used as samples and test inputs.
- [../NOTICE.md](../NOTICE.md): third-party components, fonts and sources.

## Project and history

- [team.md](team.md): roles and progress log.
- [../CHANGELOG.md](../CHANGELOG.md): release history.
- [integration/CLAUDE_INTEGRATION_REPORT.md](integration/CLAUDE_INTEGRATION_REPORT.md): 4.0.0-rc3 integration report and acceptance matrix.
- [report/](report/): final coursework report (Thai, Word and PDF), structured on the Final Project brief.
- [../presentation/index.html](../presentation/index.html): presentation deck (open in a browser; English).
- [assets/](assets/): architecture and message-flow diagrams (built by `scripts/build_diagrams.py`).
