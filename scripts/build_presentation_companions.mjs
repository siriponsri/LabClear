import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'presentation')
const diagramSkillDir = path.join(process.env.USERPROFILE || process.cwd(), '.agents', 'skills', 'diagram-design')
const motionTemplate = path.join(diagramSkillDir, 'assets', 'template-motion.html')
const fontsDir = path.join(root, 'static', 'fonts')

const tokens = {
  paper: '#FDFCFE',
  paperSubtle: '#F7F7FA',
  surface: '#FFFFFF',
  surface2: '#F3F2F6',
  ink: '#17161C',
  muted: '#5E5C65',
  soft: '#75737B',
  rule: '#E3E2E7',
  accent: '#6539A9',
  accentStrong: '#4E008A',
  accentTint: '#F3EFFF',
  ok: '#036639',
  warn: '#81520A',
}

function fontData(fileName) {
  const data = fs.readFileSync(path.join(fontsDir, fileName)).toString('base64')
  return `data:font/woff2;base64,${data}`
}

function embeddedFontCss() {
  return `
    @font-face{font-family:Geist;src:url('${fontData('geist-variable.woff2')}') format('woff2');font-weight:100 900;font-display:swap}
    @font-face{font-family:GeistMono;src:url('${fontData('geist-mono-variable.woff2')}') format('woff2');font-weight:100 900;font-display:swap}
    @font-face{font-family:RSDisplay;src:url('${fontData('source-serif-4-opsz.woff2')}') format('woff2');font-weight:200 900;font-display:swap}
    @font-face{font-family:RSDisplayThai;src:url('${fontData('trirong-thai-500-normal.woff2')}') format('woff2');font-weight:400 500;font-display:swap;unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
    @font-face{font-family:RSDisplayThai;src:url('${fontData('trirong-thai-600-normal.woff2')}') format('woff2');font-weight:600 900;font-display:swap;unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
    @font-face{font-family:PlexThai;src:url('${fontData('ibm-plex-sans-thai-thai-400-normal.woff2')}') format('woff2');font-weight:300 400;font-display:swap;unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
    @font-face{font-family:PlexThai;src:url('${fontData('ibm-plex-sans-thai-thai-500-normal.woff2')}') format('woff2');font-weight:500;font-display:swap;unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
    @font-face{font-family:PlexThai;src:url('${fontData('ibm-plex-sans-thai-thai-600-normal.woff2')}') format('woff2');font-weight:600 800;font-display:swap;unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
  `
}

