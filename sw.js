'use strict';

/**
 * Service Worker — Network-First strategy
 *
 * Always tries the network first so users receive the latest deployed files
 * immediately. Falls back to cache only when completely offline.
 *
 * ⚠️  DO NOT edit CACHE_VERSION manually.
 *     Run:  python bump-version.py <new_version>
 *     That command keeps sw.js, js/version.js, version.json and all HTML
 *     ?v= query strings in sync automatically.
 */
var CACHE_VERSION = 'madarik-v4';  /* ← bumped to clear old /chat/ cache entry */

/* Install: activate immediately without waiting for old SW to stop */
self.addEventListener('install', function () {
  self.skipWaiting();
});

/* Activate: delete every old cache bucket, then take control of all clients */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE_VERSION) return caches.delete(k);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* Fetch: Network-First
   1. Try network → if ok, store a fresh copy in cache and return it.
   2. If network fails → return cached copy (offline fallback).
   Skip non-GET requests and third-party origins (Google Fonts, YouTube…).
*/
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url = e.request.url;

  /* Skip API calls and WebSocket-related paths — never cache auth/chat data */
  if (url.includes('/api/') || url.includes('/ws')) return;

  /* Skip the React chat SPA — let the browser always fetch fresh from server.
     This prevents the SW from caching /chat/ with an old redirect page. */
  if (url.includes('/chat/') || url.includes('/chat?') ||
      url.match(/\/chat$/) || url.includes('/socket.io')) return;

  var isThirdParty = url.includes('googleapis.com') ||
                     url.includes('gstatic.com')    ||
                     url.includes('youtube.com')    ||
                     url.includes('youtu.be');
  if (isThirdParty) return;

  if (!url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request).then(function (networkRes) {
      /* Cache a fresh copy for offline use */
      if (networkRes.status === 200) {
        var clone = networkRes.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(e.request, clone);
        });
      }
      return networkRes;
    }).catch(function () {
      /* Network failed — serve from cache if available */
      return caches.match(e.request);
    })
  );
});
