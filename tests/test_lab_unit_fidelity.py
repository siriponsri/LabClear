"""Synthetic unit contract regressions; no gold report import or provider calls."""
import pytest
from services.lab_units import count_scale,equivalent_count_units,unit_issue,require_supported_units
from services.lab_fields_v2 import ReportField,normalize,status
from services.ocr_tables_html import parse_html_rows
from services.report_binding import normalize_confirmed,render
from services.conversation_agent import Answer
from services.conversation_transport import ConversationError

@pytest.mark.parametrize('unit',['10³/µL','10^3/uL','10^3/μl','10^{3}/µL','× 10³/µL','K/µL','10^9/L','G/L','10³/mm³','10^3/mm3'])
def test_equivalent_count_notation_keeps_correct_scale(unit):
    assert count_scale(unit)==9 and equivalent_count_units(unit,'10^9/L')
    assert unit_issue(unit) is None

@pytest.mark.parametrize('unit',['10^9/µL','10⁹/uL','G/µL','10^12/µL'])
def test_unsupported_micro_denominator_scale_never_becomes_within(unit):
    assert not equivalent_count_units(unit,'10³/µL')
    assert unit_issue(unit)=='count_unit_scale_unverified'
    assert status('7.41','4 - 10',unit)=='unknown'
    with pytest.raises(ConversationError,match='count-unit'):require_supported_units([{'unit':unit}])

def test_mass_units_are_not_confused_with_count_prefix():
    assert count_scale('g/L') is None and unit_issue('mg/dL') is None
    assert count_scale('10⁶/µL')==12
    assert equivalent_count_units('10⁶/µL','10^12/L')
    assert not equivalent_count_units('10³/µL','10^12/L')
    assert unit_issue('10^9/µI')=='count_unit_notation_unverified'
    assert status('7.41','4 - 10','10^9/µI')=='unknown'
    assert unit_issue('/10^9/L')=='count_unit_notation_unverified'
    assert unit_issue('103/µL')=='count_unit_notation_unverified'

@pytest.mark.parametrize('unit',['10³/µL','10^9/L'])
def test_source_to_confirmation_to_writer_keeps_exact_unit(unit):
    html=f'<table><tr><th>Test</th><th>Result</th><th></th><th>Unit</th><th>Reference</th><th>Method</th><th>Specimen</th></tr><tr><td colspan="7">COUNT PANEL</td></tr><tr><td>Unseen count marker</td><td>7.41</td><td></td><td>{unit}</td><td>4 - 10</td><td>Automated</td><td>Blood</td></tr></table>'
    copied=parse_html_rows(html);assert copied is not None and copied[0]['unit']==unit
    fields=normalize_confirmed([ReportField(**copied[0])]);assert fields[0]['unit']==unit and fields[0]['status']=='within'
    answer=Answer(reply='neutral',observation_ids=['r1'])
    render(answer,{'confirmed':True,'fields':fields},[],'en','Explain')
    assert unit in answer.reply and answer.observations[0].unit==unit

def test_bad_existing_confirmed_row_is_rejected_before_writer_display():
    field=ReportField(name='Unseen marker',value='7.41',unit='10^9/µL',reference='4 - 10')
    with pytest.raises(ConversationError) as exc:normalize_confirmed([field])
    assert exc.value.code=='unit_unverified'
    rows=normalize([field]);assert rows[0]['unit']==field.unit and rows[0]['status']=='unknown'
    with pytest.raises(ConversationError) as exc:render(Answer(reply='neutral'),{'confirmed':True,'fields':rows},[],'en','Explain')
    assert exc.value.code=='unit_unverified'

def test_superscript_source_cell_copied_without_llm_conversion():
    html='<table><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr><tr><td>Novel</td><td>7.41</td><td>10<sup>3</sup>/µL</td><td>4 - 10</td><td></td></tr></table>'
    assert parse_html_rows(html)[0]['unit']=='10³/µL'
    assert parse_html_rows(html.replace('<td>7.41','<td colspan="2">7.41')) is None

def test_structuring_rewrite_uses_proven_source_cell_not_clinical_guess():
    from services.ocr_binding import preserve_explicit_count_units
    source='<table><tr><td>· Novel count</td><td>7.41</td><td>10<sup>3</sup>/µL</td><td>4 - 10</td></tr></table>'
    field=ReportField(name='- Novel count',value='7.41',unit='10^9/µL',reference='4 - 10')
    proof=preserve_explicit_count_units([field],source)
    assert proof['copied']==1 and field.unit=='10³/µL'
    assert proof['unit_cells'][0]['structured_unit_before']=='10^9/µL'
    assert field.value=='7.41' and field.reference=='4 - 10'

@pytest.mark.parametrize('source',[
    '<table><tr><td>Novel count</td><td>7.41</td><td>10³/µL</td><td>10⁶/µL</td></tr></table>',
    '<table><tr><td>Other count</td><td>7.41</td><td>10³/µL</td></tr></table>',
    '<table><tr><td>Novel count</td><td>7.42</td><td>10³/µL</td></tr></table>'
])
def test_ambiguous_or_unmatched_source_never_repairs_units(source):
    from services.ocr_binding import preserve_explicit_count_units
    field=ReportField(name='Novel count',value='7.41',unit='10^9/µL')
    assert preserve_explicit_count_units([field],source)['copied']==0
    assert field.unit=='10^9/µL'

def test_source_that_already_has_bad_scale_is_not_repaired_from_lab_knowledge():
    from services.ocr_binding import preserve_explicit_count_units
    field=ReportField(name='Novel count',value='7.41',unit='10^9/µL')
    source='<table><tr><td>Novel count</td><td>7.41</td><td>10^9/µL</td></tr></table>'
    assert preserve_explicit_count_units([field],source)['copied']==0
    with pytest.raises(ConversationError):require_supported_units([field])
