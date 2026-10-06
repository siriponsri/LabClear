"""THB project-total cost ledger: atomic reservation, settlement, fail-closed config."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from cryptography.fernet import Fernet

from config import settings
from services import conversation_transport as transport, cost_ledger
from services.conversation_transport import ConversationError

pytestmark = pytest.mark.cost_ledger
PRICES = json.dumps({"priced-model": {"input_per_mtok": 30.0, "output_per_mtok": 60.0}})


@pytest.fixture(autouse=True)
def ledger_env(tmp_path, monkeypatch):
    for name in ["DATABASE_URL", "RENDER", "APP_ENV"]:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("BUSINESS_DB_PATH", str(tmp_path / "ledger.db"))
    monkeypatch.setenv("BUSINESS_DATA_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "COST_LEDGER_ENABLED", True)
    monkeypatch.setattr(settings, "MODEL_PRICES_THB", PRICES)
    monkeypatch.setattr(settings, "PROJECT_BUDGET_PRIOR_SPEND_THB", "0")
    monkeypatch.setattr(settings, "PROJECT_BUDGET_THB", 300.0)


def body(max_tokens=1000):
    return {"model": "priced-model", "messages": [{"role": "user", "content": "x" * 3000}], "max_tokens": max_tokens}


def test_estimate_and_settlement_with_usage():
    est = cost_ledger.estimate("priced-model", body())
    assert est == pytest.approx((1000 * 30 + 1000 * 60) / 1e6, rel=0.05)
    r = cost_ledger.reserve("priced-model", body())
    assert cost_ledger.status()["reserved_thb"] == pytest.approx(r.estimate_thb, abs=1e-4)
    cost_ledger.settle(r, {"prompt_tokens": 100, "completion_tokens": 10}, "succeeded")
    s = cost_ledger.status()
    assert s["reserved_thb"] == 0 and s["settled_thb"] == pytest.approx((100 * 30 + 10 * 60) / 1e6, abs=1e-6)
    assert s["scope"] == "project_total" and s["cap_thb"] == 300.0 and s["calls"] == 1


def test_failed_call_keeps_conservative_charge():
    r = cost_ledger.reserve("priced-model", body())
    cost_ledger.settle(r, None, "failed")
    assert cost_ledger.status()["settled_thb"] == pytest.approx(r.estimate_thb, abs=1e-4)


def test_fail_closed_on_unknown_model_or_prior_spend(monkeypatch):
    with pytest.raises(ConversationError) as e:
        cost_ledger.reserve("unpriced-model", {"model": "unpriced-model", "max_tokens": 10})
    assert e.value.code == "price_unknown"
    monkeypatch.setattr(settings, "PROJECT_BUDGET_PRIOR_SPEND_THB", "")
    with pytest.raises(ConversationError) as e:
        cost_ledger.reserve("priced-model", body())
    assert e.value.code == "budget_prior_unknown"


def test_cap_counts_prior_spend_and_blocks_before_request(monkeypatch):
    monkeypatch.setattr(settings, "PROJECT_BUDGET_PRIOR_SPEND_THB", "299.95")
    cost_ledger.reserve("priced-model", body(10))  # tiny call fits
    with pytest.raises(ConversationError) as e:
        cost_ledger.reserve("priced-model", body(1_000_000))
    assert e.value.code == "budget_exhausted" and e.value.status == 429


def test_ledger_survives_restart():
    r = cost_ledger.reserve("priced-model", body())
    cost_ledger.settle(r, {"prompt_tokens": 1000, "completion_tokens": 1000}, "succeeded")
    first = cost_ledger.status()["settled_thb"]
    import importlib
    importlib.reload(cost_ledger)
    assert cost_ledger.status()["settled_thb"] == first


def test_transport_blocks_without_network_call_when_budget_exceeded(monkeypatch):
    monkeypatch.setattr(settings, "PROVIDER_NETWORK_ENABLED", True)
    monkeypatch.setattr(settings, "PROJECT_BUDGET_PRIOR_SPEND_THB", "300")
    async def no_budget(slot):
        return None
    monkeypatch.setattr(transport, "reserve", no_budget)
    called = []

    class Boom(httpx.AsyncClient):
        def __init__(self, *a, **k):
            called.append(1)
            super().__init__(*a, **k)
    monkeypatch.setattr(transport.httpx, "AsyncClient", Boom)
    with pytest.raises(ConversationError) as e:
        asyncio.run(transport.post_json("https://example.invalid/v1/chat/completions", {}, body(), "llm", 5))
    assert e.value.code == "budget_exhausted" and not called
