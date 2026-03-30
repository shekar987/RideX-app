// RideX Service Worker
// Strategy:
//   /static/**  → cache-first  (JS/CSS bundles have content-hash names; safe to cache indefinitely)
//   navigate    → network-first with cache fallback (ensures fresh HTML for SPA routing)
//   everything else → network-only

const CACHE_NAME = 'ridex-v1';
const STATIC_PREFIX = '/static/';

// Install: claim clients immediately so the SW activates without a page reload.
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
