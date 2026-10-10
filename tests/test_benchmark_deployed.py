from scripts import benchmark_deployed as deployed


def test_receipt_sources_must_match_exact_public_content_and_class():
    candidates={('public','right'):{'id':'public','content':'Actual public evidence','data_class':'public_reference'}}
    outcomes=[{'receipt':{'public_writer_sources':[
        {'id':'public','content_sha256':'right','data_class':'public_reference'},
        {'id':'public','content_sha256':'wrong','data_class':'public_reference'},
        {'id':'public','content_sha256':'right','data_class':'organization_private'}]}}]
    calls,unmatched=deployed.verified_calls(outcomes,candidates)
    assert len(calls[0]['evidence'])==1 and len(unmatched)==2


def test_quota_and_unaccounted_workflow_stop_without_retry():
    assert deployed.stop_reason({'outcomes':[{'error':{'code':'free_quota_exhausted'}}]}).startswith('provider_or_quota_stop')
    assert deployed.stop_reason({'outcomes':[{}]})=='missing_workflow_receipt'
    assert deployed.stop_reason({'outcomes':[{'receipt':{'schema':'workflow-receipt-1','ledger_enabled':False}}]})=='existing_cost_ledger_disabled'


def test_summary_keeps_denominator_twenty_and_unrun_cases():
    ids=[f'Q{i:02}' for i in range(1,11)]+[f'I{i:02}' for i in range(1,6)]+[f'S{i:02}' for i in range(1,6)]
    run={'run_id':'test','candidate':'a'*40,'dataset':{},'case_ids':ids}
    summary=deployed.summarize(run,[{'case_id':'Q01','automated_verdict':'PASS'}])
    assert summary['expected_cases']==20 and summary['automated_pass']==1
    assert len(summary['not_run'])==19 and summary['full_frozen_rubric_certified'] is False
