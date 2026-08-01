// Craft Rush combat: enemies, arrows, gates, obstacles, pickups, summons, waves.
import { TUNE, ENEMY_TYPES, TIERS, PICKUPS } from './config.js';
import { Audio } from './audio.js';

export const GOLEM_GRANT_PROGRESS = Object.freeze([1 / 3, 2 / 3, 1]);
// Actual first-impact time, measured in active play seconds. The 0.15s floor
// keeps an immediate panic collision plain while still admitting the held boss
// at max Turbo speed (its collision boundary arrives at roughly 0.152s).
export const GOLEM_SMASH_WINDOW = Object.freeze({ min: 0.15, max: 1.65 });

export const CombatMixin = {
  // ---------- combat ----------
  damageEnemy(e, dmg, silent = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.09;
    if (!silent) Audio.sfx('hit', 60);
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
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
      // blazes in the Nether Fortress drop blaze rods for the campaign inventory
      if (this.biome.dropsRods && e.id === 'blaze') {
        this.pickups.push({ kind: 'blaze_rod', x: e.x, z: e.z, t: 0, hp: 0 });
      }
    }
  },

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
  },

  fireVolley() {
    // stars permanently multiply every arrow's damage (the offensive half of graduation)
    const powerMul = (this.power.power > 0 ? 2 : 1) * Math.pow(TIERS.starMult, this.stars || 0);
    const n = Math.min(this.crowd.length, TUNE.maxShooters);
    const dmgScale = Math.max(1, Math.round(this.crowd.length / TUNE.maxShooters));
    const dmg = dmgScale * powerMul;
    // Aim assist stays generous, but only inside the lane the player is choosing.
    // A wide crowd can no longer silently restore whole-track auto targeting.
    const inCone = (target) => {
      const dz = target.z - this.playerZ;
      const halfW = Math.min(TUNE.aimConeMax, TUNE.aimConeNear + dz * TUNE.aimConePerZ);
      return Math.abs(target.x - this.playerX) <= halfW;
    };
    const targets = this.enemies.filter(e => !e.dead
      && e.z > this.playerZ + 1.5
      && e.z < this.playerZ + TUNE.arrowRange
      && inCone(e));
    if (this.boss && !this.boss.entering) {
      if (this.boss.guarded) {
        targets.push(...this.crystals.filter(c => !c.dead && inCone(c)));
      } else if (inCone(this.boss)) {
        targets.push(this.boss);
      }
    }
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
    // giants fire one fat arrow each, worth their tier; the top tier folds
    // reserve worth into its damage so overflow always counts
    const topIdx = TIERS.units.length - 1;
    let anyBig = false;
    TIERS.units.forEach((u, i) => {
      const arr = this.bigs[i];
      const extra = (i === topIdx && arr.length) ? Math.floor(this.reserve / arr.length) : 0;
      for (const g of arr) {
        anyBig = true;
        const x = this.playerX + g.ox, z = this.playerZ + g.oz + 1;
        this.arrows.push({ x, z, vx: aim(x, z), dmg: (u.worth + extra) * powerMul, big: true });
      }
    });
    if (n > 0 || anyBig) {
      this.volleysFired = (this.volleysFired || 0) + 1;
      Audio.sfx('shoot', 90);
    }
  },

  ensureGolemMastery() {
    if (!this.mastery) this.mastery = {};
    for (const key of ['golemSends', 'usefulGolems', 'golemHits']) {
      if (!Number.isFinite(this.mastery[key]) || this.mastery[key] < 0) this.mastery[key] = 0;
    }
    return this.mastery;
  },

  gainGolemCharge(progress = 0) {
    const ready = this.redstone >= TUNE.redstoneMax;
    this.golemGrantLog ||= [];
    this.golemGrantLog.push({
      progress: Math.max(0, Math.min(1, Number(progress) || 0)),
      awarded: !ready,
      wasted: ready,
    });
    if (ready) return false;

    this.redstone = TUNE.redstoneMax;
    this.floaty?.('GOLEM READY!', this.playerX, this.playerZ + 4, '#ffd94d', 1.55);
    this.ring?.(this.playerX, this.playerZ + 1.5, 2);
    Audio.sfx('golem_ready');
    if (this.save.speed === 'calm') this.summonGolem('auto');
    return true;
  },

  updateGolemChargeProgress(progress) {
    if (this.chapter?.credits) return;
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    this.golemGrantIdx ||= 0;
    while (this.golemGrantIdx < GOLEM_GRANT_PROGRESS.length
      && p + Number.EPSILON >= GOLEM_GRANT_PROGRESS[this.golemGrantIdx]) {
      const threshold = GOLEM_GRANT_PROGRESS[this.golemGrantIdx++];
      this.gainGolemCharge(threshold);
    }

    // Between grants the existing meter previews distance to the next charge.
    // A held charge stays full, including when a later grant is deliberately
    // wasted; there is never a hidden stack waiting behind it.
    if (this.redstone < TUNE.redstoneMax && this.golemGrantIdx < GOLEM_GRANT_PROGRESS.length) {
      const start = this.golemGrantIdx === 0 ? 0 : GOLEM_GRANT_PROGRESS[this.golemGrantIdx - 1];
      const end = GOLEM_GRANT_PROGRESS[this.golemGrantIdx];
      this.redstone = Math.max(0, Math.min(
        TUNE.redstoneMax - Number.EPSILON,
        ((p - start) / Math.max(Number.EPSILON, end - start)) * TUNE.redstoneMax,
      ));
    }
  },

  summonGolem(source = 'manual') {
    if (this.paused || this.redstone < TUNE.redstoneMax || (this.state !== 'run' && this.state !== 'boss')) return;
    this.redstone = 0;
    if (this.save.stats) this.save.stats.golems = (this.save.stats.golems || 0) + 1;
    const startZ = this.playerZ + 1.5;
    this.summons.push({
      x: this.playerX,
      z: startZ,
      t: 0,
      stompT: 0,
      source,
      perfectTiming: false,
      firstImpactT: null,
      impactCount: 0,
    });
    this.ensureGolemMastery().golemSends++;
    this.burst(this.playerX, 1.2, this.playerZ + 1.5, ['#d4d8d4', '#9a9e9a', '#ff5545'], 18);
    this.ring(this.playerX, this.playerZ + 1.5, 2.4);
    this.cam.shake = Math.min(1, this.cam.shake + 0.35);
    Audio.sfx('golem');
  },

  recordGolemImpact(s, x, z) {
    const mastery = this.ensureGolemMastery();
    mastery.golemHits++;
    const first = s.impactCount === 0;
    s.impactCount++;
    if (!first) return false;

    mastery.usefulGolems++;
    const impactT = Number.isFinite(s.t) ? Math.max(0, s.t) : 0;
    const perfect = impactT >= GOLEM_SMASH_WINDOW.min && impactT <= GOLEM_SMASH_WINDOW.max;
    s.firstImpactT = impactT;
    s.perfectTiming = perfect;
    this.ring(x, z, perfect ? 4 : 2.8);
    this.burst(
      x, 1, z,
      perfect
        ? ['#ffffff', '#ffd94d', '#ff9d3c', '#d4d8d4']
        : ['#ffffff', '#d4d8d4', '#9a9e9a'],
      perfect ? 22 : 14,
      perfect ? 7 : 5,
    );
    this.cam.shake = Math.min(1, this.cam.shake + (perfect ? 0.38 : 0.2));
    this.floaty(perfect ? 'PERFECT SMASH!' : 'SMASH!', x, z, perfect ? '#ffd94d' : '#ffffff', perfect ? 2 : 1.35);
    Audio.sfx(perfect ? 'golem_smash' : 'golem_hit', 80);
    return true;
  },

  // ---------- gates ----------
  gateLabel(gt) {
    return gt.op === 'add' ? `+${gt.val}` : gt.op === 'mul' ? `×${gt.val}` : gt.op === 'sub' ? `−${gt.val}` : `÷${gt.val}`;
  },

  gateGood(gt) { return gt.op === 'add' || gt.op === 'mul'; },

  applyGate(gt) {
    gt.used = true;
    this.noteGate?.(this.gateGood(gt), gt.risk);
    // multiply/divide act on the WHOLE army worth, not just the rendered runners
    const n = this.worth();
    if (gt.op === 'add') { this.addRunners(gt.val); Audio.sfx('gate_good'); }
    else if (gt.op === 'mul') { this.addRunners(n * (gt.val - 1)); Audio.sfx('gate_good'); }
    else if (gt.op === 'sub') { if (gt.val > 0) { this.killRunners(gt.val, null, null, false); Audio.sfx('gate_bad'); this.floaty(`−${gt.val}`, gt.x, gt.z, '#ff6d5a', 1.5); } }
    else if (gt.op === 'div') { const k = n - Math.ceil(n / gt.val); if (k > 0) { this.killRunners(k, null, null, false); Audio.sfx('gate_bad'); this.floaty(`÷${gt.val}`, gt.x, gt.z, '#ff6d5a', 1.5); } }
    const after = this.worth();
    if (this.gateGood(gt)) {
      this.crowdPulse = 1;
      this.freeze = Math.max(this.freeze || 0, 0.045);
      this.flashFx = Math.max(this.flashFx || 0, 0.12);
      this.cam.shake = Math.min(1, this.cam.shake + 0.24);
      this.ring(this.playerX, this.playerZ, 2.8);
      this.burst(this.playerX, 1.15, this.playerZ, ['#7dcfff', '#7dff7d', '#ffffff'], 22, 8);
      this.floaty(`${n} → ${after}`, this.playerX, this.playerZ + 1.4, '#ffffff', 1.75);
      this.floaty(this.gateLabel(gt), gt.x, gt.z, '#7dcfff', 1.6);
    } else if (after < n) {
      this.cam.shake = Math.min(1, this.cam.shake + 0.32);
      this.flashFx = Math.max(this.flashFx || 0, 0.08);
    }
  },

  shootGate(gt) {
    const before = this.gateLabel(gt);
    gt.hits++;
    gt.pulse = 0.15;
    const per = TUNE.gateHitsPerPlus;
    if (gt.op === 'add' && gt.hits % per === 0) gt.val++;
    else if (gt.op === 'sub' && gt.hits % per === 0 && gt.val > 0) gt.val--;
    else if (gt.op === 'mul' && gt.hits >= 14 && gt.val < 3) { gt.val++; gt.hits = -99; }
    else if (gt.op === 'div' && gt.hits >= 12 && gt.val > 1) { gt.val = 1; }
    // A triple volley may land dozens of arrows on one gate in the same frame.
    // One spark per volley reads as impact without flooding a phone with FX.
    if (gt.sparkVolley !== this.volleysFired) {
      gt.sparkVolley = this.volleysFired;
      this.burst(gt.x, 1.1, gt.z, ['#7dcfff', '#ffffff'], 3, 4);
    }
    const after = this.gateLabel(gt);
    if (after !== before) {
      this.ring(gt.x, gt.z, 1.7);
      this.burst(gt.x, 1.5, gt.z, ['#ffd94d', '#7dcfff', '#ffffff'], 14, 7);
      this.floaty(`UPGRADED ${after}`, gt.x, gt.z, '#ffd94d', 1.55);
      this.cam.shake = Math.min(1, this.cam.shake + 0.12);
      Audio.sfx('gate_good', 55);
    }
  },

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
  },

  arrowHitTest(a) {
    for (const e of this.enemies) {
      if (e.dead || e.z < a.z - 0.5 || e.z > a.z + 0.6) continue;
      if (Math.abs(e.x - a.x) < TUNE.arrowHitX) {
        this.damageEnemy(e, a.dmg);
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
      if (o.directed) continue;
      if (Math.abs(a.x - o.x) < TUNE.arrowHitX) { o.hp--; o.wobble = 0.15; a.dead = true; if (o.hp <= 0) this.breakObstacle(o); return; }
    }
    for (const p of this.pickups) {
      if (p.kind !== 'chest' || p.dead || Math.abs(p.z - a.z) > 0.6) continue;
      if (Math.abs(a.x - p.x) < 0.6) { p.hp--; a.dead = true; if (p.hp <= 0) this.openChest(p); return; }
    }
    // Crystals sit around and sometimes directly in front of the boss. Resolve
    // their smaller hitboxes first so the guarded boss cannot swallow the shot.
    for (const crystal of this.crystals || []) {
      if (crystal.dead || Math.abs(crystal.z - a.z) >= 0.9) continue;
      if (Math.abs(crystal.x - a.x) < 0.8) {
        a.dead = true;
        crystal.hp -= a.dmg;
        if (crystal.hp <= 0) this.crystalDown(crystal);
        return;
      }
    }
    const b = this.boss;
    if (b && !b.entering && !this.bossDead && Math.abs(b.z - a.z) < 2.0 && Math.abs(a.x - b.x) < 2.6) {
      a.dead = true;
      // a phase change shields her briefly, so a burst cannot skip a whole stage,
      // and her crystals guard her outright until they are down
      this.damageBoss(a.dmg, true);
      Audio.sfx('hit', 70);
    }
  },

  breakObstacle(o) {
    this.burst(o.x, 0.6, o.z, ['#8a6844', '#6b4f35', '#a58a5a'], 10);
    Audio.sfx('pop', 40);
  },

  openChest(p) {
    p.dead = true;
    this.runEmeralds += TUNE.chestEmeralds;
    this.burst(p.x, 0.8, p.z, ['#2eff70', '#ffd94d', '#8a6844'], 16);
    this.floaty(`+${TUNE.chestEmeralds}`, p.x, p.z, '#2eff70', 1.5);
    Audio.sfx('chest');
  },

  updateEnemies(dt) {
    const px = this.playerX, pz = this.playerZ;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      const distZ = e.z - pz;
      if (distZ < -3) { e.dead = true; continue; } // passed behind
      const aggro = distZ < TUNE.aggroRange;
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

      // Directed enemy-route encounters promise a readable open half. Chasers
      // can advance and fight normally, but cannot erase that route by drifting
      // or teleporting across the center line after the choice was shown.
      if (e.routeSide < 0) e.x = Math.min(e.x, -1.2);
      else if (e.routeSide > 0) e.x = Math.max(e.x, 1.2);

      // contact bites
      if (type.kind !== 'exploder') {
        e.biteT -= dt;
        if (e.biteT <= 0 && distZ < 1.2 && distZ > -1) {
          let hit = false;
          for (const u of this._units) {
            if (Math.abs(px + u.ox - e.x) < TUNE.biteReachX && Math.abs(pz + u.oz - e.z) < TUNE.biteReachZ) { hit = true; break; }
          }
          if (hit) {
            e.biteT = type.bitePeriod || 0.8;
            if (this.power.sword > 0) {
              // sword aura: the mob gets sliced instead of biting
              this.damageEnemy(e, 9999);
              this.floaty('SLICE!', e.x, e.z, '#7dcfff', 1.1);
            } else {
              this.killRunners(1, e.x, e.z);
            }
            if (type.kind === 'swooper') e.dead = true;
          }
        }
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  },

  updateGatesObstaclesPickups(dt) {
    const px = this.playerX, pz = this.playerZ;
    // gates: a pair is one choice — apply the nearest overlapped gate, consume the pair
    const crossing = this.gates.filter(g => !g.used && g.z < pz + 0.4 && g.z > pz - 1.5);
    for (const z of new Set(crossing.map(g => g.z))) {
      const pair = crossing.filter(g => g.z === z);
      const hit = pair
        .filter(g => Math.abs(px - g.x) < g.halfW + TUNE.gateHitMargin)
        .sort((a, b) => Math.abs(px - a.x) - Math.abs(px - b.x))[0];
      if (hit) this.applyGate(hit);
      else this.noteGate?.(null);
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
            if (this.power.axe > 0) {
              // axe: chop it clean, bonus emeralds, nobody gets hurt
              o.hp = 0;
              this.breakObstacle(o);
              this.runEmeralds += 2;
              this.floaty('+2', o.x, o.z, '#2eff70', 1.1);
              Audio.sfx('emerald', 80);
            } else {
              this.killRunners(1, o.x, o.z);
              o.hp--; o.wobble = 0.2;
              if (o.hp <= 0) this.breakObstacle(o);
            }
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
      const def = PICKUPS[p.kind];
      // victory vacuum: after the boss dies, everything (bar grounded) flies in
      if (this.bossDead && !(def && def.grounded)) {
        p.x += (px - p.x) * Math.min(1, dt * TUNE.vacuumPull);
        p.z += (pz - p.z) * Math.min(1, dt * TUNE.vacuumPull);
      } else if (def && def.magnet) {
        // gentle always-on magnet so mob drops visibly get scooped up
        const dx = px - p.x, dz = pz - p.z, d2 = dx * dx + dz * dz;
        if (d2 < TUNE.magnetRange * TUNE.magnetRange) { p.x += dx * dt * TUNE.magnetPull; p.z += dz * dt * TUNE.magnetPull; }
      }
      // within the crowd's z-footprint (front to back)?
      if (p.z < pz + 1.5 && p.z > pz - 2.4) {
        let near;
        if (def && def.magnet) {
          // emeralds/rods: harvested anywhere the crowd sweeps the lane, so a
          // giant-heavy army can never run one over without collecting it
          near = Math.abs(px - p.x) < 2.6;
        } else {
          // physical pickups (apple, tnt, chest, powerups) need a unit to touch
          near = Math.abs(px - p.x) < 1.3 && Math.abs(pz - p.z) < 1.3;
          if (!near) {
            for (const u of this._units) {
              if (Math.abs(px + u.ox - p.x) < 1.1 && Math.abs(pz + u.oz - p.z) < 1.2) { near = true; break; }
            }
          }
        }
        if (near) this.collect(p);
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead && p.z > pz - 4);
  },

  collect(p) {
    const def = PICKUPS[p.kind];
    if (!def) return;
    // shooterAuto:false items (chests) can't be grabbed by touch in shooter mode
    if (this.mode === 'shooter' && def.shooterAuto === false) return;
    p.dead = true;
    def.onCollect(this, p);
  },

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
        if (!e.dead && Math.abs(e.z - s.z) < 1.7 && Math.abs(e.x - s.x) < 1.7) {
          this.damageEnemy(e, 999);
          this.recordGolemImpact(s, e.x, e.z);
        }
      }
      for (const o of this.obstacles) {
        if (o.hp > 0 && Math.abs(o.z - s.z) < 1.6 && Math.abs(o.x - s.x) < 1.6) {
          o.hp = 0;
          this.breakObstacle(o);
          this.recordGolemImpact(s, o.x, o.z);
        }
      }
      for (const p of this.pickups) {
        if (p.kind === 'chest' && !p.dead && Math.abs(p.z - s.z) < 1.6 && Math.abs(p.x - s.x) < 1.6) {
          this.openChest(p);
          this.recordGolemImpact(s, p.x, p.z);
        }
      }
      let spent = false;
      for (const crystal of this.crystals || []) {
        if (crystal.dead || Math.abs(crystal.z - s.z) >= 1.7 || Math.abs(crystal.x - s.x) >= 1.7) continue;
        crystal.hp -= 60;
        this.recordGolemImpact(s, crystal.x, crystal.z);
        if (crystal.hp <= 0) this.crystalDown(crystal);
        s.dead = true;
        spent = true;
        break;
      }
      const b = this.boss;
      if (!spent && b && Math.abs(b.z - s.z) < 2 && Math.abs(b.x - s.x) < 2.4) {
        if (b.entering) {
          // The boss-arrival grant is a real opportunity on every pace. Hold a
          // correctly aimed summon at the arena edge instead of letting it run
          // through an untargetable entrance animation.
          s.z = Math.min(s.z, b.z - 1.75);
        } else if (this.damageBoss(60)) {
          b.flash = 0.12;
          this.recordGolemImpact(s, b.x, b.z);
          s.dead = true;
        } else {
          // A phase shield or crystal guard blocks damage, not the summon.
          // Hold it just outside the hitbox so it can retry when protection ends.
          s.z = Math.min(s.z, b.z - 1.75);
        }
      }
      if (s.z > this.playerZ + TUNE.golemRange) s.dead = true;
    }
    this.summons = this.summons.filter(s => !s.dead);
  },

  updateWaves(dt) {
    for (const w of this.waves) {
      if (w.warn > 0) {
        w.warn = Math.max(0, w.warn - dt);
        if (w.sweep) {
          const progress = 1 - w.warn / Math.max(0.001, w.warnTotal);
          const eased = progress * progress * (3 - 2 * progress);
          w.x = w.sweep.fromX + (w.sweep.toX - w.sweep.fromX) * eased;
          if (Math.abs(this.playerX - w.x) < w.halfW + 0.4) w.threatened = true;
        }
        if (w.warn > 0) continue;
        // A regular wave starts travelling on the next frame. A forest warning
        // resolves immediately because its reveal, not a second lane hit, is
        // the promised payoff.
        if (!w.ambush) continue;
      }
      if (w.ambush) {
        for (const enemy of w.ambush) this.spawnEnemy(enemy.id, enemy.x, enemy.z);
        w.dead = true;
        this.floaty?.('AMBUSH!', w.x, this.playerZ + 4, '#8fe388', 1.4);
        Audio.sfx('boss_roar');
        continue;
      }
      w.z -= w.speed * dt;
      if (w.z <= this.playerZ + 0.5) {
        w.dead = true;
        const inBand = Math.abs(this.playerX - w.x) < w.halfW + 0.4;
        if (inBand) {
          this.killRunners(w.kills, w.x, this.playerZ);
          Audio.sfx('hurt', 100);
          this.cam.shake = Math.min(1, this.cam.shake + 0.3);
        } else if (w.threatened) {
          const edge = Math.abs(Math.abs(this.playerX - w.x) - (w.halfW + 0.4));
          this.noteDodge?.(edge <= 0.75);
        }
      }
    }
    this.waves = this.waves.filter(w => !w.dead);
  },

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
        for (const u of this._units) {
          if (Math.abs(px + u.ox - s.x) < 0.75) { this.killRunners(1, s.x, s.z); Audio.sfx('hurt', 100); break; }
        }
        continue;
      }
      if (s.z < pz - 3 || s.z > pz + 60) s.dead = true;
    }
    this.eshots = this.eshots.filter(s => !s.dead);
  },
};
