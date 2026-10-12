from __future__ import annotations
import asyncio,base64,copy,hashlib,hmac,json,secrets,time
from datetime import datetime,timedelta
from concurrent.futures import ThreadPoolExecutor
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from main import app
from config import settings
from services import business_store as db,business_integrations as integrations
from routers import business

@pytest.fixture(autouse=True)
def isolated(tmp_path,monkeypatch):
    with db.gm.LOCK:db.gm.ROWS.clear();db.gm.OWNERS.clear()
    db._PURGED.clear()
    for name in ['DATABASE_URL','RENDER','APP_ENV']:monkeypatch.delenv(name,raising=False)
    monkeypatch.setenv('BUSINESS_DB_PATH',str(tmp_path/'business.db'))
    monkeypatch.setenv('BUSINESS_DATA_KEY',Fernet.generate_key().decode())
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET','test-webhook-secret')
    monkeypatch.setenv('LINE_CHANNEL_SECRET','test-line-secret')
    monkeypatch.setenv('BUSINESS_PUBLIC_URL','https://example.invalid')
    monkeypatch.setattr(settings,'PROVIDER_NETWORK_ENABLED',False)
    monkeypatch.setattr(settings,'DEMO_ACCESS_CODE','')
    monkeypatch.setattr(business,'provider_authorize',lambda request:None)
    monkeypatch.setattr(business.request_rate_limiter,'allow',lambda request:True)

def client(register=True,email=None):
    c=TestClient(app);r=c.get('/api/business/session');assert r.status_code==200,r.text
    c.headers['X-LabClear-Guest']=r.json().get('guest_token','')
    c.headers['X-Business-CSRF']=r.json()['csrf']
    if register:
        r=c.post('/api/business/register',json={'email':email or secrets.token_hex(4)+'@test.invalid','password':'coursework-test-password'})
        assert r.status_code==200,r.text;c.headers['X-Business-CSRF']=r.json()['csrf']
    return c

def slot():
    dt=datetime.now(business.TZ)+timedelta(days=3)
    while dt.weekday()==6:dt+=timedelta(days=1)
    return dt.strftime('%Y-%m-%d')

def staff_confirm(booking_id):
    # Staff confirmation step added in the full business release (owner decision 2026-10-06).
    s=client();promote(s)
    r=s.post('/api/business/staff/bookings/'+booking_id+'/decision',json={'decision':'confirm'});assert r.status_code==200,r.text
    return r.json()

def confirmed(c,**kw):
    b=book(c,**kw).json();staff_confirm(b['id']);return b

def book(c,key=None,**kw):
    return c.post('/api/business/bookings',json={'package_ids':['P02'],'branch_id':'BKK01','date':slot(),'time':'09:00','idempotency_key':key or secrets.token_hex(12),**kw})

def notification_snapshot(owner):
    with db.transaction() as tx:
        return sorted((row['id'],row['state'],copy.deepcopy(row['data'])) for row in tx.find('notification',owner))

def test_business_surface_and_catalog():
    c=TestClient(app)
    for path in ['/','/app','/staff','/packages','/lab-reports']:assert c.get(path).status_code==200
    assert len(c.get('/api/business/catalog').json()['packages'])==18
    assert len(c.get('/api/business/branches').json()['branches'])==3

def test_session_is_private_and_csrf_required():
    c=client();r=c.get('/api/business/workspace');assert r.headers['cache-control']=='no-store'
    c.headers.pop('X-Business-CSRF');assert book(c).status_code==403

def test_cross_origin_rejected():
    c=client();assert c.post('/api/business/handoffs',json={'summary':'hi'},headers={'Origin':'https://evil.invalid'}).status_code==403

def test_price_tampering_and_package_validation():
    c=client();assert c.post('/api/business/quotes',json={'package_ids':['P02'],'price_thb':1}).status_code==422
    assert c.post('/api/business/quotes',json={'package_ids':['UNKNOWN']}).status_code==422
    assert c.post('/api/business/quotes',json={'package_ids':['P02']}).json()['total_thb']==1690

def test_guest_cannot_book():assert book(client(False)).status_code==409

def test_duplicate_booking_and_price():
    c=client();a=book(c,key='abcdefghijkl');b=book(c,key='abcdefghijkl')
    assert a.status_code==200,a.text;assert a.json()['id']==b.json()['id']
    assert a.json()['data']['total_thb']==1690
    assert a.json()['state']=='requested' and a.json()['data']['payment_status']=='pending'
    assert len(c.get('/api/business/workspace').json()['bookings'])==1

def test_idempotency_key_cannot_change_payload():
    c=client();assert book(c,key='abcdefghijkl').status_code==200
    assert book(c,key='abcdefghijkl',time='09:30').status_code==409

def test_capacity_serialized_across_threads():
    clients=[client() for _ in range(4)]
    with ThreadPoolExecutor(4) as pool:codes=list(pool.map(lambda c:book(c).status_code,clients))
    assert sorted(codes)==[200,200,200,409]

def test_followup_package_requires_staff():assert book(client(),package_ids=['P12']).status_code==409

def test_corporate_not_direct_checkout():assert book(client(),package_ids=['P16']).status_code==409

def test_cancel_keeps_payment_separate():
    c=client();b=book(c).json();r=c.post('/api/business/bookings/'+b['id']+'/change',json={'operation':'cancel'})
    assert r.status_code==200 and r.json()['state']=='cancelled'
    assert r.json()['data']['payment_status']=='pending'

def test_payments_reject_another_owner():
    a=client();b=book(a).json();c=client()
    assert c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'center'}).status_code==404

def test_external_payment_disabled_uses_labelled_simulator():
    c=client();b=book(c).json()
    r=c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'card'})
    assert r.status_code==409 and r.json()['code']=='awaiting_confirmation'
    staff_confirm(b['id'])
    r=c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'card'})
    assert r.status_code==200 and r.json()['mode']=='SIMULATED_INTEGRATION' and r.json()['simulator_url'].startswith('/pay/sim/')

