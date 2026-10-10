from tests.benchmark.doubles import parse_rows


def test_layout_parser_retains_sex_label_unit_and_qualitative_reference():
    text="Parameters    Results    Flags    Units    Reference ranges\nSynthetic Marker    4.1    H    mg/dL    Female 2.0 - 3.8 mg/dL\nOther Marker    Negative    -    Not established\nREPORTED BY: somebody"
    rows=parse_rows(text)
    assert rows==[{'name':'Synthetic Marker','value':'4.1','unit':'mg/dL','reference':'Female 2.0 - 3.8 mg/dL','printed_flag':'H'},
                  {'name':'Other Marker','value':'Negative','unit':'-','reference':'Not established','printed_flag':''}]


def test_no_clinical_repair_of_uncertain_ocr_number():
    row=parse_rows('Test Name    Result    Unit    Reference Value\nMade Up Marker    108    mg/dL    H    03-15')[0]
    assert row['value']=='108' and row['reference']=='03-15'
