"""Publish exact policy fields for narrow service questions, never model promises."""
import hashlib
import json
import re
from services.report_binding import is_thai

def render(answer,evidence,message,language=None):
    keys=[]
    if re.search(r'คืนเงิน|\brefund',message,re.I):keys=['refund_policy']
    elif re.search(r'(?:เจาะเลือด|บริการ|ตรวจ).{0,35}(?:ถึงบ้าน|ที่บ้าน)|\bhome\s+(?:visits?|blood|collection)|blood.{0,20}\bat home\b',message,re.I):keys=['onsite_service','results_policy']
    if not keys:return None
    source=next((e for e in evidence if e.get('id')=='rs-policy' and e.get('data_class')=='synthetic_business'),None)
    if source is None:return None
    try:policy=json.loads(source['content'])
    except (ValueError,TypeError,KeyError):return None
    if not isinstance(policy,dict) or any(not isinstance(policy.get(k),str) or not policy[k].strip() for k in keys):return None
    thai=is_thai(language,message)
    title='ข้อความนโยบายที่เผยแพร่ (ต้นฉบับ) มีดังนี้:' if thai else 'The published policy states:'
    # Whole authoritative fields, not invented translation or a model-selected fragment.
    answer.reply=title+'\n\n'+'\n\n'.join(policy[k].strip()+' [rs-policy]' for k in keys)
    answer.followups=[];answer.observation_ids=[];answer.observations=[]
    return {'version':'policy-field-renderer-1','source_id':'rs-policy','fields':keys,
            'content_sha256':hashlib.sha256(source['content'].encode()).hexdigest()}
