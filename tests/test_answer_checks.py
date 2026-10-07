"""Checks added after the first live run of the course test sets (Q07, Q08, Q09, image 02).

MOCKED_TEST_ONLY: model replies are scripted; these tests verify the server's checks.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from services import answer_checks, business_agent
from services.business_store import catalog
from services.conversation_transport import ConversationError
from services.lab_fields_v2 import ReportField, normalize
from tests.test_business_dots import REPORT, payload, script
from tests.test_business_v3 import isolated  # noqa: F401


def test_test_names_in_thai_questions_are_found():
    assert "HbA1c" in answer_checks.medical_terms("HbA1c คืออะไร ใช้ดูอะไร")
    assert {"LDL", "cholesterol"} <= set(answer_checks.medical_terms("ค่า LDL cholesterol บอกอะไรเกี่ยวกับสุขภาพ"))
    assert answer_checks.medical_terms("แพ็กเกจ Workday Check ราคาเท่าไหร่") == []
    assert answer_checks.medical_terms("salt and pepper") == []  # ALT only as a word


def test_a_health_question_is_searched_when_the_planner_gives_no_terms(monkeypatch):
    # Live run, Q08: the planner returned an empty query, so no medical source was searched.
    calls = script(monkeypatch, {"action": "answer", "query": "", "dot": "advisor"})
    out = asyncio.run(business_agent.run("HbA1c คืออะไร ใช้ดูอะไร", {}))
    assert "HbA1c" in payload(calls, 2)["decision"]["query"]
    assert any(t["id"] == "search" for t in out["trace"])


def test_amounts_must_be_catalog_prices():
    cat = catalog()
    # Live run, Q07: corporate prices doubled.
    assert answer_checks.unknown_amounts("Corporate Essential 1,980 บาทต่อคน (รวม 79,200 บาท)", cat, "พนักงาน 40 คน") == ["1,980", "79,200"]
    # The real price, and a total for the number of people the customer gave, are fine.
    assert answer_checks.unknown_amounts("Corporate Essential 990 บาทต่อคน รวม 39,600 บาท", cat, "พนักงาน 40 คน") == []
    # The customer's own budget, a plan price and a difference between prices are fine.
    assert answer_checks.unknown_amounts("งบ 1,500 บาท พอสำหรับ Essential ฿1,190 เหลือ 310 บาท; Plus 355 บาท", cat, "งบ 1,500 บาท", [355]) == []


def _writer(monkeypatch, replies):
    """Plan, then the given answers in turn, then a passing review."""
    script(monkeypatch, {"action": "answer", "query": "", "dot": "advisor"})
    replies, seen = list(replies), []

    async def complete(messages, **kw):
        seen.append(messages)
        if len(seen) == 1:
            return json.dumps({"action": "answer", "query": "", "dot": "advisor"})
        if len(seen) - 2 < len(replies):
            return json.dumps({"reply": replies[len(seen) - 2]})
        return json.dumps({"supported": True, "values_preserved": True, "within_scope": True})
    monkeypatch.setattr(business_agent.transport, "complete", complete)
    return seen


def test_a_wrong_price_is_rewritten_once_then_withheld(monkeypatch):
    seen = _writer(monkeypatch, ["Corporate Essential 1,980 บาท [rs-p16]", "Corporate Essential 990 บาท [rs-p16]"])
    assert "990 บาท" in asyncio.run(business_agent.run("ราคาแพ็กเกจองค์กร", {}))["reply"]
    assert "1,980" in seen[2][-1]["content"]  # the writer was told which amounts were wrong

    _writer(monkeypatch, ["Corporate Essential 1,980 บาท [rs-p16]", "Corporate Essential 1,980 บาท [rs-p16]"])
    with pytest.raises(ConversationError) as e:
        asyncio.run(business_agent.run("ราคาแพ็กเกจองค์กร", {}))
    assert e.value.code == "price_invalid"


def test_critical_flags_always_get_prompt_care_advice(monkeypatch):
    critical = {"fields": [{**REPORT["fields"][0], "printed_flag": "HH"}], "confirmed": True}
    assert answer_checks.critical_note(critical, "โพแทสเซียมสูง ควรปรึกษาแพทย์", "อธิบายผล") == answer_checks.NOTE_TH
    assert answer_checks.critical_note(critical, "Please see a doctor promptly.", "Explain") == ""
    assert answer_checks.critical_note(REPORT, "Glucose is above the range.", "Explain") == ""
    script(monkeypatch, {"action": "answer", "query": "", "dot": "explainer"}, reply="Glucose is above the printed range [nlm-x].")
    out = asyncio.run(business_agent.run("Please explain this report.", {"report": critical, "explain_report": True}))
    assert out["reply"].endswith(answer_checks.NOTE_EN)


@pytest.mark.parametrize("reference, unit, expected", [
    ("H 0.3 - 1.5", "mg/dL", "high"),      # a printed flag kept with the range
    ("0.3 - 1.5 H", "mg/dL", "high"),
    ("- 0.3 - 1.5", "mg/dL", "high"),      # the "-" of the flag column
    ("0.3 ‑ 1.5", "mg/dL", "high"),   # non-breaking hyphen
    ("(0.3 - 1.5)", "mg/dL", "high"),
    ("0.3 to 1.5", "mg/dL", "high"),
    ("0.3 - 1.5 mg/dL", "", "high"),       # no unit column: the range's own unit is removed
    ("Female 0.3 - 1.5", "mg/dL", "unknown"),
    ("0.3 - 1.5 mmol/L", "mg/dL", "unknown"),  # a different unit is never compared
])
def test_printed_ranges_in_common_shapes_are_compared(reference, unit, expected):
    assert normalize([ReportField(name="T", value="3.2", unit=unit, reference=reference)])[0]["status"] == expected