def test_live_stripe_key_rejected(monkeypatch):
    monkeypatch.setenv('BUSINESS_EXTERNAL_ENABLED','true');monkeypatch.setenv('STRIPE_SECRET_KEY','sk_live_not-a-real-key')
    c=client();b=confirmed(c);r=c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'card'})
    assert r.status_code==503 and r.json()['code']=='sandbox_required'

def signed_event(event,stamp=None):
    raw=json.dumps(event).encode();stamp=stamp or str(int(time.time()));sig=hmac.new(b'test-webhook-secret',stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    return raw,'t='+stamp+',v1='+sig

def event_for(b,**kw):return {'id':'evt_demo','livemode':False,'type':'checkout.session.completed','data':{'object':{'id':'cs_test','metadata':{'booking_id':b['id']},'amount_total':169000,'currency':'thb','payment_status':'paid',**kw}}}

def test_signed_webhook_amount_and_replay():
    c=client();b=book(c).json()
    with db.transaction() as tx:b['data']['checkout_session_id']='cs_test';tx.put(b['id'],'booking',b['owner'],b['data'],b['state'],b['branch'])
    raw,sig=signed_event(event_for(b,amount_total=1));assert c.post('/api/business/payments/webhook',content=raw,headers={'stripe-signature':sig}).status_code==409
    raw,sig=signed_event(event_for(b));r=c.post('/api/business/payments/webhook',content=raw,headers={'stripe-signature':sig});assert r.status_code==200,r.text
    assert c.post('/api/business/payments/webhook',content=raw,headers={'stripe-signature':sig}).json()['duplicate']
    assert c.get('/api/business/workspace').json()['bookings'][0]['data']['payment_status']=='paid'

def test_unsigned_stale_and_live_events_rejected():
    c=client();raw,sig=signed_event({'id':'evt_1','livemode':True})
    assert c.post('/api/business/payments/webhook',content=raw,headers={'stripe-signature':sig}).status_code==400
    raw,sig=signed_event({'id':'evt_1','livemode':False},str(int(time.time())-400))
    assert c.post('/api/business/payments/webhook',content=raw,headers={'stripe-signature':sig}).status_code==400
    assert c.post('/api/business/payments/webhook',json={}).status_code==400

def test_staff_requires_role_and_takeover():
    c=client();assert c.get('/api/business/staff/inbox').status_code==403
    t=c.post('/api/business/handoffs',json={'summary':'Booking help'}).json()
    s=client();uid=s.get('/api/business/workspace').json()['user']['id']
    with db.transaction() as tx:
        u=tx.get(uid);u['data'].update(role='staff',branch='BKK01');tx.put(uid,'user',uid,u['data'])
    waiting=s.get('/api/business/staff/tickets/'+t['id']).json()
    claim={'expected_version':waiting['conversation']['version'],'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}
    assert s.post('/api/business/staff/tickets/'+t['id']+'/messages',json={'message':'Hello',**claim}).status_code==409
    assert s.post('/api/business/staff/tickets/'+t['id']+'/state',json={'state':'staff',**claim}).status_code==200
    active=s.get('/api/business/staff/tickets/'+t['id']).json()
    reply={'expected_version':active['conversation']['version'],'assignment_epoch':active['ticket']['data']['assignment_epoch']}
    assert s.post('/api/business/staff/tickets/'+t['id']+'/messages',json={'message':'A staff response',**reply}).status_code==200
    work=c.get('/api/business/workspace').json();assert work['conversation']['messages'][-1]['role']=='staff'
    assert work['conversation']['mode']=='staff'

def test_staff_reply_keeps_ticket_version_in_sync_after_first_response():
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Versioned staff replies'}).json()
    agent=client();promote(agent,'staff')
    waiting=agent.get('/api/business/staff/tickets/'+ticket['id']).json()
    claim={'expected_version':waiting['conversation']['version'],
           'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}
    assert agent.post('/api/business/staff/tickets/'+ticket['id']+'/state',
                      json={'state':'staff',**claim}).status_code==200

    active=agent.get('/api/business/staff/tickets/'+ticket['id']).json()
    epoch=active['ticket']['data']['assignment_epoch']
    assert agent.post('/api/business/staff/tickets/'+ticket['id']+'/messages',json={
        'message':'First staff reply','expected_version':active['conversation']['version'],
        'assignment_epoch':epoch}).status_code==200
    first=agent.get('/api/business/staff/tickets/'+ticket['id']).json()
    first_response_at=first['ticket']['data']['first_response_at']
    assert first_response_at is not None
    assert first['ticket']['data']['conversation_version']==first['conversation']['version']
    assert first['ticket']['data']['mode_epoch']==first['conversation']['mode_epoch']

    unchanged=first['conversation']['messages']
    assert agent.post('/api/business/staff/tickets/'+ticket['id']+'/messages',json={
        'message':'Stale version','expected_version':first['conversation']['version']-1,
        'assignment_epoch':epoch}).status_code==409
    assert agent.post('/api/business/staff/tickets/'+ticket['id']+'/messages',json={
        'message':'Stale assignment','expected_version':first['conversation']['version'],
        'assignment_epoch':epoch-1}).status_code==409
    after_conflicts=agent.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert after_conflicts['conversation']['messages']==unchanged
    assert after_conflicts['ticket']['data']['first_response_at']==first_response_at

    assert agent.post('/api/business/staff/tickets/'+ticket['id']+'/messages',json={
        'message':'Second staff reply','expected_version':first['conversation']['version'],
        'assignment_epoch':epoch}).status_code==200
    later=agent.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert later['ticket']['data']['conversation_version']==later['conversation']['version']
    assert later['ticket']['data']['mode_epoch']==later['conversation']['mode_epoch']
    assert later['ticket']['data']['first_response_at']==first_response_at
    assert [m['content'] for m in later['conversation']['messages'] if m['role']=='staff'][-2:]==[
        'First staff reply','Second staff reply']

def test_handoff_binds_exact_chat_and_stale_staff_mutations_fail_closed():
    c=client();c.post('/api/business/chat',json={'message':'Chat one'})
    chat=c.get('/api/business/workspace').json()['conversation']
    user_message=next(m for m in chat['messages'] if m['role']=='user')
    created=c.post('/api/business/handoffs',json={'summary':'Use chat one','selected_message_ids':[user_message['id']]});assert created.status_code==200
    ticket=created.json();assert ticket['data']['chat_id']==c.get('/api/business/workspace').json()['conversation']['chat_id']
    assert ticket['data']['mode_epoch']==ticket['data']['conversation_version']
    s=client();promote(s)
    waiting=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert waiting['conversation']['chat_id']==ticket['data']['chat_id'] and waiting['conversation']['messages']==[]
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    claimed=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert [m['id'] for m in claimed['conversation']['messages']]==[user_message['id']]
    with db.transaction() as tx:
        current=business.conversation(tx,ticket['owner']);current['data']['mode']='bot';tx.put(current['id'],'conversation',ticket['owner'],current['data'])
        business.chats.new_chat(tx,ticket['owner'])
    archived_view=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert archived_view['conversation']['chat_id']==ticket['data']['chat_id']
    assert any(m['content']=='Chat one' for m in archived_view['conversation']['messages'])
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':ticket['data']['conversation_version'],
        'assignment_epoch':ticket['data']['assignment_epoch']}).status_code==409
    c2=client();c2.post('/api/business/chat',json={'message':'Chat two'})
    ticket2=c2.post('/api/business/handoffs',json={'summary':'Use chat two'}).json()
    waiting=s.get('/api/business/staff/tickets/'+ticket2['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket2['id']+'/state',json={'state':'staff'}).status_code==422
    assert s.post('/api/business/staff/tickets/'+ticket2['id']+'/state',json={
        'state':'staff','expected_version':999,
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==409
    assert s.post('/api/business/staff/tickets/'+ticket2['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    current=s.get('/api/business/staff/tickets/'+ticket2['id']).json();epoch=current['ticket']['data']['assignment_epoch'];version=current['conversation']['version']
    legacy_reply=s.post('/api/business/staff/tickets/'+ticket2['id']+'/messages',json={'message':'Legacy payload'})
    assert legacy_reply.status_code==422
    unchanged=s.get('/api/business/staff/tickets/'+ticket2['id']).json()
    assert unchanged['conversation']['version']==version
    assert unchanged['conversation']['messages']==current['conversation']['messages']
    assert s.post('/api/business/staff/tickets/'+ticket2['id']+'/messages',json={'message':'stale','expected_version':version-1,'assignment_epoch':epoch}).status_code==409
    assert s.post('/api/business/staff/tickets/'+ticket2['id']+'/messages',json={'message':'fresh','expected_version':version,'assignment_epoch':epoch}).status_code==200
    sent=s.get('/api/business/staff/tickets/'+ticket2['id']).json()
    assert sent['ticket']['data']['conversation_version']==sent['conversation']['version']
    assert sent['ticket']['data']['mode_epoch']==sent['conversation']['mode_epoch']
    with db.transaction() as tx:
        row=tx.get(ticket2['id']);row['data']['chat_id']='chat_missing';tx.put(row['id'],'ticket',row['owner'],row['data'],row['state'],row['branch'])
    assert s.get('/api/business/staff/tickets/'+ticket2['id']).status_code==404
    assert s.post('/api/business/staff/tickets/'+ticket2['id']+'/state',json={
        'state':'resume_pending','expected_version':current['conversation']['version'],
        'assignment_epoch':current['ticket']['data']['assignment_epoch']}).status_code==404

def test_handoff_shares_only_selected_items_after_staff_claims_ticket():
    c=client();owner=c.get('/api/business/workspace').json()['user']['id']
    first=business.msg('user','SHARED_HANDOFF_MESSAGE')
    first['private_source_ids']=['must-not-leak'];first['trace']=[{'prompt':'must-not-leak'}]
    private=business.msg('assistant','UNSELECTED_PRIVATE_MESSAGE')
    with db.transaction() as tx:
        row=business.conversation(tx,owner);row['data']['messages']=[first,private]
        tx.put(row['id'],'conversation',owner,row['data'])
    selected_booking=book(c).json();private_booking=book(c).json()
    ticket=c.post('/api/business/handoffs',json={
        'summary':'A synthetic support request',
        'selected_message_ids':[first['id']],
        'selected_booking_ids':[selected_booking['id']],
    }).json()

    s=client();promote(s)
    queued=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert queued['conversation']['messages']==[] and queued['bookings']==[]
    claim={'state':'staff','expected_version':queued['conversation']['version'],
           'assignment_epoch':queued['ticket']['data']['assignment_epoch']}
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json=claim).status_code==200

    view=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert [m['content'] for m in view['conversation']['messages']]==['SHARED_HANDOFF_MESSAGE']
    assert 'private_source_ids' not in view['conversation']['messages'][0]
    assert 'trace' not in view['conversation']['messages'][0]
    assert [b['id'] for b in view['bookings']]==[selected_booking['id']]
    assert private_booking['id'] not in {b['id'] for b in view['bookings']}
    customer_view=c.get('/api/business/workspace').json()['conversation']['messages']
    assert any(m['content']=='UNSELECTED_PRIVATE_MESSAGE' for m in customer_view)

def test_handoff_rejects_message_ids_from_outside_the_current_chat_without_mutation():
    c=client();before=c.get('/api/business/workspace').json()
    response=c.post('/api/business/handoffs',json={
        'summary':'Synthetic request','selected_message_ids':['not-in-this-chat']})
    assert response.status_code==422 and response.json()['code']=='handoff_selection_invalid'
    after=c.get('/api/business/workspace').json()
    assert after['conversation']==before['conversation'] and after['tickets']==before['tickets']

def test_customer_can_requeue_ticket_after_staff_returns_chat_to_bot():
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'First request'}).json()
    before=customer.get('/api/business/workspace').json()
    duplicate=customer.post('/api/business/handoffs',json={'summary':'Duplicate while waiting'})
    assert duplicate.status_code==409 and duplicate.json()['code']=='handoff_in_progress'
    unchanged=customer.get('/api/business/workspace').json()
    assert unchanged['conversation']==before['conversation'] and unchanged['tickets']==before['tickets']

    first_staff=client();first_staff_id=promote(first_staff,'staff')
    initial=first_staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    claim={'expected_version':initial['conversation']['version'],'assignment_epoch':ticket['data']['assignment_epoch']}
    assert first_staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={'state':'staff',**claim}).status_code==200
    before=customer.get('/api/business/workspace').json()
    duplicate=customer.post('/api/business/handoffs',json={'summary':'Duplicate while staff is replying'})
    assert duplicate.status_code==409 and duplicate.json()['code']=='handoff_in_progress'
    unchanged=customer.get('/api/business/workspace').json()
    assert unchanged['conversation']==before['conversation'] and unchanged['tickets']==before['tickets']

    active=first_staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    returned=first_staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'resume_pending','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']})
    assert returned.status_code==200
    pending=customer.get('/api/business/workspace').json()
    assert pending['conversation']['mode']=='resume_pending'
    pending_ticket=next(x for x in pending['tickets'] if x['id']==ticket['id'])
    old_epoch=pending_ticket['data']['assignment_epoch']
    assert pending_ticket['state']=='resume_pending'
    assert pending_ticket['data']['conversation_version']==pending['conversation']['version']
    assert pending_ticket['data']['mode_epoch']==pending['conversation']['mode_epoch']
    bypass=customer.post('/api/business/handoffs',json={'summary':'Bypass resume choice'})
    assert bypass.status_code==409 and bypass.json()['code']=='resume_choice_required'
    unchanged=customer.get('/api/business/workspace').json()
    assert unchanged['conversation']==pending['conversation'] and unchanged['tickets']==pending['tickets']
    assert customer.post('/api/business/handoffs/'+ticket['id']+'/resume',json={
        'choice':'confirm','expected_version':pending['conversation']['version']-1,
        'assignment_epoch':old_epoch}).status_code==409
    assert client().post('/api/business/handoffs/'+ticket['id']+'/resume',json={
        'choice':'confirm','expected_version':pending['conversation']['version'],
        'assignment_epoch':old_epoch}).status_code==404
    resumed=customer.post('/api/business/handoffs/'+ticket['id']+'/resume',json={
        'choice':'confirm','expected_version':pending['conversation']['version'],
        'assignment_epoch':old_epoch})
    assert resumed.status_code==200 and resumed.json()['mode']=='bot'

    queued=customer.post('/api/business/handoffs',json={'summary':'Please connect me again'})
    assert queued.status_code==200
    assert queued.json()['id']==ticket['id']
    assert queued.json()['state']=='waiting'
    assert queued.json()['data']['assigned_to']==''
    assert queued.json()['data']['assignment_epoch']>old_epoch
    assert customer.get('/api/business/workspace').json()['conversation']['mode']=='waiting'

    second_staff=client();promote(second_staff,'staff')
    waiting=second_staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert second_staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    assert first_staff_id!=waiting['ticket']['data']['assigned_to']

