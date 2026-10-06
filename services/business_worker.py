"""Durable LINE worker. Run as a persistent process alongside a hosted API."""
from __future__ import annotations
import asyncio,os,time,secrets
from services import business_store as db,business_integrations as integration
from services.conversation_transport import ConversationError

async def once():
    if not integration.line_simulated():integration.external()
    lease=secrets.token_hex(12)
    with db.transaction() as tx:
        rows=tx.find('line_job')+tx.find('line_outbox')
        job=next((r for r in rows if r['state']=='pending' or (r['state']=='working' and r['data'].get('lease_until',0)<time.time())),None)
        if not job:return {'processed':0}
        d=job['data'];d['attempts']=d.get('attempts',0)+1
        if d['attempts']>2:tx.put(job['id'],job['kind'],job['owner'],d,'failed');return {'processed':0,'failed':1}
        d.update(lease=lease,lease_until=time.time()+300);tx.put(job['id'],job['kind'],job['owner'],d,'working')
    try:
        from routers.business import turn,save_read_report,conversation,msg
        if job['kind']=='line_job':
            event=d['event'];uid=event['source']['userId'];message=event['message'];identity=None
            with db.transaction() as tx:
                identity=tx.get('line_'+db.digest(uid))
                if not identity:raise ConversationError('line_unlinked','LINE identity is no longer linked.')
                owner=identity['owner']
            if d.get('stage')=='new':
                # A generation interrupted after request submission is not replayed blindly.
                with db.transaction() as tx:
                    d['stage']='generating';tx.put(job['id'],job['kind'],owner,d,'working')
                if message['type']=='image':
                    report=await save_read_report(owner,await integration.line_image(message['id']))
                    with db.transaction() as tx:url=integration.create_link(tx,owner)
                    answer='Your report is ready for field review. Sign in and link your account, then confirm the extracted fields before interpretation: '+url+'\nReport: '+report['id']
                else:
                    text=message.get('text','')[:8000]
                    # Confirmation commands address opaque server-created actions, never price/rule routing.
                    if text.startswith('/confirm '):
                        from routers.business import booking_create,Book,ticket_create,create_checkout
                        aid=text[9:].strip()
                        with db.transaction() as tx:
                            preview=tx.own(aid,owner,'action')
                            pay=preview['data']['action'] if preview['data']['action']['type']=='pay' else None
                            if pay and (preview['data']['expires']<time.time() or preview['data']['version']!=conversation(tx,owner)['data']['version']):raise ConversationError('preview_expired','Payment preview expired.')
                        if pay:
                            checkout=await create_checkout(owner,pay['booking_id'],pay['method'])
                            answer=checkout.get('url') or checkout.get('message','Payment is pending.')
                        with db.transaction() as tx:
                            action=tx.own(aid,owner,'action');a=action['data']['action'];c=conversation(tx,owner)
                            if pay:pass
                            elif action['state']=='done':answer='This request was already confirmed.'
                            elif action['data']['expires']<time.time() or action['data']['version']!=c['data']['version']:answer='This preview expired. Please ask for a new one.'
                            else:
                                if a['type'] in ['book','quote'] and db.quote(a['quote']['package_ids'],tx)!=a['quote']:raise ConversationError('quote_changed','Package changed. Ask for a fresh preview.',409)
                                if a['type']=='book':r=booking_create(tx,owner,Book(package_ids=a['quote']['package_ids'],branch_id=a['branch_id'],date=a['date'],time=a['time'],idempotency_key=aid));answer='Appointment request sent: '+r['id']+'. Our team will confirm it; payment opens after confirmation.'
                                elif a['type']=='handoff':r=ticket_create(tx,owner,a['summary']);answer='Your staff request is queued: '+r['id']
                                else:answer='Review this request on the website.'
                                action['data']['result']={'message':answer};tx.put(aid,'action',owner,action['data'],'done')
                    else:
                        result=await turn(owner,text);answer=result.get('reply') or 'Your message is in the staff conversation.'
                        if result.get('action_id') and (result.get('action') or {}).get('type') in ['book','handoff','pay']:
                            answer+='\n\nTo confirm this preview, send /confirm '+result['action_id']
                        if (result.get('action') or {}).get('type')=='link':
                            with db.transaction() as tx:answer+='\n'+integration.create_link(tx,owner)
                d.update(reply=answer,stage='ready')
                with db.transaction() as tx:tx.put(job['id'],job['kind'],owner,d,'working')
            elif d.get('stage')=='generating':
                d.update(reply='Your previous request was interrupted. Please send it again, or contact staff.',stage='ready')
            reply_token=event.get('replyToken','') if time.time()-d['queued_at']<45 and d['attempts']==1 else ''
            if not reply_token and os.getenv('LINE_ALLOW_PUSH')!='true' and not integration.line_simulated():raise ConversationError('line_reply_expired','Enable consented push delivery or retry in LINE.')
            with db.transaction() as tx:
                current=tx.get('line_'+db.digest(uid))
                if not current or current['owner']!=owner:raise ConversationError('line_link_changed','Account link changed during processing.')
            await integration.line_send(uid,d['reply'],d['retry_key'],reply_token)
        else:
            if os.getenv('LINE_ALLOW_PUSH')!='true' and not integration.line_simulated():raise ConversationError('line_push_disabled','Staff LINE delivery requires LINE_ALLOW_PUSH.')
            with db.transaction() as tx:
                current=tx.get('line_'+db.digest(d['line_user_id']))
                if not current or current['owner']!=job['owner']:raise ConversationError('line_link_changed','Account link changed before delivery.')
            await integration.line_send(d['line_user_id'],d['reply'],d['retry_key'])
        with db.transaction() as tx:tx.put(job['id'],job['kind'],job['owner'],d,'done')
        return {'processed':1}
    except Exception as e:
        with db.transaction() as tx:
            # No arbitrary exception or provider payload is stored/logged.
            d['error_code']=e.code if isinstance(e,ConversationError) else 'worker_failed'
            # No automatic replay after an uncertain reply-send or model call.
            tx.put(job['id'],job['kind'],job['owner'],d,'failed');tx.audit('worker','line.failed',job['id'])
        return {'processed':0,'failed':1}

async def main():
    while True:
        try:await once()
        except Exception:pass
        await asyncio.sleep(2)
if __name__=='__main__':asyncio.run(main())
