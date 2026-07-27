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
let loadSave;
let TUNE;
before(async () => {
  ({ Game } = await import('../js/game.js'));
  ({ loadSave, TUNE } = await import('../js/config.js'));
});

function seeded(seed) {
  return function random() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function makeGame(mode, level, speed = 'normal', onRunEnd = noop) {
  const save = Object.assign(loadSave(), { mode, level, speed, tutorialSeen: true });
  const game = new Game(fakeCanvas(), save, {
    onHud: noop, onRunEnd, onTutorial: noop, onPause: noop,
  });
  game.resize(430, 900);
  return game;
}

const LANES = [-3.1, -2.4, -1.2, 0, 1.2, 2.4, 3.1];
const gateWorth = (gate, worth) => {
  if (gate.op === 'add') return worth + gate.val;
  if (gate.op === 'mul') return worth * gate.val;
  if (gate.op === 'sub') return Math.max(0, worth - gate.val);
  return Math.ceil(worth / gate.val);
};
const safestLane = (threats, fallback = 0) => LANES
  .filter((lane) => threats.every((threat) => Math.abs(lane - threat.x) >= (threat.halfW || 0.75) + 0.5))
  .sort((a, b) => Math.abs(a - fallback) - Math.abs(b - fallback))[0]
  ?? -Math.sign(fallback || 1) * TUNE.laneHalf;

function steerCompetently(game) {
  if (game.redstone >= TUNE.redstoneMax) game.summonGolem();
  if (game.state === 'boss') {
    const waves = game.waves.filter((wave) => !wave.dead);
    if (waves.length) {
      game.targetX = safestLane(waves, game.playerX);
      return;
    }
    const crystal = game.crystals?.find((item) => !item.dead);
    game.targetX = crystal ? crystal.x : (game.boss?.x || 0);
    return;
  }

  const distance = (item) => item.z - game.playerZ;
  const obstacles = game.obstacles.filter((item) => item.hp > 0 && distance(item) > 0 && distance(item) < 13);
  if (obstacles.length) {
    const nearest = Math.min(...obstacles.map(distance));
    game.targetX = safestLane(obstacles.filter((item) => Math.abs(distance(item) - nearest) < 1.5), game.playerX);
    return;
  }
  const gates = game.gates.filter((gate) => !gate.used && distance(gate) > 0 && distance(gate) < 32);
  if (gates.length) {
    const nearest = Math.min(...gates.map(distance));
    const pair = gates.filter((gate) => Math.abs(distance(gate) - nearest) < 0.1);
    pair.sort((a, b) => gateWorth(b, game.worth()) - gateWorth(a, game.worth()));
    game.targetX = pair[0].x;
    return;
  }
  const enemies = game.enemies.filter((enemy) => !enemy.dead && distance(enemy) > 0 && distance(enemy) < 17);
  if (enemies.length) {
    if (game.mode === 'shooter') {
      enemies.sort((a, b) => distance(a) - distance(b));
      game.targetX = enemies[0].x;
    } else {
      game.targetX = safestLane(enemies.map((enemy) => ({ x: enemy.x, halfW: 0.9 })), game.playerX);
    }
  }
}

function simulate(mode, level, active, speed = 'normal') {
  const originalRandom = Math.random;
  Math.random = seeded(level * 101 + (mode === 'gates' ? 7 : 3));
  let result = null;
  const game = makeGame(mode, level, speed, (value) => { result = value; });
  try {
    game.startRun();
    let ticks = 0;
    while ((game.state === 'run' || game.state === 'boss') && !game.bossDead && ticks < 18000) {
      if (active) steerCompetently(game);
      game.update(1 / 60);
      ticks++;
    }
    return game.bossDead || result?.win === true;
  } finally {
    game.destroy();
    Math.random = originalRandom;
  }
}

test('normal gates require a lane and generated choices remain fair', () => {
  let freePairs = 0;
  let freeGoodGood = 0;
  let riskPairs = 0;
  const goodSides = new Set();

  for (let level = 1; level <= 20; level++) {
    const game = makeGame('shooter', level);
    game.startRun();
    const gates = game.events.filter((event) => event.type === 'gate');
    const byZ = new Map();
    for (const gate of gates) byZ.set(gate.z, [...(byZ.get(gate.z) || []), gate]);
    for (const pair of byZ.values()) {
      assert.equal(pair.length, 2);
      assert.ok(pair.every((gate) => Math.abs(gate.x) <= TUNE.laneHalf));
      assert.ok(pair.every((gate) => Math.abs(gate.x) >= gate.halfW + TUNE.gateHitMargin),
        `level ${level} center must overlap neither gate`);
      assert.ok(pair.some((gate) => game.gateGood(gate)), `level ${level} needs a non-losing choice`);
      if (level === 1) assert.ok(pair.every((gate) => game.gateGood(gate)));

      const risky = pair.find((gate) => gate.risk);
      if (risky) {
        riskPairs++;
        assert.ok(game.events.some((event) => event.type === 'obstacle'
          && Math.abs(event.z - (risky.z + 12)) < 0.1
          && Math.abs(event.x - risky.x) < 1.3));
        const nextRow = game.events.find((event) => event.z > risky.z + 12.1);
        assert.ok(!nextRow || nextRow.z - (risky.z + 12) >= 10,
          `level ${level} leaves time to cross after the risk lane`);
      } else if (level > 1) {
        freePairs++;
        if (pair.every((gate) => game.gateGood(gate))) freeGoodGood++;
        const onlyGood = pair.filter((gate) => game.gateGood(gate));
        if (onlyGood.length === 1) goodSides.add(Math.sign(onlyGood[0].x));
      }
    }
    game.destroy();
  }

  assert.ok(freeGoodGood / freePairs <= 0.3, 'free good-good pairs stay uncommon after level 1');
  assert.deepEqual([...goodSides].sort(), [-1, 1]);
  assert.ok(riskPairs > 0, 'the safe-growth versus reward-and-dodge choice is generated');
});

test('passive and competent players separate across the normal campaign', { timeout: 30000 }, () => {
  for (const mode of ['shooter', 'gates']) {
    let passiveWins = 0;
    let competentWins = 0;
    for (let level = 2; level <= 20; level++) {
      if (simulate(mode, level, false)) passiveWins++;
      if (simulate(mode, level, true)) competentWins++;
    }
    assert.ok(passiveWins <= 4, `${mode} passive wins ${passiveWins}/19`);
    assert.ok(competentWins >= 16, `${mode} competent wins ${competentWins}/19`);
  }
});

test('boss health is expected-power based and a strong arrival keeps its advantage', () => {
  for (const mode of ['shooter', 'gates']) {
    const weak = makeGame(mode, 6);
    const strong = makeGame(mode, 6);
    weak.startRun();
    strong.startRun();
    weak.setWorth(4, true);
    strong.setWorth(80, true);
    weak.playerZ = weak.length;
    strong.playerZ = strong.length;
    weak.startBoss();
    strong.startBoss();
    assert.equal(weak.boss.maxHp, strong.boss.maxHp);
    for (const game of [weak, strong]) {
      game.boss.entering = false;
      game.boss.z = game.boss.targetZ;
      game.boss.attackT = 999;
      for (let tick = 0; tick < 90 && !game.bossDead && game.state === 'boss'; tick++) game.update(1 / 60);
    }
    const weakDamage = weak.boss.maxHp - Math.max(0, weak.boss.hp);
    const strongDamage = strong.boss.maxHp - Math.max(0, strong.boss.hp);
    assert.ok(strongDamage > weakDamage, `${mode} strong ${strongDamage} > weak ${weakDamage}`);
    weak.destroy();
    strong.destroy();
  }
});

test('graduated crowd retention is graded in effective-power units', () => {
  let result = null;
  const game = makeGame('shooter', 8, 'normal', (value) => { result = value; });
  game.startRun();
  game.setWorth(15000, true);
  const power = game.armyPower();
  game.bestCrowd = power;
  game.killRunners(10, null, null, false);
  const finalPower = game.armyPower();
  assert.equal(game.mastery.damageTaken, power - finalPower);
  game.endRun(false);
  assert.equal(result.mastery.finalCrowd, finalPower);
  assert.equal(result.mastery.bestCrowd, power);
  game.destroy();
});

test('a par run gets an active boss phase instead of a one-hit ending', () => {
  for (const mode of ['shooter', 'gates']) {
    for (const level of [1, 6, 12, 20]) {
      const game = makeGame(mode, level);
      game.startRun();
      const par = game.expectedBossArmy();
      game.setWorth(par.power, true);
      game.playerZ = game.length;
      game.startBoss();
      game.boss.entering = false;
      game.boss.z = game.boss.targetZ;
      let ticks = 0;
      while (game.state === 'boss' && !game.bossDead && ticks < 1200) {
        game.boss.attackT = 999;
        game.targetX = game.boss.x;
        game.update(1 / 60);
        ticks++;
      }
      const seconds = ticks / 60;
      assert.equal(game.bossDead, true, `${mode} level ${level} par run clears`);
      assert.ok(seconds >= 3 && seconds <= 12,
        `${mode} level ${level} par boss lasts ${seconds.toFixed(1)}s`);
      game.destroy();
    }
  }
});

test('multi-phase damage stops at each shield threshold', () => {
  const game = makeGame('shooter', 8);
  game.startRun();
  game.startBoss();
  game.boss.entering = false;
  game.boss.phases = 3;
  game.boss.phase = 1;
  game.boss.hp = game.boss.maxHp = 300;
  assert.equal(game.damageBoss(999), true);
  assert.equal(game.boss.hp, 200);
  assert.equal(game.boss.phase, 2);
  assert.ok(game.boss.shielded > 0);
  assert.equal(game.damageBoss(999), false);
  assert.equal(game.boss.hp, 200);
  game.boss.shielded = 0;
  game.damageBoss(999);
  assert.equal(game.boss.hp, 100);
  assert.equal(game.boss.phase, 3);
  game.destroy();
});

test('each active boss lane attack is warned and leaves reachable safety', () => {
  const game = makeGame('gates', 8);
  game.startRun();
  game.setWorth(40, true);
  game.startBoss();
  game.boss.entering = false;
  game.boss.type = { ...game.boss.type, attacks: ['shockwave', 'sonicboom', 'charge'] };
  game.bossAttack();
  game.bossAttack();
  game.bossAttack();
  assert.equal(game.waves.length, 3);
  for (const wave of game.waves) {
    assert.ok(wave.warn > 0);
    assert.ok(LANES.some((lane) => Math.abs(lane - wave.x) >= wave.halfW + 0.4),
      `wave at ${wave.x} width ${wave.halfW} needs a safe lane`);
  }
  game.destroy();
});

test('dodge credit requires escaping a lane that originally threatened the player', () => {
  const game = makeGame('gates', 8);
  game.startRun();
  game.startBoss();
  game.boss.entering = false;

  game.playerX = 0;
  game.spawnBossWave({ x: 2.2, halfW: 1.7, z: game.playerZ + 0.5, warn: 0, speed: 1, kills: 1 });
  game.updateWaves(1 / 60);
  assert.equal(game.mastery.dodges, 0, 'passive safety is not a dodge');

  game.playerX = 0;
  game.spawnBossWave({ x: 0, halfW: 1.3, z: game.playerZ + 0.5, warn: 0, speed: 1, kills: 1 });
  game.playerX = 3.1;
  game.updateWaves(1 / 60);
  assert.equal(game.mastery.dodges, 1, 'leaving a threatened lane is a dodge');
  game.destroy();
});

test('crystals take arrow hits before the guarded boss behind them', () => {
  const game = makeGame('shooter', 8);
  game.startRun();
  game.startBoss();
  game.boss.entering = false;
  game.boss.z = game.boss.targetZ;
  const crystal = {
    x: game.boss.x, z: game.boss.z - 1, hp: 10, t: 0, dead: false,
  };
  game.crystals = [crystal];
  game.boss.guarded = true;
  const hp = game.boss.hp;
  const arrow = { x: crystal.x, z: crystal.z, dmg: 4 };
  game.arrowHitTest(arrow);
  assert.equal(arrow.dead, true);
  assert.equal(crystal.hp, 6);
  assert.equal(game.boss.hp, hp);
  game.destroy();
});

test('an active turbo charge is not restarted by the attack timer', () => {
  const game = makeGame('gates', 20, 'turbo');
  game.startRun();
  game.startBoss();
  game.boss.entering = false;
  game.boss.lunge = 0.4;
  game.boss.lungeWarn = 0.55;
  game.boss.chargeX = game.playerX;
  game.boss.attackT = 0;
  const attackIdx = game.boss.attackIdx;
  game.updateBoss(1 / 60);
  assert.ok(game.boss.lunge > 0.4);
  assert.equal(game.boss.attackIdx, attackIdx);
  game.destroy();
});

test('CALM releases a ready golem automatically while NORMAL waits', () => {
  const calm = makeGame('shooter', 2, 'calm');
  const normal = makeGame('shooter', 2, 'normal');
  calm.startRun();
  normal.startRun();
  calm.redstone = TUNE.redstoneMax;
  normal.redstone = TUNE.redstoneMax;
  calm.update(1 / 60);
  normal.update(1 / 60);
  assert.equal(calm.summons.length, 1);
  assert.equal(normal.summons.length, 0);
  assert.equal(normal.redstone, TUNE.redstoneMax);
  calm.redstone = 0;
  calm.golemHintShown = false;
  calm.updateArrows = () => { calm.redstone = TUNE.redstoneMax; };
  calm.update(1 / 60);
  assert.equal(calm.golemHintShown, false, 'CALM does not show a disabled manual-release hint');
  calm.destroy();
  normal.destroy();
});

test('competent CALM play remains completable across the level curve', () => {
  for (const mode of ['shooter', 'gates']) {
    for (const level of [1, 5, 10, 15, 20]) {
      assert.equal(simulate(mode, level, true, 'calm'), true, `${mode} CALM level ${level}`);
    }
  }
});

test('aim assist does not shoot across the whole track', () => {
  const game = makeGame('shooter', 3);
  game.startRun();
  game.playerX = -2.8;
  game.targetX = -2.8;
  game.enemies = [];
  game.spawnEnemy(game.biome.enemies[0], 2.8, game.playerZ + 10);
  game.fireVolley();
  assert.ok(game.arrows.length > 0);
  assert.ok(game.arrows.every((arrow) => Math.abs(arrow.vx) <= 0.5),
    'an enemy in the opposite lane stays outside aim assist');
  game.destroy();
});