def test_customer_may_keep_assigned_staff_after_resume_prompt():
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Keep assigned staff'}).json()
    s=client();staff_id=promote(s,'staff');waiting=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'resume_pending','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200
    pending=customer.get('/api/business/workspace').json();t=next(x for x in pending['tickets'] if x['id']==ticket['id'])
    kept=customer.post('/api/business/handoffs/'+ticket['id']+'/resume',json={
        'choice':'keep_staff','expected_version':pending['conversation']['version'],
        'assignment_epoch':t['data']['assignment_epoch']})
    assert kept.status_code==200 and kept.json()['state']=='staff'
    after=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert after['ticket']['data']['assigned_to']==staff_id
    assert after['conversation']['mode']=='staff'

def test_resume_pending_rejects_chat_messages_without_saving_or_running_agent(monkeypatch):
    async def fail(*args,**kwargs):raise AssertionError('Assistant must not run before customer chooses')
    monkeypatch.setattr(business.business_agent,'run',fail)
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Explicit resume choice'}).json()
    s=client();promote(s,'staff');waiting=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'resume_pending','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200
    before=customer.get('/api/business/workspace').json()['conversation']['messages']
    rejected=customer.post('/api/business/chat',json={'message':'Resume without choosing'})
    assert rejected.status_code==409 and rejected.json()['code']=='resume_choice_required'
    after=customer.get('/api/business/workspace').json()
    assert after['conversation']['messages']==before and after['conversation']['mode']=='resume_pending'

