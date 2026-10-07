"""Observed round-3 failures. Scripted providers test enforcement, not model quality."""
import asyncio
import json
import pytest
from services import business_agent, answer_checks
from services.conversation_agent import Answer, EvidenceReview
from services.conversation_transport import ConversationError
from tests.test_business_v3 import isolated,client  # noqa: F401
from tests.test_business_dots import script, REPORT
from routers import business

BIZ={'id':'rs-policy','data_class':'synthetic_business'}

@pytest.mark.parametrize('text',[
    'ไม่มีบริการเจาะเลือดถึงบ้าน [rs-policy]',
    'ผลตรวจสามารถดูผ่านระบบได้ [rs-policy]',
    'Workday Check includes CBC, creatinine and ALT [rs-policy]',
])
def test_service_statements_are_not_misclassified_as_clinical(text):
    assert answer_checks.content_issues(text,[BIZ])==[]

@pytest.mark.parametrize('text',[
    'HbA1c คือค่าน้ำตาลเฉลี่ย [rs-policy]',
    'Cholesterol สูงกว่าเกณฑ์ [rs-policy]',
    'แพ็กเกจนี้ราคา 350 บาท และ HbA1c ใช้วินิจฉัยโรค [rs-policy]',
])
def test_business_sources_still_cannot_support_clinical_claims(text):
    assert 'business_source_for_medical_claim' in answer_checks.content_issues(text,[BIZ])


def test_named_package_question_is_routed_to_catalog_reader(monkeypatch):
    calls=script(monkeypatch,{'action':'answer','dot':'explainer','query':''},reply='Workday Check includes CBC [rs-p02]',evidence_ids=['rs-p02'])
    out=asyncio.run(business_agent.run('แพ็กเกจ Workday Check ตรวจอะไรบ้าง',{}))
    assert out['dot']['id']=='advisor' and out['rerouted_from']=='explainer'
    assert json.loads(calls[1][-1]['content'])['REPORT'] is None


def setup_answers(monkeypatch,answers,reviews=None):
    script(monkeypatch,{'action':'answer','query':'glucose','dot':'explainer'})
    seen=[];drafts=iter(answers);checks=iter(reviews or [True])
    async def complete(messages,model,**kw):
        seen.append(kw['step'])
        if kw['step']=='plan':return business_agent.Plan(action='answer',dot='explainer',query='glucose')
        if model is Answer:return Answer(reply=next(drafts))
        assert model is EvidenceReview
        return EvidenceReview(supported=next(checks),values_preserved=True,within_scope=True)
    monkeypatch.setattr(business_agent,'complete_json',complete)
    return seen


def test_invalid_citation_repaired_once_then_fully_reviewed(monkeypatch):
    seen=setup_answers(monkeypatch,['Glucose [invented-id]','Glucose [nlm-x]'])
    result=asyncio.run(business_agent.run('Explain glucose',{'report':REPORT}))
    assert seen==['plan','answer','answer','review']
    assert result['checks']['output_safety']=='passed' and result['sources'][0]['id']=='nlm-x'


def test_persistent_citation_error_stays_closed(monkeypatch):
    seen=setup_answers(monkeypatch,['Glucose [invented-id]']*2)
    with pytest.raises(ConversationError) as e:asyncio.run(business_agent.run('Explain glucose',{'report':REPORT}))
    assert e.value.code=='citation_invalid' and seen==['plan','answer','answer']


@pytest.mark.parametrize('second_pass',[True,False])
def test_failed_reviewer_gets_one_rewrite_without_bypassing_checks(monkeypatch,second_pass):
    seen=setup_answers(monkeypatch,['Glucose [nlm-x]']*2,[False,second_pass])
    if second_pass:assert asyncio.run(business_agent.run('Explain glucose',{'report':REPORT}))['reply']
    else:
        with pytest.raises(ConversationError) as e:asyncio.run(business_agent.run('Explain glucose',{'report':REPORT}))
        assert e.value.code=='review_failed'
    assert seen==['plan','answer','review','answer','review']


def test_input_guard_failure_never_reaches_writer(monkeypatch):
    seen=setup_answers(monkeypatch,['Glucose [nlm-x]'])
    async def unavailable(*a,**k):raise ConversationError('guard_invalid','Guard unavailable',502)
    monkeypatch.setattr(business_agent.guard,'check',unavailable)
    with pytest.raises(ConversationError):asyncio.run(business_agent.run('Explain glucose',{}))
    assert seen==[]


def test_critical_card_keeps_advice_when_explanation_is_withheld(monkeypatch):
    c=client(False);uid=c.get('/api/business/session').json()['user']['id']
    from services import business_store as db
    from services.chat_sessions import conversation
    with db.transaction() as tx:
        fields=[{**REPORT['fields'][0],'printed_flag':'HH'}]
        tx.put('report_critical','report',uid,{'fields':fields,'confirmed':False})
        conv=conversation(tx,uid)
        card=business.msg('assistant','Review',kind='report_read',state='draft',report_id='report_critical',fields=fields,question='ช่วยอ่านผล')
        conv['data']['messages']=[card];tx.put(conv['id'],'conversation',uid,conv['data'])
    async def fail(*a,**k):raise ConversationError('citation_invalid','Withheld',502)
    monkeypatch.setattr(business.business_agent,'run',fail)
    assert c.post('/api/business/chat/report/confirm',json={'message_id':card['id']}).status_code==502
    card=c.get('/api/business/workspace').json()['conversation']['messages'][0]
    assert card['critical_note']==answer_checks.NOTE_TH and card['state']=='confirmed'
