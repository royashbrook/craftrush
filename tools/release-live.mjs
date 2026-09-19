import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { verifyArtifact } from './release-artifact.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const noStore = new Set(['index.html', 'rescue.html', 'service-worker.js', 'release.json', '_app/version.json', 'manifest.webmanifest']);
const hostFiles = new Set(['_headers', '_redirects']);
// Host rewriting may depend on Accept/User-Agent while Node receives clean HTML.
// The actual browser navigation remains a separate production check.
const navigationHeaders = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
};

export async function compareLive(manifest, origin, fetcher = fetch) {
  // The same artifact can live at / or under a directory; a leading slash here
  // would accidentally verify the host's root app instead of this one.
  const base = new URL(origin.endsWith('/') ? origin : `${origin}/`);
  for (const [name, hash] of Object.entries(manifest.files)) {
    const path = name === 'index.html' ? './' : name;
    const html = name.endsWith('.html');
    const response = await fetcher(new URL(path, base), { cache: 'no-store', ...(html ? { headers: navigationHeaders } : {}) });
    if (hostFiles.has(name)) {
      assert.equal(response.status, 404, `${name} must configure the host, not be served`);
      continue;
    }
    assert.equal(response.status, 200, `${name} must serve the validated artifact`);
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), hash, `${name} differs from the validated artifact`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${name} lacks nosniff`);
    const cache = response.headers.get('cache-control') ?? '';
    if (noStore.has(name)) assert.match(cache, /(?:^|[,\s])no-store(?:$|[,\s])/, `${name} must not cache release identity or shell`);
    if (html) assert.match(cache, /(?:^|[,\s])no-transform(?:$|[,\s])/, `${name} must not transform validated HTML`);
    if (name.startsWith('_app/immutable/')) assert.match(cache, /(?:^|[,\s])immutable(?:$|[,\s])/, `${name} must be immutable`);
  }
  const response = await fetcher(new URL('artifact.json', base), { cache: 'no-store' });
  assert.equal(response.status, 200, 'the live artifact manifest must be available');
  assert.deepEqual(await response.json(), manifest, 'the live manifest must identify the exact validated bytes');
  return manifest.release;
}

async function main() {
  const directory = process.argv[2] ?? 'build';
  const origin = process.argv[3];
  verifyArtifact(directory);
  const manifest = JSON.parse(readFileSync(join(directory, 'artifact.json'), 'utf8'));
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      const release = await compareLive(manifest, origin, (url, options) => fetch(url, {
        ...options, signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))),
      }));
      console.log(`live verified: ${release.version} / ${release.fingerprint} / ${release.source}`);
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      console.error(`live comparison pending: ${error.message}`);
      await setTimeout(Math.min(2000, deadline - Date.now()));
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