def test_resumed_ticket_does_not_block_handoff_from_a_new_chat():
    customer=client();owner=customer.get('/api/business/workspace').json()['user']['id']
    with db.transaction() as tx:
        c=business.conversation(tx,owner);c['data']['messages']=[business.msg('user','Old chat context')]
        tx.put(c['id'],'conversation',owner,c['data'])
    old=customer.post('/api/business/handoffs',json={'summary':'Old chat request'}).json()
    staff=client();promote(staff,'staff')
    waiting=staff.get('/api/business/staff/tickets/'+old['id']).json()
    assert staff.post('/api/business/staff/tickets/'+old['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=staff.get('/api/business/staff/tickets/'+old['id']).json()
    assert staff.post('/api/business/staff/tickets/'+old['id']+'/state',json={
        'state':'resume_pending','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200
    pending=customer.get('/api/business/workspace').json();old_chat_id=old['data']['chat_id']
    old_epoch=next(t for t in pending['tickets'] if t['id']==old['id'])['data']['assignment_epoch']
    resumed=customer.post('/api/business/handoffs/'+old['id']+'/resume',json={
        'choice':'confirm','expected_version':pending['conversation']['version'],
        'assignment_epoch':old_epoch})
    assert resumed.status_code==200
    assert customer.post('/api/business/new-chat').status_code==200
    fresh=customer.get('/api/business/workspace').json()
    assert fresh['conversation']['chat_id']!=old_chat_id and fresh['conversation']['mode']=='bot'

    created=customer.post('/api/business/handoffs',json={'summary':'New chat request'})
    assert created.status_code==200,created.text
    assert created.json()['id']!=old['id']
    assert created.json()['data']['chat_id']==fresh['conversation']['chat_id']
    assert created.json()['state']=='waiting'
    after=customer.get('/api/business/workspace').json()
    assert after['conversation']['mode']=='waiting'
    assert next(t for t in after['tickets'] if t['id']==old['id'])['state']=='bot'

def test_refund_request_after_resume_requeues_ticket_for_staff():
    customer=client();booking=book(customer).json()
    ticket=customer.post('/api/business/handoffs',json={'summary':'Booking support'}).json()
    staff=client();promote(staff,'staff')
    waiting=staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'resume_pending','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200
    pending=customer.get('/api/business/workspace').json()
    ticket_view=next(t for t in pending['tickets'] if t['id']==ticket['id'])
    assert customer.post('/api/business/handoffs/'+ticket['id']+'/resume',json={
        'choice':'confirm','expected_version':pending['conversation']['version'],
        'assignment_epoch':ticket_view['data']['assignment_epoch']}).status_code==200

    response=customer.post('/api/business/bookings/'+booking['id']+'/change',json={'operation':'refund_request'})
    assert response.status_code==200
    assert response.json()['id']==ticket['id'] and response.json()['state']=='waiting'
    assert booking['id'] in response.json()['data']['shared_booking_ids']
    after=customer.get('/api/business/workspace').json()
    assert after['conversation']['mode']=='waiting'
    staff_inbox=staff.get('/api/business/staff/inbox').json()
    assert next(t for t in staff_inbox['tickets'] if t['id']==ticket['id'])['state']=='waiting'

def test_report_confirmation_during_resume_prompt_is_rejected_without_mutation(monkeypatch):
    async def fail(*args,**kwargs):raise AssertionError('Assistant must not run before customer chooses')
    monkeypatch.setattr(business.business_agent,'run',fail)
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Report review'}).json()
    owner=ticket['owner'];fields=[{'name':'ALT','value':'35','unit':'U/L','reference':'0-40'}]
    with db.transaction() as tx:
        report=tx.put('report_resume_confirm','report',owner,
                      {'fields':fields,'confirmed':False,'same_person_confirmed':False,'sample':False,'warnings':[]},'draft')
        c=business.conversation(tx,owner)
        card=business.msg('assistant','Report values are ready.',kind='report_read',report_id=report['id'],
                          fields=fields,warnings=[],state='draft',question='Explain these values?',upload_id='upload_resume_confirm')
        c['data']['messages'].append(card);tx.put(c['id'],'conversation',owner,c['data'])
    staff=client();promote(staff,'staff')
    waiting=staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'resume_pending','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200

    before=customer.get('/api/business/workspace').json()
    before_report=customer.get('/api/business/reports/'+report['id']).json()
    rejected=customer.post('/api/business/chat/report/confirm',json={'message_id':card['id']})
    assert rejected.status_code==409 and rejected.json()['code']=='resume_choice_required'
    after=customer.get('/api/business/workspace').json()
    after_report=customer.get('/api/business/reports/'+report['id']).json()
    assert after['conversation']==before['conversation']
    assert after_report==before_report
    with db.transaction() as tx:
        stored_report=tx.get(report['id'])
        assert stored_report['state']=='draft' and stored_report['data']['confirmed'] is False

def test_staff_cannot_skip_resume_confirmation_or_take_closed_ticket():
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'No silent resume'}).json()
    s=client();promote(s,'staff');waiting=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=s.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'closed','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200
    closed=s.get('/api/business/staff/inbox').json()['tickets'][0]
    assert s.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':closed['data']['conversation_version'],
        'assignment_epoch':closed['data']['assignment_epoch']}).status_code==409

