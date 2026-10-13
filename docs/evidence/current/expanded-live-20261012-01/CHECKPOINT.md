# Expanded testing checkpoint — 2026-10-12

Owner approved full local work, a global 3,000 provider-attempt ceiling and confirmed previous callers stopped. No purchase, money-cap increase, ledger/cycle reset, push or deploy.

- New offline reliability: 24 PASS (16 reused, 8 added gate scenarios).
- Updated gate reverification: 8 PASS, including independent-process concurrency and reserved in-flight attempts. Reverification is not eight additional unique scenarios.
- Full mocked UAT: 37 PASS / 1 FAIL (UI-28 click timeout). Planned UI subset: 23 PASS / 1 FAIL across 24 cases; 14 additional regressions reported separately.
- Offline evidence: 254 real browser captures; 72-page report/appendix rendered, all-page contact sheets inspected. Some screenshot text is small in PDF; full-resolution originals retained.
- Global cap reconciled prior attempts to 24, not 23. Existing cycle/database/money ledger preserved. Original outstanding reservation 0.2281 THB preserved; original settled estimate 1.0092 THB. No refund/reset of these charges.
- Live server wraps every application provider HTTP transport before admission with atomic SQLite gate, maximum 3,000 total and 12 per workflow. Whole-case reruns disabled. Original application financial/quota checks remain active.
- Canonical 20 completed: 15 automated PASS / 1 FAIL / 4 ERROR. Q10 additionally fails manual Thai-language consistency; automated rubric result remains separate. I01 explanation withheld; I02 OCR alignment error; I03–I05 downstream explanation errors.
- Expanded 128 running serially; status files update in this directory. No stability repetitions requested. All six source images traceable; variants are derivatives, not independent samples. Inputs/gold separate. B02 bilingual conflict retained.
- First evidence audit: frozen hashes all nine unchanged; all executed cases captured with valid hashes.

The live process continues. Provider-free completion watcher will refresh scoring, report/appendix PDF and every-page renders after completion; human semantic adjudication and final visual review remain required. This checkpoint is not final delivery and does not certify clinical accuracy.

Artifacts: `../expanded-tests-20261012-01/` offline suite/screenshots/PDF; this directory contains live raw outcomes, receipts, cap/accounting records, source/screenshot manifests, findings, progress and completion reports. New reports are `docs/report/LabClear_Expanded_Testing_Report_TH.*` and `LabClear_Expanded_Test_Appendix_TH.*`. All preexisting owner/agent dirty files remain preserved.
