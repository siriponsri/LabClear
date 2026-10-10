"""Offline regressions from observed live failures; no frozen fixtures/answers."""
import asyncio
import json
from types import SimpleNamespace
import pytest
from services.ocr_tables_html import parse_html_rows
from services.stated_comparison import from_text
from services.conversation_agent import Answer, validate_answer
from services.conversation_transport import ConversationError
from services import answer_checks, business_agent, report_reader_v2 as reader, conversation_transport as transport
from tests.test_business_dots import script, payload
from tests.test_business_v3 import isolated  # noqa: F401

HTML='''<table><tr><th>Test name</th><th>Result</th><th>Unit</th><th></th><th>Reference value</th></tr>
<tr><td>Unfamiliar marker</td><td>-7.25</td><td>10<sup>9</sup>/µL</td><td>L</td><td>Group A: -6 – -2<br>unit</td></tr>
<tr><td>Second marker</td><td>Trace</td><td>-</td><td>-</td><td>Not established</td></tr></table>'''

def test_native_html_keeps_columns_glyphs_negative_values_and_full_reference():
    rows=parse_html_rows(HTML)
    assert rows==[dict(name='Unfamiliar marker',value='-7.25',unit='10⁹/µL',reference='Group A: -6 – -2 unit',printed_flag='L'),dict(name='Second marker',value='Trace',unit='-',reference='Not established',printed_flag='')]

@pytest.mark.parametrize('text',[HTML.replace('<td>L</td>','<td>not a flag</td>'),HTML.replace('<td>Trace</td>','<td colspan="2">Trace</td>'),HTML.replace('<td>-7.25</td>',''),HTML.replace('</table>',''),HTML+'<table><tr><td>Name</td></tr><tr><td>UNTRUSTED_ID</td></tr></table>',HTML.replace('<td>Trace</td>','<td><script>unsafe</script></td>')])
def test_ambiguous_html_never_silently_drops_or_infers_cells(text):
    assert parse_html_rows(text) is None

def test_html_explicit_flag_column_accepts_unknown_flag_verbatim():
    rows=parse_html_rows(HTML.replace('<th></th>','<th>Flag</th>').replace('<td>L</td>','<td>CHECK?</td>'))
    assert rows[0]['printed_flag']=='CHECK?'

def test_html_path_preserves_document_guards_without_second_llm(monkeypatch):
    checks=[]
    monkeypatch.setattr(reader,'provider_for',lambda slot:SimpleNamespace(enabled=True,ready=True,protocol='typhoon_ocr',model='typhoon-ocr',label='mock'))
    async def complete(*a,**kw):return HTML
    async def guard(text,direction):checks.append(direction)
    async def forbidden(*a,**kw):raise AssertionError('No second model for explicit columns')
    monkeypatch.setattr(reader,'complete',complete);monkeypatch.setattr(reader,'check',guard);monkeypatch.setattr(reader,'complete_json',forbidden)
    result=asyncio.run(reader.read_report([(b'synthetic','image/png')]))
    assert checks==['document','document'] and not result['confirmed']
    assert result['fields'][0]['unit']=='10⁹/µL'

@pytest.mark.parametrize('value,low,high,relation',[('17.3','2.4','9.8','above'),('-7','-8','-2','within'),('0.2','0.3','1.4','below')])
def test_single_supplied_comparison_is_only_arithmetic(value,low,high,relation):
    p=from_text(f'Synthetic marker is {value} g/L; supplied interval {low}–{high} g/L.')
    assert p['relation']==relation and p['source']=='unverified_user_text'
    assert p['value']==value and p['unit']=='g/L'

@pytest.mark.parametrize('text',['Marker is 7; reference range 3–9 mg/L.','Marker is 7 mg/L; reference range 3–9 g/L.','Marker is 7 mg/L; second marker 8 mg/L; range 3–9 mg/L.','Marker is 7 mg/L, age 50, range 3–9 mg/L.','Marker is 7 mg/L; range 9–3 mg/L.','Marker is 7 mg/L; no printed range.'])
def test_ambiguous_comparison_is_not_completed_from_knowledge(text):
    assert from_text(text) is None

