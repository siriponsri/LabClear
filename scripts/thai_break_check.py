"""Judge where a browser wrapped Thai text: between words, or inside a word (line protocol).

Used by tests/browser/i18n_audit.mjs. Each input line is JSON {"pairs": [[left, right], ...]}: for every
place the rendered text wraps, the browser's (ICU) word segment that ends the line and the one that
starts the next line. A wrap is inside a word when either segment is Thai and is neither a PyThaiNLP
dictionary word nor made only of dictionary words ("ไม่มี" = ไม่+มี is fine; "พร้|อม" and "แช|ตนั้"
are not). Each output line is JSON {"bad": [[left, right], ...]}. Same rule as
scripts/thai_keep_words.py, which builds the list of words the site keeps together.

    pip install pythainlp     # developer/test tool only
"""
from __future__ import annotations

import json
import os
import re
import sys

THAI = re.compile(r"[ก-ฺเ-๛]")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    from pythainlp.corpus import thai_words
    from pythainlp.tokenize import word_tokenize
    from thai_keep_words import EXTRA, KNOWN

    words = set(thai_words()) | set(EXTRA) | set(KNOWN)
    cache: dict[str, bool] = {}

    def bad(seg: str) -> bool:
        core = seg.replace("⁠", "").strip("​  ")
        if core not in cache:
            cache[core] = bool(THAI.search(core)) and core not in words and not re.fullmatch(r"[ๆฯ\s]+|น\.?", core) \
                and not all(t in words for t in word_tokenize(core, engine="newmm") if t.strip())
        return cache[core]

    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        req = json.loads(line)
        out = [[a, b] for a, b in req.get("pairs", []) if bad(a) or bad(b)]
        print(json.dumps({"bad": out}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
