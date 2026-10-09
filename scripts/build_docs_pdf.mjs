/*
 * Render LabClear's Markdown reports and the slide deck to PDF with the Chromium that Playwright uses.
 *
 *   node scripts/build_docs_pdf.mjs business       # docs/report/LabClear_Business_Report_TH.md -> .pdf
 *   node scripts/build_docs_pdf.mjs architecture   # docs/report/LabClear_Architecture_Report_TH.md -> .pdf
 *   node scripts/build_docs_pdf.mjs slides         # presentation/index.html?print-pdf -> docs/report/LabClear_Slides.pdf
 *   node scripts/build_docs_pdf.mjs all
 *
 * Needs `npm ci` (playwright-core) and Chromium (set CHROMIUM=/path when it is not at
 * /opt/pw-browsers/chromium). Markdown is converted in the page with the vendored marked
 * (static/vendor/marked.min.js). The report style follows the LabClear technical report: purple
 * headings, tinted header rows, a summary call-out, footer "LabClear 4.0.0-rc3 · page / pages".
 * Body text is TH Sarabun New 16 pt (Thai Report Format); install the font locally before
 * rendering. Without it the page falls back to IBM Plex Sans Thai from static/fonts.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fonts = pathToFileURL(path.join(root, "static/fonts")).href;
const executablePath = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const VERSION = "4.0.0-rc3";

const REPORTS = {
  business: { md: "docs/report/LabClear_Business_Report_TH.md", title: "รายงานเชิงธุรกิจ" },
  architecture: { md: "docs/report/LabClear_Architecture_Report_TH.md", title: "รายงานสถาปัตยกรรมและเทคโนโลยี" },
};

const CSS = `
@font-face{font-family:"IBM Plex Sans Thai";src:url(${fonts}/ibm-plex-sans-thai-thai-400-normal.woff2) format("woff2");font-weight:400}
@font-face{font-family:"IBM Plex Sans Thai";src:url(${fonts}/ibm-plex-sans-thai-thai-600-normal.woff2) format("woff2");font-weight:600 700}
@font-face{font-family:"Geist";src:url(${fonts}/geist-variable.woff2) format("woff2");font-weight:100 900}
@font-face{font-family:"Geist Mono";src:url(${fonts}/geist-mono-variable.woff2) format("woff2");font-weight:100 900}
/* TH Sarabun New's own vertical metrics (1.94 em) exceed the 1.5 line height, so stacked Thai marks
   paint above their line box and show at the foot of the previous page. These faces keep the glyphs
   and give a 1.5 em content area that matches the line height. */
