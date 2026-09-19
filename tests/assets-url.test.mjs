import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initAssets, assetsReady } from '../js/assets.ts';

test('atlas loading resolves one path separator with or without a trailing slash (#129)', async () => {
  const oldFetch = globalThis.fetch;
  const oldImage = globalThis.Image;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    return { json: async () => ({ atlas: 'atlas.png', size: [32, 16], sprites: {} }) };
  };
  globalThis.Image = class {
    width = 32;
    height = 16;
    set src(url) { requests.push(url); queueMicrotask(() => this.onload()); }
  };
  try {
    for (const suffix of ['', '/']) {
      requests.length = 0;
      await initAssets({ atlas: `https://example.test/themes/craft${suffix}` });
      assert.deepEqual(requests, [
        'https://example.test/themes/craft/atlas.json',
        'https://example.test/themes/craft/atlas.png',
      ]);
      assert.equal(assetsReady(), true);
    }
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.Image = oldImage;
  }
});
