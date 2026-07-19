// Craft Rush core game: crowd sim, dual-mode (shooter / gates), procedural
// levels, enemies, bosses, effects. World units: blocks; +z is down-track.
import { TUNE, ENEMY_TYPES, BOSS_TYPES, BIOMES, SKINS, CAMERAS, TIERS, COSMETICS } from './config.js';
import { Camera, renderWorld, DrawQueue, drawShadow, outlineText, mulberry32, hash2 } from './engine.js';
import { getSprite, blit, hasSprite } from './assets.js';
import { Audio } from './audio.js';

const PPB_ART = 12.5; // art pixels per world block (runner is 18px ≈ 1.45 blocks)

export class Game {
  constructor(canvas, save, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.save = save;
    this.hooks = hooks; // { onHud, onRunEnd, onTutorial }
    this.cam = new Camera();
    this.queue = new DrawQueue();
    this.state = 'menu';
    this.paused = false;
    this.t = 0;
    this.freeze = 0;
    this.flashFx = 0;
    this.level = save.level;
    this.mode = save.mode;
    this.biome = BIOMES[(this.level - 1) % BIOMES.length];
    this.menuScroll = 0;
    this._initInput();
    this.resetRunState();
    this.applyCamera();
    this.refreshCosmetics();
  }

  applyCamera() {
    this.cam.setPreset(CAMERAS[this.save.camera] || CAMERAS.far);
  }

  applySkin() {
    this.skin = SKINS.find((s) => s.id === this.save.skin) || SKINS[0];
  }

  abandonRun() {
    // give-up from the pause menu — no rewards, back to a clean menu state
    this.paused = false;
    this.state = 'menu';
    this.boss = null;
    Audio.stopMusic();
    this.resetRunState();
  }

  refreshCosmetics() {
    const pick = (cat) => {
      const id = this.save.cosmetics?.[cat] || 'none';
      const def = COSMETICS[cat].find(d => d.id === id);
      return def && def.id !== 'none' ? def : null;
    };
    this.cosmetic = { cape: pick('cape'), hat: pick('hat'), trail: pick('trail'), pet: pick('pet') };
  }

  resize(W, H) {
    this.canvas.width = W; this.canvas.height = H;
    this.cam.resize(W, H);
    this.ctx.imageSmoothingEnabled = false;
  }

  resetRunState() {
    this.crowd = [];
    this.enemies = [];
    this.gates = [];
    this.obstacles = [];
    this.pickups = [];
    this.arrows = [];
    this.eshots = [];
    this.summons = [];
    this.particles = [];
    this.rings = [];
    this.floaties = [];
    this.waves = [];
    this.boss = null;
    this.bossDead = false;
    this.gigas = [];
    this.titans = [];
    this.reserve = 0;
    this.playerX = 0; this.playerZ = 0; this.targetX = 0;
    this.speed = 0;
    this.redstone = 0;
    this.runEmeralds = 0; this.kills = 0; this.bestCrowd = 0;
    this.volleyT = 0;
    this.power = { triple: 0, rapid: 0, power: 0 };
    this.events = [];
    this.eventIdx = 0;
    this.length = 0;
    this.golemHintShown = false;
  }

  // ---------- run lifecycle ----------
  startRun() {
    this.resetRunState();
    this.level = this.save.level;
    this.mode = this.save.mode;
    this.biome = BIOMES[(this.level - 1) % BIOMES.length];
    this.applySkin();
    this.paused = false;
    const diff = this.levelDiff();
    this.speed = Math.min(TUNE.speedCap, TUNE.runSpeed * (1 + TUNE.speedRamp * (this.level - 1)));
    this.genLevel(diff);
    this.setWorth(TUNE.crowdStart);
    this.state = 'run';
    this.t = 0;
    this.applyCamera();
    this.refreshCosmetics();
    Audio.music('run');
    if (!this.save.tutorialSeen) this.hooks.onTutorial('steer');
  }

  levelDiff() { return 1 + (this.level - 1) * 0.35; }

