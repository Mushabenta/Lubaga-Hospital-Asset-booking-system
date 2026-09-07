const CACHE = 'lubaga-assets-v5';
const APP_SHELL = [
  '/',
  '/index.html',
  '/register.html',
  '/user-dashboard.html',
  '/admin-dashboard.html',
  '/assets.html',
  '/dashboard.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/lubaga%20logo.png',
  '/lubaga%20badge.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls - they are dynamic and require auth.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    return;
  }

  // App pages: network-first, fall back to the cached copy when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  // Same-origin static assets: cache-first, then network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Cross-origin CDN resources (Bootstrap etc.): network with simple cache fallback.
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request))
  );
});