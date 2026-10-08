/*
 * Render LabClear documents to PDF with the Chromium that Playwright uses.
 *
 *   node scripts/build_docs_pdf.mjs report   # docs/report/LabClear_Technical_Report_4_0_0.md -> .pdf
 *   node scripts/build_docs_pdf.mjs slides   # presentation/index.html?print-pdf -> docs/report/LabClear_Slides_4_0_0.pdf
 *
 * Needs `cd web && npm ci` (marked and playwright-core come from web/node_modules).
 * Set CHROMIUM=/path/to/chrome when Chromium is not at /opt/pw-browsers/chromium.
 * The report uses TH Sarabun New when it is installed and falls back to the bundled Noto Sans Thai.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "../web/node_modules/marked/lib/marked.esm.js";
import { chromium } from "../web/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fonts = pathToFileURL(path.join(root, "web/public/fonts")).href;
const executablePath = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const mode = process.argv[2] || "report";

function reportHtml(mdFile) {
  const md = readFileSync(mdFile, "utf8");
  const [first, ...rest] = md.split("\n## ");
  const titleBlock = marked.parse(first);
  const body = marked.parse("## " + rest.join("\n## "));
  const base = pathToFileURL(path.dirname(mdFile) + "/").href;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="${base}">
<title>LabClear 4.0.0 รายงานทางเทคนิค</title>
<style>
@font-face{font-family:"Noto Sans Thai";src:url(${fonts}/noto-sans-thai-400.woff2) format("woff2");font-weight:400}
@font-face{font-family:"Noto Sans Thai";src:url(${fonts}/noto-sans-thai-600.woff2) format("woff2");font-weight:600 700}
@font-face{font-family:"Geist Mono";src:url(${fonts}/geist-mono-variable.woff2) format("woff2");font-weight:100 900}
@font-face{font-family:"Geist";src:url(${fonts}/geist-variable.woff2) format("woff2");font-weight:100 900}
:root{--ink:#21172f;--muted:#5d5470;--line:#ddd5e8;--tint:#f4effb;--accent:#6539a9}
@page{size:A4;margin:20mm 20mm 22mm 22mm}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:"TH Sarabun New","Noto Sans Thai",sans-serif;font-size:16pt;line-height:1.38;color:var(--ink);margin:0}
.title{border-bottom:2px solid var(--accent);padding-bottom:10pt;margin-bottom:14pt}
.title h1{font-family:"Geist","Noto Sans Thai",sans-serif;font-weight:600;font-size:21pt;line-height:1.3;margin:0 0 6pt;color:var(--accent)}
.title p{margin:0 0 2pt;font-size:15pt}
.title blockquote{margin:10pt 0 0;padding:6pt 10pt;background:var(--tint);border-radius:4pt;font-size:14.5pt;color:var(--ink)}
h2{font-family:"Geist","Noto Sans Thai",sans-serif;font-weight:600;font-size:15pt;line-height:1.35;color:var(--accent);margin:18pt 0 6pt;break-after:avoid}
h3{font-family:"Geist","Noto Sans Thai",sans-serif;font-weight:600;font-size:12.5pt;line-height:1.4;margin:12pt 0 4pt;break-after:avoid}
p{margin:0 0 6pt;text-align:left}
ul,ol{margin:0 0 6pt;padding-left:18pt}
li{margin:0 0 2pt}
strong{font-weight:700}
a{color:var(--accent);text-decoration:none}
code{font-family:"Geist Mono","TH Sarabun New","Noto Sans Thai",monospace;font-size:9.5pt;background:var(--tint);padding:0 2pt;border-radius:2pt;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt;font-size:14pt;line-height:1.28;break-inside:auto}
thead{display:table-header-group}
tr{break-inside:avoid}
th{font-family:"Geist","Noto Sans Thai",sans-serif;font-weight:600;font-size:10.5pt;text-align:left;background:var(--tint);border-bottom:1.2pt solid var(--accent);padding:4pt 6pt;vertical-align:bottom}
td{border-bottom:.6pt solid var(--line);padding:3pt 6pt;vertical-align:top}
td code,th code{font-size:8.8pt}
img{display:block;max-width:100%;max-height:132mm;margin:6pt auto 10pt;break-inside:avoid}
img[src$="message-flow-4.0.png"]{max-height:200mm}
img[src$="architecture-4.0-detail.png"]{max-height:112mm}
p:has(> img){break-inside:avoid}
blockquote{margin:0 0 8pt;padding:4pt 10pt;border-left:0;background:var(--tint)}
</style></head><body><header class="title">${titleBlock}</header><main>${body}</main></body></html>`;
}

const browser = await chromium.launch({ executablePath, args: ["--allow-file-access-from-files"] });
try {
  if (mode === "report") {
    const md = path.join(root, "docs/report/LabClear_Technical_Report_4_0_0.md");
    const out = md.replace(/\.md$/, ".pdf");
    const html = path.join(mkdtempSync(path.join(tmpdir(), "labclear-report-")), "report.html");
    writeFileSync(html, reportHtml(md));
    const page = await browser.newPage();
    await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: out, format: "A4", printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: "<span></span>",
      footerTemplate: '<div style="width:100%;font-size:8px;color:#8d819d;text-align:center;font-family:sans-serif">LabClear 4.0.0 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    console.log("Wrote", path.relative(root, out));
  } else if (mode === "slides") {
    const deck = pathToFileURL(path.join(root, "presentation/index.html")).href + "?print-pdf";
    const out = path.join(root, "docs/report/LabClear_Slides_4_0_0.pdf");
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(deck, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.pdf({ path: out, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
    console.log("Wrote", path.relative(root, out));
  } else {
    throw new Error("Use: node scripts/build_docs_pdf.mjs report|slides");
  }
} finally {
  await browser.close();
}
