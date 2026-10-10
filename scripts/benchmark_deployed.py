"""Frozen coursework20 through the deployed guest API; never direct provider calls.

Uses the unchanged dataset/rubric and original benchmark scoring functions. This
mode is LIVE_DEPLOYED, not LIVE_FREE or an isolated A/B/C trial. Source content is
reconstructed ONLY when its exact SHA matches a server receipt. No credentials,
private source text, global ledger or other users' data are requested. Seeded
cross-account canary coverage and provider invoices remain unverified here.
"""
from __future__ import annotations
import argparse, hashlib, json, re, time
from pathlib import Path
import httpx
import benchmark_labclear as bench

STOP_CODES = {'budget_exhausted','budget_prior_unknown','budget_invalid','price_unknown',
 'free_quota_exhausted','free_policy_blocked','free_policy_unverified','data_policy',
 'upstream_rate_limited','rate_limited','provider_rejected','http_401','http_403','http_429'}


def load_public_candidates():
    root=bench.ROOT
    records=json.loads((root/'knowledge/evidence/catalog.json').read_text(encoding='utf-8'))['records']
    catalog=json.loads((root/'business_data/catalog.json').read_text(encoding='utf-8'))
    for p in catalog['packages']:
        records.append({'id':'rs-'+p['id'].lower(),'data_class':'synthetic_business','content':json.dumps(p,ensure_ascii=False)})
    for key,filename in [('rs-policy','policies.json'),('rs-branches','branches.json')]:
        data=json.loads((root/'business_data'/filename).read_text(encoding='utf-8'))
        records.append({'id':key,'data_class':'synthetic_business','content':json.dumps(data)})
    return {(r['id'],hashlib.sha256(r['content'].encode('utf-8')).hexdigest()):r for r in records}


def verified_calls(outcomes,candidates):
    calls=[];unmatched=[]
    for out in outcomes:
        verified=[]
        for r in (out.get('receipt') or {}).get('public_writer_sources',[]):
            found=candidates.get((r.get('id'),r.get('content_sha256')))
            if found and found['data_class']==r.get('data_class'):
                verified.append({k:found[k] for k in ('id','content','data_class')})
            else:unmatched.append(r)
        if verified:calls.append({'stage':'writer','evidence':verified,'basis':'server_receipt_sha256_match'})
    return calls,unmatched


class Client(bench.Client):
    def get(self,path):
        bench.PACER.wait()
        response=self.c.get(self.base+'/api/business'+path,headers=self.headers())
        try:return response.status_code,response.json()
        except ValueError:return response.status_code,{}

    def stream(self,path,**kw):
        # Exactly one application attempt. No retries after quota/provider errors.
        return self._stream(path,**kw)


