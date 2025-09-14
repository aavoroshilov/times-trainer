// Network-first service worker with hard purge hook
const CACHE = 'times-trainer-v11';

// Purge all caches when the page asks, to fix stuck iPhones
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.skipWaiting())
      .then(() => self.clients.claim())
    );
  }
});

self.addEventListener('install', (event) => {
  // No pre-cache: fetch fresh from network first
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok && new URL(req.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then(r => {
          if (r) return r;
          if (req.mode === 'navigate') return caches.match('./');
          return Promise.reject('no-match');
        })
      )
  );
});
