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
let crowdBossDamageFactor;
before(async () => {
  ({ Game } = await import('../js/game.js'));
  ({ loadSave, TUNE } = await import('../js/config.js'));
  ({ crowdBossDamageFactor } = await import('../js/boss.js'));
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
  if (gate.op === 'scale') return Math.floor(worth * gate.val);
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
    if (game.mode === 'gates') game.charging = true;
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
  const hostileShots = game.eshots.filter((shot) =>
    !shot.dead && distance(shot) > 0 && distance(shot) < 15);
  if (hostileShots.length) {
    const center = hostileShots.reduce((sum, shot) => sum + shot.x, 0) / hostileShots.length;
    const fallback = Math.abs(game.targetX) > 1.8
      ? game.targetX
      : -Math.sign(center || 1) * TUNE.laneHalf;
    game.targetX = safestLane(
      hostileShots.map((shot) => ({ x: shot.x, halfW: 0.9 })),
      fallback,
    );
    return;
  }
  const obstacles = game.obstacles.filter((item) => item.hp > 0 && distance(item) > 0 && distance(item) < 13);
  const gates = game.gates.filter((gate) => !gate.used && distance(gate) > 0 && distance(gate) < 32);
  const obstacleDistance = obstacles.length ? Math.min(...obstacles.map(distance)) : Infinity;
  const gateDistance = gates.length ? Math.min(...gates.map(distance)) : Infinity;
  // Commit to a gate that arrives before the hazard, then use the promised
  // follow-through window to cross away. Never steer through a nearer hazard
  // merely because a later gate is already visible.
  if (gates.length && gateDistance < obstacleDistance - 2) {
    const pair = gates.filter((gate) => Math.abs(distance(gate) - gateDistance) < 0.1);
    pair.sort((a, b) => gateWorth(b, game.worth()) - gateWorth(a, game.worth()));
    game.targetX = pair[0].x;
    return;
  }
  if (obstacles.length) {
    game.targetX = safestLane(
      obstacles.filter((item) => Math.abs(distance(item) - obstacleDistance) < 1.5),
      game.playerX,
    );
    return;
  }
  if (gates.length) {
    const pair = gates.filter((gate) => Math.abs(distance(gate) - gateDistance) < 0.1);
    pair.sort((a, b) => gateWorth(b, game.worth()) - gateWorth(a, game.worth()));
    game.targetX = pair[0].x;
    return;
  }
  const enemies = game.enemies.filter((enemy) => !enemy.dead && distance(enemy) > 0 && distance(enemy) < 32);
  if (enemies.length) {
    if (game.mode === 'shooter') {
      enemies.sort((a, b) => distance(a) - distance(b));
      game.targetX = enemies[0].x;
    } else {
      const center = enemies.reduce((sum, enemy) => sum + enemy.x, 0) / enemies.length;
      const fallback = Math.abs(game.targetX) > 1.8
        ? game.targetX
        : -Math.sign(center || 1) * TUNE.laneHalf;
      game.targetX = safestLane(
        enemies.map((enemy) => ({ x: enemy.x, halfW: 0.9 })),
        fallback,
      );
    }
  }
}

function steerGreedily(game) {
  if (game.state === 'boss') {
    steerCompetently(game);
    return;
  }
  if (game.redstone >= TUNE.redstoneMax) game.summonGolem();
  const distance = (item) => item.z - game.playerZ;
  const gates = game.gates.filter((gate) => !gate.used && distance(gate) > 0 && distance(gate) < 32);
  if (!gates.length) return;
  const nearest = Math.min(...gates.map(distance));
  const pair = gates.filter((gate) => Math.abs(distance(gate) - nearest) < 0.1);
  const risk = pair.find((gate) => gate.risk);
  if (risk) {
    game.targetX = risk.x;
    return;
  }
  pair.sort((a, b) => gateWorth(b, game.worth()) - gateWorth(a, game.worth()));
  game.targetX = pair[0].x;
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
      if (active && game.mode === 'shooter') game.firing = true;
      if (typeof active === 'function') active(game);
      else if (active) steerCompetently(game);
      game.update(1 / 60);
      ticks++;
    }
    const won = game.bossDead || result?.win === true;
    // Production waits for the victory celebration before settling. Finish
    // synchronously here so policy tests can compare the exact shipped grade.
    if (won && !result && (game.state === 'run' || game.state === 'boss')) game.endRun(true);
    return {
      win: won,
      grade: result?.mastery?.grade || null,
      arrivalPower: game.bossArrivalCrowd ?? 0,
      expectedPower: game.expectedBossArmy().power,
      damageTaken: result?.mastery?.damageTaken ?? game.mastery?.damageTaken ?? 0,
      finalCrowd: result?.mastery?.finalCrowd ?? game.armyPower(),
    };
  } finally {
    game.destroy();
    Math.random = originalRandom;
  }
}

