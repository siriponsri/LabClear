"""Author-generated synthetic report fixtures that the medical harness may accept in a test environment.

The medical harness (MEDICAL_HARNESS_ENABLED) stays limited to synthetic reports until real-data
approval. Before integration 4.0 it accepted only the built-in sample chosen by ``demo_id``; the same
synthetic image sent as an ordinary multipart upload was refused, so a benchmark could pass only by
knowing a sample ID. This module recognises exact bytes of reviewed synthetic fixtures:

* only when ``APP_ENV`` is ``test`` (the offline benchmark and the live-free trial server), never in
  development or production;
* only by SHA-256 of the uploaded bytes against ``examples/thai_lab_reference_v3`` and an optional
  extra manifest (``SYNTHETIC_FIXTURE_MANIFEST``) of author-generated files;
* it marks the report ``synthetic_fixture`` and nothing else: no expected value, sample ID or answer
  key reaches OCR, retrieval, the planner or the writer, and every guard still runs.
"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from config import settings

ROOT = Path(__file__).resolve().parents[1]
BUILTIN = ROOT / "examples" / "thai_lab_reference_v3"


@lru_cache(maxsize=4)
def _hashes(extra: str) -> dict[str, str]:
    found = {}
    for folder in ("png", "pdf"):
        for path in sorted((BUILTIN / folder).glob("*.*")):
            found[hashlib.sha256(path.read_bytes()).hexdigest()] = f"builtin:{path.stem}"
    if extra:
        try:
            data = json.loads(Path(extra).read_text(encoding="utf-8"))
            for row in data.get("fixtures", []):
                if row.get("synthetic") is True and len(str(row.get("sha256", ""))) == 64:
                    found[row["sha256"]] = "fixture:" + str(row.get("id", "unnamed"))[:40]
        except (OSError, ValueError, AttributeError):
            pass
    return found


def trusted(raws: list[bytes]) -> str:
    """The fixture label when every uploaded file is a known synthetic fixture in a test environment."""
    if settings.APP_ENV != "test" or not raws:
        return ""
    table = _hashes(getattr(settings, "SYNTHETIC_FIXTURE_MANIFEST", "") or "")
    labels = [table.get(hashlib.sha256(raw).hexdigest(), "") for raw in raws]
    return ",".join(labels) if all(labels) else ""
