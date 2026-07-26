// Cache-first service worker: full offline play after first load.
const CACHE = 'craftrush-0a87942b';
const ASSETS = [
  './',
  './manifest.webmanifest',
  './js/achievements.js',
  './js/assets.js',
  './js/atlaskey.js',
  './js/audio.js',
  './js/boss.js',
  './js/combat.js',
  './js/config.js',
  './js/crowd.js',
  './js/engine.js',
  './js/fx.js',
  './js/game.js',
  './js/levelgen.js',
  './js/main.js',
  './js/minegame.js',
  './js/render.js',
  './js/theme.js',
  './js/townscene.js',
  './js/ui.js',
  './js/variants.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512-maskable.png',
  './icons/icon-512.png',
  './themes/craft/atlas.json',
  './themes/craft/atlas.png',
  './themes/craft/biomes.json',
  './themes/craft/campaign.json',
  './themes/craft/cosmetics.json',
  './themes/craft/enemies.json',
  './themes/craft/mine.json',
  './themes/craft/skins.json',
  './themes/craft/theme.json',
  './themes/craft/tiers.json',
  './themes/neon/atlas.json',
  './themes/neon/atlas.png',
  './themes/neon/biomes.json',
  './themes/neon/campaign.json',
  './themes/neon/cosmetics.json',
  './themes/neon/enemies.json',
  './themes/neon/mine.json',
  './themes/neon/skins.json',
  './themes/neon/theme.json',
  './themes/neon/tiers.json',
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
        const shell = await caches.match('./');   // the precached shell (see ASSETS note re: redirects)
        if (shell) return shell;
      }
      return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
