// Craft Rush procedural level generation: event timeline + spawning.
import { TUNE, ENEMY_TYPES } from './config.js';
import { mulberry32 } from './engine.js';

export const LevelMixin = {
  genLevel(diff) {
    if (this.chapter && this.chapter.credits) return this.genCredits();
    const rng = mulberry32(1000 + this.level * 7919);
    const L = this.level;
    this.length = 420 + Math.min(L, 12) * 35;
    const ev = [];
    const irnd = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    let z = 40;
    let sinceGate = 99;
    while (z < this.length - 45) {
      const roll = rng();
      if (sinceGate >= 2 || roll < 0.3) {
        // ---- gate pair ----
        sinceGate = 0;
        const goodGood = rng() < Math.max(0.3, 0.9 - L * 0.07);
        const boost = this.mut.gateBoost ? 1 : 0;
        const mk = (good) => {
          if (good) {
            if (rng() < (L >= 3 ? 0.42 : 0.25) + boost * 0.2) return { op: 'mul', val: (L >= 5 || boost) && rng() < 0.3 ? 3 : 2 };
            return { op: 'add', val: irnd(2, 3 + Math.min(L, 9) + boost * 4) };
          }
          if (rng() < 0.4) return { op: 'div', val: 2 };
          return { op: 'sub', val: irnd(2, 2 + Math.ceil(L * 1.3)) };
        };
        const a = mk(true);
        const right = rng() < 0.5;
        // wider gate pair: a bigger target and, more importantly, a bigger sign
        ev.push({ z, type: 'gate', x: right ? 2.4 : -2.4, halfW: 2.4, ...a });
        ev.push({ z, type: 'gate', x: right ? -2.4 : 2.4, halfW: 2.4, ...(goodGood ? mk(true) : mk(false)) });
      } else if (roll < 0.52) {
        // ---- enemy cluster ----
        const n = Math.min(10, irnd(2, 3 + Math.ceil(L * 0.8)));
        const cx = (rng() * 2 - 1) * (TUNE.laneHalf - 0.6);
        const pool = this.mut.enemies || this.biome.enemies;
        for (let i = 0; i < n; i++) {
          const id = pick(pool);
          ev.push({
            z: z + rng() * 6, type: 'enemy', id,
            x: Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, cx + (rng() * 2 - 1) * 1.8)),
          });
        }
        z += 4;
      } else if (roll < 0.66 && L >= 2) {
        // ---- obstacle row with gaps ----
        const gapX = (rng() * 2 - 1) * (TUNE.laneHalf - 1.2);
        for (let x = -TUNE.trackHalf + 0.5; x <= TUNE.trackHalf - 0.5; x += 1.0) {
          if (Math.abs(x - gapX) < 1.35) continue;
          if (rng() < 0.12) continue; // ragged rows
          ev.push({ z, type: 'obstacle', x });
        }
      } else if (roll < 0.84) {
        // ---- pickup trail ----
        const appleP = this.mut.appleCommon ? 0.5 : 0.78;
        const kind = rng() < appleP ? 'emerald' : rng() < 0.5 ? 'apple' : 'chest';
        if (kind === 'emerald') {
          const cx = (rng() * 2 - 1) * (TUNE.laneHalf - 0.8);
          const arc = rng() < 0.5;
          const n = irnd(5, 8);
          for (let i = 0; i < n; i++) {
            ev.push({ z: z + i * 1.4, type: 'pickup', kind: 'emerald', x: cx + (arc ? Math.sin(i / (n - 1) * Math.PI) * 1.6 : 0) });
          }
          z += n * 1.4;
        } else {
          ev.push({ z, type: 'pickup', kind, x: (rng() * 2 - 1) * (TUNE.laneHalf - 0.8) });
        }
      } else if (roll < 0.92) {
        // gates mode gets the melee tools; shooter gets the full pool
        const pool = this.mode === 'shooter'
          ? ['powerup_triple', 'powerup_rapid', 'powerup_power', 'powerup_sword', 'powerup_axe']
          : ['powerup_sword', 'powerup_axe'];
        ev.push({ z, type: 'pickup', kind: pick(pool), x: (rng() * 2 - 1) * (TUNE.laneHalf - 0.8) });
      } else if ((roll < 0.955 && L >= 3) || (this.mut.tntCommon && roll < 0.99)) {
        ev.push({ z, type: 'pickup', kind: 'tnt', x: (rng() * 2 - 1) * (TUNE.laneHalf - 0.8) });
      } // else breather
      z += irnd(13, 21);
      sinceGate++;
    }
    ev.sort((p, q) => p.z - q.z);
    this.events = ev;
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
        this.gates.push({ x: e.x, z: e.z, halfW: e.halfW, op: e.op, val: e.val, hits: 0, used: false, pulse: 0 });
      } else if (e.type === 'enemy') {
        this.spawnEnemy(e.id, e.x, e.z);
      } else if (e.type === 'obstacle') {
        this.obstacles.push({ x: e.x, z: e.z, hp: 3, sprite: this.biome.obstacle, wobble: 0 });
      } else if (e.type === 'pickup') {
        this.pickups.push({ kind: e.kind, x: e.x, z: e.z, t: Math.random() * 6, hp: e.kind === 'chest' ? 4 : 0 });
      }
    }
  },

  spawnEnemy(id, x, z) {
    const type = ENEMY_TYPES[id];
    if (!type) return;
    const diff = this.levelDiff();
    const hp = Math.ceil(type.hp * diff * (this.mut.enemyHpMul || 1));
    this.enemies.push({
      id, type, x, z,
      hp, maxHp: hp,
      t: Math.random() * 4, flash: 0, fuse: -1, shotT: 1 + Math.random(), biteT: 0,
      tpT: 2 + Math.random() * 2, dead: false,
    });
  },
};
