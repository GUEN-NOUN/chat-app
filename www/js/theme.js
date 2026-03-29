'use strict';

/**
 * Theme switcher — dark (default) / light mode.
 * Persists choice in localStorage. Applies data-theme attribute on <html>.
 */
(function () {
  var STORAGE_KEY = 'madarik_theme';
  var HTML = document.documentElement;
  var DARK = 'dark';
  var LIGHT = 'light';

  function get() {
    try { return localStorage.getItem(STORAGE_KEY) || DARK; }
    catch (e) { return DARK; }
  }

  function set(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); }
    catch (e) { /* quota */ }
  }

  function apply(theme) {
    HTML.setAttribute('data-theme', theme);
    // Update toggle button icons
    var btns = document.querySelectorAll('.theme-toggle');
    btns.forEach(function (btn) {
      btn.setAttribute('aria-label', theme === DARK ? 'تبديل إلى الوضع الفاتح' : 'تبديل إلى الوضع الداكن');
      btn.textContent = theme === DARK ? '☀️' : '🌙';
    });
  }

  function toggle() {
    var current = get();
    var next = current === DARK ? LIGHT : DARK;
    set(next);
    apply(next);
  }

  function init() {
    var theme = get();
    apply(theme);
    // Bind all toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', toggle);
    });
  }

  // Apply immediately to prevent flash
  apply(get());

  window.Theme = {
    init: init,
    toggle: toggle,
    get: get
  };
})();
