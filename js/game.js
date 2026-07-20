// Craft Rush core game: crowd sim, dual-mode (shooter / gates), procedural
// levels, enemies, bosses, effects. World units: blocks; +z is down-track.
import { TUNE, BIOMES, SKINS, CAMERAS, TIERS, COSMETICS } from './config.js';
import { Camera, renderWorld, DrawQueue } from './engine.js';
import { Audio } from './audio.js';
import { CrowdMixin } from './crowd.js';
import { LevelMixin } from './levelgen.js';
import { CombatMixin } from './combat.js';
import { BossMixin } from './boss.js';
import { FxMixin } from './fx.js';
import { RenderMixin } from './render.js';


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
    this.bigs = TIERS.units.map(() => []); // one array per ladder tier
    this.reserve = 0;
    this._units = [];          // cached flat list of every crowd unit
    this._reformDirty = false;
    this.playerX = 0; this.playerZ = 0; this.targetX = 0;
    this.speed = 0;
    this.redstone = 0;
    this.runEmeralds = 0; this.kills = 0; this.bestCrowd = 0; this.runRods = 0;
    this.volleyT = 0;
    this.power = { triple: 0, rapid: 0, power: 0, sword: 0, axe: 0 };
    this.events = [];
    this.eventIdx = 0;
    this.length = 0;
    this.golemHintShown = false;
    this.expedition = null;
    this.mut = {};
  }

  // ---------- run lifecycle ----------
  // expedition: optional daily-expedition object (overrides biome/mode + `mut`)
  startRun(expedition = null) {
    this.resetRunState();
    this.expedition = expedition;
    this.mut = expedition ? (expedition.mut || {}) : {};
    this.level = expedition ? expedition.level : this.save.level;
    this.mode = expedition && expedition.mode ? expedition.mode : this.save.mode;
    this.biome = (expedition && expedition.biome && BIOMES.find(b => b.id === expedition.biome))
      || BIOMES[(this.level - 1) % BIOMES.length];
    this.applySkin();
    this.paused = false;
    const diff = this.levelDiff();
    this.speed = Math.min(TUNE.speedCap, TUNE.runSpeed * (1 + TUNE.speedRamp * (this.level - 1)) * (this.mut.speedMul || 1));
    this.genLevel(diff);
    this.setWorth(this.mut.startWorth || TUNE.crowdStart);
    this.state = 'run';
    this.t = 0;
    this.applyCamera();
    this.refreshCosmetics();
    Audio.music('run');
    if (!this.save.tutorialSeen) this.hooks.onTutorial('steer');
  }

  levelDiff() { return 1 + (this.level - 1) * 0.35; }

  // ---------- input ----------
  _initInput() {
    const c = this.canvas;
    let dragging = false, lastX = null;
    // relative steer from a pointer delta (blocks per on-screen pixel)
    const steer = (px) => {
      if (this.paused || (this.state !== 'run' && this.state !== 'boss')) { lastX = px; return; }
      if (lastX === null) { lastX = px; return; }
      const p = this.cam.project(0, 0, this.playerZ);
      const pxPerBlock = p ? p.s : 60;
      this.targetX = Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, this.targetX + (px - lastX) / (pxPerBlock * 0.75)));
      lastX = px;
      if (!this.save.tutorialSeen) { this.save.tutorialSeen = true; this.hooks.onTutorial(null); }
    };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); dragging = true; lastX = e.clientX; });
    c.addEventListener('pointermove', (e) => {
      // mouse steers on plain movement (no button); touch/pen require a drag
      if (e.pointerType === 'mouse' || dragging) steer(e.clientX);
    });
    c.addEventListener('pointerup', () => { dragging = false; });
    c.addEventListener('pointercancel', () => { dragging = false; });
    // reset the reference point when the mouse leaves, so re-entry doesn't jump
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') lastX = null; });
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.summonGolem(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.hooks.onPause && this.hooks.onPause(); }
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

    this.flushReform(); // place the crowd once if worth changed this frame
    // crowd member positions ease to formation
    for (const m of this.crowd) {
      m.ox += (m.tx - m.ox) * Math.min(1, dt * 6);
      m.oz += (m.tz - m.oz) * Math.min(1, dt * 6);
    }
    for (const arr of this.bigs) for (const g of arr) {
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

    // powerup timers tick in both modes (gates mode has sword/axe)
    for (const k of Object.keys(this.power)) this.power[k] = Math.max(0, this.power[k] - dt);
    // shooting
    if (this.mode === 'shooter') {
      this.volleyT -= dt;
      const interval = TUNE.volleyInterval * (this.power.rapid > 0 ? 0.55 : 1);
      if (this.volleyT <= 0) { this.volleyT = interval; this.fireVolley(); }
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

    // HUD refreshes ~15x/sec, not every frame — DOM writes are the cost
    this._hudT = (this._hudT || 0) - dt;
    if (this._hudT <= 0) { this._hudT = 1 / 15; this.hooks.onHud(this.hudState()); }
  }

  endRun(win) {
    if (this.state !== 'run' && this.state !== 'boss') return;
    this.state = win ? 'won' : 'lost';
    this.paused = false;
    Audio.stopMusic();
    Audio.sfx(win ? 'fanfare' : 'defeat');
    const bonus = win ? TUNE.winBonusBase + this.level * TUNE.winBonusPerLevel + Math.floor(this.bestCrowd / 4) : 0;
    const mul = this.mut.emeraldMul || 1;
    const total = Math.round((this.runEmeralds + bonus) * mul);
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
    // bank campaign resources collected this run
    if (this.runRods > 0 && this.save.inventory) {
      this.save.inventory.blazeRods = (this.save.inventory.blazeRods || 0) + this.runRods;
    }
    this.hooks.onRunEnd({
      win, level: this.level, emeralds: total, pickupEmeralds: this.runEmeralds, bonus,
      emeraldMul: mul, rods: this.runRods,
      kills: this.kills, bestCrowd: this.bestCrowd,
      biome: this.biome.name, mode: this.mode, structure: !!this.biome.structure,
      expedition: this.expedition ? { id: this.expedition.id, name: this.expedition.name } : null,
    });
  }

  hudState() {
    // reuse one object + one nested boss object to avoid per-call allocation
    const h = this._hud || (this._hud = { boss: { name: '', hp: 0, max: 1, needRunners: null } });
    h.emeralds = this.save.emeralds + this.runEmeralds;
    h.crowd = this.worth();
    h.progress = Math.min(1, this.playerZ / this.length);
    h.redstone = this.redstone; h.redstoneMax = TUNE.redstoneMax;
    h.level = this.level; h.biome = this.biome.name; h.mode = this.mode;
    h.power = this.power;
    if (this.boss && this.state === 'boss') {
      const b = h.boss;
      b.name = this.boss.name; b.hp = Math.max(0, this.boss.hp); b.max = this.boss.maxHp;
      b.needRunners = this.mode === 'gates' ? Math.ceil(this.boss.hp / 3) : null;
      h.bossActive = true;
    } else {
      h.bossActive = false;
    }
    return h;
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
}

Object.assign(Game.prototype, CrowdMixin, LevelMixin, CombatMixin, BossMixin, FxMixin, RenderMixin);
