"""Check model structuring against explicit OCR row boundaries, never expected answers."""
import re
from services.ocr_tables_html import _Tables

def _norm(value):return re.sub(r'\s+',' ',str(value or '')).strip()

def preserve_explicit_count_units(fields,transcription):
    """Copy a uniquely identified source unit cell; no clinical/gold inference.

    Even when a layout cannot be fully bound, a complete name+value source row
    with exactly one explicit count-unit cell can prove a structuring rewrite.
    Ambiguous names, values or units are left unchanged and unverified.
    """
    from services.lab_units import count_scale
    parser=_Tables()
    try:parser.feed(transcription);parser.close()
    except (ValueError,AssertionError):return {'copied':0,'reason':'source_parse_error'}
    source_tables=parser.tables+([parser.table] if parser.table is not None else [])
    rows=[[_norm(cell) for cell in row] for table in source_tables for row in table]
    source_units=list(dict.fromkeys(cell for row in rows for cell in row
        if len(cell)<=120 and re.search(r'10(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹])|[µμ]/?L|\\mu',cell)))[:20]
    source_scales=[count_scale(cell) for cell in source_units]
    def name_cell(text):return _norm(text).lstrip('·•- ').casefold()
    copied=0; evidence=[]
    for row_index,field in enumerate(fields):
        name=name_cell(field.name);value=_norm(field.value)
        candidates=[]
        for row in rows:
            if not name or not value or not any(name_cell(cell)==name for cell in row) or value not in row:continue
            units=[cell for cell in row if count_scale(cell) is not None]
            if len(units)==1:candidates.append(units[0])
        if len(candidates)==1 and field.unit!=candidates[0]:
            evidence.append({'row_index':row_index,'structured_unit_before':field.unit,'source_unit':candidates[0]})
            field.unit=candidates[0];copied+=1
    return {'copied':copied,'reason':'unique_explicit_name_value_unit_cell','unit_cells':evidence,
            'source_probe':{'tables':len(parser.tables),'incomplete_table':parser.table is not None,
                            'invalid_structure':parser.invalid,'count_unit_cells':source_units,
                            'count_unit_scales':source_scales,'latex_markup':'\\mu' in transcription}}

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
