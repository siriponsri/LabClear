"""Check that every evidence record's URL still resolves (network; run by hand, never in tests).

Integration 4.0: also accepts --candidates to check knowledge/acquisition/claude_candidates_400.json
(report only; candidates stay NOT_APPROVED until a person reviews them).

    python scripts/verify_sources.py            # report only
    python scripts/verify_sources.py --write    # also record successful checks in the catalog

Each distinct URL in knowledge/evidence/catalog.json is fetched once with a browser-like
User-Agent (redirects followed, 15 s timeout). The script prints one row per record: id, HTTP
status and the final URL after redirects. With --write, records whose URL answered 200 get
verification.url_checked = true, verification.checked_at and verification.http_status; nothing
else in the record changes (content and content_sha256 are never touched), and records whose
URL failed keep their previous verification block.

A 200 response proves only that the page exists. A person still has to read the page and
confirm that the record's paraphrase matches it before url_checked is treated as reviewed.
Exit status is 1 if any URL failed (non-200 or a network error), otherwise 0.
"""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "knowledge" / "evidence" / "catalog.json"
TIMEOUT = 15.0
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
           "Accept-Language": "en-US,en;q=0.9,th;q=0.8"}


def fetch(client: httpx.Client, url: str) -> tuple[int | None, str]:
    """(status, final URL or error text). Streams so large PDFs are not downloaded."""
    try:
        with client.stream("GET", url) as response:
            return response.status_code, str(response.url)
    except httpx.HTTPError as exc:
        return None, f"{type(exc).__name__}: {exc}"[:200]


def check(records: list[dict], client: httpx.Client, workers: int = 8) -> dict[str, tuple[int | None, str]]:
    urls = sorted({r["url"] for r in records})
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(zip(urls, pool.map(lambda u: fetch(client, u), urls)))


def apply(records: list[dict], results: dict[str, tuple[int | None, str]], checked_at: str) -> int:
    """Mark records whose URL returned 200. Returns how many records were updated."""
    updated = 0
    for record in records:
        status, _ = results[record["url"]]
        if status != 200:
            continue
        verification = dict(record.get("verification") or {})
        verification.update({"url_checked": True, "checked_at": checked_at, "http_status": status})
        record["verification"] = verification
        updated += 1
    return updated


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="store successful checks in the catalog's verification fields")
    parser.add_argument("--catalog", type=Path, default=CATALOG, help=argparse.SUPPRESS)
    parser.add_argument("--candidates", action="store_true", help="check the Claude 4.0.0 acquisition candidates instead (report only)")
    args = parser.parse_args(argv)
    if args.candidates:
        if args.write:
            parser.error("--candidates is report only; review a candidate before it enters the catalog")
        args.catalog = ROOT / "knowledge" / "acquisition" / "claude_candidates_400.json"

    package = json.loads(args.catalog.read_text(encoding="utf-8"))
    records = package["records"] if "records" in package else package["entries"]
    own = client is None
    client = client or httpx.Client(headers=HEADERS, follow_redirects=True, timeout=TIMEOUT)
    try:
        results = check(records, client)
    finally:
        if own:
            client.close()

    width = max(len(r["id"]) for r in records)
    print(f"{'id':<{width}}  status  final URL")
    for record in records:
        status, final = results[record["url"]]
        print(f"{record['id']:<{width}}  {status if status is not None else 'ERR':<6}  {final}")
    failed = sorted(url for url, (status, _) in results.items() if status != 200)
    print(f"\n{len(results) - len(failed)}/{len(results)} distinct URLs returned 200 ({len(records)} records).")
    for url in failed:
        print(f"FAILED {results[url][0] or 'ERR'} {url}")

    if args.write:
        checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        updated = apply(records, results, checked_at)
        args.catalog.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote verification for {updated} records to {args.catalog}.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
