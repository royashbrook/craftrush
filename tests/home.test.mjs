import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGERS, HOME, villagerCost, homeIncomeRate, pendingIdle } from '../js/config.js';

const HOUR = 3600 * 1000;

test('villagerCost starts at base and rises with ownership', () => {
  for (const v of VILLAGERS) {
    assert.equal(villagerCost(v.id, 0), v.base);
    assert.ok(villagerCost(v.id, 1) > villagerCost(v.id, 0));
    assert.ok(villagerCost(v.id, 5) > villagerCost(v.id, 4));
  }
});

test('an unknown villager costs Infinity (can never be bought)', () => {
  assert.equal(villagerCost('dragon', 0), Infinity);
});

test('income rate sums each villager type', () => {
  assert.equal(homeIncomeRate({}), 0);
  assert.equal(homeIncomeRate({ farmer: 2 }), 2 * 5);
  assert.equal(homeIncomeRate({ farmer: 1, miner: 3, librarian: 1 }), 5 + 3 * 24 + 1000);
});

test('idle income scales with elapsed time', () => {
  const v = { miner: 2 }; // 48/hr
  const now = 100 * HOUR;
  assert.equal(pendingIdle(v, now - 2 * HOUR, now), 96);
  assert.equal(pendingIdle(v, now - 30 * 60 * 1000, now), 24); // half hour
});

test('idle income is clamped at the 8-hour cap', () => {
  const v = { fisher: 1 }; // 85/hr
  const now = 1000 * HOUR;
  const capped = pendingIdle(v, now - 50 * HOUR, now);
  assert.equal(capped, Math.floor(85 * (HOME.idleCapMs / HOUR)));
  assert.equal(capped, 85 * 8);
});

test('a fresh home (no lastCollect) banks nothing', () => {
  assert.equal(pendingIdle({ farmer: 5 }, 0, 1000 * HOUR), 0);
});

test('a home with no villagers earns nothing', () => {
  assert.equal(pendingIdle({}, 1, 1000 * HOUR), 0);
});
