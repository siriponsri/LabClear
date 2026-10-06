from __future__ import annotations

import re
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class ParsedLabValue:
    marker: str
    value: float
    unit: str | None
    reference_low: float | None
    reference_high: float | None
    flag: str  # low | high | within | unknown
    range_state: str  # valid | missing | invalid

    def to_dict(self) -> dict:
        return asdict(self)


# Conservative parser for the demo's highest-value pattern:
#   Hb 10.8 g/dL (12–16)
#   MCV: 72 fL [80-100]
#   HbA1c 6.1%
# It intentionally does not attempt full OCR/report parsing.
LAB_VALUE_RE = re.compile(
    r"(?P<marker>[A-Za-z][A-Za-z0-9+_.\-]{1,24})"
    r"\s*(?::|=)?\s*"
    r"(?P<value>-?\d+(?:\.\d+)?)"
    r"\s*(?P<unit>%|[A-Za-zµμ][A-Za-z0-9µμ/%\.\^²\-]*)?"
    r"\s*(?:[\(\[]\s*(?P<low>-?\d+(?:\.\d+)?)\s*[-–—]\s*"
    r"(?P<high>-?\d+(?:\.\d+)?)\s*[\)\]])?",
    flags=re.IGNORECASE,
)


def _flag(value: float, low: float | None, high: float | None) -> str:
    if low is None or high is None:
        return "unknown"
    if low > high:
        return "unknown"
    if value < low:
        return "low"
    if value > high:
        return "high"
    return "within"


def extract_lab_values(text: str, max_values: int = 30) -> list[ParsedLabValue]:
    results: list[ParsedLabValue] = []
    seen_spans: set[tuple[int, int]] = set()

    for match in LAB_VALUE_RE.finditer(text):
        if len(results) >= max_values:
            break
        span = match.span()
        if span in seen_spans:
            continue
        seen_spans.add(span)

        marker = match.group("marker")
        # Avoid parsing ordinary prose tokens that happen to be followed by a number.
        # This parser is called only after the lab scope gate, but still stay conservative.
        if len(marker) > 20:
            continue

        value = float(match.group("value"))
        low = float(match.group("low")) if match.group("low") is not None else None
        high = float(match.group("high")) if match.group("high") is not None else None
        unit = match.group("unit") or None

        # A no-unit/no-range item is only useful when it looks like a conventional marker token.
        if unit is None and low is None and not re.fullmatch(r"[A-Za-z][A-Za-z0-9+_.\-]{1,12}", marker):
            continue

        results.append(
            ParsedLabValue(
                marker=marker,
                value=value,
                unit=unit,
                reference_low=low,
                reference_high=high,
                flag=_flag(value, low, high),
                range_state=(
                    "missing"
                    if low is None or high is None
                    else "invalid"
                    if low > high
                    else "valid"
                ),
            )
        )

    return results


def build_symbolic_context(values: list[ParsedLabValue]) -> str:
    if not values:
        return ""

    lines = [
        "SYMBOLIC PARSER OUTPUT (ground truth only for values explicitly parsed from the user's text):"
    ]
    for item in values:
        unit = f" {item.unit}" if item.unit else ""
        if item.reference_low is not None and item.reference_high is not None:
            ref = f"; supplied reference {item.reference_low:g}–{item.reference_high:g}{unit}"
        else:
            ref = "; no supplied reference range"
        lines.append(
            f"- {item.marker}: {item.value:g}{unit}{ref}; deterministic flag={item.flag}"
        )
    lines.append(
        "Do not change these numeric values. Treat 'unknown' as not flaggable without a supplied range."
    )
    return "\n".join(lines)
