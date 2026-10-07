"""Business API. Explicit confirmations, ownership, encrypted storage and sandbox payments."""
from __future__ import annotations
from services.release_info import VERSION
import asyncio,base64,hmac,json,logging,os,re,secrets,time
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter,Request,Response,UploadFile,File,Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel,ConfigDict,Field
from services import business_store as db,business_agent,business_ops as ops,business_plans as plans,demo_accounts as demo,chat_sessions as chats
from services.chat_sessions import conversation
from services.conversation_transport import ConversationError
from services.request_limits import request_rate_limiter
from services.lab_fields_v2 import ReportField,normalize
from services.report_reader_v2 import read_report,document_images,all_images
from routers.samples import DEMOS,DEMO_ROOT,authorize as provider_authorize

router=APIRouter(prefix='/api/business'); COOKIE='labclear_session'; TZ=ZoneInfo('Asia/Bangkok')
class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
class Credentials(Strict):
    email:str=Field(min_length=5,max_length=180)
    password:str=Field(min_length=12,max_length=200)
class LoginInput(Strict):
    # Email, or the username of a demonstration account (test-01, test-02, admin).
    email:str=Field(min_length=3,max_length=180)
    password:str=Field(min_length=4,max_length=200)
class PageContext(Strict):
    path:str=Field(default='',max_length=120,pattern=r'^[A-Za-z0-9/_\-]*$')
    package_id:str=Field(default='',max_length=10,pattern=r'^[A-Z0-9]*$')
    compare_ids:list[str]=Field(default_factory=list,max_length=3)
    view:str=Field(default='',max_length=20,pattern=r'^[a-z\-]*$')
class Chat(Strict):
    message:str=Field(min_length=1,max_length=8000)
    page:PageContext|None=None
class RetryChat(Strict):message_id:str=Field(min_length=8,max_length=40)
class ActionConfirm(Strict):action_id:str=Field(min_length=1,max_length=100)
class PackageChoice(Strict):package_ids:list[str]=Field(min_length=1,max_length=5)
class Book(PackageChoice):
    branch_id:str;date:str;time:str
    idempotency_key:str=Field(min_length=12,max_length=100)
class Checkout(Strict):booking_id:str;method:str=Field(pattern='^(card|promptpay|center)$')
class ConfirmReport(Strict):
    report_id:str;fields:list[ReportField]=Field(min_length=1,max_length=60)
    label:str=Field(default='My report',max_length=80)
    collected_date:str=Field(default='',max_length=10)
    same_person_confirmed:bool=False
class ReportSelection(Strict):report_id:str
class TicketInput(Strict):summary:str=Field(min_length=1,max_length=1000)
class StaffMessage(Strict):message:str=Field(min_length=1,max_length=4000)
class TicketChange(Strict):state:str=Field(pattern='^(staff|bot|closed)$')
class LinkInput(Strict):token:str=Field(min_length=20,max_length=100);consent:bool
class BookingChange(Strict):operation:str=Field(pattern='^(cancel|refund_request|reschedule)$');date:str='';time:str=''

def origin(request):
    from urllib.parse import urlparse
    value=request.headers.get('origin')
    if request.headers.get('sec-fetch-site')=='cross-site' or (value and urlparse(value).netloc!=request.headers.get('host')):
        raise ConversationError('origin_rejected','Use this website to continue.',403)
    if not request_rate_limiter.allow(request):raise ConversationError('rate_limited','Please wait before trying again.',429)

def session_row(tx,request,mutation=True):
    origin(request)
    token=request.cookies.get(COOKIE,'');r=tx.get('session_'+db.digest(token)) if token else None
    if not r or r['data']['expires']<time.time():raise ConversationError('login_required','Your session expired. Reload or sign in.',401)
    if mutation and not hmac.compare_digest(request.headers.get('X-Business-CSRF',''),r['data']['csrf']):raise ConversationError('csrf_rejected','Reload this page before continuing.',403)
    u=tx.get(r['owner'])
    if not u or demo.blocked(u):raise ConversationError('login_required','Please sign in.',401)
    return u,r

def set_session(tx,response,user_id):
    token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(24)
    tx.put('session_'+db.digest(token),'session',user_id,{'csrf':csrf,'expires':time.time()+86400,'auth_at':time.time() if tx.get(user_id)['data'].get('password') else 0})
    response.set_cookie(COOKIE,token,httponly=True,secure=db.cloud(),samesite='strict',max_age=86400,path='/')
    return csrf

def google_sign_in():
    """Sign in with Google is offered when its OAuth client is configured (routers/google_auth.py)."""
    return bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET'))

def staff(tx,request):
    u,_=session_row(tx,request,request.method!='GET')
    if u['data'].get('role') not in ['staff','manager','clinical']:raise ConversationError('forbidden','Staff access required.',403)
    return u

def staff_ticket(tx,request,id):
    u=staff(tx,request);t=tx.get(id)
    if not t or t['kind']!='ticket' or (u['data'].get('role')!='manager' and t['branch'] not in ['',u['data'].get('branch')]):raise ConversationError('not_found','This ticket is unavailable.',404)
    return u,t

def msg(role,text,**kw):return {'id':secrets.token_hex(12),'role':role,'content':text,'at':time.time(),**kw}

def booking_create(tx,owner,payload):
    u=tx.get(owner)
    if not u['data'].get('password') and not u['data'].get('line_verified'):raise ConversationError('account_required','Create an account before confirming a booking.',409)
    id='booking_'+db.digest(owner+':'+payload.idempotency_key)
    old=tx.get(id)
    fingerprint=db.digest(json.dumps(payload.model_dump(exclude={'idempotency_key'}),sort_keys=True))
    if old:
        if old['data'].get('request_hash')!=fingerprint:raise ConversationError('idempotency_conflict','This confirmation was already used for a different booking.',409)
        return old
    q=db.quote(payload.package_ids,tx)
    if q['staff_review_required']:raise ConversationError('staff_review','A staff review is required before booking these follow-up services.',409)
    branch=next((b for b in db.branches(tx)['branches'] if b['id']==payload.branch_id),None)
    if branch and any(payload.branch_id not in p.get('branch_ids',[payload.branch_id]) for p in db.catalog(tx)['packages'] if p['id'] in payload.package_ids):
        raise ConversationError('branch_unavailable','This health check is not offered at the selected center.',422)
    try:dt=datetime.strptime(payload.date+' '+payload.time,'%Y-%m-%d %H:%M').replace(tzinfo=TZ)
    except ValueError:raise ConversationError('slot_invalid','Choose a valid date and time.',422) from None
    now=datetime.now(TZ)
    if not branch or dt.weekday()==6 or not now<dt<now+timedelta(days=30) or dt.hour<7 or dt.hour>=16 or dt.minute not in [0,30]:raise ConversationError('slot_invalid','Choose an available half-hour slot within 30 days, Monday–Saturday, 07:00–15:30.',422)
    count=ops.used_capacity(tx,payload.branch_id,payload.date,payload.time)
    if count>=branch['capacity_per_slot']:raise ConversationError('slot_full','This time is full. Choose another time.',409)
    # Customer submission holds capacity as a request; staff confirm or decline it.
    row=tx.put(id,'booking',owner,{**q,'date':payload.date,'time':payload.time,'branch_id':payload.branch_id,'payment_status':'pending','payment_method':'center','request_hash':fingerprint,'requested_at':time.time()},'requested',payload.branch_id)
    tx.audit(owner,'booking.requested',id)
    names=', '.join(i['name'] for i in q['items'])
    ops.notify(tx,owner,'Appointment request sent',f'{names} on {payload.date} at {payload.time}. Our team will confirm it.',id,'/app?view=bookings')
    ops.notify_staff(tx,payload.branch_id,'New appointment request',f'{names} · {payload.date} {payload.time}',id,'/staff?view=operations')
    return row

