"""Guest privacy contract and in-flight deletion. Providers are test doubles."""
import asyncio
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from main import app
from routers import business
from services import business_store as db, guest_memory as gm
from services.chat_sessions import conversation
from services.conversation_transport import ConversationError
from tests.test_business_v3 import client, isolated  # noqa: F401

API='/api/business'


def owner(c):return c.get(API+'/session').json()['user']['id']
def close(c):return c.post(API+'/guest/close',json={'guest_token':c.headers['X-LabClear-Guest'],'csrf':c.headers['X-Business-CSRF']})
def seed(uid):
    with db.transaction() as tx:
        c=conversation(tx,uid);c['data']['messages']=[business.msg('user','PRIVATE-GUEST-TEXT')]
        tx.put(c['id'],'conversation',uid,c['data'])
        tx.put('report_'+uid,'report',uid,{'original':'PRIVATE-IMAGE','fields':[]})


def test_guest_state_never_enters_sql_and_new_page_cannot_recover_it():
    c=client(False);uid=owner(c);seed(uid)
    assert not c.cookies.get(business.COOKIE)
    assert c.get(API+'/workspace').json()['conversation']['messages'][0]['content']=='PRIVATE-GUEST-TEXT'
    assert c.get(API+'/chats').json()['chats']==[]
    assert c.post(API+'/projects',json={'name':'Secret'}).status_code==409
    with db.transaction() as tx:
        assert not tx.sql('SELECT id FROM rs_entities WHERE owner=?',(uid,)).fetchall()
    new=TestClient(app);assert new.get(API+'/workspace').status_code==401
    assert new.get(API+'/session').json()['user']['id']!=uid
    assert c.get(API+'/me').json()['user'] is None
    assert close(c).status_code==200
    with db.transaction() as tx:assert tx.get(uid) is None and tx.get('report_'+uid) is None
    assert c.get(API+'/workspace').status_code==401


def test_guest_close_checks_csrf_origin_and_is_idempotent():
    c=client(False);uid=owner(c);seed(uid)
    body={'guest_token':c.headers['X-LabClear-Guest'],'csrf':'x'*24}
    assert c.post(API+'/guest/close',json=body).status_code==403
    body['csrf']=c.headers['X-Business-CSRF']
    assert c.post(API+'/guest/close',json=body,headers={'Origin':'https://evil.invalid'}).status_code==403
    assert c.get(API+'/workspace').status_code==200
    assert close(c).status_code==200 and close(c).status_code==200


def test_guest_ownership_and_staff_handoff_do_not_persist_content():
    c=client(False);uid=owner(c);seed(uid);other=client(False)
    assert other.get(API+'/reports/report_'+uid).status_code==404
    assert c.post(API+'/handoffs',json={'summary':'PRIVATE-GUEST-TEXT'}).status_code==409
    with db.transaction() as tx:assert tx.find('ticket')==[] and tx.find('notification')==[]


@pytest.mark.parametrize('method',['register','login'])
def test_auth_discards_guest_and_preserves_existing_account_history(method):
    account=client(email='kept@test.invalid');signed=owner(account);seed(signed)
    c=client(False);guest=owner(c);seed(guest)
    email='new@test.invalid' if method=='register' else 'kept@test.invalid'
    r=c.post(API+'/'+method,json={'email':email,'password':'coursework-test-password'})
    assert r.status_code==200,r.text
    c.headers['X-Business-CSRF']=r.json()['csrf']
    uid=r.json()['user']['id'];assert uid!=guest and uid.startswith('customer_')
    w=c.get(API+'/workspace').json()
    assert bool(w['conversation']['messages']) == (method=='login')
    with db.transaction() as tx:
        assert tx.get(guest) is None and tx.get('report_'+guest) is None
        assert tx.get('report_'+signed) is not None
    assert c.get(API+'/session').json()['guest_token']==''


def test_new_guest_chat_discards_old_reports_and_keeps_page_quota():
    c=client(False);uid=owner(c);seed(uid)
    with db.transaction() as tx:
        u=tx.get(uid);u['data']['ai_reads_used']=1;tx.put(uid,'user',uid,u['data'])
    assert c.post(API+'/new-chat',json={}).status_code==200
    w=c.get(API+'/workspace').json()
    assert w['conversation']['messages']==[] and w['reports']==[] and w['plan']['ai_reads_used']==1
    assert c.get(API+'/history').json()['conversations']==[]


