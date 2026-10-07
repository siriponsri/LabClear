"""Reading real-world model replies: JSON wrapped in prose or fences, nulls for unused fields,
string booleans, and one corrective retry. Validation of what matters stays strict.

MOCKED_TEST_ONLY: the transport is scripted with replies shaped like those real models send.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from services import business_agent, conversation_agent as agent
from services.conversation_transport import ConversationError
from tests.test_business_dots import script
from tests.test_business_v3 import isolated  # noqa: F401

GREETING_PLAN = {"action": "social", "query": None, "language": "Thai", "package_ids": None, "branch_id": "",
                 "date": "", "time": "", "booking_id": "", "method": "", "summary": "greeting", "dot": "advisor",
                 "ui": None, "reason": "the user said hello"}


def test_extract_json_from_fences_prose_and_reasoning():
    assert agent.extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert agent.extract_json('Sure! Here it is: ```\n{"a": {"b": [1]}}\n``` Hope it helps.') == {"a": {"b": [1]}}
    assert agent.extract_json('<think>maybe {"a": 0}</think>{"a": 2}') == {"a": 2}
    with pytest.raises(ValueError):
        agent.extract_json("Hello there")


def test_planner_reads_nulls_blank_method_and_unknown_actions():
    plan = business_agent.Plan.model_validate(GREETING_PLAN)
    assert (plan.action, plan.method, plan.query, plan.package_ids, plan.ui) == ("answer", "center", "", [], [])
    odd = business_agent.Plan.model_validate({"action": "dance", "date": "next Monday", "time": "9:30",
                                              "package_ids": "P05", "method": "PromptPay"})
    assert (odd.action, odd.date, odd.time, odd.package_ids, odd.method) == ("clarify", "", "09:30", ["P05"], "promptpay")


def test_greeting_runs_end_to_end_with_a_loose_planner(monkeypatch):
    calls = script(monkeypatch, GREETING_PLAN, reply="สวัสดีครับ มีอะไรให้ช่วยไหมครับ", evidence_ids=())
    out = asyncio.run(business_agent.run("สวัสดีครับ", {}))
    assert out["reply"].startswith("สวัสดี") and out["sources"] == [] and len(calls) == 3


def test_one_corrective_retry_then_a_named_error(monkeypatch):
    replies = iter(["I think the user wants help.", json.dumps({"action": "answer", "dot": "advisor"})])
    sent = []

    async def complete(messages, **kw):
        sent.append(messages)
        return next(replies)

    monkeypatch.setattr(agent.transport, "complete", complete)
    plan = asyncio.run(agent.complete_json([{"role": "user", "content": "hi"}], business_agent.Plan, step="plan", max_tokens=50))
    assert plan.action == "answer" and len(sent) == 2 and "not valid JSON" in sent[1][-1]["content"]

    async def always_bad(messages, **kw):
        return json.dumps({"reply": ""})

    monkeypatch.setattr(agent.transport, "complete", always_bad)
    with pytest.raises(ConversationError) as e:
        asyncio.run(agent.complete_json([{"role": "user", "content": "hi"}], agent.Answer, step="answer", max_tokens=50))
    assert e.value.code == "answer_invalid" and "answer could not be verified (reply)" in e.value.message


def test_review_accepts_string_booleans_but_nothing_vaguer():
    assert agent.EvidenceReview.model_validate({"supported": "true", "values_preserved": True, "within_scope": "TRUE", "note": "ok"}).supported
    with pytest.raises(Exception):
        agent.EvidenceReview.model_validate({"supported": "yes", "values_preserved": True, "within_scope": True})
    with pytest.raises(Exception):
        agent.EvidenceReview.model_validate({"supported": True, "values_preserved": True})


def test_sources_follow_inline_citations_and_unknown_ids_still_fail():
    evidence = [{"id": "nlm-a"}, {"id": "nlm-b"}]
    answer = agent.Answer.model_validate({"reply": "A [nlm-b] and B [nlm-a].", "evidence_ids": ["nlm-a"]})
    agent.validate_answer(answer, evidence, None)
    assert answer.evidence_ids == ["nlm-b", "nlm-a"]
    with pytest.raises(ConversationError) as e:
        agent.validate_answer(agent.Answer.model_validate({"reply": "C [made-up]."}), evidence, None)
    assert e.value.code == "citation_invalid"


def test_changed_report_value_is_still_withheld():
    report = {"fields": [{"id": "f1", "value": "5.60", "unit": "%", "reference": "4.0-5.6", "status": "unknown"}]}
    answer = agent.Answer.model_validate({"reply": "Your HbA1c", "observations": [
        {"field_id": "f1", "value": 5.6, "unit": "%", "reference": "4.0-5.6", "status": "unknown"}]})
    with pytest.raises(ConversationError) as e:
        agent.validate_answer(answer, [], report)
    assert e.value.code == "observation_invalid"


def test_answer_listing_every_package_is_accepted():
    # First live run of the test sets, Q01: 18 packages cited, rejected by a 12-ID limit.
    evidence = [{"id": f"rs-p{i:02d}"} for i in range(1, 19)]
    reply = "\n".join(f"- Package {i} [rs-p{i:02d}]" for i in range(1, 19))
    answer = agent.Answer.model_validate({"reply": reply, "evidence_ids": [e["id"] for e in evidence]})
    agent.validate_answer(answer, evidence, None)
    assert len(answer.evidence_ids) == 18


def test_medical_citations_stay_few():
    evidence = [{"id": f"nlm-{i}"} for i in range(10)]
    answer = agent.Answer.model_validate({"reply": " ".join(f"[nlm-{i}]" for i in range(9))})
    with pytest.raises(ConversationError) as e:
        agent.validate_answer(answer, evidence, None)
    assert e.value.code == "citation_invalid"


def test_observations_without_a_report_are_ignored():
    # First live run, Q02: a package answer carried "observations" although no report was in the chat.
    answer = agent.Answer.model_validate({"reply": "Essential Check [rs-p01]", "observations": [
        {"field_id": "P01", "value": 1190, "unit": "THB", "reference": "", "status": "normal"}, {"name": "x"}]})
    agent.validate_answer(answer, [{"id": "rs-p01"}], None)
    assert answer.observations == []


def test_observation_shows_the_report_row_and_ignores_spacing_only():
    report = {"fields": [{"id": "f1", "value": "6.1", "unit": "%", "reference": "4.0–5.6", "status": "high"}]}
    answer = agent.Answer.model_validate({"reply": "HbA1c 6.1 %", "observations": [
        {"field_id": "f1", "value": "6.1", "unit": "%", "reference": "4.0 - 5.6", "status": "within"},
        {"field_id": "f1", "value": "6.1", "unit": "%", "reference": "4.0-5.6", "status": "high"},
        {"field_id": "zz", "value": "1", "unit": "", "reference": "", "status": "low"}]})
    agent.validate_answer(answer, [], report)
    assert [o.model_dump() for o in answer.observations] == [{"field_id": "f1", "value": "6.1", "unit": "%", "reference": "4.0–5.6", "status": "high"}]


def test_links_images_and_html_are_removed_before_the_customer_sees_them():
    answer = agent.Answer.model_validate({"reply": "See <b>this</b> [guide](https://x.example/a) www.x.example "
                                          "![i](http://a/b.png)<br>LDL < 130 and HDL > 40 [nlm-a](https://medlineplus.gov/)"})
    agent.validate_answer(answer, [{"id": "nlm-a"}], None)
    for gone in ("http", "www.", "<b>", "![", "<br>"):
        assert gone not in answer.reply
    assert "this guide" in answer.reply and "LDL < 130 and HDL > 40" in answer.reply and answer.evidence_ids == ["nlm-a"]
