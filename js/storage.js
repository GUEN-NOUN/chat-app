'use strict';

/**
 * IndexedDB for PDF blob persistence (URLs survive refresh).
 * localStorage for lists (pdf/exercise/test metadata) and chat.
 */
(function () {
  var CONFIG = window.APP_CONFIG;
  var IDB_NAME = CONFIG.IDB_NAME;
  var IDB_VERSION = CONFIG.IDB_VERSION;
  var IDB_STORE = CONFIG.IDB_STORE;
  var KEYS = CONFIG.STORAGE_KEYS;

  var db = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) { resolve(db); return; }
      var r = indexedDB.open(IDB_NAME, IDB_VERSION);
      r.onerror = function () { reject(r.error); };
      r.onsuccess = function () { db = r.result; resolve(db); };
      r.onupgradeneeded = function (e) {
        if (!e.target.result.objectStoreNames.contains(IDB_STORE)) {
          e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  function putBlob(id, blob) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        store.put({ id: id, blob: blob });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getBlob(id) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(IDB_STORE, 'readonly');
        var store = tx.objectStore(IDB_STORE);
        var req = store.get(id);
        req.onsuccess = function () {
          var row = req.result;
          resolve(row ? row.blob : null);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function deleteBlob(id) {
    return openDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        store.delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getItem(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback != null ? fallback : null;
      return JSON.parse(raw);
    } catch (e) {
      return fallback != null ? fallback : null;
    }
  }

  function setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  window.Storage = {
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    getItem: getItem,
    setItem: setItem,
    KEYS: KEYS
  };
})();
