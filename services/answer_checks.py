"""Deterministic checks on a drafted answer, added after the first live run of the course test sets.

- medical_terms: test names from the knowledge base found in a message, so a health question is
  always searched even when the planner leaves the search terms empty (Q08, Q09).
- unknown_amounts: money amounts in an answer that are not catalog or plan prices (Q07 doubled
  the corporate prices).
- critical_note: a fixed advice line when the confirmed report prints a critical flag and the
  answer does not already ask for prompt care (image 02).
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from functools import lru_cache

from services import evidence_search

# Aliases that name no test, or that occur inside other Thai words, are not used to detect a topic.
GENERIC = {"normal", "high", "low", "reference range", "reference interval", "ค่าอ้างอิง", "ผลแล็บ", "ช่วงอ้างอิง"}


@lru_cache(maxsize=1)
def _aliases() -> list[tuple[str, re.Pattern]]:
    found = {}
    for record in evidence_search.corpus():
        for alias in record.get("aliases", []):
            alias = alias.strip()
            if alias.casefold() in GENERIC or alias in found:
                continue
            if re.search(r"[฀-๿]", alias):
                if len(alias) >= 3:
                    found[alias] = re.compile(re.escape(alias))
            elif len(alias) >= 2:
                # Short abbreviations (LDL, ALT) must match as written; longer names ignore case.
                found[alias] = re.compile(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", 0 if len(alias) <= 3 else re.I)
    return sorted(found.items(), key=lambda kv: -len(kv[0]))


def medical_terms(text: str, limit: int = 8) -> list[str]:
    terms: list[str] = []
    for alias, pattern in _aliases():
        if pattern.search(text) and not any(alias.casefold() in t.casefold() for t in terms):
            terms.append(alias)
            if len(terms) == limit:
                break
    return terms


_MONEY = re.compile(r"฿\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|THB|baht)", re.I)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _decimal(text: str) -> Decimal | None:
    try:
        return Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None


def unknown_amounts(reply: str, catalog: dict, message: str = "", extra_prices=()) -> list[str]:
    """Amounts in the reply that are not a catalog or plan price, a number the customer gave, a
    price times a number the customer gave (a total for 40 people), or a difference of those."""
    prices = {Decimal(str(p["price_thb"])) for p in catalog.get("packages", [])} | {Decimal(str(p)) for p in extra_prices}
    given = {d for d in (_decimal(n) for n in _NUMBER.findall(message)) if d is not None}
    known = prices | given
    allowed = known | {p * n for p in prices for n in given if n == n.to_integral_value() and 0 < n <= 10000}
    allowed |= {abs(a - b) for a in known for b in known}
    out = []
    for m in _MONEY.finditer(reply):
        raw = m.group(1) or m.group(2)
        value = _decimal(raw)
        if value is not None and value not in allowed and raw not in out:
            out.append(raw)
    return out


CRITICAL_FLAGS = {"HH", "LL", "H*", "L*", "*", "**", "!", "!!", "C", "CRIT", "CRITICAL", "PANIC"}
_URGENT = re.compile(r"โดยเร็ว|ทันที|ฉุกเฉิน|เร่งด่วน|promptly|immediately|urgent|right away|as soon as possible", re.I)
NOTE_TH = "ใบรายงานนี้มีค่าที่ถูกทำเครื่องหมายเป็นค่าวิกฤต กรุณาติดต่อแพทย์หรือสถานพยาบาลโดยเร็ว"
NOTE_EN = "This report marks a value as critical. Please contact a doctor or a medical service promptly."


def critical_note(report: dict | None, reply: str, message: str = "") -> str:
    flags = [str(f.get("printed_flag") or "").strip() for f in (report or {}).get("fields", [])]
    critical = any(f.upper() in CRITICAL_FLAGS or "critical" in f.lower() or "วิกฤต" in f for f in flags if f)
    if not critical or _URGENT.search(reply):
        return ""
    return NOTE_TH if re.search(r"[฀-๿]", message + reply) else NOTE_EN
