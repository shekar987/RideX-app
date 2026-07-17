// RideX Service Worker
// Handles: (1) FCM background push messages, (2) static asset caching
//
// FCM config is injected at runtime via postMessage so we don't hardcode
// credentials here. The app sends FIREBASE_CONFIG once on load. If the user
// receives a push while the app is closed, Chrome re-uses the last active SW
// instance which already has the config from the previous session.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

let _messagingReady = false;

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'FIREBASE_CONFIG' || _messagingReady) return;
  try {
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const { title = 'RideX', body = '' } = payload.notification || {};
      self.registration.showNotification(title, {
        body,
        icon:             '/logo192.png',
        badge:            '/logo192.png',
        data:             payload.data || {},
        tag:              payload.data?.tag || 'ridex',
        requireInteraction: false,
      });
    });
    _messagingReady = true;
  } catch (_) {}
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.startsWith(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── Caching ───────────────────────────────────────────────────────────────────
// Strategy:
//   /static/**  → cache-first  (JS/CSS bundles have content-hash names; safe to cache indefinitely)
//   navigate    → network-first with cache fallback (ensures fresh HTML for SPA routing)
//   everything else → network-only

const CACHE_NAME    = 'ridex-v2';
const STATIC_PREFIX = '/static/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin or OSM tile requests; let everything else pass through.
  if (url.origin !== self.location.origin && !url.hostname.endsWith('openstreetmap.org')) {
    return;
  }

  // Cache-first for hashed static assets (/static/js/*.chunk.js, /static/css/*.chunk.css)
  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Network-first for navigation (HTML) — keep the SPA shell fresh.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE_NAME).then((cache) => cache.match('/index.html'))
      )
    );
    return;
  }

  // OSM map tiles — stale-while-revalidate (tiles rarely change, bandwidth matters on mobile)
  if (url.hostname.endsWith('openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
        return cached || networkFetch;
      })
    );
  }
});
