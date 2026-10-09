# Knowledge library

[`evidence/catalog.json`](evidence/catalog.json) is the only corpus the assistant searches. Version
`2026-10-09-owner-approved-148`.

## Records

| Group | Records | Fields that mark it |
|---|---:|---|
| Reviewed earlier | 58 | No `rag_approval` field; shown as "Reviewed record" |
| Owner-approved summaries | 90 | `rag_approval: OWNER_APPROVED`, `owner_approved_at: 2026-10-09`, `verification_status: OFFLINE_AUTHORED_NOT_FETCHED` |
| **Total** | **148** | 80 `public_reference`, 68 `public_education` |

The 90 summaries were written offline on the Claude 4.0.0 branch without opening the pages (77 from
its catalog, 13 from its pending list). The owner approved them for retrieval on 2026-10-09. Their
source check is pending (`current_review_status: OWNER_APPROVED_SOURCE_CHECK_PENDING`) and their rights
status is `REVIEW_REQUIRED`. Owner approval is not a clinical validation. The original drafting
metadata is kept in [`acquisition/claude_candidates_400.json`](acquisition/claude_candidates_400.json).

Every record has an ID, title, publisher, HTTPS URL, content, a SHA-256 of the content and Thai
aliases, so Thai questions find English test names. Reference intervals are as published by each
source and are for education only. The confirmed lab report's own printed range always takes
precedence.

## Publishers

29 publishers. The four with the most records:

| Publisher | Records |
|---|---:|
| MedlinePlus · U.S. National Library of Medicine | 35 |
| Siriraj Hospital | 23 |
| Faculty of Medicine Siriraj Hospital, Mahidol University | 23 |
| NIDDK · U.S. National Institutes of Health | 5 |

The others include the U.S. Preventive Services Task Force, NHLBI, WHO, NHS England, CDC, KDIGO,
the American Heart Association, Thai professional societies (diabetes, nephrology, hypertension,
liver, endocrine, the Royal College of Physicians of Thailand), Thai university and public hospitals
(Ramathibodi, Chiang Mai, Rajavithi, Chulalongkorn, Songklanagarind, Srinagarind), the Thai
Department of Disease Control and Department of Health, and the National Cancer Institute of
Thailand. The full list with counts is on the `/sources` page.

## Retrieval

[`services/evidence_search.py`](../services/evidence_search.py) uses BM25. No embedding API is
called.

- Indexed text: title, aliases and content. Latin text is split into lower-case words; Thai text into
  overlapping two-character pieces.
- The number of results per search is the Company Harness setting "Sources per search" (1–8,
  default 6).
- When the planner gives no search terms but the message names a test known from the aliases, those
  test names are searched.
- Records paused in Admin are left out from the next message.

At load time the application checks every record: unique ID, an allowed data class, content matching
its `content_sha256`, an HTTPS URL, and for records with a `source_file`, a file inside `knowledge/`
matching its `source_sha256`. If any check fails, the whole collection is refused
(`evidence_unavailable`) rather than partly used.

## Publisher documents

[`medical_sources/raw/`](medical_sources/raw/) holds 21 PDFs (`DR-*.pdf`) of public publisher pages.
42 of the reviewed records point to one of them through `source_file`. In Admin → Knowledge library
these records open as **Publisher PDF**; every other record opens as a **LabClear summary PDF**
generated from its text and labelled as not the publisher's original. The documents remain the
property of their publishers.

## Checking URLs later

[`scripts/verify_sources.py`](../scripts/verify_sources.py) checks that each URL still answers. It
uses the network, so run it by hand, never in tests.

```bash
python scripts/verify_sources.py              # report only
python scripts/verify_sources.py --write      # record successful checks in the catalog
python scripts/verify_sources.py --candidates # check the acquisition candidates instead
```

`--write` updates only the `verification` block of records whose URL returned 200; content and its
hash are never changed. HTTP 200 shows that a page exists. A person still has to read the page and
confirm the summary before the source check is complete.

## Pausing a record

A manager can pause or resume any record in `/staff` → **Knowledge library** → **Publication**, with
a required reason. The change is stored in the database (`configuration_knowledge`), audited, and
applied from the next message. It does not edit `catalog.json`. To add or change a record, edit the
catalog in a reviewed commit and update its `content_sha256`.

## Acquisition lists (not searched)

| File | Contents |
|---|---|
| `acquisition/medical_sources.json` | 15 discovery entries; not an approved knowledge base |
| `acquisition/hospital_research.json` | 6 official-link research seeds; no partnership |
| `acquisition/claude_candidates_400.json` | Provenance of the 90 owner-approved summaries |
