// Craft Rush boss fights: spawn, attacks, per-mode update, defeat celebration.
import { TUNE, BOSS_TYPES, TIERS } from './config.js';
import { Audio } from './audio.js';

export const BossMixin = {
  // ---------- boss ----------
  startBoss() {
    const bt = BOSS_TYPES[this.biome.boss];
    const diff = 1 + (this.level - 1) * 0.3;
    const par = this.expectedBossArmy();
    // Arrival power no longer moves the goalposts. A strong line earns a short
    // fight; a weak line has to survive longer or gets wiped out. The generated
    // track still sets a fixed par so multiplier-heavy levels cannot erase the
    // entire active boss phase in one hit.
    const baseHp = bt.hp * diff * (this.mode === 'gates' ? 0.45 : 0.75);
    const parHp = this.mode === 'gates' ? par.worth * 2.1 : par.power * 12;
    const hp = Math.max(12, Math.ceil(baseHp), Math.ceil(parHp));
    const reaction = this.bossReactionScale();
    this.bossArrivalCrowd = this.armyPower();
    const ch = this.chapter || null;
    const phases = (ch && ch.phases) || 1;
    this.boss = {
      id: this.biome.boss, type: bt, name: bt.name,
      hp, maxHp: hp,
      x: 0, z: this.length + TUNE.bossSpawnZ, targetZ: this.length + TUNE.bossHoldZ,
      t: 0, flash: 0, attackT: 3.2 * reaction, attackIdx: 0, lunge: 0, entering: true,
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
          hp: Math.max(3, Math.ceil(bt.hp * diff * 0.06)), t: a, dead: false,
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

  expectedBossArmy() {
    const normalize = (worth, stars) => {
      worth = Math.max(0, Math.floor(worth));
      while (worth >= TIERS.gradWorth) {
        stars++;
        worth = Math.round(worth / TIERS.starMult);
      }
      return { worth, stars, power: worth * Math.pow(TIERS.starMult, stars) };
    };
    const apply = (state, gate) => {
      let worth = state.worth;
      if (gate.op === 'add') worth += gate.val;
      else if (gate.op === 'mul') worth *= gate.val;
      else if (gate.op === 'sub') worth = Math.max(0, worth - gate.val);
      else if (gate.op === 'div') worth = Math.ceil(worth / gate.val);
      return normalize(worth, state.stars);
    };
    let state = normalize(this.mut.startWorth || TUNE.crowdStart, 0);
    const pairs = new Map();
    for (const event of this.events || []) {
      if (event.type !== 'gate') continue;
      pairs.set(event.z, [...(pairs.get(event.z) || []), event]);
    }
    for (const pair of pairs.values()) {
      const choices = pair.map((gate) => apply(state, gate));
      choices.sort((a, b) => b.power - a.power || b.worth - a.worth);
      if (choices[0]) state = choices[0];
    }
    return state;
  },

  bossReactionScale() {
    return ({ calm: 1.3, normal: 1, fast: 0.86, turbo: 0.74 })[this.save.speed] || 1;
  },

  spawnBossWave(wave) {
    wave.threatened = Math.abs(this.playerX - wave.x) < wave.halfW + 0.4;
    this.waves.push(wave);
  },

  damageBoss(amount) {
    const b = this.boss;
    if (!b || b.entering || this.bossDead) return false;
    if (b.shielded > 0 || b.guarded) {
      b.flash = 0.08;
      return false;
    }
    const phaseFloor = b.phases > 1 && b.phase < b.phases
      ? b.maxHp - (b.maxHp / b.phases) * b.phase
      : -Infinity;
    b.hp = Math.max(phaseFloor, b.hp - Math.max(0, amount));
    b.flash = 0.08;
    if (b.hp <= 0) this.bossDefeated();
    else this.checkBossPhase();
    return true;
  },

  updateCrystals(dt) {
    if (!this.crystals || !this.crystals.length) return;
    const b = this.boss;
    let alive = 0;
    for (const c of this.crystals) {
      if (c.dead) continue;
      alive++;
      c.t += dt;
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
    const source = this.mode === 'gates'
      ? b.type.attacks.filter((attack) => ['shockwave', 'sonicboom', 'charge'].includes(attack))
      : b.type.attacks;
    const attacks = source.length ? source : ['shockwave'];
    const atk = attacks[b.attackIdx % attacks.length];
    const reaction = this.bossReactionScale();
    b.attackIdx++;
    if (atk === 'minions') {
      const n = Math.min(6, 2 + Math.ceil(this.level / 2));
      for (let i = 0; i < n; i++) {
        this.spawnEnemy(this.biome.enemies[i % this.biome.enemies.length], (Math.random() * 2 - 1) * 2.5, b.z - 2 - Math.random() * 2);
      }
      Audio.sfx('boss_roar');
    } else if (atk === 'shockwave') {
      const x = Math.random() < 0.6 ? this.playerX : (Math.random() * 2 - 1) * 2;
      this.spawnBossWave({ x, halfW: 1.5, z: b.z - 1, warn: 0.95 * reaction, speed: 14, kills: Math.min(10, 3 + Math.ceil(this.level / 2)) });
    } else if (atk === 'sonicboom') {
      // A side blast always leaves the opposite half of the steerable lane safe.
      const side = Math.random() < 0.5 ? -1 : 1;
      this.spawnBossWave({ x: side * 2.2, halfW: 1.7, z: b.z - 1, warn: 1.15 * reaction, speed: 20, color: '#2fd6d6', kills: Math.min(14, 4 + Math.ceil(this.level / 2)) });
      Audio.sfx('boss_roar');
    } else if (atk === 'charge') {
      const warn = 0.75 * reaction;
      b.chargeX = this.playerX;
      b.lungeWarn = warn;
      b.lunge = 0.0001;
      // The painted lane is the damage source. The boss lunge mirrors it, so
      // there is one warned hit to dodge rather than two overlapping attacks.
      this.spawnBossWave({
        x: b.chargeX, halfW: 1.3, z: b.z - 1, warn, speed: 16,
        color: '#ff8d7a', kills: Math.min(12, 4 + Math.ceil(this.level / 2)),
      });
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
    b.attackT -= dt;
    if (b.attackT <= 0) {
      if (b.lunge > 0) {
        b.attackT = 0.1;
      } else {
        b.attackT = Math.max(
          1.9,
          (3.5 - this.level * 0.1) * this.bossReactionScale(),
        );
        this.bossAttack();
      }
    }
    if (this.mode === 'gates') {
      // Crowd charge still spends the army, but only while the chosen lane is
      // lined up with the boss or a live crystal. Dodging can pause the attack.
      this.chargeT = (this.chargeT || 0) - dt;
      // a phase shield soaks the charge outright; crystals redirect it
      if (this.chargeT <= 0 && b.shielded > 0) {
        this.chargeT = 0.3;
        b.flash = 0.07;
        Audio.sfx('hit', 30);
      } else if (this.chargeT <= 0 && this.worth() > 0) {
        this.chargeT = 0.09;
        const crystal = b.guarded
          ? this.crystals.filter(c => !c.dead).sort((a, c) => Math.abs(a.x - this.playerX) - Math.abs(c.x - this.playerX))[0]
          : null;
        const target = crystal || b;
        if (Math.abs(target.x - this.playerX) > 1.85) {
          this.chargeT = 0.14;
        } else {
          const spend = Math.max(1, Math.ceil(this.worth() / TUNE.chargeSpendDivisor));
          this.setWorth(this.worth() - spend);
          if (crystal) {
            crystal.hp -= spend * 3;
            this.burst(crystal.x + (Math.random() - 0.5) * 1.2, 1.4, crystal.z, ['#c76bff', '#ffffff'], 6);
            Audio.sfx('hit', 60);
            if (crystal.hp <= 0) this.crystalDown(crystal);
          } else {
            this.damageBoss(spend * 3);
            this.burst(b.x + (Math.random() - 0.5) * 1.6, 1.2, b.z - 0.8, [this.skin.palette.t, '#ffd94d'], 6);
            Audio.sfx('hit', 40);
            if (this.bossDead) return;
          }
          if (this.worth() <= 0) { this.endRun(false); return; }
        }
      }
    }
    if (b.lunge > 0) {
      b.lunge += dt;
      const phase = b.lunge;
      const windup = b.lungeWarn || 0.5;
      b.x += ((b.chargeX ?? this.playerX) - b.x) * Math.min(1, dt * 5);
      if (phase < windup) { /* windup shake */ }
      else if (phase < windup + 0.5) {
        b.z -= dt * 22;
        if (b.z < this.playerZ + 2.5) b.lunge = windup + 0.51;
      } else {
        b.z += dt * 10;
        if (b.z >= b.targetZ) { b.z = b.targetZ; b.lunge = 0; }
      }
    }
    if (!b.lunge) b.x += (this.playerX * 0.3 - b.x) * dt * 0.5;
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
      this._later(() => {
        if (this.state !== 'boss') return;
        this.burst(b.x + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, b.z - 1, ['#ff5545', '#ffd94d', '#2eff70', '#7dcfff', '#c76bff'], 18, 7);
        Audio.sfx('boom');
      }, 200 + i * 260);
    }
    const bonus = 8 + this.level * 2;
    for (let i = 0; i < bonus; i++) {
      this.pickups.push({ kind: 'emerald', x: (Math.random() * 2 - 1) * 2.5, z: this.playerZ + 3 + Math.random() * 4, t: Math.random() });
    }
    this._later(() => { if (this.state === 'boss') this.endRun(true); }, 1900);
  },
};
