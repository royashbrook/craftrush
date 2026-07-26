import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME, VILLAGERS, migrateWorld, townPop, townHasRoom, worldIncomeRate, pendingIdleWorld, homeIncomeRate } from '../js/config.js';

const HOUR = 3600 * 1000;

test('a fresh world starts every town with an empty crew', () => {
  const w = migrateWorld({});
  assert.equal(townPop(w.towns.plains), 0);
  assert.equal(townPop(w.towns.desert), 0);
  for (const v of VILLAGERS) assert.equal(w.towns.plains.villagers[v.id], 0);
});

test('a town fills up to its cap and then has no room', () => {
  const w = migrateWorld({});
  const rec = w.towns.plains;
  rec.villagers.farmer = HOME.townCap - 1;
  assert.equal(townHasRoom(rec), true, 'one slot left');
  rec.villagers.farmer = HOME.townCap;
  assert.equal(townPop(rec), HOME.townCap);
  assert.equal(townHasRoom(rec), false, 'full');
});

test('capacity grows by unlocking towns, not by cramming one', () => {
  const w = migrateWorld({});
  w.towns.plains.villagers.farmer = HOME.townCap;
  assert.equal(townHasRoom(w.towns.plains), false);
  w.towns.desert.unlocked = true;                 // a new town is new room
  assert.equal(townHasRoom(w.towns.desert), true);
});

test('world income sums the unlocked towns only', () => {
  const w = migrateWorld({});
  w.towns.plains.villagers.farmer = 2;            // 2 x 5
  w.towns.desert.villagers.miner = 3;             // locked, must not count
  assert.equal(worldIncomeRate(w), homeIncomeRate({ farmer: 2 }));
  w.towns.desert.unlocked = true;                 // now it earns
  assert.equal(worldIncomeRate(w), homeIncomeRate({ farmer: 2 }) + homeIncomeRate({ miner: 3 }));
});

test('idle earnings accrue across towns and stay clamped', () => {
  const w = migrateWorld({});
  w.towns.plains.villagers.miner = 2;             // 48/hr
  const now = 1000 * HOUR;
  assert.equal(pendingIdleWorld(w, now - 2 * HOUR, now), 96);
  const capped = pendingIdleWorld(w, now - 500 * HOUR, now);
  assert.equal(capped, Math.floor(48 * (HOME.idleCapMs / HOUR)), 'still capped at the idle window');
});

test('a legacy global village moves into the starter town exactly once', () => {
  const save = { home: { villagers: { farmer: 3, miner: 1 }, lastCollect: 5 } };
  const w = migrateWorld(save);
  assert.equal(w.towns.plains.villagers.farmer, 3);
  assert.equal(w.towns.plains.villagers.miner, 1);
  migrateWorld(save);                             // idempotent, must not double up
  assert.equal(w.towns.plains.villagers.farmer, 3);
});

test('picking a faster pace pays more, a calmer one pays less', async () => {
  const { SPEEDS, speedById } = await import('../js/config.js');
  assert.equal(speedById('normal').speedMul, 1);
  assert.equal(speedById('normal').rewardMul, 1);
  assert.equal(speedById('nonsense').id, 'normal', 'unknown falls back to normal');
  const calm = speedById('calm'), turbo = speedById('turbo');
  assert.ok(calm.speedMul < 1 && calm.rewardMul < 1, 'calmer is slower and pays less');
  assert.ok(turbo.speedMul > 1 && turbo.rewardMul > 1, 'turbo is faster and pays more');
  // risk should track reward: every step up is faster AND worth more
  for (let i = 1; i < SPEEDS.length; i++) {
    assert.ok(SPEEDS[i].speedMul > SPEEDS[i - 1].speedMul, `${SPEEDS[i].id} is faster`);
    assert.ok(SPEEDS[i].rewardMul > SPEEDS[i - 1].rewardMul, `${SPEEDS[i].id} pays more`);
  }
});