def _close_ticket(ticket):
    staff=client();promote(staff,'staff')
    waiting=staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    active=staff.get('/api/business/staff/tickets/'+ticket['id']).json()
    assert staff.post('/api/business/staff/tickets/'+ticket['id']+'/state',json={
        'state':'closed','expected_version':active['conversation']['version'],
        'assignment_epoch':active['ticket']['data']['assignment_epoch']}).status_code==200
    return staff

def test_closed_ticket_blocks_same_chat_and_history_reopen_but_allows_new_chat(monkeypatch):
    calls=[]
    async def answer(message,context,**kwargs):
        calls.append(message)
        return {'reply':'Offline closed-thread test answer','sources':[],'action':None}
    monkeypatch.setattr(business.business_agent,'run',answer)
    customer=client()
    assert customer.post('/api/business/chat',json={'message':'Before ticket close'}).status_code==200
    ticket=customer.post('/api/business/handoffs',json={'summary':'Closed-thread regression'}).json()
    chat_id=ticket['data']['chat_id'];_close_ticket(ticket)
    before=customer.get('/api/business/workspace').json()
    rejected=customer.post('/api/business/chat',json={'message':'Closed thread must not run assistant'})
    assert rejected.status_code==409 and rejected.json()['code']=='conversation_closed'
    after=customer.get('/api/business/workspace').json()
    assert after['conversation']==before['conversation'] and after['tickets']==before['tickets']
    assert calls==['Before ticket close']

    assert customer.post('/api/business/new-chat').status_code==200
    fresh=customer.get('/api/business/workspace').json()
    assert fresh['conversation']['chat_id']!=chat_id and fresh['conversation']['mode']=='bot'
    assert customer.post('/api/business/chat',json={'message':'New chat can use assistant'}).status_code==200
    assert calls==['Before ticket close','New chat can use assistant']
    history=customer.get('/api/business/chats').json()
    assert chat_id in {item['id'] for item in history['chats']}

    assert customer.post('/api/business/chats/'+chat_id+'/open').status_code==200
    before=customer.get('/api/business/workspace').json()
    rejected=customer.post('/api/business/chat',json={'message':'History must stay closed'})
    assert rejected.status_code==409 and rejected.json()['code']=='conversation_closed'
    after=customer.get('/api/business/workspace').json()
    assert after['conversation']==before['conversation'] and calls==['Before ticket close','New chat can use assistant']

