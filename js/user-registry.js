'use strict';

/**
 * UserRegistry — localStorage-based user directory.
 *
 * Every time a user sets their nickname, they are registered here.
 * All registered users are searchable instantly.
 * Each entry: { id, nickname, online, lastSeen, registeredAt }
 *
 * Cross-tab sync via BroadcastChannel (if available) so new users
 * show up across tabs without a full refresh.
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var Storage = window.Storage;

  var KEY = KEYS.CHAT_USERS_REGISTRY;
  var channel = null;
  var listeners = []; // onChange callbacks

  /* ── persistence helpers ──────────────── */
  function loadAll() {
    var raw = Storage.getItem(KEY);
    if (Array.isArray(raw)) return raw;
    return [];
  }

  function saveAll(users) {
    Storage.setItem(KEY, users);
    broadcast({ type: 'registry-update' });
  }

  /* ── BroadcastChannel for cross-tab sync ── */
  function initChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('madarik_user_registry');
        channel.onmessage = function (e) {
          if (e.data && e.data.type === 'registry-update') {
            notifyListeners();
          }
        };
      }
    } catch (err) { /* BroadcastChannel unavailable — single-tab only */ }
  }

  function broadcast(msg) {
    if (channel) {
      try { channel.postMessage(msg); } catch (e) {}
    }
  }

  function notifyListeners() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  }

  /* ── public API ───────────────────────── */

  /**
   * Register or update a user in the directory.
   * Returns the user object.
   */
  function registerUser(id, nickname) {
    if (!id || !nickname) return null;
    var users = loadAll();
    var existing = users.find(function (u) { return u.id === id; });
    var now = Date.now();
    if (existing) {
      existing.nickname = nickname;
      existing.online = true;
      existing.lastSeen = now;
    } else {
      users.push({
        id: id,
        nickname: nickname,
        online: true,
        lastSeen: now,
        registeredAt: now,
        is_public: false        // user opts in explicitly; false by default
      });
    }
    saveAll(users);
    notifyListeners();
    return existing || users[users.length - 1];
  }

  /**
   * Generate a short readable UID: MDK-XXXXXX (uppercase hex).
   * Stored persistently in localStorage so the same user always gets the same UID.
   */
  function generateUid() {
    var KEY_UID = 'madarik_my_uid';
    try {
      var stored = localStorage.getItem(KEY_UID);
      if (stored && /^MDK-[0-9A-F]{6}$/.test(stored)) return stored;
    } catch (e) {}
    var uid = 'MDK-' + Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
    try { localStorage.setItem(KEY_UID, uid); } catch (e) {}
    return uid;
  }

  /**
   * Mark the current user as online and update lastSeen.
   */
  function heartbeat(id) {
    if (!id) return;
    var users = loadAll();
    var u = users.find(function (u) { return u.id === id; });
    if (u) {
      u.online = true;
      u.lastSeen = Date.now();
      saveAll(users);
    }
  }

  /**
   * Mark user as offline.
   */
  function setOffline(id) {
    if (!id) return;
    var users = loadAll();
    var u = users.find(function (u) { return u.id === id; });
    if (u) {
      u.online = false;
      u.lastSeen = Date.now();
      saveAll(users);
    }
  }

  /**
   * Fuzzy-score a nickname against a query string.
   *
   * Scoring tiers (higher = better match):
   *   100  exact match (full string, case-insensitive)
   *    80  prefix match (nickname starts with query)
   *    60  substring match (nickname contains query as a contiguous run)
   *    30  character-sequence match (every query char appears in order in nickname,
   *         but not necessarily contiguous — covers typos and partial Arabic input)
   *     0  no match
   *
   * Works correctly with Arabic text: Arabic letters have no uppercase so
   * toLowerCase() is a no-op on them, which is exactly what we want.
   */
  function fuzzyScore(nickname, query) {
    var n = (nickname || '').toLowerCase();
    var q = (query  || '').toLowerCase();
    if (!q) return 60; // empty query matches everything

    // Tier 1 — exact
    if (n === q) return 100;

    // Tier 2 — prefix
    if (n.indexOf(q) === 0) return 80;

    // Tier 3 — substring (contiguous)
    if (n.indexOf(q) !== -1) return 60;

    // Tier 4 — character-sequence (fuzzy)
    var ni = 0;
    for (var qi = 0; qi < q.length; qi++) {
      var found = false;
      while (ni < n.length) {
        if (n[ni] === q[qi]) { ni++; found = true; break; }
        ni++;
      }
      if (!found) return 0; // query char not found in order
    }
    return 30;
  }

  /**
   * Search users by nickname query.
   *
   * Returns users whose nickname fuzzy-matches the query, sorted by
   * descending relevance score then alphabetically by nickname.
   * Excludes the calling user (selfId).
   *
   * Also searches the optional `displayName` field if present, taking
   * the higher of the two scores.
   */
  function search(query, selfId) {
    var users = loadAll();
    var q = (query || '').trim();

    var scored = [];
    users.forEach(function (u) {
      if (selfId && u.id === selfId) return;
      if (!q) { scored.push({ u: u, score: 60 }); return; }

      var s1 = fuzzyScore(u.nickname, q);
      var s2 = u.displayName ? fuzzyScore(u.displayName, q) : 0;
      // Also search by UID shortcode (exact or prefix)
      var s3 = 0;
      if (u.uid) {
        var uq = q.toUpperCase();
        if (u.uid === uq) s3 = 100;
        else if (u.uid.indexOf(uq) === 0) s3 = 85;
        else if (u.uid.indexOf(uq) !== -1) s3 = 65;
      }
      // Also search by deviceId prefix
      var s4 = (u.id && u.id.toLowerCase().indexOf(q.toLowerCase()) === 0) ? 70 : 0;
      var best = Math.max(s1, s2, s3, s4);
      if (best > 0) scored.push({ u: u, score: best });
    });

    // Sort: higher score first; ties broken alphabetically
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.u.nickname.localeCompare(b.u.nickname);
    });

    return scored.map(function (x) { return x.u; });
  }

  /**
   * Get all users except self.
   */
  function getAll(selfId) {
    return search('', selfId);
  }

  /**
   * Get a single user by ID.
   */
  function getById(id) {
    var users = loadAll();
    return users.find(function (u) { return u.id === id; }) || null;
  }

  /**
   * Check if a nickname is already taken (by a different user).
   */
  function isNicknameTaken(nickname, selfId) {
    var users = loadAll();
    var nick = nickname.trim().toLowerCase();
    return users.some(function (u) {
      return u.id !== selfId && u.nickname.toLowerCase() === nick;
    });
  }

  /**
   * Toggle or set the is_public flag for a user.
   * Only the user themselves should call this (pass their own id).
   * @param {string} id
   * @param {boolean} value
   */
  function setPublic(id, value) {
    if (!id) return;
    var users = loadAll();
    var u = users.find(function (u) { return u.id === id; });
    if (!u) return;
    u.is_public = !!value;
    // Clear stored avatar when the user makes their profile private
    if (!value) u.avatar = null;
    saveAll(users);
  }

  /**
   * Store (or clear) the avatar data-URL for a user in the registry.
   *
   * The avatar is stored here ONLY when the user's `is_public` flag is
   * true — this keeps private avatars out of the shared registry.
   *
   * @param {string}      id           User ID
   * @param {string|null} avatarDataUrl base64 data-URL or null to clear
   */
  function setAvatar(id, avatarDataUrl) {
    if (!id) return;
    var users = loadAll();
    var u = users.find(function (u) { return u.id === id; });
    if (!u || !u.is_public) return; // never store avatar for private users
    u.avatar = avatarDataUrl || null;
    saveAll(users);
  }

  /**
   * Return all users who have opted in to public visibility (is_public=true).
   */
  function getPublicUsers() {
    return loadAll().filter(function (u) { return u.is_public === true; });
  }

  /**
   * Subscribe to registry changes.
   */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /* ── init ─────────────────────────────── */
  initChannel();

  // Mark stale users as offline (> 5 min without heartbeat)
  var STALE_MS = 5 * 60 * 1000;
  var users = loadAll();
  var now = Date.now();
  var changed = false;
  users.forEach(function (u) {
    if (u.online && u.lastSeen && (now - u.lastSeen > STALE_MS)) {
      u.online = false;
      changed = true;
    }
  });
  if (changed) Storage.setItem(KEY, users);

  window.UserRegistry = {
    registerUser: registerUser,
    heartbeat: heartbeat,
    setOffline: setOffline,
    search: search,
    getAll: getAll,
    getById: getById,
    isNicknameTaken: isNicknameTaken,
    setPublic: setPublic,
    setAvatar: setAvatar,
    getPublicUsers: getPublicUsers,
    onChange: onChange,
    generateUid: generateUid
  };
})();
