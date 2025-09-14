// Simple offline-first cache for the core app files
const CACHE = 'times-trainer-v2';
const ASSETS = [
  './',
  'index.html',
  'script.js',
  'manifest.json'
  // add 'icons/icon-192.png', 'icons/icon-512.png' here if you use icons
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Try cache first, then network, then fallback to cache root
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        // Cache same-origin GET responses for later
        if (resp.ok && new URL(request.url).origin === location.origin) {
          const respClone = resp.clone();
          caches.open(CACHE).then(cache => cache.put(request, respClone));
        }
        return resp;
      }).catch(() => caches.match('./'));
    })
  );
});
