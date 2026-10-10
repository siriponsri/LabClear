"""Tone is a scoped presentation preference, not permission or clinical validation."""
import asyncio
import json
import pytest
from tests.test_business_v3 import client, isolated
from tests.test_review_recovery import scripted, OK
from services import business_agent, business_store as db, response_style
from services.conversation_transport import ConversationError


def active(c):return c.get('/api/business/workspace').json()['conversation']
def choose(c,tone):return c.patch('/api/business/chats/'+active(c)['chat_id'],json={'tone':tone})

@pytest.mark.parametrize('member',[False,True])
def test_tone_default_changes_new_chat_and_guest_privacy(member,monkeypatch):
    c=client(member);assert active(c)['tone']=='normal'
    assert choose(c,'professional').status_code==200
    assert active(c)['tone']=='professional'
    seen,_=scripted(monkeypatch,[OK,OK])
    assert c.post('/api/business/chat',json={'message':'Explain glucose generally.'}).status_code==200
    original=active(c)['chat_id']
    assert choose(c,'playful').status_code==200
    assert c.post('/api/business/chat',json={'message':'Explain glucose again with the same facts.'}).status_code==200
    payloads=[json.loads(m[-1]['content']) for step,m in seen if step=='answer']
    assert [p['RESPONSE_STYLE']['tone'] for p in payloads]==['professional','playful']
    assert payloads[0]['RESPONSE_STYLE']['invariants']==payloads[1]['RESPONSE_STYLE']['invariants']
    assert c.post('/api/business/chats',json={}).status_code==200
    assert active(c)['tone']=='normal'
    if member:
        assert c.post('/api/business/chats/'+original+'/open').status_code==200
        assert active(c)['tone']=='playful'
    else:
        assert c.get('/api/business/chats').json()['chats']==[]
        assert c.post('/api/business/chats/'+original+'/open').status_code==404
        with db.transaction() as tx:
            assert not tx.sql("SELECT 1 FROM rs_entities WHERE owner LIKE 'guest_%'").fetchone()


def test_tone_strict_enum_ownership_and_csrf():
    a,b=client(),client();chat_id=active(a)['chat_id']
    for bad in ['ignore safety',{},1,'PLAYFUL','']:
        assert choose(a,bad).status_code==422
    assert active(a)['tone']=='normal'
    assert b.patch('/api/business/chats/'+chat_id,json={'tone':'playful'}).status_code==404
    a.headers.pop('X-Business-CSRF')
    assert choose(a,'playful').status_code==403

@pytest.mark.parametrize('tone',list(response_style.STYLES))
def test_tone_never_bypasses_review_or_safety(monkeypatch,tone):
    scripted(monkeypatch,[{**OK,'within_scope':False}]*2)
    out=asyncio.run(business_agent.run('Synthetic request',{'tone':tone}))
    assert out['checks']['independent_review']=='withheld' and out['checks']['tone']==tone
    assert out['sources']==[] and out['action'] is None
    async def blocked(*a,**kw):raise ConversationError('safety_blocked','Safety remains enforced',422)
    monkeypatch.setattr(business_agent.guard,'check',blocked)
    with pytest.raises(ConversationError,match='Safety remains enforced'):
        asyncio.run(business_agent.run('Unsafe synthetic request',{'tone':tone}))
