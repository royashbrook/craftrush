// Craft Rush procedural level generation: event timeline + spawning.
import { TUNE, ENEMY_TYPES } from './config.js';
import { buildEncounterRun, sweepObstacleX } from './encounters.js';

export const LevelMixin = {
  genLevel(diff) {
    if (this.chapter && this.chapter.credits) return this.genCredits();
    const run = buildEncounterRun({
      level: this.level,
      mode: this.mode,
      biome: this.biome,
      mut: this.mut,
      seed: 1000 + this.level * 7919,
    });
    this.length = run.length;
    this.runStyle = run.runStyle;
    this.encounters = run.encounters;
    this.events = run.events;
  },

  // The walk home. Nothing can hurt you here: only kind gates, emeralds to sweep
  // up, and the names of everyone the run was built out of, floating past.
  genCredits() {
    this.creditSigns = [];
    this.length = 900;
    const ev = [];
    const lines = [
      ['CRAFT RUSH', 'you finished it'],
      ['THE DRAGON', 'fell'],
      ['THE WITHER', 'fell too'],
      ['YOUR VILLAGE', 'still waiting at home'],
      ['NO ADS', 'not one, not ever'],
      ['MADE FOR', 'my kids'],
      ['THANKS FOR', 'playing'],
    ];
    lines.forEach((L, i) => this.creditSigns.push({ z: 90 + i * 110, text: L[0], sub: L[1] }));

    for (let z = 60; z < this.length - 40; z += 46) {
      // every gate is a good one, so the crowd only ever grows on the way home
      const right = (z / 46) % 2 < 1;
      ev.push({ z, type: 'gate', x: right ? 2.4 : -2.4, halfW: 2.4, op: 'add', val: 6 });
      ev.push({ z, type: 'gate', x: right ? -2.4 : 2.4, halfW: 2.4, op: 'mul', val: 2 });
      for (let i = 0; i < 7; i++) {
        ev.push({ z: z + 12 + i * 1.6, type: 'pickup', kind: 'emerald', x: Math.sin(i / 6 * Math.PI) * 1.8 - 0.9 });
      }
    }
    ev.sort((a, b) => a.z - b.z);
    this.events = ev;
  },

  spawnPending() {
    while (this.eventIdx < this.events.length && this.events[this.eventIdx].z < this.playerZ + TUNE.spawnAhead) {
      const e = this.events[this.eventIdx++];
      if (e.type === 'gate') {
        this.gates.push({
          x: e.x, z: e.z, halfW: e.halfW, op: e.op, val: e.val,
          risk: !!e.risk, followThroughZ: e.followThroughZ,
          encounterId: e.encounterId, hits: 0, used: false, pulse: 0,
        });
      } else if (e.type === 'enemy') {
        this.spawnEnemy(e.id, e.x, e.z, { routeSide: e.routeSide });
      } else if (e.type === 'obstacle') {
        this.obstacles.push({
          x: e.x,
          baseX: e.baseX ?? e.x,
          z: e.z,
          hp: 3,
          sprite: this.biome.obstacle,
          wobble: 0,
          stationary: !!e.stationary,
          directed: !!e.directed,
          motion: e.motion ? { ...e.motion } : null,
          encounterId: e.encounterId,
        });
      } else if (e.type === 'pickup') {
        this.pickups.push({ kind: e.kind, x: e.x, z: e.z, t: Math.random() * 6, hp: e.kind === 'chest' ? 4 : 0 });
      } else if (e.type === 'ambush_trigger') {
        this.encounterTriggers.push({
          choiceZ: e.choiceZ,
          dangerZ: e.dangerZ,
          defaultSide: e.defaultSide,
          branches: e.branches,
          encounterId: e.encounterId,
          fired: false,
        });
      }
    }
  },

  // Resolve directed mechanics before arrows, giants, or regular collision tests.
  // Forest enemies only become live objects once the player commits to a fork.
  updateEncounterRuntime() {
    if (this.state !== 'run') {
      this.encounterTriggers.length = 0;
      return;
    }

    for (const obstacle of this.obstacles) {
      if (!obstacle.motion) continue;
      obstacle.x = sweepObstacleX(obstacle.baseX, obstacle.motion, this.playerZ);
    }

    for (const trigger of this.encounterTriggers) {
      if (trigger.fired || this.playerZ < trigger.choiceZ) continue;
      trigger.fired = true;
      const side = this.playerX < -0.05
        ? 'left'
        : this.playerX > 0.05
          ? 'right'
          : trigger.defaultSide < 0 ? 'left' : 'right';
      for (const enemy of trigger.branches[side] || []) {
        this.spawnEnemy(enemy.id, enemy.x, enemy.z);
      }
      this.floaty?.('AMBUSH!', this.playerX, this.playerZ + 6, '#ffd94d', 1.2);
    }
    this.encounterTriggers = this.encounterTriggers.filter((trigger) => !trigger.fired);
  },

  spawnEnemy(id, x, z, options = {}) {
    const type = ENEMY_TYPES[id];
    if (!type) return;
    const diff = this.levelDiff();
    const hp = Math.ceil(type.hp * diff * (this.mut.enemyHpMul || 1));
    this.enemies.push({
      id, type, x, z,
      hp, maxHp: hp,
      t: Math.random() * 4, flash: 0, fuse: -1, shotT: 1 + Math.random(), biteT: 0,
      tpT: 2 + Math.random() * 2, dead: false,
      routeSide: options.routeSide || 0,
    });
  },
};
