import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrowdMixin } from '../js/crowd.js';
import { TIERS } from '../js/config.js';

// A minimal object carrying the crowd methods; setWorth with fx=false touches
// no fx/audio/cam, so no DOM is needed.
function makeCrowd() {
  return Object.assign({
    crowd: [], bigs: TIERS.units.map(() => []), reserve: 0,
    bestCrowd: 0, save: { stats: {} },
  }, CrowdMixin);
}

test('setWorth round-trips worth below the graduation threshold', () => {
  for (const w of [0, 1, 4, 50, 96, 100, 216, 1000, 4999]) {
    const g = makeCrowd();
    g.setWorth(w);
    assert.equal(g.worth(), w, `worth ${w} should decompose and sum back`);
    assert.equal(g.stars, 0);
  }
});

test('worth at/above the threshold graduates instead of ballooning', () => {
  const g = makeCrowd();
  g.setWorth(50000);
  assert.ok(g.worth() < TIERS.gradWorth, 'visible worth stays bounded');
  assert.ok(g.crowd.length <= TIERS.maxRunners);
  TIERS.units.forEach((u, i) => assert.ok(g.bigs[i].length <= u.max));
  assert.ok(g.stars > 0, 'overflow becomes permanent stars');
  // true power is preserved across graduations (within rounding)
  assert.ok(g.armyPower() >= 45000 && g.armyPower() <= 55000);
});

test('losing worth converges to zero, never negative', () => {
  const g = makeCrowd();
  g.setWorth(300);
  g.setWorth(g.worth() - 1000); // clamp at 0
  assert.equal(g.worth(), 0);
});
