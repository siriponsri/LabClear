"""Typed tools: schemas, permission scope, timeout, output limits, audit and pipeline integration.

MOCKED_TEST_ONLY: the model transport is scripted; these tests check the server's control of data.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from services import agent_tools as tools, business_agent, business_dots
from services.business_store import branches, catalog, policies, quote
from services.conversation_transport import ConversationError
from tests.test_business_dots import REPORT, script
from tests.test_business_v3 import isolated  # noqa: F401


def ctx(role="advisor", report=None, search=None):
    dot = business_dots.enabled()[role]
    async def default_search(query, limit):
        return [{"id": "nlm-x", "title": "X", "content": "c", "data_class": "public_education", "url": "https://x"}], "lexical"
    return tools.ToolContext.for_role(dot, biz={"catalog": catalog(), "branches": branches(), "policy": policies()},
                                      report=report, search=search or default_search, quote=quote)


def run(coro):
    return asyncio.run(coro)


def test_every_tool_has_a_strict_schema_scope_timeout_and_limits():
    described = {d["name"]: d for d in tools.describe()}
    assert set(described) == {"lookup_packages", "compare_packages", "lookup_branches", "lookup_policies", "retrieve_evidence",
                              "get_confirmed_report_rows", "preview_booking", "get_external_hospital_offer"}
    for d in described.values():
        assert d["input_schema"].get("additionalProperties") is False
        assert d["timeout_seconds"] > 0 and d["max_items"] > 0 and d["max_chars"] > 0 and d["scope"]


@pytest.mark.parametrize("name,args", [
    ("lookup_packages", {"actor": "staff_1"}),
    ("lookup_packages", {"organization_id": "org_other"}),
    ("preview_booking", {"kind": "book", "package_ids": ["P01"], "owner": "customer_x"}),
    ("lookup_packages", {"package_ids": ["P01; DROP TABLE"]}),
    ("retrieve_evidence", {"query": ""}),
])
def test_model_supplied_actor_tenant_or_bad_arguments_are_rejected(isolated, name, args):  # noqa: F811
    c = ctx()
    with pytest.raises(ConversationError) as exc:
        run(tools.invoke(c, name, args))
    assert exc.value.code == "tool_arguments_invalid"
    assert c.audit[-1]["ok"] is False and c.audit[-1]["code"] == "tool_arguments_invalid"


def test_role_scope_is_enforced_by_the_server(isolated):  # noqa: F811
    explainer = ctx("explainer", report=REPORT)
    with pytest.raises(ConversationError) as exc:
        run(tools.invoke(explainer, "lookup_packages", {}))
    assert exc.value.code == "tool_forbidden"
    with pytest.raises(ConversationError):
        run(tools.invoke(explainer, "preview_booking", {"kind": "quote", "package_ids": ["P01"]}))
    rows = run(tools.invoke(explainer, "get_confirmed_report_rows", {}))
    assert rows["report"]["fields"] == REPORT["fields"]


def test_unconfirmed_report_rows_are_never_returned(isolated):  # noqa: F811
    c = ctx("explainer", report={**REPORT, "confirmed": False})
    with pytest.raises(ConversationError) as exc:
        run(tools.invoke(c, "get_confirmed_report_rows", {}))
    assert exc.value.code == "confirmation_required"


def test_unknown_tool_and_timeout(isolated, monkeypatch):  # noqa: F811
    c = ctx()
    with pytest.raises(ConversationError) as exc:
        run(tools.invoke(c, "run_python", {"code": "print(1)"}))
    assert exc.value.code == "tool_unknown"

    async def slow(query, limit):
        await asyncio.sleep(1)
        return [], "lexical"
    monkeypatch.setitem(tools.TOOLS, "retrieve_evidence", tools.TOOLS["retrieve_evidence"].__class__(
        **{**tools.TOOLS["retrieve_evidence"].__dict__, "timeout_seconds": 0.05}))
    with pytest.raises(ConversationError) as exc:
        run(tools.invoke(ctx(search=slow), "retrieve_evidence", {"query": "HbA1c"}))
    assert exc.value.code == "tool_timeout"


def test_output_limits_truncate_or_refuse(isolated, monkeypatch):  # noqa: F811
    small = tools.TOOLS["lookup_packages"].__class__(**{**tools.TOOLS["lookup_packages"].__dict__, "max_items": 3})
    monkeypatch.setitem(tools.TOOLS, "lookup_packages", small)
    c = ctx()
    out = run(tools.invoke(c, "lookup_packages", {}))
    assert len(out["records"]) == 3 and c.audit[-1]["truncated"] is True
    tiny = tools.TOOLS["lookup_policies"].__class__(**{**tools.TOOLS["lookup_policies"].__dict__, "max_chars": 50})
    monkeypatch.setitem(tools.TOOLS, "lookup_policies", tiny)
    with pytest.raises(ConversationError) as exc:
        run(tools.invoke(c, "lookup_policies", {}))
    assert exc.value.code == "tool_output_too_large"


def test_audit_keeps_a_hash_never_the_arguments(isolated):  # noqa: F811
    c = ctx()
    run(tools.invoke(c, "retrieve_evidence", {"query": "HbA1c ของคุณสมชาย 0812345678"}))
    entry = c.audit[-1]
    assert entry["ok"] and len(entry["args_sha256"]) == 16
    assert "0812345678" not in json.dumps(c.audit, ensure_ascii=False)


def test_filters_and_deterministic_comparison(isolated):  # noqa: F811
    c = ctx()
    cheap = run(tools.invoke(c, "lookup_packages", {"max_price_thb": 1500, "segment": "individual"}))
    prices = [json.loads(r["content"])["price_thb"] for r in cheap["records"]]
    assert prices and max(prices) <= 1500
    table = json.loads(run(tools.invoke(c, "compare_packages", {"package_ids": ["P01", "P02"]}))["records"][0]["content"])
    p01, p02 = table["packages"]
    assert p01["price_thb"] == 1190 and p02["price_thb"] == 1690
    assert set(table["shared_services"]) <= set(p01["services"]) & set(p02["services"])
    assert set(p02["only_in_this_package"]).isdisjoint(p01["services"])
    with pytest.raises(ConversationError):
        run(tools.invoke(c, "compare_packages", {"package_ids": ["P01", "P99"]}))


def test_preview_creates_nothing(isolated):  # noqa: F811
    from services import business_store as db
    c = ctx()
    with db.transaction() as tx:
        before = len(tx.find("booking", "anyone"))
    preview = run(tools.invoke(c, "preview_booking", {"kind": "book", "package_ids": ["P02"], "branch_id": "BKK01",
                                                      "date": "2026-10-20", "time": "09:00"}))["preview"]
    assert preview["confirmed"] is False and preview["quote"]["total_thb"] == 1690
    with db.transaction() as tx:
        assert len(tx.find("booking", "anyone")) == before


def test_pipeline_returns_tool_audit_and_keeps_evidence(isolated, monkeypatch):  # noqa: F811
    script(monkeypatch, {"action": "answer", "query": "HbA1c", "dot": "advisor", "package_ids": ["P01", "P02"]},
           reply="Essential Check 1,190 บาท [rs-p01]\n\nHbA1c is explained in the cited source [nlm-x]", evidence_ids=("rs-p01", "nlm-x"))
    out = asyncio.run(business_agent.run("Essential กับ Workday ต่างกันอย่างไร HbA1c", {}))
    names = [a["tool"] for a in out["checks"]["tools"]]
    # Independent lookups run together first; the comparison follows the catalog lookup.
    assert names[0] == "lookup_packages" and names.index("compare_packages") > names.index("lookup_packages")
    assert {"lookup_branches", "lookup_policies", "retrieve_evidence"} <= set(names)
    assert all(a["ok"] for a in out["checks"]["tools"])


def test_invalid_planner_package_ids_fall_back_to_handoff(isolated, monkeypatch):  # noqa: F811
    script(monkeypatch, {"action": "quote", "package_ids": ["P99"], "dot": "advisor"}, reply="Our team will review [rs-policy].",
           evidence_ids=("rs-policy",))
    out = asyncio.run(business_agent.run("ขอใบเสนอราคา", {}))
    assert out["action"]["type"] == "handoff"
    assert any(a["tool"] == "preview_booking" and not a["ok"] for a in out["checks"]["tools"])
