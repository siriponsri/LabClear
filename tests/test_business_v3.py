from __future__ import annotations
import asyncio,base64,hashlib,hmac,json,secrets,time
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
    assert s.post('/api/business/staff/tickets/'+t['id']+'/messages',json={'message':'Hello'}).status_code==409
    assert s.post('/api/business/staff/tickets/'+t['id']+'/state',json={'state':'staff'}).status_code==200
    assert s.post('/api/business/staff/tickets/'+t['id']+'/messages',json={'message':'A staff response'}).status_code==200
    work=c.get('/api/business/workspace').json();assert work['conversation']['messages'][-1]['role']=='staff'
    assert work['conversation']['mode']=='staff'

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
    s.post('/api/business/staff/tickets/'+t['id']+'/state',json={'state':'staff'})
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
