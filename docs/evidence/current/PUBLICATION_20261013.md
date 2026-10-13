# Test evidence publication — 2026-10-13

This index publishes existing recorded test evidence. No application tests, browser scenarios or provider requests were executed for publication. Raw outcomes and originals were not regenerated, redacted or rewritten.

The publication is based on remote main `c1d54939d05d4a2a978ce960835e51c2ea655a6c`. Most runs identify local HEAD `d4ec2123c704acf571a02a188ef1c8c0c57e0827` plus a dirty-build fingerprint; the earlier handoff run records its own base. Read each run’s provenance. The unpublished local product/test fixes are not part of this evidence-only update, so these results do not certify the application code currently on main.

Reports, presentations, clips, their sources/renders, source archives/checkouts, runtime packages, databases and unrelated local changes are excluded. Historical report/media content already on main is unchanged. Some raw provenance describes those local artifacts or absolute source paths; a reference is not a promise those excluded files were published.

## Runs

| Recorded run / provenance | Scope | Files | Bytes |
|---|---|---:|---:|
| [context-isolation-offline-20261012-01](context-isolation-offline-20261012-01/results.json) | Offline real HTTP with an agent double; extracted-source snapshot provenance, no provider calls. | 11 | 539,468 |
| [expanded-attempt-budget-20261012](expanded-attempt-budget-20261012/global-attempts.provenance.json) | Recorded attempt accounting and final hold; database excluded. | 2 | 902 |
| [expanded-live-20261012-01](expanded-live-20261012-01/run.json) | Live provider/local UI run, safety stop, raw failures/errors/pending and NOT_RUN; offline regression captures distinguished by labels. | 2780 | 116,953,402 |
| [expanded-tests-20261012-01](expanded-tests-20261012-01/run.json) | Offline/mock reliability, gate and browser UAT; retains failed UI attempt. | 335 | 30,490,217 |
| [focused-unit-pixels-20261012-01](focused-unit-pixels-20261012-01/run.json) | Focused live pixel experiment on synthetic unit crops; unparseable outcomes retained. | 10 | 263,838 |
| [focused-unit-pixels-20261012-02](focused-unit-pixels-20261012-02/run.json) | Second focused live pixel experiment; literal unit outputs and review retained. | 11 | 222,099 |
| [independent-text-20261012-01](independent-text-20261012-01/run.json) | Independent-text live provider/local UI cases with accounting and scores. | 135 | 17,059,586 |
| [p0-phase-handoff-20261012-01](p0-phase-handoff-20261012-01/README.md) | Offline mocked handoff UAT and backend JUnit; all earlier retries/failures preserved; privacy approval remains blocked. | 330 | 52,276,502 |
| [p0-phase-safety-20261012-02](p0-phase-safety-20261012-02/pytest.xml) | Recorded offline backend safety baseline; distinct suite, not paired before/after. | 1 | 16,625 |
| [remaining-image-stage-20261012-01](remaining-image-stage-20261012-01/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 18 | 975,682 |
| [remaining-image-stage-20261012-02](remaining-image-stage-20261012-02/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 67 | 8,476,217 |
| [unit-fidelity-retest-20261012-01](unit-fidelity-retest-20261012-01/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 4 | 9,978 |
| [unit-fidelity-retest-20261012-02](unit-fidelity-retest-20261012-02/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 12 | 1,055,147 |
| [unit-fidelity-retest-20261012-03](unit-fidelity-retest-20261012-03/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 12 | 997,062 |
| [unit-fidelity-retest-20261012-04](unit-fidelity-retest-20261012-04/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 12 | 1,031,855 |
| [unit-fidelity-source-probe-20261012-01](unit-fidelity-source-probe-20261012-01/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 9 | 526,334 |
| [unit-literal-retest-20261012-01](unit-literal-retest-20261012-01/run.json) | Targeted live provider/local UI image or unit experiment; earlier attempts and failures retained. | 12 | 1,046,314 |

## Interpretation and integrity

PASS, FAIL, ERROR, REVIEW_PENDING, NOT_RUN, UNPARSEABLE_NO_CORRECTION, safety stops and incomplete runs remain as recorded. Offline/mock result pages are captures of recorded results, not fresh live model outputs. Synthetic derivatives are not independent source samples or clinical validation. Historical checkpoint prose remains historical and should be read alongside final raw run/summary files.

The [publication manifest](PUBLICATION_20261013.json) lists every raw file’s SHA-256 and byte count. Original paths are retained, including identical blobs in multiple paths. Git stores identical blob content once.

The archived `expanded-live-20261012-01/unit-repair-initial-captures-parser-invalid/manifest.json` retains 59 old paths pointing to the pre-archive folder. Its 59 SHA-256 values match the corresponding filenames inside `unit-repair-initial-captures-parser-invalid/`, not the later complete captures. The publication manifest supplies this resolution mapping without changing the historical raw manifest. `INVALID_PARSER_NOTE.txt` explains the partial parser capture.

## Privacy review

Every candidate non-PNG file was scanned for credential/private-key/Bearer/JWT/assigned-secret patterns. All 2,257 candidate PNGs were viewed on 36 contact sheets and matched to run metadata, fixture provenance, corresponding text captures or documented historical failure context. Sensitive/unclear fixture headers, provider configuration and account/checkout screens received full-size inspection. No unresolved real-person health data, real credentials, private browser chrome or private account identities were identified.

Lab fixtures are synthetic/reference derivatives with masked identity/staff fields. Application UAT identities use `.invalid` accounts or labelled demo accounts; the masked `wxyz` suffix in historical provider screens belongs to the UAT dummy key documented in the runner. Ten images have no original raw-manifest hash reference: eight focused unit/result images and two historical UAT failure screenshots. Their origins are described above and their current bytes are now recorded in the publication manifest. This is a visual/provenance and pattern review, not a clinical or privacy-policy certification.

Publication adds this index and the manifest only; original evidence bytes remain unchanged.
