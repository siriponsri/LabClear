"""Run-scoped free-route accounting. No account verification or network calls here."""
from contextvars import ContextVar
import json
from pathlib import Path
from services import cost_ledger, free_policy
from services.conversation_transport import ConversationError

verified_call = ContextVar('expanded_verified_free_call', default=False)

def validate_route(url, model):
    policy, entry = free_policy.match(url, model)
    if not policy.reviewed_by or not policy.reviewed_at or not policy.account_label or not policy.data_policy_reviewed:
        raise ConversationError('free_policy_unverified', 'Reviewed account and data policy required before reporting-only mode.', 409)
    return entry

def install_reservation_mode():
    original = cost_ledger.reserve
    def reserve(model, body, price=None):
        return original(model, body, price, verified_free_reporting_only=verified_call.get())
    cost_ledger.reserve = reserve

def shadow_record(path, model, body, configured_price, outcome, usage=None):
    # Never persist prompts, patient cells, credentials or response content.
    estimate = cost_ledger.estimate(model, body, configured_price)
    if outcome == 'succeeded' and isinstance(usage, dict):
        try:
            inp=int(usage.get('prompt_tokens',usage.get('input_tokens')))
            out=int(usage.get('completion_tokens',usage.get('output_tokens')))
            if inp >= 0 and out >= 0:
                estimate=round((inp*configured_price['input_per_mtok']+out*configured_price['output_per_mtok'])/1e6,6)
        except (TypeError,ValueError):
            pass
    row={'model':model,'outcome':outcome,'simulated_future_cost_thb':estimate,'price_basis':configured_price,
         'current_free_route_cost':0,'observed_invoice_cost':None,'basis':'configured editable estimate; not invoice'}
    with Path(path).open('a',encoding='utf-8') as handle:
        handle.write(json.dumps(row,ensure_ascii=False)+'\n')
