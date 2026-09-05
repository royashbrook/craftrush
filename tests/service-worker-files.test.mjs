import { test } from 'node:test';
import assert from 'node:assert/strict';
import config, { isHostConfig } from '../svelte.config.js';

// The precache list is all or nothing, so one host configuration file in it
// takes the whole worker down. This is the unit-level half of the guard; the
// build-mode e2e is the other.

test('host configuration files stay out of the precache', () => {
  const { files } = config.kit.serviceWorker;
  assert.equal(files('_headers'), false);
  assert.equal(files('_redirects'), false);
  assert.equal(files('.DS_Store'), false);
  assert.equal(files('manifest.webmanifest'), true);
  assert.equal(files('themes/craft/atlas.png'), true);
  assert.equal(files('sw.js'), true);
});

test('isHostConfig matches only the top-level host files', () => {
  assert.equal(isHostConfig('_headers'), true);
  assert.equal(isHostConfig('icons/_headers'), false);
  assert.equal(isHostConfig('headers'), false);
});
