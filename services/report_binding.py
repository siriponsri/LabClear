"""Deterministic, non-diagnostic report presentation bound to confirmed row IDs.

Generated prose is never a channel for personal clinical conclusions here. The
writer selects rows/sources; server-owned templates display exact row cells.
"""
import hashlib
import json
import re
from services.lab_fields_v2 import status
from services.conversation_transport import ConversationError

_FLAG_PREFIX = re.compile(r'^(?:HH|LL|H|L|N|\*)\s+|^-\s+(?=\d)', re.I)
_UNIT_SUFFIX = re.compile(r'([A-Za-zµμ]+/[A-Za-zµμ]+(?:[²³])?)\s*$')

def row_issues(rows):
    """Report suspicious structure without guessing replacement cells or flags."""
    keys=[re.sub(r'\s+',' ',str(r.get('name',''))).strip().casefold() for r in rows]
    issues={}
    for row,key in zip(rows,keys):
        found=[]
        if keys.count(key)>1:found.append('duplicate_name')
        reference=str(row.get('reference') or '').strip()
        unit=str(row.get('unit') or '').strip()
        if _FLAG_PREFIX.search(reference):found.append('flag_in_reference')
        tail=_UNIT_SUFFIX.search(reference)
        if tail and unit and unit!='-' and tail[1]!=unit:found.append('reference_unit_mismatch')
        if not str(row.get('value') or '').strip():found.append('empty_value')
        comparison=status(str(row.get('value') or ''),reference,unit)
        flag=str(row.get('printed_flag') or '').upper().strip()
        if comparison != 'unknown' and ((flag in {'H','HH','H*'} and comparison!='high') or (flag in {'L','LL','L*'} and comparison!='low') or (flag=='N' and comparison!='within')):
            found.append('flag_comparison_conflict')
        if row.get('alignment_verified') is False:found.append('alignment_unverified')
        issues[row.get('id',str(len(issues)))]=found
    return issues

def normalize_confirmed(fields):
    """Keep printed cells; confirmation must not re-enable ambiguous comparisons."""
    from services.lab_fields_v2 import normalize
    rows=normalize(fields)
    problems=row_issues(rows)
    for row in rows:
        if problems[row['id']]:row['status']='unknown'
    return rows

def is_thai(language,message):
    if str(language).lower() in {'en','english'}:return False
    if str(language).lower() in {'th','thai','ไทย'}:return True
    return bool(re.search('[ก-๙]',message))

def _cell(value):
    # Escape Markdown/HTML metacharacters, while preserving the visible cell text.
    # Newlines remain whitespace, not another generated row or instruction.
    value=re.sub(r'\s+',' ',str(value or '')).strip()
    return re.sub(r'([\\`*_\[\]<>])',r'\\\1',value)

