"""Export the LabClear 4.0.0 diagrams from their HTML sources to PNG and SVG.

    python3 scripts/build_diagrams_400.py

Sources (diagram-design HTML/SVG, edited by hand): docs/diagrams/architecture-4.0.html,
docs/diagrams/architecture-4.0-detail.html and docs/diagrams/message-flow-4.0.html. Their fonts are
self-hosted through docs/diagrams/labclear-diagram-fonts.css (web/public/fonts), so no network is used.

For each source the script opens the page in Chromium (web/node_modules/playwright-core,
executable /opt/pw-browsers/chromium or $CHROMIUM_PATH), waits until Geist, Geist Mono and
Noto Sans Thai are loaded, and checks the drawing before exporting:
  * every text sits inside its node box or label mask (measured with the real fonts),
  * a label mask keeps at least 6 px from every connector and does not cover a lifeline,
  * no label mask overlaps a node box (nodes are painted after labels).
Then it writes docs/assets/<name>.png (SVG drawn 1200 CSS px wide at deviceScaleFactor 2, so
2400 px wide) and docs/assets/<name>.svg (the inline SVG only, with the fonts embedded as data
URLs, prefixed marker IDs and rgba() presentation colours split into colour + opacity).
The script stops with a non-zero exit if a check fails.
"""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/diagrams"
OUT = ROOT / "docs/assets"
FONTS = ROOT / "web/public/fonts"
CHROMIUM = os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium")
PLAYWRIGHT = ROOT / "web/node_modules/playwright-core"
NAMES = ["architecture-4.0", "architecture-4.0-detail", "message-flow-4.0"]
CSS_WIDTH = 1200  # SVG width in CSS px for the PNG; x deviceScaleFactor 2 = 2400 px

THAI = "U+0E01-0E5B, U+200C-200D, U+25CC"
EMBED = [  # (family, file, weight range, unicode-range)
    ("Geist", "geist-variable.woff2", "100 900", None),
    ("Geist Mono", "geist-mono-variable.woff2", "100 900", None),
    ("Noto Sans Thai", "noto-sans-thai-400.woff2", "400", THAI),
    ("Noto Sans Thai", "noto-sans-thai-500.woff2", "500", THAI),
    ("Noto Sans Thai", "noto-sans-thai-600.woff2", "600 700", THAI),
]

RENDER_JS = r"""
const { chromium } = require(%(pw)s);
const jobs = %(jobs)s;
(async () => {
  const browser = await chromium.launch({ executablePath: %(chromium)s,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const report = {};
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: %(cssw)d + 100, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(job.url, { waitUntil: 'load' });
    const result = await page.evaluate(async (cssw) => {
      const need = [['600 16px Geist', 'Ag'], ['400 12px Geist', 'Ag'], ['400 12px "Geist Mono"', 'Ag'],
                    ['400 12px "Noto Sans Thai"', 'กที่'], ['500 12px "Noto Sans Thai"', 'กที่'], ['600 16px "Noto Sans Thai"', 'กที่']];
      await Promise.all(need.map(([f, t]) => document.fonts.load(f, t)));
      await document.fonts.ready;
      const fonts = [];
      document.fonts.forEach(f => fonts.push([f.family.replace(/["']/g, ''), f.weight, f.status]));
      const missing = fonts.filter(([fam, w, st]) => ['Geist', 'Geist Mono', 'Noto Sans Thai'].includes(fam) && st !== 'loaded');
      const svg = document.querySelector('svg');
      for (let a = svg.parentElement; a; a = a.parentElement) a.style.setProperty('overflow', 'visible', 'important');
      svg.style.width = cssw + 'px'; svg.style.minWidth = cssw + 'px';
      const errors = [];
      const box = r => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') });
      const inter = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
      const nodes = [...svg.querySelectorAll('g[data-fit="node"]')].map(g => box(g.querySelector('rect')));
      const labels = [];
      for (const g of svg.querySelectorAll('g[data-fit]')) {
        const r = box(g.querySelector('rect')), node = g.dataset.fit === 'node';
        const px = node ? 6 : 1, py = node ? 1 : 2;
        for (const t of g.querySelectorAll('text')) {
          const b = t.getBBox();
          if (b.x < r.x + px - 0.5 || b.x + b.width > r.x + r.w - px + 0.5 || b.y < r.y - py || b.y + b.height > r.y + r.h + py)
            errors.push(`text does not fit its ${g.dataset.fit}: "${t.textContent}" bbox ${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.width.toFixed(1)}x${b.height.toFixed(1)} in ${r.x},${r.y} ${r.w}x${r.h}`);
        }
        if (!node) labels.push([r, g.querySelector('text').textContent]);
      }
      for (const [r, t] of labels) {
        for (const n of nodes) if (inter(r, n)) errors.push(`label "${t}" overlaps a node box`);
        for (const p of svg.querySelectorAll('path[marker-end]')) {
          const L = p.getTotalLength();
          for (let s = 0; s <= L; s += 1) {
            const q = p.getPointAtLength(s);
            const dx = Math.max(r.x - q.x, 0, q.x - (r.x + r.w)), dy = Math.max(r.y - q.y, 0, q.y - (r.y + r.h));
            if (Math.hypot(dx, dy) < 5.5) { errors.push(`label "${t}" is closer than 6px to a connector`); break; }
          }
        }
        for (const l of svg.querySelectorAll('line[stroke-dasharray="3,3"]')) {
          const x = +l.getAttribute('x1'), y1 = +l.getAttribute('y1'), y2 = +l.getAttribute('y2');
          if (x > r.x && x < r.x + r.w && y2 > r.y && y1 < r.y + r.h) errors.push(`label "${t}" covers a lifeline`);
        }
      }
      const vb = svg.viewBox.baseVal;
      return { missing, errors, vb: [vb.width, vb.height] };
    }, %(cssw)d);
    await page.waitForTimeout(100);
    await page.locator('svg').first().screenshot({ path: job.png });
    report[job.name] = result;
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(report));
})().catch(e => { console.error(e); process.exit(1); });
"""


