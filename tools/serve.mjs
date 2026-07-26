// Dev static server that never lets the browser hold on to anything.
//
// python -m http.server sends no cache headers at all, which means the browser
// applies its own heuristic freshness and quietly serves a stale module after
// an edit. Combined with the service worker that has cost real debugging time
// more than once, so: no-store on everything, and the service worker is refused
// outright in dev.
//
// Usage: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2]) || 8123;
const ROOT = process.cwd();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  // The service worker is the single biggest source of "I edited it and nothing
  // changed" in this project. Dev gets a worker that immediately deletes itself
  // and every cache, rather than a 404: registering a missing script logs a
  // console error the page cannot catch, and this way opening the dev server
  // also cleans up a stale worker left behind by a production build.
  if (rel.endsWith('/sw.js')) {
    res.writeHead(200, {
      'Content-Type': TYPES['.js'],
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return res.end([
      '// dev service worker: exists only to get out of the way',
      'self.addEventListener("install", () => self.skipWaiting());',
      'self.addEventListener("activate", (e) => {',
      '  e.waitUntil((async () => {',
      '    for (const k of await caches.keys()) await caches.delete(k);',
      '    await self.registration.unregister();',
      '  })());',
      '});',
    ].join('\n'));
  }

  const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('nope');
  }

  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT} (no-store, no service worker)`);
});
