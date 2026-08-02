/// <reference types="@sveltejs/kit" />
// Cache-first service worker: full offline play after the first load.
//
// The precache list comes from SvelteKit rather than from a build plugin that
// walks the output directory. `build` is the generated JS and CSS, `files` is
// everything in static/ (which is where the themes get synced, so the art and
// the theme data come along for free), and `version` changes per build, which
// is what retires the old cache.
import { build, files, prerendered, version } from '$service-worker';
import { ownsCraftRushCache, replayableCachedResponse } from '../js/pwa-safety.js';

const CACHE = `craftrush-${version}`;

// Precache '/' rather than '/index.html': some static hosts redirect one to the
// other, and cache.addAll REJECTS on a redirected response. Since addAll is all
// or nothing, that single redirect would silently abort the entire precache and
// leave the app broken offline with no clue why.
const ASSETS = [...build, ...files, ...prerendered];

self.addEventListener('install', (event) => {
  // all or nothing on purpose: a partial precache fails the install, so the old
  // worker keeps serving and the browser retries, rather than a quietly broken
  // cache. Do not skip waiting here: the page offers the player an Update button
  // and only activates this worker when reloading cannot eat a run or result.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => ownsCraftRushCache(k) && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // anything we built is content-hashed, so a cache hit is always correct
    if (ASSETS.includes(url.pathname)) {
      const hit = await cache.match(url.pathname);
      if (hit) return replayableCachedResponse(hit);
    }

    try {
      const res = await fetch(request);
      // only cache real responses: a 404 or an opaque cross-origin reply cached
      // here would be served back forever
      if (res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
      return res;
    } catch {
      const hit = await cache.match(request);
      if (hit) return replayableCachedResponse(hit);
      throw new Error('offline and not cached');
    }
  })());
});
