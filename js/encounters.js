// Directed encounter construction for the runner track.
//
// This module deliberately has no Game dependency. A run is a plain, seeded
// description that tests can inspect before the runtime turns its events into
// enemies, gates, obstacles, and pickups.
import { TUNE } from './config.js';
import { mulberry32 } from './engine.js';

export const ENCOUNTER_FOLLOW_THROUGH = 28;
export const ENCOUNTER_MIN_FOLLOW_THROUGH = 22;

const GATE_X = 2.45;
const FIRST_Z = 36;
const LAST_MARGIN = 76;

const roundZ = (value) => Math.round(value * 10) / 10;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function encounterRunStyle(biome) {
  return ['open', 'fork', 'sweep'].includes(biome?.runStyle)
    ? biome.runStyle
    : 'classic';
}

// Sweep motion is a function of track progress, not frame time. Replaying the
// same seed therefore puts every moving wall in the same place at every z.
export function sweepObstacleX(baseX, motion, playerZ) {
  if (!motion || motion.kind !== 'sweep') return baseX;
  if (Number.isFinite(motion.startZ) && Number.isFinite(motion.endZ)) {
    const progress = clamp(
      (playerZ - motion.startZ) / Math.max(1, motion.endZ - motion.startZ),
      0,
      1,
    );
    const eased = progress * progress * (3 - 2 * progress);
    return baseX + (eased * 2 - 1) * motion.amplitude * (motion.direction || 1);
  }
  const offset = Math.sin(
    (playerZ - motion.originZ) * motion.frequency + motion.phase,
  ) * motion.amplitude;
  return baseX + offset;
}