def render(answer,report,evidence,language,message):
    """Replace free report prose with a typed, useful printed-comparison summary.

    Call only AFTER legacy citation/observation/content validation. Those checks
    still reject known bad drafts; this controls the output even when they miss
    an unfamiliar clinical paraphrase. Reviewer and output guard still run.
    """
    if not report.get('confirmed'):raise ConversationError('confirmation_required','Confirm report values first.',409)
    rows=report.get('fields',[])
    by_id={r.get('id'):r for r in rows}
    if len(by_id)!=len(rows) or None in by_id:
        raise ConversationError('observation_invalid','Report row identities are ambiguous.',502)
    requested=list(dict.fromkeys(answer.observation_ids+[o.field_id for o in answer.observations]))
    if any(key not in by_id for key in requested):
        raise ConversationError('observation_invalid','Unknown report row.',502)
    from services.answer_checks import CRITICAL_FLAGS
    critical=[r['id'] for r in rows if str(r.get('printed_flag','')).upper() in CRITICAL_FLAGS]
    relevant=requested or [r['id'] for r in rows if r.get('status') in {'low','high'}] or list(by_id)
    selected=list(dict.fromkeys(critical+relevant))[:3]
    thai=is_thai(language,message)
    text=['สรุปจากแถวผลตรวจที่คุณยืนยัน โดยเปรียบเทียบกับช่วงอ้างอิงของแถวนั้นเท่านั้น:' if thai else
          'Summary of your confirmed rows, compared only with the reference printed on each same row:']
    problems=row_issues(rows)
    relations={'high':('สูงกว่าช่วงที่ระบุ','above the printed interval'),
               'low':('ต่ำกว่าช่วงที่ระบุ','below the printed interval'),
               'within':('อยู่ในช่วงที่ระบุ','within the printed interval'),
               'unknown':('ยังเปรียบเทียบอัตโนมัติไม่ได้','cannot be compared automatically')}
    from services.conversation_agent import Observation
    observations=[]
    for key in selected:
        row=by_id[key]
        value,unit,reference=(_cell(row.get(k,'')) for k in ('value','unit','reference'))
        label='ไม่ระบุ' if thai else 'not supplied'
        comparison='unknown' if problems[key] else status(str(row.get('value','')),str(row.get('reference','')),str(row.get('unit','')))
        relation=relations[comparison][0 if thai else 1]
        line=(f"- **{_cell(row['name'])}**: {value or label} {unit}; "
              + ('ช่วงอ้างอิงที่ยืนยัน: ' if thai else 'confirmed printed reference: ')
              + (reference or label)+f'. {relation}.')
        flag=_cell(row.get('printed_flag',''))
        if flag:line+=(' เครื่องหมายที่พิมพ์: ' if thai else ' Printed flag: ')+flag+'.'
        if problems[key]:line+=(' โปรดเทียบชื่อ ค่า หน่วย ช่วงอ้างอิง และเครื่องหมายกับต้นฉบับก่อนตีความ; ไม่ได้แก้ช่องใดให้อัตโนมัติ.' if thai else
                               ' Check the name, value, unit, reference and flag against the original before interpretation; no cell has been repaired automatically.')
        text.append(line)
        observations.append(Observation(field_id=key,value=str(row.get('value') or ''),unit=str(row.get('unit') or ''),reference=str(row.get('reference') or ''),status=row.get('status') if row.get('status') in relations else 'unknown'))
    text.append('ตารางที่ยืนยันยังแสดงรายการทั้งหมด การอยู่ในหรือนอกช่วงอ้างอิงไม่ยืนยันหรือปฏิเสธโรค และใช้ระบุระยะโรค สาเหตุ หรือกำหนดนัดตรวจซ้ำไม่ได้ การตีความทางคลินิกต้องให้ผู้ประกอบวิชาชีพประเมินบริบทเพิ่มเติม.' if thai else
                'The confirmed table retains every row. Being inside or outside a reference interval neither confirms nor excludes disease, and cannot establish a disease stage, cause, or retesting schedule. A clinician must assess the additional context for clinical interpretation.')
    # Sources remain available for general education, not applied disease claims.
    medical={e['id']:e for e in evidence if e.get('data_class') in {'public_education','public_reference'}}
    ids=[i for i in answer.evidence_ids if i in medical][:3]
    if ids:
        text.append(('แหล่งความรู้ทั่วไปสำหรับอ่านประกอบ ไม่ใช่ข้อสรุปโรคของคุณ: ' if thai else
                     'General background sources, not conclusions about your health: ')+', '.join(f"{_cell(medical[i].get('title') or i)} [{i}]" for i in ids))
    answer.reply='\n\n'.join(text)
    answer.followups=[]
    answer.observation_ids=selected
    answer.observations=observations
    # Every output cell comes from a single immutable row selected above.
    packet=[{k:by_id[i].get(k,'') for k in ('id','name','value','unit','reference','printed_flag')} for i in selected]
    return {'version':'confirmed-row-renderer-1','field_ids':selected,
            'rows_sha256':hashlib.sha256(json.dumps(packet,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),
            'integrity_issues':{i:problems[i] for i in selected if problems[i]}}
