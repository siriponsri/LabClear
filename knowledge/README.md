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
