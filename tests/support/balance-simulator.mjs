import { BALANCE_COHORTS } from './balance-cohorts.mjs';

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
    width: 430, height: 900,
    getContext: () => fakeCtx(), toDataURL: () => 'data:,',
    addEventListener: noop, removeEventListener: noop, setPointerCapture: noop,
  };
}

if (!globalThis.document) globalThis.document = { createElement: fakeCanvas, getElementById: () => null };
if (!globalThis.window) globalThis.window = { addEventListener: noop, removeEventListener: noop };

const [{ Game }, { loadSave, TUNE }] = await Promise.all([
  import('../../js/game.js'),
  import('../../js/config.js'),
]);

function seeded(seed) {
  return function random() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const LANES = [-3.1, -2.4, -1.2, 0, 1.2, 2.4, 3.1];
const distance = (game, item) => item.z - game.playerZ;
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

function makeGame(mode, level, speed, onRunEnd) {
  const save = Object.assign(loadSave(), { mode, level, speed, tutorialSeen: true });
  const game = new Game(fakeCanvas(), save, {
    onHud: noop, onRunEnd, onTutorial: noop, onPause: noop,
  });
  game.resize(430, 900);
  return game;
}

function policyController(game, cohortName, behaviorSeed) {
  const cohort = BALANCE_COHORTS[cohortName];
  if (!cohort) throw new Error(`Unknown balance cohort: ${cohortName}`);
  const rng = seeded(behaviorSeed);
  const state = {
    nextObserve: 0,
    moves: [],
    gatePlans: new Map(),
    bossPlans: new Map(),
    aimPlans: new Map(),
    golemGrant: -1,
    actionChanges: 0,
    lastAction: false,
    attackPhase: rng() * 2.4,
  };

  const planGate = (pair) => {
    const key = pair[0].z;
    if (!state.gatePlans.has(key)) {
      const roll = rng();
      let plan = 'miss';
      if (roll < cohort.gateAccuracy) plan = 'best';
      else if (roll < cohort.gateAccuracy + (1 - cohort.gateAccuracy) * 0.75) plan = 'alternate';
      state.gatePlans.set(key, plan);
    }
    const plan = state.gatePlans.get(key);
    if (plan === 'miss') return 0;
    const ranked = [...pair].sort((a, b) => gateWorth(b, game.worth()) - gateWorth(a, game.worth()));
    if (plan === 'best') return ranked[0].x;
    return ranked.at(-1).x;
  };

  const queueMove = (targetX) => {
    const last = state.moves.at(-1);
    if (last && Math.abs(last.targetX - targetX) < 0.05) return;
    state.moves.push({ at: game.t + cohort.reaction, targetX });
  };

  const observe = () => {
    if (!Number.isFinite(cohort.reaction) || game.t + 1e-9 < state.nextObserve) return;
    state.nextObserve = game.t + 0.1;

    if (game.redstone >= TUNE.redstoneMax && state.golemGrant !== game.golemGrantIdx) {
      state.golemGrant = game.golemGrantIdx;
      if (rng() < cohort.golemUse) game.summonGolem();
    }

    if (game.state === 'boss') {
      const waves = game.waves.filter((wave) => !wave.dead);
      if (waves.length) {
        const beatId = waves[0].beatId || waves[0].groupId || 'wave';
        if (!state.bossPlans.has(beatId)) {
          state.bossPlans.set(beatId, rng() < cohort.bossDodge[game.mode]);
        }
        if (state.bossPlans.get(beatId)) queueMove(safestLane(waves, game.playerX));
        return;
      }
      const crystal = game.crystals?.find((item) => !item.dead);
      const target = crystal || game.boss;
      if (target) {
        const key = crystal ? `crystal-${game.crystals.indexOf(crystal)}` : 'boss';
        if (!state.aimPlans.has(key)) {
          state.aimPlans.set(key, rng() < cohort.aimAccuracy ? 0 : (rng() < 0.5 ? -2 : 2));
        }
        queueMove(Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, target.x + state.aimPlans.get(key))));
      }
      return;
    }

    const obstacles = game.obstacles.filter((item) => item.hp > 0 && distance(game, item) > 0 && distance(game, item) < 13);
    const gates = game.gates.filter((gate) => !gate.used && !gate.automatic
      && distance(game, gate) > 0 && distance(game, gate) < 32);
    const obstacleDistance = obstacles.length ? Math.min(...obstacles.map((item) => distance(game, item))) : Infinity;
    const gateDistance = gates.length ? Math.min(...gates.map((gate) => distance(game, gate))) : Infinity;

    if (gates.length && gateDistance < obstacleDistance - 2) {
      const pair = gates.filter((gate) => Math.abs(distance(game, gate) - gateDistance) < 0.1);
      queueMove(planGate(pair));
      return;
    }
    if (obstacles.length) {
      const nearest = obstacles.filter((item) => Math.abs(distance(game, item) - obstacleDistance) < 1.5);
      if (rng() < cohort.trackDodge) queueMove(safestLane(nearest, game.playerX));
      return;
    }
    if (gates.length) {
      const pair = gates.filter((gate) => Math.abs(distance(game, gate) - gateDistance) < 0.1);
      queueMove(planGate(pair));
      return;
    }
    const enemies = game.enemies.filter((enemy) => !enemy.dead
      && distance(game, enemy) > 0 && distance(game, enemy) < 28);
    if (!enemies.length) return;
    if (game.mode === 'shooter') {
      enemies.sort((a, b) => distance(game, a) - distance(game, b));
      queueMove(enemies[0].x);
    } else if (rng() < cohort.trackDodge) {
      queueMove(safestLane(enemies.map((enemy) => ({ x: enemy.x, halfW: 0.9 })), game.playerX));
    }
  };

  const applyMoves = () => {
    while (state.moves.length && state.moves[0].at <= game.t + 1e-9) {
      game.targetX = state.moves.shift().targetX;
    }
  };

  const updateAction = () => {
    const duty = cohort.attackDuty[game.mode];
    const active = duty > 0
      && ((game.t + state.attackPhase) % 2.4) / 2.4 < duty;
    if (active !== state.lastAction) state.actionChanges++;
    state.lastAction = active;
    game.firing = game.mode === 'shooter' && active;
    game.charging = game.mode === 'gates' && active;
  };

  return { state, step() { updateAction(); observe(); applyMoves(); } };
}

