from types import SimpleNamespace
import json
import pytest
from scripts import expanded_free_estimate as mode
from services.conversation_transport import ConversationError

def test_unverified_route_does_not_enable_mode(monkeypatch):
    def blocked(*args):
        raise ConversationError('free_policy_unverified','not reviewed',409)
    monkeypatch.setattr(mode.free_policy,'match',blocked)
    with pytest.raises(ConversationError): mode.validate_route('https://example.invalid','model')
    assert mode.verified_call.get() is False

def test_public_price_alone_does_not_verify_account(monkeypatch):
    policy=SimpleNamespace(reviewed_by='',reviewed_at='',account_label='',data_policy_reviewed=False)
    monkeypatch.setattr(mode.free_policy,'match',lambda *args:(policy,object()))
    with pytest.raises(ConversationError): mode.validate_route('https://example.invalid','model')

def test_reviewed_exact_route_is_accepted(monkeypatch):
    policy=SimpleNamespace(reviewed_by='owner',reviewed_at='2026-10-12',account_label='synthetic',data_policy_reviewed=True)
    entry=object()
    monkeypatch.setattr(mode.free_policy,'match',lambda *args:(policy,entry))
    assert mode.validate_route('https://example.invalid','model') is entry

def test_shadow_uses_usage_and_contains_no_prompt(tmp_path):
    path=tmp_path/'shadow.jsonl'
    mode.shadow_record(path,'synthetic-model',{'messages':[{'content':'PRIVATE_CANARY'}],'max_tokens':20},
                       {'input_per_mtok':10,'output_per_mtok':10},'succeeded',{'prompt_tokens':100,'completion_tokens':10})
    row=json.loads(path.read_text())
    assert row['simulated_future_cost_thb']==.0011
    assert row['observed_invoice_cost'] is None and row['current_free_route_cost']==0
    assert 'PRIVATE_CANARY' not in path.read_text()
