/* LabClear canvas deck — camera over one world, one thread through every frame.
   No network calls, no dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var viewport = document.getElementById('viewport');
  var world = document.getElementById('world');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('screen and (max-width: 760px), screen and (max-aspect-ratio: 4/5)');
  var SVGNS = 'http://www.w3.org/2000/svg';

  root.classList.add('is-deck');
  // ?still renders final states without motion (QA screenshots, slow machines).
  var still = /[?&]still(?:&|$)/.test(window.location.search);
  if (still) root.classList.add('is-still');
  function calm() { return reduce.matches || still; }

  /* ---------- World geometry ---------- */
  var W = 1920, H = 1080, G = 200;            // frame size and gap between frames
  var IW = 2 * W + G, IH = 2 * H + G;          // region interior (2 × 2 frames)
  var PS = 300, PT = 1500, PB = 300;           // region padding (side, top for label, bottom)
  var RW = IW + 2 * PS, RH = IH + PT + PB;     // region box
  var RG = 700, TB = 3300;                     // gap between regions, title band height
  var Ay = 1012;                               // thread height inside each frame
  var REGION_POS = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]]; // snake: B K F / A E N
  var CHAPTERS = ['Business', 'Knowledge', 'Functions', 'Architecture', 'Evaluation'];
  var WORLD_W = 3 * RW + 2 * RG, WORLD_H = TB + 2 * RH + RG;

  function regionOrigin(r) {
    var p = REGION_POS[r];
    return { x: p[0] * (RW + RG), y: TB + p[1] * (RH + RG) };
  }
  function cellOffset(c) {
    switch (c) {
      case '0': return { x: 0, y: 0 };
      case '1': return { x: W + G, y: 0 };
      case '2': return { x: 0, y: H + G };
      case '3': return { x: W + G, y: H + G };
      case 'bc': return { x: (IW - W) / 2, y: H + G };
      case 'm0': return { x: 0, y: (IH - H) / 2 };
      case 'm1': return { x: W + G, y: (IH - H) / 2 };
      default: return { x: (IW - W) / 2, y: (IH - H) / 2 };
    }
  }

  var frames = Array.prototype.slice.call(document.querySelectorAll('.frame[data-region]'));
  frames.forEach(function (f) {
    var o = regionOrigin(+f.getAttribute('data-region'));
    var c = cellOffset(f.getAttribute('data-cell'));
    f._x = o.x + PS + c.x;
    f._y = o.y + PT + c.y;
    if (!narrow.matches) { f.style.left = f._x + 'px'; f.style.top = f._y + 'px'; }
    var steps = 0;
    f.querySelectorAll('[data-step],[data-step-draw]').forEach(function (el) {
      steps = Math.max(steps, +(el.getAttribute('data-step') || el.getAttribute('data-step-draw')));
    });
    f._steps = steps;
  });

  if (!narrow.matches) {
    world.style.width = WORLD_W + 'px';
    world.style.height = WORLD_H + 'px';
    document.querySelectorAll('.region-label').forEach(function (el) {
      var o = regionOrigin(+el.getAttribute('data-region'));
      el.style.left = (o.x + PS) + 'px';
      el.style.top = (o.y + 120) + 'px';
    });
    place('wa-intro', PS, 150);
    place('wa-team', PS, 2250);
    place('wa-home', WORLD_W - PS - 2300, 420);
    place('wa-recap', PS, 380);
  }
  function place(id, x, y) { var el = document.getElementById(id); if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; } }

  /* ---------- Stops (navigation sequence) ---------- */
  var stops = [{ id: 'ov', map: true, sec: 1, steps: 1 }];
  frames.forEach(function (f) { stops.push({ id: f.id, el: f, sec: +f.getAttribute('data-sec'), steps: f._steps, region: +f.getAttribute('data-region') }); });
  var nIndex = stops.findIndex(function (s) { return s.id === 'n1'; });
  stops.splice(nIndex, 0, { id: 'recap', map: true, sec: 8, steps: 0 });

  /* ---------- Thread ---------- */
  var svg, basePath, donePath, nextPath, linkPath, comet;
  var pts = frames.map(function (f) { return { a: { x: f._x, y: f._y + Ay }, b: { x: f._x + W, y: f._y + Ay } }; });
  var startPt = { x: PS, y: TB - 260 };

  function link(p, q) {
    var k = Math.max(260, Math.abs(q.x - p.x) * 0.45, Math.abs(q.y - p.y) * 0.35);
    return 'C ' + (p.x + k) + ' ' + p.y + ' ' + (q.x - k) + ' ' + q.y + ' ' + q.x + ' ' + q.y;
  }
  function threadUpTo(n) { // path through the first n frames (0 = start point only)
    var d = 'M ' + startPt.x + ' ' + startPt.y;
    var prev = startPt;
    for (var i = 0; i < n && i < pts.length; i++) {
      d += ' ' + link(prev, pts[i].a) + ' L ' + pts[i].b.x + ' ' + pts[i].b.y;
      prev = pts[i].b;
    }
    return d;
  }
  if (!narrow.matches) {
    svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'thread-world');
    svg.setAttribute('width', WORLD_W);
    svg.setAttribute('height', WORLD_H);
    svg.setAttribute('viewBox', '0 0 ' + WORLD_W + ' ' + WORLD_H);
    svg.setAttribute('aria-hidden', 'true');
    basePath = mk('path', 'base'); basePath.setAttribute('d', threadUpTo(pts.length - 1));
    nextPath = mk('path', 'next');
    var lastPrev = pts[pts.length - 2].b, last = pts[pts.length - 1];
    nextPath.setAttribute('d', 'M ' + lastPrev.x + ' ' + lastPrev.y + ' ' + link(lastPrev, last.a) + ' L ' + last.b.x + ' ' + last.b.y);
    donePath = mk('path', 'done');
    linkPath = mk('path', 'link'); linkPath.setAttribute('stroke', 'none');
    comet = document.createElementNS(SVGNS, 'g'); comet.setAttribute('class', 'comet'); comet.style.display = 'none';
    var halo = mk('circle', 'halo'), core = mk('circle', 'core');
    comet.appendChild(halo); comet.appendChild(core); comet._halo = halo; comet._core = core;
    svg.appendChild(comet);
    world.insertBefore(svg, world.firstChild);
  }
  function mk(tag, cls) { var e = document.createElementNS(SVGNS, tag); e.setAttribute('class', cls); svg.appendChild(e); return e; }

  /* ---------- Waffle ---------- */
  var waffle = document.getElementById('waffle');
  if (waffle) {
    var rv = +waffle.getAttribute('data-reviewed'), pd = +waffle.getAttribute('data-pending'), cols = 30;
    for (var w = 0; w < rv + pd; w++) {
      var cell = document.createElement('i');
      if (w >= rv) cell.className = 'p';
      cell.style.setProperty('--d', (w % cols) + Math.floor(w / cols) * 5);
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
    if (calm() || narrow.matches) { el.textContent = target.toFixed(dec); return; }
    var t0 = null, dur = 1300;
    el.textContent = (0).toFixed(dec);
    setTimeout(function () {
      requestAnimationFrame(function frame(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        el.textContent = (target * e).toFixed(dec);
        if (k < 1) requestAnimationFrame(frame);
      });
    }, 350);
  }

  /* ---------- Frame state ---------- */
  function applyStep(f, k) {
    var visited = f.classList.contains('is-visited');
    f.querySelectorAll('[data-step]').forEach(function (el) {
      var on = k >= +el.getAttribute('data-step');
      el.classList.toggle('is-on', on);
      if (on) {
        if (el.hasAttribute('data-count')) countUp(el);
        el.querySelectorAll('[data-count]').forEach(countUp);
      }
    });
    f.querySelectorAll('[data-until]').forEach(function (el) { el.classList.toggle('is-gone', k >= +el.getAttribute('data-until')); });
    f.querySelectorAll('[data-step-draw]').forEach(function (el) { el.classList.toggle('is-drawn', visited && k >= +el.getAttribute('data-step-draw')); });
  }
  function arrive(f, k) {
    var first = !f.classList.contains('is-visited');
    f.classList.add('is-visited');
    frames.forEach(function (x) { x.classList.toggle('is-here', x === f); });
    applyStep(f, k);
    if (first) f.querySelectorAll('[data-auto] [data-count], [data-auto][data-count]').forEach(countUp);
  }

  /* ---------- Stage & camera ---------- */
  var SX, SY, SW, SH;
  var cam = { x: WORLD_W / 2, y: WORLD_H / 2, s: 0.1 };
  function stage() {
    var vw = window.innerWidth, vh = window.innerHeight;
    SW = Math.min(vw, vh * 16 / 9); SH = SW * 9 / 16;
    SX = (vw - SW) / 2; SY = (vh - SH) / 2;
    var rs = root.style;
    rs.setProperty('--sx', SX + 'px'); rs.setProperty('--sy', SY + 'px');
    rs.setProperty('--sw', SW + 'px'); rs.setProperty('--sh', SH + 'px');
    rs.setProperty('--k', SW / 1920);
  }
  function apply(c) {
    var tx = SX + SW / 2 - c.x * c.s, ty = SY + SH / 2 - c.y * c.s;
    world.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + c.s + ')';
    viewport.style.backgroundPosition = (tx * 0.35) + 'px ' + (ty * 0.35) + 'px';
  }
  function targetFor(stop) {
    var r = stop.map ? { x: -200, y: -150, w: WORLD_W + 400, h: WORLD_H + 300 } : { x: stop.el._x, y: stop.el._y, w: W, h: H };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, s: Math.min(SW / r.w, SH / r.h) };
  }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  var anim = null;
  function fly(to, opts, done) {
    if (anim) { cancelAnimationFrame(anim.raf); anim = null; }
    if (calm()) { cam = to; apply(cam); done && done(); return; }
    var from = { x: cam.x, y: cam.y, s: cam.s };
    var dist = Math.hypot(to.x - from.x, to.y - from.y) / W;
    var big = Math.abs(Math.log(to.s / from.s)) > 1;
    var dur = big ? 1700 : 1150 + 140 * Math.min(dist, 4);
    var minS = Math.min(from.s, to.s);
    var dip = (!big && dist > 0.4) ? 1 / (1 + 0.32 * Math.min(dist, 3)) : 1;
    var l0 = Math.log(from.s), l1 = Math.log(to.s), ld = Math.log(dip);
    var t0 = null;
    world.classList.add('is-moving');
    var linkLen = opts && opts.link ? linkPath.getTotalLength() : 0;
    if (linkLen) comet.style.display = '';
    function frame(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = ease(k);
      cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s: Math.exp(l0 + (l1 - l0) * e + ld * Math.sin(Math.PI * e)) };
      apply(cam);
      if (linkLen) {
        var p = linkPath.getPointAtLength(linkLen * Math.min(1, e * 1.08));
        var r = 7 / cam.s;
        comet._core.setAttribute('cx', p.x); comet._core.setAttribute('cy', p.y); comet._core.setAttribute('r', r);
        comet._halo.setAttribute('cx', p.x); comet._halo.setAttribute('cy', p.y); comet._halo.setAttribute('r', r * 3);
      }
      if (k < 1) anim.raf = requestAnimationFrame(frame);
      else {
        anim = null;
        cam = to; apply(cam);
        world.classList.remove('is-moving');
        if (linkLen) comet.style.display = 'none';
        done && done();
      }
    }
    anim = { raf: requestAnimationFrame(frame) };
    var mine = anim;
    // If frames are throttled (background tab), still land on time.
    var guard = setTimeout(function () { if (anim && anim === mine) { cancelAnimationFrame(anim.raf); t0 = performance.now() - dur * 2; frame(performance.now()); } }, dur + 500);
    void minS; void guard;
  }

  /* ---------- HUD ---------- */
  var hudSt = document.getElementById('hud-stations');
  var hudCtx = document.getElementById('hud-ctx');
  var hudLine = document.querySelector('.hud-line');
  CHAPTERS.forEach(function (name) {
    var d = document.createElement('div');
    d.className = 'hud-st';
    d.innerHTML = '<i></i><span>' + name + '</span>';
    hudSt.appendChild(d);
  });
  function layoutHud() {
    var lr = hudLine.getBoundingClientRect(), rr = hudSt.parentNode.getBoundingClientRect();
    Array.prototype.forEach.call(hudSt.children, function (d, i) {
      d.style.left = (lr.left - rr.left + lr.width * i / (CHAPTERS.length - 1)) + 'px';
    });
  }
  var FRAME_COUNT = {};
  frames.forEach(function (f) { var r = f.getAttribute('data-region'); FRAME_COUNT[r] = (FRAME_COUNT[r] || 0) + 1; });
  function updateHud(stop) {
    var ch = stop.map ? -1 : stop.region;
    Array.prototype.forEach.call(hudSt.children, function (d, i) {
      d.classList.toggle('past', ch === 5 || i < ch);
      d.classList.toggle('now', i === ch);
    });
    var pct = ch === 5 ? 100 : ch < 0 ? 0 : ch / (CHAPTERS.length - 1) * 100;
    hudLine.firstElementChild.style.width = pct + '%';
    var label;
    if (stop.map) label = stop.id === 'ov' ? 'Overview' : 'Recap';
    else if (ch === 5) label = 'Next Steps';
    else {
      var idxIn = frames.filter(function (f) { return +f.getAttribute('data-region') === ch; }).indexOf(stop.el) + 1;
      label = CHAPTERS[ch] + ' · ' + idxIn + '/' + FRAME_COUNT[ch];
    }
    hudCtx.innerHTML = label + '<small>' + stop.sec + ' / 8</small>';
    counter.textContent = stop.sec + ' / 8';
  }

  /* ---------- Navigation ---------- */
  var idx = 0, step = 0, peek = false;
  var counter = document.getElementById('counter');

  function setMapClasses(stop) {
    root.classList.toggle('is-map', !!stop.map);
    var i = stops.indexOf(stop), recapI = stops.findIndex(function (s) { return s.id === 'recap'; });
    root.classList.toggle('is-recap', i >= recapI);
    root.classList.toggle('show-who', stop.id === 'ov' && step >= 1);
  }
  function frameIndexOf(stop) { return stop.el ? frames.indexOf(stop.el) : (stop.id === 'ov' ? -1 : frames.length - 2); }

  function updateDone(stop) {
    if (!donePath) return;
    var fi = frameIndexOf(stop);
    donePath.setAttribute('d', threadUpTo(Math.min(fi + 1, pts.length - 1)));
  }

  function go(i, k, animate) {
    i = Math.max(0, Math.min(stops.length - 1, i));
    var from = stops[idx], to = stops[i];
    var fi0 = frameIndexOf(from), fi1 = frameIndexOf(to);
    peek = false;
    idx = i; step = k;
    setMapClasses(to);
    updateHud(to);
    frames.forEach(function (f) { if (f !== to.el) f.classList.remove('is-here'); });
    if (to.el) applyStep(to.el, k);
    var opts = {};
    if (linkPath && to.el && fi1 === fi0 + 1) {
      var p = fi0 < 0 ? startPt : pts[fi0].b;
      linkPath.setAttribute('d', 'M ' + p.x + ' ' + p.y + ' ' + link(p, pts[fi1].a) + ' L ' + pts[fi1].b.x + ' ' + pts[fi1].b.y);
      opts.link = true;
    }
    var land = function () { if (to.el) arrive(to.el, step); updateDone(to); };
    if (animate === false || narrow.matches) { cam = targetFor(to); if (!narrow.matches) apply(cam); land(); }
    else fly(targetFor(to), opts, land);
    try { history.replaceState(null, '', '#/' + to.id + (step ? '.' + step : '')); } catch (e) { /* ignore */ }
  }

  function next() {
    var s = stops[idx];
    if (peek) { go(idx, step); return; }
    if (step < s.steps) {
      step++;
      if (s.el) applyStep(s.el, step);
      setMapClasses(s);
      try { history.replaceState(null, '', '#/' + s.id + '.' + step); } catch (e) { /* ignore */ }
    } else if (idx < stops.length - 1) go(idx + 1, 0);
    else toast('จบการนำเสนอแล้ว · กด Q เพื่อเปิดสไลด์สำรอง');
  }
  function prev() {
    var s = stops[idx];
    if (peek) { go(idx, step); return; }
    if (step > 0) {
      step--;
      if (s.el) applyStep(s.el, step);
      setMapClasses(s);
      try { history.replaceState(null, '', '#/' + s.id + (step ? '.' + step : '')); } catch (e) { /* ignore */ }
    } else if (idx > 0) go(idx - 1, stops[idx - 1].steps);
  }
  function togglePeek() {
    if (peek) { go(idx, step); return; }
    peek = true;
    root.classList.add('is-map');
    fly(targetFor({ map: true }));
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
      case 'Home': go(0, 0); break;
      case 'End': go(stops.length - 1, 0); break;
      case 'o': case 'O': togglePeek(); break;
      case 'f': case 'F': fullscreen(); break;
      case 'l': case 'L': toggleLaser(); break;
      case 'q': case 'Q': window.location.href = 'backup.html'; break;
      case 'h': case 'H': case '?': toggleHelp(); break;
      default:
        if (/^[1-8]$/.test(k)) { var s = +k; go(stops.findIndex(function (x) { return x.sec === s; }), 0); }
        else return;
    }
    e.preventDefault();
  });
  document.querySelector('.controls').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    ({ next: next, prev: prev, map: togglePeek, full: fullscreen, laser: toggleLaser, help: toggleHelp })[b.getAttribute('data-act')]();
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
  window.addEventListener('resize', function () {
    if (narrow.matches) return;
    stage(); layoutHud(); cam = peek ? targetFor({ map: true }) : targetFor(stops[idx]); apply(cam);
  });

  window.addEventListener('beforeprint', function () {
    frames.forEach(function (f) { f.classList.add('is-visited'); applyStep(f, f._steps); f.querySelectorAll('.draw').forEach(function (p) { p.classList.add('is-drawn'); }); });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el._counted = true;
      el.textContent = parseFloat(el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-decimals') || 0));
    });
  });

  /* ---------- Start ---------- */
  function fromHash() {
    var m = /^#\/?([a-z0-9]+)(?:\.(\d+))?/.exec(window.location.hash);
    var i = m ? stops.findIndex(function (s) { return s.id === m[1]; }) : 0;
    if (i < 0) i = 0;
    return { i: i, k: m && m[2] ? Math.min(+m[2], stops[i].steps) : 0 };
  }
  function start() {
    measure();
    if (narrow.matches) {
      frames.forEach(function (f) { f.classList.add('is-visited'); applyStep(f, f._steps); });
      return;
    }
    stage(); layoutHud();
    var h = fromHash();
    for (var j = 1; j < h.i; j++) if (stops[j].el) { stops[j].el.classList.add('is-visited'); applyStep(stops[j].el, stops[j].steps); }
    idx = h.i;
    go(h.i, h.k, false);
    wake();
    // Typing a hash (e.g. #/k2) jumps there; replaceState during navigation does not fire this.
    window.addEventListener('hashchange', function () { var t = fromHash(); go(t.i, t.k); });
    // An old-style #frameId hash or focus can scroll the clipped viewport; the camera owns position.
    viewport.addEventListener('scroll', function () { viewport.scrollLeft = 0; viewport.scrollTop = 0; });
    viewport.scrollLeft = 0; viewport.scrollTop = 0;
  }
  // Start when fonts are ready, but never wait longer than 1.2 s for them.
  var started = false;
  function startOnce() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startOnce);
  setTimeout(startOnce, 1200);
})();
