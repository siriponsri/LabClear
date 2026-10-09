"""Free-first harness: free-only transport policy, shared quota, ledger, preflight and mode separation.

MOCKED_TEST_ONLY: provider calls are intercepted at the httpx client; no provider is contacted.
"""
from __future__ import annotations

import asyncio
import json
import os
import socket
from datetime import date
from pathlib import Path

import httpx
import pytest

from config import settings
from services import conversation_transport as transport, cost_ledger, free_policy, providers
from services.conversation_transport import ConversationError
from tests.test_business_v3 import isolated  # noqa: F401

ROOT = Path(__file__).resolve().parents[1]
TEXT = ("api.opentyphoon.ai", "/v1/chat/completions", "typhoon-v2.5-30b-a3b-instruct")


def policy(tmp_path, *, status="VERIFIED_FREE_FOR_THIS_ACCOUNT", verified=None, mode="LIVE_FREE", text_calls=400,
           guard_decisions=300, rate=30, daily=1000, price=0.0) -> str:
    verified = verified if verified is not None else date.today().isoformat()
    data = {"policy_id": "test-free", "policy_version": "1", "mode": mode, "reviewed_by": "owner", "reviewed_at": verified,
            "account_label": "team-trial", "data_policy_reviewed": True,
            "endpoints": [
                {"family": "text", "protocol": "openai_chat", "host": TEXT[0], "path": TEXT[1], "model": TEXT[2], "price_status": status,
                 "price_in_thb_per_mtok": price, "price_out_thb_per_mtok": price, "verified_at": verified, "evidence": "console screenshot reviewed",
                 "app_rate_per_minute": rate},
                {"family": "ocr", "protocol": "typhoon_ocr", "host": TEXT[0], "path": TEXT[1], "model": "typhoon-ocr", "price_status": status,
                 "price_in_thb_per_mtok": 0, "price_out_thb_per_mtok": 0, "verified_at": verified, "evidence": "reviewed", "app_rate_per_minute": 5},
                {"family": "guard", "protocol": "systemone_iapp", "host": "api.iapp.co.th", "path": "/v3/store/openthai/systemone",
                 "model": "openthai-systemone", "price_status": status, "price_in_thb_per_mtok": 0, "price_out_thb_per_mtok": 0,
                 "verified_at": verified, "evidence": "reviewed", "app_rate_per_minute": 20, "daily_decisions": daily}],
            "run_limits": {"max_minutes": 60, "text_calls": text_calls, "ocr_calls": 20, "guard_decisions": guard_decisions,
                           "retries_per_logical_call": 2, "concurrency": 1}}
    path = tmp_path / f"policy-{status}-{text_calls}-{rate}-{price}-{mode}.json"
    path.write_text(json.dumps(data))
    return str(path)


class Network:
    """Counts what would have left the process."""

    def __init__(self, monkeypatch):
        self.requests = []
        real = httpx.AsyncClient
        outer = self

        def handler(request):
            outer.requests.append((request.url.host, request.url.path, json.loads(request.content).get("model")))
            if "systemone" in request.url.path:
                return httpx.Response(200, json={"answers": {"safety": {"choice": "safe"}}})
            return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                                             "usage": {"prompt_tokens": 11, "completion_tokens": 3}})

        class Client(real):
            def __init__(self, *a, **k):
                k["transport"] = httpx.MockTransport(handler)
                super().__init__(*a, **k)

        monkeypatch.setattr(transport.httpx, "AsyncClient", Client)


@pytest.fixture
def live(monkeypatch, isolated):  # noqa: F811
    monkeypatch.setattr(settings, "PROVIDER_NETWORK_ENABLED", True)
    monkeypatch.setattr(settings, "PROVIDER_BUDGET_CYCLE_ID", "test-cycle")
    monkeypatch.setattr(settings, "CLOUD_CALL_LIMIT", 100)
    monkeypatch.setattr(settings, "PROJECT_BUDGET_PRIOR_SPEND_THB", "0")
    monkeypatch.setattr(settings, "COST_LEDGER_ENABLED", True)
    monkeypatch.setattr(settings, "FREE_ONLY_RUN_ID", "test-run")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "typhoon")
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key-typhoon")
    monkeypatch.setattr(settings, "LLM_MODEL", TEXT[2])
    monkeypatch.setattr(settings, "GUARD_API_KEY", "test-key-iapp")
    providers.clear_cache()
    return Network(monkeypatch)


def test_policy_off_by_default_keeps_codex_behaviour():
    assert settings.FREE_ONLY_POLICY_PATH == ""
    assert free_policy.status() == {"active": False}


