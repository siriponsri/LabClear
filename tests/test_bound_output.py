"""Positive and adversarial contract checks, isolated synthetic data only."""
import asyncio
import json
from pathlib import Path
import pytest
from services import answer_checks,business_agent,report_binding,ocr_binding,policy_binding
from services.conversation_agent import Answer,Observation,EvidenceReview,validate_answer
from services.conversation_transport import ConversationError
from services.ocr_tables_html import parse_html_rows
from tests.test_business_dots import script
from tests.test_business_v3 import isolated,client  # noqa: F401

MED={'id':'nlm-x','title':'Reference intervals','data_class':'public_education','content':'Reference intervals vary by laboratory.'}
ROWS=[{'id':'a','name':'Marker Alpha\nดัชนีอัลฟา','value':'17.00','unit':'10⁹/µL','reference':'2.0–9.0','printed_flag':'H','status':'high'},
      {'id':'b','name':'Marker Beta','value':'4.25','unit':'g/L','reference':'3.0–6.0','printed_flag':'','status':'within'}]
REPORT={'confirmed':True,'fields':ROWS}

def test_734_i02_exposure_is_now_rejected_before_a_passing_reviewer(monkeypatch):
    fixture=json.loads((Path(__file__).parent/'fixtures/live_734_i02_exposure.json').read_text(encoding='utf-8'))
    issues=answer_checks.content_issues(fixture['reply'],[MED],{'fields':fixture['fields']})
    assert {'personal_disease_staging','personal_retesting_schedule'} <= set(issues)
    script(monkeypatch,{'action':'answer','dot':'explainer','query':'glucose'},reply=fixture['reply'])
    async def sources(*args):return fixture['evidence'],'lexical'
    monkeypatch.setattr(business_agent.evidence_search,'search',sources)
    with pytest.raises(ConversationError) as exc:
        asyncio.run(business_agent.run('ช่วยอธิบายผลตรวจ',{'report':{**REPORT,'fields':fixture['fields']}}))
    assert exc.value.code=='evidence_review_failed'

@pytest.mark.parametrize('claim',['อาจเป็นภาวะไตเรื้อรังระยะที่ ๔','โรคไตเรื้อรังระยะ IV','CKD G4 may explain your result.','Your kidney disease may be stage IV.','This may be stage 4 CKD.'])
def test_hedged_and_alternate_staging_cannot_be_personalized(claim):
    assert 'personal_disease_staging' in answer_checks.content_issues(claim,[],REPORT)

@pytest.mark.parametrize('claim',['ควรตรวจซ้ำในอีก 7 เดือน','You might repeat the test in 7 months.'])
def test_numeric_retesting_advice_is_not_added_to_a_report(claim):
    assert 'personal_retesting_schedule' in answer_checks.content_issues(claim,[],REPORT)

def test_uncertainty_statement_is_allowed():
    assert not answer_checks.content_issues('A single report cannot establish a disease stage or a retesting schedule.',[],REPORT)

def test_unknown_clinical_paraphrase_never_enters_final_report_reply(monkeypatch):
    calls=script(monkeypatch,{'action':'answer','dot':'explainer','query':'glucose'},reply='Your kidneys have permanently stopped functioning [nlm-x].')
    out=asyncio.run(business_agent.run('Explain this report',{'report':REPORT,'explain_report':True}))
    assert 'permanently' not in out['reply']
    assert '17.00' in out['reply'] and '2.0–9.0' in out['reply'] and 'above the printed interval' in out['reply']
    assert out['checks']['report_binding']['version']=='confirmed-row-renderer-1'
    reviewed=json.loads(calls[-1][-1]['content'])['draft']['reply']
    assert reviewed==out['reply'] and out['checks']['independent_review']=='passed'

def test_rendered_cells_are_bound_by_row_id_not_fuzzy_bilingual_name():
    a=Answer(reply='neutral [nlm-x]',observation_ids=['b'])
    validate_answer(a,[MED],REPORT);binding=report_binding.render(a,REPORT,[MED],'en','Explain')
    assert binding['field_ids']==['b'] and len(binding['rows_sha256'])==64
    assert '4.25 g/L' in a.reply and '3.0–6.0' in a.reply and '17.00' not in a.reply
    assert a.observations[0].reference=='3.0–6.0'

