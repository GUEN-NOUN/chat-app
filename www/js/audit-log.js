'use strict';

/**
 * AuditLog — append-only admin action log.
 *
 * PURPOSE & TRANSPARENCY:
 *   Every privileged action performed by an admin is recorded here so that:
 *   (1) Admins are accountable — there is always a trail.
 *   (2) Superadmin can review what was done to whom and why.
 *   (3) In the event of a privacy complaint, the log shows whether
 *       content was accessed legitimately (following a report).
 *
 * STORAGE:
 *   Entries are written to localStorage under STORAGE_KEYS.AUDIT_LOGS.
 *   The in-memory list is capped at MAX_ENTRIES to prevent unbounded growth.
 *
 * EACH ENTRY:
 *   {
 *     id:        string  — unique entry ID
 *     ts:        number  — Unix ms timestamp
 *     adminId:   string  — ID of the acting admin
 *     adminRole: string  — role at time of action
 *     action:    string  — action name (e.g. 'suspend_user', 'view_reported_content')
 *     targetId:  string  — userId or content ID affected
 *     details:   object  — action-specific extra data (reason, duration, etc.)
 *   }
 */
(function () {

  var KEY         = window.APP_CONFIG.STORAGE_KEYS.AUDIT_LOGS;
  var MAX_ENTRIES = 5000; // oldest entries are trimmed when the cap is reached

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  function _uuid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function _load() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function _save(entries) {
    try {
      // Always trim to the most recent MAX_ENTRIES before writing
      var trimmed = entries.slice(-MAX_ENTRIES);
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  /* ── Public API ────────────────────────────────────────────────────────── */

  /**
   * Append a new audit entry.
   * This function deliberately does NOT check RBAC — it is called internally
   * by the RBAC and Reports modules after a permission check has already passed.
   *
   * @param {string} adminId   Unique ID of the admin who acted
   * @param {string} adminRole Role at time of action
   * @param {string} action    Snake-case action name
   * @param {string} targetId  UserId or resource ID that was affected
   * @param {object} [details] Action-specific context (reason, previous value, etc.)
   */
  function append(adminId, adminRole, action, targetId, details) {
    var entries = _load();
    entries.push({
      id:        _uuid(),
      ts:        Date.now(),
      adminId:   String(adminId   || 'unknown'),
      adminRole: String(adminRole || 'unknown'),
      action:    String(action    || ''),
      targetId:  String(targetId  || ''),
      details:   (details && typeof details === 'object') ? details : {}
    });
    _save(entries);
  }

  /**
   * Return all log entries.
   * Requires 'view:audit_logs' permission — enforced here so callers
   * don't need to remember to check.
   *
   * @param {object} [filters]
   *   filters.adminId  {string}  — filter by acting admin
   *   filters.action   {string}  — filter by action name
   *   filters.from     {number}  — start timestamp (ms)
   *   filters.to       {number}  — end timestamp (ms)
   */
  function getAll(filters) {
    if (window.RBAC && !window.RBAC.hasPermission('view:audit_logs')) {
      console.warn('[AuditLog] getAll: permission denied');
      return [];
    }
    var entries = _load();
    if (!filters) return entries;

    return entries.filter(function (e) {
      if (filters.adminId && e.adminId  !== filters.adminId) return false;
      if (filters.action  && e.action   !== filters.action)  return false;
      if (filters.from    && e.ts < filters.from)            return false;
      if (filters.to      && e.ts > filters.to)              return false;
      return true;
    });
  }

  /**
   * Purge ALL log entries — superadmin only.
   * A meta-entry is written after the purge so the action is never invisible.
   *
   * @param {string} adminId  The superadmin performing the purge
   */
  function purge(adminId) {
    if (window.RBAC) window.RBAC.requirePermission('purge:audit_logs');
    var count = _load().length;
    _save([]); // wipe
    // Immediately write a trace record so the purge is always visible
    append(adminId, 'superadmin', 'purge_audit_log', 'system', { purgedCount: count });
  }

  /**
   * Return the total count of entries (no permission required — used for stats).
   */
  function count() {
    return _load().length;
  }

  /* ── Human-readable action labels (Arabic) ───────────────────────────── */

  var ACTION_LABELS = {
    'suspend_user':           'إيقاف مستخدم مؤقتًا',
    'ban_user':               'حظر مستخدم',
    'lift_restriction':       'رفع القيود عن مستخدم',
    'warn_user':              'إصدار تحذير لمستخدم',
    'assign_role':            'تعيين دور',
    'revoke_role':            'إلغاء دور',
    'create_admin_account':   'إنشاء حساب مسؤول',
    'remove_admin_account':   'حذف حساب مسؤول',
    'update_report_status':   'تحديث حالة بلاغ',
    'view_reported_content':  'مراجعة محتوى مُبلَّغ عنه',
    'purge_audit_log':        'مسح سجل التدقيق',
    'admin_login':            'تسجيل دخول مسؤول',
    'admin_logout':           'تسجيل خروج مسؤول'
  };

  function labelFor(action) {
    return ACTION_LABELS[action] || action;
  }

  window.AuditLog = {
    append:   append,
    getAll:   getAll,
    purge:    purge,
    count:    count,
    labelFor: labelFor
  };

})();
