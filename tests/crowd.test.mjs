import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrowdMixin } from '../js/crowd.js';
import { TIERS } from '../js/config.js';
import { crowdPowerVisualScale, gateSignFontSize, gateVisualScale } from '../js/render.js';

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

test('overflow power becomes visible without unbounded giant growth', () => {
  assert.equal(crowdPowerVisualScale(0, 0), 1);
  assert.ok(crowdPowerVisualScale(1000, 0) > 1);
  assert.ok(crowdPowerVisualScale(1000, 2) > crowdPowerVisualScale(1000, 0));
  assert.ok(crowdPowerVisualScale(1e12, 99) <= 1.65);
});

test('mobile gates remain readable at spawn and grow continuously into true perspective', () => {
  const samples = [4.4, 8, 15, 24.7, 30, 42];
  const visual = samples.map(gateVisualScale);
  assert.ok(visual[0] >= 15, 'spawn-distance gates get a readable projected floor');
  for (let i = 1; i < visual.length; i++) {
    assert.ok(visual[i] > visual[i - 1], 'gate geometry grows continuously toward the player');
  }
  assert.equal(gateVisualScale(30), 30, 'the exaggeration meets true perspective');
  assert.equal(gateVisualScale(42), 42, 'near gates use true perspective exactly');
  assert.ok(gateVisualScale(24.7) - 24.7 < 0.6, 'the default camera is effectively true at crossing');
});

test('the whole distant gate pair spreads with its signs and fitted multiplier copy', () => {
  const scale = gateVisualScale(4.4);
  const gateWidth = 1.95 * 2 * scale;
  const pairSeparation = 2.45 * 2 * scale;
  assert.ok(pairSeparation - gateWidth >= 8, 'paired signs retain a visible neutral gap');

  const panelHeight = 2.3 * scale;
  const short = gateSignFontSize('×2', gateWidth, panelHeight);
  const fractional = gateSignFontSize('×1.7', gateWidth, panelHeight);
  assert.ok(short >= 13 && fractional >= 13, 'both labels are readable at first sight');
  assert.equal(fractional, short, 'a fractional multiplier keeps the primary sign size');
  for (const label of ['×2', '×1.7', 'DANGER AHEAD']) {
    const size = gateSignFontSize(label, gateWidth, panelHeight);
    assert.ok(size * label.length * 0.62 <= gateWidth * 0.82 + 1e-9, `${label} fits its panel`);
  }
});
