"""Conservative cell-count unit notation checks; never infer a result or repair OCR.

Equivalent scales may be compared, but display/storage retain the printed text.
Nonstandard count scales are unverified, not declared medically impossible.
"""
import re

_SUPERSCRIPT=str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻','0123456789+-')
_VOLUME={'':0,'m':-3,'u':-6,'n':-9}
_COUNT_PREFIX={'K':3,'k':3,'M':6,'G':9,'T':12}

def count_scale(unit):
    """Return power of ten per litre for explicit count units, else None."""
    text=re.sub(r'\s+','',str(unit or '')).replace('μ','u').replace('µ','u')
    text=re.sub(r'^(?:[xX×*])(?=10)', '',text)
    text=text.replace('/mm³','/uL').replace('/mm^3','/uL').replace('/mm3','/uL')
    explicit=re.fullmatch(r'10(?:\^\{?([+-]?\d+)\}?|([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+))/(m|u|n)?[Ll]',text)
    if explicit:
        exponent=int((explicit[1] or explicit[2]).translate(_SUPERSCRIPT))
        return exponent-_VOLUME[explicit[3] or '']
    prefix=re.fullmatch(r'([KkMGT])/(m|u|n)?[Ll]',text)
    if prefix:return _COUNT_PREFIX[prefix[1]]-_VOLUME[prefix[2] or '']
    return None

def equivalent_count_units(left,right):
    a,b=count_scale(left),count_scale(right)
    return a is not None and b is not None and a==b

def unit_issue(unit):
    """Restrict automatic interpretation to supported notation, not lab thresholds."""
    scale=count_scale(unit)
    if scale is not None and scale not in {0,3,6,9,12}:return 'count_unit_scale_unverified'
    if scale is None and re.search(r'(?:10(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹])|^\s*10\d+\s*/)',str(unit or '')):
        return 'count_unit_notation_unverified'
    return None

def require_supported_units(rows):
    from services.conversation_transport import ConversationError
    if any(unit_issue(r.unit if hasattr(r,'unit') else r.get('unit','')) for r in rows):
        raise ConversationError('unit_unverified',
            'A count-unit scale could not be verified. Review the exponent and volume unit against the original, then edit the row before confirming. No unit was corrected automatically.',422)