def ticket_create(tx,owner,summary,pause_bot=True,extra=None):
    c=conversation(tx,owner);existing=next((x for x in tx.find('ticket',owner) if x['state']!='closed'),None)
    latest=tx.find('booking',owner)
    branch=(extra or {}).get('branch_id') or (latest[-1]['branch'] if latest else '')
    row=existing or tx.put('ticket_'+secrets.token_hex(12),'ticket',owner,{'summary':summary,'assigned_to':'',**(extra or {})},'waiting',branch)
    if existing and extra:
        existing['data'].update(extra);existing['data']['summary']=summary;row=tx.put(existing['id'],'ticket',owner,existing['data'],existing['state'],existing['branch'] or branch)
    if pause_bot and c['data']['mode']=='bot':
        c['data']['mode']='waiting';c['data']['version']+=1;tx.put(c['id'],'conversation',owner,c['data'])
    tx.audit(owner,'handoff.requested',row['id'])
    if not existing:ops.notify_staff(tx,row['branch'],'New customer request',summary[:200],row['id'],'/staff')
    return row

@router.get('/catalog')
async def get_catalog():return db.catalog()
@router.get('/branches')
async def get_branches():return {**db.branches(),'maps_embed_key':os.getenv('GOOGLE_MAPS_EMBED_KEY','')}
@router.get('/policies')
async def get_policies():return db.policies()
@router.get('/session')
async def get_session(request:Request,response:Response):
    origin(request)
    with db.transaction() as tx:
        token=request.cookies.get(COOKIE,'');s=tx.get('session_'+db.digest(token)) if token else None
        if s and s['data']['expires']>time.time():u=tx.get(s['owner']);csrf=s['data']['csrf']
        else:
            id='customer_'+secrets.token_hex(12);u=tx.put(id,'user',id,{'role':'customer','email':'','password':''});csrf=set_session(tx,response,id)
        c=conversation(tx,u['id'])
        return {'user':db.user_public(u),'csrf':csrf,'conversation':c['data'],'simulation':True,'version':VERSION,'ocr_provider':'typhoon','external_business_enabled':os.getenv('BUSINESS_EXTERNAL_ENABLED')=='true','google':google_sign_in()}

@router.get('/me')
async def me(request:Request):
    """Who is signed in, for the website header. Unlike /session it never creates a guest session."""
    origin(request)
    with db.transaction() as tx:
        token=request.cookies.get(COOKIE,'');s=tx.get('session_'+db.digest(token)) if token else None
        u=tx.get(s['owner']) if s and s['data']['expires']>time.time() else None
        signed=bool(u and u['data'].get('password') and not demo.blocked(u))
        return {'user':db.user_public(u) if signed else None,'csrf':s['data']['csrf'] if signed else '','google':google_sign_in()}

@router.post('/register')
async def register(body:Credentials,request:Request,response:Response):
    with db.transaction() as tx:
        u,s=session_row(tx,request)
        email=body.email.strip().lower()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',email):raise ConversationError('email_invalid','Enter a valid email address.',422)
        if u['data'].get('password'):raise ConversationError('account_exists','This session already has an account.',409)
        index='email_'+db.digest(email)
        if tx.get(index):raise ConversationError('registration_unavailable','Registration is unavailable for these details. Try sign in.',409)
        d={**u['data'],'email':email,'password':db.password_hash(body.password)}
        tx.put(u['id'],'user',u['id'],d);tx.put(index,'email',u['id'],{})
        tx.delete(s['id']);csrf=set_session(tx,response,u['id'])
        return {'user':db.user_public(tx.get(u['id'])),'csrf':csrf}

@router.post('/login')
async def login(body:LoginInput,request:Request,response:Response):
    origin(request)
    with db.transaction() as tx:
        bucket='auth_'+db.digest(request.client.host if request.client else 'unknown');rate=tx.get(bucket)
        d=rate['data'] if rate and rate['data']['until']>time.time() else {'attempts':0,'until':time.time()+900}
        if d['attempts']>=8:raise ConversationError('rate_limited','Too many sign-in attempts. Try later.',429)
        d['attempts']+=1;tx.put(bucket,'auth_rate','',d)
    with db.transaction() as tx:
        if demo.is_demo_name(body.email):demo.ensure(tx)
        idx=tx.get('email_'+db.digest(body.email.strip().lower()));u=tx.get(idx['owner']) if idx else None
        if not u or demo.blocked(u) or not db.verify_password(body.password,u['data'].get('password','')):raise ConversationError('login_invalid','Email or password is incorrect.',401)
        old=request.cookies.get(COOKIE,'')
        if old:tx.delete('session_'+db.digest(old))
        csrf=set_session(tx,response,u['id']);return {'user':db.user_public(u),'csrf':csrf}

@router.post('/logout')
async def logout(request:Request,response:Response):
    with db.transaction() as tx:u,s=session_row(tx,request);tx.delete(s['id'])
    response.delete_cookie(COOKIE);return {'ok':True}

@router.get('/workspace')
async def workspace(request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request,False);owner=u['id'];c=conversation(tx,owner)
        reports=[{'id':r['id'],'label':r['data'].get('label','Report'),'date':r['data'].get('collected_date',''),'confirmed':r['data'].get('confirmed',False),'pages':r['data'].get('pages',1),'sample':r['data'].get('sample',False)} for r in tx.find('report',owner)]
        payments=[ops.sim_view(tx,t) for t in tx.find('payment_txn',owner)]
        unread=sum(1 for _ in tx.find('notification',owner,'unread'))
        return {'conversation':c['data'],'bookings':tx.find('booking',owner),'tickets':tx.find('ticket',owner),'quotes':tx.find('corporate_quote',owner),'reports':reports,'user':db.user_public(u),'payments':payments,'unread_notifications':unread,'inquiries':tx.find('org_inquiry',owner),'plan':plans.entitlement(tx,owner),'chats':chats.listing(tx,owner),'line_linked':bool(tx.find('line_identity',owner))}

