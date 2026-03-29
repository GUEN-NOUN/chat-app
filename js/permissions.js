"use strict";

/**
 * Permissions helper — request camera/microphone/storage once and persist result
 * Stores decisions in localStorage under key 'madarik_permissions'
 */
(function () {
  var KEY = 'madarik_permissions';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(obj) { try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {} }

  function isGranted(name) {
    var s = load();
    return !!s[name];
  }

  function requestCamera() {
    var state = load();
    if (state.camera === true) return Promise.resolve({ granted: true });
    return navigator.mediaDevices.getUserMedia({ video: true }).then(function (stream) {
      // stop tracks immediately — we only want permission
      stream.getTracks().forEach(function (t) { t.stop(); });
      state.camera = true; save(state); return { granted: true };
    }).catch(function (err) { state.camera = false; save(state); return { granted: false, error: err }; });
  }

  function requestMicrophone() {
    var state = load();
    if (state.microphone === true) return Promise.resolve({ granted: true });
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      state.microphone = true; save(state); return { granted: true };
    }).catch(function (err) { state.microphone = false; save(state); return { granted: false, error: err }; });
  }

  function requestStorage() {
    var state = load();
    if (state.storage === true) return Promise.resolve({ granted: true });
    // Simple probe: try writing small item to IndexedDB/localStorage
    try {
      localStorage.setItem('madarik_storage_probe', '1');
      localStorage.removeItem('madarik_storage_probe');
      state.storage = true; save(state); return Promise.resolve({ granted: true });
    } catch (e) { state.storage = false; save(state); return Promise.resolve({ granted: false, error: e }); }
  }

  function requestAll(opts) {
    opts = opts || { camera: false, microphone: false, storage: true };
    var promises = [];
    if (opts.camera) promises.push(requestCamera()); else promises.push(Promise.resolve({ skipped: true }));
    if (opts.microphone) promises.push(requestMicrophone()); else promises.push(Promise.resolve({ skipped: true }));
    if (opts.storage) promises.push(requestStorage()); else promises.push(Promise.resolve({ skipped: true }));
    return Promise.all(promises).then(function (res) {
      return { camera: res[0], microphone: res[1], storage: res[2] };
    });
  }

  window.Permissions = {
    isGranted: isGranted,
    requestCamera: requestCamera,
    requestMicrophone: requestMicrophone,
    requestStorage: requestStorage,
    requestAll: requestAll
  };
})();
