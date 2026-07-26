import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILES, mineTileAt, canBreak, pickaxeTier, PICKAXES } from '../js/config.js';

test('the same shaft always generates the same way', () => {
  for (const [x, y] of [[0, 5], [3, 40], [-2, 120], [7, 99]]) {
    assert.equal(mineTileAt(x, y).id, mineTileAt(x, y).id, `stable at ${x},${y}`);
  }
});

test('the surface is diggable dirt and above ground is air', () => {
  assert.equal(mineTileAt(0, -1).id, 'air');
  assert.equal(mineTileAt(0, 0).id, 'dirt');
  assert.equal(mineTileAt(4, 1).id, 'dirt');
});

test('ore appears in veins, not as lone tiles', () => {
  // neighbours on the coarse vein grid should frequently agree
  let clumped = 0, checked = 0;
  for (let y = 20; y < 140; y += 2) {
    for (let x = -4; x < 5; x += 2) {
      const a = mineTileAt(x, y), b = mineTileAt(x + 1, y);
      if (a.ore) { checked++; if (b.id === a.id) clumped++; }
    }
  }
  assert.ok(checked > 0, 'found ore to sample');
  assert.ok(clumped / checked > 0.5, `ore clumps together (${clumped}/${checked})`);
});

test('the good stuff only shows up deep', () => {
  const shallow = new Set();
  for (let y = 2; y < 18; y++) for (let x = -5; x < 6; x++) shallow.add(mineTileAt(x, y).id);
  assert.ok(!shallow.has('diamond'), 'no diamond near the surface');
  assert.ok(!shallow.has('emeraldore'), 'no emerald near the surface');

  const deep = new Set();
  for (let y = 110; y < 200; y++) for (let x = -5; x < 6; x++) deep.add(mineTileAt(x, y).id);
  assert.ok(deep.has('diamond') || deep.has('emeraldore'), 'the deep pays out');
});

test('tools gate what you can break', () => {
  assert.equal(pickaxeTier('wood'), 0);
  assert.ok(pickaxeTier('netherite') > pickaxeTier('diamond'));
  assert.equal(canBreak('wood', TILES.stone), true, 'wood handles stone');
  assert.equal(canBreak('wood', TILES.obsidian), false, 'wood cannot touch obsidian');
  assert.equal(canBreak('netherite', TILES.obsidian), true, 'netherite can');
  assert.equal(canBreak('netherite', TILES.lava), false, 'nothing mines lava');
  assert.equal(canBreak('wood', TILES.air), false, 'air is not a block');
});

test('every ore is worth something and every pickaxe has a tier', () => {
  for (const t of Object.values(TILES)) {
    if (t.ore) assert.ok(t.value > 0, `${t.id} pays`);
    if (t.solid !== false) assert.ok(typeof t.hp === 'number', `${t.id} has hardness`);
  }
  for (const p of PICKAXES) assert.ok(typeof p.tier === 'number', `${p.id} has a tier`);
});