def test_duplicate_names_keep_unique_ids_and_disable_uncertain_comparison():
    report={'confirmed':True,'fields':[ROWS[0],{**ROWS[1],'name':ROWS[0]['name']}]}
    a=Answer(reply='neutral',observation_ids=['b'])
    result=report_binding.render(a,report,[],'en','Explain')
    assert result['integrity_issues']['b']==['duplicate_name']
    assert '4.25 g/L' in a.reply and 'cannot be compared automatically' in a.reply
    assert a.observations[0].field_id=='b'

def test_legacy_modified_observation_is_not_repaired_by_row_binding(monkeypatch):
    script(monkeypatch,{'action':'answer','dot':'explainer','query':'glucose'})
    original=business_agent.complete_json
    async def modified(messages,model,**kwargs):
        if model is Answer:return Answer(reply='neutral [nlm-x]',observation_ids=['a'],observations=[dict(field_id='a',value='999',unit='10⁹/µL',reference='2.0–9.0',status='high')])
        return await original(messages,model,**kwargs)
    monkeypatch.setattr(business_agent,'complete_json',modified)
    with pytest.raises(ConversationError) as exc:asyncio.run(business_agent.run('Explain',{'report':REPORT}))
    assert exc.value.code=='observation_invalid'

def test_conflicting_flag_and_contaminated_range_are_exposed_not_repaired():
    r={'confirmed':True,'fields':[{**ROWS[0],'reference':'H 2.0–9.0','printed_flag':'L'}]}
    a=Answer(reply='neutral');result=report_binding.render(a,r,[],'en','Explain')
    assert {'flag_in_reference','flag_comparison_conflict'} <= set(result['integrity_issues']['a'])
    assert 'H 2.0–9.0' in a.reply and a.observations[0].reference=='H 2.0–9.0'
    assert 'cannot be compared automatically' in a.reply

HTML='''<table><tr><th>Unknown label</th><th>Observed</th><th>Unit</th><th>Interval</th><th>Mark</th></tr>
<tr><td>Alpha<br>อัลฟา</td><td>17</td><td>10<sup>9</sup>/µL</td><td>2–9</td><td>H</td></tr>
<tr><td>Beta</td><td>4</td><td>10<sup>9</sup>/µL</td><td>3–6</td><td></td></tr></table>'''
FIELDS=[dict(name='Alpha\nอัลฟา',value='17',unit='10⁹/µL',reference='2–9',printed_flag='H'),dict(name='Beta',value='4',unit='10⁹/µL',reference='3–6',printed_flag='')]

def test_unknown_headers_can_still_verify_complete_same_row_cells():
    assert ocr_binding.bind_rows(FIELDS,HTML)['verified']

@pytest.mark.parametrize('change',[{'reference':'3–6'},{'value':'4'},{'unit':'10^9/uL'}])
def test_fallback_cannot_move_another_rows_cell_or_rewrite_unit_glyphs(change):
    verdict=ocr_binding.bind_rows([{**FIELDS[0],**change},FIELDS[1]],HTML)
    assert verdict['reject'] and verdict['reason']=='cell_not_in_its_source_row'

def test_fallback_cannot_reuse_one_row_for_duplicate_output():
    assert ocr_binding.bind_rows([FIELDS[0],FIELDS[0]],HTML)['reject']

def test_plain_or_merged_layout_is_not_falsely_certified():
    assert not ocr_binding.bind_rows(FIELDS,'An unstructured transcription')['verified']
    assert not ocr_binding.bind_rows(FIELDS,HTML.replace('<td>17','<td colspan="2">17'))['verified']

def test_direct_bilingual_html_preserves_whole_row_and_unit_exponent():
    html=HTML.replace('Unknown label','Test').replace('Observed','Result').replace('Interval','Reference').replace('Mark','Flag')
    rows=parse_html_rows(html)
    assert rows[0]=={**FIELDS[0],'name':'Alpha อัลฟา'} and rows[1]==FIELDS[1]

POLICY={'refund_policy':'Staff review a paid refund; approval is not guaranteed.','onsite_service':'Onsite service is for reviewed organizations only; home visits are not offered.','results_policy':'Staff give appointment-specific preparation instructions and timing.'}
EVIDENCE=[{'id':'rs-policy','data_class':'synthetic_business','content':json.dumps(POLICY)}]

