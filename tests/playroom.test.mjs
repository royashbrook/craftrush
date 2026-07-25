import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp01, loadSave, DECOR, decorById, ROOM_TIERS, roomTierById } from '../js/config.js';

function withStorage(initial) {
  const store = {};
  if (initial) store['craftrush_save_v1'] = JSON.stringify(initial); // must match SAVE_KEY
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

test('a fresh save starts with one pre-decorated house and nobody in it', () => {
  withStorage(null);
  const h = loadSave().world.towns.plains.houses[0];
  assert.deepEqual(h.people, []);
  assert.ok(h.decor.length > 0);
});

test('a save predating the world is migrated on load', () => {
  withStorage({ emeralds: 100, level: 2 }); // predates the whole playroom
  const s = loadSave();
  assert.ok(s.world && s.world.towns.plains.houses.length === 1);
  assert.equal(s.world.town, 'plains');
});

test('a legacy flat playroom is carried into the first house on load', () => {
  withStorage({
    emeralds: 100,
    playmates: [{ skin: 'steve', cosmetics: { cape: 'none', hat: 'none' }, x: 0.4, y: 0.8 }],
    decor: [{ item: 'bed', x: 0.2, y: 0.9 }],
    roomTier: 'quartz',
  });
  const s = loadSave();
  const h = s.world.towns.plains.houses[0];
  assert.equal(h.people.length, 1, 'the player keeps the friend they had');
  assert.equal(h.decor.length, 1);
  assert.equal(h.style, 'quartz');
  assert.deepEqual(s.roomTiersOwned, [ROOM_TIERS[0].id]);
});

test('a fresh save has an empty decor inventory (the bin refills it)', () => {
  withStorage(null);
  assert.deepEqual(loadSave().decorOwned, {});
});

test('decor and room lookups resolve valid ids and fall back safely', () => {
  assert.equal(decorById('bed').cost, 250);
  assert.equal(decorById('nonsense'), undefined);
  assert.equal(ROOM_TIERS[0].cost, 0); // starter room is free
  assert.equal(roomTierById('quartz').name, 'Quartz Palace');
  assert.equal(roomTierById('nonsense').id, ROOM_TIERS[0].id); // safe fallback
  assert.ok(DECOR.every(d => d.sprite && d.cost >= 0));
});

test('every room tier carries the materials the renderer needs', () => {
  for (const t of ROOM_TIERS) {
    for (const k of ['wall', 'wallAlt', 'trim', 'floor', 'floorAlt', 'pattern']) {
      assert.ok(t[k], `${t.id} missing ${k}`);
    }
    assert.ok(['planks', 'bricks', 'tiles'].includes(t.pattern));
  }
});
