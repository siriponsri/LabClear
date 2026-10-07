"""Apply persistent TOC defaults to a new copy, preserving other report formatting."""
import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
NS = {'w': W[1:-1]}

def apply_parts(parts):
    config = json.loads((Path(__file__).resolve().parents[1] / 'references/toc-format.json').read_text(encoding='utf-8'))
    def font_properties(parent):
        rp = parent.find(W + 'rPr')
        if rp is None:
            rp = E.Element(W + 'rPr')
            if parent.tag == W + 'r':
                parent.insert(0, rp)
            else:
                parent.append(rp)
        font = config['font']
        # Explicit values prevent Heading/Hyperlink styles from restoring effects.
        for child in list(rp):
            if E.QName(child).localname in ('glow', 'shadow', 'reflection', 'textOutline', 'textFill', 'scene3d', 'props3d'):
                rp.remove(child)
        values = {
            'rFonts': {key: font['name'] for key in ('ascii', 'hAnsi', 'eastAsia', 'cs')},
            'sz': {'val': font['size_half_points']}, 'szCs': {'val': font['size_half_points']},
            'color': {'val': font['color']}, 'u': {'val': font['underline']},
            'vertAlign': {'val': 'baseline'}, 'effect': {'val': 'none'},
        }
        for name in ('b', 'bCs', 'i', 'iCs', 'strike', 'dstrike', 'outline', 'shadow',
                     'emboss', 'imprint', 'smallCaps', 'caps', 'vanish', 'webHidden', 'specVanish'):
            values[name] = {'val': 0}
        for name, attrs in values.items():
            for previous in rp.findall(W + name):
                rp.remove(previous)
            E.SubElement(rp, W + name, {W + k: str(v) for k, v in attrs.items()})

    def paragraph_properties(parent, values):
        pp = parent.find(W + 'pPr')
        if pp is None:
            pp = E.SubElement(parent, W + 'pPr')
        for name, attrs in [('spacing', config['spacing']), ('ind', values)]:
            node = pp.find(W + name)
            if node is None:
                node = E.SubElement(pp, W + name)
            node.attrib.clear()
            node.attrib.update({W + key: str(value) for key, value in attrs.items()})
    styles = E.fromstring(parts['word/styles.xml'])
    for sid, values in config['styles'].items():
        st = styles.find(f"w:style[@w:styleId='{sid}']", NS)
        if st is None:
            st = E.SubElement(styles, W + 'style', {W + 'type': 'paragraph', W + 'styleId': sid})
            E.SubElement(st, W + 'name', {W + 'val': 'toc ' + sid[-1]})
        for automatic in st.findall(W + 'autoRedefine'):
            st.remove(automatic)
        paragraph_properties(st, values)
        font_properties(st)
    doc = E.fromstring(parts['word/document.xml'])
    for p in doc.findall('.//w:p', NS):
        sid = p.find('w:pPr/w:pStyle', NS)
        if sid is not None and sid.get(W + 'val') in config['styles']:
            paragraph_properties(p, config['styles'][sid.get(W + 'val')])
            font_properties(p.find(W + 'pPr'))
            for run in p.findall('.//w:r', NS):
                font_properties(run)
    # Fields can span runs; normalize only heading TOCs, never caption lists.
    def normalize(nodes, code):
        if re.match(r'^\s*TOC\b', code, re.I) and not re.search(r'\\[ca]\s', code, re.I):
            code = re.sub(r'\\o\s+"[^"]*"', '', code, flags=re.I)
            # Use exactly heading levels 1-3; omit extra style/outline selectors.
            code = re.sub(r'\\t\s+"[^"]*"|\\u\b', '', code, flags=re.I)
            code = code.rstrip() + ' \\o "1-3" '
            nodes[0].text = code
            for node in nodes[1:]:
                node.text = ''
    stack = []
    for node in doc.iter():
        if node.tag == W + 'fldChar':
            kind = node.get(W + 'fldCharType')
            if kind == 'begin':
                stack.append([])
            elif kind == 'separate' and stack and stack[-1]:
                normalize(stack[-1], ''.join(n.text or '' for n in stack[-1]))
            elif kind == 'end' and stack:
                stack.pop()
        elif node.tag == W + 'instrText' and stack:
            stack[-1].append(node)
    for node in doc.findall('.//w:fldSimple', NS):
        code = node.get(W + 'instr', '')
        dummy = E.Element('code')
        dummy.text = code
        normalize([dummy], code)
        node.set(W + 'instr', dummy.text)
    for name, root in [('word/styles.xml', styles), ('word/document.xml', doc)]:
        parts[name] = E.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    return parts

def apply_file(source, output):
    with ZipFile(source) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    apply_parts(parts)
    target = Path(output).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'x', ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    apply_file(args.input, args.output)
