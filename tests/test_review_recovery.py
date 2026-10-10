"""Synthetic, network-isolated contract tests, not evidence of live model quality."""
import asyncio
import json
import logging
import pytest
from services import business_agent, review_policy, execution, runtime_skills
from services.conversation_agent import Answer, EvidenceReview
from services.conversation_transport import ConversationError
from tests.test_business_v3 import isolated, client  # noqa: F401
from tests.test_business_dots import script, REPORT
from config import settings


def scripted(monkeypatch, reviews, replies=None):
    script(monkeypatch, {'action':'answer','query':'glucose','dot':'explainer'})
    verdicts=iter(reviews); drafts=iter(replies or ['Reference intervals vary by laboratory [nlm-x].']*2)
    seen=[]; guarded=[]
    async def complete(messages, model, **kw):
        seen.append((kw['step'],messages))
        if model is business_agent.Plan:
            return business_agent.Plan(action='clarify' if 'no range yet' in messages[-1]['content'] else 'answer',dot='explainer',query='glucose',language='English')
        if model is Answer:return Answer(reply=next(drafts))
        return EvidenceReview(**next(verdicts))
    async def guard(text,direction,*args):guarded.append((direction,text))
    monkeypatch.setattr(business_agent,'complete_json',complete)
    monkeypatch.setattr(business_agent.guard,'check',guard)
    return seen,guarded

OK=dict(supported=True,values_preserved=True,within_scope=True)

@pytest.mark.parametrize('field,code',[('supported','evidence_not_supported'),('values_preserved','report_values_not_preserved'),('within_scope','outside_allowed_scope')])
def test_rejection_logs_only_codes_and_never_publishes_draft(monkeypatch,caplog,field,code):
    verdict={**OK,field:False}
    seen,guarded=scripted(monkeypatch,[verdict,verdict],['PRIVATE_CANARY_742']*2)
    token=execution.REQUEST_ID.set('req_synthetic_review')
    try:
        with caplog.at_level(logging.INFO):out=asyncio.run(business_agent.run('Explain the test',{'report':REPORT}))
    finally:execution.REQUEST_ID.reset(token)
    assert out['checks']['independent_review']=='withheld'
    assert out['checks']['reason_codes']==[code]
    assert out['checks']['answer_mode']=='verification_recovery'
    assert out['sources']==out['observations']==[] and out['action'] is None
    assert 'PRIVATE_CANARY_742' not in out['reply']+caplog.text
    assert 'req_synthetic_review' in caplog.text and code in caplog.text
    assert len([x for x in seen if x[0]=='review'])==2
    assert guarded[-1][0]=='output' and 'PRIVATE_CANARY_742' not in guarded[-1][1]
    assert 'does not mean you left information out' in out['reply']
    assert not any(t['label']=='Second review passed' for t in out['trace'])


def test_repaired_answer_still_requires_all_checks(monkeypatch):
    _,guarded=scripted(monkeypatch,[{**OK,'supported':False},OK])
    out=asyncio.run(business_agent.run('What is a reference interval?',{}))
    assert out['checks']['independent_review']=='passed' and out['checks']['rewrite_count']==1
    assert out['checks']['answer_mode']=='answer' and out['sources']
    assert guarded[-1][0]=='output'


def test_reviewer_gets_same_clarified_context_as_writer(monkeypatch):
    seen,_=scripted(monkeypatch,[OK])
    history=[{'role':'user','content':'Synthetic glucose example 101 mg/dL; how do I read it?'},
             {'role':'assistant','content':'What interval is printed in this synthetic example?'},
             {'role':'user','content':'70-99 mg/dL; please explain generally, no personal details.'}]
    asyncio.run(business_agent.run('That is all the context; explain the comparison.',{'history':history}))
    writer=next(messages for step,messages in seen if step=='answer')
    review=next(messages for step,messages in seen if step=='review')
    assert writer[1:-1]==history
    assert json.loads(review[-1]['content'])['conversation']==history