  genLevel(diff) {
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
        const mk = (good) => {
          if (good) {
            if (rng() < (L >= 3 ? 0.42 : 0.25)) return { op: 'mul', val: L >= 5 && rng() < 0.25 ? 3 : 2 };
            return { op: 'add', val: irnd(2, 3 + Math.min(L, 9)) };
          }
          if (rng() < 0.4) return { op: 'div', val: 2 };
          return { op: 'sub', val: irnd(2, 2 + Math.ceil(L * 1.3)) };
        };
        const a = mk(true);
        const right = rng() < 0.5;
        ev.push({ z, type: 'gate', x: right ? 1.9 : -1.9, halfW: 1.9, ...a });
        ev.push({ z, type: 'gate', x: right ? -1.9 : 1.9, halfW: 1.9, ...(goodGood ? mk(true) : mk(false)) });
      } else if (roll < 0.52) {
        // ---- enemy cluster ----
        const n = Math.min(10, irnd(2, 3 + Math.ceil(L * 0.8)));
        const cx = (rng() * 2 - 1) * (TUNE.laneHalf - 0.6);
        for (let i = 0; i < n; i++) {
          const id = pick(this.biome.enemies);
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
        const kind = rng() < 0.78 ? 'emerald' : rng() < 0.5 ? 'apple' : 'chest';
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
      } else if (roll < 0.92 && this.mode === 'shooter') {
        ev.push({ z, type: 'pickup', kind: pick(['powerup_triple', 'powerup_rapid', 'powerup_power']), x: (rng() * 2 - 1) * (TUNE.laneHalf - 0.8) });
      } else if (roll < 0.955 && L >= 3) {
        ev.push({ z, type: 'pickup', kind: 'tnt', x: (rng() * 2 - 1) * (TUNE.laneHalf - 0.8) });
      } // else breather
      z += irnd(13, 21);
      sinceGate++;
    }
    ev.sort((p, q) => p.z - q.z);
    this.events = ev;
  }

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
  }

  spawnEnemy(id, x, z) {
    const type = ENEMY_TYPES[id];
    if (!type) return;
    const diff = this.levelDiff();
    this.enemies.push({
      id, type, x, z,
      hp: Math.ceil(type.hp * diff), maxHp: Math.ceil(type.hp * diff),
      t: Math.random() * 4, flash: 0, fuse: -1, shotT: 1 + Math.random(), biteT: 0,
      tpT: 2 + Math.random() * 2, dead: false,
    });
  }

  // ---------- crowd (worth-based, unbounded) ----------
  // worth = crowd(x1) + gigas(x10) + titans(x100) + reserve. Arrays are pure
  // visualization of the current worth; reserve holds the uncapped overflow.
  worth() {
    return this.crowd.length + this.gigas.length * TIERS.gigaWorth
      + this.titans.length * TIERS.titanWorth + this.reserve;
  }

  makeUnit(backRow) {
    return { ox: (Math.random() - 0.5) * 1.5, oz: backRow ? -2.5 : -Math.random() * 1.2,
      tx: 0, tz: backRow ? -2.5 : 0, phase: Math.random() * 7, flash: 0 };
  }

  syncCount(arr, target, backRow) {
    while (arr.length > target) arr.pop();
    while (arr.length < target) arr.push(this.makeUnit(backRow));
  }

  // rebalance the tier arrays to represent `total` worth
  setWorth(total, fx = false) {
    total = Math.max(0, Math.floor(total));
    const prevGigas = this.gigas.length, prevTitans = this.titans.length;
    const t = Math.min(TIERS.maxTitans, Math.floor(total / TIERS.titanWorth));
    let rem = total - t * TIERS.titanWorth;
    const g = Math.min(TIERS.maxGigas, Math.floor(rem / TIERS.gigaWorth));
    rem -= g * TIERS.gigaWorth;
    const r = Math.min(TIERS.maxRunners, rem);
    this.reserve = total - (t * TIERS.titanWorth + g * TIERS.gigaWorth + r);
    this.syncCount(this.titans, t, true);
    this.syncCount(this.gigas, g, true);
    this.syncCount(this.crowd, r, false);
    this.reform();
    if (fx) {
      if (this.titans.length > prevTitans) this.tierPop('TITAN STEVE!', this.titans[this.titans.length - 1], '#ff5545');
      else if (this.gigas.length > prevGigas) this.tierPop('GIGA STEVE!', this.gigas[this.gigas.length - 1], '#ffd94d');
    }
    if (this.save.stats) {
      if (this.gigas.length > prevGigas) this.save.stats.gigas = (this.save.stats.gigas || 0) + (this.gigas.length - prevGigas);
    }
    this.bestCrowd = Math.max(this.bestCrowd, this.worth());
  }

  tierPop(text, unit, color) {
    if (!unit) return;
    this.floaty(text, this.playerX + unit.tx, this.playerZ + unit.tz + 1, color, 1.7);
    this.burst(this.playerX + unit.tx, 1.8, this.playerZ + unit.tz, [color, this.skin.palette.t, '#ffffff'], 18, 7);
    this.ring(this.playerX + unit.tx, this.playerZ + unit.tz, 2.2);
    this.cam.shake = Math.min(1, this.cam.shake + 0.25);
    Audio.sfx('golem');
  }

  addRunners(n, silent = false) {
    if (n <= 0) return;
    const before = this.worth();
    this.setWorth(before + n, true);
    if (!silent) this.floaty(`+${this.worth() - before}`, this.playerX, this.playerZ + 1, '#7dff7d', 1.4);
  }

  // lose `n` worth; pops fx near the impact point; ends the run when worth hits 0
  killRunners(n, atX = null, atZ = null) {
    const before = this.worth();
    const lost = Math.min(n, before);
    if (lost <= 0) return;
    // pop a few visible units near the hit for feedback (visual only)
    const pops = Math.min(lost, 6);
    const pool = this.crowd.length ? this.crowd : this.gigas.length ? this.gigas : this.titans;
    for (let i = 0; i < pops && pool.length; i++) {
      let idx = Math.floor(Math.random() * pool.length);
      if (atX !== null) {
        let best = 1e9;
        pool.forEach((m, j) => {
          const d = Math.abs(this.playerX + m.ox - atX) + Math.abs(this.playerZ + m.oz - (atZ ?? this.playerZ));
          if (d < best) { best = d; idx = j; }
        });
      }
      const m = pool[idx];
      this.burst(this.playerX + m.ox, 0.8, this.playerZ + m.oz, [this.skin.palette.t, this.skin.palette.s, this.skin.palette.l], 7);
    }
    Audio.sfx('pop', 70);
    this.setWorth(before - lost);
    if (this.worth() <= 0 && !this.bossDead && (this.state === 'run' || this.state === 'boss')) this.endRun(false);
  }

  crowdSpacing() {
    return Math.min(TUNE.formationC, 4.1 / Math.sqrt(this.crowd.length + 1));
  }

  titanScale() {
    return TIERS.titanScale * (1 + TIERS.titanMaxGrow * Math.min(1, this.reserve / TIERS.reserveFullScale));
  }

  reform() {
    const c = this.crowdSpacing();
    this.crowd.forEach((m, i) => {
      const r = c * Math.sqrt(i + 0.6);
      const a = i * 2.399963;
      m.tx = Math.cos(a) * r;
      m.tz = Math.sin(a) * r * 0.72;
    });
    // gigas then titans march in rows behind the crowd, biggest closest to camera
    const crowdR = c * Math.sqrt(this.crowd.length + 1) * 0.72;
    let backZ = -(crowdR + 1.3);
    this.rowFormation(this.gigas, backZ, 6, 1.15);
    backZ -= Math.ceil(this.gigas.length / 6) * 1.2 + 1.6;
    this.rowFormation(this.titans, backZ, 5, 1.9);
  }

  rowFormation(arr, backZ, perRow, spacing) {
    arr.forEach((u, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, arr.length - row * perRow);
      const col = i % perRow;
      u.tx = (col - (inRow - 1) / 2) * spacing;
      u.tz = backZ - row * spacing * 1.05;
    });
  }

  // ---------- fx ----------
  burst(x, y, z, colors, n = 8, spd = 5) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y: y + Math.random() * 0.4, z,
        vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd * 0.9 + 1.5, vz: (Math.random() - 0.5) * spd,
        life: 0.55 + Math.random() * 0.4, color: colors[i % colors.length], size: 0.11 + Math.random() * 0.1,
      });
    }
  }

  ring(x, z, maxR = 2.2) { this.rings.push({ x, z, r: 0.3, maxR, life: 0.4, T: 0.4 }); }

  floaty(text, x, z, color = '#fff', sizeMul = 1) {
    this.floaties.push({ text, x, z, y: 1.6, vy: 2.2, life: 0.95, T: 0.95, color, sizeMul });
  }

  explode(x, z, radius, kills, hurtEnemies = true) {
    Audio.sfx('boom');
    this.cam.shake = Math.min(1, this.cam.shake + 0.45);
    this.burst(x, 0.7, z, ['#ff9d3c', '#ffd94d', '#8a8a8a', '#4a4a4a'], 22, 8);
    this.ring(x, z, radius + 0.8);
    // crowd hurt
    const victims = [];
    this.crowd.forEach((m) => {
      const dx = this.playerX + m.ox - x, dz = this.playerZ + m.oz - z;
      if (dx * dx + dz * dz < radius * radius) victims.push(m);
    });
    this.killRunners(Math.min(kills, victims.length), x, z);
    if (hurtEnemies) {
      for (const e of this.enemies) {
        const dx = e.x - x, dz = e.z - z;
        if (!e.dead && dx * dx + dz * dz < radius * radius) this.damageEnemy(e, 999, true);
      }
      for (const o of this.obstacles) {
        const dx = o.x - x, dz = o.z - z;
        if (dx * dx + dz * dz < (radius + 0.5) * (radius + 0.5)) o.hp = 0;
      }
    }
  }

  // ---------- combat ----------
  damageEnemy(e, dmg, silent = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.09;
    if (!silent) Audio.sfx('hit', 60);
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.redstone = Math.min(TUNE.redstoneMax, this.redstone + TUNE.redstonePerKill);
      const cols = e.id.includes('creeper') ? ['#4fbf3c', '#2b7d20', '#66d94f'] :
        e.id.includes('skeleton') || e.id.includes('stray') ? ['#e8e8e8', '#9e9e9e', '#666'] :
        e.id.includes('blaze') || e.id.includes('magma') ? ['#ffb63c', '#ff7b2e', '#6d2828'] :
        e.id.includes('ender') ? ['#1c1c1c', '#8b3fd6', '#c76bff'] :
        ['#4fa554', '#1e8b8b', '#5e3f8f'];
      this.burst(e.x, 0.9, e.z, cols, 12);
      Audio.sfx('pop', 50);
      if (e.type.splitsTo && ENEMY_TYPES[e.type.splitsTo]) {
        this.spawnEnemy(e.type.splitsTo, e.x - 0.5, e.z + 0.3);
        this.spawnEnemy(e.type.splitsTo, e.x + 0.5, e.z + 0.3);
      }
      if (Math.random() < TUNE.killDropChance) {
        this.pickups.push({ kind: 'emerald', x: e.x, z: e.z, t: 0, hp: 0 });
      }
    }
  }

  fireVolley() {
    const powerMul = this.power.power > 0 ? 2 : 1;
    const n = Math.min(this.crowd.length, TUNE.maxShooters);
    const dmgScale = Math.max(1, Math.round(this.crowd.length / TUNE.maxShooters));
    const dmg = dmgScale * powerMul;
    // aim assist: kid-friendly — arrows curve toward live targets ahead
    const targets = this.enemies.filter(e => !e.dead && e.z > this.playerZ + 1.5 && e.z < this.playerZ + TUNE.arrowRange);
    if (this.boss && !this.boss.entering) targets.push(this.boss);
    const aim = (x, z) => {
      let best = null, bd = 1e9;
      for (const e of targets) {
        const d = Math.abs(e.x - x) + (e.z - z) * 0.12;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return (Math.random() - 0.5) * 0.8;
      const tof = Math.max(0.05, (best.z - z) / TUNE.arrowSpeed);
      return Math.max(-7, Math.min(7, (best.x - x) / tof));
    };
    for (let i = 0; i < n; i++) {
      const m = this.crowd[Math.floor((i / n) * this.crowd.length)];
      const x = this.playerX + m.ox, z = this.playerZ + m.oz + 0.5;
      const vx = aim(x, z);
      this.arrows.push({ x, z, vx, dmg });
      if (this.power.triple > 0) {
        this.arrows.push({ x, z, vx: vx - 4.5, dmg });
        this.arrows.push({ x, z, vx: vx + 4.5, dmg });
      }
    }
    // giants fire one fat arrow each, worth a whole squad
    for (const g of this.gigas) {
      const x = this.playerX + g.ox, z = this.playerZ + g.oz + 1;
      this.arrows.push({ x, z, vx: aim(x, z), dmg: TIERS.gigaWorth * powerMul, big: true });
    }
    // titans hit hardest; reserve worth is folded into their damage
    const titanDmg = (TIERS.titanWorth + (this.titans.length ? Math.floor(this.reserve / this.titans.length) : 0)) * powerMul;
    for (const tt of this.titans) {
      const x = this.playerX + tt.ox, z = this.playerZ + tt.oz + 1;
      this.arrows.push({ x, z, vx: aim(x, z), dmg: titanDmg, big: true, huge: true });
    }
    if (n > 0 || this.gigas.length > 0 || this.titans.length > 0) Audio.sfx('shoot', 90);
  }

  summonGolem() {
    if (this.paused || this.redstone < TUNE.redstoneMax || (this.state !== 'run' && this.state !== 'boss')) return;
    this.redstone = 0;
    if (this.save.stats) this.save.stats.golems = (this.save.stats.golems || 0) + 1;
    this.summons.push({ x: this.playerX, z: this.playerZ + 1.5, t: 0, stompT: 0 });
    this.burst(this.playerX, 1.2, this.playerZ + 1.5, ['#d4d8d4', '#9a9e9a', '#ff5545'], 18);
    this.ring(this.playerX, this.playerZ + 1.5, 2.4);
    this.cam.shake = Math.min(1, this.cam.shake + 0.35);
    Audio.sfx('golem');
  }

  // ---------- gates ----------
  gateLabel(gt) {
    return gt.op === 'add' ? `+${gt.val}` : gt.op === 'mul' ? `×${gt.val}` : gt.op === 'sub' ? `−${gt.val}` : `÷${gt.val}`;
  }

  gateGood(gt) { return gt.op === 'add' || gt.op === 'mul'; }

  applyGate(gt) {
    gt.used = true;
    const n = this.crowd.length;
    if (gt.op === 'add') { this.addRunners(gt.val); Audio.sfx('gate_good'); }
    else if (gt.op === 'mul') { this.addRunners(n * (gt.val - 1)); Audio.sfx('gate_good'); }
    else if (gt.op === 'sub') { if (gt.val > 0) { this.killRunners(gt.val); Audio.sfx('gate_bad'); this.floaty(`−${gt.val}`, gt.x, gt.z, '#ff6d5a', 1.5); } }
    else if (gt.op === 'div') { const k = n - Math.ceil(n / gt.val); if (k > 0) { this.killRunners(k); Audio.sfx('gate_bad'); this.floaty(`÷${gt.val}`, gt.x, gt.z, '#ff6d5a', 1.5); } }
    if (this.gateGood(gt)) this.floaty(this.gateLabel(gt), gt.x, gt.z, '#7dcfff', 1.6);
  }

  shootGate(gt) {
    gt.hits++;
    gt.pulse = 0.15;
    const per = TUNE.gateHitsPerPlus;
    if (gt.op === 'add' && gt.hits % per === 0) gt.val++;
    else if (gt.op === 'sub' && gt.hits % per === 0 && gt.val > 0) gt.val--;
    else if (gt.op === 'mul' && gt.hits >= 14 && gt.val < 3) { gt.val++; gt.hits = -99; }
    else if (gt.op === 'div' && gt.hits >= 12 && gt.val > 1) { gt.val = 1; }
  }

  // ---------- boss ----------
  startBoss() {
    const bt = BOSS_TYPES[this.biome.boss];
    const diff = 1 + (this.level - 1) * 0.3;
    // normalize to the army worth you arrive with, so every boss is a real ~9s fight
    const w = this.worth();
    let hp;
    if (this.mode === 'gates') {
      // charge delivers ~worth*3 total; cap hp below it so no level is unwinnable
      hp = Math.min(
        Math.ceil(bt.hp * diff * 0.4 + w * 1.6),
        Math.max(6, Math.floor(w * 3 * 0.85))
      );
    } else {
      // firepower per volley ~= total worth; target ~8s of sustained fire
      const dps = w / TUNE.volleyInterval;
      hp = Math.ceil(bt.hp * diff * 0.3 + dps * 8);
    }
    this.boss = {
      id: this.biome.boss, type: bt, name: bt.name,
      hp, maxHp: hp,
      x: 0, z: this.length + 17, targetZ: this.length + 10,
      t: 0, flash: 0, attackT: 3.2, attackIdx: 0, lunge: 0, entering: true,
    };
    this.state = 'boss';
    Audio.music('boss');
    Audio.sfx('boss_roar');
    if (this.mode === 'gates') {
      this.floaty('CHARGE!', this.playerX, this.playerZ + 4, '#ffd94d', 2);
    }
  }

  bossAttack() {
    const b = this.boss;
    const atk = b.type.attacks[b.attackIdx % b.type.attacks.length];
    b.attackIdx++;
    if (atk === 'minions') {
      const n = Math.min(6, 2 + Math.ceil(this.level / 2));
      for (let i = 0; i < n; i++) {
        this.spawnEnemy(this.biome.enemies[i % this.biome.enemies.length], (Math.random() * 2 - 1) * 2.5, b.z - 2 - Math.random() * 2);
      }
      Audio.sfx('boss_roar');
    } else if (atk === 'shockwave') {
      const x = Math.random() < 0.6 ? this.playerX : (Math.random() * 2 - 1) * 2;
      this.waves.push({ x, halfW: 1.5, z: b.z - 1, warn: 0.95, speed: 14, kills: Math.min(10, 3 + Math.ceil(this.level / 2)) });
    } else if (atk === 'sonicboom') {
      // Warden signature: a wide cyan blast covering most of the lane — sprint to
      // a gap. Leaves one safe lane so it is always dodgeable.
      const safe = (Math.random() * 2 - 1) * (TUNE.laneHalf - 0.8);
      const side = safe < 0 ? 1 : -1; // put the wall opposite the safe gap
      this.waves.push({ x: side * 2.4, halfW: TUNE.trackHalf - 0.6, z: b.z - 1, warn: 1.15, speed: 20, color: '#2fd6d6', kills: Math.min(14, 4 + Math.ceil(this.level / 2)) });
      Audio.sfx('boss_roar');
    } else if (atk === 'charge') {
      b.lunge = 0.0001; // phase timer: <0.5 windup, then dash
    } else if (atk === 'skulls') {
      for (const spread of [-3.5, 0, 3.5]) {
        this.eshots.push({ x: b.x, z: b.z - 1, vx: (this.playerX - b.x) / 2 + spread, vz: -13, kind: 'fireball', y: 1.4 });
      }
    }
  }

  // ---------- input ----------
  _initInput() {
    const c = this.canvas;
    let dragging = false, lastX = 0;
    const down = (px) => { dragging = true; lastX = px; };
    const move = (px) => {
      if (!dragging || (this.state !== 'run' && this.state !== 'boss')) return;
      const p = this.cam.project(0, 0, this.playerZ);
      const pxPerBlock = p ? p.s : 60;
      this.targetX = Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, this.targetX + (px - lastX) / (pxPerBlock * 0.75)));
      lastX = px;
      if (!this.save.tutorialSeen) { this.save.tutorialSeen = true; this.hooks.onTutorial(null); }
    };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); down(e.clientX); });
    c.addEventListener('pointermove', (e) => move(e.clientX));
    c.addEventListener('pointerup', () => { dragging = false; });
    c.addEventListener('pointercancel', () => { dragging = false; });
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.summonGolem(); }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  // ---------- update ----------
  update(dt) {
    this.t += dt;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.flashFx = Math.max(0, this.flashFx - dt * 3);

    const running = this.state === 'run' || this.state === 'boss';
    if (!running) {
      this.cam.follow(0, this.menuScroll, dt, false);
      this.menuScroll += dt * 2.2; // slow menu fly-through
      this.updateFx(dt);
      return;
    }

    // keyboard steer
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.targetX -= dt * 9;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) this.targetX += dt * 9;
    this.targetX = Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, this.targetX));
    this.playerX += (this.targetX - this.playerX) * Math.min(1, dt * TUNE.steerLerp);

    if (this.state === 'run') {
      this.playerZ += this.speed * dt;
      if (this.playerZ >= this.length) this.startBoss();
      this.spawnPending();
    } else {
      this.updateBoss(dt);
    }

    this.cam.follow(this.playerX, this.playerZ, dt, true);

    // crowd member positions ease to formation
    for (const m of this.crowd) {
      m.ox += (m.tx - m.ox) * Math.min(1, dt * 6);
      m.oz += (m.tz - m.oz) * Math.min(1, dt * 6);
    }
    for (const g of [...this.gigas, ...this.titans]) {
      g.ox += (g.tx - g.ox) * Math.min(1, dt * 4);
      g.oz += (g.tz - g.oz) * Math.min(1, dt * 4);
      g.flash = Math.max(0, g.flash - dt);
      // giants stomp obstacles they walk over
      for (const o of this.obstacles) {
        if (o.hp > 0 && Math.abs(o.x - (this.playerX + g.ox)) < 1.0 && Math.abs(o.z - (this.playerZ + g.oz)) < 1.0) {
          o.hp = 0; this.breakObstacle(o);
          this.cam.shake = Math.min(0.6, this.cam.shake + 0.08);
        }
      }
    }
    this.bestCrowd = Math.max(this.bestCrowd, this.worth());

    // shooting
    if (this.mode === 'shooter') {
      this.volleyT -= dt;
      const interval = TUNE.volleyInterval * (this.power.rapid > 0 ? 0.55 : 1);
      if (this.volleyT <= 0) { this.volleyT = interval; this.fireVolley(); }
      for (const k of Object.keys(this.power)) this.power[k] = Math.max(0, this.power[k] - dt);
    }

    this.updateArrows(dt);
    this.updateEnemies(dt);
    this.updateGatesObstaclesPickups(dt);
    this.updateSummons(dt);
    this.updateWaves(dt);
    this.updateEshots(dt);
    this.updateFx(dt);

    if (this.redstone >= TUNE.redstoneMax && !this.golemHintShown) {
      this.golemHintShown = true;
      this.hooks.onTutorial('golem');
    }

    this.hooks.onHud(this.hudState());
  }

  updateArrows(dt) {
    // substep so arrows can't tunnel through hit windows on slow frames
    const steps = Math.max(1, Math.ceil((TUNE.arrowSpeed * dt) / 0.45));
    const dz = (TUNE.arrowSpeed * dt) / steps;
    for (const a of this.arrows) {
      for (let s = 0; s < steps && !a.dead; s++) {
        a.z += dz;
        a.x += (a.vx * dt) / steps;
        if (a.z > this.playerZ + TUNE.arrowRange) { a.dead = true; break; }
        this.arrowHitTest(a);
      }
    }
    this.arrows = this.arrows.filter(a => !a.dead);
  }

  arrowHitTest(a) {
    for (const e of this.enemies) {
      if (e.dead || e.z < a.z - 0.5 || e.z > a.z + 0.6) continue;
      if (Math.abs(e.x - a.x) < 0.55) {
        this.damageEnemy(e, a.dmg);
        this.redstone = Math.min(TUNE.redstoneMax, this.redstone + TUNE.redstonePerHit);
        a.dead = true;
        return;
      }
    }
    for (const gt of this.gates) {
      if (gt.used || Math.abs(gt.z - a.z) > 0.6) continue;
      if (Math.abs(a.x - gt.x) < gt.halfW) { this.shootGate(gt); a.dead = true; return; }
    }
    for (const o of this.obstacles) {
      if (o.hp <= 0 || Math.abs(o.z - a.z) > 0.6) continue;
      if (Math.abs(a.x - o.x) < 0.55) { o.hp--; o.wobble = 0.15; a.dead = true; if (o.hp <= 0) this.breakObstacle(o); return; }
    }
    for (const p of this.pickups) {
      if (p.kind !== 'chest' || p.dead || Math.abs(p.z - a.z) > 0.6) continue;
      if (Math.abs(a.x - p.x) < 0.6) { p.hp--; a.dead = true; if (p.hp <= 0) this.openChest(p); return; }
    }
    const b = this.boss;
    if (b && !b.entering && !this.bossDead && Math.abs(b.z - a.z) < 2.0 && Math.abs(a.x - b.x) < 2.6) {
      a.dead = true;
      b.hp -= a.dmg; b.flash = 0.08;
      this.redstone = Math.min(TUNE.redstoneMax, this.redstone + TUNE.redstonePerHit);
      Audio.sfx('hit', 70);
      if (b.hp <= 0) this.bossDefeated();
    }
  }

  breakObstacle(o) {
    this.burst(o.x, 0.6, o.z, ['#8a6844', '#6b4f35', '#a58a5a'], 10);
    Audio.sfx('pop', 40);
  }

  openChest(p) {
    p.dead = true;
    this.runEmeralds += TUNE.chestEmeralds;
    this.burst(p.x, 0.8, p.z, ['#2eff70', '#ffd94d', '#8a6844'], 16);
    this.floaty(`+${TUNE.chestEmeralds}`, p.x, p.z, '#2eff70', 1.5);
    Audio.sfx('chest');
  }

  updateEnemies(dt) {
    const px = this.playerX, pz = this.playerZ;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      const distZ = e.z - pz;
      if (distZ < -3) { e.dead = true; continue; } // passed behind
      const aggro = distZ < 26;
      const type = e.type;

      if (type.kind === 'exploder') {
        if (aggro) { e.z -= type.speed * dt; e.x += Math.sign(px - e.x) * Math.min(Math.abs(px - e.x), type.speed * 0.6 * dt); }
        if (e.fuse < 0 && distZ < 2.3 && Math.abs(e.x - px) < 2.0) { e.fuse = type.fuse; }
        if (e.fuse >= 0) {
          e.fuse -= dt;
          if (e.fuse <= 0) { e.dead = true; this.explode(e.x, e.z, type.boomRadius, type.boomKills); continue; }
        }
      } else if (type.kind === 'archer' || type.kind === 'lobber') {
        if (aggro && distZ > type.range * 0.8) { e.z -= type.speed * dt; }
        else if (aggro) {
          e.shotT -= dt;
          if (e.shotT <= 0) {
            e.shotT = type.shotPeriod;
            if (type.kind === 'lobber') {
              this.eshots.push({ x: e.x, z: e.z, vx: (px - e.x) / 1.1, vz: (pz - e.z) / 1.1, kind: 'potion', y: 1.2, vy: 4.5, aoe: type });
            } else {
              const spread = type.spread || 1;
              for (let i = 0; i < spread; i++) {
                const off = (i - (spread - 1) / 2) * 2.2;
                this.eshots.push({ x: e.x, z: e.z, vx: (px - e.x) / 1.4 + off, vz: -12, kind: type.projectile || 'arrow', y: 1.2 });
              }
              Audio.sfx('arrow_in', 120);
            }
          }
        }
      } else if (type.kind === 'swooper') {
        e.z -= type.speed * dt;
        e.x = Math.sin(e.t * 2.4) * 2.6;
      } else { // chaser
        if (aggro) {
          e.z -= type.speed * dt;
          let hx = Math.sign(px - e.x) * Math.min(Math.abs(px - e.x), type.speed * 0.7 * dt);
          if (type.zigzag) hx += Math.sin(e.t * 6) * dt * 2.2;
          e.x += hx;
        }
        if (type.teleports) {
          e.tpT -= dt;
          if (e.tpT <= 0 && aggro && distZ > 4) {
            e.tpT = 2.2;
            this.burst(e.x, 1.2, e.z, ['#8b3fd6', '#c76bff'], 8);
            e.x = Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, px + (Math.random() * 2 - 1) * 1.6));
            e.z = Math.max(pz + 4, e.z - 4);
            this.burst(e.x, 1.2, e.z, ['#8b3fd6', '#c76bff'], 8);
          }
        }
      }

      // contact bites
      if (type.kind !== 'exploder') {
        e.biteT -= dt;
        if (e.biteT <= 0 && distZ < 1.2 && distZ > -1) {
          let hit = false;
          for (const u of [...this.crowd, ...this.gigas, ...this.titans]) {
            if (Math.abs(px + u.ox - e.x) < 0.9 && Math.abs(pz + u.oz - e.z) < 1.1) { hit = true; break; }
          }
          if (hit) {
            e.biteT = type.bitePeriod || 0.8;
            this.killRunners(1, e.x, e.z);
            if (type.kind === 'swooper') e.dead = true;
          }
        }
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  updateGatesObstaclesPickups(dt) {
    const px = this.playerX, pz = this.playerZ;
    // gates: a pair is one choice — apply the nearest overlapped gate, consume the pair
    const crossing = this.gates.filter(g => !g.used && g.z < pz + 0.4 && g.z > pz - 1.5);
    for (const z of new Set(crossing.map(g => g.z))) {
      const pair = crossing.filter(g => g.z === z);
      const hit = pair
        .filter(g => Math.abs(px - g.x) < g.halfW + 0.25)
        .sort((a, b) => Math.abs(px - a.x) - Math.abs(px - b.x))[0];
      if (hit) this.applyGate(hit);
      pair.forEach(g => { g.used = true; });
    }
    for (const gt of this.gates) gt.pulse = Math.max(0, gt.pulse - dt);
    this.gates = this.gates.filter(g => g.z > pz - 4);

    // obstacles: pop runners that touch them
    for (const o of this.obstacles) {
      o.wobble = Math.max(0, o.wobble - dt);
      if (o.hp <= 0) continue;
      if (Math.abs(o.z - pz) < 1.4) {
        for (const m of this.crowd) {
          if (Math.abs(px + m.ox - o.x) < 0.62 && Math.abs(pz + m.oz - o.z) < 0.7) {
            this.killRunners(1, o.x, o.z);
            o.hp--; o.wobble = 0.2;
            if (o.hp <= 0) this.breakObstacle(o);
            break;
          }
        }
      }
    }
    this.obstacles = this.obstacles.filter(o => o.hp > 0 && o.z > pz - 4);

    // pickups
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.t += dt;
      if (Math.abs(p.z - pz) < 2.2) {
        let near = false;
        for (const m of this.crowd) {
          if (Math.abs(px + m.ox - p.x) < 1.0 && Math.abs(pz + m.oz - p.z) < 1.1) { near = true; break; }
        }
        if (near) this.collect(p);
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead && p.z > pz - 4);
  }

  collect(p) {
    if (p.kind === 'chest') {
      if (this.mode === 'gates') this.openChest(p);
      return; // shooter: must shoot it open
    }
    p.dead = true;
    if (p.kind === 'emerald') {
      this.runEmeralds += TUNE.emeraldPickup;
      if (this.mode === 'gates') this.redstone = Math.min(TUNE.redstoneMax, this.redstone + TUNE.redstonePerEmeraldGatesMode);
      Audio.sfx('emerald', 60);
      this.burst(p.x, 1, p.z, ['#2eff70', '#1fcf58'], 4, 3);
    } else if (p.kind === 'apple') {
      this.addRunners(3);
      Audio.sfx('apple');
    } else if (p.kind === 'tnt') {
      this.flashFx = 0.8;
      this.freeze = 0.09;
      Audio.sfx('bigboom');
      this.cam.shake = 1;
      const hits = this.enemies.filter(e => !e.dead && e.z > this.playerZ - 2 && e.z < this.playerZ + 30);
      for (const e of hits) this.damageEnemy(e, 999, true);
      for (const o of this.obstacles) if (o.z < this.playerZ + 30) { o.hp = 0; this.breakObstacle(o); }
      this.floaty('BOOM!', this.playerX, this.playerZ + 5, '#ff9d3c', 2.2);
    } else if (p.kind.startsWith('powerup_')) {
      const k = p.kind.slice(8);
      this.power[k] = TUNE.powerupDur;
      Audio.sfx('powerup');
      this.floaty(k === 'triple' ? 'TRIPLE SHOT!' : k === 'rapid' ? 'RAPID FIRE!' : 'POWER SHOT!', p.x, p.z, '#ffd94d', 1.4);
    }
  }

  updateSummons(dt) {
    for (const s of this.summons) {
      s.t += dt;
      s.z += this.speed * TUNE.golemSpeed * dt + 2 * dt;
      s.stompT -= dt;
      if (s.stompT <= 0) {
        s.stompT = 0.32;
        this.ring(s.x, s.z, 1.5);
        this.cam.shake = Math.min(0.5, this.cam.shake + 0.06);
      }
      for (const e of this.enemies) {
        if (!e.dead && Math.abs(e.z - s.z) < 1.7 && Math.abs(e.x - s.x) < 1.7) this.damageEnemy(e, 999);
      }
      for (const o of this.obstacles) {
        if (o.hp > 0 && Math.abs(o.z - s.z) < 1.6 && Math.abs(o.x - s.x) < 1.6) { o.hp = 0; this.breakObstacle(o); }
      }
      for (const p of this.pickups) {
        if (p.kind === 'chest' && !p.dead && Math.abs(p.z - s.z) < 1.6 && Math.abs(p.x - s.x) < 1.6) this.openChest(p);
      }
      const b = this.boss;
      if (b && !b.entering && Math.abs(b.z - s.z) < 2 && Math.abs(b.x - s.x) < 2.4) {
        b.hp -= 60; b.flash = 0.12; s.dead = true;
        this.explode(s.x, s.z, 1.8, 0, false);
        if (b.hp <= 0) this.bossDefeated();
      }
      if (s.z > this.playerZ + TUNE.golemRange) s.dead = true;
    }
    this.summons = this.summons.filter(s => !s.dead);
  }

  updateWaves(dt) {
    for (const w of this.waves) {
      if (w.warn > 0) { w.warn -= dt; continue; }
      w.z -= w.speed * dt;
      if (w.z <= this.playerZ + 0.5) {
        w.dead = true;
        const inBand = Math.abs(this.playerX - w.x) < w.halfW + 0.4;
        if (inBand) {
          this.killRunners(w.kills, w.x, this.playerZ);
          Audio.sfx('hurt', 100);
          this.cam.shake = Math.min(1, this.cam.shake + 0.3);
        }
      }
    }
    this.waves = this.waves.filter(w => !w.dead);
  }

  updateEshots(dt) {
    const px = this.playerX, pz = this.playerZ;
    for (const s of this.eshots) {
      s.x += s.vx * dt;
      s.z += (s.vz !== undefined ? s.vz : -12) * dt;
      if (s.kind === 'potion') {
        s.vy -= 9.5 * dt;
        s.y += s.vy * dt;
        if (s.y <= 0.1) {
          s.dead = true;
          this.burst(s.x, 0.4, s.z, ['#8b3fd6', '#4fa554'], 10);
          const a = s.aoe;
          let victims = 0;
          for (const m of this.crowd) {
            const dx = px + m.ox - s.x, dz = pz + m.oz - s.z;
            if (dx * dx + dz * dz < a.aoeRadius * a.aoeRadius) victims++;
          }
          if (victims > 0) { this.killRunners(Math.min(a.aoeKills, victims), s.x, s.z); Audio.sfx('hurt', 100); }
          continue;
        }
      } else if (s.z <= pz + 0.6) {
        s.dead = true;
        for (const u of [...this.crowd, ...this.gigas, ...this.titans]) {
          if (Math.abs(px + u.ox - s.x) < 0.75) { this.killRunners(1, s.x, s.z); Audio.sfx('hurt', 100); break; }
        }
        continue;
      }
      if (s.z < pz - 3 || s.z > pz + 60) s.dead = true;
    }
    this.eshots = this.eshots.filter(s => !s.dead);
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    if (this.bossDead) return;
    if (b.entering) {
      b.z -= dt * 5;
      if (b.z <= b.targetZ) { b.z = b.targetZ; b.entering = false; }
      return;
    }
    if (this.mode === 'gates') {
      // crowd charge: the army spends worth to slam the boss, scaled so the
      // fight lasts about the same whether you bring 40 troops or 4000
      this.chargeT = (this.chargeT || 0) - dt;
      if (this.chargeT <= 0 && this.worth() > 0) {
        this.chargeT = 0.09;
        const spend = Math.max(1, Math.ceil(this.worth() / 40));
        this.setWorth(this.worth() - spend);
        b.hp -= spend * 3; b.flash = 0.07;
        this.burst(b.x + (Math.random() - 0.5) * 1.6, 1.2, b.z - 0.8, [this.skin.palette.t, '#ffd94d'], 6);
        Audio.sfx('hit', 40);
        if (b.hp <= 0) { this.bossDefeated(); return; }
        if (this.worth() <= 0) { this.endRun(false); return; }
      }
    } else {
      b.attackT -= dt;
      if (b.attackT <= 0) { b.attackT = Math.max(2.2, 3.6 - this.level * 0.12); this.bossAttack(); }
      if (b.lunge > 0) {
        b.lunge += dt;
        const phase = b.lunge;
        if (phase < 0.5) { /* windup shake */ }
        else if (phase < 1.0) {
          b.z -= dt * 22;
          if (b.z < this.playerZ + 2.5) {
            if (Math.abs(b.x - this.playerX) < 2.2) { this.killRunners(6, b.x, this.playerZ); Audio.sfx('hurt', 100); this.cam.shake = 1; }
            b.lunge = 1.01;
          }
        } else {
          b.z += dt * 10;
          if (b.z >= b.targetZ) { b.z = b.targetZ; b.lunge = 0; }
        }
      }
      b.x += (this.playerX * 0.3 - b.x) * dt * 0.5;
    }
  }

  bossDefeated() {
    if (this.bossDead) return;
    this.bossDead = true;
    const b = this.boss;
    this.freeze = 0.14;
    this.flashFx = 1;
    this.cam.shake = 1;
    Audio.sfx('bigboom');
    // clear every remaining threat so the celebration can't wipe the crowd
    this.eshots = [];
    this.waves = [];
    for (const e of this.enemies) this.damageEnemy(e, 9999, true);
    this.explode(b.x, b.z, 3, 0, true);
    // firework bursts + emerald fountain
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (this.state !== 'boss') return;
        this.burst(b.x + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, b.z - 1, ['#ff5545', '#ffd94d', '#2eff70', '#7dcfff', '#c76bff'], 18, 7);
        Audio.sfx('boom');
      }, 200 + i * 260);
    }
    const bonus = 8 + this.level * 2;
    for (let i = 0; i < bonus; i++) {
      this.pickups.push({ kind: 'emerald', x: (Math.random() * 2 - 1) * 2.5, z: this.playerZ + 3 + Math.random() * 4, t: Math.random() });
    }
    setTimeout(() => { if (this.state === 'boss') this.endRun(true); }, 1900);
  }

  endRun(win) {
    if (this.state !== 'run' && this.state !== 'boss') return;
    this.state = win ? 'won' : 'lost';
    this.paused = false;
    Audio.stopMusic();
    Audio.sfx(win ? 'fanfare' : 'defeat');
    const bonus = win ? TUNE.winBonusBase + this.level * TUNE.winBonusPerLevel + Math.floor(this.bestCrowd / 4) : 0;
    const total = this.runEmeralds + bonus;
    const st = this.save.stats;
    if (st) {
      st.runs = (st.runs || 0) + 1;
      st.kills = (st.kills || 0) + this.kills;
      if (win) {
        st.wins = (st.wins || 0) + 1;
        st.bossWins = st.bossWins || {};
        st.bossWins[this.biome.id] = (st.bossWins[this.biome.id] || 0) + 1;
      }
    }
    this.hooks.onRunEnd({
      win, level: this.level, emeralds: total, pickupEmeralds: this.runEmeralds, bonus,
      kills: this.kills, bestCrowd: this.bestCrowd,
      biome: this.biome.name, mode: this.mode,
    });
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy -= 16 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.4; p.vx *= 0.8; p.vz *= 0.8; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) { r.life -= dt; r.r += (r.maxR / r.T) * dt; }
    this.rings = this.rings.filter(r => r.life > 0);
    for (const f of this.floaties) { f.life -= dt; f.y += f.vy * dt; }
    this.floaties = this.floaties.filter(f => f.life > 0);
  }

  hudState() {
    return {
      emeralds: this.save.emeralds + this.runEmeralds,
      crowd: this.worth(),
      progress: Math.min(1, this.playerZ / this.length),
      redstone: this.redstone, redstoneMax: TUNE.redstoneMax,
      level: this.level, biome: this.biome.name, mode: this.mode,
      boss: this.boss && this.state === 'boss' ? { name: this.boss.name, hp: Math.max(0, this.boss.hp), max: this.boss.maxHp, needRunners: this.mode === 'gates' ? Math.ceil(this.boss.hp / 3) : null } : null,
      power: this.power,
    };
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx, cam = this.cam;
    const { W, H } = cam;
    ctx.clearRect(0, 0, W, H);
    renderWorld(ctx, cam, this.biome, this.t);
    const q = this.queue;

    this.renderScenery(q);
    this.renderGates(q);
    this.renderObstacles(q);
    this.renderPickups(q);
    this.renderEnemies(q);
    this.renderWavesTelegraph(ctx);
    this.renderSummons(q);
    if (this.boss) this.renderBoss(q);
    this.renderPet(q);
    this.renderCrowd(q);
    this.renderArrows(q);
    this.renderEshots(q);
    this.renderParticles(q);
    q.flush(ctx);
    this.renderFloaties(ctx);
    this.renderCrowdLabel(ctx);

    if (this.flashFx > 0) {
      ctx.globalAlpha = Math.min(0.85, this.flashFx);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  bb(q, spriteId, x, z, worldH, opts = {}) {
    const p = this.cam.project(x, 0, z);
    if (!p || p.sy < this.cam.horizon - 200) return;
    const spr = getSprite(spriteId, opts.palette, opts.palKey);
    q.add(z + (opts.zBias || 0), (ctx) => {
      const hPx = worldH * p.s;
      if (opts.shadow !== false) drawShadow(ctx, p, hPx * spr.w / spr.h * 0.8);
      const yOff = (opts.yOff || 0) * p.s;
      blit(ctx, spr, opts.frame || 0, p.sx, p.sy - yOff, hPx, opts);
    });
  }

  renderScenery(q) {
    // deterministic per-cell decoration, no storage
    const seed = 4242 + this.level * 17;
    const zi0 = Math.floor(this.cam.z + 2), zi1 = Math.floor(this.cam.z + TUNE.viewDist);
    for (let zi = zi0; zi <= zi1; zi++) {
      for (const side of [-1, 1]) {
        const h = hash2(zi, seed + side * 31);
        if (h < 0.24) {
          const sc = this.biome.scenery;
          const id = sc[Math.floor(hash2(zi, seed + side * 77) * sc.length)];
          if (!hasSprite(id)) continue;
          const x = side * (TUNE.trackHalf + 1.6 + hash2(zi, seed + side * 13) * 3.4);
          const wh = id.includes('tree') || id.includes('pillar') || id.includes('house') ? 3.1 : id.includes('fungus') || id.includes('cactus') ? 1.9 : 1.1;
          this.bb(q, id, x, zi + 0.5, wh + hash2(zi, side) * 0.5, { shadow: false });
        }
      }
    }
  }

  renderGates(q) {
    for (const gt of this.gates) {
      if (gt.used) continue;
      const p = this.cam.project(gt.x, 0, gt.z);
      if (!p) continue;
      const good = this.gateGood(gt);
      q.add(gt.z, (ctx) => {
        const wPx = gt.halfW * 2 * p.s;
        const hPx = 2.3 * p.s * (1 + gt.pulse * 1.4);
        const x0 = p.sx - wPx / 2, y0 = p.sy - hPx;
        // posts
        ctx.fillStyle = '#241b2e';
        ctx.fillRect(x0 - p.s * 0.18, y0, p.s * 0.22, hPx);
        ctx.fillRect(x0 + wPx - p.s * 0.04, y0, p.s * 0.22, hPx);
        ctx.fillRect(x0 - p.s * 0.18, y0 - p.s * 0.2, wPx + p.s * 0.4, p.s * 0.24);
        // portal fill
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = good ? '#3fa9ff' : '#ff5533';
        ctx.fillRect(x0, y0, wPx, hPx);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffffff';
        const sh = ((this.t * 2 + gt.z) % 1) * hPx;
        ctx.fillRect(x0, y0 + sh, wPx, Math.max(2, hPx * 0.08));
        ctx.globalAlpha = 1;
        outlineText(ctx, this.gateLabel(gt), p.sx, y0 + hPx * 0.42, Math.max(11, p.s * 0.8), good ? '#eaf6ff' : '#ffe3dc');
        if (this.mode === 'shooter' && !good) {
          outlineText(ctx, 'SHOOT ME!', p.sx, y0 + hPx * 0.8, Math.max(8, p.s * 0.3), '#ffd94d');
        }
      });
    }
  }

  renderObstacles(q) {
    for (const o of this.obstacles) {
      this.bb(q, o.sprite, o.x + Math.sin(o.wobble * 40) * 0.06, o.z, 1.15, {});
    }
  }

  renderPickups(q) {
    for (const p of this.pickups) {
      if (p.dead) continue;
      const bob = Math.sin(p.t * 3 + p.z) * 0.12 + 0.5;
      const idMap = { emerald: 'emerald', apple: 'golden_apple', tnt: 'tnt_block', chest: 'chest', powerup_triple: 'powerup_triple', powerup_rapid: 'powerup_rapid', powerup_power: 'powerup_power' };
      const id = idMap[p.kind] || 'emerald';
      const frame = Math.floor(p.t * 3) % 2;
      this.bb(q, id, p.x, p.z, p.kind === 'chest' ? 1.0 : 0.72, { yOff: p.kind === 'chest' ? 0 : bob, frame, zBias: -0.01 });
    }
  }

  renderEnemies(q) {
    for (const e of this.enemies) {
      const spriteId = e.type.sprite || e.id;
      const hop = e.type.hops ? Math.abs(Math.sin(e.t * 5)) * 0.35 : 0;
      const fl = e.type.floats ? 0.5 + Math.sin(e.t * 3) * 0.15 : 0;
      const fuseFlash = e.fuse >= 0 && (Math.floor(e.t * 12) % 2 === 0);
      this.bb(q, spriteId, e.x, e.z, e.type.worldH, {
        frame: Math.floor(e.t * 5) % 2,
        flash: e.flash > 0 || fuseFlash,
        yOff: hop + fl,
      });
      // hp pips for tougher enemies
      if (e.maxHp >= 10 && e.hp < e.maxHp) {
        const p = this.cam.project(e.x, 0, e.z);
        if (p) q.add(e.z - 0.01, (ctx) => {
          const w = p.s * 1.2, y = p.sy - e.type.worldH * p.s - p.s * 0.3;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(p.sx - w / 2, y, w, Math.max(2, p.s * 0.1));
          ctx.fillStyle = '#ff5545';
          ctx.fillRect(p.sx - w / 2, y, w * (e.hp / e.maxHp), Math.max(2, p.s * 0.1));
        });
      }
    }
  }

  renderWavesTelegraph(ctx) {
    for (const w of this.waves) {
      const steps = 14;
      ctx.globalAlpha = w.warn > 0 ? 0.22 + 0.12 * Math.sin(this.t * 16) : 0.4;
      ctx.fillStyle = w.color || '#ff3b2e';
      const z0 = this.playerZ + 1, z1 = w.z;
      for (let i = 0; i < steps; i++) {
        const z = z0 + (z1 - z0) * (i / steps);
        const pa = this.cam.project(w.x - w.halfW, 0, z);
        const pb = this.cam.project(w.x + w.halfW, 0, z + (z1 - z0) / steps);
        if (!pa || !pb) continue;
        ctx.fillRect(pa.sx, Math.min(pa.sy, pb.sy), pb.sx - pa.sx, Math.abs(pa.sy - pb.sy) + 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  renderSummons(q) {
    for (const s of this.summons) {
      this.bb(q, 'iron_golem', s.x, s.z, 2.6, { frame: Math.floor(s.t * 6) % 2 });
    }
  }

  renderBoss(q) {
    const b = this.boss;
    const shakeX = b.lunge > 0 && b.lunge < 0.5 ? (Math.random() - 0.5) * 0.2 : 0;
    this.bb(q, b.id, b.x + shakeX, b.z, b.type.worldH, {
      frame: Math.floor(b.t * 3) % 2,
      flash: b.flash > 0,
    });
  }

  capeSprite() {
    const def = this.cosmetic?.cape;
    if (!def) return null;
    if (def.rainbow) {
      const CYCLE = [
        { c: '#ff5545', C: '#c02a1c' }, { c: '#ffd94d', C: '#c29222' },
        { c: '#2eff70', C: '#1d8f3e' }, { c: '#3fa9ff', C: '#2465a8' },
        { c: '#c76bff', C: '#8b3fd6' },
      ];
      const i = Math.floor(this.t * 4) % CYCLE.length;
      return getSprite('cape', CYCLE[i], `cape_rainbow_${i}`);
    }
    return getSprite('cape', def.colors, def.id);
  }

  renderCrowd(q) {
    const skin = this.skin || SKINS[0];
    const capeSpr = this.capeSprite();
    const hatDef = this.cosmetic?.hat;
    const hatSpr = hatDef && hasSprite(hatDef.sprite) ? getSprite(hatDef.sprite) : null;

    const drawUnit = (x, z, worldH, frame, bob, phase, tier, flash) => {
      const p = this.cam.project(x, 0, z);
      if (!p) return;
      // giants get a gold (giga) or fiery-gold (titan) boot accent to read as elite
      const palette = tier === 2 ? { ...skin.palette, b: '#ff8c1a', L: '#c24a12' }
        : tier === 1 ? { ...skin.palette, b: '#f3c53f' } : skin.palette;
      const palKey = tier === 2 ? `${skin.id}_titan` : tier === 1 ? `${skin.id}_giga` : skin.id;
      q.add(z, (ctx) => {
        const hPx = worldH * p.s;
        const px1 = hPx / 18; // one art pixel of the 18px-tall runner
        const spr = getSprite('runner_back', palette, palKey);
        drawShadow(ctx, p, hPx * spr.w / spr.h * 0.8);
        const y = p.sy - bob * p.s;
        blit(ctx, spr, frame, p.sx, y, hPx, { flash });
        if (capeSpr) {
          const sway = Math.sin(this.t * 6 + phase);
          blit(ctx, capeSpr, Math.abs(sway) > 0.45 ? 1 : 0, p.sx, y - px1 * 3.5, px1 * 9, { flip: sway < 0 });
        }
        if (hatSpr) {
          // scale hats to head width (~8 art px incl. overhang), not their native size
          blit(ctx, hatSpr, 0, p.sx, y - hPx + px1 * 1.2, (hatSpr.h / hatSpr.w) * 8 * px1);
        }
      });
    };

    for (const m of this.crowd) {
      drawUnit(this.playerX + m.ox, this.playerZ + m.oz, 1.45,
        Math.floor(this.t * 8 + m.phase) % 2,
        Math.abs(Math.sin(this.t * 9 + m.phase)) * 0.12, m.phase, 0, false);
    }
    for (const g of this.gigas) {
      drawUnit(this.playerX + g.ox, this.playerZ + g.oz, 1.45 * TIERS.gigaScale,
        Math.floor(this.t * 5 + g.phase) % 2,
        Math.abs(Math.sin(this.t * 5 + g.phase)) * 0.16, g.phase, 1, g.flash > 0);
    }
    const tScale = 1.45 * this.titanScale();
    for (const tt of this.titans) {
      drawUnit(this.playerX + tt.ox, this.playerZ + tt.oz, tScale,
        Math.floor(this.t * 4 + tt.phase) % 2,
        Math.abs(Math.sin(this.t * 4 + tt.phase)) * 0.2, tt.phase, 2, tt.flash > 0);
    }
  }

  renderPet(q) {
    const pet = this.cosmetic?.pet;
    if (!pet || !hasSprite(pet.sprite) || (this.state !== 'run' && this.state !== 'boss')) return;
    const flying = pet.id === 'pet_parrot';
    const bob = flying ? 1.4 + Math.sin(this.t * 4) * 0.25 : Math.abs(Math.sin(this.t * 8)) * 0.15;
    // scouts ahead of the crowd where it's always visible
    this.bb(q, pet.sprite, this.playerX + 2.3, this.playerZ + 3.2, flying ? 0.8 : 1.0, {
      frame: Math.floor(this.t * 6) % 2, yOff: bob, shadow: !flying,
    });
  }

  renderArrows(q) {
    const trail = this.cosmetic?.trail;
    for (const a of this.arrows) {
      const p = this.cam.project(a.x, 0, a.z);
      if (!p) continue;
      q.add(a.z, (ctx) => {
        if (trail) {
          for (let k = 1; k <= 3; k++) {
            const tp = this.cam.project(a.x, 0, a.z - k * 0.55);
            if (!tp) continue;
            ctx.globalAlpha = 0.5 / k;
            ctx.fillStyle = trail.rainbow
              ? trail.colors[(k + Math.floor(this.t * 10)) % trail.colors.length]
              : trail.colors[(k - 1) % trail.colors.length];
            const s = Math.max(2, tp.s * (a.big ? 0.24 : 0.14));
            ctx.fillRect(tp.sx - s / 2, tp.sy - tp.s * 0.75, s, s);
          }
          ctx.globalAlpha = 1;
        }
        if (hasSprite('arrow')) {
          const spr = getSprite('arrow');
          blit(ctx, spr, 0, p.sx, p.sy - p.s * 0.75, (a.big ? 1.1 : 0.6) * p.s);
        } else {
          ctx.fillStyle = '#ffe9a0';
          ctx.fillRect(p.sx - 1.5, p.sy - p.s * 1.4, a.big ? 5 : 3, p.s * 0.7);
        }
      });
    }
  }

  renderEshots(q) {
    for (const s of this.eshots) {
      const id = s.kind === 'fireball' ? 'fireball' : s.kind === 'potion' ? 'potion' : 'arrow';
      this.bb(q, id, s.x, s.z, s.kind === 'fireball' ? 0.7 : 0.6, { yOff: s.y || 0.8, frame: Math.floor(this.t * 8) % 2, shadow: false });
    }
  }

  renderParticles(q) {
    for (const p of this.particles) {
      const pr = this.cam.project(p.x, p.y, p.z);
      if (!pr) continue;
      q.add(p.z, (ctx) => {
        ctx.globalAlpha = Math.min(1, p.life * 2.5);
        ctx.fillStyle = p.color;
        const s = Math.max(1.5, p.size * pr.s);
        ctx.fillRect(pr.sx - s / 2, pr.sy - s / 2, s, s);
        ctx.globalAlpha = 1;
      });
    }
    for (const r of this.rings) {
      const pr = this.cam.project(r.x, 0, r.z);
      if (!pr) continue;
      q.add(r.z, (ctx) => {
        ctx.globalAlpha = r.life / r.T * 0.7;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(2, pr.s * 0.12);
        ctx.beginPath();
        ctx.ellipse(pr.sx, pr.sy, r.r * pr.s, r.r * pr.s * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
  }

  renderFloaties(ctx) {
    for (const f of this.floaties) {
      const p = this.cam.project(f.x, f.y, f.z);
      if (!p) continue;
      ctx.globalAlpha = Math.min(1, f.life * 3);
      outlineText(ctx, f.text, p.sx, p.sy, Math.min(46, Math.max(12, p.s * 0.55 * f.sizeMul)), f.color);
      ctx.globalAlpha = 1;
    }
  }

  renderCrowdLabel(ctx) {
    if (this.state !== 'run' && this.state !== 'boss') return;
    const p = this.cam.project(this.playerX, 2.3, this.playerZ);
    if (!p) return;
    // show total army worth — the number just keeps climbing, no cap
    const w = this.worth();
    const low = w <= 3;
    outlineText(ctx, `${w}`, p.sx, p.sy, Math.max(15, p.s * 0.62), low ? '#ff8d7a' : '#ffffff');
  }
}
