"""LINE and Stripe sandbox boundaries. No live charges supported in this release."""
from __future__ import annotations
import base64,hashlib,hmac,json,os,secrets,time,uuid
import httpx
from services import business_store as db
from services.conversation_transport import ConversationError

def external():
    if os.getenv('BUSINESS_EXTERNAL_ENABLED')!='true':raise ConversationError('integration_disabled','External business integrations are disabled. Configure the sandbox connection first.')

def line_simulated():
    """Server-owned decision: without real LINE credentials the channel runs through the simulator transport."""
    from services.business_ops import line_mode
    return line_mode()=='SIMULATED_INTEGRATION'

def line_secret():
    # A configured channel secret always verifies inbound events; the simulator signs with the same secret.
    return os.getenv('LINE_CHANNEL_SECRET','') or db.derived_secret('line-simulator').hex()

def public_url():
    from urllib.parse import urlparse
    url=os.getenv('BUSINESS_PUBLIC_URL','').rstrip('/')
    if urlparse(url).scheme!='https' or not urlparse(url).netloc:raise ConversationError('integration_setup','Configure the HTTPS BUSINESS_PUBLIC_URL.')
    return url

async def stripe_checkout(booking,method):
    external();key=os.getenv('STRIPE_SECRET_KEY','')
    if not key.startswith('sk_test_'):raise ConversationError('sandbox_required','A Stripe test-mode key is required. Live payments are disabled.')
    if method not in ['card','promptpay']:raise ConversationError('method_invalid','Unsupported payment method.',422)
    b=booking['data'];base=public_url()
    data={'mode':'payment','payment_method_types[0]':method,'line_items[0][price_data][currency]':'thb','line_items[0][price_data][unit_amount]':str(b['total_thb']*100),'line_items[0][price_data][product_data][name]':'LabClear health check','line_items[0][quantity]':'1','metadata[booking_id]':booking['id'],'client_reference_id':booking['id'],'success_url':base+'/app?payment=return','cancel_url':base+'/app?payment=cancel','expires_at':str(b['checkout_expires'])}
    async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
        r=await client.post('https://api.stripe.com/v1/checkout/sessions',data=data,headers={'Authorization':'Bearer '+key,'Idempotency-Key':booking['id']+'-'+method})
    if r.status_code!=200:raise ConversationError('checkout_unavailable','The sandbox checkout could not be created.',502)
    result=r.json()
    from urllib.parse import urlparse
    if urlparse(result.get('url','')).hostname!='checkout.stripe.com':raise ConversationError('checkout_invalid','Checkout returned an invalid URL.',502)
    return {'session_id':result['id'],'url':result['url']}

