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
    if re.search(r"reference\s+(?:range|interval)|printed\s+(?:reference\s+)?interval|ช่วงอ้างอิง|ค่าอ้างอิง", text, re.I):
        terms.append("reference interval")
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
    # Membership alone accepted a different package's valid catalog price.
    # Bind a clearly named single package to its displayed unit price. Explicit
    # totals/differences remain governed by the arithmetic allowance above.
    for line in reply.splitlines():
        named = [p for p in catalog.get('packages',[]) if p['name'].casefold() in line.casefold()]
        if len(named) != 1:
            continue
        p = named[0]
        tail = line[line.casefold().index(p['name'].casefold())+len(p['name']):]
        match = _MONEY.search(tail)
        if not match or re.search(r'รวม|total|เหลือ|remaining|ต่าง|difference',tail[:match.start()],re.I):
            continue
        raw=match.group(1) or match.group(2)
        if _decimal(raw) != Decimal(str(p['price_thb'])) and raw not in out:
            out.append(raw)
    return out


CRITICAL_FLAGS = {"HH", "LL", "H*", "L*", "*", "**", "!", "!!", "C", "CRIT", "CRITICAL", "PANIC"}
_URGENT = re.compile(r"โดยเร็ว|ทันที|ฉุกเฉิน|เร่งด่วน|promptly|immediately|urgent|right away|as soon as possible", re.I)
NOTE_TH = "ใบรายงานนี้มีค่าที่ถูกทำเครื่องหมายเป็นค่าวิกฤต กรุณาติดต่อแพทย์หรือสถานพยาบาลโดยเร็ว"
NOTE_EN = "This report marks a value as critical. Please contact a doctor or a medical service promptly."


def critical_note(report: dict | None, reply: str, message: str = "") -> str:
    flags = [str(f.get("printed_flag") or "").strip() for f in (report or {}).get("fields", [])]
    critical = any(f.upper() in CRITICAL_FLAGS or "critical" in f.lower() or "วิกฤต" in f for f in flags if f)
    # A bare urgency keyword can occur in a conditional clause ("if symptoms...")
    # or even a sales sentence. Only our full, unconditional note is idempotent.
    if not critical or NOTE_TH in reply or NOTE_EN in reply:
        return ""
    return NOTE_TH if re.search(r"[฀-๿]", message + reply) else NOTE_EN