def test_verified_free_call_is_admitted_counted_and_ledgered(live, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path))
    out = asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm"))
    assert out == "ok" and live.requests == [TEXT]
    usage = free_policy.status()["usage"]
    assert usage["text_calls"] == 1 and usage["input_tokens"] == 11 and usage["output_tokens"] == 3
    ledger = cost_ledger.status()
    assert ledger["calls"] == 1 and ledger["settled_thb"] == 0  # ledger still records the call; price 0 only by verified policy
    assert transport.durable_call_status()["used"] == 1


@pytest.mark.parametrize("status,verified,price,code", [
    ("FREE_STATUS_UNVERIFIED", None, 0.0, "free_policy_unverified"),
    ("VERIFIED_FREE_FOR_THIS_ACCOUNT", "2026-01-01", 0.0, "free_policy_unverified"),
    ("VERIFIED_FREE_FOR_THIS_ACCOUNT", None, 5.0, "free_policy_unverified"),
    ("OFFLINE_DOUBLE", None, 0.0, "free_policy_unverified"),
])
def test_unverified_stale_priced_or_double_entries_never_reach_the_network(live, tmp_path, monkeypatch, status, verified, price, code):
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path, status=status, verified=verified, price=price))
    with pytest.raises(ConversationError) as exc:
        asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm"))
    assert exc.value.code == code
    assert live.requests == [] and cost_ledger.status()["calls"] == 0 and transport.durable_call_status()["used"] == 0


def test_saved_paid_admin_slot_is_blocked_before_network(live, tmp_path, monkeypatch):
    """LLM_PROVIDER=typhoon alone does not decide every role: a saved Admin slot wins (R01)."""
    from services import business_store as db
    with db.transaction() as tx:
        providers.save(tx, "agent_review", "openrouter", "openai/gpt-4.1-mini", "paid-key-1234", "", True, 15.0, 60.0)
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path))
    with pytest.raises(ConversationError) as exc:
        asyncio.run(transport.complete([{"role": "user", "content": "review"}], slot="agent_review"))
    assert exc.value.code == "free_policy_blocked"
    assert live.requests == []
    # Without the policy the same configuration would have called the paid endpoint.
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", "")
    asyncio.run(transport.complete([{"role": "user", "content": "review"}], slot="agent_review"))
    assert live.requests == [("openrouter.ai", "/api/v1/chat/completions", "openai/gpt-4.1-mini")]


def test_offline_double_entries_only_inside_the_offline_benchmark(live, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path, status="OFFLINE_DOUBLE", mode="OFFLINE_DOUBLES_ONLY"))
    with pytest.raises(ConversationError):
        asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm"))
    monkeypatch.setattr(settings, "FREE_ONLY_ALLOW_OFFLINE_DOUBLES", True)
    assert asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm")) == "ok"


def test_run_cap_blocks_without_calling_and_resume_keeps_counts(live, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path, text_calls=2))
    for _ in range(2):
        asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm"))
    with pytest.raises(ConversationError) as exc:
        asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm"))
    assert exc.value.code == "free_quota_exhausted" and exc.value.status == 429
    assert len(live.requests) == 2
    free_policy._cache.clear()  # a restarted process reads the same durable counts
    with pytest.raises(ConversationError):
        asyncio.run(transport.complete([{"role": "user", "content": "hi"}], slot="llm"))
    assert free_policy.status()["usage"]["blocked"] == 2


def test_minute_window_waits_instead_of_firing(live, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path, rate=1))
    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)
        # Age the recorded window so the next attempt fits.
        from services import business_store as db
        with db.transaction() as tx:
            key = free_policy._key("test-run")
            row = tx.get(key)
            row["data"]["window"]["text"] = [t - 61 for t in row["data"]["window"]["text"]]
            tx.put(key, "free_quota", "system", row["data"], "open")

    monkeypatch.setattr(free_policy.asyncio, "sleep", fake_sleep)
    asyncio.run(transport.complete([{"role": "user", "content": "a"}], slot="llm"))
    asyncio.run(transport.complete([{"role": "user", "content": "b"}], slot="llm"))
    assert len(waits) == 1 and 0 < waits[0] <= 61 and len(live.requests) == 2


