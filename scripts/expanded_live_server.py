"""Harness-only live server. Reuses old synthetic DB/key/cycle and money ledger.

No credential is printed or copied. All provider calls use the application transport.
The owner confirmed previous callers stopped on 2026-10-12. Global cap includes all
old attempts and newly admitted/reserved attempts; no call or money counter reset.
"""
import os, sys, json, functools, sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT)); os.chdir(ROOT)
out=Path(sys.argv[1]).resolve(); port=int(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
old=ROOT/'eval_runs/live-ui-20261012T102549'
meta=json.loads((old/'run.json').read_text(encoding='utf-8'))
state=old/'server-state'
if not (state/'business.sqlite3').exists() or not (state/'business.key').exists():
    raise SystemExit('BLOCKED: original accounting database/key missing; will not create a replacement')
os.environ.update(DATABASE_URL='',BUSINESS_DATA_KEY='',RENDER='',VERCEL='',BUSINESS_DB_PATH=str(state/'business.sqlite3'),BUSINESS_KEY_PATH=str(state/'business.key'),BUSINESS_EXTERNAL_ENABLED='false',STRIPE_SECRET_KEY='',LINE_CHANNEL_SECRET='',LINE_CHANNEL_ACCESS_TOKEN='',APP_ENV='development',PROVIDER_NETWORK_ENABLED='true',PROVIDER_BUDGET_CYCLE_ID=meta['budget_cycle'],RUNTIME_SKILLS_ENABLED='true',HOSPITAL_LINKS_ENABLED='true',DEMO_ACCESS_CODE='',DEMO_ACCOUNTS='false')
from config import settings
from services import conversation_transport as transport, cost_ledger, execution
if os.environ.get('EXPANDED_TYPED_QUESTION_QUOTA')=='1':
    from scripts.expanded_question_quota import install as install_question_quota
    install_question_quota()
from scripts.expanded_attempt_gate import AttemptGate,GateError
ledger=cost_ledger.status();durable=transport.durable_call_status()
if not ledger.get('available') or not settings.COST_LEDGER_ENABLED or ledger.get('prior_spend_thb') is None:
    raise SystemExit('BLOCKED: accounting unavailable or unknown prior spend')
gate_path=ROOT/'docs/evidence/current/expanded-attempt-budget-20261012/global-attempts.sqlite3'
if not gate_path.exists():raise SystemExit('BLOCKED: shared counter with preserved history not prepared')
with sqlite3.connect(gate_path) as gate_db:
    ceiling,prior=gate_db.execute('SELECT ceiling,prior FROM policy WHERE id=1').fetchone()
if ceiling!=4000:raise SystemExit('BLOCKED: owner total4000 authorization not recorded in gate')
gate=AttemptGate(gate_path,ceiling=4000,prior=prior)
consumed=prior+gate.snapshot()['new_attempts']
if int(durable.get('used',0))>consumed or int(ledger.get('calls',0))>consumed:
    raise SystemExit('BLOCKED: provider counter exceeds reconciled global admissions')
preflight={'server_pid':os.getpid(),'owner_coordination_confirmation':'หยุดหมดแล้วครับ คุณเริ่มใหม่ได้เลยครับ','owner_repair_authorization':'Pepo แก้ไขมาเลยครับ','owner_global_cap_authorization':'ขยายเพดานเป็น 4,000 ได้เลยครับ','old_cycle_preserved':meta['budget_cycle'],'old_database_preserved':str(state/'business.sqlite3'),'global_gate_path':str(gate_path),'global_gate':gate.snapshot(),'durable_usage':durable,'money_ledger':ledger,'mode':'LIVE_PROVIDER_LOCAL_UI','whole_case_retries':0,'workflow_cap':12,'provider_models':{'llm':settings.LLM_PROVIDER+'/'+settings.LLM_MODEL,'guard':settings.GUARD_PROVIDER,'vision':settings.VISION_PROVIDER+'/'+settings.VISION_MODEL}}
(out/'accounting-preflight.json').write_text(json.dumps(preflight,ensure_ascii=False,indent=2),encoding='utf-8')
print('ACCOUNTING_PREFLIGHT '+json.dumps({'prior':prior,'remaining':gate.snapshot()['remaining'],'money_remaining':ledger.get('remaining_thb'),'old_reserved':ledger.get('reserved_thb')},ensure_ascii=False),flush=True)
if ledger.get('remaining_thb',0)<=0 or gate.snapshot()['remaining']<=0: raise SystemExit('BLOCKED: attempt or money budget exhausted')
if '--preflight-only' in sys.argv: raise SystemExit(0)
original=transport.post_json
free_reporting=os.environ.get('EXPANDED_FREE_ESTIMATE_REPORT_ONLY')=='1'
if free_reporting:
    if not settings.FREE_ONLY_POLICY_PATH:
        raise SystemExit('BLOCKED: reporting-only mode requires reviewed free-only policy')
    from scripts import expanded_free_estimate as free_estimate
    free_estimate.install_reservation_mode()
@functools.wraps(original)
async def bounded_post(url,headers,body,slot,timeout,price=None,model='',label=''):
    ctx=execution.current()
    if ctx is None: raise transport.ConversationError('accounting_unknown','No workflow accounting context',503)
    free_token=None
    if free_reporting:
        free_estimate.validate_route(url,model or str(body.get('model') or ''))
        free_token=free_estimate.verified_call.set(True)
    try: admission=gate.admit(ctx.request_id,slot,workflow_cap=12)
    except BaseException as error:
        if free_token is not None: free_estimate.verified_call.reset(free_token)
        if isinstance(error,GateError):
            raise transport.ConversationError('expanded_attempt_limit',str(error),429) from None
        raise
    status='failed'
    result=None
    try:
        result=await original(url,headers,body,slot,timeout,price,model,label)
        status='succeeded';return result
    except BaseException as exc:
        if type(exc).__name__ in {'CancelledError','TimeoutError'}: status='cancelled'
        raise
    finally:
        gate.finish(admission,status)
        if free_token is not None:
            free_estimate.verified_call.reset(free_token)
            if price is not None:
                try:
                    free_estimate.shadow_record(out/'simulated-future-cost.jsonl',model or str(body.get('model') or ''),body,price,status,(result or {}).get('usage'))
                except Exception:
                    print('SIMULATED_COST_RECORD_ERROR: inspect local evidence; primary accounting preserved',flush=True)
        # Contains only public accounting; no messages, URLs, keys or report values.
        (out/'accounting-current.json').write_text(json.dumps({'gate':gate.snapshot(),'durable_usage':transport.durable_call_status(),'money_ledger':cost_ledger.status()},indent=2),encoding='utf-8')
transport.post_json=bounded_post
import uvicorn
uvicorn.run('main:app',host='127.0.0.1',port=port,log_level='warning')