export function simulateBalanceRun({
  mode, level, cohort = 'skilled', speed = 'normal', behaviorSeed = 1, combatSeed = 1,
  maxSeconds = 300,
}) {
  const originalRandom = Math.random;
  Math.random = seeded(level * 1009 + combatSeed * 100003 + (mode === 'gates' ? 7 : 3));
  let result = null;
  const game = makeGame(mode, level, speed, (value) => { result = value; });
  try {
    game.startRun();
    const policy = policyController(game, cohort, behaviorSeed);
    let ticks = 0;
    let bossStart = null;
    while ((game.state === 'run' || game.state === 'boss') && !game.bossDead
      && ticks < maxSeconds * 60) {
      policy.step();
      game.update(1 / 60);
      ticks++;
      if (bossStart === null && game.state === 'boss') bossStart = ticks;
    }
    const win = game.bossDead || result?.win === true;
    if (win && !result && (game.state === 'run' || game.state === 'boss')) game.endRun(true);
    const mastery = result?.mastery || game.mastery || {};
    const par = game.expectedBossArmy().power;
    return {
      mode, level, cohort, speed, behaviorSeed,
      win,
      failurePhase: win ? null : (bossStart === null ? 'track' : 'boss'),
      runSeconds: ticks / 60,
      bossSeconds: bossStart === null ? null : (ticks - bossStart) / 60,
      actionChanges: policy.state.actionChanges,
      gateChoices: mastery.gateChoices || 0,
      bestGates: mastery.bestGates || 0,
      alternateGates: mastery.alternateGates || 0,
      safeGates: mastery.safeGates || 0,
      missedGates: mastery.missedGates || 0,
      damageTaken: mastery.damageTaken || 0,
      arrivalPower: game.bossArrivalCrowd || 0,
      arrivalParRatio: game.bossArrivalCrowd ? game.bossArrivalCrowd / par : 0,
      finalCrowd: mastery.finalCrowd ?? game.armyPower(),
      grade: result?.mastery?.grade || null,
      bossWarnings: game.bossMetrics.warnings,
      bossActionsStarted: game.bossMetrics.actionsStarted,
      bossResolved: game.bossMetrics.resolved,
      bossThreatening: game.bossMetrics.threatening,
      bossHits: game.bossMetrics.hits,
      bossDodges: game.bossMetrics.dodges,
    };
  } finally {
    game.destroy();
    Math.random = originalRandom;
  }
}

export function measureIntrinsicBoss({ mode, level, speed = 'normal', arrivalMultiple = 1 }) {
  const originalRandom = Math.random;
  Math.random = seeded(level * 1009 + arrivalMultiple * 101 + (mode === 'gates' ? 7 : 3));
  const game = makeGame(mode, level, speed, noop);
  try {
    game.startRun();
    const par = game.expectedBossArmy();
    game.setWorth(Math.max(1, Math.round(par.power * arrivalMultiple)), true);
    game.playerZ = game.length;
    game.startBoss();
    game.boss.entering = false;
    game.boss.z = game.boss.targetZ;
    game.boss.attackT = 999;
    let ticks = 0;
    while (game.state === 'boss' && !game.bossDead && ticks < 3600) {
      game.targetX = game.boss.x;
      game.firing = mode === 'shooter';
      game.charging = mode === 'gates';
      game.update(1 / 60);
      ticks++;
      game.boss && (game.boss.attackT = 999);
    }
    return { mode, level, speed, arrivalMultiple, won: game.bossDead, seconds: ticks / 60 };
  } finally {
    game.destroy();
    Math.random = originalRandom;
  }
}

