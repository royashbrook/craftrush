import { before, test } from 'node:test';
import assert from 'node:assert/strict';

const noop = () => {};
function fakeCtx() {
  return new Proxy({ canvas: { width: 0, height: 0 } }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'measureText') return () => ({ width: 0 });
      return noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}
function fakeCanvas() {
  return {
    width: 430,
    height: 900,
    getContext: () => fakeCtx(),
    toDataURL: () => 'data:,',
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
  };
}

globalThis.document = { createElement: fakeCanvas, getElementById: () => null };
globalThis.window = { addEventListener: noop, removeEventListener: noop };

let Game;
let GOLEM_GRANT_PROGRESS;
let GOLEM_SMASH_WINDOW;
let TUNE;
let loadSave;

before(async () => {
  ({ Game } = await import('../js/game.js'));
  ({ GOLEM_GRANT_PROGRESS, GOLEM_SMASH_WINDOW } = await import('../js/combat.js'));
  ({ TUNE, loadSave } = await import('../js/config.js'));
});

function makeGame(mode = 'shooter', level = 1, speed = 'normal') {
  const save = Object.assign(loadSave(), {
    mode, level, speed, tutorialSeen: true,
  });
  const game = new Game(fakeCanvas(), save, {
    onHud: noop,
    onRunEnd: noop,
    onTutorial: noop,
    onPause: noop,
  });
  game.resize(430, 900);
  game.startRun();
  return game;
}

function clearTrack(game) {
  game.enemies = [];
  game.gates = [];
  game.obstacles = [];
  game.pickups = [];
  game.arrows = [];
  game.eshots = [];
  game.crystals = [];
  game.boss = null;
}

test('three golem grants use the same progress in every mode, level, and pace', () => {
  assert.deepEqual(GOLEM_GRANT_PROGRESS, [1 / 3, 2 / 3, 1]);
  for (const mode of ['shooter', 'gates']) {
    for (const level of [1, 7, 20]) {
      for (const speed of ['calm', 'normal', 'fast', 'turbo']) {
        const game = makeGame(mode, level, speed);
        clearTrack(game);
        for (const threshold of GOLEM_GRANT_PROGRESS) {
          game.updateGolemChargeProgress(threshold - 0.0001);
          assert.equal(game.golemGrantLog.length,
            GOLEM_GRANT_PROGRESS.filter((value) => value < threshold).length,
            `${mode} L${level} ${speed} stays below ${threshold}`);
          game.updateGolemChargeProgress(threshold);
          if (speed !== 'calm') game.summonGolem();
        }
        assert.deepEqual(
          game.golemGrantLog.map((grant) => grant.progress),
          GOLEM_GRANT_PROGRESS,
          `${mode} L${level} ${speed}`,
        );
        assert.equal(game.golemGrantLog.length, 3);
        assert.ok(game.golemGrantLog.every((grant) => grant.awarded));
        assert.equal(game.mastery.golemSends, 3);
        game.destroy();
      }
    }
  }
});

test('the meter previews the same next grant at equal track progress', () => {
  const samples = [];
  for (const [mode, level, speed] of [
    ['shooter', 1, 'calm'],
    ['shooter', 20, 'turbo'],
    ['gates', 4, 'normal'],
    ['gates', 13, 'fast'],
  ]) {
    const game = makeGame(mode, level, speed);
    clearTrack(game);
    game.updateGolemChargeProgress(1 / 3);
    if (speed !== 'calm') game.summonGolem();
    game.updateGolemChargeProgress(0.5);
    samples.push({
      charge: game.redstone,
      grants: game.golemGrantIdx,
      next: game.hudState().nextGolemGrant,
    });
    game.destroy();
  }
  for (const sample of samples) {
    assert.ok(Math.abs(sample.charge - TUNE.redstoneMax / 2) < 0.0001);
    assert.equal(sample.grants, 1);
    assert.equal(sample.next, 2 / 3);
  }
});

test('holding a charge wastes the later grant instead of stacking it', () => {
  const game = makeGame();
  clearTrack(game);
  game.updateGolemChargeProgress(1 / 3);
  assert.equal(game.redstone, TUNE.redstoneMax);
  game.updateGolemChargeProgress(2 / 3);
  assert.deepEqual(
    game.golemGrantLog.map(({ awarded, wasted }) => ({ awarded, wasted })),
    [
      { awarded: true, wasted: false },
      { awarded: false, wasted: true },
    ],
  );

  game.summonGolem();
  game.updateGolemChargeProgress(3 / 4);
  assert.ok(Math.abs(game.redstone - TUNE.redstoneMax / 4) < 0.0001);
  game.updateGolemChargeProgress(1);
  assert.equal(game.redstone, TUNE.redstoneMax);
  assert.equal(game.golemGrantLog.length, 3);
  assert.equal(game.golemGrantLog[2].awarded, true);
  assert.equal(game.mastery.golemSends, 1);
  game.destroy();
});

