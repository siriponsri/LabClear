"""OFFLINE: gate-specific tests; no application/provider requests."""
from concurrent.futures import ThreadPoolExecutor
import subprocess
import sys
import pytest
from scripts.expanded_attempt_gate import AttemptGate, GateError

def test_prior_attempts_reduce_remaining(tmp_path):
    g=AttemptGate(tmp_path/'g.db'); assert g.snapshot()['remaining']==2977

def test_ceiling_blocks_before_attempt(tmp_path):
    g=AttemptGate(tmp_path/'g.db',ceiling=24); g.admit('a','guard')
    with pytest.raises(GateError,match='global'): g.admit('b','vision')
    assert g.snapshot()['new_attempts']==1

def test_inflight_reserved_counts_concurrently(tmp_path):
    g=AttemptGate(tmp_path/'g.db',ceiling=30)
    def reserve(i):
        try: return g.admit(str(i),'mock')
        except GateError: return None
    with ThreadPoolExecutor(max_workers=16) as pool: accepted=list(pool.map(reserve,range(40)))
    assert sum(x is not None for x in accepted)==7
    assert g.snapshot()['statuses']=={'reserved':7}
    # Independent processes use independent SQLite connections and must share the same cap.
    process_db=tmp_path/'process.db'
    process_gate=AttemptGate(process_db,ceiling=30)
    code="from scripts.expanded_attempt_gate import AttemptGate,GateError; import sys; g=AttemptGate(sys.argv[1],ceiling=30);\ntry: g.admit(sys.argv[2],'mock'); print('ADMITTED')\nexcept GateError: print('BLOCKED')"
    def process_reserve(i):
        return subprocess.run([sys.executable,'-B','-c',code,str(process_db),str(i)],capture_output=True,text=True,check=True).stdout.strip()
    with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(process_reserve,range(16)))
    assert results.count('ADMITTED')==7 and results.count('BLOCKED')==9
    assert process_gate.snapshot()['statuses']=={'reserved':7}

def test_failure_never_refunds(tmp_path):
    g=AttemptGate(tmp_path/'g.db'); n=g.admit('w','mock'); g.finish(n,'failed')
    assert g.snapshot()['remaining']==2976

def test_cancellation_never_refunds(tmp_path):
    g=AttemptGate(tmp_path/'g.db'); n=g.admit('w','mock'); g.finish(n,'cancelled')
    assert g.snapshot()['remaining']==2976

def test_reopen_preserves_attempts(tmp_path):
    p=tmp_path/'g.db'; g=AttemptGate(p); g.admit('w','mock'); assert AttemptGate(p).snapshot()['new_attempts']==1
    with pytest.raises(GateError,match='no reset'): AttemptGate(p,ceiling=3001)

def test_workflow_cap_includes_guard_vision_repair(tmp_path):
    g=AttemptGate(tmp_path/'g.db')
    for i in range(12): g.admit('w',['guard','vision','repair'][i%3])
    with pytest.raises(GateError,match='workflow'): g.admit('w','writer')
    assert g.snapshot()['new_attempts']==12

def test_duplicate_finish_does_not_double_count(tmp_path):
    g=AttemptGate(tmp_path/'g.db'); n=g.admit('w','mock'); g.finish(n,'succeeded'); g.finish(n,'succeeded')
    assert g.snapshot()['new_attempts']==1
    with pytest.raises(GateError): g.finish(n,'failed')

def test_authorized_4000_total_preserves_prior_and_reserved_history(tmp_path):
    g=AttemptGate(tmp_path/'g.db',ceiling=3000,prior=260)
    n=g.admit('w','guard');g.authorize_ceiling(4000,'Owner approved global4000 total')
    snapshot=g.snapshot();assert snapshot['prior_conservative']==260 and snapshot['new_attempts']==1
    assert snapshot['remaining']==3739 and snapshot['statuses']=={'reserved':1}
    g.finish(n,'succeeded');assert g.snapshot()['new_attempts']==1
    with pytest.raises(GateError):g.authorize_ceiling(5000,'')
