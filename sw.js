// Network-first service worker with hard purge hook
const CACHE = 'times-trainer-v10';

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
  // No pre-cache: we want fresh network on first load
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clear old caches when this SW activates
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Always try network first (so updates show immediately)
  event.respondWith(
    fetch(req)
      .then(resp => {
        // Cache same-origin successful responses as a backup
        if (resp.ok && new URL(req.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return resp;
      })
      .catch(() =>
        // If offline or network fails, use cached copy if available
        caches.match(req).then(r => {
          if (r) return r;
          // For navigations, try cached root as a last resort
          if (req.mode === 'navigate') return caches.match('./');
          return Promise.reject('no-match');
        })
      )
  );
});
