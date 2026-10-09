"""Multipart uploads of reviewed synthetic fixtures through the medical harness (test environment only).

MOCKED_TEST_ONLY: OCR and the model are doubles; this checks the data-policy gate and that raw
extraction stays separate from confirmed values and never reaches the model.
"""
from __future__ import annotations

import asyncio
import hashlib
import json

import pytest

from config import settings
from services import synthetic_fixtures
from services.conversation_transport import ConversationError
from tests.test_business_v3 import isolated  # noqa: F401

PNG = synthetic_fixtures.BUILTIN / "png" / "01_A_Liver.png"


def test_only_exact_fixture_bytes_in_a_test_environment(monkeypatch, tmp_path):
    raw = PNG.read_bytes()
    monkeypatch.setattr(settings, "APP_ENV", "test")
    assert synthetic_fixtures.trusted([raw]) == "builtin:01_A_Liver"
    assert synthetic_fixtures.trusted([raw[:-1] + b"\x00"]) == ""
    assert synthetic_fixtures.trusted([raw, b"not a fixture"]) == ""
    for env in ("production", "development", ""):
        monkeypatch.setattr(settings, "APP_ENV", env)
        assert synthetic_fixtures.trusted([raw]) == ""
    monkeypatch.setattr(settings, "APP_ENV", "test")
    extra = tmp_path / "fixtures.json"
    blob = b"author-generated synthetic report bytes"
    extra.write_text(json.dumps({"fixtures": [{"id": "gen-1", "synthetic": True, "sha256": hashlib.sha256(blob).hexdigest()},
                                              {"id": "real", "synthetic": False, "sha256": "0" * 64}]}))
    monkeypatch.setattr(settings, "SYNTHETIC_FIXTURE_MANIFEST", str(extra))
    synthetic_fixtures._hashes.cache_clear()
    assert synthetic_fixtures.trusted([blob]) == "fixture:gen-1"
    assert synthetic_fixtures.trusted([b"\x00" * 1]) == ""


def _harness(monkeypatch):
    from services import business_agent, model_harness, providers
    from tests.test_business_dots import script
    script(monkeypatch, {"action": "answer", "query": "glucose", "dot": "explainer"}, reply="Glucose [nlm-x]")
    monkeypatch.setattr(settings, "MEDICAL_HARNESS_ENABLED", True)
    configured = providers.RuntimeProvider("t", "typhoon", "double", "openai_chat", "https://example.invalid", "m", "k", 1, True, {}, "app")
    monkeypatch.setattr(providers, "runtime", lambda slot: configured)

    async def analyze(packet, **kw):
        return model_harness.Analysis(observations=packet.observations, claims=[], missing_context=[], clarification_needed=False,
                                      permitted_next_steps=[])
    monkeypatch.setattr(model_harness, "analyze", analyze)
    return business_agent


def test_harness_accepts_a_recognised_fixture_but_not_an_unknown_upload(isolated, monkeypatch):  # noqa: F811
    agent = _harness(monkeypatch)
    from tests.test_business_dots import REPORT
    with pytest.raises(ConversationError) as exc:
        asyncio.run(agent.run("Explain", {"report": {**REPORT}}))
    assert exc.value.code == "data_policy"
    agent = _harness(monkeypatch)  # fresh scripted transport for the second turn
    out = asyncio.run(agent.run("Explain", {"report": {**REPORT}, "synthetic_report": True}))
    assert out["reply"]


def test_raw_rows_are_stored_but_never_sent_to_the_model(isolated, monkeypatch):  # noqa: F811
    from routers import business
    from tests.test_business_v3 import client
    monkeypatch.setattr(settings, "APP_ENV", "test")

    async def read(raw, emit=None):
        from services.lab_fields_v2 import ReportField, normalize
        return {"fields": normalize([ReportField(name="BUN", value="135", unit="mg/dL", reference="5.8 - 19.1")]), "warnings": [], "confirmed": False}
    monkeypatch.setattr(business, "read_report", read)
    seen = {}

    async def run(message, context, emit=None):
        seen.update(context)
        return {"reply": "ok", "sources": [], "action": None, "observations": [], "followups": [], "checks": {}, "trace": []}
    monkeypatch.setattr(business.business_agent, "run", run)
    c = client(register=False)
    r = c.post("/api/business/chat/report", data={"message": "explain"}, files=[("files", ("x.png", PNG.read_bytes(), "image/png"))])
    assert r.status_code == 200, r.text
    card = r.json()["card_id"]
    report = c.get(f"/api/business/reports/{r.json()['report_id']}").json()["data"]
    assert report["raw_fields"][0]["value"] == "135" and report["synthetic_fixture"] == "builtin:01_A_Liver"
    fixed = [{"name": "BUN", "value": "13.5", "unit": "mg/dL", "reference": "5.8 - 19.1", "printed_flag": ""}]
    r = c.post("/api/business/chat/report/confirm", json={"message_id": card, "fields": fixed})
    assert r.status_code == 200, r.text
    assert seen["report"]["fields"][0]["value"] == "13.5"
    assert "raw_fields" not in seen["report"] and "synthetic_fixture" not in seen["report"]
    assert seen["synthetic_report"] is True
