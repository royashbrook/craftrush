import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENCOUNTER_FOLLOW_THROUGH,
  buildEncounterRun,
  encounterRunStyle,
  sweepObstacleX,
} from '../js/encounters.js';
import { LevelMixin } from '../js/levelgen.js';
import { CombatMixin } from '../js/combat.js';
import { BIOMES, ENEMY_TYPES, SPEEDS, TUNE } from '../js/config.js';

const good = (gate) => gate.op === 'add' || gate.op === 'mul';

function gatePairs(events) {
  const pairs = new Map();
  for (const event of events) {
    if (event.type !== 'gate') continue;
    pairs.set(event.z, [...(pairs.get(event.z) || []), event]);
  }
  return pairs;
}

test('the director builds a seeded rhythm with bounded agency and threat streaks', () => {
  const levels = [1, 2, 6, 12, 20];
  const seeds = Array.from({ length: 32 }, (_, index) => 7 + index * 97);
  const expectedRoles = ['warmup', 'learn', 'choice', 'challenge', 'relief', 'remix', 'preview'];
  for (const mode of ['shooter', 'gates']) {
    for (const level of levels) {
      for (const seed of seeds) {
        const biome = BIOMES[(level - 1) % BIOMES.length];
        const run = buildEncounterRun({ level, mode, biome, seed });
        const agency = run.encounters.reduce((total, card) => total + card.agency, 0);

        assert.deepEqual(run.encounters.map((card) => card.role), expectedRoles);
        assert.equal(run.encounters.at(-1).role, 'preview');
        assert.equal(run.encounters.at(-1).bossPreview, true);
        assert.ok(agency >= 5 && agency <= 8, `${mode} level ${level} seed ${seed}: ${agency} agency beats`);

        const warmupId = run.encounters[0].id;
        assert.ok(run.events.filter((event) => event.encounterId === warmupId)
          .every((event) => event.type === 'pickup'), 'the opening is harmless');

        let threatStreak = 0;
        for (const [index, card] of run.encounters.entries()) {
          threatStreak = card.relief ? 0 : card.threat ? threatStreak + 1 : threatStreak;
          assert.ok(threatStreak <= 2, `${card.id} extends a threat streak past two`);
          if (index > 0) {
            assert.ok(run.encounters[index - 1].endZ < card.startZ,
              `${run.encounters[index - 1].id} and ${card.id} do not overlap`);
          }
          const cardEvents = run.events.filter((event) => event.encounterId === card.id);
          assert.ok(cardEvents.every((event) => event.z >= card.startZ && event.z <= card.endZ),
            `${card.id} contains its events`);
        }

        const pairs = gatePairs(run.events);
        assert.ok(pairs.size >= 3, 'at least three gate decisions are reachable');
        for (const pair of pairs.values()) {
          assert.equal(pair.length, 2);
          assert.ok(pair.some(good), 'every pair offers growth');
          assert.ok(pair.every((gate) => Math.abs(gate.x) <= TUNE.laneHalf));
          assert.ok(pair.every((gate) => Math.abs(gate.x) >= gate.halfW + TUNE.gateHitMargin),
            'standing still does not accidentally choose a gate');
        }

        for (const risk of run.events.filter((event) => event.type === 'gate' && event.risk)) {
          assert.ok(risk.followThroughZ - risk.z >= ENCOUNTER_FOLLOW_THROUGH);
          assert.ok(run.events.some((event) => event.type === 'obstacle'
            && event.encounterId === risk.encounterId
            && event.z === risk.followThroughZ
            && event.directed
            && Math.abs(event.x - risk.x) < 1.3), 'risk is followed by a readable lane hazard');
        }
      }
    }
  }
});

test('the same seed repeats exactly while another seed changes the decisions', () => {
  const biome = BIOMES.find((entry) => entry.id === 'desert');
  const input = { level: 9, mode: 'shooter', biome, mut: { gateBoost: true }, seed: 12345 };
  assert.deepEqual(buildEncounterRun(input), buildEncounterRun(input));
  assert.notDeepEqual(
    buildEncounterRun(input).events,
    buildEncounterRun({ ...input, seed: 54321 }).events,
  );
});

