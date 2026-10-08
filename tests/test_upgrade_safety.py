import logging
import math
import asyncio
from concurrent.futures import ThreadPoolExecutor

import pytest

from config import settings
from services import cost_ledger as ledger, conversation_transport as transport
from services.conversation_transport import ConversationError
from tests.test_ai_providers import manager, save, fresh_cache  # noqa: F401
from tests.test_business_v3 import isolated  # noqa: F401


def test_admin_configuration_is_not_live_validation(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail('Opening or saving configuration must never call a provider')
    monkeypatch.setattr(transport, 'complete', forbidden)
    c = manager()
    assert c.get('/api/business/staff/ai-providers').json()['slots']['llm']['config_status'] == 'NOT_CONFIGURED'
    data = save(c).json()['slots']['llm']
    assert data['config_status'] == 'SCHEMA_CHECK_ONLY'
    assert data['live_test_status'] == 'NOT_RUN'
    data = save(c, enabled=False).json()['slots']['llm']
    assert data['config_status'] == 'DISABLED'
    result = c.post('/api/business/staff/ai-providers/vision/test').json()
    assert not result['ok'] and result['status'] == 'NOT_RUN'


def test_provider_error_never_logs_echoed_guest_content(caplog):
    with caplog.at_level(logging.WARNING):
        transport.rejection_error('llm', 400, 'private guest report and secret key=abc')
    assert 'private guest' not in caplog.text and 'key=abc' not in caplog.text
    assert 'status=400' in caplog.text


@pytest.mark.cost_ledger
def test_completion_token_reservation_and_idempotent_settlement(monkeypatch):
    monkeypatch.setattr(settings, 'PROJECT_BUDGET_PRIOR_SPEND_THB', '0')
    price = {'input_per_mtok': 1, 'output_per_mtok': 100}
    body = {'messages': [{'content': 'ผลตรวจเลือด'}], 'max_completion_tokens': 4000}
    reservation = ledger.reserve('synthetic', body, price)
    assert reservation.estimate_thb >= .4
    ledger.settle(reservation, None, 'cancelled')
    before = ledger.status()['settled_thb']
    ledger.settle(reservation, {'prompt_tokens': 1, 'completion_tokens': 1}, 'succeeded')
    assert ledger.status()['settled_thb'] == before


@pytest.mark.parametrize('value', ['nan', 'inf', '-1'])
def test_nonfinite_prior_spend_is_rejected(monkeypatch, value):
    monkeypatch.setattr(settings, 'PROJECT_BUDGET_PRIOR_SPEND_THB', value)
    with pytest.raises(ConversationError):
        ledger.prior_spend()


def test_thai_reservation_covers_utf8_bytes():
    assert ledger._count_tokens({'messages': [{'content': 'ก' * 100}]}) >= 300


@pytest.mark.cost_ledger
def test_concurrent_reservations_share_one_cap(monkeypatch):
    monkeypatch.setattr(settings, 'PROJECT_BUDGET_PRIOR_SPEND_THB', '0')
    monkeypatch.setattr(settings, 'PROJECT_BUDGET_THB', .1)
    def reserve(_):
        try:
            return ledger.reserve('synthetic', {'max_tokens': 1000}, {'input_per_mtok': 0, 'output_per_mtok': 30})
        except ConversationError as exc:
            assert exc.code == 'budget_exhausted'
            return None
    with ThreadPoolExecutor(max_workers=8) as pool:
        reservations = list(pool.map(reserve, range(12)))
    assert len([r for r in reservations if r]) == 3
    assert ledger.status()['reserved_thb'] == pytest.approx(.09)


def test_new_roles_require_explicit_model_prices_and_endpoint_policy(monkeypatch):
    from services import providers
    from tests.test_ai_providers import capture
    c = manager()
    slot = 'agent_medical_analyzer'
    assert not providers.runtime(slot).ready
    assert save(c, slot=slot, preset='openrouter', model='deepseek/deepseek-v4.1-flash').status_code == 422
    assert save(c, slot=slot, preset='openrouter', model='deepseek/deepseek-v4.1-flash', price_in=1, price_out=2).status_code == 422
    r = save(c, slot=slot, preset='openrouter', model='deepseek/deepseek-v4.1-flash', price_in=1, price_out=2, provider_allowlist=['synthetic-endpoint'])
    assert r.status_code == 200
    calls = capture(monkeypatch, {'choices': [{'message': {'content': '{}'}, 'finish_reason': 'stop'}]})
    asyncio.run(transport.complete([{'role': 'user', 'content': 'Synthetic'}], slot=slot))
    assert calls[0]['body']['provider'] == {'only': ['synthetic-endpoint'], 'allow_fallbacks': False, 'data_collection': 'deny', 'zdr': True}
    assert c.delete('/api/business/staff/ai-providers/' + slot).status_code == 200
    assert not providers.runtime(slot).ready


def test_missing_legacy_and_new_configuration_matrix(monkeypatch):
    from config import Settings
    from services import providers, business_store as db
    from fastapi.testclient import TestClient
    from main import app
    defaults = Settings(_env_file=None)
    for name in ['LANDING_PREVIEW_ENABLED', 'ORG_DOCUMENTS_ENABLED', 'HOSPITAL_LINKS_ENABLED', 'RUNTIME_SKILLS_ENABLED', 'MEDICAL_HARNESS_ENABLED', 'ORG_REFERENCE_INFERENCE_ENABLED']:
        assert getattr(defaults, name) is False
    c = manager()
    assert c.get('/health').status_code == 200
    for route in ['/preview/landing', '/hospital-links', '/organization-references']:
        assert c.get(route).status_code == 404
    monkeypatch.setattr(settings, 'LLM_API_KEY', 'synthetic-env-key')
    monkeypatch.setattr(settings, 'LLM_MODEL', 'legacy-synthetic-model')
    assert providers.runtime('llm').model == 'legacy-synthetic-model'
    assert save(c, model='saved-model').status_code == 200
    with db.transaction() as tx:
        tx.put('cost_ledger_project', 'cost_ledger', 'system', {'settled_thb': 123, 'reserved_thb': 4, 'calls': 9}, 'active')
    monkeypatch.setattr(settings, 'LLM_MODEL', 'new-env-must-not-win')
    for _ in range(2):
        providers.clear_cache()
        assert c.get('/api/business/staff/ai-providers').json()['slots']['llm']['model'] == 'saved-model'
        assert providers.runtime('agent_advisor').model == 'saved-model'
        assert not providers.runtime('agent_medical_analyzer').ready
    with db.transaction() as tx:
        assert tx.get('cost_ledger_project')['data'] == {'settled_thb': 123, 'reserved_thb': 4, 'calls': 9}