RETRYABLE={'service_unavailable','price_invalid','provider_response_invalid','answer_invalid','citation_invalid','review_failed','guard_invalid','provider_rejected','storage_unavailable'}
async def turn(owner,message,retry_id='',page=None,emit=None,reply_to=''):
    """One assistant turn on the active chat.

    retry_id: re-run the last failed user message. reply_to: answer the question that came with
    an uploaded report, right after the customer confirmed its values (no new user message)."""
    if not message.strip() and not retry_id and not reply_to:raise ConversationError('empty_message','Type a message.',422)
    turn_id=secrets.token_hex(16)
    with db.transaction() as tx:
        c=conversation(tx,owner);d=c['data']
        if d.get('busy_until',0)>time.time():raise ConversationError('busy','Please wait for the previous message.',409)
        last=d['messages'][-1] if d['messages'] else None
        if reply_to:
            card=last if last and last['id']==reply_to and last.get('kind')=='report_read' else None
            if not card or card.get('state')!='confirmed':raise ConversationError('retry_unavailable','Confirm the report values first, or ask a new question.',409)
            for k in ('failed','error','error_message'):card.pop(k,None)
            message=card.get('question') or message
            target_id=reply_to;earlier=[x for x in d['messages'] if x['id'] not in (reply_to,card.get('upload_id'))]
        elif retry_id:
            # Retry re-runs the last failed user message; it is never appended twice.
            if not last or last['id']!=retry_id or last['role']!='user' or not last.get('failed') or not last.get('retryable'):raise ConversationError('retry_unavailable','Only the latest unanswered message can be retried.',409)
            for k in ('failed','error','error_message'):last.pop(k,None)
            message=last['content'];target_id=retry_id;earlier=d['messages'][:-1]
        else:
            d['messages']=(d['messages']+[msg('user',message)])[-100:]
            if not d.get('title'):d['title']=chats.title_from(message)
            target_id=d['messages'][-1]['id'];earlier=d['messages'][:-1]
        d['updated']=time.time()
        if d['mode']!='bot':tx.put(c['id'],'conversation',owner,d);return {'reply':None,'queued_for_staff':True}
        version=d['version'];d['busy_until']=time.time()+240;d['turn_id']=turn_id;tx.put(c['id'],'conversation',owner,d)
        report=tx.own(d['report_id'],owner,'report')['data'] if d.get('report_id') else None
        history=[{'role':'assistant' if x['role']=='staff' else x['role'],'content':x['content']} for x in earlier if x.get('content') and x.get('kind')!='report_read'][-12:]
        context={'history':history,'report':report if report and report.get('confirmed') else None,'previous_reports':[], 'customer_state':{'bookings':[{'id':b['id'],**b['data'],'status':b['state']} for b in tx.find('booking',owner)[-5:]]},'page':page or {},'explain_report':bool(reply_to)}
        # Reports stay private, only explicitly selected comparison context is sent.
        other=d.get('compare_report_id')
        if other and other!=d.get('report_id'):
            r=tx.own(other,owner,'report')['data']
            if r.get('confirmed') and r.get('same_person_confirmed'):context['previous_reports']=[{k:v for k,v in r.items() if k not in ['original','extra_originals','media_type']}]
        if context['report']:context['report']={k:v for k,v in context['report'].items() if k not in ['original','extra_originals','media_type']}
    try:
        async with asyncio.timeout(220):result=await business_agent.run(message,context,**({'emit':emit} if emit else {}))
        with db.transaction() as tx:
            c=conversation(tx,owner);d=c['data']
            if d['version']!=version or d['mode']!='bot' or d.get('turn_id')!=turn_id:return {'reply':None,'queued_for_staff':True}
            if result.get('action'):
                aid='action_'+secrets.token_hex(16);tx.put(aid,'action',owner,{'action':result['action'],'expires':time.time()+600,'version':version},'pending');result['action_id']=aid
            # Observations were matched exactly against the confirmed report by validate_answer; keep them with the turn.
            rows={f.get('id'):f for f in ((context.get('report') or {}).get('fields') or [])}
            observations=[{**o,'name':rows.get(o.get('field_id'),{}).get('name','')} for o in (result.get('observations') or [])]
            d['messages']=(d['messages']+[msg('assistant',result['reply'],sources=result['sources'],observations=observations,action=result.get('action'),action_id=result.get('action_id'),followups=result.get('followups',[]),dot=result.get('dot'),ui=result.get('ui',[]),checks=result.get('checks'),trace=result.get('trace',[]))])[-100:]
            d['busy_until']=0;d['updated']=time.time();tx.put(c['id'],'conversation',owner,d)
        return result
    except ConversationError as exc:
        with db.transaction() as tx:
            c=conversation(tx,owner)
            if c['data'].get('turn_id')==turn_id and c['data']['version']==version:
                for m in c['data']['messages']:
                    if m['id']==target_id:m['failed']=True;m['error']=exc.code;m['error_message']=exc.message[:300];m['retryable']=exc.code in RETRYABLE
                tx.put(c['id'],'conversation',owner,c['data'])
        raise
    finally:
        with db.transaction() as tx:
            c=conversation(tx,owner)
            if c['data'].get('turn_id')==turn_id:c['data']['busy_until']=0;tx.put(c['id'],'conversation',owner,c['data'])

log=logging.getLogger('labclear.chat')
_BACKGROUND=set()

def streamed(request,run):
    """Run a turn. With Accept: application/x-ndjson the steps stream as they happen (one JSON
    object per line) and the result or error arrives last; otherwise the plain JSON result."""
    if 'application/x-ndjson' not in request.headers.get('accept',''):return run(None)
    queue=asyncio.Queue()
    async def emit(event):await queue.put(event)
    async def work():
        try:await queue.put({'type':'done','result':await run(emit)})
        except ConversationError as exc:await queue.put({'type':'error','code':exc.code,'message':exc.message,'status':exc.status})
        except Exception:
            log.exception('streamed_turn_failed')
            await queue.put({'type':'error','code':'server_error','message':'Something went wrong on our side. Please try again.','status':500})
        finally:await queue.put(None)
    async def lines():
        # The work keeps running if the browser disconnects; Stop bumps the chat version so a
        # late answer is not added.
        task=asyncio.create_task(work());_BACKGROUND.add(task);task.add_done_callback(_BACKGROUND.discard)
        while (item:=await queue.get()) is not None:yield json.dumps(item,ensure_ascii=False)+'\n'
    async def response():
        return StreamingResponse(lines(),media_type='application/x-ndjson',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})
    return response()

@router.post('/chat')
async def chat(body:Chat,request:Request):
    provider_authorize(request)
    with db.transaction() as tx:u,_=session_row(tx,request)
    page=body.page.model_dump() if body.page else None
    if page:page['compare_ids']=[i for i in page['compare_ids'] if re.fullmatch(r'P\d{2}',i)]
    return await streamed(request,lambda emit:turn(u['id'],body.message,page=page,emit=emit))

@router.post('/chat/retry')
async def chat_retry(body:RetryChat,request:Request):
    provider_authorize(request)
    with db.transaction() as tx:u,_=session_row(tx,request)
    return await streamed(request,lambda emit:turn(u['id'],'',body.message_id,emit=emit))

@router.post('/stop')
async def stop(request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);c=conversation(tx,u['id']);c['data']['version']+=1;c['data']['busy_until']=0;tx.put(c['id'],'conversation',u['id'],c['data'])
    return {'ok':True}

@router.post('/new-chat')
async def new_chat(request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request);chats.new_chat(tx,u['id'])
    return {'ok':True}

@router.get('/history')
async def history(request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request,False);return {'conversations':tx.find('archive',u['id'])}

@router.post('/quotes')
async def create_quote(body:PackageChoice,request:Request):
    with db.transaction() as tx:session_row(tx,request)
    return db.quote(body.package_ids)

@router.get('/slots')
async def slots(branch_id:str,date:str,request:Request):
    with db.transaction() as tx:
        session_row(tx,request,False)
        branch=ops.branch(tx,branch_id)
        if not branch:raise ConversationError('branch_invalid','Unknown branch.',422)
        try:day=datetime.strptime(date,'%Y-%m-%d').replace(tzinfo=TZ)
        except ValueError:raise ConversationError('date_invalid','Use YYYY-MM-DD.',422) from None
        now=datetime.now(TZ)
        if day.weekday()==6 or day.date()<now.date() or day>now+timedelta(days=30):return {'slots':[]}
        result=[]
        for hour in range(7,16):
            for minute in [0,30]:
                tm=f'{hour:02}:{minute:02}'
                if day.replace(hour=hour,minute=minute)<=now:continue
                used=ops.used_capacity(tx,branch_id,date,tm)
                result.append({'time':tm,'available':max(0,branch['capacity_per_slot']-used),'capacity':branch['capacity_per_slot']})
        return {'slots':result,'branch_id':branch_id,'date':date,'mode':'SIMULATED_INTEGRATION'}