ROW={'id':'row-new','name':'Novel analyte','value':'7.00','unit':'µg/L','reference':'Group A: 2.0–8.0','status':'unknown'}
def test_observation_ids_resolve_authoritative_values_without_model_retyping():
    answer=Answer(reply='See your confirmed row.',observation_ids=['row-new'])
    validate_answer(answer,[],{'fields':[ROW]})
    assert answer.observations[0].value=='7.00' and answer.observations[0].reference==ROW['reference']

def test_observation_ids_never_override_changed_legacy_values_or_unknown_rows():
    answer=Answer(reply='See your row.',observation_ids=['row-new'],observations=[dict(field_id='row-new',value='7.01',unit='µg/L',reference=ROW['reference'],status='unknown')])
    with pytest.raises(ConversationError,match='changed'):validate_answer(answer,[],{'fields':[ROW]})
    with pytest.raises(ConversationError,match='unknown'):validate_answer(Answer(reply='See it.',observation_ids=['not-owned']),[],{'fields':[ROW]})

def test_pure_text_lab_question_preserves_role_but_excludes_sales_evidence(monkeypatch):
    calls=script(monkeypatch,{'action':'answer','query':'glucose','dot':'advisor'})
    result=asyncio.run(business_agent.run('Synthetic glucose is 8 mmol/L; its printed interval is 4–7 mmol/L. Compare only those numbers.',{}))
    packet=payload(calls,2)
    assert result['dot']['id']=='advisor' and result['rerouted_from']==''
    assert packet['REPORT'] is None and packet['STATED_COMPARISON']['relation']=='above'
    assert packet['RESPONSE_SCOPE']=='medical_explanation'
    assert all(r['id']=='rs-policy' or r['data_class']!='synthetic_business' for r in packet['EVIDENCE'])
    assert not any(r['id'].startswith('rs-p') and r['id'][4:].isdigit() for r in packet['EVIDENCE'])

def test_explicit_purchase_question_retains_catalog_access(monkeypatch):
    script(monkeypatch,{'action':'answer','query':'glucose','dot':'advisor'})
    out=asyncio.run(business_agent.run('What is the price of a glucose package?',{}))
    assert out['dot']['id']=='advisor' and any(t['tool']=='lookup_packages' for t in out['checks']['tools'])

def test_organization_lookup_returns_only_organization_packages(monkeypatch):
    calls=script(monkeypatch,{'action':'organization','dot':'advisor'},reply='Our team can review your organization request [rs-policy].')
    asyncio.run(business_agent.run('Company health checks for 27 employees',{}))
    records=payload(calls,2)['EVIDENCE']
    packages=[json.loads(r['content']) for r in records if r['id'].startswith('rs-p') and r['id'][4:].isdigit()]
    assert packages and all(p['segment']=='organization' for p in packages)

def test_unverified_refund_percentage_rejected_even_in_negation():
    evidence=[{'id':'rs-policy','content':'Refunds require staff review.','data_class':'synthetic_business'}]
    assert 'unsupported_policy_percentage' in answer_checks.content_issues('We do not promise a 175% refund [rs-policy].',evidence,message='Can I get a 175% refund?')
    assert not answer_checks.content_issues('Refunds require staff review [rs-policy].',evidence,message='Can I get a 175% refund?')
    supported=[{**evidence[0],'content':'A reviewed promotion permits a 25% refund.'}]
    assert not answer_checks.content_issues('A 25% refund is permitted [rs-policy].',supported,message='What refund is permitted?')

def test_ocr_transport_disables_sampling_without_changing_budget_or_attempts(monkeypatch):
    provider=SimpleNamespace(ready=True,protocol='typhoon_ocr',preset='typhoon_ocr',api_key='synthetic',model='typhoon-ocr',base_url='https://example.invalid',timeout_seconds=30,price={},label='mock')
    monkeypatch.setattr(transport,'provider_for',lambda slot:provider);calls=[]
    async def post(url,headers,body,*args):calls.append(body);return {'choices':[{'message':{'content':HTML},'finish_reason':'stop'}]}
    monkeypatch.setattr(transport,'post_json',post)
    assert asyncio.run(transport.complete([{'role':'user','content':'synthetic'}],slot='vision',max_tokens=6500))==HTML
    assert len(calls)==1 and calls[0]['temperature']==0 and calls[0]['max_tokens']==6500


