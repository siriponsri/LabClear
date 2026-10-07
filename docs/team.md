# Team, roles and progress

Two developers share the work as the brief suggests: one leads the backend, API and image reading, the other the interface, knowledge base and safety. Each reviews the other's work, and both can explain every part of the system.

| Student ID | Name | Leads | Reviews | Deliverables |
|---|---|---|---|---|
| 68076055 | นายวัชรินทร์ บัวสอน | Backend and API (FastAPI routers, booking and payment states, storage), report reading (OCR, rows, status from the printed range), AI provider settings, deployment, architecture diagram | Knowledge base, prompts, safety tests | All API endpoints, the report pipeline, the booking and payment simulators, the live site on Render |
| 68076060 | นายศิริพล ศรีเฮงไพบูลย์ | Interface (website, chat with live steps and errors, chat list, service desk), knowledge base and RAG, prompts and assistant roles, safety layers, data-flow diagram | Endpoints, report reading, provider settings | Website and workspace, 58-source knowledge base, prompts and rules, safety checks, browser scenarios |
| Both | | Test sets and results, three improvements, report, demo video | | Test tables, improvement log, final report, video under 3 minutes |

## Progress log

| Date (2026) | Work | Lead | Result |
|---|---|---|---|
| 3 Oct | Business chosen and submitted: a health-check clinic with an AI lab-report reader | Both | Business name submitted |
| 4–6 Oct | Business data: 18 packages, 3 centers, policies, plans; 58 reviewed medical sources with Thai aliases | ศิริพล (knowledge base), วัชรินทร์ (data files) | `business_data/`, `knowledge/` |
| 6 Oct | First complete system: website, workspace, staff desk, booking, payments, report reader, chatbot pipeline | วัชรินทร์ (backend), ศิริพล (interface, pipeline prompts) | Commit `f53e013`; deployed to Render |
| 7 Oct | Twelve AI providers chosen on a manager page; System One safety models; Vercel support | วัชรินทร์ (providers, API), ศิริพล (page, safety) | Commit `e7891e6` |
| 7 Oct | Live fix: model replies rejected as unverifiable; tolerant JSON with one corrective retry | ศิริพล (prompts), วัชรินทร์ (parsing) | Commit `eede25b` |
| 7 Oct | Chats and projects, optional sign-in with demo accounts, reports in the chat with one-click confirmation, live steps | ศิริพล (interface), วัชรินทร์ (endpoints, streaming) | Commit `008b8da` |
| 7 Oct | Lab-report-first journey, website sign-in and account menus, a model per agent; live fix: confirmed reports explained by the Report Explainer | Both | Commit `8460a85` |
| 7 Oct | Detailed documentation and diagrams that match the system | Both | `docs/` |
| 7 Oct | First attempt at the test sets stopped at Q01 and Q02; fix: package lists with many sources and stray report values no longer withhold the answer | วัชรินทร์ (validation), ศิริพล (prompt) | Improvement 1 |
| 7 Oct | Live run of the test sets: questions 7/10, images 4/5, safety 5/5; fixes for prices, knowledge-base search, critical flags and printed ranges; Sign in with Google; demo accounts no longer listed | Both | Improvements 2 and 3 |
| 8–10 Oct | Test sets run again on the live system; results in the report | Both | `course_eval_results.json` |
| 11–16 Oct | Fixes from the test round, report and demo video | Both | Final report (PDF), video |
| 17 Oct | Submission | Both | Google Drive folder |

Update the dates and results as work completes; this log is part of the individual assessment.
