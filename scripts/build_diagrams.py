"""Build the two LabClear diagrams (architecture and the data flow of one chat message).

    python scripts/build_diagrams.py            # SVG + PNG into docs/assets/
    python scripts/build_diagrams.py --svg-only # SVG only (no browser needed)

The diagrams are drawn from the declarations below, so they change together with the code they
describe (services/business_agent.py, services/agent_tools.py, render.yaml). SVG text uses the
website's fonts by name (Geist, IBM Plex Sans Thai) with system fallbacks. The PNG export renders
each SVG in Chromium (Playwright from the repository's node_modules) with the self-hosted fonts in
static/fonts, at 2x, with no network access.
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/assets"
VERSION = "4.0.0-rc3"

INK, MUTED, SOFT = "#23202b", "#6b6875", "#a19dab"
PAPER, ZONE, LINE = "#fdfcfe", "rgba(35,32,43,0.025)", "rgba(35,32,43,0.14)"
ACCENT, ACCENT_BG, LINK = "#6539a9", "#f3eefb", "#2f6fb5"
SANS = "'Geist','IBM Plex Sans Thai','Segoe UI',system-ui,sans-serif"
MONO = "'Geist Mono',ui-monospace,'SFMono-Regular',Menlo,monospace"
STYLES = {  # fill, stroke, dash, title colour
    "core": (ACCENT_BG, ACCENT, "", INK),
    "module": ("#ffffff", INK, "", INK),
    "store": ("#f1f0f4", "#5e5a66", "", INK),
    "external": ("#f6f5f8", SOFT, "", INK),
    "user": ("#ecebf0", "#7d7987", "", INK),
    "gate": ("#faf8fd", ACCENT, "5 4", INK),
    "llm": (ACCENT_BG, ACCENT, "", INK),
    "server": ("#ffffff", INK, "", INK),
}


class Svg:
    def __init__(self, width, height, title, desc):
        self.w, self.h, self.parts = width, height, []
        self.title, self.desc = title, desc

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=12, weight=400, fill=INK, anchor="middle", family=SANS, spacing=None):
        ls = f' letter-spacing="{spacing}"' if spacing else ""
        self.add(f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-weight="{weight}" font-family="{family}" '
                 f'text-anchor="{anchor}"{ls}>{escape(s)}</text>')

    def zone(self, x, y, w, h, label):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{ZONE}" stroke="{LINE}" stroke-width="0.8"/>')
        tw = 7.2 * len(label) + 14
        self.add(f'<rect x="{x + 12}" y="{y - 8}" width="{tw}" height="16" rx="3" fill="{PAPER}"/>')
        self.text(x + 19, y + 4, label, 10, 500, MUTED, "start", MONO, "0.12em")

    def box(self, x, y, w, h, kind, tag, title, lines=(), title_size=15):
        fill, stroke, dash, tcol = STYLES[kind]
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}" stroke-width="1.1"{d}/>')
        if tag:
            tw = 7.0 * len(tag) + 12
            col = ACCENT if kind in ("core", "llm", "gate") else MUTED
            self.add(f'<rect x="{x + 10}" y="{y + 10}" width="{tw}" height="16" rx="3" fill="{PAPER}" stroke="{col}" stroke-width="0.7"/>')
            self.text(x + 10 + tw / 2, y + 22, tag, 9.5, 500, col, "middle", MONO, "0.08em")
        cx = x + w / 2
        n = len(lines)
        block = 20 + 16 * n
        top = y + (h - block) / 2 + (8 if tag else 4)
        self.text(cx, top + 12, title, title_size, 600, tcol)
        for i, line in enumerate(lines):
            self.text(cx, top + 32 + 16 * i, line, 11.5, 400, MUTED)

    def arrow(self, pts, label=None, at=None, colour=MUTED, dashed=False, halo=False, anchor="start"):
        path = "M " + " L ".join(f"{a} {b}" for a, b in pts)
        marker = {MUTED: "a-muted", ACCENT: "a-accent", LINK: "a-link"}[colour]
        if halo:
            self.add(f'<path d="{path}" fill="none" stroke="{PAPER}" stroke-width="6"/>')
        dash = ' stroke-dasharray="4 4"' if dashed else ""
        self.add(f'<path d="{path}" fill="none" stroke="{colour}" stroke-width="1.3"{dash} marker-end="url(#{marker})"/>')
        if label:
            lx, ly = at
            width = 6.6 * len(label) + 10
            bx = lx - 5 if anchor == "start" else lx - width / 2
            self.add(f'<rect x="{bx}" y="{ly - 11}" width="{width}" height="15" rx="2" fill="{PAPER}"/>')
            self.text(lx if anchor == "start" else lx, ly, label, 10, 500, colour, anchor, MONO, "0.06em")

    def legend(self, y, items):
        self.add(f'<line x1="40" y1="{y}" x2="{self.w - 40}" y2="{y}" stroke="{LINE}" stroke-width="0.8"/>')
        x = 40
        for kind, label in items:
            if kind.startswith("arrow:"):
                colour = {"muted": MUTED, "accent": ACCENT, "link": LINK}[kind[6:]]
                self.arrow([(x, y + 26), (x + 26, y + 26)], colour=colour)
                x += 34
            else:
                fill, stroke, dash, _ = STYLES[kind]
                d = f' stroke-dasharray="{dash}"' if dash else ""
                self.add(f'<rect x="{x}" y="{y + 19}" width="18" height="14" rx="3" fill="{fill}" stroke="{stroke}" stroke-width="1"{d}/>')
                x += 26
            self.text(x, y + 30, label, 11.5, 400, MUTED, "start")
            x += 7.0 * len(label) + 26

    def render(self):
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" '
                f'role="img" aria-labelledby="t d"><title id="t">{escape(self.title)}</title><desc id="d">{escape(self.desc)}</desc>'
                '<defs>'
                f'<marker id="a-muted" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="{MUTED}"/></marker>'
                f'<marker id="a-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="{ACCENT}"/></marker>'
                f'<marker id="a-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="{LINK}"/></marker>'
                f'</defs><rect width="100%" height="100%" fill="{PAPER}"/>')
        return head + "".join(self.parts) + "</svg>\n"


def architecture() -> Svg:
    s = Svg(1000, 1040, f"LabClear {VERSION} architecture",
            "One Render web service (FastAPI, Jinja pages and vanilla JavaScript) serves customers and staff over HTTPS. "
            "Inside it: the multi-agent chat pipeline, the report reader, business operations and the no-code admin. "
            "They read the knowledge library (148 records, BM25), the simulated business data and encrypted PostgreSQL. "
            "Every model call passes the provider gate (network switch, call cap, THB ledger, free-only policy) to the "
            "AI providers. Official hospital pages are external links opened by the customer.")
    s.text(40, 30, f"ARCHITECTURE · LABCLEAR {VERSION.upper()}", 10.5, 500, MUTED, "start", MONO, "0.16em")

    s.zone(40, 56, 920, 118, "USERS")
    s.box(60, 76, 380, 80, "user", "WEB", "Customers and guests", ["website · chat · AI Lab Report · Thai / English"])
    s.box(560, 76, 380, 80, "user", "STAFF", "Staff and managers", ["/staff service desk · no-code admin"])

    s.zone(40, 214, 920, 560, "RENDER · ONE WEB SERVICE")
    s.arrow([(250, 156), (250, 238)], "HTTPS", (258, 190), LINK)
    s.arrow([(750, 156), (750, 238)], "HTTPS", (758, 190), LINK)
    s.box(60, 240, 880, 90, "module", "API + UI", "labclear · FastAPI · Python 3.12",
          ["Jinja pages + vanilla JS · Thai-first TH/EN switch · answers stream step by step (NDJSON)",
           "session · CSRF · same-origin · role and ownership checks · rate limit · one instance"], 16)
    for x in (160, 386, 613, 840):
        s.arrow([(x, 330), (x, 368)])
    s.box(60, 370, 200, 116, "core", "CORE", "Chat pipeline", ["guards · planner · roles", "typed tools · skills", "writer · checks · reviewer"])
    s.box(286, 370, 200, 116, "module", "OCR", "Report reader", ["OCR → document safety", "rows → customer confirms", "status from printed range"])
    s.box(513, 370, 200, 116, "module", "BIZ", "Business operations", ["packages · comparisons", "bookings · simulated pay", "inbox · quotations"])
    s.box(740, 370, 200, 116, "module", "ADMIN", "No-code admin", ["Company Harness", "Knowledge library (PDF)", "AI providers · roles"])

    # Stores and the provider gate.
    s.box(60, 560, 200, 96, "store", "KB", "Knowledge library", ["148 records · 29 publishers", "BM25, no embedding API"])
    s.box(286, 560, 200, 96, "gate", "GATE", "Provider gate", ["network switch · call cap", "THB ledger · free-only policy"])
    s.box(513, 560, 200, 96, "store", "DATA", "Business data", ["catalog · centers · policies", "roles · hospital links"])
    s.box(740, 560, 200, 96, "store", "DB", "PostgreSQL", ["encrypted rows: accounts, chats,", "reports, harness revisions, audit"])
    s.arrow([(200, 486), (200, 506), (590, 506), (590, 558)], "TYPED TOOLS", (300, 501), ACCENT)
    s.arrow([(130, 486), (130, 558)], "BM25", (138, 528), ACCENT)
    s.arrow([(260, 440), (273, 440), (273, 608), (284, 608)], halo=True)
    s.arrow([(420, 486), (420, 558)], "MODEL CALLS", (428, 538), MUTED, halo=True)
    s.arrow([(640, 486), (640, 558)], "READ", (648, 538))
    s.arrow([(713, 440), (726, 440), (726, 608), (738, 608)])
    s.arrow([(840, 486), (840, 558)], "SQL", (848, 528))
    for i, line in enumerate(["render.yaml Blueprint: auto-deploy on every commit to main; /health check.",
                              "Flags default off in config.py; the Blueprint turns on runtime skills and hospital links.",
                              "Secrets are set in the Render dashboard, never committed."]):
        s.text(430, 694 + 18 * i, line, 11, 400, MUTED, "start")

    s.zone(40, 812, 920, 138, "EXTERNAL")
    s.arrow([(386, 656), (386, 834)], "HTTPS", (394, 796), LINK)
    s.box(286, 834, 427, 98, "external", "AI", "AI providers, per slot and agent",
          ["Typhoon (language, OCR) · iApp OpenThai-SystemOne (safety)", "managers can choose others, e.g. OpenRouter"])
    s.box(740, 834, 200, 98, "external", "LINK", "Official hospital pages", ["opened by the customer", "no booking or partnership"])
    s.box(60, 834, 200, 98, "external", "LINE", "LINE · payments", ["simulated channels", "off unless configured"])
    s.legend(980, [("core", "Core"), ("module", "Module"), ("store", "Data"), ("gate", "Gate"), ("external", "External"),
                   ("user", "User"), ("arrow:link", "HTTPS"), ("arrow:accent", "Pipeline reads"), ("arrow:muted", "Internal call")])
    return s


FLOW = [
    # (kind, tag, title, detail, shown in Process Explainability?)
    ("server", "API", "POST /api/business/chat", "session · CSRF · same-origin · rate limit · the answer streams as NDJSON", False),
    ("server", "HARNESS", "Company Harness snapshot", "configuration revision, skills on/off, tool limits (one snapshot per message)", True),
    ("llm", "GUARD", "Input safety check", "iApp OpenThai-SystemOne · anything not clearly safe is blocked", True),
    ("llm", "LLM", "Planner", "JSON plan: action, role, search terms, package IDs · sees test names, never report values", True),
    ("server", "ROLE", "Role and permissions", "Health-check Advisor or Report Explainer · the role decides which data may be read", False),
    ("server", "TOOLS", "Typed tools (server)", "packages · centers · policies in parallel · compare · hospital offers · BM25 evidence · confirmed rows", True),
    ("server", "SKILLS", "Runtime skills", "reviewed instruction modules chosen for role, task and evidence · SHA-256 recorded", True),
    ("llm", "LLM", "Writer", "answer in JSON with [source-id] citations · Thai unless the customer asked for English", True),
    ("server", "CHECK", "Deterministic checks", "citations exist and support · numbers, prices and report values unchanged · one rewrite", True),
    ("llm", "LLM", "Independent reviewer", "supported by the cited content · values preserved · within scope", True),
    ("llm", "GUARD", "Output safety check", "the same guard screens the final answer", True),
    ("server", "LINKS", "Official hospital links", "general package questions: up to 3 VERIFIED pages, attached after every check", True),
    ("server", "STORE", "Store and show", "encrypted message, sources, steps and checks · the browser renders answer and receipt", False),
]


def message_flow() -> Svg:
    top, step, h = 70, 70, 54
    height = top + step * len(FLOW) + 150
    s = Svg(1000, height, f"LabClear {VERSION}: data flow of one chat message",
            "One customer message passes thirteen stages: the API request, the Company Harness snapshot, the input "
            "safety check, the planner, role permissions, typed tools, runtime skills, the writer, deterministic checks, "
            "the independent reviewer, the output safety check, official hospital links and storage. Model calls go "
            "through the provider gate. Steps marked with a dot are listed under Process Explainability.")
    s.text(40, 30, f"DATA FLOW OF ONE MESSAGE · LABCLEAR {VERSION.upper()}", 10.5, 500, MUTED, "start", MONO, "0.16em")
    x, w = 60, 660
    for i, (kind, tag, title, detail, shown) in enumerate(FLOW):
        y = top + i * step
        fill, stroke, dash, _ = STYLES[kind]
        s.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}" stroke-width="1.1"/>')
        s.text(x + 22, y + 32, f"{i + 1:02d}", 11, 500, MUTED, "middle", MONO)
        tw = 7.0 * len(tag) + 12
        col = ACCENT if kind == "llm" else MUTED
        s.add(f'<rect x="{x + 40}" y="{y + 19}" width="{tw}" height="16" rx="3" fill="{PAPER}" stroke="{col}" stroke-width="0.7"/>')
        s.text(x + 40 + tw / 2, y + 31, tag, 9.5, 500, col, "middle", MONO, "0.08em")
        s.text(x + 40 + tw + 12, y + 24, title, 13.5, 600, INK, "start")
        s.text(x + 40 + tw + 12, y + 42, detail, 11, 400, MUTED, "start")
        if shown:
            s.add(f'<circle cx="{x + w + 18}" cy="{y + h / 2}" r="4" fill="{ACCENT}"/>')
        if i < len(FLOW) - 1:
            s.arrow([(x + w / 2, y + h), (x + w / 2, y + step - 1)])
    # Side notes: the provider gate on every model call, and what the customer sees.
    gy = top + 2 * step
    s.box(770, gy, 190, 128, "gate", "GATE", "Provider gate", ["every LLM and guard call:", "network switch · call cap", "THB ledger · free-only"], 14)
    for i, (kind, *_rest) in enumerate(FLOW):
        if kind == "llm":
            y = top + i * step + h / 2
            s.add(f'<path d="M {x + w + 28} {y} L 760 {y}" stroke="{ACCENT}" stroke-width="0.9" stroke-dasharray="3 4" fill="none"/>')
    s.add(f'<line x1="760" y1="{top + 2 * step + h / 2}" x2="760" y2="{top + 10 * step + h / 2}" stroke="{ACCENT}" stroke-width="0.9" stroke-dasharray="3 4"/>')
    ey = top + 6 * step
    s.box(770, ey, 190, 150, "store", "EVIDENCE", "What the writer may cite", ["catalog and policy records", "knowledge library (BM25)", "confirmed report rows", "hospital records if named"], 14)
    vy = top + 11 * step - 10
    s.box(770, vy, 190, 110, "module", "UI", "Process Explainability", ["each dotted step with", "detail and duration", "under the answer"], 14)
    ly = top + step * len(FLOW) + 30
    s.add(f'<line x1="40" y1="{ly}" x2="960" y2="{ly}" stroke="{LINE}" stroke-width="0.8"/>')
    s.add(f'<rect x="40" y="{ly + 20}" width="18" height="14" rx="3" fill="{ACCENT_BG}" stroke="{ACCENT}"/>')
    s.text(66, ly + 31, "Model call (LLM or guard)", 11.5, 400, MUTED, "start")
    s.add(f'<rect x="260" y="{ly + 20}" width="18" height="14" rx="3" fill="#ffffff" stroke="{INK}"/>')
    s.text(286, ly + 31, "Server code, no model", 11.5, 400, MUTED, "start")
    s.add(f'<circle cx="469" cy="{ly + 27}" r="4" fill="{ACCENT}"/>')
    s.text(482, ly + 31, "Listed under Process Explainability", 11.5, 400, MUTED, "start")
    s.text(40, ly + 66, "A failed check withholds the answer and shows the step that stopped it. Report questions also pass the "
                        "medical analyzer and Thai composer when that profile is configured.", 11, 400, MUTED, "start")
    return s


FONT_CSS = """
@font-face{font-family:'Geist';src:url('GEIST') format('woff2');font-weight:100 900}
@font-face{font-family:'Geist Mono';src:url('MONO') format('woff2');font-weight:100 900}
@font-face{font-family:'IBM Plex Sans Thai';src:url('PLEX4') format('woff2');font-weight:400;unicode-range:U+0E01-0E5B}
@font-face{font-family:'IBM Plex Sans Thai';src:url('PLEX6') format('woff2');font-weight:600;unicode-range:U+0E01-0E5B}
html,body{margin:0;background:#fdfcfe}
"""


def export_png(svgs: dict[str, str]) -> None:
    fonts = ROOT / "static/fonts"
    css = (FONT_CSS.replace("GEIST", (fonts / "geist-variable.woff2").as_uri()).replace("MONO", (fonts / "geist-mono-variable.woff2").as_uri())
           .replace("PLEX4", (fonts / "ibm-plex-sans-thai-thai-400-normal.woff2").as_uri())
           .replace("PLEX6", (fonts / "ibm-plex-sans-thai-thai-600-normal.woff2").as_uri()))
    with tempfile.TemporaryDirectory() as tmp:
        jobs = []
        for name, svg in svgs.items():
            page = Path(tmp) / f"{name}.html"
            page.write_text(f"<!doctype html><meta charset='utf-8'><style>{css}</style>{svg}", encoding="utf-8")
            jobs.append({"html": page.as_uri(), "png": str(OUT / f"{name}.png")})
        script = Path(tmp) / "shoot.mjs"
        script.write_text(
            "import { chromium } from " + json.dumps((ROOT / "node_modules/playwright/index.mjs").as_uri()) + ";\n"
            "const jobs = JSON.parse(process.argv[2]);\n"
            "const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });\n"
            "const ctx = await b.newContext({ deviceScaleFactor: 2, offline: true });\n"
            "for (const j of jobs) { const p = await ctx.newPage(); await p.goto(j.html); await p.evaluate(() => document.fonts.ready);\n"
            "  await p.locator('svg').screenshot({ path: j.png }); await p.close(); }\n"
            "await b.close();\n", encoding="utf-8")
        subprocess.run(["node", str(script), json.dumps(jobs)], check=True, cwd=ROOT)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--svg-only", action="store_true")
    a = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    svgs = {"architecture": architecture().render(), "message-flow": message_flow().render()}
    for name, svg in svgs.items():
        (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")
    if not a.svg_only:
        export_png(svgs)
    print("diagrams:", ", ".join(f"docs/assets/{n}.svg" for n in svgs), "" if a.svg_only else "+ PNG")


if __name__ == "__main__":
    main()
