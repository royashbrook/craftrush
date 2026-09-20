import test from 'node:test';
import assert from 'node:assert/strict';
import { BossMixin } from '../js/boss.ts';
import { CombatMixin } from '../js/combat.ts';
import { TUNE } from '../js/config.ts';

const noop = () => {};
function victory(level, mode) {
  const pickups = [];
  // A regressed allocator fails at the 65th push, never by exhausting memory.
  pickups.push = function (pickup) {
    assert.ok(this.length < 64, 'victory fountain exceeds 64 rendered pickups');
    return Array.prototype.push.call(this, pickup);
  };
  const later = [];
  const game = Object.assign({}, BossMixin, CombatMixin, {
    level, mode, state: 'boss', boss: { x: 0, z: 10 }, bossDead: false,
    cam: {}, enemies: [], pickups, eshots: [], waves: [], gates: [], obstacles: [],
    playerX: 0, playerZ: 0, _units: [], runEmeralds: 0,
    explode: noop, burst: noop, damageEnemy: noop,
    _later: (fn, ms) => later.push({ fn, ms }),
    endRun: win => { game.result = win; },
  });
  return { game, later };
}

for (const mode of ['shooter', 'gates']) {
  for (const level of [1, 28, 29, 1000, 1e12, Number.MAX_SAFE_INTEGER - 15, Number.MAX_SAFE_INTEGER - 4, Number.MAX_SAFE_INTEGER]) {
    test(`victory is bounded without losing reward at level ${level} (${mode})`, () => {
      const { game, later } = victory(level, mode);
      game.bossDefeated();
      const count = game.pickups.length;
      assert.equal(count, Math.min(64, 8 + level * 2));
      assert.ok(game.pickups.every(p => Number.isFinite(p.quantity ?? 1) && (p.quantity ?? 1) >= 1));
      game.bossDefeated();
      assert.equal(game.pickups.length, count, 'a duplicate defeat cannot award again');
      assert.equal(later.length, 6, 'five fireworks and the unchanged settlement callback');
      assert.equal(later.at(-1).ms, 1900);
      // Exercise the production victory vacuum and collection path twice.
      game.updateGatesObstaclesPickups(1);
      assert.equal(game.pickups.length, 0);
      assert.equal(game.runEmeralds, (8 + level * 2) * TUNE.emeraldPickup);
      game.updateGatesObstaclesPickups(1);
      assert.equal(game.runEmeralds, (8 + level * 2) * TUNE.emeraldPickup);
      later.at(-1).fn();
      assert.equal(game.result, true);
    });
  }
}

test('ordinary unweighted emerald pickups retain their value', () => {
  const { game } = victory(1, 'shooter');
  game.pickups.push({ kind: 'emerald', x: 0, z: 0, t: 0 });
  game.updateGatesObstaclesPickups(0);
  assert.equal(game.runEmeralds, TUNE.emeraldPickup);
});

test('numeric-boundary bundles retain the formula total in either collection order', () => {
  for (const boundary of [2 ** 51, 2 ** 52, Number.MAX_SAFE_INTEGER]) {
    for (let offset = 0; offset < 128; offset++) {
      for (const reversed of [false, true]) {
        const level = boundary - offset;
        const { game } = victory(level, 'shooter');
        game.bossDefeated();
        if (reversed) game.pickups.reverse();
        game.updateGatesObstaclesPickups(1);
        assert.equal(game.runEmeralds, (8 + level * 2) * TUNE.emeraldPickup, `level ${level}, reversed ${reversed}`);
      }
    }
  }
});
