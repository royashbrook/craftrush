import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINE, PICKAXES, blockHp, blockPay, blockKind, mineEnergy, pickaxeDmg, pickaxeCost, nextPickaxe } from '../js/config.js';

const S = 1000;

test('block HP and pay start low and rise with depth', () => {
  assert.equal(blockHp(0), 1);
  assert.equal(blockPay(0), 1);
  assert.ok(blockHp(60) > blockHp(6));
  assert.ok(blockPay(80) > blockPay(8));
  assert.equal(blockHp(6), 2);
  assert.equal(blockPay(8), 2);
});

test('block kind follows the strata thresholds', () => {
  assert.equal(blockKind(0), 'stone');
  assert.equal(blockKind(9), 'stone');
  assert.equal(blockKind(10), 'coal');
  assert.equal(blockKind(25), 'iron');
  assert.equal(blockKind(50), 'gold');
  assert.equal(blockKind(100), 'diamond');
  assert.equal(blockKind(250), 'emerald');
});

test('energy is full on a fresh mine and refills over time, capped', () => {
  const fresh = { energy: MINE.energyCap, energyTs: 0 };
  assert.equal(mineEnergy(fresh, 1000 * S), MINE.energyCap); // energyTs falsy -> baseline now
  const spent = { energy: 10, energyTs: 100 * S };
  assert.equal(mineEnergy(spent, 100 * S + 5 * MINE.energyRefillMs), 15); // +5 over 5 refills
  const overflow = { energy: 55, energyTs: 100 * S };
  assert.equal(mineEnergy(overflow, 100 * S + 100 * MINE.energyRefillMs), MINE.energyCap); // clamped
});

test('energy stays within [0, cap]', () => {
  assert.equal(mineEnergy({ energy: 0, energyTs: 1000 * S }, 1000 * S), 0); // no time passed
  assert.equal(mineEnergy({ energy: 0, energyTs: 1 }, 100000 * S), MINE.energyCap); // huge time -> capped
});

test('pickaxe damage, cost, and next-tier lookups', () => {
  assert.equal(pickaxeDmg('wood'), 1);
  assert.equal(pickaxeDmg('netherite'), 20);
  assert.equal(pickaxeDmg('nonsense'), 1); // falls back to wood
  assert.equal(pickaxeCost('stone'), 200);
  assert.equal(nextPickaxe('wood').id, 'stone');
  assert.equal(nextPickaxe('diamond').id, 'netherite');
  assert.equal(nextPickaxe('netherite'), null); // top of the ladder
});
