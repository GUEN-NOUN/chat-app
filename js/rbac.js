'use strict';

/**
 * RBAC — Role-Based Access Control for مدارك التعليمية admin system.
 *
 * ROLE HIERARCHY (ascending privilege):
 *   user  <  moderator  <  admin  <  superadmin
 *
 * DESIGN NOTES — client-side security model:
 *   This app has no backend server; all enforcement is in-browser.
 *   The RBAC layer enforces rules at the UI and API level, and every
 *   privileged action is audit-logged for transparency.  A production
 *   deployment should mirror these permission checks server-side.
 *
 * SESSION MODEL:
 *   - On login a session token (UUID + role + expiry) is written only to
 *     sessionStorage, so the session is automatically cleared when the
 *     browser/tab closes.  It is NEVER written to localStorage.
 *   - Credential verification uses SubtleCrypto SHA-256 so plain-text
 *     passwords are never stored or compared after the first bootstrap.
 *
 * PRIVILEGE ESCALATION PREVENTION:
 *   - A role can only be assigned to another user if the actor's role level
 *     is strictly higher than the target role level.
 *   - Only superadmin can manage roles (PERMISSION_MAP enforces this).
 */
(function () {

  /* ── Role definitions ──────────────────────────────────────────────────── */

  var ROLES = {
    USER:       'user',
    MODERATOR:  'moderator',
    ADMIN:      'admin',
    SUPERADMIN: 'superadmin'
  };

  // Numeric level — higher is more privileged
  var ROLE_LEVEL = { user: 0, moderator: 1, admin: 2, superadmin: 3 };

  /* ── Permission matrix ─────────────────────────────────────────────────── */
  // Maps permission name → minimum role required.
  // PRIVACY RULE: 'view:reported_content' is intentionally *not* available
  // to 'user'; content is only accessible when the report flow is followed.
  var PERMISSION_MAP = {
    'view:user_list':            'moderator',
    'view:user_profile':         'moderator',
    // PRIVACY: Content preview requires the message to have been reported first.
    // The Reports module enforces this additional constraint.
    'view:reported_content':     'moderator',
    'manage:reports':            'moderator',
    'warn:user':                 'moderator',
    'suspend:user':              'admin',
    'ban:user':                  'admin',
    'view:audit_logs':           'admin',
    'manage:roles':              'superadmin',
    'manage:admin_accounts':     'superadmin',
    'purge:audit_logs':          'superadmin'
  };

  /* ── Session management (sessionStorage) ───────────────────────────────── */

  var SESSION_KEY    = 'madarik_rbac_session';
  var SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

  function _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Create and persist a new session. Returns the session object.
   * @param {string} adminId  Unique admin account ID
   * @param {string} role     Role string (must be in ROLES)
   */
  function createSession(adminId, role) {
    var session = {
      token:   _uuid(),
      adminId: adminId,
      role:    role,
      exp:     Date.now() + SESSION_TTL_MS
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    return session;
  }

  /**
   * Return the active session or null if expired / missing.
   * Refreshes the expiry on every call (sliding window).
   */
  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.exp || s.exp <= Date.now()) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      // Slide the expiry window
      s.exp = Date.now() + SESSION_TTL_MS;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      return s;
    } catch (e) { return null; }
  }

  /** Destroy the current session (logout). */
  function destroySession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /** Return the role of the currently authenticated admin, or null. */
  function getRole() {
    var s = getSession();
    return s ? s.role : null;
  }

  /** Return the adminId of the currently authenticated admin, or null. */
  function getAdminId() {
    var s = getSession();
    return s ? s.adminId : null;
  }

  /** Return true if there is a valid session. */
  function isAuthenticated() {
    return !!getSession();
  }

  /* ── Permission checks ─────────────────────────────────────────────────── */

  /**
   * Return true if the current session has the given permission.
   * @param {string} action  Permission name from PERMISSION_MAP
   */
  function hasPermission(action) {
    var role = getRole();
    if (!role) return false;
    var minRole = PERMISSION_MAP[action];
    if (!minRole) return false;
    return (ROLE_LEVEL[role] || 0) >= (ROLE_LEVEL[minRole] || 0);
  }

  /**
   * Assert permission — throws if denied. Use before every privileged op.
   * @param {string} action
   */
  function requirePermission(action) {
    if (!hasPermission(action)) {
      var minRole = PERMISSION_MAP[action] || '?';
      throw new Error(
        'PERMISSION_DENIED: "' + action + '" requires role ≥ ' + minRole +
        ' (current: ' + (getRole() || 'unauthenticated') + ')'
      );
    }
  }

  /* ── Credential system ─────────────────────────────────────────────────── */

  /**
   * Hash a credential string using SubtleCrypto SHA-256.
   * Input is "email_lower:password" — returns Promise<hex string>.
   *
   * SECURITY NOTE: SHA-256 without salt is sufficient here because:
   *   (1) there is no server to brute-force against,
   *   (2) it prevents casual localStorage inspection,
   *   (3) a proper server-side BCrypt/Argon2 is not possible client-side.
   */
  function hashCredential(email, pass) {
    var input = email.trim().toLowerCase() + ':' + pass;
    var data  = new TextEncoder().encode(input);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) { return ('00' + b.toString(16)).slice(-2); })
        .join('');
    });
  }

  /**
   * Load persisted admin credential store from localStorage.
   * Each entry: { id, email, credHash, role, createdAt }
   */
  function loadCredentials() {
    try {
      var raw = localStorage.getItem(window.APP_CONFIG.STORAGE_KEYS.ADMIN_CREDENTIALS);
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveCredentials(creds) {
    try {
      localStorage.setItem(
        window.APP_CONFIG.STORAGE_KEYS.ADMIN_CREDENTIALS,
        JSON.stringify(creds)
      );
    } catch (e) {}
  }

  /**
   * Bootstrap: on first run, derive the superadmin credential hash from
   * APP_CONFIG.CREDS and store it.  Subsequent logins compare against
   * the stored hash — not the plain-text config.
   * Returns a Promise that resolves when bootstrapping is complete.
   */
  function bootstrapSuperadmin() {
    return new Promise(function (resolve) {
      var creds = loadCredentials();
      var hasSuperadmin = creds.some(function (c) { return c.role === ROLES.SUPERADMIN; });
      if (hasSuperadmin) { resolve(); return; }

      var cfg = window.APP_CONFIG.CREDS || {};
      var email = (cfg.email || '').trim().toLowerCase();
      if (!email || !cfg.pass) { resolve(); return; }

      hashCredential(email, cfg.pass).then(function (hash) {
        // Re-check in case another tab bootstrapped concurrently
        var fresh = loadCredentials();
        if (fresh.some(function (c) { return c.role === ROLES.SUPERADMIN; })) {
          resolve(); return;
        }
        fresh.push({
          id:        'superadmin_001',
          email:     email,
          credHash:  hash,
          role:      ROLES.SUPERADMIN,
          createdAt: Date.now()
        });
        saveCredentials(fresh);
        resolve();
      }).catch(function () { resolve(); });
    });
  }

  /**
   * Verify email + password against stored credential hashes.
   * Returns a Promise that resolves to the credential entry or null.
   */
  function verifyCredential(email, pass) {
    return hashCredential(email, pass).then(function (hash) {
      var creds = loadCredentials();
      var emailNorm = email.trim().toLowerCase();
      return creds.find(function (c) {
        return c.email === emailNorm && c.credHash === hash;
      }) || null;
    });
  }

  /**
   * Add a new admin/moderator account.  Superadmin only.
   * Returns a Promise<boolean>.
   */
  function addAdminAccount(email, pass, role, byAdminId) {
    requirePermission('manage:admin_accounts');

    // Prevent privilege escalation: cannot create an account with >= own role
    var actorLevel  = ROLE_LEVEL[getRole()] || 0;
    var targetLevel = ROLE_LEVEL[role]      || 0;
    if (targetLevel >= actorLevel) {
      return Promise.reject(new Error('ESCALATION_BLOCKED: cannot create account with equal or higher role'));
    }

    return hashCredential(email, pass).then(function (hash) {
      var creds = loadCredentials();
      var emailNorm = email.trim().toLowerCase();
      var exists = creds.some(function (c) { return c.email === emailNorm; });
      if (exists) throw new Error('DUPLICATE_EMAIL');

      var entry = {
        id:        'admin_' + Date.now().toString(36),
        email:     emailNorm,
        credHash:  hash,
        role:      role,
        createdAt: Date.now(),
        createdBy: byAdminId
      };
      creds.push(entry);
      saveCredentials(creds);

      if (window.AuditLog) {
        window.AuditLog.append(byAdminId, getRole(), 'create_admin_account', entry.id, { role: role });
      }
      return entry;
    });
  }

  /**
   * Remove an admin/moderator account.  Superadmin only.
   */
  function removeAdminAccount(accountId, byAdminId) {
    requirePermission('manage:admin_accounts');
    var creds = loadCredentials();
    var idx   = creds.findIndex(function (c) { return c.id === accountId; });
    if (idx < 0) return false;

    // Cannot remove another superadmin
    if (creds[idx].role === ROLES.SUPERADMIN && accountId !== byAdminId) {
      throw new Error('PROTECTED: cannot remove another superadmin account');
    }
    var removed = creds.splice(idx, 1)[0];
    saveCredentials(creds);
    if (window.AuditLog) {
      window.AuditLog.append(byAdminId, getRole(), 'remove_admin_account', accountId, { role: removed.role });
    }
    return true;
  }

  /* ── Role assignments (for chat users) ────────────────────────────────── */

  function loadRoleAssignments() {
    try {
      var raw = localStorage.getItem(window.APP_CONFIG.STORAGE_KEYS.ADMIN_ROLES);
      return JSON.parse(raw) || {};
    } catch (e) { return {}; }
  }

  function saveRoleAssignments(map) {
    try {
      localStorage.setItem(window.APP_CONFIG.STORAGE_KEYS.ADMIN_ROLES, JSON.stringify(map));
    } catch (e) {}
  }

  /** Assign a role to a chat user (by their deviceId). Superadmin only. */
  function assignRole(targetUserId, role, byAdminId) {
    requirePermission('manage:roles');
    if (!ROLE_LEVEL.hasOwnProperty(role)) throw new Error('INVALID_ROLE: ' + role);

    // Prevent escalation: target role must be below actor role
    var actorLevel  = ROLE_LEVEL[getRole()] || 0;
    var targetLevel = ROLE_LEVEL[role]      || 0;
    if (targetLevel >= actorLevel) {
      throw new Error('ESCALATION_BLOCKED');
    }

    var map    = loadRoleAssignments();
    var prevRole = (map[targetUserId] && map[targetUserId].role) || ROLES.USER;
    map[targetUserId] = { role: role, assignedBy: byAdminId, assignedAt: Date.now() };
    saveRoleAssignments(map);

    if (window.AuditLog) {
      window.AuditLog.append(byAdminId, getRole(), 'assign_role', targetUserId, {
        prevRole: prevRole, newRole: role
      });
    }
    return map[targetUserId];
  }

  /** Revoke a role assignment (resets user to 'user'). Superadmin only. */
  function revokeRole(targetUserId, byAdminId) {
    requirePermission('manage:roles');
    var map  = loadRoleAssignments();
    var prev = map[targetUserId];
    delete map[targetUserId];
    saveRoleAssignments(map);

    if (window.AuditLog) {
      window.AuditLog.append(byAdminId, getRole(), 'revoke_role', targetUserId, {
        prevRole: prev ? prev.role : ROLES.USER
      });
    }
  }

  /** Return the chat-level role of a user (defaults to 'user'). */
  function getUserRole(userId) {
    var map = loadRoleAssignments();
    return (map[userId] && map[userId].role) || ROLES.USER;
  }

  /* ── User suspension / ban ─────────────────────────────────────────────── */

  function loadSuspensions() {
    try { return JSON.parse(localStorage.getItem(window.APP_CONFIG.STORAGE_KEYS.USER_SUSPENSIONS) || '{}'); }
    catch (e) { return {}; }
  }

  function saveSuspensions(map) {
    try {
      localStorage.setItem(window.APP_CONFIG.STORAGE_KEYS.USER_SUSPENSIONS, JSON.stringify(map));
    } catch (e) {}
  }

  /**
   * Temporarily suspend a user.
   * @param {string}      targetId    User's deviceId
   * @param {string}      adminId     Acting admin's ID
   * @param {string}      reason      Human-readable reason
   * @param {number|null} durationMs  null = indefinite
   */
  function suspendUser(targetId, adminId, reason, durationMs) {
    requirePermission('suspend:user');
    var map = loadSuspensions();
    map[targetId] = {
      status:  'suspended',
      reason:  String(reason || '').slice(0, 500),
      by:      adminId,
      at:      Date.now(),
      until:   durationMs ? Date.now() + durationMs : null
    };
    saveSuspensions(map);
    if (window.AuditLog) {
      window.AuditLog.append(adminId, getRole(), 'suspend_user', targetId, {
        reason: reason, durationMs: durationMs
      });
    }
  }

  /**
   * Permanently ban a user.
   */
  function banUser(targetId, adminId, reason) {
    requirePermission('ban:user');
    var map = loadSuspensions();
    map[targetId] = {
      status: 'banned',
      reason: String(reason || '').slice(0, 500),
      by:     adminId,
      at:     Date.now(),
      until:  null
    };
    saveSuspensions(map);
    if (window.AuditLog) {
      window.AuditLog.append(adminId, getRole(), 'ban_user', targetId, { reason: reason });
    }
  }

  /**
   * Lift a suspension or ban.
   */
  function liftRestriction(targetId, adminId) {
    requirePermission('suspend:user');
    var map  = loadSuspensions();
    var prev = map[targetId];
    delete map[targetId];
    saveSuspensions(map);
    if (window.AuditLog) {
      window.AuditLog.append(adminId, getRole(), 'lift_restriction', targetId, {
        prevStatus: prev ? prev.status : 'none'
      });
    }
  }

  /**
   * Return the moderation status of a user ('active' | 'suspended' | 'banned').
   * Auto-expires timed suspensions on check.
   */
  function getUserStatus(userId) {
    var map   = loadSuspensions();
    var entry = map[userId];
    if (!entry) return 'active';
    if (entry.status === 'banned') return 'banned';
    if (entry.status === 'suspended') {
      // Auto-expire if duration has elapsed
      if (entry.until && entry.until <= Date.now()) {
        delete map[userId];
        saveSuspensions(map);
        return 'active';
      }
      return 'suspended';
    }
    return 'active';
  }

  /* ── Warn user ─────────────────────────────────────────────────────────── */

  /**
   * Issue a formal warning to a user (logged to audit trail).
   */
  function warnUser(targetId, adminId, reason) {
    requirePermission('warn:user');
    if (window.AuditLog) {
      window.AuditLog.append(adminId, getRole(), 'warn_user', targetId, {
        reason: String(reason || '').slice(0, 500)
      });
    }
    return true;
  }

  /* ── Public API ────────────────────────────────────────────────────────── */

  window.RBAC = {
    ROLES:                 ROLES,
    ROLE_LEVEL:            ROLE_LEVEL,
    PERMISSION_MAP:        PERMISSION_MAP,

    // Session
    createSession:         createSession,
    getSession:            getSession,
    destroySession:        destroySession,
    getRole:               getRole,
    getAdminId:            getAdminId,
    isAuthenticated:       isAuthenticated,

    // Permissions
    hasPermission:         hasPermission,
    requirePermission:     requirePermission,

    // Credentials
    hashCredential:        hashCredential,
    bootstrapSuperadmin:   bootstrapSuperadmin,
    verifyCredential:      verifyCredential,
    addAdminAccount:       addAdminAccount,
    removeAdminAccount:    removeAdminAccount,
    loadCredentials:       loadCredentials,

    // Role assignments (chat users)
    assignRole:            assignRole,
    revokeRole:            revokeRole,
    getUserRole:           getUserRole,
    loadRoleAssignments:   loadRoleAssignments,

    // User moderation
    suspendUser:           suspendUser,
    banUser:               banUser,
    liftRestriction:       liftRestriction,
    getUserStatus:         getUserStatus,
    loadSuspensions:       loadSuspensions,
    warnUser:              warnUser
  };

})();
