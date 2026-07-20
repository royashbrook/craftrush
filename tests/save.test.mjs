import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave } from '../js/config.js';

function withStorage(seed) {
  const store = {};
  if (seed) store['craftrush_save_v1'] = JSON.stringify(seed);
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };
}

test('loadSave returns full defaults when nothing is stored', () => {
  withStorage(null);
  const s = loadSave();
  assert.equal(s.level, 1);
  assert.equal(s.mode, 'shooter');
  assert.deepEqual(s.unlocked, ['steve']);
  assert.ok(s.stats && s.expedition && s.cosmetics);
});

test('loadSave merges a partial v0.1 save over the defaults', () => {
  withStorage({ emeralds: 500, level: 4, unlocked: ['steve', 'alex'] });
  const s = loadSave();
  assert.equal(s.emeralds, 500);
  assert.equal(s.level, 4);
  assert.deepEqual(s.unlocked, ['steve', 'alex']);
  // fields absent from the stored save fall back to defaults
  assert.equal(s.mode, 'shooter');
  assert.equal(s.camera, 'far');
  assert.ok(s.stats);
});

test('a corrupt save falls back to defaults instead of throwing', () => {
  const store = { 'craftrush_save_v1': '{not valid json' };
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: () => {} };
  assert.doesNotThrow(() => {
    const s = loadSave();
    assert.equal(s.level, 1);
  });
});
