'use strict';

/**
 * Reusable navbar: init once, works across all sections (SPA).
 * Supports full mobile menu with collapsible sub-menus, backdrop, and hamburger animation.
 */
(function () {
  var NAV_MAP = {
    home: 'nl-home',
    video: 'nl-video',
    pdf: 'nl-pdf',
    exercises: 'nl-ex',
    tests: 'nl-tests',
    distribution: 'nl-dist'
  };

  var menuOpen = false;
  var backdrop = null;

  /* ── helpers ─────────────────────────────── */
  function isMobile() {
    return window.innerWidth <= 640;
  }

  function getHamburger() { return document.getElementById('hamburger'); }
  function getNavLinks()  { return document.getElementById('nav-links'); }

  function setActive(section) {
    Object.keys(NAV_MAP).forEach(function (s) {
      var id = NAV_MAP[s];
      var el = document.getElementById(id);
      if (el) el.classList.toggle('active', s === section);
    });
    var lessonsBtn = document.getElementById('nl-lessons');
    if (lessonsBtn) lessonsBtn.classList.toggle('active', section === 'video' || section === 'pdf');
  }

  /* ── backdrop ────────────────────────────── */
  function createBackdrop() {
    if (document.getElementById('nav-backdrop')) return;
    backdrop = document.createElement('div');
    backdrop.id = 'nav-backdrop';
    backdrop.addEventListener('click', closeMenu);
    document.body.appendChild(backdrop);
  }

  function showBackdrop() {
    if (!backdrop) backdrop = document.getElementById('nav-backdrop');
    if (backdrop) backdrop.classList.add('show');
    document.body.style.overflow = 'hidden'; // prevent bg scroll
  }

  function hideBackdrop() {
    if (!backdrop) backdrop = document.getElementById('nav-backdrop');
    if (backdrop) backdrop.classList.remove('show');
    document.body.style.overflow = '';
  }

  /* ── sub-menu / dropdown toggle ─────────────
     Desktop: JS-driven reflow animation (open = slide-down fade-in,
              close = slide-up fade-out → then display:none)
     Mobile : CSS max-height accordion (JS animation suppressed by !important)
  ─────────────────────────────────────────── */
  function openDropdownMenu(ddEl) {
    var menu = ddEl.querySelector(':scope > .dd-menu');
    if (!menu) { ddEl.classList.add('dd-open'); return; }

    if (isMobile()) {
      // Mobile: CSS accordion handles everything
      ddEl.classList.add('dd-open');
      return;
    }

    // Desktop: double-rAF animation
    // Frame 1: make element visible at start position (opacity:0, slid up)
    // Frame 2: browser has painted start state → now transition to end state
    menu.style.display   = 'block';
    menu.style.opacity   = '0';
    menu.style.transform = 'translateY(-10px)';
    ddEl.classList.add('dd-open');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        menu.style.opacity   = '1';
        menu.style.transform = 'translateY(0)';
      });
    });
  }

  function closeDropdownMenu(ddEl) {
    var menu = ddEl.querySelector(':scope > .dd-menu');
    ddEl.classList.remove('dd-open');
    if (!menu || isMobile()) return; // mobile CSS cleans up on its own
    if (menu.style.display !== 'block') return; // already hidden

    menu.style.opacity   = '0';
    menu.style.transform = 'translateY(-10px)';

    // After transition ends, reset inline styles → display:none
    menu.addEventListener('transitionend', function handler() {
      // Only hide if the dropdown was NOT re-opened during the transition
      if (!ddEl.classList.contains('dd-open')) {
        menu.style.display   = '';
        menu.style.opacity   = '';
        menu.style.transform = '';
      }
      menu.removeEventListener('transitionend', handler);
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.nav-dd.dd-open').forEach(function (dd) {
      closeDropdownMenu(dd);
    });
  }

  function toggleDropdown(ddEl) {
    var wasOpen = ddEl.classList.contains('dd-open');
    closeAllDropdowns();
    if (!wasOpen) openDropdownMenu(ddEl);
  }

  /* ── main menu open / close ─────────────── */
  function toggleMenu() {
    if (menuOpen) closeMenu();
    else          openMenu();
  }

  function openMenu() {
    menuOpen = true;
    var el = getNavLinks();
    var hbg = getHamburger();
    if (el)  el.classList.add('open');
    if (hbg) hbg.classList.add('open');
    document.body.style.overflow = 'hidden'; // prevent background scroll
  }

  function closeMenu() {
    menuOpen = false;
    var el = getNavLinks();
    var hbg = getHamburger();
    if (el)  el.classList.remove('open');
    if (hbg) hbg.classList.remove('open');
    closeAllDropdowns();
    document.body.style.overflow = '';
  }

  /* ── admin button ────────────────────────── */
  function handleAdminBtn() {
    if (window.Auth && window.Auth.getIsAdmin()) {
      if (window.Auth.doLogout()) {
        if (window.App && window.App.render) window.App.render();
      }
    } else {
      if (window.Modals) window.Modals.open('m-login');
    }
  }

  /* ── wheel scroll inside desktop dropdowns ─
     Strategy: always stopPropagation so the page never receives the event.
     Let the browser scroll the overflow:auto element naturally (no manual scrollTop).
     Only call preventDefault at the top/bottom boundary to block page scroll there too.
  ─────────────────────────────────────────── */
  function initDropdownScroll() {
    document.querySelectorAll('.dd-menu').forEach(function (menu) {
      menu.addEventListener('wheel', function (e) {
        // Always stop the event from reaching the page/document
        e.stopPropagation();

        var scrollable = menu.scrollHeight > menu.clientHeight;
        if (!scrollable) return; // nothing to scroll — let event go (already stopped)

        var atTop    = menu.scrollTop <= 0;
        var atBottom = menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 1;
        var goingUp   = e.deltaY < 0;
        var goingDown = e.deltaY > 0;

        // At a boundary: block the page from scrolling too
        if ((goingUp && atTop) || (goingDown && atBottom)) {
          e.preventDefault();
        }
        // Otherwise: do NOT preventDefault → browser scrolls the menu element naturally
        // (works correctly regardless of deltaMode: pixels, lines, or pages)
      }, { passive: false });
    });
  }

  /* ── init ────────────────────────────────── */
  function init() {
    // Inject full-screen menu header (title + close button) as first <li>
    var navLinks = document.getElementById('nav-links');
    if (navLinks && !document.getElementById('mob-nav-header-li')) {
      var headerLi = document.createElement('li');
      headerLi.id = 'mob-nav-header-li';
      headerLi.className = 'mob-nav-header';
      var title = document.createElement('span');
      title.className = 'mob-nav-title';
      title.textContent = 'القائمة';
      var closeBtn = document.createElement('button');
      closeBtn.className = 'mob-nav-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'إغلاق القائمة');
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', closeMenu);
      headerLi.appendChild(title);
      headerLi.appendChild(closeBtn);
      navLinks.insertBefore(headerLi, navLinks.firstChild);
    }
    // Inject theme toggle as a nav item
    if (navLinks && !document.getElementById('mob-theme-toggle-li')) {
      var themeLi = document.createElement('li');
      themeLi.id = 'mob-theme-toggle-li';
      themeLi.className = 'mob-theme-toggle';
      var themeBtn = document.createElement('button');
      themeBtn.className = 'nav-link theme-toggle';
      themeBtn.type = 'button';
      var currentTheme = window.Theme && window.Theme.get ? window.Theme.get() : 'dark';
      themeBtn.textContent = currentTheme === 'dark' ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي';
      themeBtn.setAttribute('aria-label', 'تبديل السمة');
      themeBtn.addEventListener('click', function () {
        if (window.Theme) window.Theme.toggle();
        var t = window.Theme && window.Theme.get ? window.Theme.get() : 'dark';
        themeBtn.textContent = t === 'dark' ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي';
      });
      navLinks.appendChild(themeLi);
      themeLi.appendChild(themeBtn);
    }
    // Inject admin button as the last <li> in the nav-links
    if (navLinks && !document.getElementById('mob-nav-admin-li')) {
      var adminLi = document.createElement('li');
      adminLi.id = 'mob-nav-admin-li';
      adminLi.className = 'mob-nav-admin';
      var adminMobBtn = document.createElement('button');
      adminMobBtn.id = 'mob-admin-btn';
      adminMobBtn.className = 'nav-link mob-admin-btn';
      adminMobBtn.type = 'button';
      var adm = window.Auth && window.Auth.getIsAdmin ? window.Auth.getIsAdmin() : false;
      adminMobBtn.textContent = adm ? '🚪 تسجيل الخروج' : '🔐 دخول المسؤول';
      if (adm) adminMobBtn.classList.add('logout');
      adminMobBtn.addEventListener('click', function () {
        handleAdminBtn();
        closeMenu();
      });
      adminLi.appendChild(adminMobBtn);
      navLinks.appendChild(adminLi);
    }

    /* Close dropdowns / menu on outside click */
    document.addEventListener('click', function (e) {
      // Close a desktop dropdown when clicking outside it
      if (!e.target.closest('.nav-dd')) {
        closeAllDropdowns();
      }
      // Close the mobile slide-out menu when clicking outside nav
      if (menuOpen && !e.target.closest('#nav-links') && !e.target.closest('#hamburger')) {
        closeMenu();
      }
    });

    /* Keyboard: Escape closes everything */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenu(); closeAllDropdowns(); }
    });

    /* Hamburger */
    var hamburger = document.getElementById('hamburger');
    if (hamburger) hamburger.addEventListener('click', toggleMenu);

    /* Admin button */
    var adminBtn = document.getElementById('admin-login-btn');
    if (adminBtn) adminBtn.addEventListener('click', handleAdminBtn);

    /* Brand → home */
    var brand = document.querySelector('.brand');
    if (brand) {
      brand.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.App && window.App.nav) window.App.nav('home');
        closeMenu();
      });
    }

    /* Populate levels dropdown */
    var levelsMenu = document.getElementById('levels-menu');
    if (levelsMenu && window.APP_CONFIG && window.APP_CONFIG.LEVELS) {
      var currentLevel = document.body.getAttribute('data-level') || 'first-middle';
      window.APP_CONFIG.LEVELS.forEach(function (level) {
        var a = document.createElement('a');
        a.className = 'dd-link' + (level.id === currentLevel ? ' active' : '');
        a.href = level.file;
        a.textContent = level.title;
        // ── UTF-8 pre-navigation debug probe ─────────────────────────────────
        // Fires just before the WebView loads the new level page.
        // Check Android Logcat (tag: Madarik:Encoding) — if title.charCodes look
        // correct (Arabic U+0600..U+06FF) here but "?" on the next page, the
        // corruption is happening in WebView byte-decoding, NOT in JS.
        a.addEventListener('click', function () {
          console.log(
            '[Madarik:Encoding] Before nav | from=' + currentLevel +
            ' | to=' + level.id +
            ' | title=' + level.title +
            ' | charCodes=' + level.title.split('').map(function(c){return c.charCodeAt(0).toString(16);}).join(',')
          );
        });
        levelsMenu.appendChild(a);
      });
    }

    /* SPA nav links */
    [['nl-home', 'home'], ['nl-video', 'video'], ['nl-pdf', 'pdf'], ['nl-ex', 'exercises'], ['nl-tests', 'tests'], ['nl-dist', 'distribution']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.App && window.App.nav) window.App.nav(pair[1]);
          closeMenu();
        });
      }
    });

    /* Dropdown trigger click — works on ALL screen sizes (no :hover dependency) */
    document.querySelectorAll('.nav-dd').forEach(function (dd) {
      var trigger = dd.querySelector(':scope > .nav-link');
      if (!trigger) return;
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation(); // prevent the doc-level click from immediately closing it
        toggleDropdown(dd);
      });
    });

    /* Close menu when any dd-link is tapped */
    document.querySelectorAll('.dd-link').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu();
      });
    });

    initDropdownScroll();
  }

  window.Navbar = {
    setActive:   setActive,
    toggleMenu:  toggleMenu,
    closeMenu:   closeMenu,
    init:        init
  };
})();