@router.post('/bookings')
async def book(body:Book,request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request);return booking_create(tx,u['id'],body)

@router.post('/confirm')
async def confirm(body:ActionConfirm,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);pending=tx.own(body.action_id,u['id'],'action')
        payment=pending['data']['action'] if pending['data']['action']['type']=='pay' else None
        if payment and (pending['data']['expires']<time.time() or pending['data']['version']!=conversation(tx,u['id'])['data']['version']):raise ConversationError('preview_expired','Ask for a fresh payment preview.',409)
    if payment:return await create_checkout(u['id'],payment['booking_id'],payment['method'])
    with db.transaction() as tx:
        u,_=session_row(tx,request);r=tx.own(body.action_id,u['id'],'action');a=r['data']['action'];c=conversation(tx,u['id'])
        if r['state']=='done':return r['data']['result']
        if r['data']['expires']<time.time() or r['data']['version']!=c['data']['version']:raise ConversationError('preview_expired','Ask for a fresh preview.',409)
        if a['type'] in ['book','quote'] and db.quote(a['quote']['package_ids'],tx)!=a['quote']:raise ConversationError('quote_changed','The package changed. Ask for a fresh preview before confirming.',409)
        if a['type']=='book':result=booking_create(tx,u['id'],Book(package_ids=a['quote']['package_ids'],branch_id=a['branch_id'],date=a['date'],time=a['time'],idempotency_key=body.action_id))
        elif a['type']=='handoff':result=ticket_create(tx,u['id'],a['summary'])
        elif a['type']=='quote':result={'quote':db.quote(a['quote']['package_ids'],tx)}
        else:raise ConversationError('action_invalid','This action must be completed through its secure account flow.',409)
        r['data']['result']=result;tx.put(r['id'],'action',u['id'],r['data'],'done');return result

@router.post('/bookings/{id}/change')
async def change_booking(id:str,body:BookingChange,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);b=tx.own(id,u['id'],'booking');d=b['data']
        dt=datetime.strptime(d['date']+' '+d['time'],'%Y-%m-%d %H:%M').replace(tzinfo=TZ)
        if b['state'] in ['cancelled','declined']:return b
        unpaid=d.get('payment_status')!='paid'
        if b['state']=='requested' and body.operation=='cancel' and unpaid:
            result=tx.put(id,'booking',u['id'],d,'cancelled',b['branch']);tx.audit(u['id'],'booking.cancel',id)
            ops.notify_staff(tx,b['branch'],'Appointment request withdrawn',f"{d['date']} {d['time']}",id);return result
        if d.get('organization') or body.operation=='refund_request' or dt-datetime.now(TZ)<timedelta(hours=24):
            return ticket_create(tx,u['id'],f'{body.operation} request for {id}; staff review required.',pause_bot=False)
        if body.operation=='reschedule':
            replacement=booking_create(tx,u['id'],Book(package_ids=d['package_ids'],branch_id=b['branch'],date=body.date,time=body.time,idempotency_key='reschedule-'+id+'-'+body.date+'-'+body.time))
            # Move the existing appointment only; keep its payment/order identity.
            tx.delete(replacement['id']);d.update(date=body.date,time=body.time)
            # A new slot needs a fresh staff confirmation.
            result=tx.put(id,'booking',u['id'],d,'requested',b['branch'])
            ops.notify_staff(tx,b['branch'],'Reschedule needs confirmation',f"New slot {body.date} {body.time}",id,'/staff?view=operations')
        else:
            result=tx.put(id,'booking',u['id'],d,'cancelled',b['branch'])
            ops.notify_staff(tx,b['branch'],'Appointment cancelled',f"{d['date']} {d['time']}",id)
        tx.audit(u['id'],'booking.'+body.operation,id);return result

@router.post('/handoffs')
async def handoff(body:TicketInput,request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request);return ticket_create(tx,u['id'],body.summary)

# ------------------------------------------------------------ plans, Lab Report and lab dashboard
class PlanCheckout(Strict):method:str=Field(pattern='^(card|promptpay)$')

@router.get('/plans')
async def get_plans():return plans.plans()

@router.get('/subscription')
async def get_subscription(request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request,False);return plans.entitlement(tx,u['id'])

@router.post('/subscriptions/checkout')
async def subscription_checkout(body:PlanCheckout,request:Request):
    if ops.payment_mode()!='SIMULATED_INTEGRATION':
        raise ConversationError('payment_unavailable','Plus payments run only in the payment simulator in this prototype.',409)
    with db.transaction() as tx:
        u,_=session_row(tx,request);sub=plans.start_checkout(tx,u['id'],body.method)
        txn=ops.sim_create(tx,tx.get(sub['id']),body.method)
        return {'simulator_url':'/pay/sim/'+txn['id'],'txn':ops.sim_view(tx,txn),'subscription':plans.view(tx.get(sub['id'])),'mode':'SIMULATED_INTEGRATION'}

@router.get('/reports/trends')
async def report_trends(request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request,False);return plans.trends(tx,u['id'])

@router.get('/reports/{id}/lab-report')
async def get_lab_report(id:str,request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request,False);return plans.lab_report(tx,u['id'],id)

@router.get('/reports/{id}')
async def get_report(id:str,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request,False);r=tx.own(id,u['id'],'report');r['data'].pop('original',None);r['data'].pop('extra_originals',None);return r

async def save_read_report(owner,raw,sample=False,emit=None):
    """Read one file, or up to three (Plus). A reading is reserved before any provider call and
    returned if the reader fails. Synthetic samples are free and never count."""
    raws=raw if isinstance(raw,list) else [raw]
    images=all_images(raws)
    with db.transaction() as tx:
        if len(tx.find('report',owner))>=20:raise ConversationError('report_limit','Remove an old report before adding another.',409)
        if not sample:plans.require_read(tx,owner,len(images));plans.count_read(tx,owner)
    try:report=await read_report(raws if len(raws)>1 else raws[0],**({'emit':emit} if emit else {}))
    except BaseException:
        if not sample:
            with db.transaction() as tx:plans.uncount_read(tx,owner)
        raise
    report.update(original=base64.b64encode(raws[0]).decode(),extra_originals=[base64.b64encode(r).decode() for r in raws[1:]],pages=len(images),
                  media_type='application/pdf' if raws[0].startswith(b'%PDF') else images[0][1],label='Unconfirmed report',same_person_confirmed=False,sample=sample)
    with db.transaction() as tx:
        r=tx.put('report_'+secrets.token_hex(12),'report',owner,report,'draft');tx.audit(owner,'report.read',r['id'])
        r['data'].pop('original',None);r['data'].pop('extra_originals',None);r['entitlement']=plans.entitlement(tx,owner);return r

@router.post('/reports/read')
async def upload_report(request:Request,file:UploadFile|None=File(None),files:list[UploadFile]|None=File(None)):
    provider_authorize(request)
    uploads=([file] if file else [])+list(files or [])
    if not 1<=len(uploads)<=3:raise ConversationError('file_count','Choose one to three files.',422)
    with db.transaction() as tx:u,_=session_row(tx,request)
    raws=[await f.read(3*1024*1024+1) for f in uploads]
    return await save_read_report(u['id'],raws)