function requireMotionController() {
  if (!fs.existsSync(motionTemplate)) {
    throw new Error(`diagram-design motion template not found: ${motionTemplate}`)
  }
  const source = fs.readFileSync(motionTemplate, 'utf8')
  const match = source.match(/<script data-diagram-controls>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('Canonical diagram-design motion controller was not found')
  return match[1].trim()
}

function node({ x, y, label, detail, step, lane, focal = false }) {
  const fill = focal ? tokens.accentTint : tokens.surface
  const stroke = focal ? tokens.accent : tokens.rule
  const accent = focal ? tokens.accentStrong : tokens.ink
  const actor = { customer: 'ลูกค้า', assistant: 'ผู้ช่วย', staff: 'เจ้าหน้าที่' }[lane]
  return `
    <g class="node${focal ? ' focal' : ''}" data-motion-item data-step="${step}" aria-label="ขั้นที่ ${step}: ${label} โดย${actor}">
      <rect x="${x}" y="${y}" width="196" height="116" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${focal ? 2 : 1.25}"/>
      <text x="${x + 18}" y="${y + 26}" class="node-actor">${actor}</text>
      <text x="${x + 18}" y="${y + 62}" class="node-title" fill="${accent}">${label}</text>
      <text x="${x + 18}" y="${y + 90}" class="node-detail">${detail}</text>
      <circle cx="${x + 172}" cy="${y + 22}" r="12" fill="${focal ? tokens.accent : tokens.surface2}"/>
      <text x="${x + 172}" y="${y + 26}" class="step-number" text-anchor="middle" fill="${focal ? tokens.surface : tokens.muted}">${step}</text>
    </g>`
}

function workflowHtml(controller) {
  const stages = [
    { x: 78, y: 188, label: 'เลือกบริการ', detail: 'เปรียบเทียบรายการตรวจ', step: 1, lane: 'customer' },
    { x: 330, y: 188, label: 'ขอนัดหมาย', detail: 'ส่งคำขอให้เจ้าหน้าที่', step: 2, lane: 'customer' },
    { x: 582, y: 358, label: 'ยินยอมส่งต่อ', detail: 'เลือกข้อความเอง', step: 3, lane: 'assistant', focal: true },
    { x: 834, y: 528, label: 'ตอบกลับ', detail: 'เจ้าหน้าที่รับช่วงคุยต่อ', step: 4, lane: 'staff' },
    { x: 1086, y: 188, label: 'ปิดเรื่อง', detail: 'เริ่มห้องใหม่ได้', step: 5, lane: 'customer' },
  ]
  const nodes = stages.map(node).join('\n')
  const fonts = embeddedFontCss()
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LabClear — เส้นทางการขอความช่วยเหลือ</title>
  <style>
    ${fonts}
    :root{--paper:${tokens.paper};--paper-2:${tokens.paperSubtle};--surface:${tokens.surface};--surface-2:${tokens.surface2};--ink:${tokens.ink};--muted:${tokens.muted};--soft:${tokens.soft};--rule:${tokens.rule};--accent:${tokens.accent};--accent-strong:${tokens.accentStrong};--accent-tint:${tokens.accentTint};--ok:${tokens.ok};--warn:${tokens.warn};--motion-fast:160ms;--motion-step:480ms;--motion-hold:720ms;--motion-total:3600ms;--motion-ease:cubic-bezier(.2,.8,.2,1)}
    *{box-sizing:border-box}
    body{margin:0;background:var(--paper);color:var(--ink);font-family:Geist,PlexThai,"IBM Plex Sans Thai",sans-serif}
    main{width:min(100%,1440px);margin:0 auto;padding:38px 38px 30px}
    .eyebrow{margin:0 0 8px;color:var(--accent);font:600 12px/1.4 GeistMono,monospace}
    h1{margin:0;font:600 36px/1.18 RSDisplay,RSDisplayThai,Trirong,serif}
    .intro{margin:12px 0 22px;max-width:920px;color:var(--muted);font-size:18px;line-height:1.55}
    .stage{width:100%;overflow-x:auto;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);background:var(--surface)}
    svg{display:block;width:1360px;max-width:none;height:auto}
    .lane-label{font:600 16px Geist,PlexThai,"IBM Plex Sans Thai",sans-serif;fill:var(--muted)}
    .lane-line{stroke:var(--rule);stroke-width:1}
    .connector{fill:none;stroke:var(--muted);stroke-width:2;marker-end:url(#arrow)}
    .connector-focus{stroke:var(--accent);stroke-width:2.5}
    .node-actor{font:500 13px Geist,PlexThai,"IBM Plex Sans Thai",sans-serif;fill:var(--muted)}
    .node-title{font:600 20px RSDisplay,RSDisplayThai,Trirong,serif}
    .node-detail{font:400 14px Geist,PlexThai,"IBM Plex Sans Thai",sans-serif;fill:var(--muted)}
    .step-number{font:600 11px GeistMono,monospace}
    .source{margin:12px 0 0;color:var(--soft);font:400 12px/1.5 GeistMono,Geist,PlexThai,monospace}
    [data-motion-root]{--motion-step:480ms;--motion-hold:720ms;--motion-total:3600ms}
    .motion-ready [data-motion-item]{opacity:.16;transform:translateY(8px);transform-box:fill-box;transform-origin:center;transition:opacity var(--motion-step) var(--motion-ease),transform var(--motion-step) var(--motion-ease)}
    .motion-ready [data-motion-item].is-visible,.motion-ready[data-frame="end"] [data-motion-item],.motion-ready[data-frame="static"] [data-motion-item]{opacity:1;transform:none}
    [data-motion-controls]{display:none;align-items:center;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--rule)}
    .motion-ready [data-motion-controls]{display:flex}
    [data-motion-controls][hidden]{display:none!important}
    [data-motion-controls] button{min-width:44px;min-height:44px;padding:8px 12px;border:1px solid var(--rule);border-radius:4px;background:var(--surface);color:var(--ink);font:500 14px Geist,PlexThai,"IBM Plex Sans Thai",sans-serif;cursor:pointer}
    [data-motion-controls] button:hover{border-color:var(--accent)}
    [data-motion-controls] button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
    [data-motion-controls] button:disabled{cursor:not-allowed;opacity:.45}
    [data-motion-status-visible]{margin-left:auto;color:var(--muted);font:500 12px GeistMono,monospace}
    .keyboard-help{width:100%;color:var(--soft);font-size:12px}
    [data-motion-status]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}[data-motion-item]{opacity:1!important;transform:none!important}[data-motion-controls]{display:none!important}}
    @media print{main{padding:0}.stage{overflow:visible}svg{width:100%;min-width:0}[data-motion-controls]{display:none!important}[data-motion-item]{opacity:1!important;transform:none!important;animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  <main data-motion-root data-motion-mode="step" data-step-count="5" data-step-current="5" data-frame="static" data-static-frame="complete">
    <p class="eyebrow">LABCLEAR  /  ขั้นตอนการติดต่อ</p>
    <h1>จากคำถาม สู่การช่วยเหลือจากเจ้าหน้าที่</h1>
    <p class="intro">ผู้ช่วยจะหยุดและขออนุญาตก่อนส่งข้อความให้เจ้าหน้าที่ ลูกค้าเป็นผู้เลือกข้อมูลที่จะแบ่งปัน และสามารถเริ่มการสนทนาใหม่หลังเรื่องเดิมปิดได้</p>
    <div class="stage">
      <svg viewBox="0 0 1360 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="labclear-workflow-title labclear-workflow-desc">
        <title id="labclear-workflow-title">เส้นทางการขอความช่วยเหลือ</title>
        <desc id="labclear-workflow-desc">ลูกค้าเลือกแพ็กเกจและขอวันนัดหมาย ผู้ช่วยขออนุญาตก่อนส่งข้อมูล เจ้าหน้าที่รับช่วงตอบกลับ และลูกค้าปิดเรื่องก่อนเริ่มการสนทนาใหม่</desc>
        <defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0 0L8 3L0 6Z" fill="${tokens.muted}"/></marker></defs>
        <rect width="1360" height="620" fill="${tokens.surface}"/>
        <rect x="150" y="82" width="1210" height="150" fill="${tokens.paper}"/>
        <rect x="150" y="252" width="1210" height="150" fill="${tokens.paperSubtle}"/>
        <rect x="150" y="422" width="1210" height="150" fill="${tokens.paper}"/>
        <text x="34" y="160" class="lane-label">ลูกค้า</text>
        <text x="34" y="330" class="lane-label">ผู้ช่วย</text>
        <text x="34" y="500" class="lane-label">เจ้าหน้าที่</text>
        <path class="lane-line" d="M150 82H1360M150 232H1360M150 252H1360M150 402H1360M150 422H1360M150 572H1360"/>
        <path class="connector" d="M274 246H322"/>
        <path class="connector connector-focus" d="M526 246H672Q680 246 680 254V358"/>
        <path class="connector connector-focus" d="M778 416H924Q932 416 932 424V528"/>
        <path class="connector" d="M1030 586H1176Q1184 586 1184 578V188"/>
        ${nodes}
      </svg>
    </div>
    <p class="source">ที่มา: การทดสอบเส้นทางในเครื่องเมื่อ 11 ตุลาคม 2569 · ใช้ข้อมูลสร้างขึ้น · ไม่ใช่การสนทนาจริง</p>
    <div data-motion-controls role="group" aria-label="ปุ่มควบคุมขั้นตอน">
      <button type="button" data-motion-action="prev" aria-label="ขั้นก่อนหน้า">ก่อนหน้า</button>
      <button type="button" data-motion-action="play" aria-pressed="false">เริ่ม</button>
      <button type="button" data-motion-action="pause" aria-pressed="true">หยุด</button>
      <button type="button" data-motion-action="next" aria-label="ขั้นถัดไป">ถัดไป</button>
      <button type="button" data-motion-action="replay">เริ่มใหม่</button>
      <span data-motion-status-visible aria-hidden="true">ขั้น <span data-motion-step-label>5</span> จาก 5</span>
      <span class="keyboard-help">ใช้ปุ่มลูกศรซ้ายและขวาเพื่อเปลี่ยนขั้น หรือกดเว้นวรรคเพื่อเริ่มและหยุด</span>
    </div>
    <p data-motion-status role="status" aria-live="polite" aria-atomic="true"></p>
    <noscript><p>ภาพด้านบนแสดงขั้นตอนครบทั้งหมด การควบคุมต้องเปิดใช้งาน JavaScript</p></noscript>
  </main>
  <script data-diagram-controls>${controller}</script>
</body>
</html>`
}

const icons = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  package: 'M4 7l8-4 8 4-8 4zm0 0v10l8 4 8-4V7M12 11v10',
  calendar: 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16',
  check: 'M4 12l5 5L20 6',
  message: 'M4 5h16v11H9l-5 4z',
  shield: 'M12 3l8 4v5c0 5-3 8-8 10-5-2-8-5-8-10V7zM8 12l3 3 5-6',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4',
  add: 'M12 5v14M5 12h14',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6m7-1a2.5 2.5 0 1 0 0-5M3 20a6 6 0 0 1 12 0m1-4a4 4 0 0 1 5 4',
  inbox: 'M4 4h16v16H4zm0 10h5l3 3 3-3h5',
  send: 'M22 2L11 13m11-11-7 20-4-9-9-4z',
}
const icon = (name) => `ref:svg:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${icons[name]}" fill="none" stroke="${tokens.accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const syntax = `infographic sequence-interaction-default-compact-card
data
  title เส้นทางจากการเลือกสู่การช่วยเหลือ
  desc ลูกค้าเลือกข้อความที่จะส่งต่อและยืนยันความยินยอมก่อนส่งเฉพาะข้อความที่เลือก เจ้าหน้าที่รับช่วงตอบกลับ และลูกค้าเริ่มการสนทนาใหม่ได้
  sequences
    - label ลูกค้า
      icon ${icon('user')}
      children
        - label เลือกแพ็กเกจ
          id customer-choose-package
          step 0
          icon ${icon('package')}
        - label ขอวันนัดหมาย
          id customer-request-time
          step 1
          icon ${icon('calendar')}
        - label เลือกข้อความที่ยินยอม
          id customer-consent
          step 2
          icon ${icon('check')}
        - label อ่านคำตอบ
          id customer-read-reply
          step 4
          icon ${icon('message')}
    - label ผู้ช่วย
      icon ${icon('message')}
      children
        - label ขออนุญาตส่งต่อ
          id assistant-asks-consent
          step 2
          icon ${icon('shield')}
        - label แจ้งผลการรับเรื่อง
          id assistant-confirm-ticket
          step 3
          icon ${icon('bell')}
        - label เริ่มห้องใหม่
          id assistant-new-chat
          step 4
          icon ${icon('add')}
    - label เจ้าหน้าที่
      icon ${icon('users')}
      children
        - label รับเรื่องที่เลือกไว้
          id staff-receive-selected
          step 3
          icon ${icon('inbox')}
        - label ตอบกลับลูกค้า
          id staff-reply
          step 4
          icon ${icon('send')}
  relations
    customer-choose-package - เลือกรายการ -> customer-request-time
    customer-request-time - ส่งคำขอ -> assistant-asks-consent
    customer-consent -> staff-receive-selected
    staff-receive-selected - เจ้าหน้าที่ตอบกลับ -> staff-reply
    staff-reply - ส่งคำตอบ -> customer-read-reply
theme
  palette ${tokens.accent} ${tokens.ink} ${tokens.muted}
  base
    text
      font-family IBM Plex Sans Thai
`

function infographicHtml() {
  const escaped = syntax.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')
  const fallbackSvg = `<svg class="static-fallback static-fallback-desktop" viewBox="0 0 1200 260" role="img" aria-labelledby="fallback-title fallback-desc"><title id="fallback-title">เส้นทางจากการเลือกสู่การช่วยเหลือ</title><desc id="fallback-desc">ลูกค้าเลือกบริการและขอนัดหมาย ผู้ช่วยขอความยินยอม เจ้าหน้าที่ตอบกลับ และลูกค้าปิดเรื่องหรือเริ่มห้องใหม่</desc><rect width="1200" height="260" fill="#FDFCFE"/><g fill="none" stroke="#C9C6D0" stroke-width="3"><path d="M205 130H285M435 130H515M665 130H745M895 130H975"/></g><g font-family="PlexThai,sans-serif" text-anchor="middle"><g><rect x="35" y="78" width="170" height="104" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="120" y="124" font-size="16" font-weight="600" fill="#17161C">1 · เลือกบริการ</text><text x="120" y="151" font-size="12" fill="#5E5C65">ลูกค้า</text></g><g><rect x="265" y="78" width="170" height="104" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="350" y="124" font-size="16" font-weight="600" fill="#17161C">2 · ขอนัดหมาย</text><text x="350" y="151" font-size="12" fill="#5E5C65">ลูกค้า</text></g><g><rect x="495" y="78" width="170" height="104" rx="10" fill="#F3EFFF" stroke="#6539A9" stroke-width="2"/><text x="580" y="124" font-size="16" font-weight="600" fill="#4E008A">3 · ยินยอมส่งต่อ</text><text x="580" y="151" font-size="12" fill="#5E5C65">ผู้ช่วย</text></g><g><rect x="725" y="78" width="170" height="104" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="810" y="124" font-size="16" font-weight="600" fill="#17161C">4 · ตอบกลับ</text><text x="810" y="151" font-size="12" fill="#5E5C65">เจ้าหน้าที่</text></g><g><rect x="955" y="78" width="170" height="104" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="1040" y="124" font-size="16" font-weight="600" fill="#17161C">5 · ปิดเรื่อง</text><text x="1040" y="151" font-size="12" fill="#5E5C65">ลูกค้า · เริ่มห้องใหม่ได้</text></g></g></svg>`
  const mobileFallbackSvg = `<svg class="static-fallback static-fallback-mobile" viewBox="0 0 360 560" role="img" aria-labelledby="fallback-mobile-title fallback-mobile-desc"><title id="fallback-mobile-title">เส้นทางจากการเลือกสู่การช่วยเหลือ</title><desc id="fallback-mobile-desc">ลูกค้าเลือกบริการและขอนัดหมาย ผู้ช่วยขอความยินยอม เจ้าหน้าที่ตอบกลับ และลูกค้าปิดเรื่อง</desc><rect width="360" height="560" fill="#FDFCFE"/><g fill="none" stroke="#C9C6D0" stroke-width="3"><path d="M180 100v24m0 72v24m0 72v24m0 72v24"/></g><g font-family="PlexThai,sans-serif" text-anchor="middle"><g><rect x="42" y="28" width="276" height="72" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="180" y="60" font-size="16" font-weight="600" fill="#17161C">1 · เลือกบริการ</text><text x="180" y="82" font-size="12" fill="#5E5C65">ลูกค้า</text></g><g><rect x="42" y="124" width="276" height="72" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="180" y="156" font-size="16" font-weight="600" fill="#17161C">2 · ขอนัดหมาย</text><text x="180" y="178" font-size="12" fill="#5E5C65">ลูกค้า</text></g><g><rect x="42" y="220" width="276" height="72" rx="10" fill="#F3EFFF" stroke="#6539A9" stroke-width="2"/><text x="180" y="252" font-size="16" font-weight="600" fill="#4E008A">3 · ยินยอมส่งต่อ</text><text x="180" y="274" font-size="12" fill="#5E5C65">ผู้ช่วย</text></g><g><rect x="42" y="316" width="276" height="72" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="180" y="348" font-size="16" font-weight="600" fill="#17161C">4 · เจ้าหน้าที่ตอบกลับ</text><text x="180" y="370" font-size="12" fill="#5E5C65">เจ้าหน้าที่</text></g><g><rect x="42" y="412" width="276" height="72" rx="10" fill="#FFF" stroke="#E3E2E7"/><text x="180" y="444" font-size="16" font-weight="600" fill="#17161C">5 · ปิดเรื่อง</text><text x="180" y="466" font-size="12" fill="#5E5C65">ลูกค้าเริ่มห้องใหม่ได้</text></g></g></svg>`
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LabClear — ภาพข้อมูลเส้นทางการช่วยเหลือ</title>
  <style>
    ${embeddedFontCss()}
    :root{color-scheme:light;--paper:${tokens.paper};--surface:${tokens.surface};--ink:${tokens.ink};--muted:${tokens.muted};--rule:${tokens.rule};--accent:${tokens.accent}}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Geist,PlexThai,"IBM Plex Sans Thai",sans-serif}
    main{max-width:1440px;margin:auto;padding:32px 28px 48px}header{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:20px}h1{margin:0;font:600 32px/1.2 RSDisplay,RSDisplayThai,Trirong,serif}p{margin:6px 0 0;color:var(--muted);font-size:15px;line-height:1.5}.actions{display:flex;gap:8px;flex:none}button{min-height:44px;padding:9px 14px;border:1px solid var(--rule);border-radius:4px;background:var(--surface);color:var(--ink);font:500 14px Geist,PlexThai,"IBM Plex Sans Thai",sans-serif;cursor:pointer}button:hover{border-color:var(--accent)}button:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.figure{min-height:480px;border:1px solid var(--rule);background:var(--surface);overflow:auto}.figure svg{display:block;max-width:100%;height:auto;margin:auto}.source-box{margin-top:18px}details{border-top:1px solid var(--rule);margin-top:22px;padding-top:14px}summary{cursor:pointer;font-weight:600}textarea{display:block;width:100%;min-height:360px;margin-top:12px;padding:14px;border:1px solid var(--rule);border-radius:4px;background:var(--surface);color:var(--ink);font:13px/1.5 GeistMono,monospace;white-space:pre;resize:vertical}.hint{font-size:13px}.error{color:#a5292b;font-size:14px;white-space:pre-wrap}#container{min-height:480px}#container>.static-fallback{display:block;width:100%;height:auto}#container[data-rendered="true"]>.static-fallback{display:none}.static-fallback-mobile{display:none!important}@media(max-width:640px){main{padding:24px 20px 36px}header{display:block}header h1{font-size:26px}.actions{width:100%;flex-wrap:wrap;margin-top:14px}.actions button{flex:1 1 140px;white-space:normal}#container>.static-fallback-desktop{display:none!important}#container>.static-fallback-mobile{display:block!important}}
  </style>
</head>
<body>
  <main>
    <header><div><h1>เส้นทางการช่วยเหลือ</h1><p>ภาพข้อมูลแก้ไขได้ · ใช้ข้อมูลสร้างขึ้น · ไม่ใช่การสนทนาจริง</p></div><div class="actions"><button id="render">แสดงภาพใหม่</button><button id="download">บันทึกเป็นภาพเวกเตอร์</button></div></header>
    <p class="hint" id="consent-fallback-note">ส่งต่อเฉพาะข้อความที่ลูกค้าเลือกและยินยอม</p>
    <section id="figure" class="figure" aria-label="ภาพข้อมูลเส้นทางจากการเลือกสู่การช่วยเหลือ"><div id="container" data-rendered="false">${fallbackSvg}${mobileFallbackSvg}</div></section>
    <p id="status" class="source-box" role="status" aria-live="polite">กำลังโหลดเครื่องมือแสดงภาพ</p>
    <details><summary>แก้ข้อความและลำดับ</summary><p class="hint">แก้ข้อความในช่อง แล้วกด “แสดงภาพใหม่” ภาพหลักสร้างจากข้อมูลในช่องนี้และยังแก้ไขได้ในเครื่องมือของ AntV</p><textarea id="source" spellcheck="false"></textarea><p id="error" class="error" hidden></p></details>
  </main>
  <noscript><p class="source-box">แสดงภาพขั้นตอนแบบสถิตได้โดยไม่ใช้ JavaScript; การแก้ไขและบันทึกภาพเวกเตอร์ต้องเปิด JavaScript</p></noscript>
  <script src="./vendor/antv-infographic-0.2.20.min.js"></script>
  <script>
    const syntax = \`${escaped}\`;
    const source = document.querySelector('#source');
    const status = document.querySelector('#status');
    const error = document.querySelector('#error');
    const api = window.AntVInfographic;
    if (api?.registerFont) {
      for (const fontFamily of ['Alibaba PuHuiTi', 'Source Han Sans', 'Source Han Serif', 'LXGW WenKai', '851tegakizatsu', 'IBM Plex Sans Thai']) {
        api.registerFont({ fontFamily, name: fontFamily, baseUrl: '', fontWeight: {} });
      }
    }
    const infographic = api?.Infographic ? new api.Infographic({ container: '#container', width: '100%', height: '100%', editable: true }) : null;
    const staticFallback = [...document.querySelectorAll('#container > .static-fallback')];
    source.value = syntax;
    if (!infographic) { status.textContent = 'แสดงภาพสำรองแล้ว · เปิด JavaScript เพื่อแก้ไขและบันทึกภาพเวกเตอร์'; document.querySelector('#render').disabled = true; document.querySelector('#download').disabled = true; }
    async function render() {
      error.hidden = true;
      try {
        if (!infographic) return;
        infographic.render(source.value);
        await document.fonts.ready;
        infographic.render(source.value);
        document.querySelector('#container').dataset.rendered = 'true';
        status.textContent = 'แสดงภาพแล้ว · แก้ข้อความในช่องด้านล่างและแสดงภาพใหม่ได้';
      } catch (exception) {
        if (!document.querySelector('#container .static-fallback')) document.querySelector('#container').replaceChildren(...staticFallback);
        document.querySelector('#container').dataset.rendered = 'false';
        error.textContent = 'แสดงภาพไม่สำเร็จ: ' + exception.message;
        error.hidden = false;
        status.textContent = 'ตรวจข้อความและลองอีกครั้ง';
      }
    }
    document.querySelector('#render').addEventListener('click', render);
    document.querySelector('#download').addEventListener('click', async () => {
      if (!infographic) return;
      const url = await infographic.toDataURL({ type: 'svg' });
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'labclear-help-workflow.svg';
      anchor.click();
    });
    render();
  </script>
</body>
</html>`
}

const controller = requireMotionController()
fs.writeFileSync(path.join(outDir, 'labclear-workflow-diagram.html'), workflowHtml(controller), 'utf8')
fs.writeFileSync(path.join(outDir, 'labclear-workflow.infographic'), syntax, 'utf8')
fs.writeFileSync(path.join(outDir, 'labclear-interactive-infographic.html'), infographicHtml(), 'utf8')
console.log('Wrote interactive workflow diagram, AntV syntax source, and editable infographic companion')
