import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.env.PRESENTATION_EVIDENCE_OUT || "docs/evidence/current/presentation-html-final-20261012-v2");
const deckPath = path.join(root, "presentation/index.html");
const deckUrl = pathToFileURL(deckPath).href;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readHash = async (relative) => sha256(await readFile(path.join(root, relative)));
const startedAt = new Date().toISOString();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirtyPaths = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
const candidateFiles = [
  "presentation/index.html",
  "presentation/labclear-workflow-diagram.html",
  "presentation/labclear-interactive-infographic.html",
  "presentation/labclear-workflow.infographic",
  "scripts/verify_html_deck.mjs"
];
const results = [];
const browserErrors = [];

await mkdir(output, { recursive: true });

function record(id, expected, actual, evidence = [], predicate = null) {
  const pass = predicate ? predicate(actual) : typeof actual === "boolean" ? actual : isDeepStrictEqual(actual, expected);
  results.push({ id, expected, actual, status: pass ? "PASS" : "FAIL", evidence });
  return pass;
}

async function screenshot(page, filename) {
  const file = path.join(output, filename);
  const data = await page.screenshot({ path: file, animations: "disabled" });
  return { file: path.relative(root, file).replaceAll("\\", "/"), sha256: sha256(data) };
}

let browser;
let companionServer;
try {
  browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const companionFiles = new Map([
    ["/labclear-workflow-diagram.html", "presentation/labclear-workflow-diagram.html"],
    ["/labclear-interactive-infographic.html", "presentation/labclear-interactive-infographic.html"],
    ["/vendor/antv-infographic-0.2.20.min.js", "presentation/vendor/antv-infographic-0.2.20.min.js"]
  ]);
  companionServer = createServer(async (request, response) => {
    const file = companionFiles.get(new URL(request.url, "http://127.0.0.1").pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    const contentType = file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
    response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
    response.end(await readFile(path.join(root, file)));
  });
  await new Promise((resolve, reject) => {
    companionServer.once("error", reject);
    companionServer.listen(0, "127.0.0.1", resolve);
  });
  const companionOrigin = `http://127.0.0.1:${companionServer.address().port}`;
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  desktop.on("pageerror", (error) => browserErrors.push({ page: "desktop", message: error.message }));
  desktop.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ page: "desktop", message: message.text() });
  });
  await desktop.goto(deckUrl, { waitUntil: "networkidle" });
  await desktop.waitForFunction(() => window.__deckReady === true);

  const structure = await desktop.evaluate(() => {
    const slides = [...document.querySelectorAll(".reveal .slides > section")];
    const core = slides.filter((slide) => slide.dataset.core === "true");
    const seconds = core.reduce((sum, slide) => sum + Number(slide.dataset.estimate || 0), 0);
    const notes = slides.map((slide) => (slide.querySelector("aside.notes")?.textContent || "").trim());
    return {
      total: slides.length,
      revealSlides: Reveal.getSlides().length,
      core: core.length,
      appendix: slides.length - core.length,
      seconds,
      notesComplete: notes.every(Boolean)
    };
  });
  record("HTML-01", { total: 15, revealSlides: 15, core: 10, appendix: 5, seconds: 510, notesComplete: true }, structure);
  const expectedSlideIds = await desktop.evaluate(() => [...document.querySelectorAll(".reveal .slides > section")].map((slide) => slide.id));

  const diagrams = await desktop.evaluate(() => ({
    architectureNodes: document.querySelectorAll("#slide-05 .arch-node").length,
    customerSteps: document.querySelectorAll("#slide-03 .journey li").length,
    handoffRoles: document.querySelectorAll("#slide-07 .lane").length,
    nestedSlides: document.querySelectorAll(".reveal .slides section section").length
  }));
  record("HTML-02", { architectureNodes: 7, customerSteps: 5, handoffRoles: 3, nestedSlides: 0 }, diagrams);

  const fonts = await desktop.evaluate(async () => {
    await document.fonts.load('400 18px PlexThai', 'ทดสอบภาษาไทย');
    await document.fonts.load('600 32px TrirongThai', 'ห้องปฏิบัติการ');
    return {
      body: document.fonts.check('400 18px PlexThai', 'ทดสอบภาษาไทย'),
      display: document.fonts.check('600 32px TrirongThai', 'ห้องปฏิบัติการ'),
      status: document.fonts.status
    };
  });
  record("HTML-03", { body: true, display: true, status: "loaded" }, fonts);

  const navigation = await desktop.evaluate(async () => {
    const before = Reveal.getIndices().h;
    document.querySelector("#next").click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const after = Reveal.getIndices().h;
    const note = document.querySelectorAll("aside.notes")[after]?.textContent.trim();
    document.querySelector("#previous").click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { nextMoved: after === before + 1, previousRestored: Reveal.getIndices().h === before, notePresent: Boolean(note), slideCounter: document.querySelector("#slide-count").textContent };
  });
  record("HTML-04", { nextMoved: true, previousRestored: true, notePresent: true, slideCounter: "01 / 15" }, navigation);

  const desktopCaptures = [];
  const desktopLayout = [];
  for (let index = 0; index < structure.total; index += 1) {
    if (index > 0) {
      await desktop.locator("#next").click();
      await desktop.waitForFunction((slideIndex) => Reveal.getIndices().h === slideIndex, index);
    }
    await desktop.waitForTimeout(120);
    const expectedId = expectedSlideIds[index];
    const layout = await desktop.evaluate((expectedSlideId) => {
      const section = document.querySelector(".reveal .slides section.present");
      const frame = section?.querySelector(".frame");
      if (!section || !frame) return { present: false };
      return {
        present: true,
        id: section.id,
        expectedId: expectedSlideId,
        navigationMatches: section.id === expectedSlideId,
        frameWidth: frame.clientWidth,
        frameHeight: frame.clientHeight,
        scrollWidth: frame.scrollWidth,
        scrollHeight: frame.scrollHeight,
        sectionWidth: section.clientWidth,
        sectionHeight: section.clientHeight
      };
    }, expectedId);
    const number = String(index + 1).padStart(2, "0");
    const kind = index < structure.core ? "CORE" : "APPX";
    const capture = await screenshot(desktop, `PRES-${kind}-${number}-desktop.png`);
    desktopCaptures.push(capture);
    const fits = layout.present && layout.navigationMatches && layout.scrollWidth <= layout.frameWidth + 1 && layout.scrollHeight <= layout.frameHeight + 2;
    desktopLayout.push({ slide: index + 1, ...layout, status: fits ? "PASS" : "FAIL", screenshot: capture.file });
  }
  record("HTML-05", "15/15 desktop slides were navigated and fit the slide frame", `${desktopLayout.filter((item) => item.status === "PASS").length}/15`, desktopCaptures, (actual) => actual === "15/15");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  mobile.on("pageerror", (error) => browserErrors.push({ page: "mobile", message: error.message }));
  mobile.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ page: "mobile", message: message.text() });
  });
  await mobile.goto(deckUrl, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() => window.__deckReady === true);
  const mobileMode = await mobile.evaluate(() => document.body.classList.contains("mobile-reading"));
  record("HTML-06", true, mobileMode);
  const mobileToggle = await mobile.evaluate(async () => {
    const button = document.querySelector("#mobile-mode");
    button.click();
    const disabled = !document.body.classList.contains("mobile-reading") && button.getAttribute("aria-pressed") === "false";
    button.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { disabled, restored: document.body.classList.contains("mobile-reading") && button.getAttribute("aria-pressed") === "true" };
  });
  record("HTML-07", { disabled: true, restored: true }, mobileToggle);

  const mobileCaptures = [];
  const mobileLayout = [];
  for (let index = 0; index < structure.total; index += 1) {
    if (index > 0) {
      await mobile.locator("#next").click();
      await mobile.waitForFunction((slideIndex) => Reveal.getIndices().h === slideIndex, index);
    }
    await mobile.waitForTimeout(120);
    const expectedId = expectedSlideIds[index];
    const layout = await mobile.evaluate((expectedSlideId) => {
      const section = document.querySelector(".reveal .slides section.present");
      const frame = section?.querySelector(".frame");
      return {
        present: Boolean(section),
        id: section?.id || "",
        expectedId: expectedSlideId,
        navigationMatches: section?.id === expectedSlideId,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        frameWidth: frame?.clientWidth || 0,
        frameScrollWidth: frame?.scrollWidth || 0,
        sectionWidth: section?.clientWidth || 0,
        sectionHeight: section?.clientHeight || 0,
        sectionScrollHeight: section?.scrollHeight || 0,
        sectionBottom: section?.getBoundingClientRect().bottom || 0,
        controlsTop: document.querySelector(".deck-chrome")?.getBoundingClientRect().top || 0
      };
    }, expectedId);
    const number = String(index + 1).padStart(2, "0");
    const kind = index < structure.core ? "CORE" : "APPX";
    const capture = await screenshot(mobile, `PRES-${kind}-${number}-mobile.png`);
    mobileCaptures.push(capture);
    const fits = layout.present && layout.navigationMatches && layout.documentWidth <= layout.viewportWidth + 1 && layout.sectionWidth <= layout.viewportWidth + 1 && layout.frameScrollWidth <= layout.frameWidth + 1 && layout.sectionBottom <= layout.controlsTop + 1;
    mobileLayout.push({ slide: index + 1, ...layout, status: fits ? "PASS" : "FAIL", screenshot: capture.file });
  }
  record("HTML-08", "15/15 mobile slides were navigated without horizontal overflow", `${mobileLayout.filter((item) => item.status === "PASS").length}/15`, mobileCaptures, (actual) => actual === "15/15");

  for (let index = structure.total - 1; index > 2; index -= 1) {
    await mobile.locator("#previous").click();
    await mobile.waitForFunction((slideIndex) => Reveal.getIndices().h === slideIndex, index - 1);
  }
  const mobileScroll = await mobile.evaluate(async () => {
    const section = document.querySelector("#slide-03");
    const notice = section.querySelector(".notice-band");
    const controls = document.querySelector(".deck-chrome");
    section.scrollTop = section.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const noticeBounds = notice.getBoundingClientRect();
    const controlsTop = controls.getBoundingClientRect().top;
    return {
      scrolled: section.scrollTop > 0,
      finalStepVisible: section.querySelector(".journey li:last-child").getBoundingClientRect().bottom <= controlsTop,
      noticeVisible: noticeBounds.bottom <= controlsTop && noticeBounds.top >= 0,
      controlsTop,
      sectionBottom: section.getBoundingClientRect().bottom
    };
  });
  record("HTML-09", { scrolled: true, finalStepVisible: true, noticeVisible: true }, mobileScroll, [], (actual) =>
    actual.scrolled && actual.finalStepVisible && actual.noticeVisible && actual.sectionBottom <= actual.controlsTop + 1);

  await mobile.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await mobile.evaluate(() => {
    const host = document.querySelector("#slide-01 .hero-art");
    host.classList.add("is-active");
    const style = getComputedStyle(host.querySelector(".route-line"));
    const duration = style.animationDuration;
    const milliseconds = duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    return {
      preferenceHonored: matchMedia("(prefers-reduced-motion: reduce)").matches,
      duration,
      durationMs: milliseconds,
      iterations: style.animationIterationCount
    };
  });
  record("HTML-10", { preferenceHonored: true, durationMs: "<=0.001", iterations: "1" }, reducedMotion, [], (actual) =>
    actual.preferenceHonored && actual.durationMs <= 0.001 && actual.iterations === "1");

  const printPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  printPage.on("pageerror", (error) => browserErrors.push({ page: "print", message: error.message }));
  await printPage.goto(`${deckUrl}?print-pdf`, { waitUntil: "networkidle" });
  await printPage.waitForFunction(() => window.__deckReady === true);
  await printPage.emulateMedia({ media: "print" });
  const print = await printPage.evaluate(() => {
    const pages = [...document.querySelectorAll(".reveal .slides > .pdf-page")];
    const pageSlideCounts = pages.map((page) => page.querySelectorAll(":scope > section").length);
    const animation = getComputedStyle(document.querySelector("#slide-01 .route-line")).animationDuration;
    return {
      pages: pages.length,
      slides: Reveal.getSlides().length,
      oneSlidePerPage: pageSlideCounts.length === 15 && pageSlideCounts.every((count) => count === 1),
      animation
    };
  });
  const printCapture = await screenshot(printPage, "PRES-PRINT-01-static-opening.png");
  record("HTML-11", { pages: 15, slides: 15, oneSlidePerPage: true, animation: "0s" }, print, [printCapture]);
  const pdfFile = path.join(output, "LabClear-static-print.pdf");
  const pdfData = await printPage.pdf({
    path: pdfFile,
    width: "1280px",
    height: "720px",
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    printBackground: true,
    preferCSSPageSize: true
  });
  const pdfExport = {
    file: path.relative(root, pdfFile).replaceAll("\\", "/"),
    bytes: pdfData.length,
    sha256: sha256(pdfData),
    signature: pdfData.toString("ascii", 0, 5),
    pageCount: (pdfData.toString("latin1").match(/\/Type \/Page(?!s)\b/g) || []).length
  };
  record("HTML-12", { signature: "%PDF-", nonempty: true, pageCount: 15 }, pdfExport, [], (actual) => actual.signature === "%PDF-" && actual.bytes > 0 && actual.pageCount === 15);

  const controls = await desktop.evaluate(() => ({
    documentLanguage: document.documentElement.lang,
    navLabel: document.querySelector(".deck-chrome").getAttribute("aria-label"),
    buttonLabels: [...document.querySelectorAll(".chrome-actions button")].map((button) => button.getAttribute("aria-label")),
    sourceLinksLocal: [...document.querySelectorAll(".frame img")].every((image) => image.complete && image.naturalWidth > 0),
    companionLinks: [...document.querySelectorAll("#slide-07 .companion-actions a")].map((link) => link.getAttribute("href"))
  }));
  record("HTML-13", {
    documentLanguage: "th",
    navLabel: "ปุ่มควบคุมสไลด์",
    buttonLabels: ["สไลด์ก่อนหน้า", "ดูสไลด์ทั้งหมด", "สลับโหมดอ่านบนมือถือ", "สไลด์ถัดไป"],
    sourceLinksLocal: true,
    companionLinks: ["./labclear-workflow-diagram.html", "./labclear-interactive-infographic.html"]
  }, controls);

  const companionCaptures = [];
  const workflowPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const workflowErrors = [];
  workflowPage.on("pageerror", (error) => workflowErrors.push(error.message));
  await workflowPage.goto(`${companionOrigin}/labclear-workflow-diagram.html`, { waitUntil: "networkidle" });
  await workflowPage.waitForFunction(() => document.documentElement.dataset.fontsReady === "true");
  const workflowStatic = await workflowPage.evaluate(() => {
    const root = document.querySelector("[data-motion-root]");
    return {
      frame: root.dataset.frame,
      steps: Number(root.dataset.stepCount),
      nodes: root.querySelectorAll("[data-motion-item]").length,
      controlsReady: root.classList.contains("motion-ready"),
      controls: [...root.querySelectorAll("[data-motion-action]")].map((button) => button.dataset.motionAction),
      initialStep: Number(root.dataset.stepCurrent),
      initialVisibleItems: root.querySelectorAll("[data-motion-item].is-visible").length
    };
  });
  const workflowCapture = await screenshot(workflowPage, "PRES-COMPANION-workflow-diagram.png");
  companionCaptures.push(workflowCapture);
  await workflowPage.locator('[data-motion-action="replay"]').click();
  const workflowReplayed = await workflowPage.evaluate(() => {
    const root = document.querySelector("[data-motion-root]");
    return root.dataset.stepCurrent === "0" && root.dataset.frame === "start";
  });
  await workflowPage.locator('[data-motion-action="pause"]').click();
  const workflowPaused = await workflowPage.evaluate(() => !document.querySelector("[data-motion-root]").classList.contains("is-playing"));
  await workflowPage.locator('[data-motion-action="next"]').click();
  const workflowStepped = await workflowPage.evaluate(() => document.querySelector("[data-motion-root]").dataset.stepCurrent === "1");
  await workflowPage.locator('[data-motion-action="prev"]').click();
  for (let index = 0; index < 5; index += 1) await workflowPage.locator('[data-motion-action="next"]').click();
  const workflowComplete = await workflowPage.evaluate(() => {
    const root = document.querySelector("[data-motion-root]");
    return Number(root.dataset.stepCurrent) === 5 && root.querySelectorAll("[data-motion-item].is-visible").length === 5;
  });
  await workflowPage.setViewportSize({ width: 390, height: 844 });
  const workflowMobile = await workflowPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const workflowMobileCapture = await screenshot(workflowPage, "PRES-COMPANION-workflow-diagram-mobile.png");
  companionCaptures.push(workflowMobileCapture);
  const workflowNoJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const workflowNoJsPage = await workflowNoJsContext.newPage();
  await workflowNoJsPage.goto(`${companionOrigin}/labclear-workflow-diagram.html`, { waitUntil: "networkidle" });
  const workflowNoJs = await workflowNoJsPage.evaluate(() => {
    const root = document.querySelector("[data-motion-root]");
    const nodes = [...root.querySelectorAll("[data-motion-item]")];
    return {
      scriptsDisabled: !root.classList.contains("motion-ready"),
      controlsRemainHidden: getComputedStyle(root.querySelector("[data-motion-controls]")).display === "none",
      allFiveNodesVisible: nodes.length === 5 && nodes.every((item) => getComputedStyle(item).opacity === "1"),
      fallbackNotice: document.querySelector("noscript")?.textContent.includes("แสดงขั้นตอนครบทั้งหมด") === true
    };
  });
  const workflowNoJsCapture = await screenshot(workflowNoJsPage, "PRES-COMPANION-workflow-nojs.png");
  companionCaptures.push(workflowNoJsCapture);
  await workflowNoJsContext.close();
  record("HTML-14", {
    frame: "start", steps: 5, nodes: 5, controlsReady: true,
    controls: ["prev", "play", "pause", "next", "replay"], initialStep: 0, initialVisibleItems: 0,
    stepped: true, replayed: true, paused: true, complete: true, mobile: true,
    noJsFallback: { scriptsDisabled: true, controlsRemainHidden: true, allFiveNodesVisible: true, fallbackNotice: true }, errors: 0
  }, { ...workflowStatic, stepped: workflowStepped, replayed: workflowReplayed, paused: workflowPaused,
    complete: workflowComplete, mobile: workflowMobile, noJsFallback: workflowNoJs, errors: workflowErrors.length },
  [workflowCapture, workflowMobileCapture, workflowNoJsCapture], (actual) =>
    actual.frame === "start" && actual.initialStep === 0 && actual.initialVisibleItems === 0 &&
    actual.stepped && actual.replayed && actual.paused && actual.complete && actual.mobile &&
    actual.noJsFallback.scriptsDisabled && actual.noJsFallback.controlsRemainHidden && actual.noJsFallback.allFiveNodesVisible &&
    actual.noJsFallback.fallbackNotice && actual.errors === 0);

  const infographicPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
  const infographicErrors = [];
  const externalRequests = [];
  infographicPage.on("pageerror", (error) => infographicErrors.push(error.message));
  infographicPage.on("console", (message) => {
    if (message.type() === "error") infographicErrors.push(message.text());
  });
  infographicPage.on("request", (request) => {
    if (request.url().startsWith("https://")) externalRequests.push(request.url());
  });
  infographicPage.on("requestfailed", (request) => infographicErrors.push(`${request.url()}: ${request.failure()?.errorText || "request failed"}`));
  await infographicPage.route("https://**", (route) => route.abort());
  let infographicResult = { loaded: false, errors: [] };
  try {
    await infographicPage.goto(`${companionOrigin}/labclear-interactive-infographic.html`, { waitUntil: "domcontentloaded" });
    await infographicPage.waitForFunction(() => document.querySelector("#container[data-rendered='true'] svg:not(.static-fallback)") && document.querySelector("#status")?.textContent.includes("แสดงภาพแล้ว"), undefined, { timeout: 20000 });
    const originalSource = await infographicPage.locator("#source").inputValue();
    const sourceContract = {
      unlabelledConsentRelation: (originalSource.match(/^\s*customer-consent\s*->\s*staff-receive-selected\s*$/gm) || []).length === 1,
      labelledConsentRelationCount: (originalSource.match(/^\s*customer-consent\s+-\s+.+\s+->\s+staff-receive-selected\s*$/gm) || []).length,
      selectedOnlyConsentDescription: /^\s*desc .*ยืนยันความยินยอมก่อนส่งเฉพาะข้อความที่เลือก.*$/mu.test(originalSource),
      customerConsentNode: /^\s*- label เลือกข้อความที่ยินยอม\s*\r?\n\s*id customer-consent\s*$/mu.test(originalSource),
      staffSelectedReceiptNode: /^\s*- label รับเรื่องที่เลือกไว้\s*\r?\n\s*id staff-receive-selected\s*$/mu.test(originalSource)
    };
    const revisedSource = originalSource.replace("title เส้นทางจากการเลือกสู่การช่วยเหลือ", "title เส้นทางแบบทดสอบในเครื่อง");
    await infographicPage.locator("details summary").click();
    await infographicPage.locator("#source").fill(revisedSource);
    await infographicPage.locator("#render").click();
    await infographicPage.waitForFunction(() => document.querySelector("#container[data-rendered='true'] svg:not(.static-fallback)") && document.querySelector("#status")?.textContent.includes("แสดงภาพแล้ว"));
    const renderedTitle = await infographicPage.locator("#container svg:not(.static-fallback)").textContent();
    const titleRendered = renderedTitle.includes("เส้นทางแบบทดสอบในเครื่อง");
    const infographicCapture = await screenshot(infographicPage, "PRES-COMPANION-infographic-edited.png");
    companionCaptures.push(infographicCapture);
    await infographicPage.setViewportSize({ width: 390, height: 844 });
    const infographicMobile = await infographicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    const infographicMobileCapture = await screenshot(infographicPage, "PRES-COMPANION-infographic-mobile.png");
    companionCaptures.push(infographicMobileCapture);
    const infographicNoJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const infographicNoJsPage = await infographicNoJsContext.newPage();
    await infographicNoJsPage.goto(`${companionOrigin}/labclear-interactive-infographic.html`, { waitUntil: "networkidle" });
    const infographicNoJs = await infographicNoJsPage.evaluate(() => ({
      fallbackVisible: getComputedStyle(document.querySelector("#container .static-fallback-mobile")).display !== "none",
      fallbackHasFiveSteps: ["เลือกบริการ", "ขอนัดหมาย", "ยินยอมส่งต่อ", "เจ้าหน้าที่ตอบกลับ", "ปิดเรื่อง"].every((label) =>
        [...document.querySelectorAll("#container .static-fallback-mobile text")].some((item) => item.textContent.includes(label))),
      selectedOnlyConsentDescription: document.querySelector("#consent-fallback-note")?.textContent.includes("ส่งต่อเฉพาะข้อความที่ลูกค้าเลือกและยินยอม") === true,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
    }));
    const infographicNoJsCapture = await screenshot(infographicNoJsPage, "PRES-COMPANION-infographic-nojs.png");
    companionCaptures.push(infographicNoJsCapture);
    await infographicNoJsContext.close();
    const downloadEvent = infographicPage.waitForEvent("download");
    await infographicPage.locator("#download").click();
    const download = await downloadEvent;
    const svgPath = path.join(output, "labclear-help-workflow-edited.svg");
    await download.saveAs(svgPath);
    const svgData = await readFile(svgPath);
    const infographicSvg = {
      file: path.relative(root, svgPath).replaceAll("\\", "/"),
      bytes: svgData.length,
      sha256: sha256(svgData),
      signature: svgData.toString("utf8", 0, 4)
    };
    infographicResult = {
      loaded: true,
      sourceContract,
      edited: revisedSource.includes("title เส้นทางแบบทดสอบในเครื่อง"),
      rendered: (await infographicPage.locator("#container[data-rendered='true'] svg:not(.static-fallback)").count()) > 0 && titleRendered,
      downloaded: download.suggestedFilename() === "labclear-help-workflow.svg" && /<svg\b/.test(svgData.toString("utf8")),
      mobile: infographicMobile,
      noJsFallback: infographicNoJs,
      svg: infographicSvg,
      externalRequests: [...new Set(externalRequests.map((url) => new URL(url).host))],
      errors: infographicErrors
    };
    record("HTML-15", { loaded: true, sourceContract: { unlabelledConsentRelation: true, labelledConsentRelationCount: 0,
      selectedOnlyConsentDescription: true, customerConsentNode: true, staffSelectedReceiptNode: true },
      edited: true, rendered: true, downloaded: true, mobile: true,
      noJsFallback: { fallbackVisible: true, fallbackHasFiveSteps: true, selectedOnlyConsentDescription: true,
        noHorizontalOverflow: true }, externalRequests: [], errors: [] },
    infographicResult, [infographicCapture, infographicMobileCapture, infographicNoJsCapture, infographicSvg], (actual) =>
      actual.loaded && actual.sourceContract.unlabelledConsentRelation && actual.sourceContract.labelledConsentRelationCount === 0 &&
      actual.sourceContract.selectedOnlyConsentDescription && actual.sourceContract.customerConsentNode && actual.sourceContract.staffSelectedReceiptNode &&
      actual.edited && actual.rendered && actual.downloaded && actual.mobile &&
      actual.noJsFallback.fallbackVisible && actual.noJsFallback.fallbackHasFiveSteps && actual.noJsFallback.selectedOnlyConsentDescription && actual.noJsFallback.noHorizontalOverflow &&
      actual.externalRequests.length === 0 && actual.errors.length === 0);
  } catch (error) {
    infographicResult = { ...infographicResult, error: error.message, externalRequests, errors: infographicErrors };
    results.push({ id: "HTML-15", expected: "Render, edit and export a Thai infographic", actual: infographicResult, status: "BLOCKED", evidence: [] });
  }

  const errorsOk = browserErrors.length === 0;
  record("HTML-16", 0, browserErrors.length);

  async function contactSheet(captures, filename, columns, cellWidth) {
    const cellHeight = Math.round(cellWidth * (captures === desktopCaptures ? 720 / 1280 : 844 / 390));
    const tiles = await Promise.all(captures.map(async (capture, index) => {
      const image = (await readFile(path.join(root, capture.file))).toString("base64");
      return `<figure><img src="data:image/png;base64,${image}" alt=""><figcaption>${String(index + 1).padStart(2, "0")}</figcaption></figure>`;
    }));
    const rows = Math.ceil(tiles.length / columns);
    const sheet = await browser.newPage({ viewport: { width: columns * cellWidth + 48, height: rows * (cellHeight + 36) + 48 }, deviceScaleFactor: 1 });
    await sheet.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f3f2f6;font:14px Geist,Arial,sans-serif}.grid{display:grid;grid-template-columns:repeat(${columns},${cellWidth}px);gap:12px}figure{margin:0;background:white;border:1px solid #e3e2e7}img{display:block;width:100%;height:${cellHeight}px;object-fit:contain;background:#fdfcfe}figcaption{height:24px;padding:3px 8px;color:#5e5c65}</style><main class="grid">${tiles.join("")}</main>`);
    await sheet.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
    const file = path.join(output, filename);
    const data = await sheet.screenshot({ path: file, fullPage: true, animations: "disabled" });
    await sheet.close();
    return { file: path.relative(root, file).replaceAll("\\", "/"), sha256: sha256(data) };
  }

  const desktopContactSheet = await contactSheet(desktopCaptures, "PRES-CONTACT-desktop.png", 4, 340);
  const mobileContactSheet = await contactSheet(mobileCaptures, "PRES-CONTACT-mobile.png", 3, 360);

  const assets = [
    "presentation/index.html",
    "presentation/labclear-workflow-diagram.html",
    "presentation/labclear-interactive-infographic.html",
    "presentation/labclear-workflow.infographic",
    "presentation/vendor/antv-infographic-0.2.20.min.js",
    "presentation/vendor/ANTV-INFOGRAPHIC-LICENSE.txt",
    "scripts/verify_html_deck.mjs",
    "presentation/vendor/reveal.js-5.2.1/reveal.js",
    "presentation/vendor/reveal.js-5.2.1/reveal.css",
    "presentation/vendor/reveal.js-5.2.1/plugin/notes/notes.js",
    "static/img/mark.svg",
    "docs/evidence/current/browser-uat-final-20261012-03/UI-02_catalog-1440.png",
    "static/fonts/geist-variable.woff2",
    "static/fonts/source-serif-4-opsz.woff2",
    "static/fonts/ibm-plex-sans-thai-thai-400-normal.woff2",
    "static/fonts/trirong-thai-500-normal.woff2"
  ];
  const fileHashes = {};
  for (const asset of assets) fileHashes[asset] = await readHash(asset);
  const report = {
    run_id: path.basename(output),
    started_at_utc: startedAt,
    finished_at_utc: new Date().toISOString(),
    candidate_head: head,
    mode: "local HTML; no API, LLM, OCR, payment, or deployment calls; pinned AntV Infographic 0.2.20 bundle served locally; external requests blocked",
    environment: {
      platform: process.platform,
      node: process.version,
      playwright: JSON.parse(await readFile(path.join(root, "node_modules/playwright/package.json"), "utf8")).version,
      browser: browserVersion,
      desktop_viewport: { width: 1440, height: 900 },
      mobile_viewport: { width: 390, height: 844 },
      html_sha256: fileHashes["presentation/index.html"]
    },
    asset_sha256: fileHashes,
    candidate_file_sha256: Object.fromEntries(await Promise.all(candidateFiles.map(async (file) => [file, await readHash(file)]))),
    worktree: {
      dirty_path_count: dirtyPaths ? dirtyPaths.split(/\r?\n/).length : 0,
      status_sha256: sha256(dirtyPaths)
    },
    cases: results,
    desktop_slides: desktopLayout,
    mobile_slides: mobileLayout,
    browser_errors: browserErrors,
    static_pdf: pdfExport,
    screenshots: [...desktopCaptures, ...mobileCaptures, printCapture, desktopContactSheet, mobileContactSheet, ...companionCaptures],
    summary: {
      total: results.length,
      passed: results.filter((item) => item.status === "PASS").length,
      failed: results.filter((item) => item.status === "FAIL").length,
      screenshots: desktopCaptures.length + mobileCaptures.length + 3 + companionCaptures.length,
      exit_code: results.every((item) => item.status === "PASS") && errorsOk ? 0 : 1
    }
  };
  await writeFile(path.join(output, "html-deck-qa.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  for (const result of results) console.log(`${result.id} ${result.status} expected=${JSON.stringify(result.expected)} actual=${JSON.stringify(result.actual)}`);
  if (report.summary.exit_code !== 0) process.exitCode = 1;
} catch (error) {
  browserErrors.push({ page: "runner", message: error.stack || error.message });
  await writeFile(path.join(output, "html-deck-qa-failure.json"), JSON.stringify({ started_at_utc: startedAt, candidate_head: head, browser_errors: browserErrors, results }, null, 2) + "\n", "utf8");
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (companionServer) await new Promise((resolve) => companionServer.close(resolve));
}