def stripe_event(raw,signature):
    secret=os.getenv('STRIPE_WEBHOOK_SECRET','')
    if not secret:raise ConversationError('webhook_setup','Webhook is not configured.',503)
    try:
        fields=[p.split('=',1) for p in signature.split(',')];stamp=next(v for k,v in fields if k=='t')
        expected=hmac.new(secret.encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
        valid=abs(time.time()-int(stamp))<=300 and any(hmac.compare_digest(expected,v) for k,v in fields if k=='v1')
    except (ValueError,StopIteration):valid=False
    if not valid:raise ConversationError('signature_invalid','Invalid webhook signature.',400)
    try:event=json.loads(raw)
    except ValueError:raise ConversationError('payload_invalid','Invalid webhook payload.',400) from None
    if event.get('livemode') is not False:raise ConversationError('sandbox_required','Only test-mode events are accepted.',400)
    if not isinstance(event.get('id'),str) or not event['id'].startswith('evt_'):raise ConversationError('payload_invalid','Invalid event ID.',400)
    return event

def apply_stripe(event):
    with db.transaction() as tx:
        eid='stripe_'+event['id']
        if tx.get(eid):return {'received':True,'duplicate':True}
        obj=event.get('data',{}).get('object',{});bid=obj.get('metadata',{}).get('booking_id','');b=tx.get(bid)
        typ=event.get('type','')
        if typ in ['checkout.session.completed','checkout.session.async_payment_succeeded']:
            if not b or b['kind']!='booking' or obj.get('amount_total')!=b['data']['total_thb']*100 or obj.get('currency')!='thb' or obj.get('id')!=b['data'].get('checkout_session_id'):
                raise ConversationError('payment_mismatch','Payment does not match an active order.',409)
            if obj.get('payment_status')=='paid' and b['data']['payment_status'] not in ['refunded','refund_pending']:
                b['data']['payment_status']='paid';b['data']['payment_reference']=obj['id'];b['data']['payment_intent']=obj.get('payment_intent','')
                tx.put(bid,'booking',b['owner'],b['data'],b['state'],b['branch'])
                if b['state']=='cancelled':
                    from routers.business import ticket_create
                    ticket_create(tx,b['owner'],'Payment received for a cancelled booking. Staff resolution required.')
                tx.audit('stripe','payment.confirmed',bid)
        elif typ=='checkout.session.expired' and b and obj.get('id')==b['data'].get('checkout_session_id'):
            if b['data']['payment_status']=='pending':b['data']['payment_status']='expired';tx.put(bid,'booking',b['owner'],b['data'],b['state'],b['branch'])
        tx.put(eid,'payment_event','system',{'type':typ,'booking_id':bid},'processed')
    return {'received':True}

def verify_line(raw,signature):
    secret=line_secret()
    if not secret:raise ConversationError('line_setup','LINE is not configured.',503)
    expected=base64.b64encode(hmac.new(secret.encode(),raw,hashlib.sha256).digest()).decode()
    if not hmac.compare_digest(expected,signature):raise ConversationError('signature_invalid','Invalid LINE signature.',400)
    try:return json.loads(raw)
    except ValueError:raise ConversationError('payload_invalid','Invalid LINE payload.',400) from None

def enqueue_line(payload):
    with db.transaction() as tx:
        for e in payload.get('events',[]):
            if e.get('source',{}).get('type')!='user' or e.get('type')!='message':continue
            uid=e['source'].get('userId');event_id=e.get('webhookEventId');message=e.get('message',{})
            if not uid or not event_id or message.get('type') not in ['text','image']:continue
            id='line_event_'+db.digest(event_id)
            if tx.get(id):continue
            linkid='line_'+db.digest(uid);identity=tx.get(linkid)
            if identity:owner=identity['owner']
            else:
                owner='customer_'+secrets.token_hex(12);tx.put(owner,'user',owner,{'role':'customer','email':'','password':'','line_verified':True})
                tx.put(linkid,'line_identity',owner,{'line_user_id':uid})
            tx.put(id,'line_job',owner,{'event':e,'attempts':0,'retry_key':str(uuid.uuid4()),'stage':'new','queued_at':time.time()},'pending')
    return {'ok':True}

async def line_send(uid,text,retry_key,reply_token=''):
    if line_simulated():
        # SIMULATED_INTEGRATION transport: same chunking/dedup contract, persisted instead of sent.
        with db.transaction() as tx:
            rid='linesim_'+db.digest(retry_key+':'+reply_token)
            if not tx.get(rid):tx.put(rid,'line_sim_delivery','system',{'to':uid,'text':text[:18000],'endpoint':'reply' if reply_token else 'push','at':time.time()},'delivered')
        return
    external();key=os.getenv('LINE_CHANNEL_ACCESS_TOKEN','')
    if not key:raise ConversationError('line_setup','LINE access token is missing.')
    messages=[{'type':'text','text':text[i:i+4500]} for i in range(0,min(len(text),18000),4500)] or [{'type':'text','text':'Your request is ready on the website.'}]
    endpoint='reply' if reply_token else 'push'
    body={'replyToken':reply_token,'messages':messages} if reply_token else {'to':uid,'messages':messages}
    headers={'Authorization':'Bearer '+key}
    if not reply_token:headers['X-Line-Retry-Key']=retry_key
    async with httpx.AsyncClient(timeout=20,follow_redirects=False) as client:
        r=await client.post('https://api.line.me/v2/bot/message/'+endpoint,json=body,headers=headers)
    if r.status_code not in [200,409]:raise ConversationError('line_delivery_failed','LINE delivery failed.',502)

async def line_image(message_id):
    if line_simulated():raise ConversationError('line_image_unavailable','Image messages are not available in the LINE simulator. Upload the report on the website.',409)
    external();key=os.getenv('LINE_CHANNEL_ACCESS_TOKEN','')
    if not re_id(message_id):raise ConversationError('line_image_invalid','Invalid image ID.',422)
    async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
        async with client.stream('GET','https://api-data.line.me/v2/bot/message/'+message_id+'/content',headers={'Authorization':'Bearer '+key}) as r:
            if r.status_code!=200:raise ConversationError('line_image_failed','The LINE image is unavailable.',502)
            content=bytearray()
            async for part in r.aiter_bytes():
                content.extend(part)
                if len(content)>3*1024*1024:raise ConversationError('file_too_large','Image exceeds 3 MB.',413)
    return bytes(content)

def re_id(v):return isinstance(v,str) and v.isdigit() and len(v)<=40

def create_link(tx,owner):
    token=secrets.token_urlsafe(32)
    tx.put('link_'+db.digest(token),'account_link',owner,{'expires':time.time()+600},'pending')
    base='' if line_simulated() and not os.getenv('BUSINESS_PUBLIC_URL') else public_url()
    return base+'/app?link='+token
