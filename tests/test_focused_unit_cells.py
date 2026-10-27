import pytest
from services.focused_unit_cells import parse_focused_units

def test_explicit_math_exponent_and_newlines_are_preserved():
    assert parse_focused_units(r'{"units":"10\\(^3\\)/μL\n10\\(^6\\)/μL"}',2)==['10^3/μL','10^6/μL']
@pytest.mark.parametrize('raw',[
 '{"units":["103/µL"]}', '{"units":["10^9/µL"]}', '{"units":[]}',
 '{"units":["10^3/µL","10^6/µL"]}', '{"units":[null]}'
])
def test_ambiguous_or_wrong_count_scale_is_never_guessed(raw):
    with pytest.raises((ValueError,TypeError)):parse_focused_units(raw,1)
