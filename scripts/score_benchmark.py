"""Deterministic scoring of a frozen run. No network, model judge, clock or randomness.

python scripts/score_benchmark.py eval_runs/<run-id> --out score.json
Latency is reported by benchmark_labclear.py, separately from deterministic accuracy.
Missing cases stay in the denominator. OCR fields are re-scored from raw extraction.
"""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import benchmark_labclear as bench


def score(path: Path):
    run=json.loads((path/'run.json').read_text())
    rows=bench.final_rows([json.loads(line) for line in (path/'raw.jsonl').read_text().splitlines() if line.strip()])
    dataset,rubric,_=bench.load_dataset(run['suite'])
    if bench.verify_manifest(run['suite']) != run['dataset']:
        raise ValueError('Run dataset does not match the frozen dataset')
    cases={c['id']:c for c in dataset['cases']}
    gold={c['file']:c['rows'] for c in json.loads((bench.ROOT/rubric['images']['gold_file']).read_text())['cases']}
    result=[];totals={k:0 for k in ['expected_rows','rows_found','values_exact','units_exact','references_exact','flags_exact','extra_rows','duplicate_rows']}
    for cid in run['case_ids']:
        case=cases[cid];row=rows.get(cid,{})
        verdict=row.get('automated_verdict','NOT_RUN')
        if row.get('execution_status') not in {'COMPLETED'}:
            verdict='NOT_RUN' if not row else 'ERROR_OR_BLOCKED'
        item={'id':cid,'kind':case['kind'],'execution_status':row.get('execution_status','NOT_RUN'),'automated_verdict':verdict}
        if case['kind']=='image':
            raw=bench.score_image_rows(row.get('raw_extraction',[]),gold[case['legacy_id']]);item['ocr']=raw
            for k in totals:totals[k]+=raw.get(k,0)
            if raw['raw_verdict']!='PASS' and item['automated_verdict']=='PASS':item['automated_verdict']='FAIL'
        result.append(item)
    n=len(result);passed=sum(x['automated_verdict']=='PASS' for x in result)
    scores={'planned':n,'automated_pass':passed,'automated_score_percent':round(100*passed/n,4) if n else 0,
            'ocr':totals,'cases':result}
    for k in ['values_exact','units_exact','references_exact','flags_exact']:
        totals[k+'_percent']=round(100*totals[k]/totals['expected_rows'],4) if totals['expected_rows'] else None
    canonical=json.dumps(scores,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
    return {'scorer':'labclear-deterministic-1.0','mode':run['mode'],'profile':run['profile'],'dataset':run['dataset'],
            'scope':'Offline pipeline evidence, not Thai API or clinical quality' if run['mode']=='OFFLINE' else 'Automated checks; human review remains separate',
            'score_sha256':hashlib.sha256(canonical).hexdigest(),**scores}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run',type=Path);p.add_argument('--out',type=Path);a=p.parse_args()
    text=json.dumps(score(a.run),ensure_ascii=False,sort_keys=True,indent=2)+'\n'
    if a.out:a.out.write_text(text,encoding='utf-8')
    else:print(text,end='')
