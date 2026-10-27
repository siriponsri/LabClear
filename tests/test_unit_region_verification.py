from io import BytesIO
import pytest
from PIL import Image
from services.unit_region_verification import crop_region,parse_unit_rows,proposed_count_units

def source():
    im=Image.new('RGB',(100,80),'white');out=BytesIO();im.save(out,format='PNG');return out.getvalue()

def test_crop_bounds_and_immutable_source():
    raw=source();old=raw[:];crop,proof=crop_region(raw,(5,6,40,30),3)
    assert raw==old and Image.open(BytesIO(crop)).size==(120,90)
    assert proof['source_rect_xywh']==[5,6,40,30] and not proof['independent_source_sample']

@pytest.mark.parametrize('rect',[(-1,0,10,10),(90,0,20,10),(0,0,0,5),(0,0,101,5)])
def test_bad_coordinates_rejected(rect):
    with pytest.raises(ValueError):crop_region(source(),rect)

def test_unit_only_candidate_never_changes_field_or_confirms():
    _,proof=crop_region(source(),(0,0,50,30))
    field={'name':'Synthetic count','value':'7.1','unit':'10^9/µL','reference':'unchanged'}
    row={'name':'Synthetic count','value':'7.1','unit':'10³/µL'}
    result=proposed_count_units([field],[row],proof)
    assert result[0]['requires_human_confirmation'] and not result[0]['source_ocr_reading_corrected']
    assert field['unit']=='10^9/µL' and field['reference']=='unchanged'

@pytest.mark.parametrize('rows',[
 [{'name':'Synthetic count','value':'7.2','unit':'10³/µL'}],
 [{'name':'Other count','value':'7.1','unit':'10³/µL'}],
 [{'name':'Synthetic count','value':'7.1','unit':'10^9/µL'}],
 [{'name':'Synthetic count','value':'7.1','unit':'10³/µL'}]*2,
])
def test_no_guess_from_bad_or_ambiguous_evidence(rows):
    _,proof=crop_region(source(),(0,0,50,30))
    assert not proposed_count_units([{'name':'Synthetic count','value':'7.1','unit':'bad'}],rows,proof)

def test_explicit_html_superscript_is_preserved():
    rows=parse_unit_rows('<table><tr><th>Test</th><th>Result</th><th>Unit</th></tr><tr><td>Synthetic count</td><td>7.1</td><td>10<sup>3</sup>/µL</td></tr></table>')
    assert rows[0]['unit']=='10³/µL'

def test_literal_list_shape_keeps_ambiguous_plain_digits_unmodified():
    rows=parse_unit_rows("{'rows': [['Synthetic count', '7.1', '103/µL']]}")
    assert rows[0]['unit']=='103/µL'
    _,proof=crop_region(source(),(0,0,50,30))
    assert not proposed_count_units([{'name':'Synthetic count','value':'7.1','unit':'bad'}],rows,proof)

def test_literal_parser_never_executes_code():
    with pytest.raises((ValueError,SyntaxError)):
        parse_unit_rows("{'rows': __import__('os').getcwd()}")

@pytest.mark.parametrize('raw',['not a table','<table><tr><td>unit</td></tr>','{"rows":[{"name":"x","value":7,"unit":"u"}]}'])
def test_malformed_focused_response_rejected(raw):
    with pytest.raises((ValueError,TypeError)):parse_unit_rows(raw)