def test_closed_ticket_rejects_report_upload_before_ocr_or_persistence(monkeypatch):
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Closed upload regression'}).json()
    _close_ticket(ticket);before=customer.get('/api/business/workspace').json();ocr_calls=[]
    async def read_report(*args,**kwargs):
        ocr_calls.append((args,kwargs))
        return {'id':'report_closed_upload','data':{'fields':[],'warnings':[]},'entitlement':{}}
    monkeypatch.setattr(business,'save_read_report',read_report)
    image=(business.DEMO_ROOT/'png'/'01_A_Liver.png').read_bytes()
    rejected=customer.post('/api/business/chat/report',data={'message':'Closed upload probe'},
                           files=[('files',('synthetic.png',image,'image/png'))])
    assert rejected.status_code==409 and rejected.json()['code']=='conversation_closed'
    after=customer.get('/api/business/workspace').json()
    assert after['conversation']==before['conversation'] and after['reports']==before['reports']
    assert not ocr_calls

def test_closed_ticket_rejects_report_confirmation_before_mutation_or_assistant(monkeypatch):
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Closed report regression'}).json()
    owner=ticket['owner'];fields=[{'name':'ALT','value':'35','unit':'U/L','reference':'0-40'}]
    with db.transaction() as tx:
        report=tx.put('report_closed_confirm','report',owner,
                      {'fields':fields,'confirmed':False,'same_person_confirmed':False,'sample':False,'warnings':[]},'draft')
        conversation=business.conversation(tx,owner)
        card=business.msg('assistant','Report values are ready.',kind='report_read',report_id=report['id'],
                          fields=fields,warnings=[],state='draft',question='Explain these values?',upload_id='upload_closed_confirm')
        conversation['data']['messages'].append(card)
        tx.put(conversation['id'],'conversation',owner,conversation['data'])
    _close_ticket(ticket);before=customer.get('/api/business/workspace').json()
    before_report=customer.get('/api/business/reports/'+report['id']).json();calls=[]
    async def answer(message,context,**kwargs):
        calls.append(message)
        return {'reply':'Offline confirmation test answer','sources':[],'action':None}
    monkeypatch.setattr(business.business_agent,'run',answer)
    rejected=customer.post('/api/business/chat/report/confirm',json={'message_id':card['id']})
    assert rejected.status_code==409 and rejected.json()['code']=='conversation_closed'
    after=customer.get('/api/business/workspace').json()
    after_report=customer.get('/api/business/reports/'+report['id']).json()
    assert after['conversation']==before['conversation'] and after_report==before_report
    assert not calls

def test_only_one_staff_claims_ticket_from_same_version():
    customer=client();ticket=customer.post('/api/business/handoffs',json={'summary':'Concurrent claim'}).json()
    staff_clients=[client(),client()]
    for c in staff_clients:promote(c,'staff')
    snapshot=staff_clients[0].get('/api/business/staff/tickets/'+ticket['id']).json()
    payload={'state':'staff','expected_version':snapshot['conversation']['version'],
             'assignment_epoch':snapshot['ticket']['data']['assignment_epoch']}
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda c:c.post('/api/business/staff/tickets/'+ticket['id']+'/state',json=payload),staff_clients))
    assert sorted(r.status_code for r in results)==[200,409]
    with db.transaction() as tx:stored=tx.get(ticket['id'])
    assert stored['state']=='staff' and stored['data']['assigned_to'] in {
        c.get('/api/business/workspace').json()['user']['id'] for c in staff_clients}

def test_staff_queue_does_not_call_llm(monkeypatch):
    async def fail(*args,**kw):raise AssertionError('Model must not run during staff mode')
    monkeypatch.setattr(business.business_agent,'run',fail)
    c=client();c.post('/api/business/handoffs',json={'summary':'Staff please'})
    assert c.post('/api/business/chat',json={'message':'Hello team'}).json()['queued_for_staff']

def test_llm_failure_does_not_create_transaction(monkeypatch):
    async def fail(*args,**kw):raise business.ConversationError('guard_unavailable','Guard unavailable')
    monkeypatch.setattr(business.business_agent,'run',fail);c=client();r=c.post('/api/business/chat',json={'message':'book anything'})
    assert r.status_code==503
    assert c.get('/api/business/workspace').json()['bookings']==[]

def test_llm_proposal_needs_explicit_confirmation(monkeypatch):
    async def agent(*args,**kw):return {'reply':'A booking preview.','sources':[],'followups':[],'action':{'type':'book','quote':db.quote(['P02']),'branch_id':'BKK01','date':slot(),'time':'09:00'}}
    monkeypatch.setattr(business.business_agent,'run',agent);c=client();r=c.post('/api/business/chat',json={'message':'Book P02'}).json()
    assert c.get('/api/business/workspace').json()['bookings']==[]
    assert c.post('/api/business/confirm',json={'action_id':r['action_id']}).status_code==200
    assert c.post('/api/business/confirm',json={'action_id':r['action_id']}).status_code==200
    assert len(c.get('/api/business/workspace').json()['bookings'])==1

