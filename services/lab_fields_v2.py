"""Preserve printed values/ranges; conservative comparisons are background tools.

One-sided intervals are supported. Qualitative values are retained verbatim.
No clinical thresholds, diagnoses or risk scores are inferred here.
"""
from __future__ import annotations
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


def status(value: str, reference: str) -> str:
    value = value.strip()
    ref = reference.strip().replace("−", "-").replace("–", "-").replace("—", "-").replace("≤", "<=").replace("≥", ">=")
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
    return [{"id": f"r{i+1}", **field.model_dump(), "status": status(field.value, field.reference)} for i, field in enumerate(fields)]
