// Tombstone for the pre-1.0 service worker.
//
// Everything that ever loaded v0.2 registered a worker at THIS path. v1.0 moved
// to SvelteKit, whose worker lives at ./service-worker.js, so this path started
// returning 404 — and a registration whose script 404s is in a bad place: the
// browser may keep the old worker alive indefinitely, still intercepting fetches
// and still holding a cache full of files that no longer exist on the server.
// Two workers and two caches fighting over one page is not a state worth
// debugging on someone's phone.
//
// So the path stays, and what lives here now deletes itself. On the next update
// check an old install picks this up, drops only Craft Rush's legacy caches,
// and unregisters. The page keeps running until its next safe navigation.
//
// Do not delete this file, and do not rename service-worker.js again without
// leaving something like it behind.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('craftrush-')) await caches.delete(key);
    }
    await self.registration.unregister();
  })());
});

// deliberately no fetch handler: while this is briefly alive, everything should
// go straight to the network
