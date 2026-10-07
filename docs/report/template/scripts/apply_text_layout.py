"""Set report text layout on a new DOCX copy; leave semantic text and breaks intact."""
import argparse
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
NS = {'w': W[1:-1]}

def prop(parent, name, **attrs):
    node = parent.find(W + name)
    if node is None:
        node = E.SubElement(parent, W + name)
    node.attrib.clear()
    node.attrib.update({W + k: str(v) for k, v in attrs.items()})
    return node

def ensure(parent, name):
    node = parent.find(W + name)
    if node is None:
        node = E.Element(W + name)
        parent.insert(0, node)
    return node

def paragraph_spacing(pp):
    spacing = pp.find(W + 'spacing')
    if spacing is None:
        spacing = E.SubElement(pp, W + 'spacing')
    spacing.set(W + 'after', '120')
    spacing.set(W + 'afterAutospacing', '0')
    spacing.attrib.pop(W + 'afterLines', None)
    prop(pp, 'contextualSpacing', val=0)


def run_defaults(rp):
    for name, value in [('w', 100), ('spacing', 0), ('position', 0), ('noProof', 1)]:
        prop(rp, name, val=value)
    for fit in rp.findall(W + 'fitText'):
        rp.remove(fit)

def apply_parts(parts):
    styles = E.fromstring(parts['word/styles.xml'])
    style_map = {s.get(W + 'styleId'): s for s in styles.findall(W + 'style')}
    def protected(sid):
        seen = set()
        while sid and sid not in seen:
            seen.add(sid)
            if re.match(r'^(Heading|Title|Subtitle|Caption|TOC|TableofFigures|Header|Footer)', sid, re.I):
                return True
            st = style_map.get(sid)
            if st is None:
                break
            if st.find('w:pPr/w:outlineLvl', NS) is not None:
                return True
            base = st.find(W + 'basedOn')
            sid = base.get(W + 'val') if base is not None else None
        return False
    defaults = ensure(styles, 'docDefaults')
    run_defaults(ensure(ensure(defaults, 'rPrDefault'), 'rPr'))
    pp = ensure(ensure(defaults, 'pPrDefault'), 'pPr')
    prop(pp, 'jc', val='left')
    prop(pp, 'wordWrap', val=1)
    paragraph_spacing(pp)
    for sid, st in style_map.items():
        run_defaults(ensure(st, 'rPr'))
        if st.get(W + 'type') == 'paragraph':
            pp = ensure(st, 'pPr')
            prop(pp, 'wordWrap', val=1)
            paragraph_spacing(pp)
            if not protected(sid):
                prop(pp, 'jc', val='left')
    parts['word/styles.xml'] = E.tostring(styles, xml_declaration=True, encoding='UTF-8', standalone=True)
    for name in list(parts):
        if not re.fullmatch(r'word/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml', name):
            continue
        root = E.fromstring(parts[name])
        header_rows = set()
        for table in root.findall('.//w:tbl', NS):
            rows = table.findall('w:tr', NS)
            marked = [row for row in rows if row.find('w:trPr/w:tblHeader', NS) is not None
                      and row.find('w:trPr/w:tblHeader', NS).get(W + 'val', '1') not in ('0', 'false', 'off')]
            header_rows.update(marked or rows[:1])
        for p in root.findall('.//w:p', NS):
            pp = ensure(p, 'pPr')
            st = pp.find(W + 'pStyle')
            sid = st.get(W + 'val', '') if st is not None else ''
            in_cell = any(a.tag == W + 'tc' for a in p.iterancestors())
            in_body = name == 'word/document.xml'
            if in_cell or (in_body and not protected(sid) and pp.find(W + 'outlineLvl') is None):
                prop(pp, 'jc', val='left')
            prop(pp, 'wordWrap', val=1)
            paragraph_spacing(pp)
            run_defaults(ensure(pp, 'rPr'))
            nearest_row = next((a for a in p.iterancestors() if a.tag == W + 'tr'), None)
            if nearest_row in header_rows:
                prop(pp, 'jc', val='center')
                for rp in [ensure(pp, 'rPr')] + [ensure(r, 'rPr') for r in p.findall('.//w:r', NS)]:
                    prop(rp, 'b', val=1)
                    prop(rp, 'bCs', val=1)
        for r in root.findall('.//w:r', NS):
            rp = ensure(r, 'rPr')
            run_defaults(rp)
            if re.search(r'[\u0e01-\u0e5b]', ''.join(r.itertext())):
                lang = rp.find(W + 'lang')
                if lang is None:
                    lang = E.SubElement(rp, W + 'lang')
                lang.set(W + 'val', 'th-TH')
        for tc in root.findall('.//w:tc', NS):
            tcp = ensure(tc, 'tcPr')
            prop(tcp, 'vAlign', val='top')
            prop(tcp, 'noWrap', val=0)
            prop(tcp, 'tcFitText', val=0)
        for height in root.findall('.//w:trHeight', NS):
            height.set(W + 'hRule', 'atLeast')
        for proof in root.findall('.//w:proofErr', NS):
            proof.getparent().remove(proof)
        parts[name] = E.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    settings = E.fromstring(parts['word/settings.xml'])
    prop(settings, 'hideSpellingErrors', val=1)
    prop(settings, 'hideGrammaticalErrors', val=1)
    parts['word/settings.xml'] = E.tostring(settings, xml_declaration=True, encoding='UTF-8', standalone=True)
    return parts

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    with ZipFile(args.input) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    apply_parts(parts)
    target = Path(args.output).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'x', ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)
