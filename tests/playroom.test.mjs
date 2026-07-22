import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp01, loadSave } from '../js/config.js';

function withStorage(initial) {
  const store = {};
  if (initial) store['craftrush.v1'] = JSON.stringify(initial);
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

test('clamp01 keeps drag positions inside [0,1]', () => {
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(1.7), 1);
  assert.equal(clamp01(0.42), 0.42);
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(1), 1);
});

test('a fresh save starts with no playmates', () => {
  withStorage(null);
  assert.deepEqual(loadSave().playmates, []);
});

test('an older save without playmates migrates to an empty list', () => {
  withStorage({ emeralds: 100, level: 2 }); // predates the field
  const s = loadSave();
  assert.ok(Array.isArray(s.playmates));
  assert.equal(s.playmates.length, 0);
});