def execute_case(base,case,rule,gold,candidates):
    client=Client(base);outcomes=[];row={'case_id':case['id'],'kind':case['kind'],'attempt':1,
      'input_turns':case['turns'],'input_hash':bench.sha256_text(json.dumps({'turns':case['turns'],'image':case.get('image_sha256')},ensure_ascii=False)),
      'confirmation_mode':'RAW_AS_READ','human_verdict':'PENDING_REVIEW'}
    effects={'any':False};cleanup='not_started'
    try:
        client.start();cleanup='guest_created'
        if case['kind']=='image':
            image=bench.ROOT/case['image']
            if bench.sha256_file(image)!=case['image_sha256']:raise ValueError('Image changed')
            read=client.stream('/chat/report',data={'message':case['turns'][0]},files=[('files',(image.name,image.read_bytes(),'image/png'))])
            outcomes.append(read);result=read.get('result') or {}
            if result.get('report_id') and not read.get('error') and not stop_reason({'outcomes':[read]}):
                status,report=client.get('/reports/'+result['report_id'])
                row['raw_extraction']=(report.get('data') or {}).get('fields',[]) if status==200 else []
                row['raw_score']=bench.score_image_rows(row['raw_extraction'],gold['rows'])
                outcomes.append(client.stream('/chat/report/confirm',json={'message_id':result['card_id']}))
        else:
            for turn in case['turns']:
                outcome=client.stream('/chat',json={'message':turn});outcomes.append(outcome)
                if outcome.get('error') or stop_reason({'outcomes':[outcome]}):break
        effects=bench.side_effects(client)
    finally:
        client.close();cleanup='guest_close_requested'
    last=outcomes[-1] if outcomes else {'error':{'code':'not_run'}}
    result=last.get('result') or {}
    calls,unmatched=verified_calls(outcomes,candidates)
    row.update(outcomes=outcomes,cleanup=cleanup,public_evidence_unmatched=unmatched,
      actual_reply_or_artifact=result.get('reply'),error=last.get('error'),checks_reported=result.get('checks'),
      request_ids=[o['request_id'] for o in outcomes if o.get('request_id')],
      total_ms=sum(o.get('total_ms',0) for o in outcomes),provider_attempts=sum((o.get('receipt') or {}).get('provider_attempts',0) for o in outcomes),
      settled_estimate_thb=round(sum((o.get('receipt') or {}).get('settled_estimate_thb',0) for o in outcomes),6),
      reserved_estimate_thb=round(sum((o.get('receipt') or {}).get('reserved_estimate_thb',0) for o in outcomes),6))
    if case['kind']=='image':row.update(bench.score_image_case(row,outcomes,gold))
    else:row.update(bench.score_text_case(case,rule,outcomes,calls,effects,'LIVE_DEPLOYED',''))
    if (result.get('checks') or {}).get('independent_review')=='withheld':
        row['automated_verdict']='FAIL';row['verdict_reason']+='; explanation withheld by reviewer'
    row['receipt_complete']=all(o.get('receipt',{}).get('schema')=='workflow-receipt-1' for o in outcomes)
    
    if 'guard_layer' in row.get('automated_checks',{}):
        row['automated_checks']['guard_layer']='not_observable_from_guest_receipt'
    if not effects.get('checked'):
        row['automated_verdict']='FAIL';row['verdict_reason']+='; guest side effects could not be checked'
    row['seeded_private_canary_verified']=False
    return row


def stop_reason(row):
    for outcome in row.get('outcomes', []):
        error=outcome.get('error') or {}
        if error.get('code') in STOP_CODES or error.get('status') in (401,403,429):
            return 'provider_or_quota_stop: '+str(error.get('code'))
        receipt=outcome.get('receipt') or {}
        if receipt.get('schema')!='workflow-receipt-1':return 'missing_workflow_receipt'
        if not receipt.get('ledger_enabled'):return 'existing_cost_ledger_disabled'
    return None


def health_snapshot(base, expected):
    with httpx.Client(timeout=60,trust_env=False) as client:
        snapshots={}
        for endpoint in ('health','ready'):
            response=client.get(base+'/'+endpoint)
            response.raise_for_status();snapshots[endpoint]=response.json()
            if snapshots[endpoint].get('commit')!=expected:
                raise RuntimeError('Deployed commit mismatch at /'+endpoint)
        return snapshots


