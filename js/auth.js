'use strict';

/**
 * Admin auth — server-side JWT authentication via /api/auth
 *
 * Security:
 *  - No credentials stored in frontend code
 *  - Login POSTs to /api/auth/login; JWT returned in HTTP-only cookie
 *  - Session verified via /api/auth/me (cookie auto-sent)
 *  - Logout clears HTTP-only cookie server-side
 *  - Rate limiting enforced server-side
 */
(function () {
  var API = window.APP_CONFIG.API_URL || '';

  var isAdmin = false;
  var adminInfo = null;
  var refreshTimer = null;

  /* ── fetch wrapper (always sends cookies) ── */
  function apiFetch(path, options) {
    var opts = Object.assign({ credentials: 'include' }, options || {});
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(API + path, opts).then(function (res) { return res.json(); });
  }

  /* ── Verify current session with server ── */
  function checkSession() {
    return apiFetch('/api/auth/me').then(function (data) {
      if (data.ok && data.admin) {
        isAdmin = true;
        adminInfo = data.admin;
      } else {
        isAdmin = false;
        adminInfo = null;
      }
      return isAdmin;
    }).catch(function () {
      isAdmin = false;
      adminInfo = null;
      return false;
    });
  }

  function getIsAdmin() { return isAdmin; }
  function getAdminInfo() { return adminInfo; }

  /* ── LOGIN (returns Promise<boolean>) ── */
  function doLogin(email, pass) {
    var emailNorm = (email || '').trim().toLowerCase();
    var passNorm  = (pass || '').trim();

    if (!emailNorm || !passNorm) {
      if (window.Modals) window.Modals.toast('❌ أدخل البريد وكلمة المرور', 'err');
      return Promise.resolve(false);
    }

    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: emailNorm, password: passNorm }
    }).then(function (data) {
      if (data.ok) {
        isAdmin = true;
        adminInfo = data.admin || { email: emailNorm };
        if (window.Modals) window.Modals.toast('✅ مرحبًا! تم تسجيل الدخول بنجاح', 'ok');
        updateAdminUI();
        scheduleRefresh();
        return true;
      }
      isAdmin = false;
      adminInfo = null;
      if (window.Modals) window.Modals.toast('❌ ' + (data.error || 'فشل تسجيل الدخول'), 'err');
      return false;
    }).catch(function () {
      if (window.Modals) window.Modals.toast('❌ تعذر الاتصال بالخادم', 'err');
      return false;
    });
  }

  /* ── LOGOUT (returns Promise<boolean>) ── */
  function doLogout() {
    if (!confirm('هل تريد تسجيل الخروج من لوحة التحكم؟')) return Promise.resolve(false);

    return apiFetch('/api/auth/logout', { method: 'POST' }).then(function () {
      isAdmin = false;
      adminInfo = null;
      clearTimeout(refreshTimer);
      if (window.Modals) window.Modals.toast('تم تسجيل الخروج', 'inf');
      updateAdminUI();
      return true;
    }).catch(function () {
      isAdmin = false;
      adminInfo = null;
      updateAdminUI();
      return true;
    });
  }

  /* ── Periodic session refresh ── */
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      checkSession().then(function (ok) {
        if (ok) scheduleRefresh();
        else updateAdminUI();
      });
    }, 15 * 60 * 1000);
  }

  function refreshSession() {
    if (!isAdmin) return;
    checkSession().then(function (ok) {
      if (!ok) {
        updateAdminUI();
        if (window.Modals) window.Modals.toast('انتهت الجلسة. يرجى تسجيل الدخول مجدداً.', 'inf');
      }
    });
  }

  /* ── Update admin-related UI across the page ── */
  function updateAdminUI() {
    var btn = document.getElementById('admin-login-btn');
    var badge = document.getElementById('admin-badge');
    if (!btn) return;
    if (isAdmin) {
      btn.textContent = '🚪 تسجيل الخروج';
      btn.classList.add('logout');
      if (badge) badge.classList.add('show');
      document.body.classList.add('admin-active');
    } else {
      btn.textContent = '🔐 دخول المسؤول';
      btn.classList.remove('logout');
      if (badge) badge.classList.remove('show');
      document.body.classList.remove('admin-active');
    }
    var mobBtn = document.getElementById('mob-admin-btn');
    if (mobBtn) {
      if (isAdmin) {
        mobBtn.textContent = '🚪 تسجيل الخروج';
        mobBtn.classList.add('logout');
      } else {
        mobBtn.textContent = '🔐 دخول المسؤول';
        mobBtn.classList.remove('logout');
      }
    }
  }

  /* ── Init: check session on page load ── */
  function init() {
    return checkSession().then(function () {
      updateAdminUI();
      if (isAdmin) scheduleRefresh();
    });
  }

  // Run initial check
  init();

  window.Auth = {
    getIsAdmin:     getIsAdmin,
    getAdminInfo:   getAdminInfo,
    doLogin:        doLogin,
    doLogout:       doLogout,
    updateAdminUI:  updateAdminUI,
    refreshSession: refreshSession,
    checkSession:   checkSession,
    init:           init
  };
})();
