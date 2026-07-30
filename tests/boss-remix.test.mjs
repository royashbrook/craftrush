import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BossMixin } from '../js/boss.js';
import { CombatMixin } from '../js/combat.js';

const noop = () => {};

function harness(runStyle, mode = 'shooter', overrides = {}) {
  const spawned = [];
  const game = Object.assign({}, BossMixin, CombatMixin, {
    level: 6,
    mode,
    save: { speed: 'normal' },
    biome: {
      runStyle,
      enemies: ['zombie', 'skeleton', 'creeper', 'spider'],
    },
    playerX: 0,
    playerZ: 0,
    waves: [],
    bossDead: false,
    boss: {
      z: 10,
      targetZ: 10,
      x: 0,
      t: 0,
      flash: 0,
      entering: false,
      attackT: 99,
      attackIdx: 0,
      rhythmIdx: 0,
      remixIdx: 0,
      lunge: 0,
      shielded: 0,
      phases: 1,
      phase: 1,
    },
    cam: { shake: 0 },
    spawnEnemy: (id, x, z) => spawned.push({ id, x, z }),
    floaty: noop,
    updateCrystals: noop,
    checkBossPhase: noop,
    ...overrides,
  });
  return { game, spawned };
}

for (const mode of ['shooter', 'gates']) {
  test(`Plains boss sends a stationary wall with a reachable gap (${mode})`, () => {
    const { game } = harness('open', mode);
    assert.equal(game.bossRemixAttack(), true);
    assert.equal(game.waves.length, 4);
    assert.ok(game.waves.every((wave) => wave.remix === 'plains-wall'));
    assert.ok(game.waves.every((wave) => wave.warn > 0));
    const safeLane = game.waves[0].safeLane;
    assert.ok(game.waves.every((wave) =>
      Math.abs(wave.x - safeLane) >= wave.halfW + 0.4), 'the marked gap is actually safe');

    const before = game.waves.map((wave) => wave.x);
    game.updateWaves(game.waves[0].warn / 2);
    assert.deepEqual(game.waves.map((wave) => wave.x), before, 'wall lanes stay stationary');
  });

  test(`Forest boss commits visibly before revealing its selected-side ambush (${mode})`, () => {
    const { game, spawned } = harness('fork', mode, { playerX: -2.4 });
    assert.equal(game.bossRemixAttack(), true);
    assert.equal(game.waves.length, 1);
    const warning = game.waves[0];
    assert.equal(warning.remix, 'forest-ambush');
    assert.equal(warning.commitSide, -1);
    assert.ok(warning.warn >= 1.4, 'commitment remains visible before reveal');
    assert.ok(warning.ambush.length >= 2);

    game.updateWaves(warning.warn - 0.01);
    assert.equal(spawned.length, 0, 'nothing exists before the warning expires');
    game.updateWaves(0.02);
    assert.deepEqual(spawned, warning.ambush);
    assert.ok(spawned.every((enemy) => enemy.x < 0), 'the committed side is the side that reveals');
    assert.equal(game.waves.length, 0);
  });

  test(`Desert boss visibly sweeps its warning before locking a safe impact lane (${mode})`, () => {
    const { game } = harness('sweep', mode);
    assert.equal(game.bossRemixAttack(), true);
    assert.equal(game.waves.length, 1);
    const wave = game.waves[0];
    assert.equal(wave.remix, 'desert-sweep');
    const { fromX, toX } = wave.sweep;
    assert.notEqual(fromX, toX);
    game.playerX = 0;

    game.updateWaves(wave.warnTotal / 2);
    assert.ok(Math.abs(wave.x) < 0.01, 'the visible warning crosses the center');
    assert.equal(wave.threatened, true, 'crossing the player lane records a real timing threat');
    game.updateWaves(wave.warnTotal / 2);
    assert.equal(wave.warn, 0);
    assert.ok(Math.abs(wave.x - toX) < 0.001, 'the sweep locks at its deterministic endpoint');
    assert.ok(Math.abs(wave.safeLane - wave.x) >= wave.halfW + 0.4,
      'the opposite impact lane remains reachable');
  });
}

test('a classic biome keeps the existing boss attacks unchanged', () => {
  const { game } = harness('classic');
  assert.equal(game.bossRemixAttack(), false);
  assert.deepEqual(game.waves, []);
  assert.equal(game.boss.remixIdx, 0);
});

test('pilot boss remixes replay identically from the same run state', () => {
  for (const runStyle of ['open', 'fork', 'sweep']) {
    const first = harness(runStyle, 'shooter', { playerX: 2.1 }).game;
    const second = harness(runStyle, 'shooter', { playerX: 2.1 }).game;
    first.bossRemixAttack();
    second.bossRemixAttack();
    assert.deepEqual(first.waves, second.waves, `${runStyle} is deterministic`);
  }
});

test('the biome remix occupies the first scheduled attack beat, then normal rhythm resumes', () => {
  let standardAttacks = 0;
  const { game } = harness('open', 'shooter', {
    bossAttack: () => { standardAttacks++; },
  });
  game.boss.attackT = 0;
  game.updateBoss(1 / 60);
  assert.equal(game.boss.rhythmIdx, 1);
  assert.equal(standardAttacks, 0);
  assert.ok(game.waves.some((wave) => wave.remix === 'plains-wall'));

  game.waves = [];
  game.boss.attackT = 0;
  game.updateBoss(1 / 60);
  assert.equal(game.boss.rhythmIdx, 2);
  assert.equal(standardAttacks, 1);
  assert.deepEqual(game.waves, []);
});
