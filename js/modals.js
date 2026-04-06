'use strict';

/**
 * Modal and toast — shared across all pages.
 */
(function () {
  var toastTimer;

  function openM(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeM(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function toast(msg, type) {
    type = type || 'ok';
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'on ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = '';
    }, 3400);
  }

  function init() {
    document.querySelectorAll('.overlay').forEach(function (o) {
      o.addEventListener('click', function (e) {
        if (e.target === o) o.classList.remove('open');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.overlay.open').forEach(function (o) {
          o.classList.remove('open');
        });
      }
    });
  }

  window.Modals = {
    open: openM,
    close: closeM,
    toast: toast,
    init: init
  };
})();
