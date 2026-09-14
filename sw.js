const CACHE = 'vio-converter-v6-fast-select';
const ASSETS = [
  './', './index.php', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/mediabunny/mediabunny.min.cjs',
  './vendor/mediabunny/mediabunny-aac-encoder.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const sameOrigin = new URL(event.request.url).origin === self.location.origin;
    const hit = await caches.match(event.request, { ignoreSearch: sameOrigin });
    if (hit) return hit;
    try {
      const response = await fetch(event.request);
      if (sameOrigin && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (err) {
      if (event.request.mode === 'navigate') return (await caches.match('./index.php')) || (await caches.match('./'));
      throw err;
    }
  })());
});