@pytest.mark.parametrize('message,keys',[('Can I get a 175% refund?',['refund_policy']),('มีบริการเจาะเลือดถึงบ้านไหม',['onsite_service','results_policy'])])
def test_exact_policy_fields_remove_fabricated_promises_without_refusing(message,keys):
    a=Answer(reply='A refund of 175% is not promised; everything takes 13 minutes.')
    binding=policy_binding.render(a,EVIDENCE,message)
    assert binding['fields']==keys and all(POLICY[k] in a.reply for k in keys)
    assert '175' not in a.reply and '13' not in a.reply and '[rs-policy]' in a.reply

def test_policy_is_not_hardcoded_to_the_benchmark():
    policy={**POLICY,'refund_policy':'A reviewed contract permits 17% for this service.'}
    evidence=[{**EVIDENCE[0],'content':json.dumps(policy)}]
    a=Answer(reply='neutral');policy_binding.render(a,evidence,'What is the refund policy?','en')
    assert '17%' in a.reply and POLICY['refund_policy'] not in a.reply
    assert answer_checks.content_issues(a.reply,evidence,message='refund')==[]

def test_iapp_failure_stops_before_writer_and_never_auto_retries(monkeypatch):
    calls=script(monkeypatch,{'action':'answer','dot':'advisor'})
    guards=[]
    async def unavailable(*args):
        guards.append(args);raise ConversationError('upstream_unavailable','Safety provider unavailable',502)
    monkeypatch.setattr(business_agent.guard,'check',unavailable)
    with pytest.raises(ConversationError) as exc:asyncio.run(business_agent.run('A package within my budget',{}))
    assert exc.value.code=='upstream_unavailable' and len(guards)==1 and not calls

def test_unknown_clinical_prose_is_not_saved_or_returned_by_chat_api(monkeypatch):
    from services import business_store as db
    from services.chat_sessions import conversation
    c=client(False);owner=c.get('/api/business/session').json()['user']['id']
    with db.transaction() as tx:
        tx.put('bound_synthetic','report',owner,REPORT)
        conv=conversation(tx,owner);conv['data']['report_id']='bound_synthetic';tx.put(conv['id'],'conversation',owner,conv['data'])
    script(monkeypatch,{'action':'answer','dot':'explainer','query':'glucose'},reply='Your kidneys have permanently stopped functioning [nlm-x].')
    async def stages(messages,model,**kwargs):
        if model is business_agent.Plan:return business_agent.Plan(action='answer',dot='explainer',query='glucose')
        if model is Answer:return Answer(reply='Your kidneys have permanently stopped functioning [nlm-x].')
        return EvidenceReview(supported=True,values_preserved=True,within_scope=True)
    monkeypatch.setattr(business_agent,'complete_json',stages)
    response=c.post('/api/business/chat',json={'message':'Explain this report','page':{'language':'en'}})
    assert response.status_code==200
    assert 'permanently' not in response.json()['reply'] and '17.00' in response.json()['reply']
    messages=c.get('/api/business/workspace').json()['conversation']['messages']
    assert messages[-1]['content']==response.json()['reply'] and 'permanently' not in messages[-1]['content']


@pytest.mark.parametrize('value,reference',[('4','<5'),('4','>=3'),('<5','<7'),('Negative','Negative')])
def test_comparators_and_qualitative_cells_survive_final_sanitizer(value,reference):
    r={'confirmed':True,'fields':[{**ROWS[1],'value':value,'reference':reference,'printed_flag':''}]}
    a=Answer(reply='neutral');report_binding.render(a,r,[],'en','Explain')
    validate_answer(a,[],r)
    assert a.observations[0].value==value and a.observations[0].reference==reference
    assert report_binding._cell(value) in a.reply and report_binding._cell(reference) in a.reply


def test_unbound_name_does_not_skip_later_cross_row_check():
    verdict=ocr_binding.bind_rows([dict(name='not an explicit cell',value='1'),{**FIELDS[0],'reference':'3–6'}],HTML)
    assert verdict['reject'] and verdict['reason']=='cell_not_in_its_source_row'


