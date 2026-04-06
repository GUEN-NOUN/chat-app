'use strict';

/**
 * Friends — lightweight friend-request system.
 *
 * Storage layout (per device, keyed by own userId):
 *   madarik_friends  →  {
 *     sent:     [userId, ...]   // requests I sent
 *     received: [userId, ...]   // requests sent to me
 *     accepted: [userId, ...]   // mutual friends
 *     rejected: [userId, ...]   // requests I rejected (suppressed)
 *   }
 *
 * Because the app is local-only (no server), friend state is stored on BOTH
 * devices:  when A sends a request to B, A's 'sent' + B's 'received' are each
 * written to the shared registry key so B sees the badge next time they open
 * the chat.  This is a best-effort localStorage simulation — a real backend
 * would replace the persistence layer only.
 *
 * Public API:  window.Friends.*
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var KEY  = KEYS.FRIENDS || 'madarik_friends';

  // BroadcastChannel for cross-tab sync
  var channel = null;
  var listeners = [];
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('madarik_friends');
      channel.onmessage = function (e) {
        if (e && e.data && e.data.type === 'friends-update') notifyListeners();
      };
    }
  } catch (e) {}

  function broadcast() {
    if (channel) try { channel.postMessage({ type: 'friends-update' }); } catch (e) {}
  }

  function notifyListeners() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /* ── Per-user storage ───────────────────────────────────────────────── */

  function storageKey(userId) {
    return KEY + '_' + userId;
  }

  function load(userId) {
    if (!userId) return { sent: [], received: [], accepted: [], rejected: [] };
    try {
      var raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            sent:     Array.isArray(parsed.sent)     ? parsed.sent     : [],
            received: Array.isArray(parsed.received) ? parsed.received : [],
            accepted: Array.isArray(parsed.accepted) ? parsed.accepted : [],
            rejected: Array.isArray(parsed.rejected) ? parsed.rejected : []
          };
        }
      }
    } catch (e) {}
    return { sent: [], received: [], accepted: [], rejected: [] };
  }

  function save(userId, data) {
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(data));
      broadcast();
      notifyListeners();
    } catch (e) {}
  }

  function addUnique(arr, val) {
    if (arr.indexOf(val) === -1) arr.push(val);
    return arr;
  }

  function removeFrom(arr, val) {
    var idx = arr.indexOf(val);
    if (idx !== -1) arr.splice(idx, 1);
    return arr;
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  /**
   * sendRequest(fromId, toId)
   * Records the request on fromId's 'sent' list.
   * Also injects into toId's 'received' list (same device simulation).
   */
  function sendRequest(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    var myData   = load(fromId);
    var theirData = load(toId);

    // Already friends?
    if (myData.accepted.indexOf(toId) !== -1) return false;
    // Already sent?
    if (myData.sent.indexOf(toId) !== -1) return false;
    // They already sent me a request → auto-accept
    if (myData.received.indexOf(toId) !== -1) {
      return acceptRequest(fromId, toId);
    }

    addUnique(myData.sent, toId);
    removeFrom(myData.rejected, toId);
    save(fromId, myData);

    // Mark on the other side too (same localStorage, different key)
    addUnique(theirData.received, fromId);
    removeFrom(theirData.rejected, fromId);
    save(toId, theirData);

    return true;
  }

  /**
   * acceptRequest(myId, fromId)
   * Moves fromId from received → accepted on both sides.
   */
  function acceptRequest(myId, fromId) {
    if (!myId || !fromId) return false;
    var myData    = load(myId);
    var theirData = load(fromId);

    removeFrom(myData.received, fromId);
    removeFrom(myData.rejected, fromId);
    addUnique(myData.accepted, fromId);
    save(myId, myData);

    removeFrom(theirData.sent, myId);
    addUnique(theirData.accepted, myId);
    save(fromId, theirData);

    return true;
  }

  /**
   * rejectRequest(myId, fromId)
   * Removes fromId from received and records in rejected.
   */
  function rejectRequest(myId, fromId) {
    if (!myId || !fromId) return false;
    var myData    = load(myId);
    var theirData = load(fromId);

    removeFrom(myData.received, fromId);
    addUnique(myData.rejected, fromId);
    save(myId, myData);

    removeFrom(theirData.sent, myId);
    save(fromId, theirData);

    return true;
  }

  /**
   * removeFriend(myId, friendId)
   * Removes from accepted on both sides.
   */
  function removeFriend(myId, friendId) {
    if (!myId || !friendId) return false;
    var myData    = load(myId);
    var theirData = load(friendId);

    removeFrom(myData.accepted, friendId);
    save(myId, myData);
    removeFrom(theirData.accepted, myId);
    save(friendId, theirData);

    return true;
  }

  /**
   * getFriends(userId) → array of friend IDs
   */
  function getFriends(userId) {
    return load(userId).accepted.slice();
  }

  /**
   * getPendingReceived(userId) → array of IDs who sent me a request
   */
  function getPendingReceived(userId) {
    return load(userId).received.slice();
  }

  /**
   * getPendingSent(userId) → array of IDs I sent requests to
   */
  function getPendingSent(userId) {
    return load(userId).sent.slice();
  }

  /**
   * getStatus(myId, otherId)
   * Returns: 'friend' | 'sent' | 'received' | 'none'
   */
  function getStatus(myId, otherId) {
    if (!myId || !otherId) return 'none';
    var d = load(myId);
    if (d.accepted.indexOf(otherId) !== -1) return 'friend';
    if (d.sent.indexOf(otherId) !== -1)     return 'sent';
    if (d.received.indexOf(otherId) !== -1) return 'received';
    return 'none';
  }

  /**
   * isFriend(myId, otherId) → boolean
   */
  function isFriend(myId, otherId) {
    return getStatus(myId, otherId) === 'friend';
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  window.Friends = {
    sendRequest:       sendRequest,
    acceptRequest:     acceptRequest,
    rejectRequest:     rejectRequest,
    removeFriend:      removeFriend,
    getFriends:        getFriends,
    getPendingReceived: getPendingReceived,
    getPendingSent:    getPendingSent,
    getStatus:         getStatus,
    isFriend:          isFriend,
    onChange:          onChange
  };
})();
