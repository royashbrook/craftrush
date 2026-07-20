import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CombatMixin } from '../js/combat.js';
import { TIERS } from '../js/config.js';

// Headless integration harness: inject the combat mixin onto a bare object with
// tiny stubs and drive real update ticks. Audio is already a no-op in node.
function fakeGame(overrides = {}) {
  return Object.assign({
    playerX: 0, playerZ: 0, mode: 'shooter', bossDead: false,
    redstone: 0, runEmeralds: 0, runRods: 0,
    gates: [], obstacles: [], pickups: [],
    crowd: [], bigs: TIERS.units.map(() => []), _units: [],
    biome: { dropsRods: false },
    burst() {}, floaty() {}, breakObstacle() {}, killRunners() {}, damageEnemy() {},
    openChest(p) { p.dead = true; this.runEmeralds += 10; },
  }, CombatMixin, overrides);
}

test('a giant-only army collects an emerald it runs over (regression)', () => {
  const g = fakeGame();
  g._units = [{ ox: 0, oz: 0 }]; // one giant unit, zero tier-0 runners
  g.pickups = [{ kind: 'emerald', x: 0.4, z: 0.2, t: 0 }];
  g.updateGatesObstaclesPickups(1 / 60);
  assert.equal(g.pickups.length, 0, 'emerald should be collected and filtered out');
  assert.ok(g.runEmeralds > 0, 'emeralds banked');
});

test('an emerald run over off-center in the lane is swept up, never left behind', () => {
  const g = fakeGame();
  g._units = [{ ox: 0, oz: 0 }];
  g.pickups = [{ kind: 'emerald', x: 2.4, z: -1.0, t: 0 }]; // behind the crowd, in lane
  g.updateGatesObstaclesPickups(1 / 60);
  assert.ok(g.runEmeralds > 0, 'in-lane run-over is collected by the safety sweep');
});

test('an emerald far outside the lane is NOT auto-collected', () => {
  const g = fakeGame();
  g._units = [{ ox: 0, oz: 0 }];
  g.pickups = [{ kind: 'emerald', x: 6, z: -1.0, t: 0 }]; // way off to the side
  g.updateGatesObstaclesPickups(1 / 60);
  assert.equal(g.runEmeralds, 0, 'the player never went near it');
});
