import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWNS, townById, MAX_HOUSES, housePrice, makeHouse, styleById, migrateWorld, ROOM_TIERS } from '../js/config.js';

test('town costs ascend and only the first is free', () => {
  assert.equal(TOWNS[0].cost, 0);
  for (let i = 1; i < TOWNS.length; i++) {
    assert.ok(TOWNS[i].cost > TOWNS[i - 1].cost, `${TOWNS[i].id} costs more than ${TOWNS[i - 1].id}`);
  }
  assert.ok(TOWNS.length >= 8);
});

test('every town carries the materials and preset the renderer needs', () => {
  for (const t of TOWNS) {
    for (const k of ['wall', 'wallAlt', 'trim', 'floor', 'floorAlt', 'pattern']) {
      assert.ok(t.style[k], `${t.id} style missing ${k}`);
    }
    assert.ok(['planks', 'bricks', 'tiles'].includes(t.style.pattern));
    assert.ok(t.preset.length > 0, `${t.id} has a pre-decoration preset`);
  }
});

test('townById falls back to the starter town', () => {
  assert.equal(townById('desert').id, 'desert');
  assert.equal(townById('nonsense').id, TOWNS[0].id);
});

test('house price escalates with each house owned', () => {
  assert.ok(housePrice(1) > housePrice(0));
  assert.ok(housePrice(2) > housePrice(1));
  assert.equal(housePrice(0), 400);
});

test('a new house is pre-decorated and empty of people', () => {
  const h = makeHouse('desert');
  assert.equal(h.people.length, 0);
  assert.ok(h.decor.length > 0, 'pre-decorated so it is never an empty box');
  assert.equal(h.style, townById('desert').style.id);
  // preset instances are copies, not shared references with the config
  h.decor[0].x = 0.123;
  assert.notEqual(makeHouse('desert').decor[0].x, 0.123);
});

test('styleById resolves bought room tiers and the town native', () => {
  assert.equal(styleById('quartz', 'plains').name, 'Quartz Palace');
  assert.equal(styleById('desert', 'desert').name, townById('desert').style.name);
  assert.equal(styleById('nonsense', 'end').name, townById('end').style.name); // safe fallback
  assert.ok(ROOM_TIERS.length >= 4);
});

test('a fresh save gets one pre-decorated house in the free town only', () => {
  const s = {};
  const w = migrateWorld(s);
  assert.equal(w.town, 'plains');
  assert.equal(w.house, 0);
  assert.equal(w.carry, null);
  assert.equal(w.towns.plains.houses.length, 1);
  assert.ok(w.towns.plains.houses[0].decor.length > 0);
  assert.equal(w.towns.desert.unlocked, false);
  assert.equal(w.towns.desert.houses.length, 0, 'locked towns have no houses yet');
});

test('a legacy flat playroom folds into plains house 0 and the flat keys are dropped', () => {
  const legacy = {
    playmates: [{ skin: 'steve', cosmetics: { cape: 'none', hat: 'none' }, x: 0.3, y: 0.8 }],
    decor: [{ item: 'bed', x: 0.2, y: 0.9 }],
    roomTier: 'stone',
  };
  const w = migrateWorld(legacy);
  const h = w.towns.plains.houses[0];
  assert.equal(h.people.length, 1);
  assert.equal(h.people[0].skin, 'steve');
  assert.equal(h.decor.length, 1);
  assert.equal(h.style, 'stone');
  assert.equal(legacy.playmates, undefined);
  assert.equal(legacy.decor, undefined);
  assert.equal(legacy.roomTier, undefined);
});

test('migrateWorld is idempotent and repairs a broken pointer', () => {
  const s = {};
  migrateWorld(s);
  s.world.towns.plains.houses[0].people.push({ skin: 'alex', cosmetics: {}, x: 0.5, y: 0.8 });
  migrateWorld(s);
  assert.equal(s.world.towns.plains.houses[0].people.length, 1, 'does not duplicate or wipe');
  s.world.town = 'nonsense'; s.world.house = 99;
  migrateWorld(s);
  assert.equal(s.world.town, 'plains');
  assert.equal(s.world.house, 0);
});

test('MAX_HOUSES caps how many houses a town can hold', () => {
  assert.ok(MAX_HOUSES >= 2 && MAX_HOUSES <= 8);
});
