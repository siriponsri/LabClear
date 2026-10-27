"""Pixel-region unit evidence. Proposals always require explicit human confirmation.

No reference answer, customary clinical unit, or range is used to repair OCR.
"""
import hashlib
import json
import ast
import re
from io import BytesIO
from services.lab_units import count_scale

def crop_region(data, rect, scale=2):
    from PIL import Image
    if scale not in (1,2,3,4): raise ValueError('invalid magnification')
    with Image.open(BytesIO(data)) as image:
        width,height=image.size
        x,y,w,h=rect
        if any(type(v) is not int for v in rect) or x<0 or y<0 or w<1 or h<1 or x+w>width or y+h>height:
            raise ValueError('region outside source pixels')
        if w*h*scale*scale>12_000_000: raise ValueError('region pixel limit')
        region=image.crop((x,y,x+w,y+h)).convert('RGB')
        region=region.resize((w*scale,h*scale),Image.Resampling.LANCZOS)
        out=BytesIO();region.save(out,format='PNG')
    result=out.getvalue()
    return result,{'source_sha256':hashlib.sha256(data).hexdigest(),'source_dimensions':[width,height],
                   'source_rect_xywh':list(rect),'magnification':scale,'resampling':'LANCZOS',
                   'region_sha256':hashlib.sha256(result).hexdigest(),'independent_source_sample':False}

def parse_unit_rows(raw):
    from services.ocr_tables_html import _Tables
    text=raw.strip()
    if text.startswith('```'): text=re.sub(r'^```(?:json|html)?\s*|\s*```$','',text)
    if text.startswith('{') or text.startswith('['):
        try:value=json.loads(text)
        except json.JSONDecodeError:value=ast.literal_eval(text)
        rows=value.get('rows') if isinstance(value,dict) else value
    else:
        parser=_Tables();parser.feed(text);parser.close()
        if parser.invalid or parser.table is not None or len(parser.tables)!=1:raise ValueError('ambiguous region table')
        table=parser.tables[0]
        if len(table)<2 or len(table[0])!=3:raise ValueError('region requires name value unit columns')
        headers=[re.sub(r'[^a-z]','',c.casefold()) for c in table[0]]
        if headers[0] not in {'test','name','testname'} or headers[1] not in {'result','value'} or headers[2]!='unit':
            raise ValueError('unverified region headers')
        if any(len(r)!=3 for r in table[1:]):raise ValueError('unverified region cells')
        rows=[dict(zip(('name','value','unit'),r)) for r in table[1:]]
    if not isinstance(rows,list) or not 1<=len(rows)<=60:raise ValueError('invalid region rows')
    clean=[]
    for r in rows:
        if isinstance(r,list) and len(r)==3 and all(isinstance(c,str) for c in r):
            r=dict(zip(('name','value','unit'),r))
        if not isinstance(r,dict) or any(not isinstance(r.get(k),str) or len(r[k])>150 for k in ('name','value','unit')):
            raise ValueError('invalid region cell')
        clean.append({k:r[k].strip() for k in ('name','value','unit')})
    return clean

def proposed_count_units(fields, region_rows, provenance):
    def norm(s): return re.sub(r'\s+',' ',str(s or '')).strip().lstrip('·•- ').casefold()
    required={'source_sha256','region_sha256','source_rect_xywh','source_dimensions','magnification'}
    if not required.issubset(provenance):raise ValueError('source pixel provenance required')
    out=[]
    for i,field in enumerate(fields):
        data=field.model_dump() if hasattr(field,'model_dump') else field
        matches=[r for r in region_rows if norm(r['name'])==norm(data.get('name')) and r['value'].strip()==str(data.get('value','')).strip()]
        if len(matches)!=1:continue
        unit=matches[0]['unit'];physical_scale=count_scale(unit)
        if physical_scale not in {0,3,6,9,12} or unit==data.get('unit'):continue
        out.append({'row_index':i,'name':data['name'],'value':data['value'],'unit_before':data.get('unit',''),
                    'unit_pixel_candidate':unit,'evidence':provenance,'requires_human_confirmation':True,
                    'source_ocr_reading_corrected':False,'status':'PIXEL_CANDIDATE_NOT_CONFIRMED'})
    return out