def test_guard_decisions_are_counted_conservatively(live, tmp_path, monkeypatch):
    from services import conversation_guard as guard
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path, guard_decisions=12))
    asyncio.run(guard.check("ราคาแพ็กเกจเท่าไหร่", "input"))
    assert free_policy.status()["usage"]["guard_decisions"] == len(guard.CRITERIA) == 5
    asyncio.run(guard.check("คำตอบ", "output", "คำถาม"))
    with pytest.raises(ConversationError) as exc:  # 10 used + 5 more > 12
        asyncio.run(guard.check("อีกข้อความ", "input"))
    assert exc.value.code == "free_quota_exhausted"
    assert free_policy.decisions({"questions": {"a": {"criteria": {"x": 1, "y": 2}}, "b": {"type": "boolean"}}}) == 3


def test_redirects_and_non_https_are_never_followed(live, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "FREE_ONLY_POLICY_PATH", policy(tmp_path))
    with pytest.raises(ConversationError) as exc:
        asyncio.run(transport.post_json("http://api.opentyphoon.ai/v1/chat/completions", {}, {"model": TEXT[2]}, "llm", 5,
                                        {"input_per_mtok": 0, "output_per_mtok": 0}, TEXT[2]))
    assert exc.value.code in {"endpoint_invalid", "free_policy_blocked"} and live.requests == []


def test_preflight_blocks_without_verification_or_credentials_and_makes_no_calls(tmp_path):
    example = ROOT / "eval/policies/free_only.example.json"
    report = free_policy.preflight(str(example), profile="A", cases=[{"kind": "question", "turns": ["x"]}], env={},
                                   candidate={"candidate_sha": "x", "working_tree_dirty": False})
    assert report["status"] == "BLOCKED" and report["inference_calls_made"] == 0
    joined = " ".join(report["blockers"])
    for needed in ("FREE_STATUS_UNVERIFIED", "NO_CREDENTIALS", "POLICY_NOT_REVIEWED", "DATA_POLICY_NOT_REVIEWED"):
        assert needed in joined


def test_preflight_passes_only_with_every_condition(tmp_path):
    good = policy(tmp_path)
    env = {"LABCLEAR_TRIAL_TYPHOON_API_KEY": "k1", "LABCLEAR_TRIAL_IAPP_API_KEY": "k2"}
    cases = [{"kind": "question", "turns": ["a"]}]
    slots = {"llm": {"will_be_called": True, "host": TEXT[0], "path": TEXT[1], "model": TEXT[2], "source": "environment"}}
    ok = free_policy.preflight(good, profile="A", cases=cases, env=env, candidate={"working_tree_dirty": False}, effective_slots=slots)
    assert ok["status"] == "PASS", ok["blockers"]
    dirty = free_policy.preflight(good, profile="A", cases=cases, env=env, candidate={"working_tree_dirty": True}, effective_slots=slots)
    assert any("WORKING_TREE_DIRTY" in b for b in dirty["blockers"])
    bad_slot = {**slots, "agent_review": {"will_be_called": True, "host": "openrouter.ai", "path": "/api/v1/chat/completions",
                                          "model": "openai/gpt-4.1-mini", "source": "app"}}
    out = free_policy.preflight(good, profile="A", cases=cases, env=env, candidate={"working_tree_dirty": False}, effective_slots=bad_slot)
    assert any("EFFECTIVE_SLOT_OUTSIDE_POLICY: agent_review" in b for b in out["blockers"])
    offline = free_policy.preflight(str(ROOT / "eval/policies/free_only.offline.json"), profile="A", cases=cases, env=env,
                                    candidate={"working_tree_dirty": False})
    assert any("POLICY_NOT_LIVE" in b for b in offline["blockers"])
    big = free_policy.preflight(policy(tmp_path, text_calls=3), profile="C", cases=cases * 10, env=env, candidate={"working_tree_dirty": False})
    assert any("QUOTA_PLAN_EXCEEDS_CAP" in b for b in big["blockers"])


def test_offline_runner_denies_outbound_network():
    if socket.create_connection.__name__ != "denied":
        pytest.skip("only meaningful under scripts/offline_check.py")
    with pytest.raises(RuntimeError, match="OFFLINE_CHECK"):
        socket.create_connection(("example.com", 443))


def test_offline_policy_file_claims_no_real_verification():
    data = json.loads((ROOT / "eval/policies/free_only.offline.json").read_text())
    assert data["mode"] == "OFFLINE_DOUBLES_ONLY"
    assert {e["price_status"] for e in data["endpoints"]} == {"OFFLINE_DOUBLE"}
    example = json.loads((ROOT / "eval/policies/free_only.example.json").read_text())
    assert {e["price_status"] for e in example["endpoints"]} == {"FREE_STATUS_UNVERIFIED"}
