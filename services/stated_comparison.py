"""Bounded arithmetic on a single explicitly supplied value and two-sided range.

This packet remains unverified user text, never a confirmed report or medical
threshold. Ambiguous units, multiple values or missing context produce no packet.
"""
import re
from decimal import Decimal

_N=r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)'
_U=r'[A-Za-zµμ%]+(?:/[A-Za-zµμ]+)?'
_R=re.compile(rf'(?P<low>{_N})\s*[-–—]\s*(?P<high>{_N})\s*(?P<unit>{_U})(?![\w/])')
_V=re.compile(rf'(?<![\w.])(?P<value>{_N})\s*(?P<unit>{_U})(?![\w/])')

def from_text(message):
    # Do not turn negated, uncertain, or one-sided values into exact facts.
    if re.search(r"\b(?:not|no|maybe|perhaps|approximately|about|around|over|under|above|below|less|more)\b|isn't|isn’t|ไม่ใช่|ไม่แน่ใจ|ประมาณ|อาจจะ|มากกว่า|น้อยกว่า|[<>≤≥≈~]", message, re.I):return None
    if not re.search(r'\b(?:range|interval)\b|ช่วงอ้างอิง|ค่าอ้างอิง',message,re.I):return None
    ranges=list(_R.finditer(message))
    if len(ranges)!=1:return None
    interval=ranges[0]
    remainder=message[:interval.start()]+' '*len(interval.group())+message[interval.end():]
    values=list(_V.finditer(remainder))
    if len(values)!=1:return None
    value=values[0]
    rest=remainder[:value.start()]+remainder[value.end():]
    if re.search(r'\d',rest):return None
    if value['unit']!=interval['unit']:return None
    low,high,current=map(Decimal,(interval['low'],interval['high'],value['value']))
    if low>high:return None
    return {'source':'unverified_user_text','value':value['value'],'unit':value['unit'],
            'reference':interval.group(),'low':interval['low'],'high':interval['high'],
            'relation':'below' if current<low else 'above' if current>high else 'within',
            'limits':'Arithmetic against the supplied interval only; not OCR-verified, diagnostic or proof of health.'}
