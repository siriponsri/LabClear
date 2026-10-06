"""AI provider settings (manager page), provider-specific request shapes and System One guards."""
from __future__ import annotations

import asyncio
import json
import sqlite3

import httpx
import pytest

from config import settings
from services import business_store as db
from services import conversation_guard as guard
from services import conversation_transport as transport
from services import providers
from services.conversation_transport import ConversationError
from tests.test_business_v3 import client, isolated, promote  # noqa: F401  (fixture + helpers)

KEY = "sk-test-0123456789abcdef"


@pytest.fixture(autouse=True)
def fresh_cache():
    providers.clear_cache()
    yield
    providers.clear_cache()


def manager():
    c = client()
    promote(c)
    return c


def save(c, slot="llm", **body):
    payload = {"preset": "openai", "model": "", "api_key": KEY, "base_url": "", "enabled": True,
               "price_in": None, "price_out": None, **body}
    return c.put(f"/api/business/staff/ai-providers/{slot}", json=payload)


def test_only_managers_can_view_or_change_providers():
    customer = client()
    assert customer.get("/api/business/staff/ai-providers").status_code == 403
    assert save(customer).status_code == 403
    staff_member = client()
    promote(staff_member, "staff")
    assert staff_member.get("/api/business/staff/ai-providers").status_code == 403


def test_saved_key_is_masked_encrypted_and_used_at_runtime(tmp_path):
    c = manager()
    r = save(c, model="gpt-4.1-mini", price_in=12, price_out=48)
    assert r.status_code == 200, r.text
    view = r.json()["slots"]["llm"]
    assert view["source"] == "app" and view["preset"] == "openai" and view["ready"]
    assert KEY not in r.text and view["key"].endswith(KEY[-4:])
    raw = sqlite3.connect(tmp_path / "business.db").execute("SELECT group_concat(payload) FROM rs_entities").fetchone()[0]
    assert KEY not in raw  # stored inside the Fernet-encrypted payload only
    p = providers.runtime("llm")
    assert (p.preset, p.base_url, p.model, p.api_key) == ("openai", "https://api.openai.com/v1", "gpt-4.1-mini", KEY)
    assert p.price == {"input_per_mtok": 12.0, "output_per_mtok": 48.0}
    with db.transaction() as tx:
        actions = [a["data"]["action"] for a in tx.find("audit")]
    assert "ai_provider.saved.llm.openai" in actions and all(KEY not in a for a in actions)


def test_blank_key_keeps_the_saved_key_only_for_the_same_provider():
    c = manager()
    assert save(c).status_code == 200
    assert save(c, api_key="", model="gpt-4.1").status_code == 200
    assert providers.runtime("llm").api_key == KEY and providers.runtime("llm").model == "gpt-4.1"
    r = save(c, preset="deepseek", api_key="")
    assert r.status_code == 422 and "API key" in r.json()["message"]


def test_reset_falls_back_to_environment(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "typhoon")
    monkeypatch.setattr(settings, "LLM_API_KEY", "env-key-123456")
    c = manager()
    save(c)
    assert providers.runtime("llm").preset == "openai"
    assert c.delete("/api/business/staff/ai-providers/llm").status_code == 200
    p = providers.runtime("llm")
    assert (p.source, p.preset, p.api_key, p.model) == ("environment", "typhoon", "env-key-123456", "typhoon-v2.5-30b-a3b-instruct")


def test_provider_must_fit_the_slot_and_custom_urls_are_checked():
    c = manager()
    assert save(c, slot="guard", preset="openai").status_code == 422
    assert save(c, slot="guard", preset="iapp_systemone").status_code == 200
    bad = ["http://api.example.com/v1", "https://10.0.0.5/v1", "https://user:pw@api.example.com/v1"]
    for url in bad:
        assert save(c, preset="custom", model="m", base_url=url).status_code == 422, url
    assert save(c, preset="custom", model="local-model", base_url="http://localhost:1337/v1").status_code == 200
    assert providers.runtime("llm").base_url == "http://localhost:1337/v1"


def test_every_requested_provider_has_a_preset():
    for preset in ["openai", "anthropic", "gemini", "huggingface", "openrouter", "xai", "moonshot", "qwen",
                   "deepseek", "typhoon", "iapp_systemone", "typesafe_jev", "llama_guard", "custom"]:
        assert preset in providers.PRESETS
    assert all(p.base_url.startswith("https://") for p in providers.PRESETS.values() if p.id != "custom")


def test_quoted_price_table_is_accepted(monkeypatch):
    table = {"gpt-4.1-mini": {"input_per_mtok": 1, "output_per_mtok": 2}}
    monkeypatch.setattr(settings, "MODEL_PRICES_THB", "'" + json.dumps(table) + "'")
    from services import cost_ledger
    assert cost_ledger.prices() == {"gpt-4.1-mini": {"input_per_mtok": 1.0, "output_per_mtok": 2.0}}
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "LLM_MODEL", "gpt-4.1-mini")
    assert providers.runtime("llm").price == {"input_per_mtok": 1.0, "output_per_mtok": 2.0}
    monkeypatch.setattr(settings, "MODEL_PRICES_THB", "{not json")
    assert providers.runtime("llm").price == {"input_per_mtok": 15, "output_per_mtok": 60}  # preset default


# ------------------------------------------------------------ request shapes (no network)