function measureBoss(mode, level, speed, arrivalMultiple) {
  const originalRandom = Math.random;
  Math.random = seeded(level * 1009 + arrivalMultiple * 101 + (mode === 'gates' ? 7 : 3));
  const game = makeGame(mode, level, speed);
  try {
    game.startRun();
    const par = game.expectedBossArmy();
    game.setWorth(Math.max(1, Math.round(par.power * arrivalMultiple)), true);
    game.playerZ = game.length;
    game.startBoss();
    game.boss.entering = false;
    game.boss.z = game.boss.targetZ;
    let ticks = 0;
    while (game.state === 'boss' && !game.bossDead && ticks < 1800) {
      game.boss.attackT = 999;
      game.targetX = game.boss.x;
      if (game.mode === 'shooter') game.firing = true;
      if (game.mode === 'gates') game.charging = true;
      game.update(1 / 60);
      ticks++;
    }
    return {
      won: game.bossDead,
      seconds: ticks / 60,
    };
  } finally {
    game.destroy();
    Math.random = originalRandom;
  }
}

test('normal gates require a lane and generated choices remain fair', () => {
  let riskPairs = 0;
  const goodSides = new Set();

  for (let level = 1; level <= 20; level++) {
    const game = makeGame('shooter', level);
    game.startRun();
    const gates = game.events.filter((event) => event.type === 'gate');
    const byZ = new Map();
    for (const gate of gates) byZ.set(gate.z, [...(byZ.get(gate.z) || []), gate]);
    let positivePairs = 0;
    for (const pair of byZ.values()) {
      if (pair.every((gate) => gate.automatic)) {
        assert.equal(pair.length, 1, 'the relief reward is one automatic full-width gate');
        continue;
      }
      assert.equal(pair.length, 2);
      assert.ok(pair.every((gate) => Math.abs(gate.x) <= TUNE.laneHalf));
      assert.ok(pair.every((gate) => Math.abs(gate.x) >= gate.halfW + TUNE.gateHitMargin),
        `level ${level} center must overlap neither gate`);
      assert.ok(pair.some((gate) => game.gateGood(gate)), `level ${level} needs a non-losing choice`);
      positivePairs++;
      assert.equal(pair.filter((gate) => gate.par).length, 1, 'every decision identifies its authored par');
      goodSides.add(Math.sign(pair.find((gate) => gate.par).x));

      const risky = pair.find((gate) => gate.risk);
      if (risky) {
        riskPairs++;
        assert.ok(risky.followThroughZ - risky.z >= 20,
          `level ${level} leaves a readable follow-through window`);
        assert.ok(game.events.some((event) => event.type === 'obstacle'
          && Math.abs(event.z - risky.followThroughZ) < 0.1
          && Math.abs(event.x - risky.x) < 1.3));
      }
    }
    assert.ok(positivePairs >= 3, `level ${level} has at least three positive decisions`);
    game.destroy();
  }

  assert.deepEqual([...goodSides].sort(), [-1, 1]);
  assert.ok(riskPairs > 0, 'the safe-growth versus reward-and-dodge choice is generated');
});