def test_stop_invalidates_preview(monkeypatch):
    async def agent(*args,**kw):return {'reply':'Preview','sources':[],'action':{'type':'quote','quote':db.quote(['P01'])}}
    monkeypatch.setattr(business.business_agent,'run',agent);c=client();r=c.post('/api/business/chat',json={'message':'Quote'}).json();c.post('/api/business/stop')
    assert c.post('/api/business/confirm',json={'action_id':r['action_id']}).status_code==409

def test_report_ownership_and_encryption(tmp_path):
    c=client();uid=c.get('/api/business/workspace').json()['user']['id'];marker='sensitive-test-value-98765'
    with db.transaction() as tx:tx.put('report_a','report',uid,{'fields':[],'label':marker,'original':'not-real'},'draft')
    other=client();assert other.get('/api/business/reports/report_a').status_code==404
    assert other.delete('/api/business/reports/report_a').status_code==404
    assert 'original' not in c.get('/api/business/reports/report_a').json()['data']
    assert marker.encode() not in (tmp_path/'business.db').read_bytes()
    assert c.delete('/api/business/reports/report_a').status_code==200
    assert c.get('/api/business/reports/report_a').status_code==404

def test_report_requires_confirmation():
    c=client();uid=c.get('/api/business/workspace').json()['user']['id']
    with db.transaction() as tx:tx.put('report_a','report',uid,{'fields':[],'confirmed':False},'draft')
    assert c.post('/api/business/reports/select',json={'report_id':'report_a'}).status_code==409

def test_line_signature_and_dedup():
    c=client();payload={'events':[{'type':'message','source':{'type':'user','userId':'U_test'},'webhookEventId':'e1','replyToken':'reply','message':{'type':'text','text':'hi'}}]};raw=json.dumps(payload).encode()
    assert c.post('/api/business/line/webhook',content=raw).status_code==400
    sig=base64.b64encode(hmac.new(b'test-line-secret',raw,hashlib.sha256).digest()).decode()
    for _ in range(2):assert c.post('/api/business/line/webhook',content=raw,headers={'x-line-signature':sig}).status_code==200
    with db.transaction() as tx:assert len(tx.find('line_job'))==1

def test_line_link_single_use_and_import():
    c=client();uid=c.get('/api/business/workspace').json()['user']['id']
    with db.transaction() as tx:
        tx.put('line_guest','user','line_guest',{'role':'customer','password':'','line_verified':True});tx.put('identity','line_identity','line_guest',{'line_user_id':'U_test'})
        tx.put('report_line','report','line_guest',{'confirmed':False},'draft');url=integrations.create_link(tx,'line_guest')
    token=url.split('link=')[1]
    assert c.post('/api/business/account/line/link',json={'token':token,'consent':False}).status_code==409
    assert c.post('/api/business/account/line/link',json={'token':token,'consent':True}).status_code==200
    assert c.get('/api/business/reports/report_line').status_code==200
    assert c.post('/api/business/account/line/link',json={'token':token,'consent':True}).status_code==409

def test_cloud_requires_durable_database(monkeypatch):
    monkeypatch.setenv('RENDER','true');r=TestClient(app).get('/api/business/session');assert r.status_code==503 and r.json()['code']=='storage_setup'

def test_business_planner_is_not_keyword_router():
    import inspect
    source=inspect.getsource(business.business_agent.run)
    assert 'complete_json' in source and 'guard.check' in source
    assert 'evidence_search.search' in source

def promote(c,role='manager'):
    uid=c.get('/api/business/workspace').json()['user']['id']
    with db.transaction() as tx:
        u=tx.get(uid);u['data'].update(role=role,branch='BKK01');tx.put(uid,'user',uid,u['data'])
    return uid

def test_manager_catalog_and_stale_quote(monkeypatch):
    async def agent(*args,**kw):return {'reply':'Preview','sources':[],'action':{'type':'book','quote':db.quote(['P02']),'branch_id':'BKK01','date':slot(),'time':'09:00'}}
    monkeypatch.setattr(business.business_agent,'run',agent);c=client();r=c.post('/api/business/chat',json={'message':'Book P02'}).json()
    assert c.put('/api/business/staff/catalog/P02',json={'price_thb':1990,'active':True}).status_code==403
    s=client();promote(s);assert s.put('/api/business/staff/catalog/P02',json={'price_thb':1990,'active':True}).status_code==200
    assert c.post('/api/business/confirm',json={'action_id':r['action_id']}).status_code==409
    assert c.post('/api/business/quotes',json={'package_ids':['P02']}).json()['total_thb']==1990

def test_inactive_package_cannot_be_quoted():
    s=client();promote(s);s.put('/api/business/staff/catalog/P01',json={'price_thb':1190,'active':False})
    assert s.post('/api/business/quotes',json={'package_ids':['P01']}).status_code==422

def test_organization_quote_acceptance_and_owner():
    c=client();t=c.post('/api/business/handoffs',json={'summary':'35 people onsite'}).json();s=client();promote(s)
    waiting=s.get('/api/business/staff/tickets/'+t['id']).json()
    assert s.post('/api/business/staff/tickets/'+t['id']+'/state',json={
        'state':'staff','expected_version':waiting['conversation']['version'],
        'assignment_epoch':waiting['ticket']['data']['assignment_epoch']}).status_code==200
    r=s.post('/api/business/staff/quotes',json={'ticket_id':t['id'],'package_id':'P17','people':35,'date':slot(),'time':'09:00','venue':'Synthetic office','travel_fee_thb':500,'branch_id':'BKK01'})
    assert r.status_code==200,r.text;q=r.json();assert q['data']['total_thb']==1490*35+500
    other=client();assert other.post('/api/business/quotes/accept',json={'quote_id':q['id']}).status_code==404
    b=c.post('/api/business/quotes/accept',json={'quote_id':q['id']});assert b.status_code==200 and b.json()['data']['organization']
    assert c.post('/api/business/quotes/accept',json={'quote_id':q['id']}).json()['id']==b.json()['id']

