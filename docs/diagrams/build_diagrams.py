#!/usr/bin/env python3
"""Generate the LabClear architecture and message-flow diagrams (editorial SVG style).

Two passes: text widths are measured in Chromium (Playwright) with the same
embedded fonts, then label masks / tags / legend positions are sized exactly.

Usage (from the repository root, needs `pip install playwright` and Chromium):
    python docs/diagrams/build_diagrams.py
Writes docs/diagrams/{architecture,message-flow}.html and docs/assets/{architecture,message-flow}.png
"""
from __future__ import annotations

import base64
import json
from html import escape
from pathlib import Path

import tempfile

REPO = Path(__file__).resolve().parents[2]
FONTS = REPO / "static" / "fonts"
OUT = Path(__file__).resolve().parent
PNG_OUT = REPO / "docs" / "assets"
TMP = Path(tempfile.mkdtemp(prefix="labclear-diagrams-"))

# LabClear brand tokens mapped onto diagram-design roles (accent used sparingly)
PAPER = "#f8f8ff"
INK = "#21172f"
MUTED = "#61586f"
SOFT = "#8d819d"
ACCENT = "#8a2be2"
LINK = "#2e5aa8"
INK_RGB = "33,23,47"
MUTED_RGB = "97,88,111"
SOFT_RGB = "141,129,157"
ACC_RGB = "138,43,226"

SANS = "'Geist','Noto Sans Thai',sans-serif"
MONO = "'Geist Mono','Noto Sans Thai',monospace"
THAI = "'Noto Sans Thai','Geist',sans-serif"

# ---------------------------------------------------------------- measuring
CACHE_FILE = TMP / "text-widths.json"
_cache: dict[str, float] = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
_missing: dict[str, tuple] = {}


def _key(text, family, size, weight, ls):
    return f"{family}|{size}|{weight}|{ls}|{text}"


def tw(text: str, family: str, size: float, weight: int = 400, ls: float = 0.0) -> float:
    k = _key(text, family, size, weight, ls)
    if k in _cache:
        return _cache[k]
    _missing[k] = (text, family, size, weight, ls)
    return len(text) * size * 0.62 + len(text) * ls * size


def is_thai(s: str) -> bool:
    return any("฀" <= ch <= "๿" for ch in s)


def font_css() -> str:
    def b64(p):
        return base64.b64encode((FONTS / p).read_bytes()).decode()

    return (
        "@font-face{font-family:'Geist';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:100 900;}"
        "@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:100 900;}"
        "@font-face{font-family:'Noto Sans Thai';src:url(data:font/ttf;base64,%s) format('truetype');font-weight:100 900;}"
        % (b64("geist-variable.woff2"), b64("geist-mono-variable.woff2"), b64("NotoSansThai.ttf"))
    )


def measure_missing():
    if not _missing:
        return False
    from playwright.sync_api import sync_playwright

    items = list(_missing.items())
    spans = "".join(
        f'<span id="m{i}" style="font-family:{fam};font-size:{sz}px;font-weight:{wt};'
        f'letter-spacing:{ls}em;white-space:pre;position:absolute;left:0;top:{i*30}px">{escape(t)}</span>'
        for i, (_, (t, fam, sz, wt, ls)) in enumerate(items)
    )
    html = f"<html><head><style>{font_css()}</style></head><body>{spans}</body></html>"
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.set_content(html)
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(300)
        widths = pg.evaluate(
            "n => Array.from({length:n}, (_, i) => document.getElementById('m'+i).getBoundingClientRect().width)",
            len(items),
        )
        b.close()
    for (k, _), w in zip(items, widths):
        _cache[k] = round(w, 2)
    _missing.clear()
    CACHE_FILE.write_text(json.dumps(_cache, ensure_ascii=False))
    return True


