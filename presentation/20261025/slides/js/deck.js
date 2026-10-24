/* LabClear slide deck — no network calls, no dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total = slides.length;
  var CHAPTERS = ['Business', 'Knowledge', 'Functions', 'Architecture', 'Evaluation'];
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('screen and (max-width: 760px), screen and (max-aspect-ratio: 4/5)');
  // ?still renders final states without motion (QA screenshots, slow machines).
  var still = /[?&]still(?:&|$)/.test(window.location.search);
  function calm() { return reduce.matches || still || narrow.matches; }

  root.classList.add('is-deck');
  if (still) root.classList.add('is-still');

  var cur = 0, step = 0, busy = null;
  var counter = document.getElementById('counter');

  function chapterOf(s) { var c = s.getAttribute('data-chapter'); return /^\d+$/.test(c) ? +c : c; }
  function fillOf(ch) { return ch === 'all' ? 0 : ch === 'end' ? 100 : ch / (CHAPTERS.length - 1) * 100; }

  /* ---------- Chapter rail ---------- */
  slides.forEach(function (s) {
    var ch = chapterOf(s);
    var rail = document.createElement('div');
    rail.className = 'rail';
    rail.setAttribute('aria-hidden', 'true');
    var html = '<div class="rail-brand"><img src="img/mark.svg" alt="">LabClear</div><div class="rail-track"><div class="rail-fill"></div><div class="rail-comet"></div>';
    CHAPTERS.forEach(function (name, k) {
      var cls = 'rail-st';
      if (ch === 'end' || (typeof ch === 'number' && k < ch)) cls += ' past';
      else if (k === ch) cls += ' now';
      html += '<div class="' + cls + '" style="left:' + (k / (CHAPTERS.length - 1) * 100) + '%"><i></i><span>' + name + '</span></div>';
    });
    html += '</div><div class="rail-ctx">' + s.getAttribute('data-ctx') + '<small>' + s.getAttribute('data-sec') + ' / 8</small></div>';
    rail.innerHTML = html;
    rail.style.setProperty('--fill', fillOf(ch) + '%');
    s.insertBefore(rail, s.firstChild);

    var n = 0;
    s.querySelectorAll('[data-step],[data-step-draw]').forEach(function (el) {
      n = Math.max(n, +(el.getAttribute('data-step') || el.getAttribute('data-step-draw')));
    });
    s._steps = n;
  });

  /* Waffle: reviewed first, cascading diagonally */
  var waffle = document.getElementById('waffle');
  if (waffle) {
    var rv = +waffle.getAttribute('data-reviewed'), pd = +waffle.getAttribute('data-pending'), cols = 37;
    for (var w = 0; w < rv + pd; w++) {
      var cell = document.createElement('i');
      if (w >= rv) cell.className = 'p';
      cell.style.setProperty('--d', (w % cols) + Math.floor(w / cols) * 4);
      waffle.appendChild(cell);
    }
  }

  document.querySelectorAll('.shot img').forEach(function (img) {
    function miss() { img.closest('.shot').classList.add('is-missing'); }
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener('error', miss);
  });

  function measure() {
    document.querySelectorAll('.draw').forEach(function (p) {
      try { p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 2); } catch (e) { /* not laid out */ }
    });
  }

  /* ---------- Count-up ---------- */
  function countUp(el) {
    if (el._counted) return;
    el._counted = true;
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = +(el.getAttribute('data-decimals') || 0);
    if (calm()) { el.textContent = target.toFixed(dec); return; }
    var t0 = null, dur = 1200;
    el.textContent = (0).toFixed(dec);
    setTimeout(function () {
      requestAnimationFrame(function frame(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        el.textContent = (target * e).toFixed(dec);
        if (k < 1) requestAnimationFrame(frame); else el.textContent = target.toFixed(dec);
      });
    }, 350);
    // Never leave a number mid-count if frames are throttled.
    setTimeout(function () { el.textContent = target.toFixed(dec); }, 2200);
  }
  function resetCounts(s) {
    s.querySelectorAll('[data-count]').forEach(function (el) {
      el._counted = false;
      el.textContent = parseFloat(el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-decimals') || 0));
    });
  }

  /* ---------- Steps ---------- */
  function applyStep(s, k) {
    s.querySelectorAll('[data-step]').forEach(function (el) {
      var on = k >= +el.getAttribute('data-step');
      el.classList.toggle('is-on', on);
      if (on) {
        if (el.hasAttribute('data-count')) countUp(el);
        el.querySelectorAll('[data-count]').forEach(countUp);
      }
    });
    s.querySelectorAll('[data-step-draw]').forEach(function (el) {
      el.classList.toggle('is-drawn', s.classList.contains('is-entered') && k >= +el.getAttribute('data-step-draw'));
    });
  }
  function enter(s) {
    s.classList.remove('is-entered');
    s.querySelectorAll('.draw').forEach(function (p) { p.classList.remove('is-drawn'); });
    void s.offsetWidth;
    s.classList.add('is-entered');
    s.querySelectorAll('.draw:not([data-step-draw])').forEach(function (p) { p.classList.add('is-drawn'); });
    s.querySelectorAll('[data-count]').forEach(function (el) { if (!el.closest('[data-step]')) countUp(el); });
  }

  /* ---------- Navigation ---------- */
  var TX = ['tx-in-next', 'tx-out-next', 'tx-in-prev', 'tx-out-prev', 'tx-in-chapter', 'tx-out-chapter'];
  function finish() { if (busy) { clearTimeout(busy.t); busy.done(); busy = null; } }

  function show(n, k, dir) {
    n = Math.max(0, Math.min(total - 1, n));
    finish();
    var prev = slides[cur], next = slides[n];
    if (n !== cur) {
      resetCounts(next);
      slides.forEach(function (s) { if (s !== prev && s !== next) s.classList.remove('is-current', 'is-leaving', 'is-entered'); });
      next.classList.add('is-current');
      prev.classList.remove('is-current');
      var chapterChange = chapterOf(prev) !== chapterOf(next);
      var rail = next.querySelector('.rail');
      if (!calm()) {
        var kind = chapterChange ? 'chapter' : dir < 0 ? 'prev' : 'next';
        prev.classList.add('is-leaving', 'tx-out-' + kind);
        next.classList.add('tx-in-' + kind);
        if (chapterChange) {
          // The thread advances: fill and a glowing point travel from the old chapter to the new one.
          rail.classList.remove('is-moving');
          rail.style.setProperty('--fill', fillOf(chapterOf(prev)) + '%');
          void rail.offsetWidth;
          rail.classList.add('is-moving');
          rail.style.setProperty('--fill', fillOf(chapterOf(next)) + '%');
        }
        var done = function () {
          prev.classList.remove('is-leaving', 'is-entered');
          TX.forEach(function (c) { prev.classList.remove(c); next.classList.remove(c); });
          rail.classList.remove('is-moving');
        };
        busy = { done: done, t: setTimeout(function () { busy = null; done(); }, 1100) };
      } else {
        prev.classList.remove('is-entered');
      }
      cur = n;
      enter(next);
    }
    step = k;
    applyStep(next, k);
    counter.textContent = (cur + 1) + ' / ' + total;
    try { history.replaceState(null, '', '#/' + (cur + 1) + (step ? '.' + step : '')); } catch (e) { /* ignore */ }
  }

  function next() {
    if (step < slides[cur]._steps) show(cur, step + 1, 1);
    else if (cur < total - 1) show(cur + 1, 0, 1);
    else toast('จบสไลด์หลักแล้ว · กด Q เพื่อเปิดสไลด์สำรอง');
  }
  function prev() {
    if (step > 0) show(cur, step - 1, -1);
    else if (cur > 0) show(cur - 1, slides[cur - 1]._steps, -1);
  }
  function firstOfSection(sec) {
    for (var i = 0; i < total; i++) if (+slides[i].getAttribute('data-sec') === sec) return i;
    return cur;
  }

  /* ---------- UI helpers ---------- */
  var toastEl = document.getElementById('toast'), toastT;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2400); }
  function fullscreen() {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) { toast('เบราว์เซอร์นี้ไม่รองรับเต็มจอ · ใช้ F11 แทนได้'); return; }
    var r = req.call(root);
    if (r && r.catch) r.catch(function () { toast('เบราว์เซอร์ไม่อนุญาตเต็มจอ · ใช้ F11 แทนได้'); });
  }
  var helpEl = document.getElementById('help');
  function toggleHelp(on) { helpEl.classList.toggle('is-on', typeof on === 'boolean' ? on : !helpEl.classList.contains('is-on')); }
  var laserEl = document.getElementById('laser');
  function toggleLaser() { toast(root.classList.toggle('is-laser') ? 'เลเซอร์: เปิด (L เพื่อปิด)' : 'เลเซอร์: ปิด'); }
  var idleT;
  function wake() { root.classList.remove('is-idle'); clearTimeout(idleT); idleT = setTimeout(function () { root.classList.add('is-idle'); }, 2200); }

  /* ---------- Events ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || narrow.matches) return;
    var k = e.key;
    if (helpEl.classList.contains('is-on') && /^(Escape|h|H|\?)$/.test(k)) { toggleHelp(false); e.preventDefault(); return; }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': prev(); break;
      case 'Home': show(0, 0, -1); break;
      case 'End': show(total - 1, 0, 1); break;
      case 'f': case 'F': fullscreen(); break;
      case 'l': case 'L': toggleLaser(); break;
      case 'q': case 'Q': window.location.href = 'backup.html'; break;
      case 'h': case 'H': case '?': toggleHelp(); break;
      default:
        if (/^[1-8]$/.test(k)) { var i = firstOfSection(+k); show(i, 0, i < cur ? -1 : 1); }
        else return;
    }
    e.preventDefault();
  });
  document.querySelector('.controls').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    ({ next: next, prev: prev, full: fullscreen, laser: toggleLaser, help: toggleHelp })[b.getAttribute('data-act')]();
    b.blur();
  });
  helpEl.addEventListener('click', function () { toggleHelp(false); });
  document.addEventListener('mousemove', function (e) {
    wake();
    if (root.classList.contains('is-laser')) { laserEl.style.left = e.clientX + 'px'; laserEl.style.top = e.clientY + 'px'; }
  });
  var tx0 = null;
  document.addEventListener('touchstart', function (e) { tx0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx0 === null || narrow.matches) return;
    var dx = e.changedTouches[0].clientX - tx0;
    if (Math.abs(dx) > 60) (dx < 0 ? next : prev)();
    tx0 = null;
  }, { passive: true });
  window.addEventListener('beforeprint', function () {
    finish();
    slides.forEach(function (s) {
      s.classList.add('is-entered');
      applyStep(s, s._steps);
      s.querySelectorAll('.draw').forEach(function (p) { p.classList.add('is-drawn'); });
      s.querySelectorAll('[data-count]').forEach(function (el) { el._counted = true; el.textContent = parseFloat(el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-decimals') || 0)); });
    });
  });
  window.addEventListener('afterprint', function () {
    slides.forEach(function (s, i) { if (i !== cur) s.classList.remove('is-entered'); });
    applyStep(slides[cur], step);
  });

  /* ---------- Start ---------- */
  function fromHash() {
    var m = /^#\/?(\d+)(?:\.(\d+))?/.exec(window.location.hash);
    var i = m ? Math.max(0, Math.min(total - 1, +m[1] - 1)) : 0;
    return { i: i, k: m && m[2] ? Math.min(+m[2], slides[i]._steps) : 0 };
  }
  function start() {
    measure();
    if (narrow.matches) {
      slides.forEach(function (s) { s.classList.add('is-entered'); applyStep(s, s._steps); });
      return;
    }
    var h = fromHash();
    cur = h.i;
    slides[cur].classList.add('is-current');
    enter(slides[cur]);
    show(cur, h.k, 1);
    wake();
    window.addEventListener('hashchange', function () { var t = fromHash(); if (t.i !== cur || t.k !== step) show(t.i, t.k, t.i < cur ? -1 : 1); });
  }
  var started = false;
  function startOnce() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startOnce);
  setTimeout(startOnce, 1200);
})();
