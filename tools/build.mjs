#!/usr/bin/env node
// Build the deployable site into dist/. No external dependencies.
// Copies the runtime files and regenerates the service-worker precache list
// (the ASSETS array + a content-hashed CACHE version) from the actual file
// tree, so it can never drift from reality. All paths are relative, so the
// output serves correctly under a subpath like /craftrush.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

function walk(rel, out = []) {
  for (const name of readdirSync(join(ROOT, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(ROOT, r)).isDirectory()) walk(r, out);
    else out.push(r);
  }
  return out;
}

// Runtime files that ship to the browser (source tools/tests/docs excluded).
const RUNTIME = ['index.html', 'manifest.webmanifest', 'sw.js', ...walk('js'), ...walk('icons')];

// Fresh dist/
rmSync(DIST, { recursive: true, force: true });
for (const f of RUNTIME) {
  mkdirSync(dirname(join(DIST, f)), { recursive: true });
  cpSync(join(ROOT, f), join(DIST, f));
}

// Precache everything except the service worker itself, plus the app root './'.
const cached = RUNTIME.filter((f) => f !== 'sw.js');   // hashed for the cache version (incl. index.html)
// The precache list EXCLUDES index.html: some static hosts (e.g. Cloudflare static assets, serving
// this under /craftrush) 30x-redirect /index.html -> /, and cache.addAll rejects a redirected
// response AND is all-or-nothing, so that one entry silently aborts the whole precache and the app
// never works offline. './' serves the same shell at a plain 200.
const assets = ['./', ...cached.filter((f) => f !== 'index.html').map((f) => `./${f}`)];

// Content hash → cache version, so a new deploy invalidates old caches.
const h = createHash('sha256');
for (const f of cached) h.update(readFileSync(join(ROOT, f)));
const version = h.digest('hex').slice(0, 8);

// Rewrite dist/sw.js: inject the generated ASSETS array and CACHE version.
let sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'craftrush-${version}';`);
sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${assets.map((a) => `  '${a}',`).join('\n')}\n];`);
writeFileSync(join(DIST, 'sw.js'), sw);

// App version (semver): major.minor from the latest git tag, patch = commits since that tag. Tags
// cut milestones (v0.2, v0.3, ...); every commit since bumps the patch automatically. Stamped into
// dist/ only (the source VERSION is just a fallback for an unbuilt/no-git checkout).
function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT }).toString().trim(); } catch { return ''; }
}
let appVersion;
const tag = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
if (tag) {
  const mm = tag.replace(/^v/, '').split('.').slice(0, 2);
  while (mm.length < 2) mm.push('0');
  appVersion = `${mm.join('.')}.${git(['rev-list', `${tag}..HEAD`, '--count']) || '0'}`;
} else {
  appVersion = `0.0.${git(['rev-list', 'HEAD', '--count']) || '0'}`;
}
const cfgPath = join(DIST, 'js', 'config.js');
writeFileSync(cfgPath, readFileSync(cfgPath, 'utf8').replace(/export const VERSION = '[^']*';/, `export const VERSION = '${appVersion}';`));

console.log(`Built dist/ — ${RUNTIME.length} files, version ${appVersion}, cache craftrush-${version}`);
console.log('Serve dist/ under any path (relative asset paths work at /craftrush).');
