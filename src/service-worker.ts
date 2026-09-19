/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker'

const worker = self as unknown as ServiceWorkerGlobalScope
const CACHE = `craftrush-${version}`
const scope = new URL(worker.registration.scope)
const PRECACHE = [...new Set([...build, ...files, ...prerendered,
  new URL('./', scope).href, new URL('release.json', scope).href,
  new URL('rescue.html', scope).href, new URL('licenses.json', scope).href, new URL('third-party-notices.txt', scope).href]
  .map(path => new URL(path, scope).href))]

worker.addEventListener('install', event => {
  // A partial download must never take control. The waiting worker activates only
  // after the player accepts, or a page already running this build confirms it.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)))
})

worker.addEventListener('activate', event => {
  // Other tabs may still run the previous bundle. Retire its cache only after
  // the sole remaining app client confirms that it runs this generation.
  event.waitUntil(worker.clients.claim())
})

worker.addEventListener('message', event => {
  if (event.data?.type === 'CRAFTRUSH_VERSION') event.ports[0]?.postMessage(version)
  if (event.data?.type === 'CRAFTRUSH_ACTIVATE' || event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(worker.skipWaiting())
  if (event.data?.type !== 'CRAFTRUSH_CLIENT' || event.data.fingerprint !== version) return
  event.waitUntil((async () => {
    const active = worker.registration.active
    const names = await caches.keys()
    const clients = (await worker.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => client.url.startsWith(scope.href))
    if (clients.length !== 1 || !event.source || !('id' in event.source) ||
      clients[0]?.id !== event.source.id || worker.registration.active !== active ||
      worker.registration.installing || worker.registration.waiting) return
    // No awaited snapshot after the guard: a replacement may install or take
    // control while either cache names or clients are being read.
    await Promise.all(names.filter(key => key.startsWith('craftrush-') && key !== CACHE)
      .map(key => caches.delete(key)))
  })())
})

worker.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.href.startsWith(scope.href)) return
  if (url.searchParams.has('update-probe') || url.pathname.endsWith('/release.json') || url.pathname.endsWith('/_app/version.json')) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })))
    return
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const entry = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`)
    // Static hosts canonicalize rescue.html to /rescue. Both addresses name
    // this document, including import/query links; never fall back to the game.
    const rescue = request.mode === 'navigate' && [ 'rescue', 'rescue.html' ]
      .some(path => url.pathname === `${scope.pathname}${path}`)
    const hit = await cache.match(entry ? scope.href : rescue ? new URL('rescue.html', scope).href : request)
    if (hit) return navigationResponse(hit, request)
    // Immutable modules requested by a held old page belong to its old cache.
    for (const name of (await caches.keys()).filter(key => key.startsWith('craftrush-') && key !== CACHE)) {
      const old = await (await caches.open(name)).match(request)
      if (old) return navigationResponse(old, request)
    }
    return fetch(request)
  })())
})

function navigationResponse(response: Response, request: Request) {
  // A cached redirected document is not a valid response to every navigation.
  return request.mode === 'navigate' && response.redirected
    ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response
}
