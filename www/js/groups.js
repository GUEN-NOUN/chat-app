'use strict';

/**
 * Groups — create / manage chat groups (friends-only members).
 *
 * Storage: madarik_chat_groups  → Array<Group>
 *   Group: { id, name, members: [{id, name}], createdBy, createdAt }
 *
 * Groups appear in the chat sidebar alongside direct conversations.
 * Groups are stored locally; the group key in convos is 'grp:<id>'.
 *
 * Public API: window.Groups.*
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var KEY  = KEYS.CHAT_GROUPS || 'madarik_chat_groups';

  var channel = null;
  var listeners = [];
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('madarik_groups');
      channel.onmessage = function (e) {
        if (e && e.data && e.data.type === 'groups-update') notifyListeners();
      };
    }
  } catch (e) {}

  function broadcast() {
    if (channel) try { channel.postMessage({ type: 'groups-update' }); } catch (e) {}
  }

  function notifyListeners() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  function loadAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function saveAll(groups) {
    try {
      localStorage.setItem(KEY, JSON.stringify(groups));
      broadcast();
      notifyListeners();
    } catch (e) {}
  }

  function generateGroupId() {
    return 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * createGroup(name, creatorId, creatorName, memberList)
   *   memberList: [{ id, name }, ...]  (friends only — enforced by UI)
   * Returns the new group object.
   */
  function createGroup(name, creatorId, creatorName, memberList) {
    if (!name || !creatorId) return null;
    var groups = loadAll();
    var members = Array.isArray(memberList) ? memberList.slice() : [];
    // Always include creator
    if (!members.find(function (m) { return m.id === creatorId; })) {
      members.unshift({ id: creatorId, name: creatorName || 'أنت' });
    }
    var group = {
      id:        generateGroupId(),
      name:      name.trim(),
      members:   members,
      createdBy: creatorId,
      createdAt: Date.now()
    };
    groups.push(group);
    saveAll(groups);
    return group;
  }

  /**
   * getGroup(groupId) → Group | null
   */
  function getGroup(groupId) {
    return loadAll().find(function (g) { return g.id === groupId; }) || null;
  }

  /**
   * getMyGroups(userId) → Array<Group>
   */
  function getMyGroups(userId) {
    return loadAll().filter(function (g) {
      return g.members.some(function (m) { return m.id === userId; });
    });
  }

  /**
   * addMember(groupId, memberId, memberName) → boolean
   */
  function addMember(groupId, memberId, memberName) {
    var groups = loadAll();
    var g = groups.find(function (g) { return g.id === groupId; });
    if (!g) return false;
    if (g.members.find(function (m) { return m.id === memberId; })) return false;
    g.members.push({ id: memberId, name: memberName });
    saveAll(groups);
    return true;
  }

  /**
   * removeMember(groupId, memberId) → boolean
   */
  function removeMember(groupId, memberId) {
    var groups = loadAll();
    var g = groups.find(function (g) { return g.id === groupId; });
    if (!g) return false;
    g.members = g.members.filter(function (m) { return m.id !== memberId; });
    saveAll(groups);
    return true;
  }

  /**
   * deleteGroup(groupId, requesterId) → boolean
   * Only the creator can delete.
   */
  function deleteGroup(groupId, requesterId) {
    var groups = loadAll();
    var idx = groups.findIndex(function (g) { return g.id === groupId; });
    if (idx === -1) return false;
    if (groups[idx].createdBy !== requesterId) return false;
    groups.splice(idx, 1);
    saveAll(groups);
    return true;
  }

  /**
   * convosKey(groupId) → storage key to use in CHAT_CONVOS
   */
  function convosKey(groupId) {
    return 'grp:' + groupId;
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  window.Groups = {
    createGroup:  createGroup,
    getGroup:     getGroup,
    getMyGroups:  getMyGroups,
    addMember:    addMember,
    removeMember: removeMember,
    deleteGroup:  deleteGroup,
    convosKey:    convosKey,
    loadAll:      loadAll,
    onChange:     onChange
  };
})();