test('the follow-through distance remains readable at every selectable pace', () => {
  const forest = BIOMES.find((entry) => entry.id === 'forest');
  const fastestEnemy = Math.max(...forest.enemies.map((id) => ENEMY_TYPES[id]?.speed || 0));
  for (const pace of SPEEDS) {
    const cappedSpeed = TUNE.speedCap * pace.speedMul;
    const preAggro = Math.max(0, ENCOUNTER_FOLLOW_THROUGH - TUNE.aggroRange);
    const closingDistance = Math.min(ENCOUNTER_FOLLOW_THROUGH, TUNE.aggroRange);
    const worstContactSeconds = preAggro / cappedSpeed
      + closingDistance / (cappedSpeed + fastestEnemy);
    assert.ok(worstContactSeconds >= 0.9,
      `${pace.id} preserves at least 0.9 seconds against the fastest Forest enemy`);
  }
});

test('plains stay open, forest commits before ambushing, and desert sweeps retain safety', () => {
  const plains = BIOMES.find((entry) => entry.id === 'plains');
  const forest = BIOMES.find((entry) => entry.id === 'forest');
  const desert = BIOMES.find((entry) => entry.id === 'desert');
  const classic = BIOMES.find((entry) => !entry.runStyle);

  assert.equal(encounterRunStyle(plains), 'open');
  assert.equal(encounterRunStyle(forest), 'fork');
  assert.equal(encounterRunStyle(desert), 'sweep');
  assert.equal(encounterRunStyle(classic), 'classic');

  const openRun = buildEncounterRun({ level: 5, mode: 'gates', biome: plains, seed: 10 });
  assert.ok(openRun.encounters.some((card) => card.mechanic === 'stationary-gap'));
  assert.ok(openRun.events.filter((event) => event.type === 'obstacle')
    .every((event) => !event.motion), 'plains hazards do not move');
  assert.ok(openRun.events.filter((event) => event.type === 'obstacle')
    .every((event) => event.directed), 'plains route hazards survive passive fire');

  const forkRun = buildEncounterRun({ level: 5, mode: 'gates', biome: forest, seed: 20 });
  const trigger = forkRun.events.find((event) => event.type === 'ambush_trigger');
  assert.ok(trigger, 'forest carries a deferred branch trigger');
  assert.ok(trigger.dangerZ - trigger.choiceZ >= ENCOUNTER_FOLLOW_THROUGH);
  const richSide = trigger.branchRewards.left === 'apple' ? 'left' : 'right';
  const safeSide = richSide === 'left' ? 'right' : 'left';
  assert.equal(trigger.branches[richSide].length, trigger.branches[safeSide].length + 2,
    'the crowd-building branch carries the larger ambush');
  assert.equal(forkRun.events.some((event) => event.type === 'enemy'
    && event.encounterId === trigger.encounterId), false, 'ambush enemies are not live track events');

  const spawned = [];
  const runtime = Object.assign({}, LevelMixin, {
    state: 'run',
    playerZ: trigger.choiceZ - 0.1,
    playerX: -2.4,
    obstacles: [],
    encounterTriggers: [{ ...trigger, fired: false }],
    spawnEnemy: (...args) => spawned.push(args),
  });
  runtime.updateEncounterRuntime();
  assert.equal(spawned.length, 0, 'approaching the fork does not reveal the ambush');
  runtime.playerZ = trigger.choiceZ;
  runtime.updateEncounterRuntime();
  assert.equal(spawned.length, trigger.branches.left.length);
  assert.deepEqual(
    spawned.map(([id, x, z]) => ({ id, x, z })),
    trigger.branches.left,
    'only the committed branch becomes live',
  );
  assert.equal(runtime.encounterTriggers.length, 0);

  const sweepRun = buildEncounterRun({ level: 5, mode: 'shooter', biome: desert, seed: 30 });
  const moving = sweepRun.events.filter((event) => event.motion?.kind === 'sweep');
  assert.ok(moving.length > 0);
  assert.ok(moving.every((event) => event.directed), 'desert sweep hazards survive passive fire');
  const groups = Map.groupBy(moving, (event) => event.motion.groupId);
  for (const group of groups.values()) {
    const { motion } = group[0];
    const startXs = group.map((event) => sweepObstacleX(event.baseX, event.motion, motion.startZ));
    const finishXs = group.map((event) => sweepObstacleX(event.baseX, event.motion, motion.endZ));
    assert.ok(startXs.every((x) => Math.abs(x - motion.initialSafeLane) >= 1.35),
      'the opening edge is safe when the sweep begins');
    assert.ok(finishXs.some((x) => Math.abs(x - motion.initialSafeLane) < 0.8),
      'standing on the opening edge is caught by the completed sweep');
    assert.ok(finishXs.every((x) => Math.abs(x - motion.finalSafeLane) >= 1.35),
      'the marked destination edge remains safe at contact');
    assert.ok(Math.max(...finishXs.map((x, index) => Math.abs(x - startXs[index]))) >= 2.7,
      'the cactus wall travels far enough to read as a sweep');
  }
});

