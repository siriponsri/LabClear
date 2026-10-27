"""Read explicit exponent notation, never convert ambiguous plain103 into10^3."""
import json,ast,re
from services.lab_units import count_scale

def parse_focused_units(raw, expected_cells):
    try:value=json.loads(raw)
    except json.JSONDecodeError:value=ast.literal_eval(raw)
    units=value.get('units') if isinstance(value,dict) else None
    if isinstance(units,str):units=[s.strip() for s in units.splitlines() if s.strip()]
    if not isinstance(units,list) or len(units)!=expected_cells:raise ValueError('unit cell count mismatch')
    result=[]
    for unit in units:
        if not isinstance(unit,str) or len(unit)>60:raise ValueError('invalid unit string')
        # OCR's explicit inline math wrapper around a visible caret exponent.
        unit=re.sub(r'\\\(\^([0-9]+)\\\)',r'^\1',unit.strip())
        if count_scale(unit) not in {0,3,6,9,12}:raise ValueError('unit scale remains unknown')
        result.append(unit)
    return result
