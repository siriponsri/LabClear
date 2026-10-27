"""Read-only preflight. No .env read, no provider call, no money/cycle reset.

Live execution is deliberately blocked until owner coordination is documented.
The attempt gate must wrap all transport calls, including guard/OCR/repair, before
an approved runner may call providers. This file does not launch an unbounded runner.
"""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
old=ROOT/'eval_runs/live-ui-20261012T102549/run.json'
metadata=json.loads(old.read_text(encoding='utf-8'))
report={"global_ceiling":3000,"prior_conservative":23,"remaining_at_most":2977,
        "old_run_finished_at":metadata.get('finished_at'),
        "authorized_financial_limit_change":False,"authorized_counter_reset":False,
        "status":"BLOCKED","reasons":[]}
if not metadata.get('finished_at'):
    report['reasons'].append('Old runner completion absent; process inspection denied; owner must confirm exclusive window.')
report['reasons'].append('Prior 23 responses are a lower bound until outstanding attempts/cost reservations reconciled.')
report['reasons'].append('Harness attempt gate tested offline; live all-transport integration and accounting reconciliation remain required.')
print(json.dumps(report,ensure_ascii=False,indent=2))
