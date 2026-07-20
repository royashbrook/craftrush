#!/usr/bin/env node
// Build the deployable site into dist/. No external dependencies.
// Copies the runtime files and regenerates the service-worker precache list
// (the ASSETS array + a content-hashed CACHE version) from the actual file
// tree, so it can never drift from reality. All paths are relative, so the
// output serves correctly under a subpath like /craftrush.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const cached = RUNTIME.filter((f) => f !== 'sw.js');
const assets = ['./', ...cached.map((f) => `./${f}`)];

// Content hash → cache version, so a new deploy invalidates old caches.
const h = createHash('sha256');
for (const f of cached) h.update(readFileSync(join(ROOT, f)));
const version = h.digest('hex').slice(0, 8);

// Rewrite dist/sw.js: inject the generated ASSETS array and CACHE version.
let sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'craftrush-${version}';`);
sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${assets.map((a) => `  '${a}',`).join('\n')}\n];`);
writeFileSync(join(DIST, 'sw.js'), sw);

console.log(`Built dist/ — ${RUNTIME.length} files, cache craftrush-${version}`);
console.log('Serve dist/ under any path (relative asset paths work at /craftrush).');
