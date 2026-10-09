"""BM25 retrieval over the verified local evidence catalog (knowledge/evidence/catalog.json).

Every record carries Thai aliases, and records backed by a downloaded source file are
checked against their SHA-256 before use.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from services.conversation_transport import ConversationError

ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def corpus() -> list[dict]:
    path = ROOT / "knowledge" / "evidence" / "catalog.json"
    try:
        package = json.loads(path.read_text(encoding="utf-8"))
        records = package["records"]
        seen = set()
        for row in records:
            if row["id"] in seen or row["data_class"] not in {"public_reference", "public_education"}:
                raise ValueError
            seen.add(row["id"])
            if hashlib.sha256(row["content"].encode()).hexdigest() != row["content_sha256"]:
                raise ValueError
            if row.get("source_file"):
                source = (ROOT / row["source_file"]).resolve()
                if not source.is_relative_to((ROOT / "knowledge").resolve()) or hashlib.sha256(source.read_bytes()).hexdigest() != row.get("source_sha256"):
                    raise ValueError
            if not row["url"].startswith("https://"):
                raise ValueError
        return records
    except (OSError, ValueError, KeyError, TypeError):
        raise ConversationError("evidence_unavailable", "The verified reference collection is unavailable.") from None


def tokens(text: str) -> list[str]:
    text = text.casefold()
    latin = re.findall(r"[a-z0-9]+", text)
    # LLM query translation handles arbitrary languages. Thai bigrams also
    # support local lexical lookup without pretending this is semantic search.
    thai = re.findall(r"[\u0e00-\u0e7f]+", text)
    return latin + [word[i:i+2] for word in thai for i in range(len(word)-1)]


@lru_cache(maxsize=4)
def _index(serialized: str):
    """Build token frequencies once per corpus version, not for every query term."""
    docs = json.loads(serialized)
    vectors = [Counter(tokens(r["title"] + " " + " ".join(r.get("aliases", [])) + " " + r["content"])) for r in docs]
    lengths = [sum(d.values()) for d in vectors]
    frequencies = Counter(term for vector in vectors for term in vector)
    return vectors, lengths, frequencies


def lexical(query: str, limit: int = 6) -> list[dict]:
    from services.knowledge_admin import active_records
    docs = active_records(corpus())
    vectors, lengths, frequencies = _index(json.dumps(docs,sort_keys=True,ensure_ascii=False))
    n = len(docs)
    avg = sum(lengths) / max(1,n)
    q = set(tokens(query))
    scores = []
    for index, vector in enumerate(vectors):
        score = 0.0
        for term in q:
            freq = vector[term]
            if not freq:
                continue
            df = frequencies[term]
            idf = math.log(1 + (n - df + .5) / (df + .5))
            score += idf * (freq * 2.5) / (freq + 1.5 * (.25 + .75 * lengths[index] / max(1, avg)))
        if score > 0:
            scores.append((score, index))
    return [docs[i] for _, i in sorted(scores, key=lambda x: (-x[0], docs[x[1]]["id"]))[:limit]]


async def search(query: str, limit: int = 6) -> tuple[list[dict], str]:
    """BM25 over the verified catalog; returns the records and the retrieval mode."""
    return lexical(query, limit=limit), "lexical"
