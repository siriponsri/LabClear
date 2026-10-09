"""Integration 4.0 rc3: what the chat shows about how an answer was made, and official hospital links.

Synthetic, offline data only (scripted model, no provider is called).

- "Typed tools used" and "Runtime skills selected" steps name the harness parts the server ran.
- With HOSPITAL_LINKS_ENABLED, a package question gets up to three official hospital pages whose
  price is current (VERIFIED). Python attaches them after every check: they never reach the model,
  so they cannot be quoted as LabClear prices, a booking or a partnership.
"""
from __future__ import annotations

import asyncio
import json

from config import settings
from services import business_agent, hospital_links
from tests.test_business_dots import script


def run(message, **context):
    events = []

    async def emit(e):
        events.append(e)
    out = asyncio.run(business_agent.run(message, context, emit=emit))
    return out, [e["id"] for e in events if e["state"] == "done"]


def test_package_question_links_current_official_hospital_pages(monkeypatch):
    monkeypatch.setattr(settings, "HOSPITAL_LINKS_ENABLED", True)
    calls = script(monkeypatch, {"action": "answer", "query": "annual health check", "dot": "advisor"})
    out, done = run("แนะนำแพ็กเกจตรวจสุขภาพประจำปีหน่อย")
    verified = [o for o in hospital_links.catalog() if o["state"] == "VERIFIED" and o["price_thb"] is not None]
    assert verified, "the recorded catalog has current offers"
    offers = out["external_offers"]
    assert 1 <= len(offers) <= 3
    assert [o["id"] for o in offers] == [o["id"] for o in verified[:3]]
    for o in offers:
        assert o["url"].startswith("https://") and o["price_thb"] and o["checked_at"]
        assert set(o) == {"id", "hospital", "branch", "variant", "url", "detail_url", "price_thb", "checked_at"}
    assert "offers" in done and done.index("offers") > done.index("safety_out")
    # The links never reach the model: no hospital URL in any prompt.
    prompts = json.dumps(calls, ensure_ascii=False)
    assert not any(o["url"] in prompts for o in offers)


def test_no_hospital_links_when_the_flag_is_off_or_the_question_is_not_about_packages(monkeypatch):
    script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "advisor"})
    out, done = run("แนะนำแพ็กเกจตรวจสุขภาพหน่อย")
    assert out["external_offers"] == [] and "offers" not in done
    monkeypatch.setattr(settings, "HOSPITAL_LINKS_ENABLED", True)
    script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "advisor"})
    out, done = run("What is glucose?")
    assert out["external_offers"] == [] and "offers" not in done


def test_report_explainer_never_gets_hospital_links(monkeypatch):
    monkeypatch.setattr(settings, "HOSPITAL_LINKS_ENABLED", True)
    script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "explainer"})
    out, _ = run("ตรวจสุขภาพแล้วน้ำตาลสูงหมายถึงอะไร")
    assert out["external_offers"] == []


def test_typed_tools_and_runtime_skills_are_named_in_the_trace(monkeypatch):
    monkeypatch.setattr(settings, "RUNTIME_SKILLS_ENABLED", True)
    calls = []

    async def complete(messages, **kw):
        calls.append(messages)
        if len(calls) == 1:
            return json.dumps({"action": "answer", "query": "glucose", "dot": "advisor"})
        if messages[0]["content"].startswith(business_agent.ANSWER):
            return json.dumps({"reply": "Here is what that means [nlm-x].", "evidence_ids": ["nlm-x"], "observations": [], "followups": []})
        return json.dumps({"supported": True, "values_preserved": True, "within_scope": True})

    script(monkeypatch, {})
    monkeypatch.setattr(business_agent.transport, "complete", complete)
    out, done = run("What is glucose?")
    assert done.index("tools") < done.index("skills") < done.index("draft")
    tools = next(t for t in out["trace"] if t["id"] == "tools")["detail"].split(", ")
    assert "lookup_packages" in tools and "retrieve_evidence" in tools
    skills = out["checks"]["skills"]
    assert skills["modules"] and skills["package"] and len(skills["sha256"]) == 16
    assert next(t for t in out["trace"] if t["id"] == "skills")["detail"] == ", ".join(skills["modules"])
    # The writer received the reviewed skill instructions after the base rules.
    writer = next(m for m in calls if m[0]["content"].startswith(business_agent.ANSWER))
    assert len(writer[0]["content"]) > len(business_agent.ANSWER)
    assert all(a["ok"] for a in out["checks"]["tools"] if a["tool"] in tools)
