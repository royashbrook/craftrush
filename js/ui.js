// DOM UI: menu, shop, HUD, results, tutorial toasts. Game world stays on canvas;
// chrome lives in DOM for crisp text and fat touch targets.
import { SKINS, MODES, BIOMES, CAMERAS, COSMETICS, dailyExpedition, expeditionStatus, recordExpedition, persistSave } from './config.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { getSprite, blit } from './assets.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, save) {
    this.game = game;
    this.save = save;
    this.els = {
      menu: $('menu'), shop: $('shop'), result: $('result'), hud: $('hud'),
      menuLevel: $('menuLevel'), menuEmeralds: $('menuEmeralds'),
      btnPlay: $('btnPlay'), btnShop: $('btnShop'), btnSound: $('btnSound'), btnCamera: $('btnCamera'),
      modeShooter: $('modeShooter'), modeGates: $('modeGates'), modeDesc: $('modeDesc'),
      shopGrid: $('shopGrid'), btnShopBack: $('btnShopBack'), shopEmeralds: $('shopEmeralds'),
      resultTitle: $('resultTitle'), resultStats: $('resultStats'),
      btnNext: $('btnNext'), btnRetry: $('btnRetry'), btnMenu: $('btnMenu'),
      hudEmeralds: $('hudEmeralds'), hudLevel: $('hudLevel'), hudProgress: $('hudProgress'),
      powerChips: $('powerChips'),
      golemBtn: $('golemBtn'), golemFill: $('golemFill'), golemLabel: $('golemLabel'),
      bossBar: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), bossHint: $('bossHint'),
      toast: $('toast'),
      btnPause: $('btnPause'), pause: $('pause'), btnResume: $('btnResume'),
      btnPauseCamera: $('btnPauseCamera'), btnPauseShop: $('btnPauseShop'),
      btnPauseAch: $('btnPauseAch'), btnPauseSound: $('btnPauseSound'), btnQuit: $('btnQuit'),
      btnAch: $('btnAch'), achScreen: $('achievements'), achGrid: $('achGrid'),
      achCount: $('achCount'), btnAchBack: $('btnAchBack'),
      achPop: $('achPop'), achPopIcon: $('achPopIcon'), achPopName: $('achPopName'),
      expCard: $('expCard'), expIcon: $('expIcon'), expName: $('expName'),
      expDesc: $('expDesc'), expStreak: $('expStreak'), btnExpedition: $('btnExpedition'),
    };
    this.returnTo = 'menu';   // where BACK from shop/achievements goes
    this.achQueue = [];
    // currency icon: bake the green emerald sprite into a CSS var so name + icon agree
    try {
      const em = getSprite('emerald');
      document.documentElement.style.setProperty('--em-icon', `url(${em.frames[0].toDataURL()})`);
    } catch { /* asset missing — chips just show the count */ }
    this._wire();
    // back-fill achievements a returning player already earned — silently, no popups
    checkAchievements(this.save);
    persistSave(this.save);
    this.refreshMenu();
    this.showMenu();
  }

  _wire() {
    const E = this.els;
    E.btnPlay.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.startRun(); });
    E.btnShop.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.showShop('menu'); });
    E.btnShopBack.addEventListener('click', () => { Audio.sfx('click'); this.back(); });
    E.btnExpedition.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.startExpedition(); });
    E.btnAch.addEventListener('click', () => { Audio.sfx('click'); this.showAchievements('menu'); });
    E.btnAchBack.addEventListener('click', () => { Audio.sfx('click'); this.back(); });
    E.btnSound.addEventListener('click', () => {
      this.save.sound = !this.save.sound;
      Audio.setEnabled(this.save.sound);
      if (this.save.sound) { Audio.unlock(); Audio.sfx('click'); Audio.music('menu'); }
      persistSave(this.save);
      this.refreshMenu();
    });
    E.btnCamera.addEventListener('click', () => {
      Audio.sfx('click');
      const keys = Object.keys(CAMERAS);
      const i = keys.indexOf(this.save.camera);
      this.save.camera = keys[(i + 1) % keys.length];
      persistSave(this.save);
      this.game.applyCamera();
      this.refreshMenu();
    });
    E.modeShooter.addEventListener('click', () => this.setMode('shooter'));
    E.modeGates.addEventListener('click', () => this.setMode('gates'));
    E.btnNext.addEventListener('click', () => { Audio.sfx('click'); this.startRun(); });
    E.btnRetry.addEventListener('click', () => { Audio.sfx('click'); this.startRun(); });
    E.btnMenu.addEventListener('click', () => { Audio.sfx('click'); this.showMenu(); });
    E.golemBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.summonGolem(); });

    // pause menu
    E.btnPause.addEventListener('click', () => { Audio.sfx('click'); this.openPause(); });
    E.btnResume.addEventListener('click', () => { Audio.sfx('click'); this.closePause(); });
    E.btnPauseCamera.addEventListener('click', () => {
      Audio.sfx('click');
      const keys = Object.keys(CAMERAS);
      this.save.camera = keys[(keys.indexOf(this.save.camera) + 1) % keys.length];
      persistSave(this.save);
      this.game.applyCamera();
      this.refreshPause();
    });
    E.btnPauseShop.addEventListener('click', () => { Audio.sfx('click'); this.showShop('pause'); });
    E.btnPauseAch.addEventListener('click', () => { Audio.sfx('click'); this.showAchievements('pause'); });
    E.btnPauseSound.addEventListener('click', () => {
      this.save.sound = !this.save.sound;
      Audio.setEnabled(this.save.sound);
      if (this.save.sound) Audio.unlock();
      persistSave(this.save);
      this.refreshPause();
    });
    E.btnQuit.addEventListener('click', () => { Audio.sfx('click'); this.game.abandonRun(); this.showMenu(); });
  }

  // ---------- pause ----------
  openPause() {
    if (this.game.state !== 'run' && this.game.state !== 'boss') return;
    this.game.paused = true;
    this.refreshPause();
    this.els.pause.classList.remove('hidden');
  }

  closePause() {
    this.game.paused = false;
    this.els.pause.classList.add('hidden');
  }

  refreshPause() {
    this.els.btnPauseCamera.textContent = `📷 CAMERA: ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    this.els.btnPauseSound.textContent = this.save.sound ? '🔊 SOUND ON' : '🔇 SOUND OFF';
  }

  back() {
    if (this.returnTo === 'pause') { this.hideAll(); this.els.hud.classList.remove('hidden'); this.openPause(); }
    else this.showMenu();
  }

  setMode(mode) {
    Audio.sfx('click');
    this.save.mode = mode;
    persistSave(this.save);
    this.refreshMenu();
  }

  startRun() {
    this.hideAll();
    this.els.hud.classList.remove('hidden');
    this.game.startRun();
    this.toast(null);
  }

  startExpedition() {
    this.hideAll();
    this.els.hud.classList.remove('hidden');
    this.game.startRun(dailyExpedition());
    this.toast(null);
  }

  hideAll() {
    for (const k of ['menu', 'shop', 'result', 'hud', 'pause', 'achScreen']) this.els[k].classList.add('hidden');
    this.els.bossBar.classList.add('hidden');
  }

  showMenu() {
    this.game.paused = false;
    this.hideAll();
    this.game.state = 'menu';
    this.refreshMenu();
    this.els.menu.classList.remove('hidden');
    if (this.save.sound) Audio.music('menu');
  }

  refreshMenu() {
    const E = this.els;
    const biome = BIOMES[(this.save.level - 1) % BIOMES.length];
    E.menuLevel.textContent = `LEVEL ${this.save.level} · ${biome.name.toUpperCase()}`;
    E.menuEmeralds.textContent = `${this.save.emeralds}`;
    E.btnSound.textContent = this.save.sound ? '🔊 SOUND ON' : '🔇 SOUND OFF';
    E.btnCamera.textContent = `📷 CAMERA: ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    E.modeShooter.classList.toggle('sel', this.save.mode === 'shooter');
    E.modeGates.classList.toggle('sel', this.save.mode === 'gates');
    E.modeDesc.textContent = MODES[this.save.mode].desc;
    this.refreshExpedition();
  }

  refreshExpedition() {
    const E = this.els;
    const exp = dailyExpedition();
    const st = expeditionStatus(this.save);
    E.expName.textContent = exp.name;
    E.expDesc.textContent = exp.desc + ' (new expedition every week)';
    E.expStreak.textContent = st.streak > 0 ? `🔥 ${st.streak}` : '';
    E.btnExpedition.textContent = st.doneToday ? '↻ REPLAY EXPEDITION' : '▶ START EXPEDITION';
    const g = E.expIcon.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 40, 40);
    this.drawIcon(g, exp.icon, 40, 34);
  }

  // ---------- shop ----------
  showShop(from = 'menu') {
    this.returnTo = from;
    this.hideAll();
    this.els.shop.classList.remove('hidden');
    this.els.shopEmeralds.textContent = `${this.save.emeralds}`;
    this.buildShop();
  }

  _card(grid, { name, selected, owned, cost, draw, onClick }) {
    const card = document.createElement('button');
    card.className = 'skinCard' + (selected ? ' sel' : '') + (!owned && this.save.emeralds < cost ? ' locked' : '');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 88;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g);
    card.appendChild(cv);
    const nm = document.createElement('div');
    nm.className = 'skinName';
    nm.textContent = name;
    card.appendChild(nm);
    const tag = document.createElement('div');
    tag.className = 'skinTag';
    tag.innerHTML = selected ? '✔ PICKED' : owned ? 'OWNED' : `<span class="em"></span> ${cost}`;
    card.appendChild(tag);
    card.addEventListener('click', onClick);
    grid.appendChild(card);
  }

  _section(grid, label) {
    const d = document.createElement('div');
    d.className = 'shopSection';
    d.textContent = label;
    grid.appendChild(d);
  }

  activeSkin() { return SKINS.find(s => s.id === this.save.skin) || SKINS[0]; }

  buildShop() {
    const grid = this.els.shopGrid;
    grid.innerHTML = '';

    this._section(grid, '🧑 SKINS');
    for (const skin of SKINS) {
      this._card(grid, {
        name: skin.name,
        selected: this.save.skin === skin.id,
        owned: this.save.unlocked.includes(skin.id),
        cost: skin.cost,
        draw: (g) => this.drawSkinPreview(g.canvas, skin),
        onClick: () => this.onSkinClick(skin),
      });
    }

    const CAT_LABELS = { cape: '🦸 CAPES', hat: '🎩 HATS', trail: '✨ ARROW TRAILS', pet: '🐾 PETS' };
    for (const [cat, label] of Object.entries(CAT_LABELS)) {
      this._section(grid, label);
      for (const def of COSMETICS[cat]) {
        if (def.id === 'none') continue;
        this._card(grid, {
          name: def.name,
          selected: this.save.cosmetics[cat] === def.id,
          owned: this.save.cosmeticsOwned.includes(def.id),
          cost: def.cost,
          draw: (g) => this.drawCosmeticPreview(g, cat, def),
          onClick: () => this.onCosmeticClick(cat, def),
        });
      }
    }
  }

  drawCosmeticPreview(g, cat, def) {
    const skin = this.activeSkin();
    if (cat === 'cape') {
      const body = getSprite('runner_back', skin.palette, `back_${skin.id}`);
      blit(g, body, 0, 32, 84, 70);
      const cape = getSprite('cape', def.rainbow ? { c: '#ff5545', C: '#3fa9ff' } : def.colors, `shop_${def.id}`);
      blit(g, cape, 0, 32, 84 - 70 * (3.5 / 18), 70 * (9 / 18));
      if (def.rainbow) {
        const cols = ['#ff5545', '#ffd94d', '#2eff70', '#3fa9ff', '#c76bff'];
        cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(10 + i * 9, 6, 7, 5); });
      }
    } else if (cat === 'hat') {
      const head = getSprite(skin.head);
      blit(g, head, 0, 32, 74, 44);
      const hat = getSprite(def.sprite);
      blit(g, hat, 0, 32, 74 - 44 + hat.h * 2.5, hat.h * 5.5);
    } else if (cat === 'trail') {
      const cols = def.colors;
      for (let i = 0; i < 4; i++) {
        g.globalAlpha = 1 - i * 0.2;
        g.fillStyle = cols[i % cols.length];
        const s = 10 - i * 1.5;
        g.fillRect(32 - s / 2, 34 + i * 13, s, s);
      }
      g.globalAlpha = 1;
      const arrow = getSprite('arrow');
      blit(g, arrow, 0, 32, 30, 26);
    } else if (cat === 'pet') {
      const spr = getSprite(def.sprite);
      blit(g, spr, 0, 32, 76, 54);
    }
  }

  onCosmeticClick(cat, def) {
    const owned = this.save.cosmeticsOwned.includes(def.id);
    if (owned) {
      // click equipped item again to take it off
      this.save.cosmetics[cat] = this.save.cosmetics[cat] === def.id ? 'none' : def.id;
      Audio.sfx('click');
    } else if (this.save.emeralds >= def.cost) {
      this.save.emeralds -= def.cost;
      this.save.cosmeticsOwned.push(def.id);
      this.save.cosmetics[cat] = def.id;
      Audio.sfx('buy');
    } else {
      Audio.sfx('gate_bad');
      return;
    }
    persistSave(this.save);
    this.game.refreshCosmetics();
    this.els.shopEmeralds.textContent = `${this.save.emeralds}`;
    this.grantAchievements();
    this.buildShop();
  }

  drawSkinPreview(cv, skin) {
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const head = getSprite(skin.head);
    const body = getSprite('runner_body_front', skin.palette, `body_${skin.id}`);
    blit(g, body, 0, 32, 86, 46);
    blit(g, head, 0, 32, 22, 36);
  }

  onSkinClick(skin) {
    const owned = this.save.unlocked.includes(skin.id);
    if (owned) {
      this.save.skin = skin.id;
      Audio.sfx('click');
    } else if (this.save.emeralds >= skin.cost) {
      this.save.emeralds -= skin.cost;
      this.save.unlocked.push(skin.id);
      this.save.skin = skin.id;
      Audio.sfx('buy');
    } else {
      Audio.sfx('gate_bad');
      return;
    }
    persistSave(this.save);
    this.game.applySkin();
    this.els.shopEmeralds.textContent = `${this.save.emeralds}`;
    this.grantAchievements();
    this.buildShop();
  }

  // ---------- achievements ----------
  showAchievements(from = 'menu') {
    this.returnTo = from;
    this.hideAll();
    this.els.achScreen.classList.remove('hidden');
    this.buildAchievements();
  }

  buildAchievements() {
    const grid = this.els.achGrid;
    grid.innerHTML = '';
    const owned = this.save.achievements || [];
    this.els.achCount.textContent = `${owned.length}/${ACHIEVEMENTS.length}`;
    for (const a of ACHIEVEMENTS) {
      const got = owned.includes(a.id);
      const row = document.createElement('div');
      row.className = 'achRow' + (got ? '' : ' locked') + (a.special ? ' special' : '');
      const cv = document.createElement('canvas');
      cv.width = 34; cv.height = 34;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      this.drawIcon(g, a.icon, 34, 30);
      if (!got) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#000'; g.globalAlpha = 0.72; g.fillRect(0, 0, 34, 34); }
      row.appendChild(cv);
      const txt = document.createElement('div');
      txt.className = 'achText';
      txt.innerHTML = `<div class="achName">${got ? a.name : '???'}</div><div class="achDesc">${a.desc}</div>`;
      row.appendChild(txt);
      const mark = document.createElement('div');
      mark.className = 'achMark';
      mark.textContent = got ? '✅' : '🔒';
      row.appendChild(mark);
      grid.appendChild(row);
    }
  }

  // draw an icon sprite centered inside a square canvas, scaled to fit `fit` px
  drawIcon(g, iconId, box, fit) {
    const spr = getSprite(iconId);
    const scale = Math.min(fit / spr.w, fit / spr.h);
    const h = spr.h * scale;
    const cy = spr.anchor === 'center' ? box / 2 : box / 2 + h / 2;
    blit(g, spr, 0, box / 2, cy, h);
  }

  // check + queue popups for anything newly earned
  grantAchievements() {
    const newly = checkAchievements(this.save);
    if (newly.length) { persistSave(this.save); this.achQueue.push(...newly); this._drainAchQueue(); }
    return newly;
  }

  _drainAchQueue() {
    if (this._achShowing || this.achQueue.length === 0) return;
    this._achShowing = true;
    const a = this.achQueue.shift();
    const g = this.els.achPopIcon.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 40, 40);
    this.drawIcon(g, a.icon, 40, 36);
    this.els.achPopName.textContent = a.name;
    const pop = this.els.achPop;
    pop.classList.remove('hidden');
    // restart slide-in animation
    pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = '';
    Audio.sfx('powerup');
    clearTimeout(this._achTimer);
    this._achTimer = setTimeout(() => {
      pop.classList.add('hidden');
      this._achShowing = false;
      this._drainAchQueue();
    }, 2600);
  }

  // ---------- HUD ----------
  updateHud(s) {
    const E = this.els;
    if (this._em !== s.emeralds) { this._em = s.emeralds; E.hudEmeralds.textContent = `${s.emeralds}`; }
    const lv = `LV ${s.level} · ${s.biome}`;
    if (this._lv !== lv) { this._lv = lv; E.hudLevel.textContent = lv; }
    E.hudProgress.style.width = `${(s.progress * 100).toFixed(1)}%`;
    const pct = s.redstone / s.redstoneMax;
    E.golemFill.style.height = `${(pct * 100).toFixed(0)}%`;
    const ready = pct >= 1;
    E.golemBtn.classList.toggle('ready', ready);
    E.golemLabel.textContent = ready ? 'GO!' : `${Math.floor(pct * 100)}%`;
    // powerups
    const chips = [];
    if (s.power.triple > 0) chips.push(`3× ${Math.ceil(s.power.triple)}s`);
    if (s.power.rapid > 0) chips.push(`⚡ ${Math.ceil(s.power.rapid)}s`);
    if (s.power.power > 0) chips.push(`💥 ${Math.ceil(s.power.power)}s`);
    if (s.power.sword > 0) chips.push(`⚔ ${Math.ceil(s.power.sword)}s`);
    if (s.power.axe > 0) chips.push(`🪓 ${Math.ceil(s.power.axe)}s`);
    const cstr = chips.join('  ');
    if (this._chips !== cstr) { this._chips = cstr; E.powerChips.textContent = cstr; }
    // boss
    if (s.boss) {
      E.bossBar.classList.remove('hidden');
      E.bossName.textContent = s.boss.name;
      E.bossFill.style.width = `${(s.boss.hp / s.boss.max * 100).toFixed(1)}%`;
      E.bossHint.textContent = s.boss.needRunners ? `NEED ~${s.boss.needRunners} RUNNERS!` : '';
    } else {
      E.bossBar.classList.add('hidden');
    }
  }

  // ---------- results ----------
  showResult(r) {
    this.els.hud.classList.add('hidden');
    this.els.bossBar.classList.add('hidden');
    const E = this.els;
    const isExp = !!r.expedition;

    // expedition streak: the multiplier + streak bonus apply only to the FIRST
    // completion of today's expedition. Replays are practice for base emeralds.
    let streakBonus = 0, streak = 0, expFirst = false;
    if (isExp && r.win) {
      const rec = recordExpedition(this.save);
      streak = rec.streak;
      expFirst = rec.first;
      if (rec.first) {
        streakBonus = 20 * Math.min(rec.streak, 10);
        this.save.stats.expeditions = (this.save.stats.expeditions || 0) + 1;
      }
    }
    // strip the expedition multiplier on a replay (already cleared today)
    const earned = (isExp && !expFirst) ? Math.round(r.emeralds / (r.emeraldMul || 1)) : r.emeralds;

    E.resultTitle.textContent = r.win ? (isExp ? '🗺 EXPEDITION DONE!' : '⭐ VICTORY! ⭐') : 'CROWD WIPED OUT';
    E.resultTitle.className = r.win ? 'win' : 'lose';
    E.resultStats.innerHTML = '';
    const rows = [
      ...(isExp ? [['🗺 ' + r.expedition.name, r.win ? 'CLEARED!' : 'failed']] : []),
      ['<span class="em"></span> Emeralds earned', `+${earned}`],
      ...(r.win && !isExp ? [['🏆 Victory bonus', `+${r.bonus}`]] : []),
      ...(expFirst && r.emeraldMul > 1 ? [['✨ Expedition bonus', `${r.emeraldMul}× emeralds`]] : []),
      ...(streakBonus > 0 ? [[`🔥 Day ${streak} streak`, `+${streakBonus}`]] : []),
      ...(isExp && !expFirst && r.win ? [['↻ Replay', 'base reward only']] : []),
      ['👥 Biggest crowd', `${r.bestCrowd}`],
      ...(r.mode === 'shooter' ? [['🏹 Mobs blasted', `${r.kills}`]] : []),
      ...(isExp ? [] : [['🗺 ' + r.biome, r.win ? 'CLEARED!' : 'try again!']]),
    ];
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      d.className = 'statRow';
      d.innerHTML = `<span>${k}</span><b>${v}</b>`;
      E.resultStats.appendChild(d);
    }
    // expeditions never advance the campaign — NEXT shows only for a normal win
    E.btnNext.classList.toggle('hidden', !(r.win && !isExp));
    E.btnRetry.classList.toggle('hidden', r.win && !isExp);
    E.result.classList.remove('hidden');
    // bank it
    const banked = earned + streakBonus;
    this.save.emeralds += banked;
    this.save.stats.totalEmeralds = (this.save.stats.totalEmeralds || 0) + banked;
    if (r.win && !isExp) {
      this.save.level += 1;
      this.save.bestLevel = Math.max(this.save.bestLevel, this.save.level);
    }
    this.save.bestCrowd = Math.max(this.save.bestCrowd, r.bestCrowd);
    persistSave(this.save);
    this.grantAchievements();
  }

  // ---------- toasts ----------
  toast(kind) {
    const T = this.els.toast;
    clearTimeout(this._toastTimer);
    if (!kind) { T.classList.add('hidden'); return; }
    T.textContent = kind === 'steer' ? '👆 DRAG ANYWHERE TO STEER!' : '🗿 GOLEM READY — TAP THE BUTTON!';
    T.classList.remove('hidden');
    if (kind === 'steer') persistSave(this.save);
    this._toastTimer = setTimeout(() => T.classList.add('hidden'), 3500);
  }
}
