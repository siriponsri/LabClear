/* Backup page keys: Esc / B / Q return to the last core frame; digits jump to sections. */
(function () {
  'use strict';
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'q' || e.key === 'Q') {
      window.location.href = document.getElementById('back').getAttribute('href');
    } else if (/^[1-9]$/.test(e.key)) {
      var el = document.getElementById('q' + e.key);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', '#q' + e.key); }
    }
  });
})();
