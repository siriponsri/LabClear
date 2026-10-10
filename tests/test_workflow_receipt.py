import asyncio
import hashlib
import json
from services import execution, workflow_receipt, cost_ledger, conversation_transport
from tests.test_cost_ledger import ledger_env, body  # isolated temporary ledger


def test_private_sources_and_content_never_enter_public_receipt():
    rows=[{"id":"public-1","data_class":"public_reference","content":"Public source"},
          {"id":"PRIVATE_ID_CANARY","data_class":"organization_private","content":"PRIVATE_CONTENT_CANARY"}]
    result=workflow_receipt.source_manifest(rows)
    assert result == [{"id":"public-1","data_class":"public_reference","content_sha256":hashlib.sha256(b"Public source").hexdigest()}]
    assert "PRIVATE" not in json.dumps(result) and "Public source" not in json.dumps(result)


def test_receipt_uses_same_settlement_and_never_recharges():
    async def run():
        ctx=execution.Execution('/test','ai',30,'owner')
        token=execution._CURRENT.set(ctx)
        try:
            reservation=cost_ledger.reserve('priced-model',body())
            ctx.attempts=1;ctx.receipt_reserved_thb=reservation.estimate_thb
            usage={'prompt_tokens':1000,'completion_tokens':1000}
            await execution.offload(conversation_transport._settle,reservation,None,usage,'succeeded')
            await execution.offload(conversation_transport._settle,reservation,None,usage,'succeeded')
            out=workflow_receipt.receipt(ctx)
            assert out['settled_estimate_thb']==0.09==cost_ledger.status()['settled_thb']
            assert out['provider_attempts']==1
            assert out['reserved_estimate_thb']>=out['settled_estimate_thb']
            assert 'prior_spend_thb' not in out and 'remaining_thb' not in out
            error=ctx.error_event(conversation_transport.ConversationError('review_failed','withheld',502))
            assert error['receipt']==out
        finally:execution._CURRENT.reset(token)
    asyncio.run(run())
