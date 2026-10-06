from services.lab_parser import build_symbolic_context, extract_lab_values


def test_parser_flags_against_supplied_range_only():
    values = extract_lab_values("Hb 10.8 g/dL (12-16), MCV 72 fL (80-100), Ferritin 7 ng/mL (15-150)")
    assert [v.marker.lower() for v in values] == ["hb", "mcv", "ferritin"]
    assert [v.flag for v in values] == ["low", "low", "low"]


def test_parser_keeps_no_range_as_unknown():
    values = extract_lab_values("HbA1c 6.1%")
    assert len(values) == 1
    assert values[0].flag == "unknown"


def test_symbolic_context_does_not_invent_range():
    values = extract_lab_values("LDL 162 mg/dL")
    context = build_symbolic_context(values)
    assert "no supplied reference range" in context
    assert "deterministic flag=unknown" in context


def test_inclusive_range_boundaries_are_within():
    values = extract_lab_values("ALT 0 U/L (0-40), AST 40 U/L (0-40)")
    assert [item.flag for item in values] == ["within", "within"]
    assert all(item.range_state == "valid" for item in values)


def test_reversed_range_is_invalid_and_never_flagged():
    value = extract_lab_values("Hb 10.8 g/dL (16-12)")[0]
    assert value.range_state == "invalid"
    assert value.flag == "unknown"
