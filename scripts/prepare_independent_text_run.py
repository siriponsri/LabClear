"""Prepare approved no-image cases and reviewed public-free exact routes; no HTTP."""
import os,sys,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));os.chdir(ROOT)
folder=ROOT/'docs/evidence/current/independent-text-20261012-01';folder.mkdir(parents=True,exist_ok=True)
all_cases=json.loads((ROOT/'docs/evidence/current/expanded-live-20261012-01/run-inputs.json').read_text())['cases']
cases=[c for c in all_cases if c.get('split')=='expanded_owner' and not c.get('image')]
order={'SAFE':0,'EDU':1,'INJECT':2,'UNCLEAR':3,'CONTEXT':4}
cases.sort(key=lambda c:(order.get(c.get('kind'),9),c['id']))
(folder/'run-inputs.json').write_text(json.dumps({'cases':cases},ensure_ascii=False,indent=2),encoding='utf-8')
policy={'policy_id':'expanded-text-owner-free','policy_version':'20261012.1','mode':'LIVE_FREE',
 'reviewed_by':'LabClear test operator under recorded owner instructions','reviewed_at':'2026-10-12','account_label':'LabClear-owner-existing-runtime-key',
 'data_policy_reviewed':True,'account_evidence':'Owner confirmed no iApp use outside LabClear today. Exact configured hosted routes match publicly free offerings. No invoice or console credit balance accessed.',
 'run_decision_accounting':'typed questions times explicit permutations; supported <=10 labels only; default safety request has one question, no automatic order-invariance',
 'observed_invoice_cost':None,
 'endpoints':[
 {'family':'text','protocol':'openai_chat','host':'api.opentyphoon.ai','path':'/v1/chat/completions','model':'typhoon-v2.5-30b-a3b-instruct','price_status':'VERIFIED_FREE_FOR_THIS_ACCOUNT','price_in_thb_per_mtok':0,'price_out_thb_per_mtok':0,'verified_at':'2026-10-12','evidence':'https://docs.opentyphoon.ai/en/faq/ describes hosted research API free; docs home names configured model in free API tier; exact runtime route matched. Owner authorized synthetic test calls.','app_rate_per_minute':30},
 {'family':'ocr','protocol':'openai_chat','host':'api.opentyphoon.ai','path':'/v1/chat/completions','model':'typhoon-ocr','price_status':'VERIFIED_FREE_FOR_THIS_ACCOUNT','price_in_thb_per_mtok':0,'price_out_thb_per_mtok':0,'verified_at':'2026-10-12','evidence':'https://opentyphoon.ai/model/typhoon-ocr explicitly Free API; exact runtime route matched. OCR run cap is zero for this text-only group.','app_rate_per_minute':5},
 {'family':'guard','protocol':'systemone_iapp','host':'api.iapp.co.th','path':'/v3/store/openthai/systemone','model':'openthai-systemone','price_status':'VERIFIED_FREE_FOR_THIS_ACCOUNT','price_in_thb_per_mtok':0,'price_out_thb_per_mtok':0,'verified_at':'2026-10-12','evidence':'https://iapp.co.th/docs/llm/openthai-systemone: preview0IC/request with any key,100requests/minute1000decisions/day. Exact runtime route matched; owner confirmed no external use today.','app_rate_per_minute':20,'daily_decisions':1000}],
 'run_limits':{'max_minutes':120,'text_calls':900,'ocr_calls':0,'guard_decisions':500,'retries_per_logical_call':1,'concurrency':1},'decision_counting':'questions_x_labels'}
(folder/'free-policy.json').write_text(json.dumps(policy,ensure_ascii=False,indent=2),encoding='utf-8')
state=ROOT/'eval_runs/live-ui-20261012T102549/server-state'
os.environ.update(DATABASE_URL='',BUSINESS_DB_PATH=str(state/'business.sqlite3'),BUSINESS_KEY_PATH=str(state/'business.key'),BUSINESS_DATA_KEY='')
from services import business_store as db
day=datetime.now(timezone.utc).date().isoformat()
key='free_quota_day_'+db.digest(policy['account_label']+'|guard|'+day)
with db.transaction() as tx:
 old=tx.get(key);count=max(119,old['data']['decisions'] if old else 0)
 tx.put(key,'free_quota_day','system',{'decisions':count,'prior_guard_admissions':119,'account_owner_confirmation':'ไม่มีการใช้นอก LabClear วันนี้','prior_basis':'All historical guard adapter requests contain one typed safety question, <=5 labels, no order_invariant/permutations; failed admissions retained conservatively.'},'open')
mapping={'text_only_cases':len(cases),'text_only_turns':sum(len(c['turns']) for c in cases),'max_provider_attempts':sum(len(c['turns']) for c in cases)*12,'current_global_total':307,
 'global_total_upper_envelope':307+sum(len(c['turns']) for c in cases)*12,'remaining_image_dependent_cases':len([c for c in all_cases if c.get('split')=='expanded_owner' and c.get('image')]),
 'day_guard_prior':count,'decision_basis':'Typed questions times permutations; not one HTTP request by assumption. Existing production conservative default unchanged; run-scoped accounting only.',
 'source_input_sha256':hashlib.sha256((ROOT/'docs/evidence/current/expanded-live-20261012-01/run-inputs.json').read_bytes()).hexdigest(),'owner_confirmation':policy['account_evidence']}
(folder/'dependency-and-quota-provenance.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(mapping,ensure_ascii=False))
