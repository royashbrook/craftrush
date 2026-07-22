import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrowdMixin } from '../js/crowd.js';
import { TIERS, winBonus, SKINS, COSMETICS } from '../js/config.js';

// Headless harness: inject the crowd mixin onto a bare game with tiny stubs.
function fakeCrowd(stars = 0) {
  return Object.assign({
    crowd: [], bigs: TIERS.units.map(() => []), reserve: 0, stars,
    playerX: 0, playerZ: 0, bestCrowd: 0, save: {},
    _units: [], _reformDirty: false, cam: { shake: 0 },
    skin: { palette: { t: '#0af', s: '#ccc', l: '#00f' } },
    floaty() {}, burst() {}, ring() {}, flushReform() {}, tierPop() {},
  }, CrowdMixin);
}

test('below the graduation threshold, nothing graduates', () => {
  const g = fakeCrowd();
  g.setWorth(3000);
  assert.equal(g.worth(), 3000);
  assert.equal(g.stars, 0);
  assert.equal(g.armyPower(), 3000);
});

test('crossing the threshold graduates: +1 star, worth compacts, power continuous', () => {
  const g = fakeCrowd();
  g.setWorth(TIERS.gradWorth); // 5000
  assert.equal(g.stars, 1);
  assert.equal(g.worth(), Math.round(TIERS.gradWorth / TIERS.starMult)); // ~1667
  // power is preserved across the graduation (no weakening dip)
  assert.ok(g.armyPower() >= TIERS.gradWorth - TIERS.starMult);
  assert.ok(g.armyPower() <= TIERS.gradWorth + TIERS.starMult);
});

test('a huge jump graduates multiple times in one step', () => {
  const g = fakeCrowd();
  g.setWorth(TIERS.gradWorth * TIERS.starMult); // 15000 -> two graduations
  assert.equal(g.stars, 2);
  assert.ok(g.armyPower() >= 14000 && g.armyPower() <= 16000);
});

test('stars are sticky — losing worth never removes a star', () => {
  const g = fakeCrowd();
  g.setWorth(TIERS.gradWorth);
  assert.equal(g.stars, 1);
  g.killRunners(1000);
  assert.equal(g.stars, 1, 'star kept after taking damage');
  assert.ok(g.worth() < 1667);
});

test('best power tracks the star-boosted power, not raw worth', () => {
  const g = fakeCrowd();
  g.setWorth(TIERS.gradWorth);
  assert.ok(g.bestCrowd >= TIERS.gradWorth);
});

test('enemy damage is mitigated by stars; gate damage is not', () => {
  const enemy = fakeCrowd(2); enemy.setWorth(3000); enemy.stars = 2; // 3000 worth, 2 stars
  const before = enemy.worth();
  enemy.killRunners(300); // default: enemy hit, mitigated by 1/(1+2)
  assert.equal(before - enemy.worth(), Math.round(300 / 3));

  const gate = fakeCrowd(2); gate.setWorth(3000); gate.stars = 2;
  const gb = gate.worth();
  gate.killRunners(300, null, null, false); // gate penalty: full, unmitigated
  assert.equal(gb - gate.worth(), 300);
});

test('win bonus is bounded — a million-power run pays a two-figure power term', () => {
  const small = winBonus(1, 1);
  const huge = winBonus(1, 1e6);
  assert.ok(huge - small <= 60, 'log-scaled, not linear');
  assert.ok(winBonus(5, 1e9) < 200);
});

test('shop price ladder matches the design', () => {
  assert.deepEqual(SKINS.map(s => s.cost), [0, 40, 120, 300, 700, 1500, 3000]);
  const total = SKINS.reduce((a, s) => a + s.cost, 0)
    + Object.values(COSMETICS).flat().reduce((a, c) => a + c.cost, 0);
  assert.ok(total >= 17000 && total <= 21000, `shop total ${total} in range`);
});
