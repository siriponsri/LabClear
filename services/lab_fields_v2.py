"""Preserve printed values/ranges; conservative comparisons are background tools.

One-sided intervals are supported. Qualitative values are retained verbatim.
No clinical thresholds, diagnoses or risk scores are inferred here.
"""
from __future__ import annotations
import logging
import re
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class ReportField(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=150)
    unit: str = Field(default="", max_length=60)
    reference: str = Field(default="", max_length=150)
    printed_flag: str = Field(default="", max_length=25)


_N = r"[+-]?(?:\d+(?:\.\d+)?|\.\d+)"


_DASHES = str.maketrans({c: "-" for c in "\u2212\u2013\u2014\u2010\u2011\u2012\u2015\ufe58\ufe63\uff0d"})
_FLAG = r"(?:HH|LL|H|L|N|\*)"
_UNIT = r"[A-Za-z\u00b5\u03bc%/][A-Za-z0-9\u00b5\u03bc%/.^\u00b2\u00b3 ]*"
log = logging.getLogger("labclear.report")


def status(value: str, reference: str, unit: str = "") -> str:
    value = value.strip()
    ref = reference.strip().translate(_DASHES).replace("\u2264", "<=").replace("\u2265", ">=")
    ref = re.sub(r"\s+(?:to|\u0e16\u0e36\u0e07)\s+", " - ", ref, flags=re.I).strip()
    if ref[:1] + ref[-1:] in ("()", "[]"):
        ref = ref[1:-1].strip()
    # A printed flag read into the range ("H 0.3 - 1.5", "0.3 - 1.5 H", the "-" of an empty flag column).
    ref = re.sub(rf"^(?:{_FLAG}|-)\s+(?=[<>+\d.])", "", ref)
    ref = re.sub(rf"(?<=\d)\s+{_FLAG}$", "", ref)
    # Reports often repeat the row's unit after the range ("70 - 99 mg/dL"); only that exact unit is removed,
    # or the range's own unit when the row has none.
    if unit.strip() and ref.lower().endswith(unit.strip().lower()):
        ref = ref[: -len(unit.strip())].strip()
    elif not unit.strip():
        ref = re.sub(rf"(?<=\d)\s*{_UNIT}$", "", ref).strip()
    # A comparator result (<5), comma-decimal ambiguity, or reference containing
    # multiple populations is left unknown, rather than guessed.
    if not re.fullmatch(_N, value):
        return "unknown"
    v = Decimal(value)
    two = re.fullmatch(rf"\s*({_N})\s*-\s*({_N})\s*", ref)
    if two:
        low, high = map(Decimal, two.groups())
        if low > high:
            return "unknown"
        return "low" if v < low else "high" if v > high else "within"
    one = re.fullmatch(rf"(<=|>=|<|>)\s*({_N})", ref)
    if one:
        op, bound = one.group(1), Decimal(one.group(2))
        inside = {"<": v < bound, "<=": v <= bound, ">": v > bound, ">=": v >= bound}[op]
        return "within" if inside else "high" if op.startswith("<") else "low"
    return "unknown"


def normalize(fields: list[ReportField]) -> list[dict]:
    rows = [{"id": f"r{i+1}", **field.model_dump(), "status": status(field.value, field.reference, field.unit)} for i, field in enumerate(fields)]
    # Shapes only (digits as 9, letters as a), never values: shows which printed ranges could not be compared.
    shapes = sorted({re.sub(r"[A-Za-z]", "a", re.sub(r"\d", "9", r["reference"]))[:30] for r in rows
                     if r["status"] == "unknown" and r["reference"] and re.fullmatch(_N, r["value"].strip())})
    if shapes:
        log.warning("range_not_compared shapes=%s", " | ".join(shapes[:5]))
    return rows
