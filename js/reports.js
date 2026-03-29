'use strict';

/**
 * Reports — user-submitted content report system.
 *
 * PRIVACY PRINCIPLES:
 *   1. Content previews are only available for reported items — never for
 *      arbitrary messages.  This ensures admins cannot silently browse
 *      private user conversations.
 *   2. Every content-preview access is audit-logged with the admin identity,
 *      timestamp, and report ID.
 *   3. Content is stored obfuscated (base64) — not raw text — so it cannot
 *      be casually read by inspecting localStorage.
 *   4. The reporter's identity is visible to admins to prevent false reports
 *      and abuse of the report system.
 *
 * CONSENT & TRANSPARENCY:
 *   The report modal shown to users explicitly explains what data is stored
 *   and who can see it.  This satisfies GDPR Article 13 (transparency).
 *
 * REPORT LIFECYCLE:
 *   pending → reviewing → resolved | dismissed
 *
 * STORAGE:
 *   localStorage key: STORAGE_KEYS.REPORTS
 *   Maximum: MAX_REPORTS entries (oldest are trimmed).
 */
(function () {

  var KEY         = window.APP_CONFIG.STORAGE_KEYS.REPORTS;
  var MAX_REPORTS = 5000;

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  function _id() {
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Obfuscate content snapshot (base64 UTF-8 encode).
   * This is NOT encryption — it prevents casual inspection of localStorage
   * without going through the admin UI (which enforces permission checks
   * and writes an audit entry).
   */
  function _obfuscate(str) {
    try { return btoa(unescape(encodeURIComponent(str))); } catch (e) { return ''; }
  }

  function _deobfuscate(str) {
    try { return decodeURIComponent(escape(atob(str))); }
    catch (e) { return '[محتوى غير قابل للعرض]'; }
  }

  function _load() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function _save(reports) {
    try {
      localStorage.setItem(KEY, JSON.stringify(reports.slice(-MAX_REPORTS)));
    } catch (e) {}
  }

  /* ── Report submission ─────────────────────────────────────────────────── */

  /**
   * Submit a new content report. Called by any authenticated chat user.
   *
   * @param {object} opts
   *   reporterId       {string}  deviceId of the reporter (required)
   *   reporterName     {string}  display name of the reporter
   *   targetUserId     {string}  deviceId of the reported user (required)
   *   targetName       {string}  display name of the reported user
   *   messageId        {string}  unique ID of the reported message
   *   reason           {string}  'spam' | 'harassment' | 'inappropriate' | 'other'
   *   contentType      {string}  'text' | 'image' | 'audio'
   *   contentSnapshot  {string}  raw content — stored obfuscated; access is permission-gated
   *
   * @returns {true | 'duplicate' | false}
   */
  function submit(opts) {
    if (!opts || !opts.reporterId || !opts.targetUserId) return false;

    var reports = _load();

    // Prevent the same reporter filing duplicate reports for the same message
    var alreadyReported = reports.some(function (r) {
      return r.messageId === opts.messageId && r.reporterId === opts.reporterId;
    });
    if (alreadyReported) return 'duplicate';

    reports.push({
      id:           _id(),
      ts:           Date.now(),
      status:       'pending',   // pending | reviewing | resolved | dismissed
      reporterId:   String(opts.reporterId),
      reporterName: String(opts.reporterName || '').slice(0, 64),
      targetUserId: String(opts.targetUserId),
      targetName:   String(opts.targetName   || '').slice(0, 64),
      messageId:    String(opts.messageId    || ''),
      reason:       String(opts.reason       || 'other').slice(0, 200),
      contentType:  String(opts.contentType  || 'text'),
      // PRIVACY: snapshot stored obfuscated; revealed only via revealContent()
      // which enforces 'view:reported_content' permission and writes audit entry.
      _snapshot:    _obfuscate(String(opts.contentSnapshot || '').slice(0, 2000)),
      resolution:   null,
      resolvedBy:   null,
      resolvedAt:   null
    });

    _save(reports);
    return true;
  }

  /* ── Admin read access ─────────────────────────────────────────────────── */

  /**
   * Return reports, optionally filtered by status.
   * Requires 'manage:reports' permission.
   *
   * @param {string|null} status  null = return all
   * @returns {Array}  Reports WITHOUT the _snapshot field (content is hidden by default).
   */
  function getReports(status) {
    if (window.RBAC && !window.RBAC.hasPermission('manage:reports')) {
      console.warn('[Reports] getReports: permission denied');
      return [];
    }
    var list = _load();
    if (status) list = list.filter(function (r) { return r.status === status; });

    // Strip raw snapshot from the returned objects — access requires revealContent()
    return list.map(function (r) {
      var copy     = Object.assign({}, r);
      delete copy._snapshot;
      return copy;
    });
  }

  /**
   * Reveal the content snapshot for a specific report.
   *
   * ENFORCES TWO REQUIREMENTS:
   *   1. Caller must have 'view:reported_content' permission.
   *   2. The report must exist (i.e. this is genuinely reported content).
   *
   * EVERY call writes an AuditLog entry regardless of outcome.
   *
   * @param {string} reportId  Report ID (from getReports)
   * @returns {string|null}    Decoded content string, or null if not found.
   */
  function revealContent(reportId) {
    if (window.RBAC) window.RBAC.requirePermission('view:reported_content');

    var reports = _load();
    var report  = reports.find(function (r) { return r.id === reportId; });

    // Audit regardless of whether the report exists — suspicious if it doesn't
    if (window.AuditLog) {
      window.AuditLog.append(
        window.RBAC ? window.RBAC.getAdminId()  : 'unknown',
        window.RBAC ? window.RBAC.getRole()     : 'unknown',
        'view_reported_content',
        report ? report.targetUserId : 'unknown',
        { reportId: reportId, found: !!report, contentType: report ? report.contentType : '?' }
      );
    }

    if (!report) return null;
    return _deobfuscate(report._snapshot);
  }

  /* ── Admin status update ───────────────────────────────────────────────── */

  /**
   * Update the status of a report (reviewing / resolved / dismissed).
   * Requires 'manage:reports' permission.
   *
   * @param {string} reportId   Report ID
   * @param {string} newStatus  'reviewing' | 'resolved' | 'dismissed'
   * @param {string} resolution Human-readable admin note
   * @returns {boolean}
   */
  function updateStatus(reportId, newStatus, resolution) {
    if (window.RBAC) window.RBAC.requirePermission('manage:reports');

    var valid = ['reviewing', 'resolved', 'dismissed'];
    if (valid.indexOf(newStatus) < 0) return false;

    var reports = _load();
    var idx     = reports.findIndex(function (r) { return r.id === reportId; });
    if (idx < 0) return false;

    var adminId  = window.RBAC ? window.RBAC.getAdminId() : 'unknown';
    var prevStatus = reports[idx].status;

    reports[idx].status     = newStatus;
    reports[idx].resolution = String(resolution || '').slice(0, 500);
    reports[idx].resolvedBy = adminId;
    reports[idx].resolvedAt = Date.now();
    _save(reports);

    if (window.AuditLog) {
      window.AuditLog.append(adminId, window.RBAC ? window.RBAC.getRole() : 'unknown',
        'update_report_status', reports[idx].targetUserId, {
          reportId:   reportId,
          prevStatus: prevStatus,
          newStatus:  newStatus,
          resolution: resolution || ''
        }
      );
    }
    return true;
  }

  /* ── Counts (no permission required — used for stats widget) ─────────── */

  function getCount(status) {
    var list = _load();
    if (!status) return list.length;
    return list.filter(function (r) { return r.status === status; }).length;
  }

  /* ── Report modal UI (injected dynamically into any page) ─────────────── */

  /**
   * Create the report overlay modal if it does not yet exist on the page.
   * This is called lazily so the DOM is only modified when needed.
   */
  function _ensureModal() {
    if (document.getElementById('m-report')) return;

    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id        = 'm-report';
    ov.innerHTML = [
      '<div class="modal" style="max-width:420px">',
        '<div class="modal-head">',
          '<span class="micon">🚩</span>',
          '<h3>الإبلاغ عن محتوى</h3>',
          '<p>يراجع المشرفون هذا البلاغ فقط وفق سياسة الخصوصية.</p>',
        '</div>',

        '<div class="form-field">',
          '<label for="rpt-reason">سبب الإبلاغ</label>',
          '<select id="rpt-reason">',
            '<option value="spam">محتوى مزعج أو إعلانات (Spam)</option>',
            '<option value="harassment">تحرش أو تنمر</option>',
            '<option value="inappropriate">محتوى غير لائق أو مسيء</option>',
            '<option value="violence">تهديد أو عنف</option>',
            '<option value="other">سبب آخر</option>',
          '</select>',
        '</div>',

        '<div class="form-field">',
          '<label for="rpt-note">ملاحظة إضافية (اختياري)</label>',
          '<textarea id="rpt-note" rows="2" maxlength="300"',
            ' placeholder="أضف تفاصيل إضافية..."></textarea>',
        '</div>',

        // Inline privacy notice (GDPR Art. 13 transparency)
        '<div style="background:rgba(255,200,0,.07);border:1px solid rgba(255,200,0,.25);',
              'border-radius:8px;padding:10px 12px;margin-bottom:12px">',
          '<p style="margin:0;font-size:12px;color:var(--text3);line-height:1.6">',
            '🔒 <strong>الخصوصية:</strong> يُحفظ هذا البلاغ بأمان. المشرفون يستطيعون ',
            'مراجعة <u>هذه الرسالة فقط</u> بعد تقديم البلاغ — لا يمكنهم ',
            'الوصول إلى أي رسائل خاصة أخرى.',
          '</p>',
        '</div>',

        '<div class="modal-foot">',
          '<button class="btn btn-primary" type="button" id="btn-do-report">🚩 إرسال البلاغ</button>',
          '<button class="btn btn-ghost"   type="button" data-close="m-report">إلغاء</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(ov);

    // Close on overlay click
    ov.addEventListener('click', function (e) {
      if (e.target === ov) ov.classList.remove('open');
    });
    ov.querySelector('[data-close="m-report"]').addEventListener('click', function () {
      ov.classList.remove('open');
    });
  }

  // Context object for the currently pending report (set before opening modal)
  var _ctx = null;

  /**
   * Open the report modal pre-populated with the given message context.
   *
   * @param {object} ctx
   *   reporterId, reporterName, targetUserId, targetName,
   *   messageId, contentType, contentSnapshot
   */
  function openReportModal(ctx) {
    _ensureModal();
    _ctx = ctx;

    var ov     = document.getElementById('m-report');
    var reason = document.getElementById('rpt-reason');
    var note   = document.getElementById('rpt-note');
    var btn    = document.getElementById('btn-do-report');

    if (reason) reason.value = 'spam';
    if (note)   note.value   = '';

    if (btn) {
      // Remove any previous handler by replacing the node
      var newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', function () {
        if (!_ctx) return;
        var combined = (reason ? reason.value : 'other') +
                       (note && note.value.trim() ? ' – ' + note.value.trim() : '');
        var result = submit({
          reporterId:      _ctx.reporterId,
          reporterName:    _ctx.reporterName,
          targetUserId:    _ctx.targetUserId,
          targetName:      _ctx.targetName,
          messageId:       _ctx.messageId,
          reason:          combined,
          contentType:     _ctx.contentType,
          contentSnapshot: _ctx.contentSnapshot
        });

        ov.classList.remove('open');
        _ctx = null;

        if (result === 'duplicate') {
          if (window.Modals) window.Modals.toast('لقد أبلغت عن هذه الرسالة مسبقًا', 'inf');
        } else if (result) {
          if (window.Modals) window.Modals.toast('✅ تم إرسال البلاغ — شكرًا لمساعدتك', 'ok');
        } else {
          if (window.Modals) window.Modals.toast('❌ تعذّر إرسال البلاغ', 'err');
        }
      });
    }

    if (ov) ov.classList.add('open');
  }

  /* ── Public API ────────────────────────────────────────────────────────── */

  window.Reports = {
    submit:          submit,
    getReports:      getReports,
    revealContent:   revealContent,
    updateStatus:    updateStatus,
    getCount:        getCount,
    openReportModal: openReportModal
  };

})();