@router.get('/demos')
async def demos():return {'demos':[{'id':a,'title':b,'description':c} for a,b,c,_ in DEMOS]}
@router.post('/demos/{id}/read')
async def read_demo(id:str,request:Request):
    provider_authorize(request)
    if id not in {d[0] for d in DEMOS}:raise ConversationError('not_found','Unknown demo.',404)
    with db.transaction() as tx:u,_=session_row(tx,request)
    return await save_read_report(u['id'],(DEMO_ROOT/'png'/f'{id}.png').read_bytes(),sample=True)

# ------------------------------------------------------------ reports sent in the chat
class ReportCard(Strict):message_id:str=Field(min_length=8,max_length=40)
class ReportCardConfirm(ReportCard):fields:list[ReportField]|None=Field(default=None,min_length=1,max_length=60)

def _card(d,message_id):
    card=next((m for m in d['messages'] if m['id']==message_id and m.get('kind')=='report_read'),None)
    if not card:raise ConversationError('not_found','This report card is unavailable.',404)
    return card

async def read_into_chat(owner,raws,names,question,sample,emit):
    """Read an uploaded report inside the conversation: the user's message shows the file, and
    the assistant posts the values it read. Nothing is explained until the customer confirms them."""
    with db.transaction() as tx:
        c=conversation(tx,owner);d=c['data']
        if d['mode']!='bot':raise ConversationError('staff_active','Our team has this conversation. Add the report on My reports instead.',409)
        if d.get('busy_until',0)>time.time():raise ConversationError('busy','Please wait for the previous message.',409)
    try:r=await save_read_report(owner,raws if len(raws)>1 else raws[0],sample,emit)
    except ConversationError as exc:
        with db.transaction() as tx:
            c=conversation(tx,owner);d=c['data']
            d['messages']=(d['messages']+[msg('user',question,attachments=[{'report_id':'','name':n,'kind':'file'} for n in names],failed=True,error=exc.code,error_message=exc.message[:300],retryable=False)])[-100:]
            if not d.get('title'):d['title']=chats.title_from(question) or 'Lab report'
            d['updated']=time.time();tx.put(c['id'],'conversation',owner,d)
        raise
    pages=r['data'].get('pages',1);fields=r['data'].get('fields',[])
    with db.transaction() as tx:
        c=conversation(tx,owner);d=c['data']
        upload=msg('user',question,attachments=[{'report_id':r['id'],'page':i+1,'name':names[min(i,len(names)-1)],'kind':'image','sample':sample} for i in range(pages)])
        card=msg('assistant',f'I read {len(fields)} rows from the uploaded report. They are not used until you confirm them.',kind='report_read',dot={'id':'reader','name':'Report reader'},report_id=r['id'],fields=fields,warnings=r['data'].get('warnings',[]),state='draft',question=question,upload_id=upload['id'],sample=sample)
        d['messages']=(d['messages']+[upload,card])[-100:];chats.use_report(d,r['id'])
        if not d.get('title'):d['title']=chats.title_from(question) or ('Sample report' if sample else 'Lab report')
        d['updated']=time.time();tx.put(c['id'],'conversation',owner,d);tx.audit(owner,'report.read_in_chat',r['id'])
    return {'ok':True,'report_id':r['id'],'card_id':card['id'],'rows':len(fields),'entitlement':r.get('entitlement')}

@router.post('/chat/report')
async def chat_report(request:Request,message:str=Form(default='',max_length=8000),demo_id:str=Form(default='',max_length=40),files:list[UploadFile]|None=File(None)):
    provider_authorize(request)
    uploads=list(files or [])
    if demo_id:
        found=next((d for d in DEMOS if d[0]==demo_id),None)
        if not found or uploads:raise ConversationError('not_found','Unknown sample.',404)
    elif not 1<=len(uploads)<=3:raise ConversationError('file_count','Choose one to three files.',422)
    with db.transaction() as tx:u,_=session_row(tx,request)
    if demo_id:raws,names=[(DEMO_ROOT/'png'/f'{demo_id}.png').read_bytes()],[found[1]]
    else:raws,names=[await f.read(3*1024*1024+1) for f in uploads],[re.sub(r'[^\w .()-]','',f.filename or 'report')[:80] or 'report' for f in uploads]
    return await streamed(request,lambda emit:read_into_chat(u['id'],raws,names,message.strip(),bool(demo_id),emit))

@router.post('/chat/report/confirm')
async def chat_report_confirm(body:ReportCardConfirm,request:Request):
    """One click: the values are right and the report belongs to this customer. Then answer."""
    provider_authorize(request)
    with db.transaction() as tx:
        u,_=session_row(tx,request);c=conversation(tx,u['id']);d=c['data'];card=_card(d,body.message_id)
        if card.get('state')!='draft':raise ConversationError('already_confirmed','This report was already confirmed.',409)
        if d.get('busy_until',0)>time.time():raise ConversationError('busy','Please wait for the previous message.',409)
        r=tx.own(card['report_id'],u['id'],'report')
        fields=normalize(body.fields) if body.fields else r['data'].get('fields',[])
        if not fields:raise ConversationError('no_values','No values were read from this report. Try a clearer image.',422)
        r['data'].update(fields=fields,confirmed=True,same_person_confirmed=True,label='Sample report' if r['data'].get('sample') else 'Report from chat')
        tx.put(r['id'],'report',u['id'],r['data'],'confirmed')
        card.update(state='confirmed',fields=fields,confirmed_at=time.time())
        d['report_id']=r['id'];chats.use_report(d,r['id']);d['version']+=1;tx.put(c['id'],'conversation',u['id'],d)
        tx.audit(u['id'],'report.confirmed',r['id'])
    return await streamed(request,lambda emit:turn(u['id'],'Please explain this report.',emit=emit,reply_to=body.message_id))

@router.post('/chat/report/answer')
async def chat_report_answer(body:ReportCard,request:Request):
    """Retry the answer for a confirmed report card after a failed reply."""
    provider_authorize(request)
    with db.transaction() as tx:u,_=session_row(tx,request)
    return await streamed(request,lambda emit:turn(u['id'],'Please explain this report.',emit=emit,reply_to=body.message_id))

@router.post('/chat/report/discard')
async def chat_report_discard(body:ReportCard,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);c=conversation(tx,u['id']);d=c['data'];card=_card(d,body.message_id)
        if card.get('state')!='draft':raise ConversationError('already_confirmed','Confirmed reports are removed on My reports.',409)
        r=tx.get(card['report_id'])
        if r and r['owner']==u['id'] and not r['data'].get('confirmed'):tx.delete(r['id'])
        card.update(state='discarded',fields=[]);tx.put(c['id'],'conversation',u['id'],d);tx.audit(u['id'],'report.discarded',card['report_id'])
    return {'ok':True}

