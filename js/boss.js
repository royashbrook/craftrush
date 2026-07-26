// Craft Rush boss fights: spawn, attacks, per-mode update, defeat celebration.
import { TUNE, BOSS_TYPES } from './config.js';
import { Audio } from './audio.js';

export const BossMixin = {
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
    const ch = this.chapter || null;
    const phases = (ch && ch.phases) || 1;
    this.boss = {
      id: this.biome.boss, type: bt, name: bt.name,
      hp, maxHp: hp,
      x: 0, z: this.length + TUNE.bossSpawnZ, targetZ: this.length + TUNE.bossHoldZ,
      t: 0, flash: 0, attackT: 3.2, attackIdx: 0, lunge: 0, entering: true,
      // a long fight in stages: each phase hits harder and comes faster
      phases, phase: 1, shielded: 0,
    };
    // crystals hold the boss up: while any survive she claws health back, so they
    // have to come down before the fight can actually be won
    this.crystals = [];
    if (ch && ch.crystals) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.crystals.push({
          x: Math.cos(a) * (TUNE.laneHalf - 0.4),
          z: this.boss.targetZ + 2 + Math.sin(a) * 3,
          hp: Math.max(3, Math.ceil(this.worth() * 0.25)), t: a, dead: false,
        });
      }
      this.floaty('BREAK THE CRYSTALS!', this.playerX, this.playerZ + 5, '#c76bff', 2.2);
    }
    this.state = 'boss';
    Audio.music('boss');
    Audio.sfx('boss_roar');
    if (this.mode === 'gates') {
      this.floaty('CHARGE!', this.playerX, this.playerZ + 4, '#ffd94d', 2);
    }
  },

  // crystals feed the boss until they are gone
  crystalDown(c) {
    c.dead = true;
    this.burst(c.x, 1.6, c.z, ['#c76bff', '#ffffff', '#8b3fd6'], 20, 8);
    this.ring(c.x, c.z, 2.4);
    this.cam.shake = Math.min(1, this.cam.shake + 0.3);
    Audio.sfx('bigboom');
    this.floaty('CRYSTAL DOWN!', c.x, c.z, '#c76bff', 1.6);
  },

  liveCrystal() { return (this.crystals || []).find((c) => !c.dead) || null; },

  updateCrystals(dt) {
    if (!this.crystals || !this.crystals.length) return;
    const b = this.boss;
    let alive = 0;
    for (const c of this.crystals) {
      if (c.dead) continue;
      alive++;
      c.t += dt;
      // arrows can take them down like anything else
      for (const a of this.arrows) {
        if (a.dead) continue;
        if (Math.abs(a.x - c.x) < 0.8 && Math.abs(a.z - c.z) < 0.9) {
          a.dead = true; c.hp -= a.dmg;
          if (c.hp <= 0) this.crystalDown(c);
        }
      }
    }
    if (alive > 0 && b && !b.entering) {
      // while even one crystal stands she is not really there to be hit: the
      // fight is the crystals first, and the healing punishes stalling
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.035 * alive * dt);
      b.healing = true;
      b.guarded = true;
    } else if (b) {
      b.healing = false;
      b.guarded = false;
    }
  },

  // stepping down a phase: a brief shield, a roar, and a harder rhythm after
  checkBossPhase() {
    const b = this.boss;
    if (!b || b.phases <= 1) return;
    const step = b.maxHp / b.phases;
    const should = Math.min(b.phases, Math.max(1, Math.ceil((b.maxHp - b.hp + 1) / step)));
    if (should > b.phase) {
      b.phase = should;
      b.shielded = 0.9;
      b.attackT = 0.5;
      this.cam.shake = 1;
      this.burst(b.x, 2.4, b.z, ['#ff5545', '#ffd94d', '#ffffff'], 26, 9);
      this.floaty(`PHASE ${b.phase}!`, b.x, b.z, '#ff8d7a', 2);
      Audio.sfx('boss_roar');
    }
  },

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
  },

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
    this.updateCrystals(dt);
    this.checkBossPhase();
    // a phase change buys the boss a moment of shield, so damage in that window
    // does not simply skip the next stage
    if (b.shielded > 0) { b.shielded -= dt; }
    if (this.mode === 'gates') {
      // crowd charge: the army spends worth to slam the boss, scaled so the
      // fight lasts about the same whether you bring 40 troops or 4000
      this.chargeT = (this.chargeT || 0) - dt;
      // a phase shield soaks the charge outright; crystals redirect it
      if (this.chargeT <= 0 && b.shielded > 0) {
        this.chargeT = 0.3;
        b.flash = 0.07;
        Audio.sfx('hit', 30);
      } else if (this.chargeT <= 0 && this.worth() > 0) {
        this.chargeT = 0.09;
        const spend = Math.max(1, Math.ceil(this.worth() / TUNE.chargeSpendDivisor));
        this.setWorth(this.worth() - spend);
        const crystal = b.guarded ? this.liveCrystal() : null;
        if (crystal) {
          crystal.hp -= spend * 3;
          this.burst(crystal.x + (Math.random() - 0.5) * 1.2, 1.4, crystal.z, ['#c76bff', '#ffffff'], 6);
          Audio.sfx('hit', 60);
          if (crystal.hp <= 0) this.crystalDown(crystal);
        } else {
          b.hp -= spend * 3; b.flash = 0.07;
          this.burst(b.x + (Math.random() - 0.5) * 1.6, 1.2, b.z - 0.8, [this.skin.palette.t, '#ffd94d'], 6);
          Audio.sfx('hit', 40);
          if (b.hp <= 0) { this.bossDefeated(); return; }
        }
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
  },

  bossDefeated() {
    if (this.bossDead) return;
    this.bossDead = true;
    const b = this.boss;
    this.freeze = 0.14;
    this.flashFx = 1;
    this.cam.shake = 1;
    Audio.sfx('bigboom');
    // clear every remaining threat so the celebration can't wipe the crowd,
    // and pop open any chests so their emeralds join the victory vacuum
    this.eshots = [];
    this.waves = [];
    for (const e of this.enemies) this.damageEnemy(e, 9999, true);
    for (const p of this.pickups) if (p.kind === 'chest' && !p.dead) this.openChest(p);
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
  },
};
