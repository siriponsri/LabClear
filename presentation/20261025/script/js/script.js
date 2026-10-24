/* Renders SPEAKER_SCRIPT_TH.md (the only file to edit) and adds a pacing clock. */
(function () {
  'use strict';

  var doc = document.getElementById('doc');
  var jump = document.getElementById('jump');
  var sections = [];

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function toSec(t) { var m = /(\d+):(\d{2})/.exec(t); return m ? +m[1] * 60 + +m[2] : null; }

  function render(md) {
    md = md.replace(/<!--[\s\S]*?-->/g, '');
    var lines = md.split(/\r?\n/);
    var out = [], list = false, sec = null;
    function closeList() { if (list) { out.push('</ul>'); list = false; } }
    function closeSec() { closeList(); if (sec) out.push('</section>'); }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { closeList(); return; }
      var m;
      if ((m = /^#\s+(.+)/.exec(line)) && !line.startsWith('##')) { out.push('<h1>' + inline(m[1]) + '</h1>'); return; }
      if ((m = /^##\s+(.+)/.exec(line)) && !line.startsWith('###')) {
        closeSec();
        var title = m[1], num = /^(\d+)\s*·\s*(.+)/.exec(title);
        var id = 'x' + sections.length;
        sec = { id: id, label: num ? num[1] : title.split('·')[0].trim(), title: title, start: null, end: null };
        sections.push(sec);
        out.push('<section id="' + id + '"><h2>' + (num ? '<span class="no">' + num[1] + '</span>' + inline(num[2]) : inline(title)) + '</h2>');
        return;
      }
      if ((m = /^###\s+(.+)/.exec(line))) { closeList(); out.push('<h3>' + inline(m[1]) + '</h3>'); return; }
      if ((m = /^::meta\s+(.+)/.exec(line))) {
        closeList();
        var parts = m[1].split('|').map(function (p) { return p.trim(); });
        parts.forEach(function (p) {
          var w = /(\d+:\d{2})\s*→\s*(\d+:\d{2})/.exec(p);
          if (w && sec) { sec.start = toSec(w[1]); sec.end = toSec(w[2]); }
        });
        out.push('<div class="meta">' + parts.map(function (p) { return '<span>' + inline(p) + '</span>'; }).join('') + '</div>');
        return;
      }
      if ((m = /^::cue\s+(.+)/.exec(line))) { closeList(); out.push('<p class="cue">' + inline(m[1]) + '</p>'); return; }
      if ((m = /^([AB]):\s*(.+)/.exec(line))) { closeList(); out.push('<p class="say ' + m[1] + '" data-who="' + m[1] + '">' + inline(m[2]) + '</p>'); return; }
      if ((m = /^\[คลิก\s*(\d+)\]\s*(.*)/.exec(line))) { closeList(); out.push('<p class="click"><b>คลิก ' + m[1] + '</b><span>' + inline(m[2]) + '</span></p>'); return; }
      if ((m = /^>\s*(.+)/.exec(line))) {
        closeList();
        var body = m[1], kind = 'backup', k = '';
        var km = /^(TRANSITION[^:]*|สำรอง|ตัดได้|ระวัง)\s*:\s*(.+)/.exec(body);
        if (km) {
          k = km[1]; body = km[2];
          kind = /^TRANSITION/.test(k) ? 'trans' : k === 'ตัดได้' ? 'cut' : k === 'ระวัง' ? 'warn' : 'backup';
        }
        out.push('<div class="call ' + kind + '">' + (k ? '<span class="k">' + esc(k) + '</span>' : '') + inline(body) + '</div>');
        return;
      }
      if ((m = /^-\s+(.+)/.exec(line))) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (/^---+$/.test(line)) { closeList(); out.push('<hr>'); return; }
      closeList();
      out.push('<p>' + inline(line) + '</p>');
    });
    closeSec();
    doc.innerHTML = out.join('\n');
    jump.innerHTML = sections.map(function (s) { return '<a href="#' + s.id + '" data-id="' + s.id + '">' + esc(s.label) + '</a>'; }).join('');
  }

  /* ---------- Focus and font size (remembered per device) ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var who = store('lc-who') || 'all';
  function setWho(w) {
    who = w; store('lc-who', w);
    document.body.classList.remove('focus-A', 'focus-B');
    if (w !== 'all') document.body.classList.add('focus-' + w);
    document.querySelectorAll('[data-who]').forEach(function (b) { if (b.tagName === 'BUTTON') b.classList.toggle('on', b.getAttribute('data-who') === w); });
  }
  document.querySelector('.who').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setWho(b.getAttribute('data-who')); });
  var fs = parseFloat(store('lc-fs')) || 0;
  function setFs(px) { fs = Math.max(15, Math.min(34, px)); document.documentElement.style.setProperty('--fs', fs + 'px'); store('lc-fs', fs); }
  if (fs) setFs(fs);
  document.getElementById('bigger').onclick = function () { setFs((fs || 21) + 2); };
  document.getElementById('smaller').onclick = function () { setFs((fs || 21) - 2); };

  /* ---------- Pacing clock ---------- */
  var tEl = document.getElementById('t'), planEl = document.getElementById('plan'), goBtn = document.getElementById('go');
  var startAt = null, acc = 0, timer = null;
  function elapsed() { return acc + (startAt ? (Date.now() - startAt) / 1000 : 0); }
  function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function tick() {
    var e = elapsed();
    tEl.textContent = fmt(e);
    var cur = null;
    sections.forEach(function (s) { if (s.start !== null && e >= s.start && e < s.end) cur = s; });
    if (!cur && e >= 540) { planEl.textContent = e < 600 ? 'เวลาสำรอง · เหลือ ' + fmt(600 - e) : 'เกิน 10:00 แล้ว'; planEl.classList.toggle('late', e >= 600); }
    else if (cur) { planEl.textContent = 'ตามแผนควรอยู่: ' + cur.title.replace(/^\d+\s*·\s*/, '') + ' (ถึง ' + fmt(cur.end) + ')'; planEl.classList.remove('late'); }
    document.querySelectorAll('section').forEach(function (el) { el.classList.toggle('now', !!cur && el.id === cur.id); });
    jump.querySelectorAll('a').forEach(function (a) { a.classList.toggle('now', !!cur && a.getAttribute('data-id') === cur.id); });
  }
  goBtn.onclick = function () {
    if (startAt) { acc = elapsed(); startAt = null; clearInterval(timer); goBtn.textContent = 'ต่อ'; goBtn.classList.remove('run'); }
    else { startAt = Date.now(); timer = setInterval(tick, 500); goBtn.textContent = 'หยุด'; goBtn.classList.add('run'); }
    tick();
  };
  document.getElementById('reset').onclick = function () { acc = 0; startAt = null; clearInterval(timer); goBtn.textContent = 'เริ่ม'; goBtn.classList.remove('run'); planEl.textContent = 'พร้อมเริ่ม'; tick(); };

  /* ---------- Load ---------- */
  fetch('SPEAKER_SCRIPT_TH.md', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (md) { render(md); setWho(who); tick(); planEl.textContent = 'พร้อมเริ่ม'; })
    .catch(function () {
      doc.innerHTML = '<p class="loading">โหลดบทพูดไม่ได้ · ถ้าเปิดไฟล์จากเครื่องโดยตรง ให้เปิดผ่านลิงก์ Vercel หรือ local server แทน · หรืออ่าน <a href="SPEAKER_SCRIPT_TH.md">SPEAKER_SCRIPT_TH.md</a></p>';
    });
})();
