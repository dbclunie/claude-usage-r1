// Claude Usage Monitor — service worker
// Enables offline use and "Add to Home Screen" / PWA install.
// Bump CACHE_NAME whenever index.html changes so clients pick up the new version.
const CACHE_NAME = 'claude-usage-v1.2.3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never cache relay calls — the whole point of the app is live usage data,
  // caching it would mean showing stale numbers, which is worse than failing offline.
  const isRelayCall = url.includes('onrender.com');
  if (isRelayCall) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: cache-first so the app opens instantly and works offline.
  // Falls back to network for anything not already cached.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