def capture(monkeypatch, reply: dict):
    calls = []

    async def fake_post(url, headers, body, slot, timeout, price=None, model="", label=""):
        calls.append({"url": url, "headers": headers, "body": body, "slot": slot})
        return reply

    monkeypatch.setattr(transport, "post_json", fake_post)
    return calls


def configure(monkeypatch, slot, preset, model=""):
    prefix = {"llm": "LLM", "guard": "GUARD", "vision": "VISION"}[slot]
    monkeypatch.setattr(settings, f"{prefix}_PROVIDER", preset)
    monkeypatch.setattr(settings, f"{prefix}_API_KEY", "key-abcdef")
    monkeypatch.setattr(settings, f"{prefix}_MODEL", model)


def test_openai_uses_max_completion_tokens_and_others_max_tokens(monkeypatch):
    calls = capture(monkeypatch, {"choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}]})
    configure(monkeypatch, "llm", "openai")
    assert asyncio.run(transport.complete([{"role": "user", "content": "hi"}], max_tokens=20)) == "OK"
    assert "max_completion_tokens" in calls[-1]["body"] and "max_tokens" not in calls[-1]["body"]
    for preset in ["gemini", "xai", "moonshot", "qwen", "deepseek", "huggingface", "openrouter", "typhoon"]:
        configure(monkeypatch, "llm", preset)
        asyncio.run(transport.complete([{"role": "user", "content": "hi"}], max_tokens=20))
        sent = calls[-1]
        assert sent["body"]["max_tokens"] == 20 and sent["url"] == providers.PRESETS[preset].base_url + "/chat/completions"
        assert sent["headers"]["Authorization"] == "Bearer key-abcdef"


def test_claude_uses_the_messages_api(monkeypatch):
    calls = capture(monkeypatch, {"content": [{"type": "text", "text": "OK"}], "stop_reason": "end_turn"})
    configure(monkeypatch, "llm", "anthropic")
    out = asyncio.run(transport.complete([{"role": "system", "content": "rules"}, {"role": "user", "content": "hi"}]))
    sent = calls[-1]
    assert out == "OK" and sent["url"] == "https://api.anthropic.com/v1/messages"
    assert sent["headers"]["x-api-key"] == "key-abcdef" and sent["body"]["system"] == "rules"
    assert sent["body"]["messages"] == [{"role": "user", "content": "hi"}]


@pytest.mark.parametrize("preset,url,auth", [
    ("iapp_systemone", "https://api.iapp.co.th/v3/store/openthai/systemone", ("apikey", "key-abcdef")),
    ("typesafe_jev", "https://api.typesafe.ai/v1/systemone", ("Authorization", "Bearer key-abcdef")),
])
def test_system_one_guards(monkeypatch, preset, url, auth):
    configure(monkeypatch, "guard", preset)
    calls = capture(monkeypatch, {"answers": {"safety": {"type": "choice", "choice": "safe", "confidence": 0.9}}})
    asyncio.run(guard.check("HbA1c คืออะไร", "input"))
    sent = calls[-1]
    assert sent["url"] == url and sent["headers"][auth[0]] == auth[1]
    q = sent["body"]["questions"]["safety"]
    assert q["type"] == "choice" and set(q["criteria"]) == set(guard.CRITERIA)
    assert ("model" in sent["body"]) == (preset == "typesafe_jev")
    capture(monkeypatch, {"answers": {"safety": {"type": "choice", "choice": "medical_advice"}}})
    with pytest.raises(ConversationError) as blocked:
        asyncio.run(guard.check("ควรกินยาอะไร", "input"))
    assert blocked.value.code == "safety_blocked"
    capture(monkeypatch, {"answers": {"safety": {"type": "choice", "choice": "maybe"}}})
    with pytest.raises(ConversationError) as invalid:
        asyncio.run(guard.check("hello", "output", "hi"))
    assert invalid.value.code == "guard_invalid"


def test_guard_without_a_key_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "GUARD_PROVIDER", "iapp_systemone")
    monkeypatch.setattr(settings, "GUARD_API_KEY", "")
    with pytest.raises(ConversationError) as missing:
        asyncio.run(guard.check("hello", "input"))
    assert missing.value.code == "provider_not_configured"


def test_system_one_call_goes_through_the_cap_and_ledger(monkeypatch):
    """The real post_json path: call cap and THB ledger both run before the HTTP request."""
    monkeypatch.setattr(settings, "PROVIDER_NETWORK_ENABLED", True)
    monkeypatch.setattr(settings, "PROVIDER_BUDGET_CYCLE_ID", "test-cycle")
    monkeypatch.setattr(settings, "CLOUD_CALL_LIMIT", 5)
    configure(monkeypatch, "guard", "iapp_systemone")
    seen = {}

    def handler(request: httpx.Request):
        seen["headers"] = dict(request.headers)
        return httpx.Response(200, json={"model": "openthai-systemone",
                                          "answers": {"safety": {"type": "choice", "choice": "safe"}},
                                          "usage": {"input_tokens": 120, "output_tokens": 0}})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(transport.httpx, "AsyncClient",
                        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    asyncio.run(guard.check("What does LDL mean?", "input"))
    assert seen["headers"]["apikey"] == "key-abcdef"
    status = transport.durable_call_status()
    assert status["used"] == 1 and status["by_slot"] == {"guard": 1}
