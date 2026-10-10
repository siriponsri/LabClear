"""Check model structuring against explicit OCR row boundaries, never expected answers."""
import re
from services.ocr_tables_html import _Tables

def _norm(value):return re.sub(r'\s+',' ',str(value or '')).strip()

def bind_rows(fields,transcription):
    """Return per-row structural evidence, or reject a provable cross-row change.

    Unknown layouts stay reviewable and explicitly unverified. This cannot detect
    an OCR engine that already put the wrong glyph/value in the source row.
    """
    if '<table' not in transcription.lower():return {'verified':False,'reason':'no_explicit_html_rows'}
    parser=_Tables()
    try:parser.feed(transcription);parser.close()
    except (ValueError,AssertionError):return {'verified':False,'reason':'html_parse_error'}
    if parser.invalid or parser.table is not None:return {'verified':False,'reason':'ambiguous_html_structure'}
    rows=[[_norm(c) for c in row] for table in parser.tables for row in table]
    used=set()
    bindings=[]
    unbound=False
    for field in fields:
        data=field.model_dump() if hasattr(field,'model_dump') else field
        name=_norm(data.get('name'))
        candidates=[(i,row) for i,row in enumerate(rows) if name and name in row]
        if not candidates:
            unbound=True
            continue
        matches=[]
        for index,row in candidates:
            # Preserve individual cells: containment in a joined row is not enough,
            # because a value may occur in another column's reference text.
            remaining=list(row)
            for key in ('name','value','unit','reference','printed_flag'):
                cell=_norm(data.get(key))
                if not cell:continue
                if cell in remaining:remaining.remove(cell)
                else:break
            else:matches.append(index)
        if not matches:return {'verified':False,'reason':'cell_not_in_its_source_row','reject':True}
        available=[i for i in matches if i not in used]
        if len(available)!=1:return {'verified':False,'reason':'ambiguous_or_reused_source_row','reject':True}
        used.add(available[0]);bindings.append(available[0])
    if unbound:return {'verified':False,'reason':'name_not_bound_to_explicit_cell'}
    return {'verified':True,'source_row_indices':bindings}
