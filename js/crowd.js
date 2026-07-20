// Craft Rush crowd sim: worth-based, unbounded army with ladder tiers.
import { TUNE, TIERS } from './config.js';
import { Audio } from './audio.js';

export const CrowdMixin = {
  // ---------- crowd (worth-based, unbounded) ----------
  // worth = runners(x1) + each ladder tier (x10/x100/x1000) + reserve. Arrays
  // are pure visualization of the current worth; reserve is uncapped overflow.
  worth() {
    let w = this.crowd.length + this.reserve;
    TIERS.units.forEach((u, i) => { w += this.bigs[i].length * u.worth; });
    return w;
  },

  makeUnit() {
    return { ox: (Math.random() - 0.5) * 1.5, oz: -Math.random() * 1.2,
      tx: 0, tz: 0, phase: Math.random() * 7, flash: 0 };
  },

  syncCount(arr, target) {
    while (arr.length > target) arr.pop();
    while (arr.length < target) arr.push(this.makeUnit());
  },

  // rebalance the tier arrays to represent `total` worth (greedy from the top)
  setWorth(total, fx = false) {
    total = Math.max(0, Math.floor(total));
    const prev = this.bigs.map(a => a.length);
    let rem = total;
    for (let i = TIERS.units.length - 1; i >= 0; i--) {
      const u = TIERS.units[i];
      const n = Math.min(u.max, Math.floor(rem / u.worth));
      this.syncCount(this.bigs[i], n);
      rem -= n * u.worth;
    }
    const r = Math.min(TIERS.maxRunners, rem);
    this.syncCount(this.crowd, r);
    this.reserve = rem - r;
    // cache the flat unit list (cheap); defer the phyllotaxis placement so many
    // worth changes in one frame (an emerald trail) only re-place once
    this._units = this.crowd.concat(...this.bigs);
    this._reformDirty = true;
    if (fx) {
      this.flushReform(); // promotions are rare; place now so the pop lands right
      for (let i = TIERS.units.length - 1; i >= 0; i--) {
        if (this.bigs[i].length > prev[i]) {
          const u = TIERS.units[i];
          this.tierPop(`${u.name}!`, this.bigs[i][this.bigs[i].length - 1], u.color);
          break; // announce only the highest new tier
        }
      }
    }
    if (this.save.stats && this.bigs[0].length > prev[0]) {
      this.save.stats.gigas = (this.save.stats.gigas || 0) + (this.bigs[0].length - prev[0]);
    }
    this.bestCrowd = Math.max(this.bestCrowd, this.worth());
  },

  tierPop(text, unit, color) {
    if (!unit) return;
    this.floaty(text, this.playerX + unit.tx, this.playerZ + unit.tz + 1, color, 1.7);
    this.burst(this.playerX + unit.tx, 1.8, this.playerZ + unit.tz, [color, this.skin.palette.t, '#ffffff'], 18, 7);
    this.ring(this.playerX + unit.tx, this.playerZ + unit.tz, 2.2);
    this.cam.shake = Math.min(1, this.cam.shake + 0.25);
    Audio.sfx('golem');
  },

  addRunners(n, silent = false) {
    if (n <= 0) return;
    const before = this.worth();
    this.setWorth(before + n, true);
    if (!silent) this.floaty(`+${this.worth() - before}`, this.playerX, this.playerZ + 1, '#7dff7d', 1.4);
  },

  // lose `n` worth; pops fx near the impact point; ends the run when worth hits 0
  killRunners(n, atX = null, atZ = null) {
    const before = this.worth();
    const lost = Math.min(n, before);
    if (lost <= 0) return;
    // pop a few visible units near the hit for feedback (visual only)
    const pops = Math.min(lost, 6);
    const pool = this.crowd.length ? this.crowd : (this.bigs.find(a => a.length) || []);
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
  },

  topTierScale() {
    const top = TIERS.units[TIERS.units.length - 1];
    return top.scale * (1 + TIERS.topMaxGrow * Math.min(1, this.reserve / TIERS.reserveFullScale));
  },

  // ONE mixed clump: every unit (all sizes) packed in a single phyllotaxis
  // blob, big ones interleaved so they tower inside the crowd rather than the
  // little ones running way out front.
  reform() { this._reformDirty = true; this.flushReform(); },

  // run the deferred placement at most once per frame
  flushReform() {
    if (!this._reformDirty) return;
    this._reformDirty = false;
    const units = [];
    for (const m of this.crowd) units.push({ u: m, w: 1 });
    TIERS.units.forEach((t, i) => { for (const b of this.bigs[i]) units.push({ u: b, w: t.weight }); });
    // stable pseudo-random interleave so tiers mix through the blob
    units.sort((a, b) => (a.u.phase % 1) - (b.u.phase % 1));
    const totalW = units.reduce((s, it) => s + it.w, 0);
    const c = Math.min(TUNE.formationC, 4.4 / Math.sqrt(totalW + 1));
    let cum = 0;
    units.forEach((it, idx) => {
      cum += it.w;
      const r = c * Math.sqrt(cum - it.w / 2);
      const a = idx * 2.399963;
      it.u.tx = Math.cos(a) * r;
      it.u.tz = Math.sin(a) * r * 0.72;
    });
  },
};