def test_checkout_reuses_fixed_amount_and_method(monkeypatch):
    calls=[]
    async def fake(b,method):calls.append((b['data']['checkout_expires'],method));return {'session_id':'cs_test','url':'https://checkout.stripe.com/test'}
    monkeypatch.setenv('BUSINESS_EXTERNAL_ENABLED','true');monkeypatch.setenv('STRIPE_SECRET_KEY','sk_test_placeholder')
    monkeypatch.setattr(integrations,'stripe_checkout',fake);c=client();b=confirmed(c)
    r=c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'card'});assert r.status_code==200
    r2=c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'card'});assert r.json()==r2.json() and len(calls)==1
    assert c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'promptpay'}).status_code==409

def test_center_settlement_and_refund_need_role():
    c=client();b=book(c).json();s=client();promote(s)
    assert s.post('/api/business/staff/bookings/'+b['id']+'/settle').status_code==409  # not confirmed yet
    staff_confirm(b['id'])
    assert c.post('/api/business/staff/bookings/'+b['id']+'/settle').status_code==403
    assert s.post('/api/business/staff/bookings/'+b['id']+'/settle').status_code==200
    r=s.post('/api/business/staff/bookings/'+b['id']+'/refund',json={'reason':'Synthetic cancellation'})
    assert r.status_code==200 and r.json()['status']=='refunded'

def test_staff_and_clinical_cannot_settle_center_payment():
    customer=client();booking=confirmed(customer);path='/api/business/staff/bookings/'+booking['id']+'/settle'
    with db.transaction() as tx: owner=tx.get(booking['id'])['owner']
    notifications_before=notification_snapshot(owner)
    for role in ('staff','clinical'):
        actor=client();promote(actor,role)
        response=actor.post(path)
        assert response.status_code==403
        assert customer.get('/api/business/workspace').json()['bookings'][0]['data']['payment_status']=='pending'
        with db.transaction() as tx:
            row=tx.get(booking['id'])
            assert row['data']['payment_status']=='pending' and not row['data'].get('receipt_id')
            assert not any(a['data'].get('action')=='payment.center_settled' and a['data'].get('object_id')==booking['id'] for a in tx.find('audit'))
        assert notification_snapshot(owner)==notifications_before

def test_settlement_is_idempotent_and_refund_is_terminal():
    c=client();b=confirmed(c);s=client();promote(s)
    path='/api/business/staff/bookings/'+b['id']
    first=s.post(path+'/settle')
    assert first.status_code==200
    assert s.post(path+'/settle').json()['receipt_id']==first.json()['receipt_id']
    assert s.post(path+'/refund',json={'reason':'Synthetic cancellation'}).status_code==200
    assert s.post(path+'/settle').status_code==409
    assert c.post('/api/business/payments/checkout',json={'booking_id':b['id'],'method':'card'}).status_code==409
    assert c.get('/api/business/workspace').json()['bookings'][0]['data']['payment_status']=='refunded'

@pytest.mark.parametrize('status',['refunded','refund_pending'])
@pytest.mark.parametrize('event_type',['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'])
def test_delayed_stripe_events_preserve_refund_state(status,event_type):
    c=client();b=book(c).json()
    with db.transaction() as tx:
        b['data'].update(checkout_session_id='cs_test',payment_status=status)
        tx.put(b['id'],'booking',b['owner'],b['data'],b['state'],b['branch'])
    event=event_for(b);event['type']=event_type
    raw,sig=signed_event(event)
    assert c.post('/api/business/payments/webhook',content=raw,headers={'stripe-signature':sig}).status_code==200
    assert c.get('/api/business/workspace').json()['bookings'][0]['data']['payment_status']==status

def test_staff_takeover_discards_inflight_model(monkeypatch):
    async def agent(message,context,emit=None):
        with db.transaction() as tx:
            c=tx.find('conversation')[0];c['data']['mode']='staff';c['data']['version']+=1;tx.put(c['id'],'conversation',c['owner'],c['data'])
        return {'reply':'This draft must never be delivered','sources':[],'action':None}
    monkeypatch.setattr(business.business_agent,'run',agent);c=client();r=c.post('/api/business/chat',json={'message':'hello'})
    assert r.status_code==200 and r.json()['reply'] is None
    assert len(c.get('/api/business/workspace').json()['conversation']['messages'])==1

def test_worker_preserves_failed_job_without_fake_success(monkeypatch):
    from services.business_worker import once
    monkeypatch.setenv('BUSINESS_EXTERNAL_ENABLED','true')
    with db.transaction() as tx:tx.put('outbox_1','line_outbox','test',{'line_user_id':'U_test','reply':'hello','retry_key':'k','attempts':0},'pending')
    r=asyncio.run(once());assert r['failed']==1
    with db.transaction() as tx:assert tx.get('outbox_1')['state']=='failed'


def test_unlink_cancels_pending_delivery():
    c=client();uid=c.get('/api/business/workspace').json()['user']['id']
    with db.transaction() as tx:
        tx.put('line_identity','line_identity',uid,{'line_user_id':'U_test'})
        tx.put('pending_outbox','line_outbox',uid,{'reply':'private'},'pending')
    assert c.post('/api/business/account/line/unlink').status_code==200
    with db.transaction() as tx:
        assert not tx.find('line_identity',uid)
        assert tx.get('pending_outbox')['state']=='cancelled'

def test_real_medical_source_manifest_and_runtime_separation():
    from services.evidence_search import corpus,lexical
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    rows=corpus();assert len(rows)>=58
    for r in rows:assert r['data_class'] in ['public_reference','public_education']
    for r in rows:
        if r.get('source_file'):assert (root/r['source_file']).is_file() and r['source_file'].startswith('knowledge/medical_sources/raw/')
    assert any(r['id'].startswith('dr-') for r in lexical('TSH FT4 ferritin'))