test('expedition generation keeps enemy, pickup, and gate mutators', () => {
  const forest = BIOMES.find((entry) => entry.id === 'forest');
  const roster = ['skeleton'];
  const run = buildEncounterRun({
    level: 8,
    mode: 'shooter',
    biome: forest,
    seed: 808,
    mut: {
      enemies: roster,
      tntCommon: true,
      appleCommon: true,
      gateBoost: true,
    },
  });

  const enemyIds = [
    ...run.events.filter((event) => event.type === 'enemy').map((event) => event.id),
    ...run.events.filter((event) => event.type === 'ambush_trigger')
      .flatMap((event) => [...event.branches.left, ...event.branches.right])
      .map((enemy) => enemy.id),
  ];
  assert.ok(enemyIds.length > 0);
  assert.ok(enemyIds.every((id) => roster.includes(id)));
  assert.ok(run.events.some((event) => event.type === 'pickup' && event.kind === 'apple'));
  assert.ok(run.events.some((event) => event.type === 'pickup' && event.kind === 'tnt'));
  assert.ok(run.events.some((event) => event.type === 'gate' && event.op === 'mul' && event.val >= 3),
    'gate boost produces a clearly stronger reward');
});

test('generic enemy routes preserve the open half after chasers aggro', () => {
  const classic = BIOMES.find((entry) => !entry.runStyle);
  const run = buildEncounterRun({ level: 20, mode: 'gates', biome: classic, seed: 2020 });
  const routes = Map.groupBy(
    run.events.filter((event) => event.type === 'enemy'),
    (event) => event.encounterId,
  );
  assert.ok(routes.size >= 1);
  for (const enemies of routes.values()) {
    assert.equal(new Set(enemies.map((enemy) => enemy.routeSide)).size, 1);
    assert.ok(enemies.every((enemy) => Math.sign(enemy.x) === enemy.routeSide));
  }

  const enemy = {
    id: 'test',
    type: { kind: 'chaser', speed: 20, bitePeriod: 1 },
    x: -1.3,
    z: 10,
    hp: 1,
    maxHp: 1,
    t: 0,
    flash: 0,
    biteT: 99,
    tpT: 99,
    dead: false,
    routeSide: -1,
  };
  const runtime = Object.assign({}, CombatMixin, {
    playerX: TUNE.laneHalf,
    playerZ: 0,
    enemies: [enemy],
    eshots: [],
    _units: [],
    power: { sword: 0 },
  });
  runtime.updateEnemies(1);
  assert.equal(enemy.x, -1.2, 'a committed chaser stops at its route boundary');
});