def test_guest_expiry_and_rollback_do_not_restore_rows():
    c=client(False);uid=owner(c);seed(uid)
    with pytest.raises(RuntimeError):
        with db.transaction() as tx:
            tx.put('report_rollback','report',uid,{'original':'never committed'})
            raise RuntimeError('rollback')
    with db.transaction() as tx:assert tx.get('report_rollback') is None
    with gm.LOCK:gm.OWNERS[uid]=time.time()-1
    assert c.get(API+'/workspace').status_code==401
    with db.transaction() as tx:
        assert tx.get(uid) is None
        with pytest.raises(ConversationError):tx.put('report_late','report',uid,{})


def test_legacy_purge_removes_only_unregistered_web_guests_and_their_notices():
    # Seed the pre-3.0.2 format, then explicitly rerun the deployment migration.
    with db.transaction() as tx:
        for uid,data in [('customer_old',{'password':''}),('customer_signed',{'password':'hash'}),('customer_google',{'password':'!google','google_sub':'g'}),('customer_line',{'password':'','line_verified':True})]:
            tx.put(uid,'user',uid,data);seed_data={'messages':['private old']};tx.put('conversation_'+uid,'conversation',uid,seed_data)
        tx.put('notice_old','notification','staff:all',{'ref':'conversation_customer_old','body':'private old'})
        tx.delete('migration_guest_privacy_302')
    db._PURGED.clear()
    with db.transaction() as tx:
        assert tx.get('customer_old') is None and tx.get('notice_old') is None
        assert all(tx.get(uid) for uid in ('customer_signed','customer_google','customer_line'))


def test_late_ai_result_after_close_cannot_recreate_guest(monkeypatch):
    c=client(False);uid=owner(c)
    async def run(*a,**kw):
        with db.transaction() as tx:tx.forget_guest(uid)
        return {'reply':'LATE PRIVATE REPLY','sources':[]}
    monkeypatch.setattr(business.business_agent,'run',run)
    assert asyncio.run(business.turn(uid,'PRIVATE QUESTION'))['discarded']
    with db.transaction() as tx:assert tx.get(uid) is None and tx.get('conversation_'+uid) is None


def test_late_ocr_after_close_cannot_recreate_guest(monkeypatch):
    c=client(False);uid=owner(c)
    async def read(*a,**kw):
        with db.transaction() as tx:tx.forget_guest(uid)
        return {'fields':[]}
    monkeypatch.setattr(business,'read_report',read)
    raw=Path('examples/thai_lab_reference_v3/png/01_A_Liver.png').read_bytes()
    with pytest.raises(ConversationError) as e:asyncio.run(business.read_into_chat(uid,[raw],['report.png'],'Question',True,None))
    assert e.value.code=='login_required'
    with db.transaction() as tx:assert tx.get(uid) is None and not any(r['owner']==uid for r in gm.ROWS.values())


def test_stop_during_ocr_discards_late_report_from_new_chat(monkeypatch):
    c=client();uid=owner(c)
    async def read(*a,**kw):
        assert c.post(API+'/stop',json={}).status_code==200
        assert c.post(API+'/new-chat',json={}).status_code==200
        return {'fields':[]}
    monkeypatch.setattr(business,'read_report',read)
    raw=Path('examples/thai_lab_reference_v3/png/01_A_Liver.png').read_bytes()
    assert asyncio.run(business.read_into_chat(uid,[raw],['report.png'],'Question',True,None))['discarded']
    w=c.get(API+'/workspace').json();assert w['reports']==[] and w['conversation']['messages']==[]


def test_guest_capacity_is_bounded_without_disk_fallback(monkeypatch):
    c=client(False);uid=owner(c)
    monkeypatch.setattr(gm,'MAX_BYTES',1)
    with pytest.raises(ConversationError) as e:
        with db.transaction() as tx:tx.put('too_large','report',uid,{'original':'x'*1000})
    assert e.value.code=='guest_capacity'
    with db.transaction() as tx:
        assert tx.get('too_large') is None and not tx.sql('SELECT id FROM rs_entities WHERE owner=?',(uid,)).fetchall()


def test_guest_upload_over_one_megabyte_does_not_spool_to_disk(monkeypatch):
    from starlette.datastructures import UploadFile
    original=UploadFile.read;spooled=[]
    async def inspected(self,*args,**kwargs):
        spooled.append(self.file._rolled)
        return await original(self,*args,**kwargs)
    async def read(*a,**kw):return {'fields':[]}
    monkeypatch.setattr(UploadFile,'read',inspected)
    monkeypatch.setattr(business,'read_report',read)
    c=client(False)
    raw=Path('examples/thai_lab_reference_v3/png/01_A_Liver.png').read_bytes()+b'\0'*(1500*1024)
    result=c.post(API+'/reports/read',files={'file':('large.png',raw,'image/png')})
    assert result.status_code==200,result.text
    assert spooled and not any(spooled)
