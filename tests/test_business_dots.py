"""Assistant roles (Dots): routing, server-enforced permissions and page shortcuts.

MOCKED_TEST_ONLY: the model transport is scripted so these tests verify the server's
enforcement around the model, not model quality.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from services import business_agent, business_dots, business_store as db
from services.conversation_transport import ConversationError
from tests.test_business_v3 import client, isolated, promote  # noqa: F401

REPORT = {"fields": [{"id": "f1", "name": "Glucose", "value": "101", "unit": "mg/dL", "reference": "70-99", "status": "high", "printed_flag": "H"}], "confirmed": True}


def script(monkeypatch, plan: dict, reply: str = "Here is what that means [nlm-x].", evidence_ids=("nlm-x",)):
    calls = []

    async def complete(messages, **kw):
        calls.append(messages)
        stage = len(calls)
        if stage == 1:
            return json.dumps(plan)
        if stage == 2:
            return json.dumps({"reply": reply, "evidence_ids": list(evidence_ids), "observations": [], "followups": []})
        return json.dumps({"supported": True, "values_preserved": True, "within_scope": True})

    async def no_guard(*a, **k):
        return None

    async def search(query, limit=6):
        return [{"id": "nlm-x", "title": "Lab results", "content": "Reference intervals vary by laboratory.", "url": "https://medlineplus.gov/", "publisher": "MedlinePlus", "data_class": "public_education"}], "lexical"

    monkeypatch.setattr(business_agent.transport, "complete", complete)
    monkeypatch.setattr(business_agent.guard, "check", no_guard)
    monkeypatch.setattr(business_agent.evidence_search, "search", search)
    return calls


def payload(calls, stage):
    return json.loads(calls[stage - 1][-1]["content"])


def test_planner_never_sees_report_values(monkeypatch):
    calls = script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "explainer"})
    out = asyncio.run(business_agent.run("What does my glucose mean?", {"report": REPORT}))
    plan_input = payload(calls, 1)
    assert plan_input["report"] == {"available": True, "tests": ["Glucose"]}
    assert "101" not in json.dumps(plan_input)
    assert out["dot"] == {"id": "explainer", "name": "Report Explainer"}
    assert payload(calls, 2)["REPORT"]["fields"][0]["value"] == "101"  # the explainer does get the confirmed values


def test_sales_action_is_rerouted_and_loses_report_access(monkeypatch):
    calls = script(monkeypatch, {"action": "quote", "package_ids": ["P05"], "query": "glucose", "dot": "explainer"},
                   reply="Glucose Follow-up is reviewed by staff [rs-p05].", evidence_ids=("rs-p05",))
    out = asyncio.run(business_agent.run("Should I buy a glucose test?", {"report": REPORT}))
    assert out["dot"]["id"] == "advisor" and out["rerouted_from"] == "explainer"
    answer_input = payload(calls, 2)
    assert answer_input["REPORT"] is None and answer_input["PREVIOUS_REPORTS"] == []
    assert out["action"]["type"] == "handoff"  # follow-up tests still require staff review


def test_explainer_cannot_name_or_price_packages(monkeypatch):
    script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "explainer"},
           reply="You could add Glucose Follow-up for 590 THB [nlm-x].")
    with pytest.raises(ConversationError) as e:
        asyncio.run(business_agent.run("explain", {"report": REPORT}))
    assert e.value.code == "role_violation"


def test_explainer_has_no_catalog_evidence(monkeypatch):
    calls = script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "explainer"})
    asyncio.run(business_agent.run("explain", {"report": REPORT}))
    ids = {e["id"] for e in payload(calls, 2)["EVIDENCE"]}
    assert ids == {"nlm-x", "rs-policy"} and not any(i[3:4] == "p" and i[4:].isdigit() for i in ids)


def test_ui_shortcuts_are_whitelisted_validated_and_capped():
    roles = business_dots.enabled()
    catalog, branches = db.catalog(), db.branches()
    advisor = roles["advisor"]
    out = business_dots.validate_ui([
        {"type": "open_package", "args": {"package_id": "P99"}},           # unknown package
        {"type": "highlight_report_field", "args": {"field_id": "f1"}},    # not an advisor command
        {"type": "eval_js", "args": {"code": "alert(1)"}},                 # not a command at all
        {"type": "prefill_booking", "args": {"package_id": "P05"}},        # needs staff review: not bookable
        {"type": "open_compare", "args": {"package_ids": ["P01", "P02", "P02"]}},
        {"type": "prefill_booking", "args": {"package_id": "P02", "branch_id": "BKK01", "date": "2026-13-01"}},
        {"type": "open_view", "args": {"view": "packages"}},
    ], advisor, catalog, branches, REPORT)
    assert out == [{"type": "open_compare", "args": {"package_ids": ["P01", "P02"]}},
                   {"type": "prefill_booking", "args": {"package_id": "P02", "name": "Workday Check", "branch_id": "BKK01"}}]
    explainer = business_dots.validate_ui([{"type": "highlight_report_field", "args": {"field_id": "f1"}}, {"type": "open_package", "args": {"package_id": "P02"}}],
                                          roles["explainer"], catalog, branches, REPORT)
    assert explainer == [{"type": "highlight_report_field", "args": {"field_id": "f1"}}]


def test_manager_can_pause_a_role_and_routing_falls_back(monkeypatch):
    c = client(False)
    assert [d["id"] for d in c.get("/api/business/dots").json()["dots"]] == ["advisor", "explainer"]
    customer = client()
    assert customer.put("/api/business/staff/dots/explainer", json={"enabled": False}).status_code == 403
    m = client(); promote(m)
    r = m.put("/api/business/staff/dots/explainer", json={"enabled": False})
    assert r.status_code == 200 and not next(d for d in r.json()["dots"] if d["id"] == "explainer")["enabled"]
    calls = script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "explainer"})
    out = asyncio.run(business_agent.run("explain", {"report": REPORT}))
    assert out["dot"]["id"] == "advisor" and payload(calls, 2)["REPORT"] is None
    m.put("/api/business/staff/dots/advisor", json={"enabled": False})
    with pytest.raises(ConversationError) as e:
        asyncio.run(business_agent.run("hello", {}))
    assert e.value.code == "assistant_paused"


def test_page_context_reaches_planner_and_dot_label_is_stored(monkeypatch):
    from routers import business
    seen = {}

    async def agent(message, context):  # MOCKED_TEST_ONLY
        seen.update(context)
        return {"reply": "ok", "sources": [], "action": None, "dot": {"id": "advisor", "name": "Health-check Advisor"},
                "ui": [{"type": "open_package", "args": {"package_id": "P02", "name": "Workday Check"}}]}
    monkeypatch.setattr(business.business_agent, "run", agent)
    c = client()
    r = c.post("/api/business/chat", json={"message": "Is this one good?", "page": {"path": "/packages/P02", "package_id": "P02", "compare_ids": ["P01", "x<script>"]}})
    assert r.status_code == 200, r.text
    assert seen["page"] == {"path": "/packages/P02", "package_id": "P02", "compare_ids": ["P01"], "view": ""}
    m = c.get("/api/business/workspace").json()["conversation"]["messages"][-1]
    assert m["dot"]["name"] == "Health-check Advisor" and m["ui"][0]["type"] == "open_package"
    assert c.post("/api/business/chat", json={"message": "x", "page": {"path": "javascript:alert(1)"}}).status_code == 422