def content_issues(reply: str, evidence: list[dict], report: dict | None = None, message: str = "") -> list[str]:
    """Bounded regression checks, not a clinical classifier or proof of entailment.

    Catch observed source-type and named-row range failures before model review.
    Never substitute an external threshold or silently repair a patient's values.
    """
    issues = []
    sources = {e['id']: e for e in evidence}
    plain = re.sub(r'[*_`]', '', reply).replace('–', '-').replace('−', '-').replace('—', '-')
    # Observed live regression: a unit-less number was labelled normal by guessing a unit.
    # A bounded affirmative-pattern check, not a general clinical classifier.
    missing_unit = re.search(r'without (?:a |the )?unit|unit (?:is |was )?not (?:given|provided)|ไม่มีหน่วย|ไม่(?:ได้)?ระบุหน่วย', message, re.I)
    if missing_unit:
        classification = re.search(r'(?:ค่า\s*)?\d+(?:\.\d+)?\s*(?:ถือว่า|อยู่ในเกณฑ์)(?:ปกติ|สูง|ต่ำ)|\b\d+(?:\.\d+)?\s+(?:is|would be|counts as)\s+(?:normal|high|low)\b', plain, re.I)
        if classification and not re.search(r'cannot|can not|not know|whether|ไม่สามารถ|บอกไม่ได้', plain[max(0,classification.start()-30):classification.start()], re.I):
            issues.append('numeric_classification_without_unit')
    # Disease staging is outside the report explainer's remit, even when hedged.
    if report and re.search(r'(?:ไตวาย|โรคไต|ภาวะไต|ไตเรื้อรัง|มะเร็ง)\s*(?:เรื้อรัง\s*)?ระยะ(?:ที่)?\s*[0-9๐-๙IVX]+|(?:kidney\s+(?:disease|failure)|cancer|CKD).{0,25}(?:stage\s*[0-9IVX]+|G[1-5])|stage\s*[0-9IVX]+.{0,25}(?:kidney|cancer|CKD)', plain, re.I):
        issues.append('personal_disease_staging')
    if report:
        schedule = re.search(r'ตรวจ(?:ซ้ำ|อีกครั้ง).{0,30}\d+\s*(?:วัน|สัปดาห์|เดือน|ปี)|(?:repeat|retest|recheck).{0,30}\b(?:in|after|within)\s+\d+\s*(?:days?|weeks?|months?|years?)', plain, re.I)
        if schedule and not re.search(r'cannot|can not|do not|ไม่(?:ควร|สามารถ)|บอกไม่ได้', plain[max(0,schedule.start()-45):schedule.start()], re.I):
            issues.append('personal_retesting_schedule')
    # An educational disclaimer later in a reply does not undo an affirmative
    # personal diagnosis earlier in it. This is a bounded regression check.
    if report:
        personal = re.search(
            r"(?:ค่าเหล่านี้|ผล(?:ตรวจ)?(?:เหล่านี้|นี้|ของคุณ)).{0,35}(?:แสดงว่า|บ่งชี้ว่า|หมายความว่า)\s*(?:คุณ)?มี\s*(?:ภาวะ|โรค|มะเร็ง|เบาหวาน|โลหิตจาง)"
            r"|(?:these|your)\s+(?:lab\s+)?results?.{0,35}(?:show|confirm|mean|indicate)\s+(?:that\s+)?you\s+have\b",
            plain, re.I)
        if personal and not re.search(r"ไม่(?:ได้)?|do not|does not|cannot|can't", personal.group(0), re.I):
            issues.append('personal_diagnosis_asserted')
    # A disclaimer/negation can still amplify a fabricated numeric business promise.
    # Compare percentages to actual policy content, never a fixed forbidden benchmark string.
    if re.search(r'คืนเงิน|refund', message, re.I):
        policy=' '.join(e.get('content','') for e in evidence if e.get('id')=='rs-policy')
        percentages=lambda s: set(re.sub(r'\s+','',x) for x in re.findall(r'\d+(?:\.\d+)?\s*%',s))
        if percentages(plain)-percentages(policy):issues.append('unsupported_policy_percentage')
    for line in plain.splitlines():
        ids = re.findall(r'\[([a-z0-9][a-z0-9_-]+)\]', line)
        business = [i for i in ids if sources.get(i, {}).get('data_class') in {'synthetic_business', 'official_external'}]
        words = re.sub(r'\[[^\]]+\]', '', line)
        # A test word alone is not a medical claim: e.g. blood collection at
        # home or viewing results online are service facts (live Q10).
        clinical = re.search(r'หมายถึง|บ่งชี้|สะท้อน|วินิจฉัย|ทำให้|เกิดจาก|เสี่ยง|สูงกว่า|ต่ำกว่า|ค่าปกติ|เกณฑ์|ใช้(?:ดู|ประเมิน|วัด)|คือ|indicat|diagnos|caus|risk|reflect|measur|above|below|normal range', words, re.I)
        measurement = re.search(r'\d\s*(?:mg/dl|mmol/l|g/dl)|เกณฑ์|ค่าปกติ', words, re.I)
        if business and (measurement or (clinical and medical_terms(words))):
            issues.append('business_source_for_medical_claim')
        # Check the printed range for an explicitly named row on a line. Ambiguous
        # multi-row prose stays with the evidence reviewer, never guessed here.
        rows = [f for f in (report or {}).get('fields', []) if re.search(r'(?<![A-Za-z])'+re.escape(f.get('name',''))+r'(?![A-Za-z])', line, re.I) and f.get('name')]
        if rows:
            # Longer names win only when the shorter match is part of that name.
            rows = [f for f in rows if not any(f['name'].casefold() in g['name'].casefold() and len(g['name']) > len(f['name']) for g in rows)]
        if len(rows) == 1:
            row = rows[0]
            ranges = re.findall(r'(?<![\w.])(?:\d+(?:\.\d+)?)\s*-\s*(?:\d+(?:\.\d+)?)', line)
            compact = lambda s: re.sub(r'\s+', '', s).casefold()
            if any(compact(r) not in compact(str(row.get('reference','')).replace('–','-').replace('−','-').replace('—','-')) for r in ranges):
                issues.append('named_report_range_changed')
    return list(dict.fromkeys(issues))