export function buildEncounterRun({
  level = 1,
  mode = 'shooter',
  biome = {},
  mut = {},
  seed = 1000 + level * 7919,
} = {}) {
  const L = Math.max(1, Math.floor(level));
  const rng = mulberry32(seed >>> 0);
  const style = encounterRunStyle(biome);
  const length = 420 + Math.min(L, 12) * 35 + Math.min(8, Math.max(0, L - 12)) * 12;
  // Seven authored cards plus the boss are the promised eight-beat run:
  // warmup, calibration, route choice, biome challenge, breather, harder
  // remix, boss preview, boss.
  const roles = ['warmup', 'learn', 'choice', 'challenge', 'relief', 'remix', 'preview'];
  const span = length - LAST_MARGIN - FIRST_Z;
  const step = span / (roles.length - 1);
  const events = [];
  const encounters = [];
  let eventOrder = 0;

  const irnd = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (items) => items[Math.floor(rng() * items.length)];
  const enemyPool = mut.enemies?.length ? mut.enemies : (biome.enemies || []);

  const addEvent = (card, event) => {
    events.push({
      ...event,
      encounterId: card.id,
      role: card.role,
      _order: eventOrder++,
    });
  };

  const gateWidth = L === 1
    ? TUNE.tutorialGateHalfW
    : Math.max(1.55, TUNE.gateHalfW - Math.max(0, L - 3) * 0.02);
  const followThrough = Math.max(
    ENCOUNTER_MIN_FOLLOW_THROUGH,
    ENCOUNTER_FOLLOW_THROUGH - Math.floor((L - 1) / 5) * 2,
  );
  let authoredPar = mut.startWorth || TUNE.crowdStart;

  const gateAfter = (worth, gate) => gate.op === 'mul'
    ? worth * gate.val
    : gate.op === 'scale'
      ? Math.floor(worth * gate.val)
    : worth + gate.val;

  const decisionGate = (card, event, metadata) => addEvent(card, {
    ...event,
    meaningful: true,
    parBefore: metadata.parBefore,
    bestAfter: metadata.bestAfter,
    alternateAfter: metadata.alternateAfter,
  });

  const addGatePair = (card, kind) => {
    const choiceZ = roundZ(card.startZ + 4);
    const halfW = gateWidth;
    const bestSide = rng() < 0.5 ? -1 : 1;
    const bestX = bestSide * GATE_X;
    const alternateX = -bestX;

    card.agency += 1;
    card.choiceZ = choiceZ;
    card.mechanic = kind === 'risk' ? 'reward-then-dodge' : 'gate-choice';

    const multiplier = kind === 'learn'
      ? 3
      : kind === 'risk'
        ? (L >= 8 || mut.gateBoost ? 3 : 2)
        : (L >= 14 || mut.gateBoost ? 3 : 2);
    const parBefore = authoredPar;
    const best = { op: 'mul', val: multiplier };
    const bestAfter = gateAfter(parBefore, best);
    // A proportional alternate compounds honestly across repeated mistakes.
    // Fixed + gates authored against the perfect route accidentally became
    // catch-up gates after an earlier miss, making two errors nearly harmless.
    const alternateRatio = L === 1 ? 0.9 : 0.85;
    const alternate = {
      op: 'scale',
      val: Math.round(multiplier * alternateRatio * 100) / 100,
    };
    const alternateAfter = gateAfter(parBefore, alternate);
    const metadata = { parBefore, bestAfter, alternateAfter };

    const hasFollowThrough = (kind === 'risk' && L > 1) || (kind === 'standard' && L >= 4);
    const followThroughZ = hasFollowThrough ? roundZ(choiceZ + followThrough) : undefined;
    const bestEvent = {
      z: choiceZ, type: 'gate', x: bestX, halfW,
      ...best, par: true, choiceTier: kind === 'risk' ? 'risky' : 'best',
      risk: hasFollowThrough,
      followThroughZ,
    };
    decisionGate(card, bestEvent, metadata);
    decisionGate(card, {
      z: choiceZ, type: 'gate', x: alternateX, halfW,
      ...alternate, choiceTier: kind === 'risk' ? 'safe' : 'alternate',
    }, metadata);
    authoredPar = bestAfter;

    if (kind === 'risk' && L > 1) {
      const dangerZ = roundZ(choiceZ + followThrough);
      card.dangerZ = dangerZ;
      card.threat = true;
      for (const offset of [-0.8, 0.2, 1.2]) {
        addEvent(card, {
          z: dangerZ,
          type: 'obstacle',
          x: clamp(bestX + offset, -TUNE.trackHalf + 0.5, TUNE.trackHalf - 0.5),
          directed: true,
        });
      }
    } else if (kind === 'standard' && L >= 4) {
      // The middle decision becomes a mild route tradeoff after onboarding:
      // take full growth and cross once, or keep 85% with a clean follow-through.
      const dangerZ = roundZ(choiceZ + followThrough);
      addEvent(card, {
        z: dangerZ, type: 'obstacle', x: bestX,
        directed: true,
      });
      card.dangerZ = dangerZ;
      card.threat = true;
      card.mechanic = 'growth-then-dodge';
    }
  };

  const addRewardTrail = (card, options = {}) => {
    const lane = options.lane ?? ((rng() * 2 - 1) * (TUNE.laneHalf - 0.8));
    const count = options.count || irnd(5, 7);
    const arc = options.arc ?? (rng() < 0.5);
    for (let i = 0; i < count; i++) {
      const x = lane + (arc ? Math.sin(i / Math.max(1, count - 1) * Math.PI) * 1.25 * (lane > 0 ? -1 : 1) : 0);
      addEvent(card, {
        z: roundZ(card.startZ + 4 + i * 1.45),
        type: 'pickup',
        kind: 'emerald',
        x: clamp(x, -TUNE.laneHalf, TUNE.laneHalf),
      });
    }
  };

  const addReliefGate = (card) => {
    const z = roundZ(card.startZ + 24);
    // One full-width reward keeps the satisfying mid-run growth beat without
    // pretending two identical lanes are a decision.
    addEvent(card, {
      z, type: 'gate', x: 0, halfW: TUNE.laneHalf + TUNE.gateHitMargin,
      op: 'mul', val: 3, reward: true, automatic: true, par: true,
      meaningful: false, parBefore: authoredPar, bestAfter: authoredPar * 3,
      alternateAfter: authoredPar * 3,
    });
    authoredPar *= 3;
  };

  const addOpenChallenge = (card, compact = false) => {
    const rowZ = roundZ(card.startZ + (compact ? 9 : 11));
    const gapX = (rng() < 0.5 ? -1 : 1) * (compact ? 2.2 : 2.45);
    const gapHalf = L <= 2 ? 1.75 : 1.5;
    for (let x = -TUNE.trackHalf + 0.6; x <= TUNE.trackHalf - 0.6; x += 1.05) {
      if (Math.abs(x - gapX) < gapHalf) continue;
      addEvent(card, {
        z: rowZ,
        type: 'obstacle',
        x: roundZ(x),
        stationary: true,
        directed: true,
      });
    }
    // The reward line is also the read: it points at the generous stationary gap.
    for (let i = 0; i < 3; i++) {
      addEvent(card, {
        z: roundZ(card.startZ + 3 + i * 1.5),
        type: 'pickup',
        kind: 'emerald',
        x: gapX,
      });
    }
    card.agency += 1;
    card.threat = true;
    card.mechanic = 'stationary-gap';
    card.safeLane = gapX;
    card.dangerZ = rowZ;
  };

  const ambushBranch = (dangerZ, side, count) => Array.from({ length: count }, (_, i) => ({
      id: enemyPool.length ? pick(enemyPool) : null,
      x: clamp(side * 2.3 + (rng() * 2 - 1) * 0.65, -TUNE.laneHalf, TUNE.laneHalf),
      z: roundZ(dangerZ + (i % 3) * 1.7 + Math.floor(i / 3) * 0.8),
    })).filter((enemy) => enemy.id);

  const addForestFork = (card, compact = false) => {
    const choiceZ = roundZ(card.startZ + 4);
    const dangerZ = roundZ(choiceZ + ENCOUNTER_FOLLOW_THROUGH);
    const leftKind = rng() < 0.5 ? 'emerald' : 'apple';
    const rightKind = leftKind === 'emerald' ? 'apple' : 'emerald';
    const baseCount = compact ? 2 : Math.min(6, 3 + Math.ceil(L / 4));
    // Apples add crowd immediately, so that lane is the richer commitment and
    // reveals two more enemies. The emerald lane is the lower-risk economy
    // choice. Which side owns each tradeoff remains seeded.
    const branches = {
      left: ambushBranch(dangerZ, -1, baseCount + (leftKind === 'apple' ? 2 : 0)),
      right: ambushBranch(dangerZ, 1, baseCount + (rightKind === 'apple' ? 2 : 0)),
    };
    for (let i = 0; i < 3; i++) {
      addEvent(card, { z: roundZ(card.startZ + i * 1.5), type: 'pickup', kind: leftKind, x: -2.25 });
      addEvent(card, { z: roundZ(card.startZ + i * 1.5), type: 'pickup', kind: rightKind, x: 2.25 });
    }
    addEvent(card, {
      z: choiceZ,
      type: 'ambush_trigger',
      choiceZ,
      dangerZ,
      defaultSide: rng() < 0.5 ? -1 : 1,
      branchRewards: { left: leftKind, right: rightKind },
      branches,
    });
    card.agency += 1;
    card.threat = true;
    card.mechanic = 'fork-ambush';
    card.choiceZ = choiceZ;
    card.dangerZ = dangerZ;
  };

  const addDesertSweep = (card, compact = false) => {
    const rowZ = roundZ(card.startZ + (compact ? 22 : 24));
    const direction = rng() < 0.5 ? -1 : 1;
    const initialSafeLane = direction * TUNE.laneHalf;
    const finalSafeLane = -initialSafeLane;
    const groupId = `${card.id}-sweep`;
    const motion = {
      kind: 'sweep',
      groupId,
      startZ: roundZ(card.startZ + 2),
      endZ: rowZ,
      direction,
      amplitude: compact ? 1.4 : 1.55,
      initialSafeLane,
      finalSafeLane,
    };
    // Two paired cactus columns sweep from one edge to the other. A center
    // route remains open while the safe edge changes sides, so the mechanic is
    // a readable timed crossing instead of a stationary gap with a wobble.
    for (const zOffset of [0, 1.2]) {
      for (const baseX of [-1.4, 1.4]) {
        addEvent(card, {
          z: roundZ(rowZ + zOffset),
          type: 'obstacle',
          x: baseX,
          baseX,
          motion,
          directed: true,
        });
      }
    }
    for (let i = 0; i < 6; i++) {
      const progress = i / 5;
      addEvent(card, {
        z: roundZ(motion.startZ + progress * (motion.endZ - motion.startZ - 2)),
        type: 'pickup',
        kind: 'emerald',
        x: roundZ(initialSafeLane + (finalSafeLane - initialSafeLane) * progress),
      });
    }
    card.agency += 1;
    card.threat = true;
    card.mechanic = 'sweeping-wall';
    card.safeLane = finalSafeLane;
    card.dangerZ = rowZ;
  };

  const addEnemyRoute = (card, compact = false) => {
    const dangerZ = roundZ(card.startZ + (compact ? 9 : 11));
    const enemySide = rng() < 0.5 ? -1 : 1;
    const count = compact ? 2 : Math.min(8, 3 + Math.ceil(L * 0.55));
    for (let i = 0; i < count; i++) {
      if (!enemyPool.length) break;
      addEvent(card, {
        z: roundZ(dangerZ + (i % 3) * 1.6),
        type: 'enemy',
        id: pick(enemyPool),
        x: clamp(enemySide * 2.15 + (rng() * 2 - 1) * 0.75, -TUNE.laneHalf, TUNE.laneHalf),
        routeSide: enemySide,
      });
    }
    const rewardSide = -enemySide;
    for (let i = 0; i < 3; i++) {
      addEvent(card, {
        z: roundZ(card.startZ + 3 + i * 1.45),
        type: 'pickup',
        kind: 'emerald',
        x: rewardSide * 2.35,
      });
    }
    card.agency += 1;
    card.threat = true;
    card.mechanic = mode === 'shooter' ? 'fight-or-reward' : 'enemy-route';
    card.safeLane = rewardSide * 2.35;
    card.dangerZ = dangerZ;
  };

  const addIdentityChallenge = (card, compact = false) => {
    if (style === 'open') addOpenChallenge(card, compact);
    else if (style === 'fork') addForestFork(card, compact);
    else if (style === 'sweep') addDesertSweep(card, compact);
    else addEnemyRoute(card, compact);
  };

  roles.forEach((role, index) => {
    const startZ = roundZ(FIRST_Z + index * step);
    const nextZ = index + 1 < roles.length
      ? roundZ(FIRST_Z + (index + 1) * step)
      : length - 32;
    const card = {
      id: `${index + 1}-${role}`,
      role,
      startZ,
      endZ: roundZ(nextZ - 4),
      threat: false,
      relief: role === 'relief',
      agency: 0,
      mechanic: '',
    };
    encounters.push(card);

    if (role === 'warmup') {
      addRewardTrail(card, { lane: 0, count: 6, arc: true });
      card.mechanic = 'safe-trail';
    } else if (role === 'learn') {
      addGatePair(card, 'learn');
    } else if (role === 'choice') {
      addGatePair(card, 'standard');
    } else if (role === 'challenge') {
      addIdentityChallenge(card);
    } else if (role === 'relief') {
      addRewardTrail(card);
      const kind = mut.appleCommon ? 'apple' : (rng() < 0.55 ? 'apple' : 'chest');
      addEvent(card, {
        z: roundZ(card.startZ + 14),
        type: 'pickup',
        kind,
        x: (rng() < 0.5 ? -1 : 1) * 1.8,
      });
      if (mut.tntCommon) {
        addEvent(card, {
          z: roundZ(card.startZ + 16),
          type: 'pickup',
          kind: 'tnt',
          x: (rng() < 0.5 ? -1 : 1) * 1.4,
        });
      }
      if (L >= 3 && rng() < 0.55) {
        const pool = mode === 'shooter'
          ? ['powerup_triple', 'powerup_rapid', 'powerup_power', 'powerup_sword', 'powerup_axe']
          : ['powerup_sword', 'powerup_axe'];
        addEvent(card, {
          z: roundZ(card.startZ + 18),
          type: 'pickup',
          kind: pick(pool),
          x: (rng() * 2 - 1) * (TUNE.laneHalf - 0.8),
        });
      }
      addReliefGate(card);
      card.mechanic = 'breather-reward';
    } else if (role === 'remix') {
      addGatePair(card, 'risk');
    } else if (role === 'preview') {
      addIdentityChallenge(card, true);
      card.bossPreview = true;
    }
  });

  events.sort((a, b) => a.z - b.z || a._order - b._order);
  for (const event of events) delete event._order;

  return { length, runStyle: style, encounters, events };
}