@router.post('/reports/confirm')
async def confirm_report(body:ConfirmReport,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);r=tx.own(body.report_id,u['id'],'report')
        if not body.same_person_confirmed:raise ConversationError('confirmation_required','Confirm this report belongs to the person being discussed.',422)
        if body.collected_date:
            try:datetime.strptime(body.collected_date,'%Y-%m-%d')
            except ValueError:raise ConversationError('date_invalid','Use YYYY-MM-DD.',422) from None
        r['data'].update(fields=normalize(body.fields),confirmed=True,label=body.label,collected_date=body.collected_date,same_person_confirmed=True)
        tx.put(r['id'],'report',u['id'],r['data'],'confirmed');c=conversation(tx,u['id']);c['data']['report_id']=r['id'];chats.use_report(c['data'],r['id']);c['data']['version']+=1;tx.put(c['id'],'conversation',u['id'],c['data']);tx.audit(u['id'],'report.confirmed',r['id'])
    return {'ok':True}

@router.post('/reports/select')
async def select_report(body:ReportSelection,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request)
        if body.report_id:
            r=tx.own(body.report_id,u['id'],'report')
            if not r['data'].get('confirmed'):raise ConversationError('unconfirmed','Confirm report fields first.',409)
        c=conversation(tx,u['id']);c['data']['report_id']=body.report_id;chats.use_report(c['data'],body.report_id);c['data']['version']+=1;tx.put(c['id'],'conversation',u['id'],c['data'])
    return {'ok':True}

@router.post('/reports/compare')
async def compare_report(body:ReportSelection,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request)
        if body.report_id:
            r=tx.own(body.report_id,u['id'],'report')
            if not r['data'].get('confirmed'):raise ConversationError('unconfirmed','Confirm report fields first.',409)
        c=conversation(tx,u['id']);c['data']['compare_report_id']=body.report_id;chats.use_report(c['data'],body.report_id);c['data']['version']+=1;tx.put(c['id'],'conversation',u['id'],c['data'])
    return {'ok':True}

@router.delete('/reports/{id}')
async def delete_report(id:str,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);tx.own(id,u['id'],'report');tx.delete(id)
        # Chats that used this report are cleared so its values cannot reenter a conversation.
        cleared=chats.forget_report(tx,u['id'],id)
        tx.audit(u['id'],'report.deleted',id)
    return {'ok':True,'chats_cleared':cleared,'message':'Report removed, together with the chats that used it. Encrypted backup retention is managed by the deployment owner.'}

@router.get('/staff/inbox')
async def inbox(request:Request):
    with db.transaction() as tx:
        u=staff(tx,request);tickets=[t for t in tx.find('ticket') if u['data']['role']=='manager' or t['branch'] in ['',u['data'].get('branch')]]
        return {'tickets':tickets,'metrics':{'open':sum(t['state']!='closed' for t in tickets),'bookings':len(tx.find('booking')) if u['data']['role']=='manager' else None}}

@router.get('/staff/tickets/{id}')
async def ticket_view(id:str,request:Request):
    with db.transaction() as tx:
        u,t=staff_ticket(tx,request,id)
        if t['data'].get('assigned_to') not in ['',u['id']] and u['data']['role']!='manager':raise ConversationError('assigned','This case belongs to another staff member.',403)
        return {'ticket':t,'conversation':conversation(tx,t['owner'])['data'],'bookings':tx.find('booking',t['owner'])}

@router.post('/staff/tickets/{id}/state')
async def ticket_state(id:str,body:TicketChange,request:Request):
    with db.transaction() as tx:
        u,t=staff_ticket(tx,request,id)
        if t['data'].get('assigned_to') not in ['',u['id']] and u['data']['role']!='manager':raise ConversationError('assigned','Another staff member owns this case.',409)
        t['data']['assigned_to']=u['id'];tx.put(id,'ticket',t['owner'],t['data'],body.state,t['branch'])
        c=conversation(tx,t['owner']);c['data']['mode']='staff' if body.state=='staff' else 'bot';c['data']['version']+=1;c['data']['busy_until']=0
        tx.put(c['id'],'conversation',t['owner'],c['data']);tx.audit(u['id'],'handoff.'+body.state,id)
        text={'staff':('A team member joined your conversation','The assistant is paused while our team replies.'),'bot':('The assistant is back','Our team handed the conversation back to the assistant.'),'closed':('Your request was resolved','Our team closed this request. Start a new message any time.')}[body.state]
        ops.notify(tx,t['owner'],text[0],text[1],id,'/app')
    return {'ok':True}

@router.post('/staff/tickets/{id}/messages')
async def staff_send(id:str,body:StaffMessage,request:Request):
    with db.transaction() as tx:
        u,t=staff_ticket(tx,request,id)
        if t['state']!='staff' or t['data'].get('assigned_to')!=u['id']:raise ConversationError('takeover_required','Take over this case before replying.',409)
        c=conversation(tx,t['owner']);c['data']['messages']=(c['data']['messages']+[msg('staff',body.message)])[-100:];tx.put(c['id'],'conversation',t['owner'],c['data']);tx.audit(u['id'],'staff.message',id)
        if not t['data'].get('first_response_at'):t['data']['first_response_at']=time.time();tx.put(id,'ticket',t['owner'],t['data'],t['state'],t['branch'])
        ops.notify(tx,t['owner'],'New reply from our team',body.message[:160],id,'/app')
        for link in tx.find('line_identity',t['owner']):
            tx.put('outbox_'+secrets.token_hex(12),'line_outbox',t['owner'],{'line_user_id':link['data']['line_user_id'],'reply':body.message,'retry_key':str(__import__('uuid').uuid4()),'attempts':0},'pending')
    return {'ok':True}

@router.post('/staff/bookings/{id}/settle')
async def settle(id:str,request:Request):
    with db.transaction() as tx:
        u=staff(tx,request);b=tx.get(id)
        if not b or b['kind']!='booking' or (u['data']['role']!='manager' and b['branch']!=u['data'].get('branch')):raise ConversationError('not_found','Booking unavailable.',404)
        if b['data']['payment_method']!='center' or b['state']!='confirmed':raise ConversationError('invalid_state','This order cannot be settled at the center.',409)
        if b['data']['payment_status']=='paid':return {'ok':True,'receipt_id':b['data'].get('receipt_id','')}
        if b['data']['payment_status']!='pending':raise ConversationError('payment_state','Only a pending center payment can be settled.',409)
        b['data']['payment_status']='paid';b['data']['paid_at']=time.time();b['data']['receipt_id']='demo-receipt-'+secrets.token_hex(8);tx.put(id,'booking',b['owner'],b['data'],b['state'],b['branch']);tx.audit(u['id'],'payment.center_settled',id)
        ops.notify(tx,b['owner'],'Payment recorded at the center','The center recorded your payment (simulation receipt).',id,'/app?view=bookings')
        return {'ok':True,'receipt_id':b['data']['receipt_id']}

