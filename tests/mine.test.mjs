import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINE, PICKAXES, blockHp, blockPay, blockKind, mineEnergy, pickaxeDmg, pickaxeCost, nextPickaxe } from '../js/config.js';
import { MineWorld } from '../js/minegame.js';

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

// --- reach and climbing (#57, #58) ---

function digger() {
  const save = { mine: { dug: [], mx: 0, my: 0, depth: 0, pickaxe: 'netherite', inv: {} } };
  const cv = { width: 320, height: 480, getContext: () => ({ imageSmoothingEnabled: false }) };
  return new MineWorld(cv, save);
}

test('the miner reaches the whole ring around him, corners included', () => {
  const m = digger();
  m.mx = 5; m.my = 20;
  for (const [dx, dy] of MineWorld.RING) {
    assert.equal(m.inReach(5 + dx, 20 + dy), true, `${dx},${dy} is in reach`);
  }
  assert.equal(m.inReach(5, 20), false, 'not the tile he is standing in');
  assert.equal(m.inReach(7, 20), false, 'and nothing two steps away');
  assert.equal(m.inReach(7, 22), false);
});

test('a diagonal is diggable, not just the four sides', () => {
  const m = digger();
  m.mx = 5; m.my = 20;
  const before = m.tileAt(6, 21);
  assert.notEqual(before.solid, false, 'there is rock on the diagonal to start');
  let res;
  for (let i = 0; i < 20 && !(res && res.broke); i++) res = m.dig(6, 21, 99);
  assert.equal(res.ok, true);
  assert.equal(res.broke, true, 'the corner comes out');
});

test('a step back up is kept, so a shaft can be climbed', () => {
  const m = digger();
  m.mx = 5; m.my = 20;
  m.dug.add('5,19');                      // already dug out overhead
  const res = m.step(5, 19);
  assert.equal(res.ok, true);
  assert.equal(res.moved, true);
  assert.equal(m.my, 19, 'he is up there');

  // and gravity does not immediately undo it: this was the whole bug
  m.dug.add('5,20');
  assert.equal(m.my, 19, 'still up there with open space below him');
});

test('stepping is free, digging is not', () => {
  const m = digger();
  m.mx = 5; m.my = 20;
  m.dug.add('4,20');
  const step = m.act(4, 20, 0);           // no energy at all
  assert.equal(step.ok, true, 'a step works on an empty tank');
  assert.equal(step.spent, undefined);
  const dig = m.act(3, 20, 0);
  assert.equal(dig.ok, false);
  assert.equal(dig.why, 'energy', 'digging still costs');
});

test('a tap means dig on rock and step on open ground', () => {
  const m = digger();
  m.mx = 5; m.my = 20;
  m.dug.add('5,19');
  assert.equal(m.act(5, 19, 99).moved, true, 'open ground is a step');
  m.mx = 5; m.my = 20;
  const onRock = m.act(6, 20, 99);
  assert.equal(onRock.ok, true);
  assert.equal(onRock.moved, undefined, 'rock is a dig');
});

test('you cannot step into lava, however much you tap it', () => {
  const m = digger();
  m.mx = 5; m.my = 20;
  const lava = { ...m.tileAt(6, 20), solid: false, hazard: true };
  m.tileAt = (x, y) => (x === 6 && y === 20 ? lava : MineWorld.prototype.tileAt.call(m, x, y));
  const res = m.step(6, 20);
  assert.equal(res.ok, false);
  assert.equal(res.why, 'hazard');
  assert.equal(m.mx, 5, 'he stayed put');
});
