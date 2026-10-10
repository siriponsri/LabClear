"""Parse explicit HTML table cells as data; never render or infer a missing cell.

Typhoon OCR's documented native table format is HTML. Ambiguous spans, unknown
tables and partial rows fall back to the guarded extraction path as a whole.
"""
from html.parser import HTMLParser
import re
from services.ocr_table import _header

_SUPER = str.maketrans('0123456789+-=()', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾')
_SUB = str.maketrans('0123456789+-=()', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎')
_FLAGS = {'', '-', '–', '—', 'H', 'L', 'HH', 'LL', 'N', '*', '**', '!', '!!', 'C', 'CRIT', 'CRITICAL', 'PANIC', 'H*', 'L*'}

class _Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables=[]; self.table=None; self.row=None; self.cell=None
        self.script=''; self.invalid=False

    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='table':
            if self.table is not None:self.invalid=True;return
            self.table=[]
        elif self.table is not None:
            if tag=='tr':
                if self.row is not None:self.invalid=True
                self.row=[]
            elif tag in {'td','th'}:
                if self.row is None or self.cell is not None:self.invalid=True
                if any(attrs.get(k,'1')!='1' for k in ('rowspan','colspan')):self.invalid=True
                self.cell=[]
            elif self.cell is not None:
                if tag=='br':self.cell.append(' ')
                elif tag in {'sup','sub'}:self.script=tag
                elif tag not in {'b','strong','i','em','span','p'}:self.invalid=True

    def handle_endtag(self, tag):
        if tag in {'td','th'}:
            if self.cell is None or self.row is None:self.invalid=True;return
            self.row.append(''.join(self.cell).strip());self.cell=None;self.script=''
        elif tag=='tr':
            if self.row is None or self.cell is not None or self.table is None:self.invalid=True;return
            if len(self.row)>12:self.invalid=True
            self.table.append(self.row);self.row=None
            if len(self.table)>65:self.invalid=True
        elif tag=='table':
            if self.table is None or self.row is not None or self.cell is not None:self.invalid=True;return
            self.tables.append(self.table);self.table=None
        elif tag in {'sup','sub'}:self.script=''

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data.translate(_SUPER if self.script=='sup' else _SUB) if self.script else data)


def parse_html_rows(text):
    if len(text)>50000 or not re.search(r'<table\b',text,re.I):return None
    parser=_Tables()
    try:parser.feed(text);parser.close()
    except (ValueError,AssertionError):return None
    if parser.invalid or parser.table is not None or not parser.tables:return None
    rows=[]
    for table in parser.tables:
        if len(table)<2:return None
        headers=table[0]
        if len(headers)!=5:return None
        mapping=_header(headers)
        if mapping is None:
            # A visibly separate unnamed flag column may be identified only when
            # all other headers are explicit and EVERY cell is a flag marker.
            blanks=[i for i,h in enumerate(headers) if not h.strip()]
            if len(headers)!=5 or len(blanks)!=1:return None
            candidate=list(headers);candidate[blanks[0]]='Flag';mapping=_header(candidate)
            if mapping is None:return None
            if any(len(r)!=5 or r[blanks[0]].upper() not in _FLAGS for r in table[1:]):return None
        for cells in table[1:]:
            if len(cells)!=len(headers):return None
            row={key:cells[column] for key,column in mapping.items()}
            if not row['name'] or len(row['name'])>100:return None
            if any(len(value)>(60 if key=='unit' else 25 if key=='printed_flag' else 150) for key,value in row.items()):return None
            if row['printed_flag'] in {'-','–','—'}:row['printed_flag']=''
            rows.append(row)
            if len(rows)>60:return None
    return rows or None
