# Knowledge base

`evidence/catalog.json` is the only corpus the assistant searches (BM25). It holds 58 reviewed
records, each with Thai aliases so Thai questions find English test names:

| Publisher | Records |
|---|---|
| Siriraj Hospital | 23 |
| Faculty of Medicine Siriraj Hospital, Mahidol University | 23 |
| MedlinePlus, U.S. National Library of Medicine | 9 |
| Srinagarind Hospital, Khon Kaen University | 3 |

Records that quote a downloaded document point to it in `medical_sources/raw/`. The app checks
each of those files against the SHA-256 in the catalog when it loads, and refuses to use the
collection if a file was changed. Reference intervals are as published by each source; they are
for education only and were not clinically approved for this project.

## Acquisition queue (not searched)

`acquisition/` holds sources that are **not** part of the active corpus and are never searched:

| File | What it is | Status |
|---|---|---|
| `medical_sources.json`, `hospital_research.json` | Codex upgrade discovery lists (official metadata only) | `NOT_APPROVED` until rights and clinical review |
| `claude_candidates_400.json` | 90 records drafted on the Claude 4.0.0 branch (77 that had been in its catalog and 13 from its `pending.json`), from 26 publishers | `OFFLINE_AUTHORED_NOT_FETCHED`, `NOT_APPROVED` |

Integration 4.0.0-rc1 keeps the active corpus at the 58 reviewed records. A candidate enters
`evidence/catalog.json` only after a person opens its page, confirms the paraphrase, the rights and
the clinical accuracy, and records that review. `scripts/verify_sources.py` (from the Claude
branch) only checks that URLs answer; HTTP 200 is not a review.
