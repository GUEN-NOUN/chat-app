/**
 * assets/chat-overlay.js
 * Chat sidebar overlay — loads /chat/ in an iframe panel.
 * Replaces full-page navigation so users stay on the curriculum page.
 */
(function () {
  'use strict';

  var CHAT_ORIGIN = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.protocol + '//' + window.location.hostname +
       (window.location.port ? ':' + window.location.port : ''))
    : window.location.origin;

  /* ─── NOTE: Stale SW cleanup removed — rely on sw.js versioning instead ── */

  /* ─── Silently probe the chat server ────────────────────────────────────── */
  function showServerWarning(msg) {
    document.addEventListener('DOMContentLoaded', function () {
      var w = document.createElement('div');
      w.id = 'chat-server-warning';
      w.style.cssText =
        'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);' +
        'background:#e03e3e;color:#fff;padding:10px 18px;border-radius:8px;' +
        'font-size:13px;z-index:9999;font-family:Tajawal,sans-serif;' +
        'text-align:center;direction:rtl;box-shadow:0 4px 20px rgba(0,0,0,.4);' +
        'max-width:90vw;line-height:1.5;cursor:pointer;';
      w.title = 'انقر للإغلاق';
      w.textContent = msg;
      w.addEventListener('click', function () { if (w.parentNode) w.parentNode.removeChild(w); });
      document.body.appendChild(w);
      setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 9000);
    });
  }

  /* Check health endpoint after page loads */
  window.addEventListener('load', function () {
    fetch(CHAT_ORIGIN + '/health', { method: 'GET', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) showServerWarning('⚠️ خادم الدردشة يعمل لكن أعاد خطأ ' + r.status);
      })
      .catch(function () {
        showServerWarning(
          '⚠️ خادم الدردشة غير متاح. تأكد من تشغيل الخادم عبر:\n' +
          'cd server && node index.js'
        );
      });
  });

  /* ─── State ─────────────────────────────────────────────────────────────── */
  var sidebar  = null;
  var isOpen   = false;
  var iframeEl = null;
  var loaded   = false;

  /* ─── Build sidebar DOM (once) ──────────────────────────────────────────── */
  function buildSidebar() {
    sidebar = document.createElement('div');
    sidebar.id = 'chat-sidebar';
    sidebar.setAttribute('role', 'complementary');
    sidebar.setAttribute('aria-label', 'الدردشة');
    sidebar.innerHTML =
      '<header class="cs-header">' +
        '<span class="cs-title">💬 الدردشة التعليمية</span>' +
        '<button class="cs-close" id="cs-close-btn" type="button" aria-label="إغلاق الدردشة">✕</button>' +
      '</header>' +
      '<div class="cs-body">' +
        '<iframe id="cs-iframe" title="الدردشة" allow="microphone; camera" loading="lazy"></iframe>' +
      '</div>';
    document.body.appendChild(sidebar);

    iframeEl = sidebar.querySelector('#cs-iframe');
    sidebar.querySelector('#cs-close-btn').addEventListener('click', closeSidebar);
  }

  /* ─── Lazy-load iframe src on first open ────────────────────────────────── */
  function ensureIframeLoaded() {
    if (loaded || !iframeEl) return;
    loaded = true;
    iframeEl.src = CHAT_ORIGIN + '/chat/';
  }

  /* ─── Open / Close ──────────────────────────────────────────────────────── */
  function openSidebar() {
    if (!sidebar) buildSidebar();
    ensureIframeLoaded();
    sidebar.classList.add('cs-open');
    document.body.classList.add('cs-body-open');
    isOpen = true;
    updateFab();
    // Trap focus inside sidebar on keyboard navigation
    sidebar.querySelector('#cs-close-btn').focus();
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('cs-open');
    document.body.classList.remove('cs-body-open');
    isOpen = false;
    updateFab();
    // Return focus to FAB
    var fab = document.getElementById('chat-fab');
    if (fab) fab.focus();
  }

  function updateFab() {
    var fab = document.getElementById('chat-fab');
    if (!fab) return;
    fab.textContent    = isOpen ? '✕' : '💬';
    fab.title          = isOpen ? 'إغلاق الدردشة' : 'فتح الدردشة';
    fab.setAttribute('aria-expanded', String(isOpen));
    fab.classList.toggle('cs-fab-open', isOpen);
  }

  /* ─── Init ──────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var fab = document.getElementById('chat-fab');
    if (!fab) return;

    // Prevent <a> navigation if it still has href
    fab.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      isOpen ? closeSidebar() : openSidebar();
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closeSidebar();
    });

    // Close overlay when clicking the backdrop (body shift area) — desktop
    document.addEventListener('click', function (e) {
      if (isOpen && sidebar && !sidebar.contains(e.target) && e.target !== fab) {
        closeSidebar();
      }
    });
  });

})();
