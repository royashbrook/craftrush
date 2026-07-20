import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LevelMixin } from '../js/levelgen.js';
import { BIOMES } from '../js/config.js';

function gen(level, mode = 'shooter', mut = {}) {
  const g = Object.assign({
    level, mode, mut,
    biome: BIOMES[(level - 1) % BIOMES.length],
    events: [], length: 0,
  }, LevelMixin);
  g.genLevel(1 + (level - 1) * 0.35);
  return g;
}

test('genLevel is deterministic for a given level', () => {
  for (const level of [1, 3, 8, 12]) {
    const a = gen(level).events;
    const b = gen(level).events;
    assert.deepEqual(a, b, `level ${level} should generate identically`);
    assert.ok(a.length > 0, `level ${level} should not be empty`);
  }
});

test('different levels generate different tracks', () => {
  assert.notDeepEqual(gen(1).events, gen(2).events);
});

test('every generated event sits within the track length', () => {
  const g = gen(6);
  for (const e of g.events) {
    assert.ok(e.z >= 0 && e.z <= g.length, `event z ${e.z} within 0..${g.length}`);
  }
});

test('expedition enemy override only spawns from the mut roster', () => {
  const g = gen(4, 'shooter', { enemies: ['skeleton', 'stray'] });
  for (const e of g.events) {
    if (e.type === 'enemy') assert.ok(['skeleton', 'stray'].includes(e.id));
  }
});