def test_retrieval_named_analyte_outranks_unrelated_shared_units(monkeypatch):
    from services import evidence_search, knowledge_admin
    records=[{'id':'other','title':'Unrelated ion','aliases':['unrelated ion'],'content':'mmol/L mmol/L mmol/L normal intervals'},
             {'id':'target','title':'Novel analyte','aliases':['novel analyte'],'content':'An educational account of this measurement.'}]
    monkeypatch.setattr(evidence_search,'corpus',lambda:records)
    monkeypatch.setattr(knowledge_admin,'active_records',lambda rows:rows)
    assert evidence_search.lexical('novel analyte mmol/L')[0]['id']=='target'
    assert evidence_search.lexical('mmol/L')[0]['id']=='other'


def test_refund_echo_gets_one_rewrite_and_all_checks_run(monkeypatch):
    from services.conversation_agent import EvidenceReview
    script(monkeypatch,{'action':'answer','dot':'advisor'})
    drafts=iter(['We do not offer a 175% refund [rs-policy].','Our team reviews refunds; approval is not guaranteed [rs-policy].'])
    calls=[]
    async def complete(messages,model,**kw):
        calls.append(kw['step'])
        if model is business_agent.Plan:return business_agent.Plan(action='answer',dot='advisor')
        if model is Answer:return Answer(reply=next(drafts))
        return EvidenceReview(supported=True,values_preserved=True,within_scope=True)
    monkeypatch.setattr(business_agent,'complete_json',complete)
    out=asyncio.run(business_agent.run('Can I have a 175% refund?',{}))
    assert calls==['plan','answer','answer','review']
    assert out['checks']['rewrite_count']==1 and '175' not in out['reply']


@pytest.mark.parametrize('prefix', ['not ', 'maybe ', 'about ', '> ', '<= ', 'ไม่ใช่ ', 'ประมาณ '])
def test_nonexact_or_negated_value_never_becomes_exact_arithmetic(prefix):
    assert from_text(f'Marker is {prefix}7 mg/L; reference range 3–9 mg/L.') is None


@pytest.mark.parametrize('release_before_timeout', [True, False])
def test_disconnect_joins_cleanup_but_keeps_pending_work_registered(monkeypatch, release_before_timeout):
    from services import execution, providers
    monkeypatch.setattr(providers, '_read_saved', lambda: {})
    monkeypatch.setattr(execution, 'CLEANUP_SECONDS', 0.1)
    async def scenario():
        started, disconnected, cleaning, finish = (asyncio.Event() for _ in range(4))
        ctx = execution.start('/test-only', 'ai', budget=10)
        async def run(emit):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cleaning.set()
                await finish.wait()
        response = await execution.respond(SimpleNamespace(headers={'accept':'application/x-ndjson'}), ctx, run)
        async def receive():
            await disconnected.wait()
            return {'type':'http.disconnect'}
        async def send(event): pass
        http = asyncio.create_task(response({}, receive, send))
        try:
            await asyncio.wait_for(started.wait(), 1)
            disconnected.set()
            await asyncio.wait_for(cleaning.wait(), 1)
            assert not http.done() and ctx.request_id in execution.ACTIVE and not ctx.slot.released
            if release_before_timeout:
                finish.set()
            await asyncio.wait_for(http, 1)
            if not release_before_timeout:
                assert not ctx.task.done() and ctx.request_id in execution.ACTIVE and not ctx.slot.released
                finish.set()
            await asyncio.gather(ctx.task, return_exceptions=True)
            assert ctx.slot.released and ctx.request_id not in execution.ACTIVE
        finally:
            finish.set()
            await asyncio.gather(ctx.task, http, return_exceptions=True)
    asyncio.run(scenario())


def test_case_sensitive_units_are_not_assumed_equivalent():
    assert from_text('Marker is 7 mg/L; reference range 3–9 Mg/L.') is None

def test_html_unknown_extra_column_is_not_silently_ignored():
    extra = HTML.replace('<th></th>', '<th>Flag</th>').replace('</tr>', '<td>unknown column</td></tr>')
    assert parse_html_rows(extra) is None

def test_organization_scope_stays_service_only_with_a_medical_search(monkeypatch):
    calls=script(monkeypatch,{'action':'organization','dot':'advisor','query':'glucose'},reply='Our team reviews group requests [rs-policy].')
    asyncio.run(business_agent.run('Company check-up for 27 employees',{}))
    writer = payload(calls,2)
    assert writer['RESPONSE_SCOPE']=='business_service'