def render(names: list[str]) -> dict:
    jobs = [{"name": n, "url": (SRC / f"{n}.html").resolve().as_uri(), "png": str(OUT / f"{n}.png")} for n in names]
    js = RENDER_JS % {"pw": json.dumps(str(PLAYWRIGHT)), "jobs": json.dumps(jobs), "chromium": json.dumps(CHROMIUM), "cssw": CSS_WIDTH}
    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / "render.cjs"
        script.write_text(js, encoding="utf-8")
        done = subprocess.run(["node", str(script)], check=True, capture_output=True, text=True)
    return json.loads(done.stdout.strip().splitlines()[-1])


def font_css() -> str:
    rules = []
    for family, file, weight, urange in EMBED:
        data = base64.b64encode((FONTS / file).read_bytes()).decode()
        ur = f"unicode-range:{urange};" if urange else ""
        rules.append(f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{data}) format('woff2');font-weight:{weight};{ur}}}")
    return "\n".join(rules)


def export_svg(name: str) -> Path:
    """The skill's export transform (references/export.md), with self-hosted fonts instead of an @import."""
    html = (SRC / f"{name}.html").read_text(encoding="utf-8")
    m = re.search(r"<svg\b.*?</svg>", html, re.S)
    if not m:
        raise SystemExit(f"{name}: no <svg> in the source")
    svg = m.group(0)
    vb = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg)
    svg = re.sub(r"<svg\b", f'<svg id="{name}-root" width="{vb[1]}" height="{vb[2]}"', svg, count=1)
    ids = sorted(set(re.findall(r'<(?:marker|pattern|linearGradient|radialGradient|filter|clipPath|mask|symbol)\b[^>]*\bid="([^"]+)"', svg)), key=len, reverse=True)
    for i in ids:
        svg = svg.replace(f'id="{i}"', f'id="{name}-{i}"').replace(f"url(#{i})", f"url(#{name}-{i})")
    svg = re.sub(r'(fill|stroke)="rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)"',
                 lambda g: '{0}="#{1:02x}{2:02x}{3:02x}" {0}-opacity="{4}"'.format(g[1], int(g[2]), int(g[3]), int(g[4]), g[5]), svg)
    svg = re.sub(r'(fill|stroke)="transparent"', r'\1="none"', svg)
    svg = svg.replace("<defs>", f"<defs>\n<style>\n{font_css()}\n</style>", 1)
    doc = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + "\n"
    ET.fromstring(doc.encode("utf-8"))  # must be well-formed XML
    path = OUT / f"{name}.svg"
    path.write_text(doc, encoding="utf-8")
    return path


def png_size(path: Path) -> tuple[int, int]:
    head = path.read_bytes()[:24]
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report = render(NAMES)
    failed = False
    for name in NAMES:
        r = report[name]
        svg = export_svg(name)
        w, h = png_size(OUT / f"{name}.png")
        print(f"{name}: viewBox {r['vb'][0]:.0f}x{r['vb'][1]:.0f} -> {OUT.relative_to(ROOT)}/{name}.png ({w}x{h}) and .svg ({svg.stat().st_size // 1024} KB)")
        if r["missing"]:
            failed = True
            print(f"  fonts not loaded: {r['missing']}", file=sys.stderr)
        for e in r["errors"]:
            failed = True
            print(f"  {e}", file=sys.stderr)
        if w < 2000:
            failed = True
            print(f"  PNG narrower than 2000 px", file=sys.stderr)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