def summarize(run,rows,stopped=None):
    by_id={r['case_id']:r for r in rows}
    return {'run_id':run['run_id'],'mode':'LIVE_DEPLOYED','candidate':run['candidate'],
      'dataset':run['dataset'],'expected_cases':20,'executed_cases':len(rows),
      'automated_pass':sum(r.get('automated_verdict')=='PASS' for r in rows),
      'automated_fail':sum(r.get('automated_verdict')=='FAIL' for r in rows),
      'execution_errors':sum(r.get('automated_verdict')=='NOT_APPLICABLE' for r in rows),
      'not_run':[c for c in run['case_ids'] if c not in by_id],
      'case_verdicts':{c:by_id[c].get('automated_verdict') if c in by_id else 'NOT_RUN' for c in run['case_ids']},
      'settled_estimate_thb':round(sum(r.get('settled_estimate_thb',0) for r in rows),6),
      'provider_attempts':sum(r.get('provider_attempts',0) for r in rows),'stop_reason':stopped,
      'coverage_limitations':['No seeded private customer/provider canaries on shared deployment',
       'Provider invoices and global remaining balance are not accessible to this guest',
       'Keyword and row checks require human review; not proof of clinical accuracy',
       'Current deployed configuration, not isolated LIVE_FREE or A/B/C certification'],
      'full_frozen_rubric_certified':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-commit',required=True)
    parser.add_argument('--run-id',required=True)
    parser.add_argument('--approved-live-benchmark',action='store_true')
    parser.add_argument('--preflight-only',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}',args.expected_commit):parser.error('Exact deployed SHA required')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',args.run_id):parser.error('Invalid run id')
    if not args.preflight_only and not args.approved_live_benchmark:parser.error('Explicit live benchmark approval required')
    base='https://labclear.onrender.com'
    ds=bench.verify_manifest();dataset,rubric,_=bench.load_dataset()
    bench.check_course_eval_compatibility(dataset)
    cases=bench.select_cases(dataset,'coursework',None)
    if len(cases)!=20:raise RuntimeError('Canonical suite must contain 20 cases')
    run_dir=bench.RUNS/args.run_id
    run_dir.mkdir(parents=True,exist_ok=False)
    run={'run_id':args.run_id,'mode':'LIVE_DEPLOYED','suite':'coursework','profile':'DEPLOYED_CURRENT','started_at':bench.now(),
      'candidate':args.expected_commit,'local_candidate':bench.candidate(),'dataset':ds,
      'case_ids':[c['id'] for c in cases], 'base':base,'confirmation_mode':'RAW_AS_READ',
      'limits':{'case_retries':0,'task_settled_estimate_ceiling_thb':10},
      'authorization':'User approved canonical coursework20 using current configured providers and unchanged budgets',
      'images_visually_reviewed':'All five frozen fixtures are visibly DEMO/synthetic',
      'seeded_private_canary_verified':False}
    rows=[];stopped=None
    def save():
        (run_dir/'run.json').write_text(json.dumps(run,ensure_ascii=False,indent=2),encoding='utf-8')
        (run_dir/'raw.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
        (run_dir/'summary.json').write_text(json.dumps(summarize(run,rows,stopped),ensure_ascii=False,indent=2),encoding='utf-8')
    save()
    try:
        run['preflight']=health_snapshot(base,args.expected_commit);save()
        if args.preflight_only:
            stopped='preflight_only_no_AI_requests';save();return 0
        gold={c['file']:c for c in json.loads((bench.ROOT/rubric['images']['gold_file']).read_text(encoding='utf-8'))['cases']}
        candidates=load_public_candidates()
        for case in cases:
            health_snapshot(base,args.expected_commit)
            print(case['id']+' START',flush=True)
            row=execute_case(base,case,rubric['cases'].get(case['id'],{}),gold.get(case.get('legacy_id'),{'rows':[]}),candidates)
            row['candidate']=args.expected_commit;rows.append(row)
            stopped=stop_reason(row)
            if sum(r.get('settled_estimate_thb',0) for r in rows)>=10:stopped='task_cost_ceiling_reached'
            save();print(case['id']+' '+row['automated_verdict']+' '+row['verdict_reason'],flush=True)
            if stopped:break
        run['finished_at']=bench.now();save()
    except Exception as exc:
        # Persist partial evidence. No retry after an uncertain request outcome.
        stopped=type(exc).__name__+': '+str(exc)[:250];run['finished_at']=bench.now();save()
        print(stopped,flush=True);return 2
    print(json.dumps(summarize(run,rows,stopped),ensure_ascii=False,indent=2),flush=True)
    return 0 if len(rows)==20 and all(r.get('automated_verdict')=='PASS' for r in rows) else 1


if __name__=='__main__':
    raise SystemExit(main())
