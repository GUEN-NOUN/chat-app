'use strict';

/**
 * Page renderers and handlers. Uses IndexedDB for PDF blobs (no broken URLs on refresh).
 */
(function () {
  var App = window.App;
  var Auth = window.Auth;
  var Modals = window.Modals;
  var Storage = window.Storage;
  var Utils = window.Utils;
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var MAX_PDF_MB = window.APP_CONFIG.MAX_PDF_MB || 20;

  /* ── Subject helpers ─────────────────────── */
  var activeSubject = 'all'; // 'all' or subject id

  function getLevelGroup() {
    var level = (App.getCurrentLevel && App.getCurrentLevel()) || 'tcs-sciences';
    if (level.indexOf('primary') !== -1) return 'primary';
    if (level.indexOf('tcs') !== -1) return 'tcs';
    if (level.indexOf('bac') !== -1 || level.indexOf('shared') !== -1) return 'bac';
    return 'tcs';
  }

  function getSubjects() {
    var cfg = window.APP_CONFIG.SUBJECTS;
    if (!cfg) return [];
    return cfg[getLevelGroup()] || cfg.tcs || cfg.bac || [];
  }

  function buildSubjectSidebar() {
    var subjects = getSubjects();
    if (!subjects.length) return '';
    var html = '<aside class="subject-sidebar">';
    html += '<div class="subject-item' + (activeSubject === 'all' ? ' active' : '') + '" data-subject="all">';
    html += '<span class="si-icon">📚</span> الكل</div>';
    subjects.forEach(function (s) {
      html += '<div class="subject-item' + (activeSubject === s.id ? ' active' : '') + '" data-subject="' + Utils.esc(s.id) + '">';
      html += '<span class="si-icon">' + s.icon + '</span> ' + Utils.esc(s.name) + '</div>';
    });
    html += '</aside>';
    return html;
  }

  function buildSubjectDropdown() {
    var subjects = getSubjects();
    if (!subjects.length) return '';
    var html = '<div class="subject-dropdown-wrap">';
    html += '<select class="subject-dropdown" id="subject-dropdown">';
    html += '<option value="all"' + (activeSubject === 'all' ? ' selected' : '') + '>📚 جميع المواد</option>';
    subjects.forEach(function (s) {
      html += '<option value="' + Utils.esc(s.id) + '"' + (activeSubject === s.id ? ' selected' : '') + '>' + s.icon + ' ' + Utils.esc(s.name) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  function filterItemsBySubject(items) {
    if (activeSubject === 'all') return items;
    return items.filter(function (item) {
      return item.subject === activeSubject;
    });
  }

  function bindSubjectEvents(rerenderFn) {
    // Desktop sidebar click
    var sidebarItems = document.querySelectorAll('.subject-item');
    sidebarItems.forEach(function (el) {
      el.addEventListener('click', function () {
        activeSubject = el.getAttribute('data-subject') || 'all';
        rerenderFn();
      });
    });
    // Mobile dropdown
    var dropdown = document.getElementById('subject-dropdown');
    if (dropdown) {
      dropdown.addEventListener('change', function () {
        activeSubject = dropdown.value || 'all';
        rerenderFn();
      });
    }
  }

  /* ── Schedule helpers ────────────────────── */
  function buildSchedulePanel() {
    var tmpl = window.APP_CONFIG.SCHEDULE_TEMPLATE;
    if (!tmpl) return '';
    var level = (App.getCurrentLevel && App.getCurrentLevel()) || '';
    var stored = Storage.getItem('madarik_schedule_' + level, null);
    var html = '<div class="schedule-panel">';
    html += '<div class="sec-header"><div class="sec-icon">📅</div><h2>الجدول الأسبوعي</h2></div>';
    if (stored && stored.length) {
      html += '<div class="schedule-grid">';
      stored.forEach(function (card) {
        html += '<div class="schedule-card">';
        html += '<div class="sc-day">' + Utils.esc(card.day) + '</div>';
        html += '<div class="sc-time">' + Utils.esc(card.time) + '</div>';
        html += '<div class="sc-subject">' + Utils.esc(card.subject) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="schedule-grid">';
      tmpl.days.forEach(function (day) {
        html += '<div class="schedule-card">';
        html += '<div class="sc-day">' + Utils.esc(day) + '</div>';
        html += '<div class="sc-time">—</div>';
        html += '<div class="sc-subject">لم يتم تعيين الحصص بعد</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function adminBar(addLabel, addOnClick, modalId) {
    if (!Auth.getIsAdmin()) return '';
    return '<div class="admin-bar">' +
      '<span class="admin-bar-label">🛡 وضع المسؤول</span>' +
      '<button class="btn btn-primary btn-sm" type="button" data-admin-add="' + (modalId || '') + '">' + (addLabel || 'إضافة') + '</button>' +
      '<button class="btn btn-danger btn-sm admin-logout-btn" type="button">🚪 تسجيل الخروج</button>' +
      '</div>';
  }

  function bindAdminBarEvents(modalId) {
    var bar = document.querySelector('.admin-bar');
    if (!bar) return;
    var addBtn = bar.querySelector('.btn-primary');
    if (addBtn) addBtn.addEventListener('click', function () {
      if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
      Modals.open(modalId);
    });
    var logoutBtn = bar.querySelector('.admin-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      if (Auth.doLogout()) App.render();
    });
  }

  function safeFilename(name) {
    if (!name || typeof name !== 'string') return 'document';
    return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'document';
  }

  function docDownloadUrl(id, filename, openInNewTab) {
    if (!id) {
      Modals.toast('❌ الملف غير متوفر', 'err');
      return;
    }
    Modals.toast(openInNewTab ? 'جاري فتح الملف…' : 'جاري التحميل…', 'inf');
    Storage.getBlob(id).then(function (blob) {
      if (!blob) {
        Modals.toast('❌ الملف غير متوفر', 'err');
        return;
      }
      var url = URL.createObjectURL(blob);
      var fn = safeFilename(filename) + '.pdf';
      if (openInNewTab) {
        try {
          window.open(url, '_blank');
        } catch (err) {
          Modals.toast('❌ تعذر فتح الملف', 'err');
          URL.revokeObjectURL(url);
          return;
        }
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        Modals.toast('✅ تم فتح الملف', 'ok');
      } else {
        try {
          var a = document.createElement('a');
          a.href = url;
          a.download = fn;
          a.setAttribute('download', fn);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (err) {
          Modals.toast('❌ تعذر بدء التحميل', 'err');
        }
        URL.revokeObjectURL(url);
        Modals.toast('✅ تم بدء التحميل', 'ok');
      }
    }).catch(function (err) {
      Modals.toast('❌ خطأ في تحميل الملف', 'err');
    });
  }

  function renderDocList(items, type, iconClass, sectionTitle, countLabel, emptyMsg, addModalId, addLabel, delCb) {
    var isAdmin = Auth.getIsAdmin();
    var adminBarHtml = adminBar(addLabel, null, addModalId);
    var filteredItems = filterItemsBySubject(items);
    var listHtml;
    if (!filteredItems || filteredItems.length === 0) {
      listHtml = '<div class="empty"><span class="empty-icon">' + (type === 'pdf' ? '📄' : type === 'ex' ? '📝' : '📋') + '</span><p>' +
        (activeSubject !== 'all' ? 'لا توجد ملفات لهذه المادة' : emptyMsg) + '</p></div>';
    } else {
      listHtml = filteredItems.map(function (item) {
        // find original index for deletion
        var origIdx = items.indexOf(item);
        var hasFile = !!item.id;
        var subjectBadge = '';
        if (item.subject && activeSubject === 'all') {
          var subjs = getSubjects();
          var matched = subjs.find(function (s) { return s.id === item.subject; });
          if (matched) subjectBadge = '<span class="doc-subject-badge">' + matched.icon + ' ' + Utils.esc(matched.name) + '</span>';
        }
        var actions = '<div class="doc-actions">';
        if (hasFile) {
          actions += '<button type="button" class="btn-download" data-doc-id="' + Utils.esc(item.id) + '" data-doc-title="' + Utils.esc(item.title) + '">⬇ تحميل</button>';
          actions += ' <button type="button" class="btn btn-ghost btn-sm btn-open-pdf" data-doc-id="' + Utils.esc(item.id) + '" data-doc-title="' + Utils.esc(item.title) + '">عرض</button>';
        } else {
          actions += '<span class="btn-coming">قريبًا…</span>';
        }
        if (isAdmin) actions += '<button class="doc-del" type="button" data-index="' + origIdx + '" title="حذف">🗑</button>';
        actions += '</div>';
        return '<div class="doc-item">' +
          '<div class="doc-icon ' + iconClass + '">' + (type === 'pdf' ? '📄' : type === 'ex' ? '📝' : '📋') + '</div>' +
          '<div class="doc-body"><div class="doc-title">' + Utils.esc(item.title) + '</div>' + subjectBadge + '<div class="doc-desc">' + Utils.esc(item.desc) + '</div></div>' +
          actions + '</div>';
      }).join('');
    }
    var sidebarHtml = buildSubjectSidebar();
    var dropdownHtml = buildSubjectDropdown();
    var headerHtml = '<div class="sec-header">' +
      '<div class="sec-icon">' + (type === 'pdf' ? '📄' : type === 'ex' ? '📝' : '📋') + '</div>' +
      '<h2>' + sectionTitle + '</h2>' +
      '<span class="sec-count">' + (filteredItems ? filteredItems.length : 0) + ' / ' + (items ? items.length : 0) + '</span></div>';
    var html = headerHtml + adminBarHtml + dropdownHtml +
      '<div class="content-layout">' +
      sidebarHtml +
      '<div class="content-main"><div class="doc-list">' + listHtml + '</div></div>' +
      '</div>';
    var page = document.getElementById('page');
    if (!page) return;
    page.innerHTML = html;

    // Bind subject filtering
    var rerenderFn = function () {
      renderDocList(items, type, iconClass, sectionTitle, countLabel, emptyMsg, addModalId, addLabel, delCb);
    };
    bindSubjectEvents(rerenderFn);

    bindAdminBarEvents(addModalId);
    page.querySelectorAll('.btn-download').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        docDownloadUrl(btn.getAttribute('data-doc-id'), btn.getAttribute('data-doc-title'), false);
      });
    });
    page.querySelectorAll('.btn-open-pdf').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        docDownloadUrl(btn.getAttribute('data-doc-id'), btn.getAttribute('data-doc-title'), true);
      });
    });
    page.querySelectorAll('.doc-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(idx) && delCb) delCb(idx);
      });
    });
  }

  /** Homepage layout and copy match original الاولى_اعدادي_FINAL_v2.html */
  function renderHome() {
    var v = App.getVideos();
    var p = App.getPdfList();
    var ex = App.getExercisesList();
    var t = App.getTestsList();
    var dist = App.getDistributionList();
    var levelTitle = (App.getLevelTitle && App.getLevelTitle()) ? App.getLevelTitle() : 'مدارك التعليمية';
    var html = '<div class="home-hero">' +
      '<div class="home-badge">🎓 ' + Utils.esc(levelTitle) + ' · مدارك التعليمية</div>' +
      '<h1>منصتك التعليمية الشاملة</h1>' +
      '<p>كل ما تحتاجه من دروس، تمارين، وامتحانات تجريبية في مكان واحد</p>' +
      '<div class="hero-video-3d"><div class="hero-video-frame">' +
      '<video autoplay muted loop playsinline><source src="/assets/intro.mp4" type="video/mp4"></video>' +
      '</div></div>' +
      '<div class="home-grid">' +
      '<div class="home-card" data-section="video"><span class="hc-icon">🎬</span><div class="hc-title">شرح بالفيديو</div><div class="hc-count">' + (v ? v.length : 0) + ' فيديو</div></div>' +
      '<div class="home-card" data-section="pdf"><span class="hc-icon">📄</span><div class="hc-title">تحميل PDF</div><div class="hc-count">' + (p ? p.length : 0) + ' ملف</div></div>' +
      '<div class="home-card" data-section="exercises"><span class="hc-icon">📝</span><div class="hc-title">سلاسل التمارين</div><div class="hc-count">' + (ex ? ex.length : 0) + ' سلسلة</div></div>' +
      '<div class="home-card" data-section="tests"><span class="hc-icon">📋</span><div class="hc-title">الامتحانات التجريبية</div><div class="hc-count">' + (t ? t.length : 0) + ' امتحان</div></div>' +
      '<div class="home-card" data-section="distribution"><span class="hc-icon">📋</span><div class="hc-title">التوجيه المدرسي</div><div class="hc-count">' + (dist ? dist.length : 0) + ' منشور</div></div>' +
      '</div></div>';
    // Add subjects quick strip
    var subjects = getSubjects();
    if (subjects.length) {
      html += '<div class="home-subjects"><h3>📚 المواد الدراسية</h3><div class="home-subjects-grid">';
      subjects.forEach(function (s) {
        html += '<div class="home-subject-chip"><span>' + s.icon + '</span> ' + Utils.esc(s.name) + '</div>';
      });
      html += '</div></div>';
    }
    // Add schedule overview
    html += buildSchedulePanel();
    var page = document.getElementById('page');
    if (!page) return;
    page.innerHTML = html;
    page.querySelectorAll('.home-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var s = card.getAttribute('data-section');
        if (s) App.nav(s);
      });
    });
  }

  function extractYTID(url) {
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /** Detect video type from URL */
  function detectVideoType(url) {
    if (!url) return { type: 'unknown' };
    // YouTube
    var ytId = extractYTID(url);
    if (ytId) return { type: 'youtube', id: ytId };
    // MP4/MOV direct link
    if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) return { type: 'direct', url: url };
    // Soutiensco
    if (/soutiensco/i.test(url)) return { type: 'soutiensco', url: url };
    // Fallback: try as direct link
    return { type: 'link', url: url };
  }

  /** Render video card thumbnail based on type */
  function videoThumb(v) {
    var info = detectVideoType(v.url || '');
    if (info.type === 'youtube' || v.id) {
      var vid = info.id || v.id;
      return '<div class="vid-thumb">' +
        '<img src="https://img.youtube.com/vi/' + Utils.esc(vid) + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="vid-play"></div></div>';
    }
    if (info.type === 'direct') {
      return '<div class="vid-thumb"><video src="' + Utils.esc(info.url) + '" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:8px 8px 0 0;"></video><div class="vid-play"></div></div>';
    }
    return '<div class="vid-thumb"><div class="vid-play"></div></div>';
  }

  /** Open video based on type */
  function openVideo(v) {
    var info = detectVideoType(v.url || '');
    if (info.type === 'youtube' || v.id) {
      var vid = info.id || v.id;
      window.open('https://www.youtube.com/watch?v=' + vid, '_blank');
      return;
    }
    if (info.type === 'direct') {
      // Open in a modal or new tab with HTML5 video
      var w = window.open('', '_blank');
      if (w) {
        w.document.write('<!DOCTYPE html><html><head><title>' + Utils.esc(v.title || 'Video') + '</title><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style></head><body><video controls autoplay style="max-width:100%;max-height:100vh;"><source src="' + Utils.esc(info.url) + '"></video></body></html>');
        w.document.close();
      }
      return;
    }
    if (info.type === 'soutiensco') {
      // Try the soutiensco URL, with backup_url fallback
      var target = v.backup_url || info.url;
      window.open(target, '_blank');
      return;
    }
    if (info.url) window.open(info.url, '_blank');
  }

  function renderVideos() {
    var allVideos = App.getVideos();
    var videos = filterItemsBySubject(allVideos);
    var isAdmin = Auth.getIsAdmin();
    var adminBarHtml = adminBar('➕ إضافة فيديو جديد', null, 'm-video');
    var sidebarHtml = buildSubjectSidebar();
    var dropdownHtml = buildSubjectDropdown();
    var subjectBadgeFor = function (v) {
      if (!v.subject || activeSubject !== 'all') return '';
      var subjs = getSubjects();
      var matched = subjs.find(function (s) { return s.id === v.subject; });
      return matched ? '<span class="doc-subject-badge">' + matched.icon + ' ' + Utils.esc(matched.name) + '</span>' : '';
    };
    var cards = videos.length ? videos.map(function (v) {
      var origIdx = allVideos.indexOf(v);
      return '<div class="vid-card" data-video-idx="' + origIdx + '">' +
        videoThumb(v) +
        (isAdmin ? '<button class="vid-del" type="button" data-video-index="' + origIdx + '" title="حذف">🗑</button>' : '') +
        '<div class="vid-info">' + subjectBadgeFor(v) + '<div class="vid-title">' + Utils.esc(v.title) + '</div><div class="vid-desc">' + Utils.esc(v.desc) + '</div></div></div>';
    }).join('') : '<div class="empty" style="grid-column:1/-1"><span class="empty-icon">🎬</span><p>' +
      (activeSubject !== 'all' ? 'لا توجد فيديوهات لهذه المادة' : 'لا توجد فيديوهات بعد.' + (isAdmin ? ' أضف أول فيديو باستخدام الزر أعلاه.' : '')) + '</p></div>';
    var html = '<div class="sec-header"><div class="sec-icon">🎬</div><h2>شرح بالفيديو</h2><span class="sec-count">' + videos.length + ' / ' + allVideos.length + '</span></div>' +
      adminBarHtml + dropdownHtml +
      '<div class="content-layout">' + sidebarHtml +
      '<div class="content-main"><div class="video-grid">' + cards + '</div></div></div>';
    var page = document.getElementById('page');
    if (page) page.innerHTML = html;
    // Bind subject filtering
    bindSubjectEvents(renderVideos);
    bindAdminBarEvents('m-video');
    page.querySelectorAll('.vid-card[data-video-idx]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.vid-del') || e.target.closest('.lesson-chat-btn')) return;
        var idx = parseInt(card.getAttribute('data-video-idx'), 10);
        var v = allVideos[idx];
        if (v) openVideo(v);
      });
    });
    // Inject lesson-chat buttons on each video card
    page.querySelectorAll('.vid-card[data-video-idx]').forEach(function (card) {
      var idx = parseInt(card.getAttribute('data-video-idx'), 10);
      var v = allVideos[idx];
      if (!v) return;
      var vid = v.id || idx;
      var level = (App.getCurrentLevel && App.getCurrentLevel()) || 'level';
      var threadId = 'lesson:' + level + '_' + vid;
      var titleEl = card.querySelector('.vid-title');
      var displayName = (titleEl ? titleEl.textContent : 'فيديو');
      var infoEl = card.querySelector('.vid-info');
      if (infoEl) appendLessonChatBtn(infoEl, threadId, displayName);
    });
    // Subject chat buttons in sidebar / subject area
    page.querySelectorAll('.subject-item[data-subject]').forEach(function (el) {
      var subjectId = el.getAttribute('data-subject');
      if (!subjectId || subjectId === 'all') return;
      var level = (App.getCurrentLevel && App.getCurrentLevel()) || 'level';
      var threadId = 'subj:' + level + '_' + subjectId;
      var label = el.textContent.trim();
      var chatSpan = document.createElement('span');
      chatSpan.title = 'دردشة المادة: ' + label;
      chatSpan.style.cssText = 'margin-right:4px;cursor:pointer;font-size:13px;opacity:0.7';
      chatSpan.textContent = '💬';
      chatSpan.addEventListener('click', function (e) {
        e.stopPropagation();
        openLessonChat(threadId, 'دردشة ' + label);
      });
      el.appendChild(chatSpan);
    });
    page.querySelectorAll('.vid-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var i = parseInt(btn.getAttribute('data-video-index'), 10);
        if (!confirm('هل تريد حذف هذا الفيديو نهائيًا؟')) return;
        var v = App.getVideos();
        v.splice(i, 1);
        App.setVideos(v);
        Modals.toast('تم حذف الفيديو', 'inf');
        App.render();
      });
    });
  }

  function renderPDFs() {
    var list = App.getPdfList();
    renderDocList(list, 'pdf', 'pdf', 'تحميل PDF', list.length, 'لا توجد ملفات PDF بعد.', 'm-pdf', '📤 رفع ملف PDF', function (i) {
      if (!confirm('هل تريد حذف هذا الملف؟')) return;
      var item = list[i];
      if (item && item.id) Storage.deleteBlob(item.id).catch(function () {});
      list.splice(i, 1);
      App.setPdfList(list);
      Modals.toast('تم الحذف', 'inf');
      App.render();
    });
  }

  function renderExercises() {
    var list = App.getExercisesList();
    renderDocList(list, 'ex', 'ex', 'سلاسل التمارين', list.length, 'لا توجد سلاسل بعد.', 'm-ex', '➕ إضافة سلسلة', function (i) {
      if (!confirm('هل تريد حذف هذه السلسلة؟')) return;
      var item = list[i];
      if (item && item.id) Storage.deleteBlob(item.id).catch(function () {});
      list.splice(i, 1);
      App.setExercisesList(list);
      Modals.toast('تم الحذف', 'inf');
      App.render();
    });
  }

  function renderTests() {
    var list = App.getTestsList();
    renderDocList(list, 'test', 'test', 'الامتحانات التجريبية', list.length, 'لا توجد امتحانات بعد.', 'm-test', '➕ إضافة امتحان', function (i) {
      if (!confirm('هل تريد حذف هذا الامتحان؟')) return;
      var item = list[i];
      if (item && item.id) Storage.deleteBlob(item.id).catch(function () {});
      list.splice(i, 1);
      App.setTestsList(list);
      Modals.toast('تم الحذف', 'inf');
      App.render();
    });
  }

  function submitVideo() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var urlEl = document.getElementById('f-vurl');
    var titleEl = document.getElementById('f-vtitle');
    var descEl = document.getElementById('f-vdesc');
    var subjEl = document.getElementById('f-vsubject');
    var url = urlEl && urlEl.value ? urlEl.value.trim() : '';
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    var subject = subjEl && subjEl.value ? subjEl.value : '';
    if (!url || !title) { Modals.toast('❌ الرجاء تعبئة الحقول المطلوبة', 'err'); return; }
    var info = detectVideoType(url);
    var videoEntry = { title: title, desc: desc || 'درس تعليمي', subject: subject, url: url };
    if (info.type === 'youtube') videoEntry.id = info.id;
    var videos = App.getVideos();
    videos.unshift(videoEntry);
    App.setVideos(videos);
    if (urlEl) urlEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-video');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تم إضافة الفيديو بنجاح!', 'ok');
    App.render();
  }

  function makeId(prefix) {
    var level = (window.App && window.App.getCurrentLevel) ? window.App.getCurrentLevel() : '';
    return (level ? level + '_' : '') + prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function submitPDF() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-pfile');
    var titleEl = document.getElementById('f-ptitle');
    var descEl = document.getElementById('f-pdesc');
    var subjEl = document.getElementById('f-psubject');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    var subject = subjEl && subjEl.value ? subjEl.value : '';
    if (!title) { Modals.toast('❌ أدخل عنوان الملف', 'err'); return; }
    if (!file) {
      var list = App.getPdfList();
      list.unshift({ id: null, title: title, desc: desc || 'ملف درس', subject: subject });
      App.setPdfList(list);
    } else {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        Modals.toast('❌ يجب أن يكون الملف من نوع PDF', 'err');
        return;
      }
      if (file.size > MAX_PDF_MB * 1024 * 1024) {
        Modals.toast('❌ حجم الملف يتجاوز ' + MAX_PDF_MB + ' ميجابايت', 'err');
        return;
      }
      var id = makeId('pdf');
      Storage.putBlob(id, file).then(function () {
        var list = App.getPdfList();
        list.unshift({ id: id, title: title, desc: desc || 'ملف درس', subject: subject });
        App.setPdfList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        Modals.close('m-pdf');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم رفع "' + title + '" بنجاح!', 'ok');
        App.render();
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
      return;
    }
    if (fileEl) fileEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-pdf');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تمت الإضافة بنجاح!', 'ok');
    App.render();
  }

  function submitExercise() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-exfile');
    var titleEl = document.getElementById('f-extitle');
    var descEl = document.getElementById('f-exdesc');
    var subjEl = document.getElementById('f-exsubject');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    var subject = subjEl && subjEl.value ? subjEl.value : '';
    if (!title) { Modals.toast('❌ أدخل عنوان السلسلة', 'err'); return; }
    if (!file) {
      var list = App.getExercisesList();
      list.unshift({ id: null, title: title, desc: desc || 'سلسلة تمارين', subject: subject });
      App.setExercisesList(list);
    } else {
      var id = makeId('ex');
      Storage.putBlob(id, file).then(function () {
        var list = App.getExercisesList();
        list.unshift({ id: id, title: title, desc: desc || 'سلسلة تمارين', subject: subject });
        App.setExercisesList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        Modals.close('m-ex');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم إضافة السلسلة بنجاح!', 'ok');
        App.render();
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
      return;
    }
    if (fileEl) fileEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-ex');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تم إضافة السلسلة بنجاح!', 'ok');
    App.render();
  }

  function submitTest() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-testfile');
    var titleEl = document.getElementById('f-testtitle');
    var descEl = document.getElementById('f-testdesc');
    var subjEl = document.getElementById('f-testsubject');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    var subject = subjEl && subjEl.value ? subjEl.value : '';
    if (!title) { Modals.toast('❌ أدخل عنوان الامتحان', 'err'); return; }
    if (!file) {
      var list = App.getTestsList();
      list.unshift({ id: null, title: title, desc: desc || 'امتحان تجريبي', subject: subject });
      App.setTestsList(list);
    } else {
      var id = makeId('test');
      Storage.putBlob(id, file).then(function () {
        var list = App.getTestsList();
        list.unshift({ id: id, title: title, desc: desc || 'امتحان تجريبي', subject: subject });
        App.setTestsList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        Modals.close('m-test');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم إضافة الامتحان بنجاح!', 'ok');
        App.render();
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
      return;
    }
    if (fileEl) fileEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-test');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تم إضافة الامتحان بنجاح!', 'ok');
    App.render();
  }

  function render(section) {
    // Reset subject filter when navigating to a new section
    activeSubject = 'all';
    if (section === 'home') renderHome();
    else if (section === 'video') renderVideos();
    else if (section === 'pdf') renderPDFs();
    else if (section === 'exercises') renderExercises();
    else if (section === 'tests') renderTests();
    else if (section === 'distribution') renderDistribution();
  }

  /* ── Inline Lesson/Subject Chat ─────────────────────────────────────
   * Opens the global chat widget pre-selected to a lesson or subject
   * thread.  Thread key: 'subj:<id>' or 'lesson:<level>_<docId>'
   * Called from lesson cards and video cards in the rendered HTML.
   * ─────────────────────────────────────────────────────────────────── */
  function openLessonChat(threadId, displayName) {
    if (!window.Chat) return;
    if (!window.Chat.hasChatUser()) {
      if (window.Modals) window.Modals.open('m-chat-username');
      return;
    }
    var me = window.Chat.getChatUser();
    // Ensure thread exists in convos
    window.Chat.initRoom(threadId); // initRoom only creates for user threads; we handle special keys here
    try {
      var raw = localStorage.getItem(window.APP_CONFIG.STORAGE_KEYS.CHAT_CONVOS);
      var convos = raw ? JSON.parse(raw) : {};
      if (!convos[threadId]) {
        convos[threadId] = [];
        localStorage.setItem(window.APP_CONFIG.STORAGE_KEYS.CHAT_CONVOS, JSON.stringify(convos));
      }
    } catch (e) {}
    // Open chat and select the thread
    window.Chat.openWith({ id: threadId, nickname: displayName, online: true });
  }

  /* ── Inject "💬 دردشة الدرس" button on each doc/video card ───────── */
  function appendLessonChatBtn(container, threadId, displayName) {
    if (!container) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm lesson-chat-btn';
    btn.innerHTML = '💬 دردشة الدرس';
    btn.title = 'فتح دردشة ' + displayName;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openLessonChat(threadId, displayName);
    });
    container.appendChild(btn);
  }

  /* ── Distribution Section ──────────────────────────────────────────
   * Admin-only uploads: PDF, Word, PPT, Video, images — any file.
   * Each post has: file, title, short description, optional thumbnail.
   * Cards show truncated desc; click opens a detail overlay with
   * full description, file preview/download, and smooth animation.
   * ─────────────────────────────────────────────────────────────────── */
  var DIST_MAX_MB = 50;
  var DIST_ALLOWED_EXT = /\.(pdf|docx?|pptx?|xlsx?|mp4|mov|webm|avi|mkv|png|jpe?g|gif|webp|svg|zip|rar)$/i;

  function fileIcon(name) {
    if (!name) return '📄';
    var n = name.toLowerCase();
    if (/\.pdf$/.test(n)) return '📕';
    if (/\.docx?$/.test(n)) return '📘';
    if (/\.pptx?$/.test(n)) return '📙';
    if (/\.xlsx?$/.test(n)) return '📗';
    if (/\.(mp4|mov|webm|avi|mkv)$/.test(n)) return '🎬';
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(n)) return '🖼️';
    if (/\.(zip|rar)$/.test(n)) return '📦';
    return '📄';
  }

  function truncate(text, maxLen) {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen) + '…';
  }

  function renderDistribution() {
    var allItems = App.getDistributionList();
    var isAdmin = Auth.getIsAdmin();
    var adminBarHtml = adminBar('➕ إضافة منشور جديد', null, 'm-dist');
    var cardsHtml;
    if (!allItems || allItems.length === 0) {
      cardsHtml = '<div class="empty"><span class="empty-icon">📂</span><p>لا توجد منشورات بعد.' +
        (isAdmin ? ' أضف أول منشور باستخدام الزر أعلاه.' : '') + '</p></div>';
    } else {
      cardsHtml = '<div class="dist-grid">' + allItems.map(function (item, idx) {
        var icon = fileIcon(item.fileName);
        var shortDesc = truncate(item.desc, 80);
        var thumbHtml = '';
        if (item.thumbData) {
          thumbHtml = '<div class="dist-thumb"><img src="' + item.thumbData + '" alt="" loading="lazy"></div>';
        } else {
          thumbHtml = '<div class="dist-thumb dist-thumb-icon"><span>' + icon + '</span></div>';
        }
        return '<div class="dist-card" data-dist-idx="' + idx + '">' +
          thumbHtml +
          '<div class="dist-body">' +
          '<h4 class="dist-title">' + Utils.esc(item.title) + '</h4>' +
          '<p class="dist-desc-short">' + Utils.esc(shortDesc) + '</p>' +
          '<div class="dist-meta">' +
          '<span class="dist-file-badge">' + icon + ' ' + Utils.esc(item.fileName || 'بدون ملف') + '</span>' +
          '<span class="dist-date">' + Utils.esc(item.date || '') + '</span>' +
          '</div>' +
          '</div>' +
          (isAdmin ? '<button class="dist-del" type="button" data-dist-index="' + idx + '" title="حذف">🗑</button>' : '') +
          '</div>';
      }).join('') + '</div>';
    }
    var html = '<div class="sec-header"><div class="sec-icon">📋</div><h2>التوجيه المدرسي</h2>' +
      '<span class="sec-count">' + allItems.length + ' منشور</span></div>' +
      adminBarHtml + cardsHtml;
    var page = document.getElementById('page');
    if (!page) return;
    page.innerHTML = html;
    bindAdminBarEvents('m-dist');
    // Card click → detail overlay
    page.querySelectorAll('.dist-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.dist-del')) return;
        var idx = parseInt(card.getAttribute('data-dist-idx'), 10);
        var item = allItems[idx];
        if (item) openDistDetail(item);
      });
    });
    // Delete buttons
    page.querySelectorAll('.dist-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-dist-index'), 10);
        if (!confirm('هل تريد حذف هذا المنشور نهائيًا؟')) return;
        var list = App.getDistributionList();
        var item = list[idx];
        if (item && item.fileId) Storage.deleteBlob(item.fileId).catch(function () {});
        list.splice(idx, 1);
        App.setDistributionList(list);
        Modals.toast('تم الحذف', 'inf');
        App.render();
      });
    });
  }

  function openDistDetail(item) {
    // Remove existing overlay if any
    var existing = document.getElementById('dist-detail-overlay');
    if (existing) existing.remove();
    var icon = fileIcon(item.fileName);
    var previewHtml = '';
    if (item.thumbData) {
      previewHtml = '<div class="dist-detail-preview"><img src="' + item.thumbData + '" alt=""></div>';
    }
    var fileActions = '';
    if (item.fileId) {
      fileActions = '<div class="dist-detail-actions">' +
        '<button class="btn btn-primary" type="button" id="dist-detail-open">' + icon + ' فتح الملف</button>' +
        '<button class="btn btn-ghost" type="button" id="dist-detail-download">⬇ تحميل</button>' +
        '</div>';
    }
    var overlay = document.createElement('div');
    overlay.id = 'dist-detail-overlay';
    overlay.className = 'dist-detail-overlay';
    overlay.innerHTML =
      '<div class="dist-detail-backdrop"></div>' +
      '<div class="dist-detail-modal">' +
      '<button class="dist-detail-close" type="button" aria-label="إغلاق">✕</button>' +
      previewHtml +
      '<div class="dist-detail-content">' +
      '<h2>' + Utils.esc(item.title) + '</h2>' +
      '<div class="dist-detail-meta">' +
      '<span>' + icon + ' ' + Utils.esc(item.fileName || 'بدون ملف') + '</span>' +
      (item.date ? '<span>📅 ' + Utils.esc(item.date) + '</span>' : '') +
      '</div>' +
      '<div class="dist-detail-desc">' + Utils.esc(item.desc || 'لا يوجد وصف').replace(/\n/g, '<br>') + '</div>' +
      fileActions +
      '</div></div>';
    document.body.appendChild(overlay);
    // Animate in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('open');
      });
    });
    // Close handlers
    var closeOverlay = function () {
      overlay.classList.remove('open');
      overlay.addEventListener('transitionend', function () { overlay.remove(); });
      setTimeout(function () { overlay.remove(); }, 400);
    };
    overlay.querySelector('.dist-detail-backdrop').addEventListener('click', closeOverlay);
    overlay.querySelector('.dist-detail-close').addEventListener('click', closeOverlay);
    // File actions
    var openBtn = document.getElementById('dist-detail-open');
    if (openBtn) openBtn.addEventListener('click', function () {
      docDownloadUrl(item.fileId, item.title || item.fileName, true);
    });
    var dlBtn = document.getElementById('dist-detail-download');
    if (dlBtn) dlBtn.addEventListener('click', function () {
      docDownloadUrl(item.fileId, item.title || item.fileName, false);
    });
  }

  function submitDistribution() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-distfile');
    var titleEl = document.getElementById('f-disttitle');
    var descEl = document.getElementById('f-distdesc');
    var thumbEl = document.getElementById('f-distthumb');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    if (!title) { Modals.toast('❌ أدخل عنوان المنشور', 'err'); return; }
    var thumbFile = thumbEl && thumbEl.files && thumbEl.files[0];
    var processThumb = function (callback) {
      if (!thumbFile) { callback(null); return; }
      if (thumbFile.size > 2 * 1024 * 1024) { Modals.toast('❌ حجم الصورة المصغرة يتجاوز 2 ميغا', 'err'); return; }
      var reader = new FileReader();
      reader.onload = function () { callback(reader.result); };
      reader.onerror = function () { callback(null); };
      reader.readAsDataURL(thumbFile);
    };
    processThumb(function (thumbData) {
      var dateStr = new Date().toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });
      var saveEntry = function (fileId, fileName) {
        var entry = {
          fileId: fileId,
          fileName: fileName || '',
          title: title,
          desc: desc || '',
          thumbData: thumbData,
          date: dateStr
        };
        var list = App.getDistributionList();
        list.unshift(entry);
        App.setDistributionList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        if (thumbEl) thumbEl.value = '';
        Modals.close('m-dist');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم إضافة المنشور بنجاح!', 'ok');
        App.render();
      };
      if (!file) {
        saveEntry(null, '');
        return;
      }
      if (file.size > DIST_MAX_MB * 1024 * 1024) {
        Modals.toast('❌ حجم الملف يتجاوز ' + DIST_MAX_MB + ' ميغا', 'err');
        return;
      }
      var id = makeId('dist');
      Storage.putBlob(id, file).then(function () {
        saveEntry(id, file.name);
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
    });
  }

  window.Pages = {
    render: render,
    submitVideo: submitVideo,
    submitPDF: submitPDF,
    submitExercise: submitExercise,
    submitTest: submitTest,
    submitDistribution: submitDistribution,
    getSubjects: getSubjects,
    resetSubjectFilter: function () { activeSubject = 'all'; },
    openLessonChat: openLessonChat
  };
})();
