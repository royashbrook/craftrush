// Craft Rush core game: crowd sim, dual-mode (shooter / gates), procedural
// levels, enemies, bosses, effects. World units: blocks; +z is down-track.
import { TUNE, BIOMES, SKINS, CAMERAS, TIERS, COSMETICS, winBonus, speedById, currentChapter, chapterUnlocked, chapterById } from './config.js';
import { Camera, renderWorld, DrawQueue } from './engine.js';
import { Audio } from './audio.js';
import { CrowdMixin } from './crowd.js';
import { LevelMixin } from './levelgen.js';
import { CombatMixin } from './combat.js';
import { BossMixin } from './boss.js';
import { FxMixin } from './fx.js';
import { RenderMixin } from './render.js';
import {
  createMastery, finishMastery, objectiveState, recordDamage, recordDodge, recordGate,
} from './mastery.js';

let runSerial = 0;
function newRunId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  runSerial += 1;
  return `${Date.now().toString(36)}-${runSerial.toString(36)}-${Math.random().toString(36).slice(2)}`;
}
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
    this.destroyed = false;
    this._timeouts = new Set();
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
    this.stars = 0;            // graduation stars this run (reset every run)
    this._units = [];          // cached flat list of every crowd unit
    this._reformDirty = false;
    this.playerX = 0; this.playerZ = 0; this.targetX = 0;
    this.speed = 0;
    this.redstone = 0;
    this.runEmeralds = 0; this.kills = 0; this.bestCrowd = 0; this.runRods = 0;
    this.volleyT = 0; this.chargeT = 0;
    this.power = { triple: 0, rapid: 0, power: 0, sword: 0, axe: 0 };
    this.events = [];
    this.eventIdx = 0;
    this.length = 0;
    this.creditSigns = [];
    this.golemHintShown = false;
    this.expedition = null;
    this.chapter = null;
    this.crystals = [];
    this.mut = {};
    this.mastery = null;
    this.bossArrivalCrowd = null;
  }

  // ---------- run lifecycle ----------
  // expedition: optional daily-expedition object (overrides biome/mode + `mut`)
  startRun(expedition = null, replayId = null) {
    this.resetRunState();
    this.runId = newRunId();
    this.expedition = expedition;
    // a plain run plays the chapter you are up to, if its cost is covered;
    // once the chain is finished you can ask for one back by name
    const ch = expedition ? (null) : (replayId ? chapterById(replayId) : currentChapter(this.save));
    this.chapter = (ch && (replayId || chapterUnlocked(this.save, ch.id))) ? ch : null;
    this.mut = expedition ? (expedition.mut || {}) : {};
    this.level = expedition ? expedition.level : this.save.level;
    this.mode = expedition && expedition.mode ? expedition.mode : this.save.mode;
    this.biome = (expedition && expedition.biome && BIOMES.find(b => b.id === expedition.biome))
      || (this.chapter && BIOMES.find(b => b.id === this.chapter.biome))
      || BIOMES[(this.level - 1) % BIOMES.length];
    this.applySkin();
    this.paused = false;
    const diff = this.levelDiff();
    // the player's chosen pace scales the run and, at the end, the payout
    const pace = speedById(this.save.speed).speedMul;
    this.speed = Math.min(TUNE.speedCap * pace,
      TUNE.runSpeed * (1 + TUNE.speedRamp * (this.level - 1)) * (this.mut.speedMul || 1) * pace);
    this.genLevel(diff);
    this.setWorth(this.mut.startWorth || TUNE.crowdStart);
    this.mastery = createMastery(this.chapter, this.worth());
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
    let dragging = false, lastX = null, downX = null, downY = null, moved = false;
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
    const onPointerDown = (e) => {
      c.setPointerCapture(e.pointerId);
      dragging = true;
      moved = false;
      downX = e.clientX;
      downY = e.clientY ?? 0;
      lastX = e.clientX;
    };
    const onPointerMove = (e) => {
      // mouse steers on plain movement (no button); touch/pen require a drag
      if (dragging && downX !== null && downY !== null
        && Math.hypot(e.clientX - downX, (e.clientY ?? downY) - downY) >= 8) moved = true;
      if (e.pointerType === 'mouse' || dragging) steer(e.clientX);
    };
    const onPointerUp = (e) => {
      if (dragging && downX !== null && downY !== null
        && Math.hypot((e.clientX ?? downX) - downX, (e.clientY ?? downY) - downY) >= 8) moved = true;
      const tapped = dragging && !moved;
      dragging = false;
      downX = null; downY = null;
      if (tapped && this.save.speed !== 'calm') this.summonGolem();
    };
    const onPointerCancel = () => { dragging = false; downX = null; downY = null; moved = false; };
    // reset the reference point when the mouse leaves, so re-entry doesn't jump
    const onPointerLeave = (e) => { if (e.pointerType === 'mouse') lastX = null; };
    this.keys = {};
    const onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Escape') { e.preventDefault(); this.hooks.onPause && this.hooks.onPause(); }
      const tag = e.target?.tagName;
      const interactive = e.target?.isContentEditable
        || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
      const running = this.state === 'run' || this.state === 'boss';
      if (e.code === 'Space' && !e.repeat && running && !this.paused
        && !interactive && this.save.speed !== 'calm') {
        e.preventDefault();
        this.summonGolem();
      }
    };
    const onKeyUp = (e) => { this.keys[e.code] = false; };

    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerCancel);
    c.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this._inputCleanup = () => {
      c.removeEventListener('pointerdown', onPointerDown);
      c.removeEventListener('pointermove', onPointerMove);
      c.removeEventListener('pointerup', onPointerUp);
      c.removeEventListener('pointercancel', onPointerCancel);
      c.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.state = 'destroyed';
    if (this._inputCleanup) {
      this._inputCleanup();
      this._inputCleanup = null;
    }
    for (const id of this._timeouts) clearTimeout(id);
    this._timeouts.clear();
  }

  _later(callback, delay) {
    if (this.destroyed) return null;
    const id = setTimeout(() => {
      this._timeouts.delete(id);
      if (!this.destroyed) callback();
    }, delay);
    this._timeouts.add(id);
    return id;
  }

  noteGate(good, risky = false) {
    const combo = recordGate(this.mastery, good, risky);
    if (good && combo >= 2) this.floaty(`SMART CHOICE ×${combo}!`, this.playerX, this.playerZ + 3, '#ffd94d', 1.3);
  }

  noteDamage(amount) {
    recordDamage(this.mastery, amount);
  }

  noteDodge(near = false) {
    recordDodge(this.mastery, near);
    this.floaty(near ? 'CLOSE DODGE!' : 'DODGED!', this.playerX, this.playerZ + 3, '#7dcfff', 1.3);
    Audio.sfx('near_miss', 120);
  }

  // ---------- update ----------
  update(dt) {
    if (this.destroyed) return;
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

    // keyboard steer (pointer/touch steering lives in the input handlers)
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.targetX -= dt * 9;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) this.targetX += dt * 9;
    this.targetX = Math.max(-TUNE.laneHalf, Math.min(TUNE.laneHalf, this.targetX));
    this.playerX += (this.targetX - this.playerX) * Math.min(1, dt * TUNE.steerLerp);

    // CALM keeps the zero-button safety net. Faster paces turn a full meter into
    // a skill moment: tap the field or press Space to choose the release.
    if (this.save.speed === 'calm' && this.redstone >= TUNE.redstoneMax) this.summonGolem();

    if (this.state === 'run') {
      this.playerZ += this.speed * dt;
      if (this.playerZ >= this.length) {
        if (this.chapter && this.chapter.credits) this.endRun(true);   // no fight waits at the end of the credits
        else this.startBoss();
      }
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
    this.bestCrowd = Math.max(this.bestCrowd, this.armyPower());

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

    if (this.save.speed !== 'calm' && this.redstone >= TUNE.redstoneMax && !this.golemHintShown) {
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
    const bonus = win ? winBonus(this.level, this.bestCrowd) : 0;
    const mul = (this.mut.emeraldMul || 1) * speedById(this.save.speed).rewardMul;
    const total = Math.round((this.runEmeralds + bonus) * mul);
    const mastery = finishMastery(this.mastery, {
      win,
      finalCrowd: this.armyPower(),
      finishCrowd: this.bossArrivalCrowd ?? this.armyPower(),
      bestCrowd: this.bestCrowd,
      kills: this.kills,
    });
    this.hooks.onRunEnd({
      id: this.runId || newRunId(),
      win, level: this.level, emeralds: total, pickupEmeralds: this.runEmeralds, bonus,
      emeraldMul: mul, rods: this.runRods,
      kills: this.kills, bestCrowd: this.bestCrowd,
      biome: this.biome.name, biomeId: this.biome.id, mode: this.mode, structure: !!this.biome.structure,
      expedition: this.expedition ? { id: this.expedition.id, name: this.expedition.name } : null,
      chapter: this.chapter ? { id: this.chapter.id, name: this.chapter.name } : null,
      mastery,
    });
  }

  hudState() {
    // reuse one object + one nested boss object to avoid per-call allocation
    const h = this._hud || (this._hud = { boss: { name: '', hp: 0, max: 1, needRunners: null } });
    h.emeralds = this.save.emeralds + this.runEmeralds;
    h.crowd = this.armyPower(); h.stars = this.stars;
    h.progress = Math.min(1, this.playerZ / this.length);
    h.redstone = this.redstone; h.redstoneMax = TUNE.redstoneMax;
    h.level = this.level; h.biome = this.biome.name; h.mode = this.mode;
    h.autoGolem = this.save.speed === 'calm';
    h.power = this.power;
    const objective = objectiveState(this.mastery, {
      finishCrowd: this.bossArrivalCrowd ?? this.armyPower(),
    });
    h.objectiveText = objective?.text || '';
    h.objectiveProgress = objective ? `${objective.current}/${objective.target}` : '';
    h.objectiveDone = !!objective?.done;
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
    this.renderCrystals(q);
    this.renderCredits(q);
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