@pytest.mark.parametrize('flag',['H','HH','L','LL'])
def test_flag_that_conflicts_with_within_range_is_uncertain(flag):
    row={**ROWS[1],'printed_flag':flag}
    assert report_binding.row_issues([row])['b']==['flag_comparison_conflict']


def test_uncertain_report_card_status_is_unknown_after_validation(monkeypatch):
    script(monkeypatch,{'action':'answer','dot':'explainer','query':'glucose'})
    report={'confirmed':True,'fields':[{**ROWS[1],'printed_flag':'HH'}]}
    out=asyncio.run(business_agent.run('Explain',{'report':report}))
    assert out['observations'][0]['status']=='unknown'
    assert 'cannot be compared automatically' in out['reply']
    assert 'contact a doctor or a medical service promptly' in out['reply']


@pytest.mark.parametrize('shifted',[False,True])
def test_reader_verifies_fallback_at_real_read_report_boundary(monkeypatch,shifted):
    from types import SimpleNamespace
    from services import report_reader_v2 as reader
    guards=[]
    monkeypatch.setattr(reader,'provider_for',lambda slot:SimpleNamespace(enabled=True,ready=True,protocol='typhoon_ocr',model='typhoon-ocr',label='synthetic'))
    async def complete(*args,**kwargs):return HTML
    async def extraction(*args,**kwargs):return reader.Extraction(document_type='laboratory_report',fields=[{**FIELDS[0],**({'reference':'3–6'} if shifted else {})},FIELDS[1]])
    async def guard(text,direction):guards.append(direction)
    monkeypatch.setattr(reader,'complete',complete);monkeypatch.setattr(reader,'complete_json',extraction);monkeypatch.setattr(reader,'check',guard)
    if shifted:
        with pytest.raises(ConversationError) as exc:asyncio.run(reader.read_report([(b'synthetic','image/png')]))
        assert exc.value.code=='ocr_alignment_invalid' and guards==['document']
    else:
        out=asyncio.run(reader.read_report([(b'synthetic','image/png')]))
        assert out['row_alignment']['verified'] and out['fields'][0]['unit']=='10⁹/µL'
        assert not out['confirmed'] and guards==['document','document']


@pytest.mark.parametrize('block_output',[False,True])
def test_exact_policy_recovery_retains_withheld_verdict_and_output_guard(monkeypatch,block_output):
    script(monkeypatch,{'action':'answer','dot':'advisor'},reply='Published policy [rs-policy].')
    guarded=[]
    async def complete(messages,model,**kwargs):
        if model is business_agent.Plan:return business_agent.Plan(action='answer',dot='advisor')
        if model is Answer:return Answer(reply='Published policy [rs-policy].')
        return EvidenceReview(supported=False,values_preserved=False,within_scope=False)
    async def guard(text,direction,*args):
        guarded.append(direction)
        if direction=='output' and block_output:raise ConversationError('safety_blocked','Blocked',422)
    monkeypatch.setattr(business_agent,'complete_json',complete);monkeypatch.setattr(business_agent.guard,'check',guard)
    if block_output:
        with pytest.raises(ConversationError) as exc:asyncio.run(business_agent.run('What is the refund policy?',{}))
        assert exc.value.code=='safety_blocked'
    else:
        out=asyncio.run(business_agent.run('What is the refund policy?',{}))
        assert out['checks']['independent_review']=='withheld'
        assert out['checks']['answer_mode']=='verification_recovery'
        assert out['checks']['policy_binding']['fields']==['refund_policy']
        assert out['sources'][0]['id']=='rs-policy' and '[rs-policy]' in out['reply']
        assert 'Only the original published policy' in out['reply'] and out['action'] is None
    assert guarded[-1]=='output'



def test_confirming_raw_cells_cannot_reenable_a_contradictory_comparison():
    from services.lab_fields_v2 import ReportField
    fields=[ReportField(name='Alpha',value='4',unit='g/L',reference='3–6',printed_flag='HH'),
            ReportField(name='Beta',value='7',unit='g/L',reference='3–6',printed_flag='H')]
    from routers.business import normalize as confirmation_normalize
    rows=confirmation_normalize(fields)
    assert rows[0]['status']=='unknown' and rows[0]['printed_flag']=='HH'
    assert rows[0]['reference']=='3–6' and rows[1]['status']=='high'
