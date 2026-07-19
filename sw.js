// Cache-first service worker: full offline play after first load.
const CACHE = 'craftrush-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/main.js',
  './js/config.js',
  './js/engine.js',
  './js/assets.js',
  './js/audio.js',
  './js/game.js',
  './js/ui.js',
  './js/achievements.js',
  './js/sprites/core.js',
  './js/sprites/hostiles.js',
  './js/sprites/bosses.js',
  './js/sprites/scenery.js',
  './js/sprites/items.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // addAll is all-or-nothing: a partial precache fails the install so the old SW
  // keeps serving and the browser retries, instead of a silently broken cache.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first with cache fallback: always fresh online, fully playable offline.
// index.html fallback is for navigations ONLY (serving HTML to a module import
// bricks the boot), and the chain always ends in a real Response.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