test('passive, greedy, and competent players separate across the normal campaign', { timeout: 30000 }, () => {
  for (const mode of ['shooter', 'gates']) {
    const passive = [];
    const greedy = [];
    const competent = [];
    for (let level = 1; level <= 20; level++) {
      passive.push({ level, ...simulate(mode, level, false) });
      greedy.push({ level, ...simulate(mode, level, steerGreedily) });
      competent.push({ level, ...simulate(mode, level, true) });
    }
    const passiveWins = passive.filter((sample) => sample.win).length;
    const greedyWins = greedy.filter((sample) => sample.win).length;
    const competentWins = competent.filter((sample) => sample.win).length;
    const passiveHighGrades = passive.filter((sample) => ['A', 'S'].includes(sample.grade)).length;
    assert.ok(passiveWins <= 4, `${mode} passive wins ${passiveWins}/20`);
    assert.equal(passiveHighGrades, 0, `${mode} passive play earns no A or S grades`);
    assert.ok(greedyWins >= passiveWins, `${mode} greedy ${greedyWins} >= passive ${passiveWins}`);
    const competentLosses = competent.filter((sample) => !sample.win).map((sample) => sample.level);
    assert.ok(competentWins >= 17,
      `${mode} competent wins ${competentWins}/20; losses ${competentLosses}`);
  }
});

