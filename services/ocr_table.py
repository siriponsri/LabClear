"""Read explicit OCR Markdown columns without a second model rearranging cells.

Only complete, unambiguous tables with all five named columns are accepted.
No clinical dictionary, expected answer, missing-cell repair or row inference.
"""
import re

_HEADERS = {
    'name': {'test', 'testname', 'parameter', 'parameters', 'analyte'},
    'value': {'result', 'results', 'value'},
    'unit': {'unit', 'units'},
    'reference': {'reference', 'referencevalue', 'referencevalues', 'referencerange', 'referenceranges'},
    'printed_flag': {'flag', 'flags', 'abnormalflag'},
}


def _cells(line):
    line = line.strip()
    if '|' not in line:
        return None
    # Escaped pipes in a printed cell must not change its column.
    parts = re.split(r'(?<!\\)\|', line)
    if not parts[0].strip():parts.pop(0)
    if parts and not parts[-1].strip():parts.pop()
    return [part.strip().replace(r'\|', '|') for part in parts]


def _header(cells):
    if not cells:return None
    found = {}
    for index, cell in enumerate(cells):
        key = re.sub(r'[^a-z]', '', cell.casefold())
        matches = [name for name, choices in _HEADERS.items() if key in choices]
        if matches:
            if matches[0] in found:return None
            found[matches[0]] = index
    return found if len(found) == len(_HEADERS) else None


def parse_markdown_rows(text):
    lines = text.splitlines()
    rows, table_count = [], 0
    index = 0
    while index < len(lines):
        cells = _cells(lines[index]);mapping = _header(cells)
        if mapping is None:
            # A second unknown table or an orphan row must not silently disappear.
            if cells and len(cells) >= 4:
                return None
            index += 1;continue
        if index + 1 >= len(lines):return None
        separator = _cells(lines[index + 1])
        if not separator or len(separator) != len(cells) or not all(re.fullmatch(r':?-{3,}:?', c) for c in separator):
            return None
        table_count += 1;index += 2;count = 0
        while index < len(lines):
            values = _cells(lines[index])
            if values is None:break
            if len(values) != len(cells):return None
            row = {name: re.sub(r'<br\s*/?>', ' ', values[column], flags=re.I).strip()
                   for name, column in mapping.items()}
            if not row['name']:return None
            # A no-flag marker is not a negative value or a missing unit.
            if row['printed_flag'] in {'-', '–', '—'}:row['printed_flag'] = ''
            rows.append(row);count += 1;index += 1
            if len(rows) > 60:return None
        if not count:return None
    return rows if table_count and rows else None