test('CALM auto-sends at the same three thresholds', () => {
  const game = makeGame('gates', 9, 'calm');
  clearTrack(game);
  for (let i = 0; i < GOLEM_GRANT_PROGRESS.length; i++) {
    game.updateGolemChargeProgress(GOLEM_GRANT_PROGRESS[i]);
    assert.equal(game.summons.length, i + 1);
    assert.equal(game.redstone, 0);
  }
  assert.deepEqual(game.golemGrantLog.map((grant) => grant.progress), GOLEM_GRANT_PROGRESS);
  assert.equal(game.mastery.golemSends, 3);
  game.destroy();
});

test('the CALM boss-arrival send targets the encounter and waits through its entrance', () => {
  const game = makeGame('shooter', 1, 'calm');
  game.golemGrantIdx = 2;
  game.redstone = 0;
  game.golemGrantLog = [];
  game.playerZ = game.length - 0.01;

  game.update(1 / 60);

  assert.equal(game.state, 'boss');
  assert.equal(game.golemGrantLog.length, 1);
  assert.equal(game.golemGrantLog[0].progress, 1);
  assert.equal(game.summons.length, 1);
  assert.equal(game.summons[0].source, 'auto');
  assert.equal(game.boss.entering, true);

  game.summons[0].z = game.boss.z;
  game.updateSummons(0);
  assert.equal(game.summons.length, 1, 'the entrance cannot consume or lose the summon');
  assert.equal(game.mastery.usefulGolems, 0);

  game.boss.entering = false;
  game.updateSummons(0);
  assert.equal(game.summons.length, 0);
  assert.equal(game.mastery.usefulGolems, 1);
  assert.equal(game.mastery.golemHits, 1);
  game.destroy();
});

test('expeditions receive the same progress grants', () => {
  const game = makeGame();
  game.startRun({
    id: 'golem-test',
    name: 'Golem Test',
    level: 11,
    mode: 'gates',
    biome: 'forest',
    mut: { speedMul: 1.2 },
  });
  clearTrack(game);
  for (const threshold of GOLEM_GRANT_PROGRESS) {
    game.updateGolemChargeProgress(threshold);
    game.summonGolem();
  }
  assert.deepEqual(game.golemGrantLog.map((grant) => grant.progress), GOLEM_GRANT_PROGRESS);
  assert.equal(game.mastery.golemSends, 3);
  game.destroy();
});

test('hits, kills, giant arrows, and Gate Dash emeralds cannot add charges', () => {
  const game = makeGame('gates');
  clearTrack(game);
  game.redstone = 41;

  const enemy = {
    id: 'zombie',
    x: 0,
    z: 5,
    hp: 2,
    maxHp: 2,
    dead: false,
    flash: 0,
    type: {},
  };
  game.damageEnemy(enemy, 1);
  assert.equal(game.redstone, 41);
  game.arrowHitTest({ x: 0, z: 5, dmg: 2, big: true, dead: false });
  assert.equal(game.redstone, 41);
  game.collect({ kind: 'emerald', x: 0, z: 5, dead: false });
  assert.equal(game.redstone, 41);
  game.destroy();
});

test('one summon is useful once while every meaningful collision is counted', () => {
  const game = makeGame();
  clearTrack(game);
  const startZ = game.playerZ + 1.5;
  const perfectZ = startZ + 8;
  game.enemies = [0, 0.6].map((x) => ({
    id: 'zombie',
    x,
    z: perfectZ,
    hp: 1,
    maxHp: 1,
    dead: false,
    flash: 0,
    type: {},
  }));
  game.redstone = TUNE.redstoneMax;
  game.summonGolem();
  const summon = game.summons[0];
  assert.equal(summon.perfectTiming, false, 'timing is unknown until a real impact');
  summon.t = (GOLEM_SMASH_WINDOW.min + GOLEM_SMASH_WINDOW.max) / 2;
  summon.z = perfectZ;
  game.updateSummons(0);

  assert.equal(game.mastery.golemSends, 1);
  assert.equal(game.mastery.usefulGolems, 1);
  assert.equal(game.mastery.golemHits, 2);
  assert.equal(summon.impactCount, 2);
  assert.equal(summon.perfectTiming, true);
  assert.ok(game.floaties.some((item) => item.text === 'PERFECT SMASH!'));
  game.destroy();
});

test('perfect smash uses actual first-impact time with inclusive authored boundaries', () => {
  const samples = [
    ['immediate', 0, false],
    ['just early', GOLEM_SMASH_WINDOW.min - 0.001, false],
    ['minimum boundary', GOLEM_SMASH_WINDOW.min, true],
    ['maximum boundary', GOLEM_SMASH_WINDOW.max, true],
    ['just late', GOLEM_SMASH_WINDOW.max + 0.001, false],
  ];
  for (const [label, impactT, expectedPerfect] of samples) {
    const game = makeGame();
    clearTrack(game);
    const enemy = {
      id: 'zombie',
      x: game.playerX,
      z: game.playerZ + 8,
      hp: 1,
      maxHp: 1,
      dead: false,
      flash: 0,
      type: {},
    };
    game.enemies = [enemy];
    game.redstone = TUNE.redstoneMax;
    game.summonGolem();
    const summon = game.summons[0];
    summon.t = impactT;
    summon.z = enemy.z;
    game.updateSummons(0);

    assert.equal(summon.firstImpactT, impactT, label);
    assert.equal(summon.perfectTiming, expectedPerfect, label);
    assert.ok(
      game.floaties.some((item) =>
        item.text === (expectedPerfect ? 'PERFECT SMASH!' : 'SMASH!')),
      label,
    );
    game.destroy();
  }
});