def test_multi_turn_clarification_uses_reply_without_loop(monkeypatch):
    seen,_=scripted(monkeypatch,[OK,OK],['Which reference interval is printed? You can use a synthetic example.',
                                        'Reference intervals vary by laboratory [nlm-x].'])
    c=client(False)
    one=c.post('/api/business/chat',json={'message':'Explain a synthetic glucose example with no range yet.'})
    assert one.status_code==200
    two=c.post('/api/business/chat',json={'message':'Use the synthetic interval 70-99 mg/dL. General explanation only.'})
    assert two.status_code==200
    messages=c.get('/api/business/workspace').json()['conversation']['messages']
    replies=[m['content'] for m in messages if m['role']=='assistant']
    assert replies[-1]=='Reference intervals vary by laboratory [nlm-x].'
    assert sum('Which reference interval' in x for x in replies)==1
    reviews=[json.loads(msg[-1]['content']) for step,msg in seen if step=='review']
    assert any('no range yet' in x['content'] for x in reviews[-1]['conversation'])


def test_sufficient_context_answers_without_rewrite(monkeypatch):
    seen,_=scripted(monkeypatch,[OK])
    out=asyncio.run(business_agent.run('What is a printed reference interval? Explain generally.',{}))
    assert out['checks']['rewrite_count']==0 and out['checks']['answer_mode']=='answer'
    assert [s for s,_ in seen]==['plan','answer','review']


def test_output_safety_failure_still_blocks_recovery(monkeypatch):
    scripted(monkeypatch,[{**OK,'supported':False}]*2)
    async def guard(text,direction,*args):
        if direction=='output':raise ConversationError('safety_blocked','Blocked',422)
    monkeypatch.setattr(business_agent.guard,'check',guard)
    with pytest.raises(ConversationError,match='Blocked'):asyncio.run(business_agent.run('Explain',{}))


def test_critical_notice_survives_withheld_explanation(monkeypatch):
    scripted(monkeypatch,[{**OK,'supported':False}]*2)
    report={**REPORT,'fields':[{**REPORT['fields'][0],'printed_flag':'HH'}]}
    out=asyncio.run(business_agent.run('Explain this report',{'report':report}))
    assert 'contact a doctor or a medical service promptly' in out['reply']
    assert out['observations']==[]


def test_skill_integrity_and_role_boundaries_remain(monkeypatch):
    monkeypatch.setattr(settings,'RUNTIME_SKILLS_ENABLED',True)
    role={'actions':['answer','clarify'],'reads':['medical','report']}
    skill=runtime_skills.select(role,'answer',True,{'public_education'})
    assert 'may decline personal details' in skill['instructions']
    assert 'never joke about results' in skill['instructions']
    assert 'package-advice' not in [m['id'] for m in skill['modules']]
    assert all(m['sha256'] for m in skill['modules'])


def test_offline_provider_recognizes_current_reviewer_prompt():
    from tests.benchmark.doubles import _stage
    assert _stage(review_policy.REVIEW, []) == 'reviewer'


def test_invalid_review_schema_never_logs_values(caplog):
    from services.conversation_agent import parse_model
    with caplog.at_level(logging.WARNING), pytest.raises(ConversationError):
        parse_model(json.dumps({'supported':{'PRIVATE_SCHEMA_CANARY':'hidden'},'values_preserved':True,'within_scope':True}),EvidenceReview,'review')
    assert 'bool_type' in caplog.text and 'supported' in caplog.text
    assert 'PRIVATE_SCHEMA_CANARY' not in caplog.text and 'hidden' not in caplog.text


def test_invalid_review_does_not_trigger_another_writer(monkeypatch):
    seen,_=scripted(monkeypatch,[OK])
    original=business_agent.complete_json
    async def invalid_review(messages,model,**kw):
        if kw['step']=='review':raise ConversationError('answer_invalid','Review format invalid',502)
        return await original(messages,model,**kw)
    monkeypatch.setattr(business_agent,'complete_json',invalid_review)
    with pytest.raises(ConversationError,match='Review format invalid'):
        asyncio.run(business_agent.run('Explain glucose generally',{}))
    assert [step for step,_ in seen].count('answer')==1
