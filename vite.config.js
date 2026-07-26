import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Version: major.minor from the last tag, patch from commits since it. Same
// rule the hand-rolled build used, so the number in the corner keeps counting
// from where it was rather than resetting when the toolchain changed.
function appVersion() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const since = execSync(`git rev-list ${tag}..HEAD --count`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${tag.replace(/^v/, '')}.${since}`;
  } catch {
    return '0.0.0-dev';
  }
}

const walkDir = (dir, out = [], root = dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkDir(p, out, root);
    else out.push(relative(root, p).split(/[\\/]/).join('/'));
  }
  return out;
};

/**
 * A theme is a folder at the repo root, and only part of it is runtime. The
 * data and the built atlas ship; art/ does not, because those are the source
 * drawings the atlas was packed from and the browser never reads them.
 *
 * Kept out of public/ for exactly that reason: publicDir copies everything,
 * which would put 137 source PNGs in the bundle.
 */
function themes() {
  const TYPES = { '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
  const isRuntime = (f) => !f.includes('/art/');
  return {
    name: 'craftrush-themes',
    configureServer(server) {
      // A developer who ran a production build once has a service worker that
      // will happily serve them yesterday's app forever. Hand it one that
      // deletes itself and every cache, so the next reload is clean.
      server.middlewares.use((req, res, next) => {
        if (!/\/sw\.js$/.test((req.url || '').split('?')[0])) return next();
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end([
          'self.addEventListener("install", () => self.skipWaiting());',
          'self.addEventListener("activate", (e) => e.waitUntil((async () => {',
          '  for (const k of await caches.keys()) await caches.delete(k);',
          '  await self.registration.unregister();',
          '})()));',
        ].join('\n'));
      });
      server.middlewares.use((req, res, next) => {
        const m = decodeURIComponent((req.url || '').split('?')[0]).match(/^\/themes\/(.+)$/);
        if (!m || !isRuntime(`/${m[1]}`)) return next();
        try {
          const body = readFileSync(join('themes', m[1]));
          res.setHeader('Content-Type', TYPES[extname(m[1])] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch { next(); }
      });
    },
    closeBundle() {
      for (const f of walkDir('themes').filter(isRuntime)) {
        const dst = join('dist', 'themes', f);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(join('themes', f), dst);
      }
    },
  };
}

/**
 * Writes the service worker after the bundle exists, so its precache list is
 * the files that actually shipped rather than a list somebody has to remember
 * to update. The cache name is a hash of those files, which is what makes a
 * deploy invalidate the old one.
 */
function serviceWorker() {
  return {
    name: 'craftrush-sw',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files = walkDir(dist).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
      const version = hash.digest('hex').slice(0, 8);

      // precache './' rather than './index.html': some static hosts redirect
      // /index.html to /, and cache.addAll rejects on a redirect, which would
      // silently abort the WHOLE precache and leave the app broken offline.
      const assets = ['./', ...files.filter((f) => f !== 'index.html').map((f) => `./${f}`)];
      const src = readFileSync('sw.template.js', 'utf8')
        .replace('__CACHE__', `craftrush-${version}`)
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));
      writeFileSync(join(dist, 'sw.js'), src);
      console.log(`\nservice worker: ${assets.length} files precached, cache craftrush-${version}`);
    },
  };
}

export default defineConfig({
  // relative asset URLs, because the game is served from /craftrush rather than
  // a domain root
  base: './',
  plugins: [svelte(), themes(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 8123,
    strictPort: false,
  },
});