test('a replacement target keeps a well-timed first impact perfect', () => {
  const game = makeGame();
  clearTrack(game);
  const z = game.playerZ + 12;
  const original = {
    id: 'zombie',
    x: game.playerX,
    z,
    hp: 1,
    maxHp: 1,
    dead: false,
    flash: 0,
    type: {},
  };
  game.enemies = [original];
  game.redstone = TUNE.redstoneMax;
  game.summonGolem();
  const summon = game.summons[0];

  // Bow Blitz can erase the thing visible at release. The replacement collision
  // is still judged by when it actually happened, never by stale object identity.
  original.dead = true;
  const replacement = { ...original, dead: false };
  game.enemies.push(replacement);
  summon.t = (GOLEM_SMASH_WINDOW.min + GOLEM_SMASH_WINDOW.max) / 2;
  summon.z = replacement.z;
  game.updateSummons(0);

  assert.equal(replacement.dead, true);
  assert.equal(summon.perfectTiming, true);
  assert.ok(game.floaties.some((item) => item.text === 'PERFECT SMASH!'));
  game.destroy();
});

test('the held boss is inside the actual smash window at every mode and pace', () => {
  for (const mode of ['shooter', 'gates']) {
    for (const speed of ['calm', 'normal', 'fast', 'turbo']) {
      const game = makeGame(mode, 20, speed);
      clearTrack(game);
      game.state = 'boss';
      game.boss = {
        x: game.playerX,
        z: game.playerZ + 10,
        entering: false,
        flash: 0,
      };
      game.damageBoss = () => true;
      game.redstone = TUNE.redstoneMax;
      game.summonGolem();
      const summon = game.summons[0];
      for (let tick = 0; tick < 600 && game.summons.length; tick++) {
        game.updateSummons(1 / 240);
      }

      assert.equal(game.summons.length, 0, `${mode} ${speed} reaches the boss`);
      assert.ok(
        summon.firstImpactT >= GOLEM_SMASH_WINDOW.min
          && summon.firstImpactT <= GOLEM_SMASH_WINDOW.max,
        `${mode} ${speed} impact at ${summon.firstImpactT}`,
      );
      assert.equal(summon.perfectTiming, true, `${mode} ${speed}`);
      game.destroy();
    }
  }
});

test('an empty send never counts as useful', () => {
  const game = makeGame();
  clearTrack(game);
  game.redstone = TUNE.redstoneMax;
  game.summonGolem();
  game.summons[0].z = game.playerZ + TUNE.golemRange + 1;
  game.updateSummons(0);
  assert.equal(game.summons.length, 0);
  assert.equal(game.mastery.golemSends, 1);
  assert.equal(game.mastery.usefulGolems, 0);
  assert.equal(game.mastery.golemHits, 0);
  game.destroy();
});

test('a guarded or phase-shielded boss does not consume the golem', () => {
  const game = makeGame();
  clearTrack(game);
  game.state = 'boss';
  game.speed = 0;
  game.boss = {
    x: 0,
    z: game.playerZ + 10,
    entering: false,
    flash: 0,
  };
  let protectedBoss = true;
  let attempts = 0;
  game.damageBoss = () => {
    attempts++;
    return !protectedBoss;
  };
  game.redstone = TUNE.redstoneMax;
  game.summonGolem();
  game.summons[0].z = game.boss.z;
  game.updateSummons(0);
  assert.equal(attempts, 1);
  assert.equal(game.summons.length, 1);
  assert.equal(game.mastery.usefulGolems, 0);

  protectedBoss = false;
  game.updateSummons(0);
  assert.equal(attempts, 2);
  assert.equal(game.summons.length, 0);
  assert.equal(game.mastery.usefulGolems, 1);
  assert.equal(game.mastery.golemHits, 1);
  game.destroy();
});

test('crystals intercept golems before the guarded boss', () => {
  const game = makeGame();
  clearTrack(game);
  game.state = 'boss';
  game.speed = 0;
  game.boss = {
    x: 0,
    z: game.playerZ + 12,
    entering: false,
    guarded: true,
    flash: 0,
  };
  const crystal = {
    x: 0,
    z: game.playerZ + 8,
    hp: 30,
    dead: false,
    t: 0,
  };
  game.crystals = [crystal];
  let bossAttempts = 0;
  game.damageBoss = () => { bossAttempts++; return false; };
  game.crystalDown = (target) => { target.dead = true; };
  game.redstone = TUNE.redstoneMax;
  game.summonGolem();
  game.summons[0].z = crystal.z;
  game.updateSummons(0);

  assert.equal(crystal.dead, true);
  assert.equal(bossAttempts, 0);
  assert.equal(game.summons.length, 0);
  assert.equal(game.mastery.usefulGolems, 1);
  assert.equal(game.mastery.golemHits, 1);
  game.destroy();
});
