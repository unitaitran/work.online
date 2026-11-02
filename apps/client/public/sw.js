/* global self, caches, URL, fetch */
// Service worker: CHỈ cache tài nguyên tĩnh đã băm tên (/assets/*, bất biến theo nội dung).
// Trang HTML, API và WebSocket luôn đi mạng, nên bản mới có hiệu lực ngay khi tải lại.
const CACHE = 'dilam-static-v1';
const MAX_ENTRIES = 80;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/assets/')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone());
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)))
          await cache.delete(old);
      }
      return response;
    }),
  );
});