async def create_checkout(owner,booking_id,method):
    from services.business_integrations import stripe_checkout
    with db.transaction() as tx:
        b=tx.own(booking_id,owner,'booking')
        if b['state']=='requested':raise ConversationError('awaiting_confirmation','Payment opens after our team confirms this appointment.',409)
        if b['state']!='confirmed' or b['data']['payment_status']!='pending':raise ConversationError('payment_state','This booking cannot start a payment.',409)
        d=b['data']
        if method!='center' and ops.payment_mode()=='SIMULATED_INTEGRATION':
            txn=ops.sim_create(tx,b,method)
            return {'simulator_url':'/pay/sim/'+txn['id'],'txn':ops.sim_view(tx,txn),'mode':'SIMULATED_INTEGRATION'}
        if method=='center':
            if d.get('checkout_method') or d.get('active_txn'):raise ConversationError('checkout_active','A checkout already exists. Cancel it or ask staff to change the payment method.',409)
            d.update(payment_method='center');tx.put(b['id'],'booking',owner,d,b['state'],b['branch'])
            return {'message':'Payment is due at the center.'}
        if d.get('checkout_method') and d['checkout_method']!=method:raise ConversationError('checkout_active','A checkout with another method already exists.',409)
        if d.get('checkout_url') and d.get('checkout_expires',0)>time.time():return {'url':d['checkout_url'],'session_id':d['checkout_session_id']}
        if d.get('checkout_expires',0) and d['checkout_expires']<=time.time():raise ConversationError('checkout_expired','This checkout expired. Contact staff for a new order.',409)
        d.update(checkout_method=method,checkout_expires=d.get('checkout_expires') or int(time.time())+1800)
        b=tx.put(b['id'],'booking',owner,d,b['state'],b['branch'])
    result=await stripe_checkout(b,method)
    with db.transaction() as tx:
        b=tx.own(booking_id,owner,'booking')
        if b['state']=='cancelled' or b['data']['payment_status']!='pending':raise ConversationError('payment_state','The booking changed. Contact staff.',409)
        b['data'].update(payment_method=method,checkout_session_id=result['session_id'],checkout_url=result['url'])
        tx.put(b['id'],'booking',owner,b['data'],b['state'],b['branch'])
    return result

@router.post('/payments/checkout')
async def checkout(body:Checkout,request:Request):
    with db.transaction() as tx:u,_=session_row(tx,request)
    return await create_checkout(u['id'],body.booking_id,body.method)

@router.post('/payments/webhook')
async def payment_webhook(request:Request):
    from services.business_integrations import stripe_event,apply_stripe
    return apply_stripe(stripe_event(await request.body(),request.headers.get('stripe-signature','')))

@router.post('/line/webhook')
async def line_webhook(request:Request):
    from services.business_integrations import verify_line,enqueue_line
    return enqueue_line(verify_line(await request.body(),request.headers.get('x-line-signature','')))

@router.post('/account/line/link')
async def link_account(body:LinkInput,request:Request):
    with db.transaction() as tx:
        u,session=session_row(tx,request)
        if time.time()-session['data'].get('auth_at',0)>600:raise ConversationError('reauth_required','Sign in again before linking this account.',401)
        if not u['data'].get('password') or not body.consent:raise ConversationError('consent_required','Sign in to an account and confirm linking.',409)
        key='link_'+db.digest(body.token);link=tx.get(key)
        if not link or link['state']!='pending' or link['data']['expires']<time.time():raise ConversationError('link_expired','This invitation expired or was already used.',409)
        previous=link['owner'];olduser=tx.get(previous)
        if previous!=u['id'] and olduser['data'].get('password'):raise ConversationError('already_linked','This LINE identity is already linked to another account.',409)
        for row in tx.find('line_identity',previous):tx.put(row['id'],row['kind'],u['id'],row['data'],row['state'],row['branch'])
        # Explicit linking consent imports the verified LINE guest's records.
        if previous!=u['id']:
            for kind in ['report','booking','ticket','action']:
                for row in tx.find(kind,previous):tx.put(row['id'],row['kind'],u['id'],row['data'],row['state'],row['branch'])
            old=tx.get('conversation_'+previous)
            if old:
                tx.put('archive_'+secrets.token_hex(12),'archive',u['id'],old['data'])
                current=conversation(tx,u['id'])
                current['data']['messages']=(current['data']['messages']+old['data']['messages'])[-100:]
                current['data']['version']+=1
                tx.put(current['id'],'conversation',u['id'],current['data'])
                tx.delete(old['id'])
        tx.put(key,'account_link',previous,link['data'],'used');tx.audit(u['id'],'line.linked',key)
    return {'ok':True,'message':'LINE linked. Consented records imported; select and verify report context before comparing.'}

@router.post('/account/line/unlink')
async def unlink_account(request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request)
        for row in tx.find('line_identity',u['id']):tx.delete(row['id'])
        for kind in ['line_job','line_outbox']:
            for row in tx.find(kind,u['id']):
                if row['state'] in ['pending','working']:
                    row['data']['error_code']='line_unlinked';tx.put(row['id'],kind,u['id'],row['data'],'cancelled')
        tx.audit(u['id'],'line.unlinked',u['id'])
    return {'ok':True}

@router.post('/worker/run')
async def worker_run(request:Request):
    key=os.getenv('BUSINESS_WORKER_SECRET','')
    if not key or len(key)<32 or not hmac.compare_digest(request.headers.get('authorization',''),'Bearer '+key):raise ConversationError('forbidden','Worker authorization required.',403)
    from services.business_worker import once
    return await once()


@router.get('/reports/{id}/source')
async def report_source(id:str,request:Request,page:int=1):
    with db.transaction() as tx:
        u,_=session_row(tx,request,False);r=tx.own(id,u['id'],'report')
        raws=[base64.b64decode(x) for x in [r['data']['original'],*r['data'].get('extra_originals',[])]]
        images=[i for raw in raws for i in document_images(raw)]
        if not 1<=page<=len(images):raise ConversationError('not_found','That page does not exist.',404)
        return Response(images[page-1][0],media_type=images[page-1][1],headers={'Cache-Control':'no-store'})

class CatalogEdit(Strict):
    price_thb:int=Field(ge=1,le=1000000)
    active:bool=True
class CorporateQuote(Strict):
    ticket_id:str;package_id:str;people:int=Field(ge=20,le=10000)
    date:str;time:str=Field(pattern=r'^\d{2}:\d{2}$');branch_id:str='BKK01'
    venue:str=Field(min_length=1,max_length=250)
    travel_fee_thb:int=Field(default=0,ge=0,le=20000)
    note:str=Field(default='',max_length=500)
class AcceptQuote(Strict):quote_id:str

@router.get('/staff/operations')
async def operations(request:Request):
    with db.transaction() as tx:
        u=staff(tx,request);manager=u['data']['role']=='manager'
        bookings=[b for b in tx.find('booking') if manager or b['branch']==u['data'].get('branch')]
        jobs=[{'id':j['id'],'state':j['state'],'error_code':j['data'].get('error_code',''),'created':j['created']} for kind in ['line_job','line_outbox'] for j in tx.find(kind)] if manager else []
        return {'bookings':bookings,'catalog':db.catalog(tx),'jobs':jobs,'role':u['data']['role']}

@router.put('/staff/catalog/{id}')
async def edit_catalog(id:str,body:CatalogEdit,request:Request):
    with db.transaction() as tx:
        u=staff(tx,request)
        if u['data']['role']!='manager':raise ConversationError('forbidden','Manager access required.',403)
        catalog=db.catalog(tx);p=next((p for p in catalog['packages'] if p['id']==id),None)
        if not p:raise ConversationError('not_found','Package unavailable.',404)
        p.update(price_thb=body.price_thb,active=body.active);catalog['version']='edited-'+secrets.token_hex(8)
        tx.put('configuration_catalog','configuration','system',catalog);tx.audit(u['id'],'catalog.updated',id)
        return {'ok':True,'version':catalog['version']}