@font-face{font-family:"Sarabun Report";src:local("TH Sarabun New");font-weight:400;font-style:normal;ascent-override:112%;descent-override:38%;line-gap-override:0%}
@font-face{font-family:"Sarabun Report";src:local("TH Sarabun New Bold"),local("TH Sarabun New");font-weight:700;font-style:normal;ascent-override:112%;descent-override:38%;line-gap-override:0%}
@font-face{font-family:"Sarabun Report";src:local("TH Sarabun New Italic"),local("TH Sarabun New");font-weight:400;font-style:italic;ascent-override:112%;descent-override:38%;line-gap-override:0%}
:root{--ink:#21172f;--muted:#5d5470;--line:#ddd5e8;--tint:#f4effb;--accent:#6539a9;--todo:#fff3b0}
@page{size:A4;margin:20mm 20mm 22mm 22mm}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:"Sarabun Report","TH Sarabun New","IBM Plex Sans Thai",sans-serif;font-size:16pt;line-height:1.5;color:var(--ink);margin:0}
.title{border-bottom:2px solid var(--accent);padding-bottom:10pt;margin-bottom:14pt}
.title h1{font-family:"Geist","IBM Plex Sans Thai",sans-serif;font-weight:600;font-size:22pt;line-height:1.35;margin:0 0 6pt;color:var(--accent)}
.title p{margin:0 0 2pt;font-size:16pt}
.title blockquote{margin:10pt 0 0;padding:6pt 10pt;background:var(--tint);border-left:3pt solid var(--accent);border-radius:3pt;font-size:16pt}
h2{font-family:"Geist","IBM Plex Sans Thai",sans-serif;font-weight:600;font-size:17pt;line-height:1.4;color:var(--accent);margin:18pt 0 6pt;break-after:avoid}
h3{font-family:"Geist","IBM Plex Sans Thai",sans-serif;font-weight:600;font-size:13.5pt;line-height:1.45;margin:12pt 0 4pt;break-after:avoid}
p{margin:0 0 6pt;text-align:left}
ul,ol{margin:0 0 6pt;padding-left:18pt}
li{margin:0 0 2pt}
strong{font-weight:700}
a{color:var(--accent);text-decoration:none}
code{font-family:"Geist Mono","Sarabun Report",monospace;font-size:10.5pt;background:var(--tint);padding:0 2pt;border-radius:2pt;overflow-wrap:anywhere}
pre{background:var(--tint);padding:6pt 8pt;border-radius:3pt;white-space:pre-wrap;break-inside:avoid}
pre code{background:none;padding:0;font-size:9pt;line-height:1.45}
table{border-collapse:collapse;width:100%;margin:2pt 0 10pt;font-size:14pt;line-height:1.42;break-inside:auto}
thead{display:table-header-group}
tr{break-inside:avoid}
th{font-family:"Geist","IBM Plex Sans Thai",sans-serif;font-weight:600;font-size:11pt;text-align:center;background:var(--tint);border-bottom:1.2pt solid var(--accent);border-top:.8pt solid var(--accent);padding:4pt 6pt;vertical-align:top}
td{border-bottom:.6pt solid var(--line);padding:4pt 6pt 3pt;vertical-align:top;text-align:left}
td code,th code{font-size:9.6pt}
.cap{font-size:14pt;margin:8pt 0 3pt;break-after:avoid}
.cap b{color:var(--accent)}
p.fig{text-align:center;margin:6pt 0 2pt;break-inside:avoid;break-after:avoid}
p.fig img{display:block;max-width:100%;max-height:150mm;margin:0 auto;border:.6pt solid var(--line)}
p.fig img.tall{max-height:215mm;border:0}
p.figcap{text-align:center;font-size:14pt;margin:2pt 0 10pt}
p.figcap b{color:var(--accent)}
blockquote{margin:0 0 8pt;padding:4pt 10pt;background:var(--tint);border-left:3pt solid var(--accent)}
mark{background:var(--todo);padding:0 2pt}
`;

function reportHtml(spec) {
  const file = path.join(root, spec.md);
  const md = readFileSync(file, "utf8");
  const marked = readFileSync(path.join(root, "static/vendor/marked.min.js"), "utf8");
  const base = pathToFileURL(path.dirname(file) + "/").href;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="${base}">
<title>LabClear ${VERSION} ${spec.title}</title><style>${CSS}</style>
<script>${marked}</script></head><body><header class="title"></header><main></main>
<script>
const md = ${JSON.stringify(md)};
const cut = md.indexOf("\\n## ");
document.querySelector(".title").innerHTML = marked.parse(md.slice(0, cut));
document.querySelector("main").innerHTML = marked.parse(md.slice(cut + 1));
// Placeholders are highlighted.
document.querySelectorAll("p, td, li").forEach((el) => {
  el.innerHTML = el.innerHTML.replace(/\\[รอข้อมูล[^\\]]*\\]/g, (m) => "<mark>" + m + "</mark>");
});
// "ภาพที่ n" paragraphs right after an image become centred captions.
document.querySelectorAll("main p").forEach((p) => {
  if (p.children.length === 1 && p.firstElementChild.tagName === "IMG" && p.textContent.trim() === "") p.classList.add("fig");
  if (/^ภาพที่ \\d+/.test(p.textContent) && p.previousElementSibling?.classList.contains("fig")) p.classList.add("figcap");
  if (/^ตารางที่ \\d+/.test(p.textContent) && p.nextElementSibling?.tagName === "TABLE") p.classList.add("cap");
});
document.querySelectorAll("img").forEach((img) => { if (/message-flow/.test(img.src)) img.classList.add("tall"); });
window.__ready = true;
</script></body></html>`;
}

async function report(browser, name) {
  const spec = REPORTS[name];
  const out = path.join(root, spec.md.replace(/\.md$/, ".pdf"));
  const html = path.join(mkdtempSync(path.join(tmpdir(), "labclear-report-")), "report.html");
  writeFileSync(html, reportHtml(spec));
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute("src")));
  if (missing.length) throw new Error("Images not found: " + missing.join(", "));
  await page.pdf({
    path: out, format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-size:8px;color:#8d819d;text-align:center;font-family:sans-serif">LabClear ${VERSION} · ${spec.title} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  await page.close();
  console.log("Wrote", path.relative(root, out));
}

async function slides(browser) {
  const deck = pathToFileURL(path.join(root, "presentation/index.html")).href + "?print-pdf";
  const out = path.join(root, "docs/report/LabClear_Slides.pdf");
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(deck, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.pdf({ path: out, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
  await page.close();
  console.log("Wrote", path.relative(root, out));
}

const mode = process.argv[2] || "all";
if (!existsSync(executablePath)) throw new Error(`Chromium not found at ${executablePath}; set CHROMIUM`);
const browser = await chromium.launch({ executablePath, args: ["--allow-file-access-from-files"] });
try {
  const jobs = mode === "all" ? [...Object.keys(REPORTS), "slides"] : [mode];
  for (const job of jobs) {
    if (job === "slides") await slides(browser);
    else if (REPORTS[job]) await report(browser, job);
    else throw new Error("Use: node scripts/build_docs_pdf.mjs business|architecture|slides|all");
  }
} finally {
  await browser.close();
}