export function measureActiveBoss({ mode, level, speed = 'normal', arrivalMultiple = 1 }) {
  const originalRandom = Math.random;
  Math.random = seeded(level * 2017 + arrivalMultiple * 307 + (mode === 'gates' ? 7 : 3));
  const game = makeGame(mode, level, speed, noop);
  try {
    game.startRun();
    const par = game.expectedBossArmy();
    game.setWorth(Math.max(1, Math.round(par.power * arrivalMultiple)), true);
    game.playerZ = game.length;
    game.startBoss();
    game.boss.entering = false;
    game.boss.z = game.boss.targetZ;
    let ticks = 0;
    while (game.state === 'boss' && !game.bossDead && ticks < 3600) {
      const waves = game.waves.filter((wave) => !wave.dead);
      if (waves.length) game.targetX = safestLane(waves, game.playerX);
      else {
        const crystal = game.crystals?.find((item) => !item.dead);
        game.targetX = crystal ? crystal.x : game.boss.x;
      }
      game.firing = mode === 'shooter';
      game.charging = mode === 'gates';
      game.update(1 / 60);
      ticks++;
    }
    return {
      mode, level, speed, arrivalMultiple, won: game.bossDead,
      seconds: ticks / 60,
      warnedWaveBeats: game.bossMetrics.warnings,
      actionsStarted: game.bossMetrics.actionsStarted,
      resolvedWaveBeats: game.bossMetrics.resolved,
      threateningWaveBeats: game.bossMetrics.threatening,
      waveHits: game.bossMetrics.hits,
    };
  } finally {
    game.destroy();
    Math.random = originalRandom;
  }
}

export function summarizeRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.mode}:${run.cohort}`;
    const group = groups.get(key) || {
      mode: run.mode, cohort: run.cohort, runs: 0, wins: 0, bossReached: 0,
      bossHits: 0, bossResolved: 0, bossThreatening: 0, arrivalRatios: [],
      bestGates: 0, alternateGates: 0, safeGates: 0, missedGates: 0,
      gateChoices: 0, actionChanges: 0, trackFailures: 0, bossFailures: 0,
      bossSeconds: [], bossBeats: [],
    };
    group.runs++;
    group.wins += Number(run.win);
    group.bossReached += Number(run.bossSeconds !== null);
    group.bossHits += run.bossHits;
    group.bossResolved += run.bossResolved;
    group.bossThreatening += run.bossThreatening;
    group.bestGates += run.bestGates;
    group.alternateGates += run.alternateGates;
    group.safeGates += run.safeGates;
    group.missedGates += run.missedGates;
    group.gateChoices += run.gateChoices;
    group.actionChanges += run.actionChanges;
    group.trackFailures += Number(run.failurePhase === 'track');
    group.bossFailures += Number(run.failurePhase === 'boss');
    if (run.bossSeconds !== null) group.bossSeconds.push(run.bossSeconds);
    group.bossBeats.push(run.bossResolved);
    if (run.arrivalParRatio) group.arrivalRatios.push(run.arrivalParRatio);
    groups.set(key, group);
  }
  const median = (values) => values.length
    ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0;
  return [...groups.values()].map((group) => ({
    mode: group.mode,
    cohort: group.cohort,
    runs: group.runs,
    winRate: group.wins / group.runs,
    bossReachRate: group.bossReached / group.runs,
    warnedWaveHitRate: group.bossThreatening ? group.bossHits / group.bossThreatening : 0,
    unthreateningWaveRate: group.bossResolved
      ? (group.bossResolved - group.bossThreatening) / group.bossResolved : 0,
    bestGateRate: group.gateChoices ? group.bestGates / group.gateChoices : 0,
    alternateGateRate: group.gateChoices ? (group.alternateGates + group.safeGates) / group.gateChoices : 0,
    missedGatesPerRun: group.missedGates / group.runs,
    actionsPerRun: group.actionChanges / group.runs,
    trackFailureRate: group.trackFailures / group.runs,
    bossFailureRate: group.bossFailures / group.runs,
    medianBossSeconds: median(group.bossSeconds),
    medianWarnedBeats: median(group.bossBeats),
    medianArrivalPar: group.arrivalRatios.length
      ? group.arrivalRatios.sort((a, b) => a - b)[Math.floor(group.arrivalRatios.length / 2)]
      : 0,
  }));
}
