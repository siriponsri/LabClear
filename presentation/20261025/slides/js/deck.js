/* LabClear slide deck — no network calls, no dependencies.
   Each element's resting CSS is its final state. Elements with data-a play an entry
   animation (Web Animations API) data-t ms after the slide or its click starts. */
(function () {
  'use strict';

  var root = document.documentElement;
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total = slides.length;
  var CHAPTERS = ['Business', 'Knowledge', 'Functions', 'Architecture', 'Evaluation'];
  var CH_SUB = ['โจทย์และขอบเขตบริการ', 'ข้อมูลที่ใช้ตอบ และแหล่งอ้างอิง', 'สิ่งที่ผู้ใช้และเจ้าหน้าที่ทำได้', 'องค์ประกอบและขั้นตอนประมวลผล', 'ผลทดสอบที่บันทึกไว้'];
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('screen and (max-width: 760px), screen and (max-aspect-ratio: 4/5)');
  // ?still renders final states without motion (QA screenshots, slow machines).
  var still = /[?&]still(?:&|$)/.test(window.location.search);
  function calm() { return reduce.matches || still || narrow.matches || !Element.prototype.animate; }

  var EXPO = 'cubic-bezier(.16, 1, .3, 1)';
  var IO = 'cubic-bezier(.65, 0, .35, 1)';
  var BACK = 'cubic-bezier(.34, 1.56, .64, 1)';

  root.classList.add('is-deck');
  if (still) root.classList.add('is-still');

  var cur = 0, step = 0, nav = null;
  var counter = document.getElementById('counter');

  function chapterOf(s) { var c = s.getAttribute('data-chapter'); return /^\d+$/.test(c) ? +c : c; }
  function fillOf(ch) { return ch === 'all' ? 0 : typeof ch === 'string' ? 100 : ch / (CHAPTERS.length - 1) * 100; }
  function groupOf(el) { var g = el.closest('[data-step]'); return g ? +g.getAttribute('data-step') : 0; }

  /* ---------- Build: rail, page numbers, steps, animation lists ---------- */
  var HEAD = [['.head .kicker', 'fade', 0], ['.head .title', 'reveal', 80], ['.head .lede', 'rise', 280], ['.foot', 'fade', 500]];
  slides.forEach(function (s, idx) {
    var ch = chapterOf(s);
    var rail = document.createElement('div');
    rail.className = 'rail';
    rail.setAttribute('aria-hidden', 'true');
    var html = '<div class="rail-brand"><img src="img/mark.svg" alt="">LabClear</div><div class="rail-track"><div class="rail-fill"></div>';
    CHAPTERS.forEach(function (name, k) {
      var cls = 'rail-st';
      if (ch === 'end' || ch === 'appx' || (typeof ch === 'number' && k < ch)) cls += ' past';
      else if (k === ch) cls += ' now';
      html += '<div class="' + cls + '" style="left:' + (k / (CHAPTERS.length - 1) * 100) + '%"><i></i><span>' + name + '</span></div>';
    });
    html += '<div class="rail-comet"></div></div><div class="rail-ctx">' + s.getAttribute('data-ctx') + '<small>' + (+s.getAttribute('data-sec') <= 8 ? s.getAttribute('data-sec') + ' / 8' : 'Q&amp;A') + '</small></div>';
    rail.innerHTML = html;
    rail.style.setProperty('--fill', fillOf(ch) + '%');
    s.insertBefore(rail, s.firstChild);

    var pg = s.querySelector('.foot .pg');
    if (pg) pg.textContent = (idx + 1) + ' / ' + total;

    HEAD.forEach(function (h) {
      var el = s.querySelector(h[0]);
      if (el && !el.hasAttribute('data-a')) { el.setAttribute('data-a', h[1]); el.setAttribute('data-t', h[2]); }
    });
    var n = 0;
    s.querySelectorAll('[data-step]').forEach(function (el) { n = Math.max(n, +el.getAttribute('data-step')); });
    s._steps = n;
    s._items = Array.prototype.map.call(s.querySelectorAll('[data-a]'), function (el) {
      return { el: el, a: el.getAttribute('data-a'), t: +(el.getAttribute('data-t') || 0), g: groupOf(el) };
    });
    s._anims = [];
    s._timers = [];
  });

  /* Waffle: reviewed cells first */
  document.querySelectorAll('.waffle').forEach(function (w) {
    var rv = +w.getAttribute('data-reviewed'), pd = +w.getAttribute('data-pending');
    for (var i = 0; i < rv + pd; i++) {
      var cell = document.createElement('i');
      if (i >= rv) cell.className = 'p';
      w.appendChild(cell);
    }
  });

  document.querySelectorAll('.shot img, .doc img').forEach(function (img) {
    function miss() { var s = img.closest('.shot'); if (s) s.classList.add('is-missing'); }
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener('error', miss);
  });

  function measure() {
    document.querySelectorAll('.svg-lines path').forEach(function (p) {
      try { var len = Math.ceil(p.getTotalLength()) + 2; p._len = len; p.style.strokeDasharray = len; } catch (e) { /* not laid out */ }
    });
    // Connector from one element to another, drawn in the svg's own pixel space.
    document.querySelectorAll('.link-svg').forEach(function (svg) {
      var a = document.querySelector(svg.getAttribute('data-from')), b = document.querySelector(svg.getAttribute('data-to'));
      if (!a || !b) return;
      var box = svg.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (!box.width) return;
      svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
      var x1 = ra.right - box.left + 8, y1 = ra.top + ra.height / 2 - box.top;
      var x2 = rb.left - box.left - 8, y2 = rb.top + rb.height / 2 - box.top;
      var mx = (x1 + x2) / 2;
      var path = svg.querySelector('path');
      path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2);
      var c = svg.querySelectorAll('circle');
      c[0].setAttribute('cx', x1); c[0].setAttribute('cy', y1);
      c[1].setAttribute('cx', x2); c[1].setAttribute('cy', y2);
      var r = Math.max(4, box.width / 300);
      c[0].setAttribute('r', r); c[1].setAttribute('r', r);
      path._len = Math.ceil(path.getTotalLength()) + 2;
      path.style.strokeDasharray = path._len;
    });
  }

  /* ---------- Animation presets ---------- */
  function pts(str) { return str.split(';').map(function (p) { return p.split(',').map(parseFloat); }); }
  function preset(el, a) {
    switch (a) {
      case 'fade': return [[{ opacity: 0 }, { opacity: 1 }], 700, 'ease-out'];
      case 'rise': return [[{ opacity: 0, transform: 'translateY(4rem)' }, { opacity: 1, transform: 'none' }], 900, EXPO];
      case 'left': return [[{ opacity: 0, transform: 'translateX(-9rem)' }, { opacity: 1, transform: 'none' }], 1000, EXPO];
      case 'right': return [[{ opacity: 0, transform: 'translateX(9rem)' }, { opacity: 1, transform: 'none' }], 1000, EXPO];
      case 'pop': return [[{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.06)', offset: .65 }, { opacity: 1, transform: 'none' }], 750, 'ease-out'];
      case 'zoom': return [[{ opacity: 0, transform: 'scale(1.14)' }, { opacity: 1, transform: 'none' }], 1300, EXPO];
      case 'lift': return [[{ opacity: 0, transform: 'translateY(6rem) scale(.94)' }, { opacity: 1, transform: 'none' }], 1200, EXPO];
      case 'reveal': return [[{ opacity: 0, transform: 'translateY(3.6rem)', clipPath: 'inset(-30% -5% 100% -5%)' }, { opacity: 1, transform: 'none', clipPath: 'inset(-30% -5% -30% -5%)' }], 1000, EXPO];
      case 'wipe': return [[{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% 0 -10% 0)' }], 1000, IO];
      case 'type': return [[{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], 900, 'steps(7, end)'];
      case 'grow': return [[{ transform: 'scaleX(0)' }, { transform: 'none' }], 1200, IO];
      case 'ring': return [[{ opacity: 0, transform: 'scale(1.35)' }, { opacity: 1, transform: 'none' }], 700, EXPO];
      case 'stamp': return [[{ opacity: 0, transform: 'scale(2.6)' }, { opacity: 1, transform: 'scale(.9)', offset: .7 }, { opacity: 1, transform: 'none' }], 650, 'ease-in'];
      case 'flash': return [[{ transform: 'none', boxShadow: '0 0 0 0 rgba(101,57,169,.5)' }, { transform: 'scale(1.08)', boxShadow: '0 0 0 1.6rem rgba(101,57,169,0)', offset: .45 }, { transform: 'none', boxShadow: '0 0 0 0 rgba(101,57,169,0)' }], 1000, 'ease-out'];
      case 'pulse': return [[{ boxShadow: '0 0 0 0 rgba(101,57,169,.55)' }, { boxShadow: '0 0 0 2.6rem rgba(101,57,169,0)' }], 1300, 'ease-out', 3];
      case 'draw': return [[{ strokeDashoffset: el._len || 3000 }, { strokeDashoffset: 0 }], +(el.getAttribute('data-d') || 1100), IO];
    }
    return null;
  }

  function anim(s, el, kf, dur, delay, easing, iter) {
    var a = el.animate(kf, { duration: dur, delay: delay, easing: easing, fill: 'backwards', iterations: iter || 1 });
    s._anims.push(a);
    return a;
  }
  function later(s, fn, ms) { s._timers.push(setTimeout(fn, ms)); }

  function countUp(s, el, delay) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = +(el.getAttribute('data-decimals') || 0), dur = 1300;
    el.textContent = (0).toFixed(dec);
    later(s, function () {
      var t0 = null;
      requestAnimationFrame(function frame(t) {
        if (!el._counting) return;
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        el.textContent = (target * e).toFixed(dec);
        if (k < 1) requestAnimationFrame(frame);
      });
    }, delay);
    el._counting = true;
    // Never leave a number mid-count if frames are throttled.
    later(s, function () { el._counting = false; el.textContent = target.toFixed(dec); }, delay + dur + 600);
  }

  function run(s, it, base) {
    var el = it.el, d = base + it.t, p;
    switch (it.a) {
      case 'count': countUp(s, el, d); return;
      case 'cells': // waffle: diagonal cascade
        var cols = +(el.getAttribute('data-cols') || 37);
        Array.prototype.forEach.call(el.children, function (c, i) {
          anim(s, c, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }], 520, d + ((i % cols) + Math.floor(i / cols) * 3) * 16, BACK);
        });
        return;
      case 'flips': // scoreboard tiles
        Array.prototype.forEach.call(el.children, function (c, i) {
          anim(s, c, [{ opacity: 0, transform: 'perspective(60rem) rotateY(-90deg)' }, { opacity: 1, transform: 'none' }], 700, d + i * 90, EXPO);
        });
        return;
      case 'lit': // station turns on: class flips at its moment, dot pops
        el.classList.remove('lit');
        later(s, function () { el.classList.add('lit'); }, d);
        var dot = el.querySelector('.dot');
        if (dot) anim(s, dot, [{ transform: 'none' }, { transform: 'scale(1.25)', offset: .4 }, { transform: 'none' }], 600, d, 'ease-out');
        return;
      case 'tour': // spotlight walks through stops, holding at each
        var stops = pts(el.getAttribute('data-tour')), hold = +(el.getAttribute('data-hold') || 1500), mv = 650;
        var totalT = 300 + (stops.length - 1) * (hold + mv), kf = [];
        function at(st, o, op) { return { left: st[0] + '%', top: st[1] + '%', width: st[2] + '%', height: st[3] + '%', opacity: op, offset: Math.min(1, o), easing: IO }; }
        kf.push(at(stops[0], 0, 0));
        kf.push(at(stops[0], 300 / totalT, 1));
        for (var i = 1; i < stops.length; i++) {
          var holdEnd = 300 + (i - 1) * (hold + mv) + hold;
          kf.push(at(stops[i - 1], holdEnd / totalT, 1));
          kf.push(at(stops[i], (holdEnd + mv) / totalT, 1));
        }
        anim(s, el, kf, totalT, d, 'linear');
        return;
      case 'packet': // a dot travels through waypoints (percent of its container)
        var wp = pts(el.getAttribute('data-path')), even = el.hasAttribute('data-even'), dist = [0], sum = 0;
        for (var j = 1; j < wp.length; j++) {
          sum += even ? 1 : Math.hypot(wp[j][0] - wp[j - 1][0], (wp[j][1] || 0) - (wp[j - 1][1] || 0));
          dist.push(sum);
        }
        var frames = wp.map(function (q, k) {
          var f = { left: q[0] + '%', offset: dist[k] / (sum || 1), opacity: 1 };
          if (!isNaN(q[1])) f.top = q[1] + '%';
          return f;
        });
        frames[0].opacity = 0;
        frames.splice(1, 0, Object.assign({}, frames[0], { opacity: 1, offset: Math.min(.04, frames[1].offset) }));
        frames[frames.length - 1].opacity = 0;
        anim(s, el, frames, +(el.getAttribute('data-d') || 2400), d, 'ease-in-out');
        return;
    }
    p = preset(el, it.a);
    if (p) anim(s, el, p[0], +(el.getAttribute('data-d') || p[1]), d, p[2], p[3]);
  }

  function play(s, g, base) {
    if (calm()) return;
    s._items.forEach(function (it) { if (it.g === g) run(s, it, base); });
  }
  function stopAll(s) {
    s._anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* ignore */ } });
    s._timers.forEach(clearTimeout);
    s._anims = []; s._timers = [];
    s.querySelectorAll('[data-count]').forEach(function (el) {
      el._counting = false;
      el.textContent = parseFloat(el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-decimals') || 0));
    });
    s.querySelectorAll('[data-a="lit"]').forEach(function (el) { el.classList.add('lit'); });
  }
  function setSteps(s, k) {
    s.querySelectorAll('[data-step]').forEach(function (el) { el.classList.toggle('is-off', +el.getAttribute('data-step') > k); });
  }

  /* ---------- Chapter interstitial ---------- */
  var inter = document.createElement('div');
  inter.className = 'inter';
  inter.setAttribute('aria-hidden', 'true');
  inter.innerHTML = '<div class="inter-in"><div class="inter-no"></div><div class="inter-name"></div><div class="inter-sub"></div><div class="inter-rail"></div></div>';
  document.body.appendChild(inter);
  function fillInter(ch) {
    var end = typeof ch === 'string', appx = ch === 'appx';
    inter.querySelector('.inter-no').textContent = appx ? 'Q&A' : end ? 'RECAP' : '0' + (ch + 1) + ' / 05';
    inter.querySelector('.inter-name').textContent = appx ? 'Appendix' : end ? 'Conclusion' : CHAPTERS[ch];
    inter.querySelector('.inter-sub').textContent = appx ? 'RAG และตำแหน่งโค้ดที่เปิดดูได้' : end ? 'สรุปผลและงานถัดไป' : CH_SUB[ch];
    inter.querySelector('.inter-rail').innerHTML = CHAPTERS.map(function (name, k) {
      var cls = end || k < ch ? 'past' : k === ch ? 'now' : '';
      var x = k / (CHAPTERS.length - 1) * 100;
      return '<i class="' + cls + '" style="left:' + x + '%"></i><span class="' + (k === ch ? 'now' : '') + '" style="left:' + x + '%">' + name + '</span>';
    }).join('');
  }

  function railMove(s, from, to, delay) {
    var fill = s.querySelector('.rail-fill'), comet = s.querySelector('.rail-comet');
    var a1 = fill.animate([{ width: from + '%' }, { width: to + '%' }], { duration: 1000, delay: delay, easing: IO, fill: 'backwards' });
    var a2 = comet.animate([{ left: from + '%', opacity: 0 }, { left: from + '%', opacity: 1, offset: .1 }, { left: to + '%', opacity: 1, offset: .85 }, { left: to + '%', opacity: 0 }], { duration: 1200, delay: delay, easing: IO });
    var now = s.querySelector('.rail-st.now i');
    s._anims.push(a1, a2);
    if (now) s._anims.push(now.animate([{ transform: 'scale(.3)' }, { transform: 'scale(1.5)', offset: .5 }, { transform: 'none' }], { duration: 600, delay: delay + 950, easing: 'ease-out', fill: 'backwards' }));
  }

  /* ---------- Navigation ---------- */
  function endNav() {
    if (!nav) return;
    var n = nav; nav = null;
    n.timers.forEach(clearTimeout);
    n.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* ignore */ } });
    n.done();
  }
  function swapTo(prev, next) {
    slides.forEach(function (s) { if (s !== next) s.classList.remove('is-current', 'is-leaving'); });
    next.classList.add('is-current');
    if (prev && prev !== next) stopAll(prev);
  }

  function show(n, k, dir) {
    n = Math.max(0, Math.min(total - 1, n));
    k = Math.max(0, Math.min(k, slides[n]._steps));
    endNav();
    var prev = slides[cur], next = slides[n];
    if (n === cur && next.classList.contains('is-current')) {
      if (k > step) {
        setSteps(next, k);
        if (k === step + 1) play(next, k, 0);
      } else if (k < step) {
        setSteps(next, k);
      }
      step = k;
    } else {
      var chPrev = chapterOf(prev), chNext = chapterOf(next);
      setSteps(next, k);
      stopAll(next);
      var forward = dir > 0 && n === cur + 1;
      if (!calm() && forward && chPrev !== chNext) {
        // Chapter change: a full-screen wipe names the chapter, then the new slide plays.
        fillInter(chNext);
        inter.classList.add('is-on');
        var swapped = false;
        var doSwap = function () { if (!swapped) { swapped = true; swapTo(prev, next); } };
        var inA = inter.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 480, easing: IO, fill: 'forwards' });
        var parts = [
          inter.querySelector('.inter-no').animate([{ opacity: 0, transform: 'translateY(2rem)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 160, easing: EXPO, fill: 'backwards' }),
          inter.querySelector('.inter-name').animate([{ opacity: 0, transform: 'translateX(12rem)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 200, easing: EXPO, fill: 'backwards' }),
          inter.querySelector('.inter-sub').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 380, fill: 'backwards' })
        ];
        nav = { anims: [inA].concat(parts), timers: [], done: function () { doSwap(); inter.classList.remove('is-on'); } };
        nav.timers.push(setTimeout(doSwap, 480));
        nav.timers.push(setTimeout(function () {
          var outA = inter.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }], { duration: 560, easing: IO, fill: 'forwards' });
          if (nav) nav.anims.push(outA);
          outA.onfinish = function () { if (nav) { nav = null; inter.classList.remove('is-on'); try { inA.cancel(); outA.cancel(); } catch (e) { /* ignore */ } } };
        }, 1180));
        // The slide's own timeline starts as the wipe uncovers it.
        railMove(next, fillOf(chPrev), fillOf(chNext), 1100);
        play(next, 0, 1350);
      } else if (!calm() && Math.abs(n - cur) === 1) {
        swapTo(prev, next);
        var pageA = next.querySelector('.page').animate([{ opacity: 0, transform: 'translateX(' + (dir > 0 ? 4 : -4) + '%)' }, { opacity: 1, transform: 'none' }], { duration: 750, easing: EXPO });
        nav = { anims: [pageA], timers: [], done: function () {} };
        pageA.onfinish = function () { nav = null; };
        if (dir > 0) play(next, 0, 150);
      } else {
        swapTo(prev, next);
        if (dir > 0 && k === 0) play(next, 0, 100);
      }
      cur = n;
      step = k;
    }
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
      case 'End': show(total - 1, 0, -1); break;
      case 'f': case 'F': fullscreen(); break;
      case 'l': case 'L': toggleLaser(); break;
      case 'q': case 'Q': window.location.href = 'backup.html'; break;
      case 'h': case 'H': case '?': toggleHelp(); break;
      default:
        if (/^[1-9]$/.test(k)) { var i = firstOfSection(+k); show(i, 0, i < cur ? -1 : 2); }
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
  window.addEventListener('beforeprint', function () { endNav(); slides.forEach(stopAll); });
  var rsT;
  window.addEventListener('resize', function () { clearTimeout(rsT); rsT = setTimeout(measure, 150); });

  /* ---------- Start ---------- */
  function fromHash() {
    var m = /^#\/?(\d+)(?:\.(\d+))?/.exec(window.location.hash);
    var i = m ? Math.max(0, Math.min(total - 1, +m[1] - 1)) : 0;
    return { i: i, k: m && m[2] ? Math.min(+m[2], slides[i]._steps) : 0 };
  }
  function start() {
    measure();
    if (narrow.matches) return;
    var h = fromHash();
    cur = h.i;
    setSteps(slides[cur], h.k);
    slides[cur].classList.add('is-current');
    step = h.k;
    if (h.k === 0) play(slides[cur], 0, 200);
    counter.textContent = (cur + 1) + ' / ' + total;
    wake();
    window.addEventListener('hashchange', function () { var t = fromHash(); if (t.i !== cur || t.k !== step) show(t.i, t.k, t.i < cur ? -1 : 2); });
  }
  var started = false;
  function startOnce() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startOnce);
  setTimeout(startOnce, 1200);
})();