@router.post('/staff/quotes')
async def corporate_quote(body:CorporateQuote,request:Request):
    with db.transaction() as tx:
        u,t=staff_ticket(tx,request,body.ticket_id)
        if t['data'].get('assigned_to')!=u['id']:raise ConversationError('takeover_required','Take over the case before issuing a quote.',409)
        p=next((p for p in db.catalog(tx)['packages'] if p['id']==body.package_id and p['segment']=='organization' and p.get('active',True)),None)
        if not p:raise ConversationError('package_invalid','Choose an active organization package.',422)
        if body.branch_id not in {b['id'] for b in db.branches(tx)['branches']}:raise ConversationError('branch_invalid','Unknown branch.',422)
        if u['data']['role']!='manager' and body.branch_id!=u['data'].get('branch'):raise ConversationError('branch_forbidden','Use your assigned branch.',403)
        try:dt=datetime.strptime(body.date+' '+body.time,'%Y-%m-%d %H:%M').replace(tzinfo=TZ)
        except ValueError:raise ConversationError('date_invalid','Choose a valid date and time.',422) from None
        if dt<=datetime.now(TZ):raise ConversationError('date_invalid','Choose a future date.',422)
        total=p['price_thb']*body.people+body.travel_fee_thb
        # Versioned quotations: a revision supersedes the open offer for the same case.
        previous=[x for x in tx.find('corporate_quote',t['owner']) if x['data'].get('ticket_id')==body.ticket_id]
        if any(x['state']=='accepted' for x in previous):raise ConversationError('quote_accepted','The customer already accepted a quotation for this case.',409)
        for old in previous:
            if old['state']=='offered':tx.put(old['id'],old['kind'],old['owner'],old['data'],'superseded',old['branch'])
        version=len(previous)+1
        q=tx.put('quote_'+secrets.token_hex(12),'corporate_quote',t['owner'],{**body.model_dump(),'version':version,'issued_by':u['id'],'inquiry_id':t['data'].get('inquiry_id',''),'unit_price_thb':p['price_thb'],'total_thb':total,'currency':'THB','expires':time.time()+7*86400,'items':[{'id':p['id'],'name':p['name']+' × '+str(body.people),'price_thb':total,'price_unit':'group'}],'is_demo':True},'offered',body.branch_id)
        c=conversation(tx,t['owner']);c['data']['messages'].append(msg('staff',f"Your organization quotation (version {version}) is ready: {body.people} people, {p['name']}, THB {total:,}. Review, download or accept it in My appointments."))
        tx.put(c['id'],'conversation',t['owner'],c['data']);tx.audit(u['id'],'quote.offered',q['id'])
        ops.notify(tx,t['owner'],f'Quotation version {version} is ready',f"{p['name']} for {body.people} people · THB {total:,}",q['id'],'/app?view=bookings')
        return q

@router.post('/quotes/accept')
async def accept_quote(body:AcceptQuote,request:Request):
    with db.transaction() as tx:
        u,_=session_row(tx,request);q=tx.own(body.quote_id,u['id'],'corporate_quote')
        if not u['data'].get('password'):raise ConversationError('account_required','Sign in before accepting a quotation.',409)
        id='booking_'+q['id']
        if tx.get(id):return tx.get(id)
        if q['state']=='superseded':raise ConversationError('quote_superseded','A newer version of this quotation exists. Review the latest version.',409)
        if q['state']!='offered' or q['data']['expires']<time.time():raise ConversationError('quote_expired','This quotation is no longer available.',409)
        d={**q['data'],'payment_status':'pending','payment_method':'center','package_ids':[q['data']['package_id']],'organization':True}
        b=tx.put(id,'booking',u['id'],d,'confirmed',q['branch']);tx.put(q['id'],q['kind'],q['owner'],q['data'],'accepted',q['branch']);tx.audit(u['id'],'quote.accepted',id)
        ops.notify_staff(tx,q['branch'],'Quotation accepted',f"Version {q['data'].get('version',1)} · THB {q['data']['total_thb']:,}",id,'/staff?view=operations')
        return b

class RefundRequest(Strict):reason:str=Field(min_length=3,max_length=500)
@router.post('/staff/bookings/{id}/refund')
async def refund_booking(id:str,body:RefundRequest,request:Request):
    with db.transaction() as tx:
        u=staff(tx,request)
        if u['data']['role']!='manager':raise ConversationError('forbidden','Manager approval is required.',403)
        b=tx.get(id)
        if not b or b['kind']!='booking':raise ConversationError('not_found','Booking unavailable.',404)
        if b['data']['payment_status']=='refunded':return {'status':'refunded'}
        if b['data']['payment_status']!='paid':raise ConversationError('payment_state','Only a settled payment can be refunded.',409)
    if b['data']['payment_method']=='center':result={'status':'succeeded','id':'demo-refund-'+secrets.token_hex(8)}
    elif b['data'].get('payment_provider')=='simulator':
        with db.transaction() as tx:
            txn=next((t for t in tx.find('payment_txn',b['owner']) if t['data']['booking_id']==id and t['state']=='succeeded'),None)
            if not txn:raise ConversationError('refund_setup','No settled test payment exists for this appointment.',409)
        raw=ops.sim_event_payload(txn,'refund');ops.sim_apply(raw,ops.sim_sign(raw))
        with db.transaction() as tx:
            b=tx.get(id);b['data']['refund_reason']=body.reason;tx.put(id,'booking',b['owner'],b['data'],b['state'],b['branch']);tx.audit(u['id'],'payment.refund',id)
        return {'status':b['data']['payment_status']}
    else:
        from services.business_integrations import external
        import httpx
        external();key=os.getenv('STRIPE_SECRET_KEY','')
        if not key.startswith('sk_test_') or not b['data'].get('payment_intent'):raise ConversationError('refund_setup','A verified test payment is required for this refund.')
        async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
            r=await client.post('https://api.stripe.com/v1/refunds',headers={'Authorization':'Bearer '+key,'Idempotency-Key':'refund-'+id},data={'payment_intent':b['data']['payment_intent'],'amount':str(b['data']['total_thb']*100)})
        if r.status_code!=200:raise ConversationError('refund_failed','The payment provider could not complete this refund.',502)
        result=r.json()
    with db.transaction() as tx:
        b=tx.get(id);b['data'].update(payment_status='refunded' if result.get('status')=='succeeded' else 'refund_pending',refund_reference=result.get('id',''),refund_reason=body.reason)
        tx.put(id,'booking',b['owner'],b['data'],b['state'],b['branch']);tx.audit(u['id'],'payment.refund',id)
    return {'status':b['data']['payment_status']}

@router.post('/staff/subscriptions/{id}/refund')
async def refund_subscription(id:str,body:RefundRequest,request:Request):
    """Manager-approved simulated refund of a Plus period. Plus ends immediately."""
    with db.transaction() as tx:
        u=staff(tx,request)
        if u['data']['role']!='manager':raise ConversationError('forbidden','Manager approval is required.',403)
        sub=tx.get(id)
        if not sub or sub['kind']!='subscription':raise ConversationError('not_found','Subscription unavailable.',404)
        if sub['data'].get('payment_status')=='refunded':return {'status':'refunded'}
        txn=next((t for t in tx.find('payment_txn',sub['owner']) if t['data']['booking_id']==id and t['state']=='succeeded'),None)
        if not txn:raise ConversationError('payment_state','Only a paid Plus period can be refunded.',409)
    raw=ops.sim_event_payload(txn,'refund');ops.sim_apply(raw,ops.sim_sign(raw))
    with db.transaction() as tx:
        sub=tx.get(id);sub['data']['refund_reason']=body.reason;tx.put(id,'subscription',sub['owner'],sub['data'],sub['state']);tx.audit(u['id'],'subscription.refund',id)
        return {'status':sub['data']['payment_status'],'state':sub['state']}
