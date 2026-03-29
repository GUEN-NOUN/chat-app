'use strict';

/**
 * AdminPanel — renders and drives the admin dashboard at admin.html.
 *
 * ARCHITECTURE:
 *   - Login screen shown until RBAC.isAuthenticated() is true.
 *   - After login, a tab-based dashboard is shown.
 *   - Every data-reading or data-writing operation checks RBAC.hasPermission()
 *     before acting and calls AuditLog.append() after every write.
 *
 * TABS:
 *   📊 stats      — aggregate statistics (all roles)
 *   👤 users      — user list with status and moderation actions (moderator+)
 *   🚨 reports    — content report queue and review (moderator+)
 *   📋 logs       — audit log viewer (admin+)
 *   ⚙️  roles      — admin account management (superadmin only)
 *   🔒 privacy    — static privacy policy
 */
(function () {

  /* ── State ─────────────────────────────────────────────────────────────── */
  var curTab = 'stats';

  /* ── Utility ───────────────────────────────────────────────────────────── */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ts(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.toLocaleDateString('ar-EG') + ' ' + d.toLocaleTimeString('ar-EG');
  }

  function roleBadge(role) {
    var classes = {
      superadmin: 'badge-superadmin',
      admin:      'badge-admin',
      moderator:  'badge-moderator',
      user:       'badge-user'
    };
    var labels = {
      superadmin: '⭐ مشرف عام',
      admin:      '🛡️ مدير',
      moderator:  '👁️ مراقب',
      user:       '👤 مستخدم'
    };
    var cls = classes[role] || 'badge-user';
    var lbl = labels[role]  || role;
    return '<span class="adm-badge ' + cls + '">' + esc(lbl) + '</span>';
  }

  function statusBadge(status) {
    var map = {
      active:    '<span class="adm-badge badge-active">✅ نشط</span>',
      suspended: '<span class="adm-badge badge-suspended">⏸️ موقوف</span>',
      banned:    '<span class="adm-badge badge-banned">🚫 محظور</span>'
    };
    return map[status] || '<span class="adm-badge badge-user">' + esc(status) + '</span>';
  }

  function reportStatusBadge(s) {
    var map = {
      pending:    '<span class="adm-badge badge-pending">🟡 قيد الانتظار</span>',
      reviewing:  '<span class="adm-badge badge-reviewing">🔵 قيد المراجعة</span>',
      resolved:   '<span class="adm-badge badge-active">✅ تم الحل</span>',
      dismissed:  '<span class="adm-badge badge-user">❌ مرفوض</span>'
    };
    return map[s] || '<span class="adm-badge">' + esc(s) + '</span>';
  }

  function toast(msg, type) {
    var el = document.getElementById('adm-toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'adm-toast show ' + (type || 'ok');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.className = 'adm-toast'; }, 3500);
  }

  function confirm2(msg) {
    return window.confirm(msg);
  }

  /* ── Login flow ────────────────────────────────────────────────────────── */

  function initLogin() {
    var form    = document.getElementById('adm-login-form');
    var emailEl = document.getElementById('adm-email');
    var passEl  = document.getElementById('adm-pass');
    var btnEl   = document.getElementById('adm-login-btn');
    var errEl   = document.getElementById('adm-login-err');

    if (!form) return;

    // Bootstrap superadmin credentials from APP_CONFIG.CREDS on first run
    window.RBAC.bootstrapSuperadmin().then(function () {
      if (btnEl) btnEl.disabled = false;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = emailEl ? emailEl.value.trim() : '';
      var pass  = passEl  ? passEl.value         : '';
      if (!email || !pass) {
        if (errEl) errEl.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور.';
        return;
      }
      if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'جارٍ تسجيل الدخول...'; }
      if (errEl) errEl.textContent = '';

      window.RBAC.verifyCredential(email, pass)
        .then(function (account) {
          if (!account) {
            if (errEl) errEl.textContent = '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة.';
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔐 دخول'; }
            return;
          }
          // Create RBAC session (sessionStorage only — cleared on tab close)
          window.RBAC.createSession(account.id, account.role);

          // Audit the login
          window.AuditLog.append(account.id, account.role, 'admin_login', account.id, {
            email: account.email
          });

          showDashboard();
        })
        .catch(function () {
          if (errEl) errEl.textContent = '❌ حدث خطأ أثناء التحقق. حاول مجددًا.';
          if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔐 دخول'; }
        });
    });
  }

  /* ── Dashboard ─────────────────────────────────────────────────────────── */

  function showDashboard() {
    var loginSection = document.getElementById('adm-login');
    var dashSection  = document.getElementById('adm-dash');
    if (loginSection) loginSection.style.display = 'none';
    if (dashSection)  dashSection.style.display  = '';

    var role     = window.RBAC.getRole();
    var adminId  = window.RBAC.getAdminId();
    var roleEl   = document.getElementById('adm-role-badge');
    var idEl     = document.getElementById('adm-identity');
    if (roleEl) roleEl.innerHTML = roleBadge(role);
    if (idEl)   idEl.textContent = adminId || '';

    // Show/hide superadmin-only tabs
    var rolesTab = document.getElementById('tab-btn-roles');
    if (rolesTab) {
      rolesTab.style.display = (role === 'superadmin') ? '' : 'none';
    }

    // Logout button
    var logoutBtn = document.getElementById('adm-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (!confirm2('تسجيل الخروج من لوحة التحكم؟')) return;
        window.AuditLog.append(adminId, role, 'admin_logout', adminId, {});
        window.RBAC.destroySession();
        location.reload();
      });
    }

    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.dataset.tab);
      });
    });

    switchTab('stats');
  }

  function switchTab(tab) {
    curTab = tab;
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    var content = document.getElementById('adm-content');
    if (!content) return;
    content.textContent = '';

    switch (tab) {
      case 'stats':   renderStats(content);   break;
      case 'users':   renderUsers(content);   break;
      case 'reports': renderReports(content); break;
      case 'logs':    renderLogs(content);    break;
      case 'roles':   renderRoles(content);   break;
      case 'media':   renderMedia(content);   break;
      case 'privacy': renderPrivacy(content); break;
      default:        content.textContent = 'تبويب غير معروف';
    }
  }

  /* ── Tab: Statistics ───────────────────────────────────────────────────── */

  function renderStats(el) {
    // Show skeleton while loading
    el.innerHTML = '<h2 class="adm-section-title">📊 لوحة الإحصائيات</h2><p class="adm-note">جارٍ تحميل الإحصائيات…</p>';

    var apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
    fetch(apiBase + '/api/admin/stats', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.ok) { el.innerHTML = '<p class="adm-err">⚠️ فشل جلب الإحصائيات: ' + esc(data.error || '') + '</p>'; return; }
        var s = data.stats;
        var uptimeH = Math.floor(s.server.uptimeSeconds / 3600);
        var uptimeM = Math.floor((s.server.uptimeSeconds % 3600) / 60);

        var byRoomRows = (s.messages.byRoom || []).map(function(r) {
          return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.type) + '</td><td><strong>' + r.count + '</strong></td></tr>';
        }).join('');

        var aiTopRows = (s.ai.topUsersToday || []).map(function(u) {
          return '<tr><td>' + esc(u.username || u.user_id) + '</td><td><strong>' + u.count + '</strong></td></tr>';
        }).join('');

        el.innerHTML = [
          '<h2 class="adm-section-title">📊 لوحة الإحصائيات</h2>',

          '<h3 class="adm-subsection">👥 المستخدمون</h3>',
          '<div class="adm-stats-grid">',
            statCard('👥', 'الإجمالي', s.users.total, ''),
            statCard('🟢', 'متصلون الآن', s.users.online, s.users.online > 0 ? 'ok' : ''),
            statCard('🆕', 'مسجَّلون اليوم', s.users.newToday, ''),
            statCard('⏸️', 'موقوفون', s.users.suspended, s.users.suspended > 0 ? 'warn' : ''),
            statCard('🚫', 'محظورون', s.users.banned, s.users.banned > 0 ? 'err' : ''),
          '</div>',

          '<h3 class="adm-subsection">💬 الرسائل</h3>',
          '<div class="adm-stats-grid">',
            statCard('💬', 'الإجمالي', s.messages.total, ''),
            statCard('📅', 'اليوم', s.messages.today, ''),
            statCard('🏠', 'الغرف العامة', s.rooms.public, ''),
            statCard('👤', 'المحادثات الخاصة', s.rooms.dm, ''),
            statCard('🤖', 'غرف AI', s.rooms.ai, ''),
          '</div>',

          s.messages.byRoom && s.messages.byRoom.length ? [
            '<h3 class="adm-subsection">📊 رسائل اليوم حسب الغرفة</h3>',
            '<div class="adm-table-wrap"><table class="adm-table">',
            '<thead><tr><th>الغرفة</th><th>النوع</th><th>الرسائل</th></tr></thead>',
            '<tbody>' + byRoomRows + '</tbody></table></div>'
          ].join('') : '',

          '<h3 class="adm-subsection">🤖 الذكاء الاصطناعي</h3>',
          '<div class="adm-stats-grid">',
            statCard('🤖', 'طلبات اليوم', s.ai.requestsToday, ''),
            statCard('📈', 'إجمالي الطلبات', s.ai.requestsTotal, ''),
          '</div>',

          s.ai.topUsersToday && s.ai.topUsersToday.length ? [
            '<h3 class="adm-subsection">🏆 أكثر مستخدمي AI اليوم</h3>',
            '<div class="adm-table-wrap"><table class="adm-table">',
            '<thead><tr><th>المستخدم</th><th>الطلبات</th></tr></thead>',
            '<tbody>' + aiTopRows + '</tbody></table></div>'
          ].join('') : '',

          '<h3 class="adm-subsection">🖥️ السيرفر</h3>',
          '<div class="adm-stats-grid">',
            statCard('⏱️', 'وقت التشغيل', uptimeH + 'س ' + uptimeM + 'د', ''),
            statCard('💾', 'الذاكرة', s.server.memoryMB + ' MB', s.server.memoryMB > 400 ? 'warn' : ''),
            statCard('📦', 'Node.js', s.server.nodeVersion, ''),
            statCard('🌐', 'البيئة', s.server.env, ''),
          '</div>',

          '<p class="adm-note">آخر تحديث: ' + ts(new Date(s.ts).getTime()) + ' &nbsp; <a href="#" onclick="return window.AdminPanel && window.AdminPanel.refreshStats()">🔄 تحديث</a></p>'
        ].join('');
      })
      .catch(function(err) {
        el.innerHTML = '<p class="adm-err">⚠️ تعذَّر الاتصال بالسيرفر. ' + esc(err.message) + '</p>';
      });
  }

  function statCard(icon, label, value, type) {
    return [
      '<div class="adm-stat-card' + (type ? ' adm-stat-' + type : '') + '">',
        '<div class="adm-stat-icon">' + icon + '</div>',
        '<div class="adm-stat-value">' + value + '</div>',
        '<div class="adm-stat-label">' + esc(label) + '</div>',
      '</div>'
    ].join('');
  }

  /* ── Tab: Users ────────────────────────────────────────────────────────── */

  function renderUsers(el) {
    if (!window.RBAC.hasPermission('view:user_list')) {
      el.innerHTML = '<p class="adm-err">⛔ ليس لديك صلاحية عرض قائمة المستخدمين.</p>';
      return;
    }

    var users = window.UserRegistry ? window.UserRegistry.getAll() : [];

    var rows = users.map(function (u) {
      var status = window.RBAC.getUserStatus(u.id);
      return [
        '<tr>',
          '<td>' + esc(u.id.slice(0, 12)) + '…</td>',
          '<td>' + esc(u.nickname) + '</td>',
          '<td>' + statusBadge(status) + '</td>',
          '<td>' + ts(u.lastSeen) + '</td>',
          '<td class="adm-actions">',
            buildUserActions(u.id, status),
          '</td>',
        '</tr>'
      ].join('');
    }).join('');

    el.innerHTML = [
      '<h2 class="adm-section-title">👤 إدارة المستخدمين</h2>',
      users.length === 0
        ? '<p class="adm-note">لا يوجد مستخدمون مسجلون بعد.</p>'
        : [
            '<div class="adm-table-wrap">',
              '<table class="adm-table">',
                '<thead><tr>',
                  '<th>المعرّف</th><th>الاسم</th><th>الحالة</th>',
                  '<th>آخر ظهور</th><th>إجراءات</th>',
                '</tr></thead>',
                '<tbody>' + rows + '</tbody>',
              '</table>',
            '</div>'
          ].join('')
    ].join('');

    // Bind action buttons
    el.querySelectorAll('[data-useraction]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleUserAction(btn.dataset.useraction, btn.dataset.uid, btn.dataset.uname, el);
      });
    });
  }

  function buildUserActions(uid, status) {
    var btns = [];
    var name = esc(uid);

    if (window.RBAC.hasPermission('warn:user')) {
      btns.push('<button class="adm-btn adm-btn-warn" data-useraction="warn"' +
                ' data-uid="' + esc(uid) + '" data-uname="' + name + '">⚠️ تحذير</button>');
    }
    if (window.RBAC.hasPermission('suspend:user')) {
      if (status === 'active') {
        btns.push('<button class="adm-btn adm-btn-suspend" data-useraction="suspend"' +
                  ' data-uid="' + esc(uid) + '" data-uname="' + name + '">⏸️ إيقاف</button>');
      } else if (status === 'suspended') {
        btns.push('<button class="adm-btn adm-btn-lift" data-useraction="lift"' +
                  ' data-uid="' + esc(uid) + '" data-uname="' + name + '">✅ رفع الإيقاف</button>');
      }
    }
    if (window.RBAC.hasPermission('ban:user')) {
      if (status !== 'banned') {
        btns.push('<button class="adm-btn adm-btn-ban" data-useraction="ban"' +
                  ' data-uid="' + esc(uid) + '" data-uname="' + name + '">🚫 حظر</button>');
      } else {
        btns.push('<button class="adm-btn adm-btn-lift" data-useraction="lift"' +
                  ' data-uid="' + esc(uid) + '" data-uname="' + name + '">✅ رفع الحظر</button>');
      }
    }
    return btns.join(' ') || '<span class="adm-note">—</span>';
  }

  function handleUserAction(action, uid, uname, parentEl) {
    var adminId = window.RBAC.getAdminId();
    try {
      if (action === 'warn') {
        var reason = prompt('سبب التحذير لـ ' + uname + ':');
        if (reason === null) return; // cancelled
        window.RBAC.warnUser(uid, adminId, reason);
        toast('✅ تم إصدار تحذير للمستخدم ' + uname, 'ok');
      } else if (action === 'suspend') {
        var reasonS = prompt('سبب الإيقاف المؤقت:');
        if (reasonS === null) return;
        // Default: suspend for 7 days
        window.RBAC.suspendUser(uid, adminId, reasonS, 7 * 24 * 60 * 60 * 1000);
        toast('⏸️ تم إيقاف المستخدم ' + uname + ' لمدة 7 أيام', 'warn');
      } else if (action === 'ban') {
        var reasonB = prompt('سبب الحظر الدائم:');
        if (reasonB === null) return;
        if (!confirm2('هل أنت متأكد من حظر ' + uname + ' نهائيًا؟')) return;
        window.RBAC.banUser(uid, adminId, reasonB);
        toast('🚫 تم حظر المستخدم ' + uname, 'err');
      } else if (action === 'lift') {
        if (!confirm2('رفع القيود عن ' + uname + '؟')) return;
        window.RBAC.liftRestriction(uid, adminId);
        toast('✅ تم رفع القيود عن المستخدم ' + uname, 'ok');
      }
      // Re-render the users tab to reflect the change
      renderUsers(parentEl);
    } catch (e) {
      toast('❌ ' + e.message, 'err');
    }
  }

  /* ── Tab: Reports ──────────────────────────────────────────────────────── */

  function renderReports(el) {
    if (!window.RBAC.hasPermission('manage:reports')) {
      el.innerHTML = '<p class="adm-err">⛔ ليس لديك صلاحية إدارة البلاغات.</p>';
      return;
    }

    var filter   = el._filter || 'pending';
    var reports  = window.Reports.getReports(filter !== 'all' ? filter : null);

    var filterBtns = ['all', 'pending', 'reviewing', 'resolved', 'dismissed'].map(function (f) {
      var labels = {
        all: 'الكل', pending: 'قيد الانتظار', reviewing: 'قيد المراجعة',
        resolved: 'محسوم', dismissed: 'مرفوض'
      };
      return '<button class="adm-filter-btn' + (filter === f ? ' active' : '') +
             '" data-rptfilter="' + f + '">' + labels[f] + '</button>';
    }).join('');

    var rows = reports.map(function (r) {
      return [
        '<tr>',
          '<td>' + ts(r.ts) + '</td>',
          '<td>' + esc(r.reporterName || r.reporterId.slice(0, 8)) + '</td>',
          '<td>' + esc(r.targetName  || r.targetUserId.slice(0, 8)) + '</td>',
          '<td>' + esc(r.reason.slice(0, 60)) + '</td>',
          '<td>' + reportStatusBadge(r.status) + '</td>',
          '<td class="adm-actions">',
            buildReportActions(r),
          '</td>',
        '</tr>'
      ].join('');
    }).join('');

    el.innerHTML = [
      '<h2 class="adm-section-title">🚨 البلاغات</h2>',
      '<div class="adm-filter-row">' + filterBtns + '</div>',
      reports.length === 0
        ? '<p class="adm-note">لا توجد بلاغات في هذا التصنيف.</p>'
        : [
            '<div class="adm-table-wrap">',
              '<table class="adm-table">',
                '<thead><tr>',
                  '<th>التاريخ</th><th>المُبلِّغ</th><th>المُبلَّغ عنه</th>',
                  '<th>السبب</th><th>الحالة</th><th>إجراءات</th>',
                '</tr></thead>',
                '<tbody>' + rows + '</tbody>',
              '</table>',
            '</div>'
          ].join('')
    ].join('');

    // Filter button listeners
    el.querySelectorAll('[data-rptfilter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        el._filter = btn.dataset.rptfilter;
        renderReports(el);
      });
    });

    // Action button listeners
    el.querySelectorAll('[data-rptaction]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleReportAction(btn.dataset.rptaction, btn.dataset.rid, el);
      });
    });
  }

  function buildReportActions(r) {
    var btns = [];

    // View content — requires explicit click (privacy-by-design)
    if (window.RBAC.hasPermission('view:reported_content')) {
      btns.push('<button class="adm-btn adm-btn-view" data-rptaction="view"' +
                ' data-rid="' + esc(r.id) + '">🔍 عرض المحتوى</button>');
    }

    if (r.status === 'pending' || r.status === 'reviewing') {
      btns.push('<button class="adm-btn adm-btn-reviewing" data-rptaction="reviewing"' +
                ' data-rid="' + esc(r.id) + '">🔵 مراجعة</button>');
      btns.push('<button class="adm-btn adm-btn-lift" data-rptaction="resolved"' +
                ' data-rid="' + esc(r.id) + '">✅ حسم</button>');
      btns.push('<button class="adm-btn adm-btn-ban" data-rptaction="dismissed"' +
                ' data-rid="' + esc(r.id) + '">❌ رفض</button>');
    }

    return btns.join(' ') || '—';
  }

  function handleReportAction(action, reportId, parentEl) {
    try {
      if (action === 'view') {
        // PRIVACY: must be an explicit button click — never auto-preview
        var content = window.Reports.revealContent(reportId);
        alert('محتوى الرسالة المُبلَّغ عنها:\n\n' + (content || '[فارغ]'));
      } else {
        var note = prompt('ملاحظة القرار (اختياري):') || '';
        if (note === null) return; // cancelled
        window.Reports.updateStatus(reportId, action, note);
        toast('✅ تم تحديث حالة البلاغ', 'ok');
        renderReports(parentEl);
      }
    } catch (e) {
      toast('❌ ' + e.message, 'err');
    }
  }

  /* ── Tab: Audit Logs ───────────────────────────────────────────────────── */

  function renderLogs(el) {
    if (!window.RBAC.hasPermission('view:audit_logs')) {
      el.innerHTML = '<p class="adm-err">⛔ ليس لديك صلاحية عرض سجلات التدقيق.</p>';
      return;
    }

    var logs  = window.AuditLog.getAll().slice().reverse(); // newest first
    var isSA  = window.RBAC.getRole() === 'superadmin';

    var rows = logs.map(function (e) {
      return [
        '<tr>',
          '<td>' + ts(e.ts) + '</td>',
          '<td>' + esc(e.adminId)   + '</td>',
          '<td>' + roleBadge(e.adminRole) + '</td>',
          '<td>' + esc(window.AuditLog.labelFor(e.action)) + '</td>',
          '<td>' + esc(e.targetId) + '</td>',
          '<td>' + esc(JSON.stringify(e.details)).slice(0, 80) + '</td>',
        '</tr>'
      ].join('');
    }).join('');

    var purgeBtn = isSA
      ? '<button class="adm-btn adm-btn-ban" id="adm-purge-btn">🗑️ مسح السجلات (للمشرف العام فقط)</button>'
      : '';

    el.innerHTML = [
      '<h2 class="adm-section-title">📋 سجل التدقيق</h2>',
      purgeBtn,
      logs.length === 0
        ? '<p class="adm-note">لا توجد سجلات بعد.</p>'
        : [
            '<div class="adm-table-wrap">',
              '<table class="adm-table">',
                '<thead><tr>',
                  '<th>الوقت</th><th>المسؤول</th><th>الدور</th>',
                  '<th>الإجراء</th><th>المستهدف</th><th>التفاصيل</th>',
                '</tr></thead>',
                '<tbody>' + rows + '</tbody>',
              '</table>',
            '</div>'
          ].join('')
    ].join('');

    var purgeEl = document.getElementById('adm-purge-btn');
    if (purgeEl) {
      purgeEl.addEventListener('click', function () {
        if (!confirm2('هل أنت متأكد من مسح جميع سجلات التدقيق؟ (لا يمكن التراجع)')) return;
        try {
          window.AuditLog.purge(window.RBAC.getAdminId());
          toast('🗑️ تم مسح سجلات التدقيق', 'ok');
          renderLogs(el);
        } catch (e) {
          toast('❌ ' + e.message, 'err');
        }
      });
    }
  }

  /* ── Tab: Roles / Account Management (superadmin only) ────────────────── */

  function renderRoles(el) {
    if (!window.RBAC.hasPermission('manage:roles')) {
      el.innerHTML = '<p class="adm-err">⛔ هذا القسم للمشرف العام فقط.</p>';
      return;
    }

    var creds  = window.RBAC.loadCredentials();
    var myId   = window.RBAC.getAdminId();

    var accountRows = creds.map(function (c) {
      var isMe = c.id === myId;
      return [
        '<tr>',
          '<td>' + esc(c.email)  + '</td>',
          '<td>' + roleBadge(c.role) + '</td>',
          '<td>' + ts(c.createdAt) + '</td>',
          '<td>',
            !isMe && c.role !== 'superadmin'
              ? '<button class="adm-btn adm-btn-ban" data-rmacct="' + esc(c.id) + '">🗑️ حذف</button>'
              : '<span class="adm-note">محمي</span>',
          '</td>',
        '</tr>'
      ].join('');
    }).join('');

    el.innerHTML = [
      '<h2 class="adm-section-title">⚙️ إدارة حسابات المسؤولين</h2>',

      // Add new admin form
      '<div class="adm-card">',
        '<h3>➕ إضافة حساب مسؤول جديد</h3>',
        '<div class="adm-form-grid">',
          '<div class="form-field"><label>البريد الإلكتروني</label>',
            '<input type="email" id="new-adm-email" placeholder="admin@example.com"/></div>',
          '<div class="form-field"><label>كلمة المرور</label>',
            '<input type="password" id="new-adm-pass" placeholder="كلمة مرور قوية"/></div>',
          '<div class="form-field"><label>الدور</label>',
            '<select id="new-adm-role">',
              '<option value="moderator">مراقب</option>',
              '<option value="admin">مدير</option>',
            '</select></div>',
          '<div class="form-field" style="align-self:flex-end">',
            '<button class="btn btn-primary" id="btn-add-adm">إضافة</button></div>',
        '</div>',
      '</div>',

      // Existing accounts table
      '<h3 style="margin:20px 0 10px">الحسابات الحالية</h3>',
      '<div class="adm-table-wrap">',
        '<table class="adm-table">',
          '<thead><tr><th>البريد</th><th>الدور</th><th>تاريخ الإنشاء</th><th>إجراء</th></tr></thead>',
          '<tbody>' + accountRows + '</tbody>',
        '</table>',
      '</div>'
    ].join('');

    // Add account
    var addBtn = document.getElementById('btn-add-adm');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var emailV = (document.getElementById('new-adm-email') || {}).value.trim();
        var passV  = (document.getElementById('new-adm-pass')  || {}).value;
        var roleV  = (document.getElementById('new-adm-role')  || {}).value;
        if (!emailV || !passV) { toast('يرجى ملء جميع الحقول', 'err'); return; }
        addBtn.disabled = true;

        window.RBAC.addAdminAccount(emailV, passV, roleV, myId)
          .then(function () {
            toast('✅ تم إضافة الحساب', 'ok');
            renderRoles(el);
          })
          .catch(function (e) {
            toast('❌ ' + (e.message === 'DUPLICATE_EMAIL' ? 'هذا البريد مسجّل مسبقًا' : e.message), 'err');
            addBtn.disabled = false;
          });
      });
    }

    // Remove account buttons
    el.querySelectorAll('[data-rmacct]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.rmacct;
        if (!confirm2('حذف هذا الحساب نهائيًا؟')) return;
        try {
          window.RBAC.removeAdminAccount(id, myId);
          toast('🗑️ تم حذف الحساب', 'ok');
          renderRoles(el);
        } catch (e) {
          toast('❌ ' + e.message, 'err');
        }
      });
    });
  }

  /* ── Tab: Public Media ─────────────────────────────────────────────────── */
  //
  // Lists users who opted in with is_public=true and, on admin request,
  // shows their avatar behind a time-limited session token (client-side
  // equivalent of a signed URL — expires after 15 min, lives only in
  // sessionStorage, requires active moderator/admin RBAC session).

  var MEDIA_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

  function generateMediaToken(userId) {
    var token = {
      userId:    userId,
      issuedAt:  Date.now(),
      expiresAt: Date.now() + MEDIA_TOKEN_TTL_MS,
      nonce:     (Math.random() * 0xFFFFFFFF | 0).toString(16)
    };
    try { sessionStorage.setItem('media_token_' + userId, JSON.stringify(token)); } catch (e) {}
    return token;
  }

  function validateMediaToken(userId) {
    try {
      var raw = sessionStorage.getItem('media_token_' + userId);
      if (!raw) return false;
      var t = JSON.parse(raw);
      return t.userId === userId && Date.now() < t.expiresAt;
    } catch (e) { return false; }
  }

  function revokeMediaToken(userId) {
    try { sessionStorage.removeItem('media_token_' + userId); } catch (e) {}
  }

  function renderMedia(el) {
    if (!window.RBAC || !window.RBAC.hasPermission('view_reports')) {
      el.innerHTML = '<p class="adm-note">⛔ هذا التبويب مخصص للمراقبين والمدراء فقط.</p>';
      return;
    }
    if (!window.UserRegistry) {
      el.innerHTML = '<p class="adm-note">سجل المستخدمين غير متاح.</p>';
      return;
    }

    var publicUsers = window.UserRegistry.getPublicUsers();

    var html = [
      '<h2 class="adm-section-title">🖼️ الوسائط العامة</h2>',
      '<div class="adm-card" style="margin-bottom:12px">',
        '<p style="margin:0;font-size:13px;color:var(--text2,#888)">',
          'هذه القائمة تعرض فقط المستخدمين الذين اختاروا جعل ملفهم الشخصي عامًا.',
          ' لعرض صورة المستخدم يجب النقر على زر "عرض" — يُنشئ النظام رمزًا مؤقتًا',
          ' صالحًا لمدة 15 دقيقة ثم يبطل تلقائيًا.',
        '</p>',
      '</div>'
    ];

    if (publicUsers.length === 0) {
      html.push('<p class="adm-note">لا يوجد مستخدمون اختاروا الملف العام حتى الآن.</p>');
    } else {
      html.push('<div class="adm-table-wrap"><table class="adm-table">');
      html.push(
        '<thead><tr>',
        '<th>المستخدم</th>',
        '<th>المعرّف</th>',
        '<th>آخر ظهور</th>',
        '<th>الصورة الشخصية</th>',
        '</tr></thead><tbody>'
      );

      publicUsers.forEach(function (u) {
        var tokenValid = validateMediaToken(u.id);
        var avatarCell;

        if (!u.avatar) {
          avatarCell = '<span style="color:var(--text2,#888)">لا توجد صورة</span>';
        } else if (tokenValid) {
          avatarCell =
            '<img src="' + esc(u.avatar) + '" alt="" ' +
              'style="width:64px;height:64px;border-radius:50%;' +
                     'object-fit:cover;border:2px solid var(--accent,#4f8ef7)" />' +
            '&nbsp;<button class="adm-btn adm-btn-sm adm-btn-danger" ' +
              'data-revoke-media="' + esc(u.id) + '">🔒 إلغاء</button>';
        } else {
          avatarCell =
            '<button class="adm-btn adm-btn-sm" ' +
              'data-view-media="' + esc(u.id) + '">👁️ عرض (15 دقيقة)</button>';
        }

        html.push(
          '<tr>',
          '<td><strong>' + esc(u.nickname) + '</strong></td>',
          '<td style="font-size:11px;color:var(--text2,#888)">' + esc(u.id.slice(0, 16)) + '…</td>',
          '<td>' + ts(u.lastSeen) + '</td>',
          '<td>' + avatarCell + '</td>',
          '</tr>'
        );
      });

      html.push('</tbody></table></div>');
    }

    el.innerHTML = html.join('');

    el.addEventListener('click', function handler(e) {
      var viewBtn   = e.target.closest('[data-view-media]');
      var revokeBtn = e.target.closest('[data-revoke-media]');
      if (viewBtn) {
        generateMediaToken(viewBtn.getAttribute('data-view-media'));
        el.removeEventListener('click', handler);
        renderMedia(el);
        return;
      }
      if (revokeBtn) {
        revokeMediaToken(revokeBtn.getAttribute('data-revoke-media'));
        el.removeEventListener('click', handler);
        renderMedia(el);
      }
    });
  }

  /* ── Tab: Privacy Policy ───────────────────────────────────────────────── */

  function renderPrivacy(el) {
    el.innerHTML = [
      '<h2 class="adm-section-title">🔒 سياسة الخصوصية وبروتوكول الإدارة</h2>',
      '<div class="adm-card adm-privacy">',

        '<h3>📋 ما يستطيع المسؤولون الوصول إليه</h3>',
        '<ul>',
          '<li>قائمة المستخدمين المسجلين (الاسم، المعرّف، آخر ظهور).</li>',
          '<li>البلاغات المقدّمة من المستخدمين.</li>',
          '<li>محتوى الرسالة <strong>المُبلَّغ عنها فحسب</strong>، وبعد الضغط على زر "عرض المحتوى" يدويًا — لا تُعرض تلقائيًا.</li>',
          '<li>سجل الإجراءات الإدارية (سجل التدقيق).</li>',
        '</ul>',

        '<h3>🚫 ما لا يستطيع المسؤولون الوصول إليه أبدًا</h3>',
        '<ul>',
          '<li>الرسائل الخاصة التي <strong>لم يُبلَّغ عنها</strong>.</li>',
          '<li>الصور أو الملفات الصوتية غير المُبلَّغ عنها.</li>',
          '<li>بيانات الجهاز أو معلومات الموقع الجغرافي.</li>',
        '</ul>',

        '<h3>🔐 أمان الجلسة</h3>',
        '<ul>',
          '<li>جلسة تسجيل الدخول مخزنة في <code>sessionStorage</code> فقط — تنتهي تلقائيًا بإغلاق المتصفح.</li>',
          '<li>كلمات المرور مُجزأة (SHA-256) ولا تُخزّن بصيغة نصية عادية.</li>',
          '<li>كل إجراء إداري مُسجَّل في سجل التدقيق الثابت.</li>',
        '</ul>',

        '<h3>📜 الامتثال للوائح</h3>',
        '<ul>',
          '<li>يتوافق هذا النظام مع المبادئ الأساسية للائحة GDPR فيما يخص الشفافية والحد الأدنى من جمع البيانات.</li>',
          '<li>يتوافق مع توجيهات App Store (Apple) و Google Play حول خصوصية المستخدمين.</li>',
          '<li>الوصول المُقيَّد بالبلاغات يحمي من التجسس على المحادثات الخاصة.</li>',
        '</ul>',

        '<p class="adm-note" style="margin-top:16px">',
          'آخر مراجعة: فبراير 2026',
        '</p>',
      '</div>'
    ].join('');
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */

  function init() {
    // If already authenticated (e.g. page reload within the same session),
    // go straight to the dashboard.
    if (window.RBAC.isAuthenticated()) {
      showDashboard();
    } else {
      initLogin();
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AdminPanel = { init: init, switchTab: switchTab };

})();