# ---------------------------------------------------------------- primitives
def snap(v: float, g: int = 4) -> int:
    return int(-(-v // g) * g)


NODE_STYLE = {
    "focal": (f"rgba({ACC_RGB},0.08)", ACCENT, f"rgba({ACC_RGB},0.50)", ACCENT),
    "backend": ("#ffffff", INK, f"rgba({INK_RGB},0.40)", INK),
    "store": (f"rgba({INK_RGB},0.05)", MUTED, f"rgba({MUTED_RGB},0.50)", MUTED),
    "external": (f"rgba({INK_RGB},0.03)", f"rgba({INK_RGB},0.30)", f"rgba({INK_RGB},0.22)", SOFT),
    "input": (f"rgba({MUTED_RGB},0.10)", SOFT, f"rgba({SOFT_RGB},0.40)", SOFT),
}


def node(x, y, w, h, kind, tag, name, sub, name_size=17, sub_size=12):
    fill, stroke, tag_stroke, tag_text = NODE_STYLE[kind]
    tag_fs = 9
    tag_w = snap(tw(tag, MONO, tag_fs, 500, 0.08) + 12)
    cx = x + w / 2
    name_font = THAI if is_thai(name) else SANS
    sub_font = THAI if is_thai(sub) else MONO
    name_y = y + h / 2 + 4
    sub_y = name_y + sub_size + 8
    return f"""
  <g>
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER}"/>
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="1"/>
    <rect x="{x+8}" y="{y+8}" width="{tag_w}" height="14" rx="2" fill="none" stroke="{tag_stroke}" stroke-width="0.8"/>
    <text x="{x+8+tag_w/2}" y="{y+18.5}" fill="{tag_text}" font-size="{tag_fs}" font-weight="500" font-family="{MONO}" text-anchor="middle" letter-spacing="0.08em">{escape(tag)}</text>
    <text x="{cx}" y="{name_y}" fill="{INK}" font-size="{name_size}" font-weight="600" font-family="{name_font}" text-anchor="middle">{escape(name)}</text>
    <text x="{cx}" y="{sub_y}" fill="{MUTED}" font-size="{sub_size}" font-family="{sub_font}" text-anchor="middle">{escape(sub)}</text>
  </g>"""


def label(cx, cy, text, color, size=11):
    """Masked label centred at (cx, cy). Mask 14px tall (verify-geometry plate)."""
    thai = is_thai(text)
    fam = THAI if thai else MONO
    ls = 0 if thai else 0.06
    w = snap(tw(text, fam, size, 500, ls) + 12)
    return (
        f'\n  <rect x="{cx - w/2}" y="{cy - 7}" width="{w}" height="14" rx="2" fill="{PAPER}"/>'
        f'\n  <text x="{cx}" y="{cy + 4}" fill="{color}" font-size="{size}" font-weight="500" '
        f'font-family="{fam}" text-anchor="middle" letter-spacing="{ls}em">{escape(text)}</text>'
    ), w


def eyebrow(x, y, text, color, size=9, ls=0.14, anchor="start"):
    """Tracked mono eyebrow; any Thai segment after ' · ' is set untracked in Noto Sans Thai."""
    latin, _, thai = text.partition(" · ")
    w = tw(latin + " · ", MONO, size, 500, ls) + (tw(thai, THAI, size + 1, 500, 0) if thai else 0)
    spans = f'<tspan font-family="{MONO}" letter-spacing="{ls}em">{escape(latin)}{" · " if thai else ""}</tspan>'
    if thai:
        spans += f'<tspan font-family="{THAI}" font-size="{size + 1}" letter-spacing="0">{escape(thai)}</tspan>'
    svg = (f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" font-weight="500" '
           f'text-anchor="{anchor}">{spans}</text>')
    return svg, w


def zone(x, y, w, h, text, label_cx):
    t, tw_ = eyebrow(label_cx, y + 13.5, text, f"rgba({INK_RGB},0.52)", anchor="middle")
    lw = snap(tw_ + 12)
    return f"""
  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="rgba({INK_RGB},0.02)" stroke="rgba({INK_RGB},0.12)" stroke-width="0.8"/>
  <rect x="{label_cx - lw/2}" y="{y + 4}" width="{lw}" height="12" rx="2" fill="{PAPER}"/>
  {t}"""


def defs():
    m = lambda i, c: (
        f'<marker id="{i}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">'
        f'<polygon points="0 0, 8 3, 0 6" fill="{c}"/></marker>'
    )
    return f"""
  <defs>
    <pattern id="rs-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" fill="rgba({INK_RGB},0.10)"/></pattern>
    {m('rs-arrow', MUTED)}
    {m('rs-arrow-accent', ACCENT)}
    {m('rs-arrow-link', LINK)}
  </defs>
  <rect width="100%" height="100%" fill="{PAPER}"/>
  <rect width="100%" height="100%" fill="url(#rs-dots)" opacity="0.55"/>"""


def legend(y, x0, x1, items):
    """items: ('box', kind, text) | ('line', color, dashed, marker, width, text)"""
    out = [
        f'\n  <line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="rgba({INK_RGB},0.12)" stroke-width="0.8"/>',
        "\n  " + eyebrow(x0, y + 20, "LEGEND · คำอธิบายสัญลักษณ์", MUTED, ls=0.18)[0],
    ]
    x = x0
    row_y = y + 44
    for it in items:
        txt = it[-1]
        fs = 11.5
        twidth = tw(txt, THAI, fs, 400, 0)
        if it[0] == "box":
            fill, stroke, *_ = NODE_STYLE[it[1]]
            sw = 16
            item_w = sw + 6 + twidth
            if x + item_w > x1:
                x, row_y = x0, row_y + 24
            out.append(f'\n  <rect x="{x}" y="{row_y - 9}" width="{sw}" height="11" rx="2" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
            out.append(f'\n  <text x="{x + sw + 6}" y="{row_y}" fill="{MUTED}" font-size="{fs}" font-family="{THAI}">{escape(txt)}</text>')
        else:
            _, color, dashed, marker, width, _ = it
            sw = 28
            item_w = sw + 8 + twidth
            if x + item_w > x1:
                x, row_y = x0, row_y + 24
            dash = ' stroke-dasharray="4,3"' if dashed else ""
            out.append(f'\n  <line x1="{x}" y1="{row_y - 4}" x2="{x + sw}" y2="{row_y - 4}" stroke="{color}" stroke-width="{width}"{dash} marker-end="url(#{marker})"/>')
            out.append(f'\n  <text x="{x + sw + 8}" y="{row_y}" fill="{MUTED}" font-size="{fs}" font-family="{THAI}">{escape(txt)}</text>')
        x = snap(x + item_w + 18)
    return "".join(out), row_y


def page(title, eyebrow, svg, svg_w):
    return f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(title)}</title>
__FONTS__
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:{SANS};background:{PAPER};color:{INK};padding:2rem;display:flex;justify-content:center}}
.frame{{width:{svg_w}px;max-width:100%}}
.eyebrow{{font-family:{MONO};font-size:.66rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:{MUTED};margin-bottom:.4rem}}
h1{{font-family:{THAI};font-size:1.6rem;font-weight:600;line-height:1.3;margin-bottom:1rem}}
svg{{width:100%;display:block}}
</style>
</head>
<body>
<div class="frame">
<p class="eyebrow">{escape(eyebrow)}</p>
<h1>{escape(title)}</h1>
{svg}
</div>
</body>
</html>
"""


# ---------------------------------------------------------------- architecture
def architecture():
    W, H = 800, 788
    C = [32, 292, 552]  # column x
    CW = 216
    cx = [c + CW / 2 for c in C]  # 140, 400, 660
    NH = 80
    r1, r2, r3, r4 = 56, 232, 392, 568

    parts = [defs()]
    # zones (bg -> zones -> arrows -> labels -> nodes)
    parts.append(zone(16, r1 - 32, 768, NH + 48, "USERS · ผู้ใช้งาน", 400))
    parts.append(zone(16, r2 - 32, 768, (r3 + NH) - r2 + 48, "RENDER WEB SERVICE · แอปพลิเคชัน", 400))
    parts.append(zone(16, r4 - 32, 768, NH + 48, "DATA & MODELS · ข้อมูลและโมเดล", 530))

    ln = lambda x1, y1, x2, y2, c, m, sw=1.2: (
        f'\n  <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{sw}" marker-end="url(#{m})"/>'
    )
    # users -> API (link blue)
    parts.append(ln(cx[0], r1 + NH, cx[0], r2, LINK, "rs-arrow-link"))
    parts.append(ln(cx[2], r1 + NH, cx[2], r2, LINK, "rs-arrow-link"))
    # API -> modules
    parts.append(ln(cx[0], r2 + NH, cx[0], r3, ACCENT, "rs-arrow-accent", 1.6))
    parts.append(ln(cx[1], r2 + NH, cx[1], r3, MUTED, "rs-arrow"))
    parts.append(ln(cx[2], r2 + NH, cx[2], r3, MUTED, "rs-arrow"))
    # modules -> data
    parts.append(ln(cx[0], r3 + NH, cx[0], r4, MUTED, "rs-arrow"))
    parts.append(ln(cx[1], r3 + NH, cx[1], r4, MUTED, "rs-arrow"))
    parts.append(ln(cx[2], r3 + NH, cx[2], r4, MUTED, "rs-arrow"))
    # pipeline -> AI : gutter route, two r=8 elbows, enters AI from the left
    gx = (C[0] + CW + C[1]) / 2  # 270
    py = r3 + NH / 2
    ay = r4 + NH / 2
    parts.append(
        f'\n  <path d="M {C[0]+CW},{py} H {gx-8} Q {gx},{py} {gx},{py+8} V {ay-8} Q {gx},{ay} {gx+8},{ay} H {C[1]}" '
        f'fill="none" stroke="{MUTED}" stroke-width="1.2" marker-end="url(#rs-arrow)"/>'
    )

    # labels
    mid12 = (r1 + NH + 16 + r2 - 32) / 2  # between users zone and render zone
    mid23 = (r2 + NH + r3) / 2
    mid34 = (r3 + NH + 16 + r4 - 32) / 2
    for x, y, t, c in [
        (cx[0], mid12, "HTTPS", LINK),
        (cx[2], mid12, "HTTPS", LINK),
        (cx[0], mid23, "POST /CHAT", ACCENT),
        (cx[1], mid23, "/REPORTS/READ", MUTED),
        (cx[2], mid23, "/BOOKINGS · /PAY", MUTED),
        (cx[0], mid34, "ค้นข้อมูล", MUTED),
        (gx, mid34, "5 CALLS/ข้อความ", MUTED),
        (cx[1], mid34, "OCR · LLM", MUTED),
        (cx[2], mid34, "SQL", MUTED),
    ]:
        parts.append(label(x, y, t, c)[0])

    # nodes
    parts.append(node(C[0], r1, CW, NH, "input", "WEB", "ลูกค้า", "หน้าเว็บ · แชท · อ่านผลแลป"))
    parts.append(node(C[2], r1, CW, NH, "input", "STAFF", "เจ้าหน้าที่ร้าน", "/staff · ยืนยันคิว · ดูงบ"))
    parts.append(node(C[0], r2, C[2] + CW - C[0], NH, "backend", "API", "FastAPI · Business API",
                      "/api/business/* · session · CSRF · rate limit · access code"))
    parts.append(node(C[0], r3, CW, NH, "focal", "CORE", "Chatbot pipeline", "guard·plan·answer·review"))
    parts.append(node(C[1], r3, CW, NH, "backend", "OCR", "อ่านใบผลแลป", "OCR → ค่า → สถานะ"))
    parts.append(node(C[2], r3, CW, NH, "backend", "BIZ", "จองคิว · ชำระเงิน", "แพ็กเกจ · Plus · staff"))
    parts.append(node(C[0], r4, CW, NH, "store", "RAG", "คลังความรู้", "BM25 · 58 แหล่ง · catalog"))
    parts.append(node(C[1], r4, CW, NH, "external", "API", "Typhoon · OpenRouter", "LLM · OCR · Llama Guard 4"))
    parts.append(node(C[2], r4, CW, NH, "store", "DB", "PostgreSQL", "เข้ารหัส · ledger 300 บาท"))

    leg, last_y = legend(r4 + NH + 48, 16, 784, [
        ("box", "focal", "จุดหลัก"),
        ("box", "backend", "โมดูลในแอป"),
        ("box", "store", "ที่เก็บข้อมูล"),
        ("box", "external", "บริการภายนอก"),
        ("box", "input", "ผู้ใช้"),
        ("line", LINK, False, "rs-arrow-link", 1.2, "คำขอ HTTPS"),
        ("line", ACCENT, False, "rs-arrow-accent", 1.6, "เส้นทางแชท"),
        ("line", MUTED, False, "rs-arrow", 1.2, "เรียกใช้ภายใน"),
    ])
    parts.append(leg)
    H = snap(last_y + 20)

    svg = (
        f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-labelledby="rs-arch-title rs-arch-desc">\n'
        f'  <title id="rs-arch-title">สถาปัตยกรรมระบบ LabClear</title>\n'
        f'  <desc id="rs-arch-desc">ลูกค้าและเจ้าหน้าที่เรียก FastAPI Business API ผ่าน HTTPS บน Render. API ส่งต่อไปยัง '
        f'Chatbot pipeline (จุดหลัก), โมดูลอ่านใบผลแลป และโมดูลจองคิว/ชำระเงิน. Pipeline ค้นคลังความรู้ BM25 และเรียก '
        f'Typhoon/OpenRouter 5 ครั้งต่อข้อความ; โมดูลอ่านผลใช้ OCR; โมดูลจองบันทึกลง PostgreSQL.</desc>'
        + "".join(parts) + "\n</svg>"
    )
    return page("สถาปัตยกรรมระบบ LabClear", "Architecture · LabClear", svg, W), (W, H)


# ---------------------------------------------------------------- sequence
def sequence():
    W = 816
    LX = [88, 248, 408, 568, 728]
    AW, AH, AY = 136, 72, 32
    parts = [defs()]
    top = AY + AH
    msgs_y = {}
    y = top + 48
    order = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10"]
    for k in order:
        msgs_y[k] = y
        y += 72 if k in ("m5", "m7") else 48
    frame_y = y - 8
    tab_h = 16
    g1 = frame_y + 32
    m11 = g1 + 28
    div = m11 + 28
    g2 = div + 24
    m12 = g2 + 28
    frame_b = m12 + 24
    life_b = frame_b + 16

    # lifelines
    for x in LX:
        parts.append(f'\n  <line x1="{x}" y1="{top}" x2="{x}" y2="{life_b}" stroke="rgba({INK_RGB},0.20)" stroke-width="1" stroke-dasharray="3,3"/>')

    # ALT frame (spans ลูกค้า + API only)
    fx, fw = 32, 300
    parts.append(f'\n  <rect x="{fx}" y="{frame_y}" width="{fw}" height="{frame_b - frame_y}" rx="4" fill="rgba({INK_RGB},0.02)" stroke="rgba({INK_RGB},0.22)" stroke-width="1"/>')
    parts.append(f'\n  <rect x="{fx}" y="{frame_y}" width="40" height="{tab_h}" rx="2" fill="{PAPER}" stroke="rgba({INK_RGB},0.22)" stroke-width="1"/>')
    parts.append(f'\n  <text x="{fx+20}" y="{frame_y+12}" fill="{MUTED}" font-size="9" font-weight="500" font-family="{MONO}" text-anchor="middle" letter-spacing="0.12em">ALT</text>')
    parts.append(f'\n  <text x="{fx+12}" y="{g1}" fill="{MUTED}" font-size="11" font-family="{THAI}">[ผ่านทุกด่าน]</text>')
    parts.append(f'\n  <line x1="{fx+8}" y1="{div}" x2="{fx+fw-8}" y2="{div}" stroke="rgba({INK_RGB},0.20)" stroke-width="1" stroke-dasharray="4,3"/>')
    parts.append(f'\n  <text x="{fx+12}" y="{g2}" fill="{MUTED}" font-size="11" font-family="{THAI}">[ไม่ผ่าน guard / AI ขัดข้อง / งบหมด]</text>')

    # activation bars
    def bar(x, y0, y1):
        return f'\n  <rect x="{x-4}" y="{y0}" width="8" height="{y1-y0}" fill="rgba({INK_RGB},0.06)" stroke="{MUTED}" stroke-width="0.8"/>'

    parts.append(bar(LX[1], msgs_y["m1"], m12 + 4))
    for k, li in [("m2", 4), ("m3", 3), ("m4", 2), ("m6", 2), ("m8", 2), ("m9", 3), ("m10", 4)]:
        parts.append(bar(LX[li], msgs_y[k], msgs_y[k] + 20))

    # message arrows
    def msg(y, a, b, color, marker, dashed=False, sw=1.2):
        x1 = LX[a] + (4 if b > a else -4) if a == 1 else LX[a]
        x2 = LX[b] - 4 if b > a else LX[b] + (4 if b == 1 else 0)
        dash = ' stroke-dasharray="5,4"' if dashed else ""
        return f'\n  <line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{color}" stroke-width="{sw}"{dash} marker-end="url(#{marker})"/>'

    def selfmsg(y, h=32):
        x = LX[1] + 4
        return (f'\n  <path d="M {x},{y} H {x+28} Q {x+36},{y} {x+36},{y+8} V {y+h-8} Q {x+36},{y+h} {x+28},{y+h} H {x}" '
                f'fill="none" stroke="{MUTED}" stroke-width="1.2" marker-end="url(#rs-arrow)"/>')

    parts.append(msg(msgs_y["m1"], 0, 1, LINK, "rs-arrow-link"))
    parts.append(msg(msgs_y["m2"], 1, 4, MUTED, "rs-arrow"))
    parts.append(msg(msgs_y["m3"], 1, 3, MUTED, "rs-arrow"))
    parts.append(msg(msgs_y["m4"], 1, 2, MUTED, "rs-arrow"))
    parts.append(selfmsg(msgs_y["m5"]))
    parts.append(msg(msgs_y["m6"], 1, 2, MUTED, "rs-arrow"))
    parts.append(selfmsg(msgs_y["m7"]))
    parts.append(msg(msgs_y["m8"], 1, 2, MUTED, "rs-arrow"))
    parts.append(msg(msgs_y["m9"], 1, 3, MUTED, "rs-arrow"))
    parts.append(msg(msgs_y["m10"], 1, 4, MUTED, "rs-arrow"))
    parts.append(msg(m11, 1, 0, ACCENT, "rs-arrow-accent", sw=1.6))
    parts.append(msg(m12, 1, 0, MUTED, "rs-arrow", dashed=True))

    # labels sit above their line (baseline 9px above)
    def above(x, y, t, c):
        return label(x, y - 13, t, c)[0]

    mid = lambda a, b: (LX[a] + LX[b]) / 2
    parts.append(above(mid(0, 1), msgs_y["m1"], "POST /chat", LINK))
    parts.append(above(mid(1, 2), msgs_y["m2"], "นับ call · ตรวจงบ", MUTED))
    parts.append(above(mid(1, 2), msgs_y["m3"], "1/5 guard ข้อความเข้า", MUTED))
    parts.append(above(mid(1, 2), msgs_y["m4"], "2/5 วางแผน (planner)", MUTED))
    sl1, w1 = label(0, 0, "ค้น BM25 + catalog", MUTED)
    parts.append(label(LX[1] + 48 + w1 / 2, msgs_y["m5"] + 16, "ค้น BM25 + catalog", MUTED)[0])
    parts.append(above(mid(1, 2), msgs_y["m6"], "3/5 ร่างคำตอบภาษาไทย", MUTED))
    sl2, w2 = label(0, 0, "ตรวจราคา/นโยบาย", MUTED)
    parts.append(label(LX[1] + 48 + w2 / 2, msgs_y["m7"] + 16, "ตรวจราคา/นโยบาย", MUTED)[0])
    parts.append(above(mid(1, 2), msgs_y["m8"], "4/5 ตรวจทาน (reviewer)", MUTED))
    parts.append(above(mid(1, 2), msgs_y["m9"], "5/5 guard คำตอบออก", MUTED))
    parts.append(above(mid(1, 2), msgs_y["m10"], "บันทึกแชท · ledger", MUTED))
    parts.append(above(mid(0, 1), m11, "คำตอบ + แหล่งอ้างอิง", ACCENT))
    parts.append(above(mid(0, 1), m12, "failed · ปุ่ม Retry", MUTED))

    # actors
    actors = [
        ("input", "WEB", "ลูกค้า", "เบราว์เซอร์"),
        ("focal", "API", "Business API", "FastAPI"),
        ("external", "LLM", "Typhoon", "typhoon-v2.5"),
        ("external", "SAFE", "Llama Guard 4", "OpenRouter"),
        ("store", "DB", "PostgreSQL", "งบ · ประวัติแชท"),
    ]
    for x, (k, tag, n, s) in zip(LX, actors):
        parts.append(node(x - AW / 2, AY, AW, AH, k, tag, n, s, name_size=15, sub_size=11))

    leg, last_y = legend(life_b + 24, 16, W - 16, [
        ("line", LINK, False, "rs-arrow-link", 1.2, "คำขอจากเบราว์เซอร์"),
        ("line", MUTED, False, "rs-arrow", 1.2, "เรียกแบบรอผล (sync)"),
        ("line", ACCENT, False, "rs-arrow-accent", 1.6, "คำตอบหลัก"),
        ("line", MUTED, True, "rs-arrow", 1.2, "เส้นทางผิดพลาด"),
        ("box", "store", "แถบ = ช่วงที่ทำงาน"),
    ])
    parts.append(leg)
    H = snap(last_y + 20)
    svg = (
        f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-labelledby="rs-seq-title rs-seq-desc">\n'
        f'  <title id="rs-seq-title">ลำดับการทำงานของ 1 ข้อความแชท</title>\n'
        f'  <desc id="rs-seq-desc">ลูกค้าส่ง POST /chat ไปยัง Business API. API นับ call และตรวจงบใน PostgreSQL, ตรวจข้อความเข้า'
        f'ด้วย Llama Guard 4, ให้ Typhoon วางแผน, ค้นคลังความรู้ BM25, ให้ Typhoon ร่างคำตอบ, ตรวจราคาและนโยบายด้วย Python, '
        f'ให้ Typhoon ตรวจทาน, ตรวจคำตอบออกด้วย Llama Guard 4 แล้วบันทึกลง PostgreSQL. ถ้าผ่านทุกด่านจะส่งคำตอบพร้อมแหล่งอ้างอิง '
        f'ถ้าไม่ผ่านจะแสดง failed และปุ่ม Retry.</desc>'
        + "".join(parts) + "\n</svg>"
    )
    return page("ลำดับการทำงานของ 1 ข้อความแชท", "Sequence · LabClear", svg, W), (W, H)


def build():
    a, sa = architecture()
    s, ss = sequence()
    return a, s, sa, ss


def render_png(src: Path, dst: Path) -> None:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 900, "height": 1000}, device_scale_factor=3)
        page.goto(src.resolve().as_uri())
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(400)
        page.locator("svg").first.screenshot(path=str(dst))
        browser.close()


if __name__ == "__main__":
    build()
    measure_missing()
    a, s, sa, ss = build()
    assert not _missing, f"unmeasured: {len(_missing)}"
    gf = ('<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600'
          '&family=Geist+Mono:wght@400;500&family=Noto+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet">')
    emb = f"<style>{font_css()}</style>"
    PNG_OUT.mkdir(parents=True, exist_ok=True)
    for name, html in (("architecture", a), ("message-flow", s)):
        (OUT / f"{name}.html").write_text(html.replace("__FONTS__", gf), encoding="utf-8")
        tmp_html = TMP / f"{name}.html"
        tmp_html.write_text(html.replace("__FONTS__", emb), encoding="utf-8")
        render_png(tmp_html, PNG_OUT / f"{name}.png")
    print("architecture", sa, "message-flow", ss)