test('normal Bow Blitz waits for intentional fire while CALM keeps auto fire', () => {
  for (const [speed, expectedWithoutTouch] of [['normal', 0], ['calm', 1]]) {
    const game = makeGame('shooter', 1, speed);
    game.startRun();
    let volleys = 0;
    game.fireVolley = () => { volleys++; };
    game.volleyT = 0;
    game.update(1 / 60);
    assert.equal(volleys, expectedWithoutTouch, `${speed} passive volleys`);
    game.firing = true;
    game.volleyT = 0;
    game.update(1 / 60);
    assert.ok(volleys >= 1, `${speed} fires while held`);
    game.destroy();
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
      if (game.mode === 'shooter') game.firing = true;
      if (game.mode === 'gates') game.charging = true;
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

test('above-par boss crowd damage has logarithmic diminishing returns', () => {
  const par = 100;
  assert.equal(crowdBossDamageFactor(50, par), 1, 'below-par damage stays linear');
  assert.equal(crowdBossDamageFactor(par, par), 1, 'the curve is continuous at par');

  let previousEffective = par;
  for (const ratio of [1.5, 2, 3, 5, 10]) {
    const effective = par * ratio * crowdBossDamageFactor(par * ratio, par);
    assert.ok(effective > previousEffective, `${ratio}x still earns more boss damage`);
    assert.ok(effective < par * ratio, `${ratio}x surplus damage is compressed`);
    previousEffective = effective;
  }
});

test('boss duration stays active, monotonic, and pace-independent above par', () => {
  const speeds = ['calm', 'normal', 'fast', 'turbo'];
  const multiples = [1, 2, 3, 5];
  for (const mode of ['shooter', 'gates']) {
    for (const level of [1, 6, 12, 20]) {
      const bySpeed = new Map();
      for (const speed of speeds) {
        const samples = multiples.map((multiple) => measureBoss(mode, level, speed, multiple));
        bySpeed.set(speed, samples);
        for (const [i, sample] of samples.entries()) {
          assert.equal(sample.won, true,
            `${mode} level ${level} ${speed} ${multiples[i]}x clears`);
          if (i > 0) {
            assert.ok(sample.seconds <= samples[i - 1].seconds + 0.1,
              `${mode} level ${level} ${speed} stays monotonic at ${multiples[i]}x`);
          }
        }
        // Three staged armor beats keep a par fight legible without turning it
        // into a slog. Surplus arrivals still earn a faster clear below.
        assert.ok(samples[0].seconds >= 10 && samples[0].seconds <= 17,
          `${mode} level ${level} ${speed} par boss lasts ${samples[0].seconds.toFixed(1)}s`);
        assert.ok(samples[1].seconds >= 8,
          `${mode} level ${level} ${speed} 2x boss lasts ${samples[1].seconds.toFixed(1)}s`);
        assert.ok(samples[3].seconds >= 6,
          `${mode} level ${level} ${speed} 5x boss lasts ${samples[3].seconds.toFixed(1)}s`);
        assert.ok(samples[3].seconds <= samples[0].seconds - 2.5,
          `${mode} level ${level} ${speed} 5x arrival earns a meaningfully faster clear`);
      }
      const normal = bySpeed.get('normal');
      // CALM intentionally auto-releases a ready golem. The active paces do not,
      // so their crowd damage must remain identical despite reward/rhythm changes.
      for (const speed of ['normal', 'fast', 'turbo']) {
        bySpeed.get(speed).forEach((sample, i) => {
          assert.ok(Math.abs(sample.seconds - normal[i].seconds) <= 0.1,
            `${mode} level ${level} ${multiples[i]}x damage is independent of ${speed} pace`);
        });
      }
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

test('every standard boss has three readable damage stages', () => {
  const game = makeGame('shooter', 1);
  game.startRun();
  game.startBoss();
  assert.equal(game.boss.phases, 3);
  game.boss.entering = false;
  game.damageBoss(game.boss.maxHp * 10);
  assert.equal(game.boss.phase, 2);
  assert.ok(game.boss.hp > 0, 'one hit cannot erase the boss');
  assert.ok(game.boss.shielded > 0, 'the armor break creates a readable beat');
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

test('boss hits take a proportional unmitigated share so one is recoverable and two matter', () => {
  const game = makeGame('gates', 8);
  game.startRun();
  game.startBoss();
  game.boss.entering = false;
  game.stars = 2;
  game.setWorth(100);
  game.playerX = 0;

  const hit = () => {
    game.spawnBossWave({
      x: 0, halfW: 1.3, z: game.playerZ + 0.5,
      warn: 0, speed: 1, kills: 1, lossFraction: 0.26,
    });
    game.updateWaves(1 / 60);
  };
  hit();
  assert.equal(game.worth(), 74, 'one hit leaves a viable crowd');
  hit();
  assert.equal(game.worth(), 54, 'a second hit creates a serious deficit');
  assert.equal(game.bossMetrics.hits, 2);
  assert.equal(game.bossMetrics.resolved, 2);
  game.destroy();
});

test('proportional alternate gates cannot be shot into a mislabeled best choice', () => {
  const game = makeGame('shooter', 8);
  game.startRun();
  const gate = {
    op: 'scale', val: 1.7, hits: 0, pulse: 0, x: 2.4, z: 10,
    par: false, choiceTier: 'alternate', bestAfter: 24, alternateAfter: 20,
  };
  for (let i = 0; i < 30; i++) game.shootGate(gate);
  assert.equal(gate.val, 1.7);
  assert.equal(game.gateLabel(gate), '×1.7');
  assert.equal(gate.choiceTier, 'alternate');
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

test('directed route hazards cannot be erased by passive arrows', () => {
  const game = makeGame('shooter', 3);
  game.startRun();
  game.enemies = [];
  game.gates = [];
  game.pickups = [];
  game.crystals = [];
  const obstacle = {
    x: 0,
    z: game.playerZ + 5,
    hp: 3,
    directed: true,
    wobble: 0,
  };
  game.obstacles = [obstacle];
  const arrow = { x: obstacle.x, z: obstacle.z, dmg: 99 };

  game.arrowHitTest(arrow);

  assert.equal(obstacle.hp, 3);
  assert.notEqual(arrow.dead, true);
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

test('competent play remains completable at every selectable pace', { timeout: 30000 }, () => {
  for (const mode of ['shooter', 'gates']) {
    for (const speed of ['calm', 'normal', 'fast', 'turbo']) {
      // Levels 1-3 are the directed Plains, Forest, and Desert pilot. Later
      // samples retain the high-difficulty and repeated-cycle coverage.
      for (const level of [1, 2, 3, 10, 20]) {
        const sample = simulate(mode, level, true, speed);
        assert.equal(sample.win, true,
          `${mode} ${speed} level ${level}: ${JSON.stringify(sample)}`);
      }
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
