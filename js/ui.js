// DOM UI: menu, shop, HUD, results, tutorial toasts. Game world stays on canvas;
// chrome lives in DOM for crisp text and fat touch targets.
import { SKINS, MODES, BIOMES, CAMERAS, COSMETICS, VERSION, VILLAGERS, villagerCost, homeIncomeRate, pendingIdle, MINE, PICKAXES, blockHp, blockPay, blockKind, mineEnergy, pickaxeDmg, nextPickaxe, dailyExpedition, expeditionStatus, recordExpedition, persistSave, exportSave, importSave, resetSave } from './config.js';
const BLOCK_COLORS = { stone: '#8a8a8a', coal: '#42413f', iron: '#c8a878', gold: '#e8c84a', diamond: '#5ce0e0', emerald: '#2ecc5e' };
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
      steerL: $('steerL'), steerR: $('steerR'),
      btnHome: $('btnHome'), homeBadge: $('homeBadge'), home: $('home'), homeEmeralds: $('homeEmeralds'),
      homeWelcome: $('homeWelcome'), homeIncome: $('homeIncome'), homeScene: $('homeScene'),
      villagerList: $('villagerList'), btnHomeBack: $('btnHomeBack'),
      btnMine: $('btnMine'), mineBadge: $('mineBadge'), mine: $('mine'), mineEmeralds: $('mineEmeralds'),
      mineStats: $('mineStats'), energyBar: $('energyBar'), energyText: $('energyText'), digFace: $('digFace'),
      btnPickUp: $('btnPickUp'), btnMineBack: $('btnMineBack'),
      btnData: $('btnData'), settings: $('settings'), saveExport: $('saveExport'),
      saveImport: $('saveImport'), btnCopySave: $('btnCopySave'), btnLoadSave: $('btnLoadSave'),
      btnReset: $('btnReset'), setMsg: $('setMsg'), btnSettingsBack: $('btnSettingsBack'),
    };
    this.returnTo = 'menu';   // where BACK from shop/achievements goes
    this.achQueue = [];
    const vt = $('verTag'); if (vt) vt.textContent = 'v' + VERSION;
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
    E.btnHome.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.showHome(); });
    E.btnHomeBack.addEventListener('click', () => { Audio.sfx('click'); this.showMenu(); });
    E.btnMine.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.showMine(); });
    E.btnMineBack.addEventListener('click', () => { Audio.sfx('click'); persistSave(this.save); this.showMenu(); });
    E.btnPickUp.addEventListener('click', () => this.upgradePickaxe());
    E.btnData.addEventListener('click', () => { Audio.sfx('click'); this.showSettings(); });
    E.btnSettingsBack.addEventListener('click', () => { Audio.sfx('click'); this.showMenu(); });
    E.btnCopySave.addEventListener('click', () => {
      E.saveExport.select();
      try { navigator.clipboard.writeText(E.saveExport.value); } catch { document.execCommand('copy'); }
      E.setMsg.textContent = 'Copied! Keep it somewhere safe.';
    });
    E.btnLoadSave.addEventListener('click', () => {
      const merged = importSave(E.saveImport.value);
      if (merged) { E.setMsg.textContent = 'Loaded! Restarting…'; setTimeout(() => location.reload(), 700); }
      else { E.setMsg.textContent = 'That code did not work. Check for typos.'; }
    });
    E.btnReset.addEventListener('click', () => {
      if (confirm('Reset EVERYTHING? Your emeralds, skins, and progress will be erased. This cannot be undone.')) {
        resetSave();
        location.reload();
      }
    });
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

    // hold-to-steer buttons (also a visible hint that you can steer)
    const steer = (btn, dir) => {
      const on = (e) => { e.preventDefault(); this.game.holdSteer = dir; btn.classList.add('on'); };
      const off = () => { if (this.game.holdSteer === dir) this.game.holdSteer = 0; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('pointercancel', off);
    };
    steer(E.steerL, -1);
    steer(E.steerR, 1);

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
    Audio.stopMusic(); // don't let the sequencer pile up notes while hidden/paused
    this.refreshPause();
    this.els.pause.classList.remove('hidden');
  }

  closePause() {
    this.game.paused = false;
    this.els.pause.classList.add('hidden');
    if (this.save.sound) Audio.music(this.game.state === 'boss' ? 'boss' : 'run');
  }

  // Escape key: toggle pause during a run; ignore on other screens
  togglePause() {
    if (this.game.state !== 'run' && this.game.state !== 'boss') return;
    if (this.game.paused) { Audio.sfx('click'); this.closePause(); }
    else { Audio.sfx('click'); this.openPause(); }
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

  // ---- home hub ----
  homeData() {
    // defensively migrate older saves that predate the home field
    const h = this.save.home || (this.save.home = { villagers: {}, lastCollect: 0 });
    if (!h.villagers) h.villagers = {};
    for (const v of VILLAGERS) if (typeof h.villagers[v.id] !== 'number') h.villagers[v.id] = 0;
    return h;
  }

  homePending() {
    const h = this.homeData();
    return pendingIdle(h.villagers, h.lastCollect, Date.now());
  }

  showHome() {
    this.hideAll();
    const h = this.homeData();
    if (!h.lastCollect) { h.lastCollect = Date.now(); persistSave(this.save); } // seed the clock on first visit
    this.els.home.classList.remove('hidden');
    this.renderHome();
  }

  renderHome() {
    const E = this.els, h = this.homeData();
    E.homeEmeralds.textContent = `${this.save.emeralds}`;
    const rate = homeIncomeRate(h.villagers);
    E.homeIncome.textContent = rate > 0 ? `Your village earns +${rate}/hr while you're away` : 'Buy a villager to start earning emeralds!';

    const pending = this.homePending();
    if (pending > 0) {
      E.homeWelcome.classList.remove('hidden');
      E.homeWelcome.innerHTML = `<span>Villagers gathered <span class="em"></span> ${pending}!</span>`;
      const btn = document.createElement('button');
      btn.className = 'mcbtn small'; btn.textContent = 'COLLECT';
      btn.addEventListener('click', () => this.collectIdle());
      E.homeWelcome.appendChild(btn);
    } else {
      E.homeWelcome.classList.add('hidden');
    }

    // scene: one bobbing sprite per owned villager type, with a count
    E.homeScene.innerHTML = '';
    const owned = VILLAGERS.filter(v => h.villagers[v.id] > 0);
    if (!owned.length) {
      const empty = document.createElement('div');
      empty.className = 'homeEmpty'; empty.textContent = 'Your home is empty… bring a villager home!';
      E.homeScene.appendChild(empty);
    } else {
      for (const v of owned) {
        const wrap = document.createElement('div');
        wrap.className = 'homeSprite';
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 56;
        cv.style.width = '40px'; cv.style.height = '56px';
        cv.style.animationDelay = `${(VILLAGERS.indexOf(v) % 5) * 0.2}s`;
        this.drawSkinPreview(cv, v);
        wrap.appendChild(cv);
        const cnt = document.createElement('div');
        cnt.className = 'cnt'; cnt.textContent = `×${h.villagers[v.id]}`;
        wrap.appendChild(cnt);
        E.homeScene.appendChild(wrap);
      }
    }

    // villager shop list
    E.villagerList.innerHTML = '';
    for (const v of VILLAGERS) {
      const count = h.villagers[v.id];
      const cost = villagerCost(v.id, count);
      const canAfford = this.save.emeralds >= cost;
      const card = document.createElement('div');
      card.className = 'vCard';
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 88;
      this.drawSkinPreview(cv, v);
      card.appendChild(cv);
      const info = document.createElement('div');
      info.className = 'vInfo';
      info.innerHTML = `<div class="vName">${v.name} <span style="color:#b8f0c8">×${count}</span></div>`
        + `<div class="vMeta">+${v.income}/hr each · next <span class="em"></span> ${cost}</div>`;
      card.appendChild(info);
      const buy = document.createElement('button');
      buy.className = 'vBuy' + (canAfford ? '' : ' cant');
      buy.innerHTML = `<span class="em"></span> ${cost}`;
      buy.addEventListener('click', () => this.buyVillager(v.id));
      card.appendChild(buy);
      E.villagerList.appendChild(card);
    }
  }

  buyVillager(id) {
    const h = this.homeData();
    const cost = villagerCost(id, h.villagers[id]);
    if (this.save.emeralds < cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= cost;
    h.villagers[id]++;
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderHome();
  }

  collectIdle() {
    const h = this.homeData();
    const pending = this.homePending();
    if (pending <= 0) return;
    this.save.emeralds += pending;
    h.lastCollect = Date.now();
    persistSave(this.save);
    Audio.sfx('emerald');
    this.renderHome();
  }

  // ---- mining minigame ----
  mineData() {
    const m = this.save.mine || (this.save.mine = { depth: 0, energy: MINE.energyCap, energyTs: 0, pickaxe: 'wood' });
    if (typeof m.depth !== 'number') m.depth = 0;
    if (typeof m.energy !== 'number') m.energy = MINE.energyCap;
    if (typeof m.energyTs !== 'number') m.energyTs = 0;
    if (!m.pickaxe) m.pickaxe = 'wood';
    return m;
  }

  makeBlock(depth) { return { depth, kind: blockKind(depth), maxHp: blockHp(depth), hp: blockHp(depth) }; }

  showMine() {
    this.hideAll();
    const m = this.mineData();
    if (!m.energyTs) { m.energyTs = Date.now(); persistSave(this.save); } // seed the recharge clock
    this.buildDigFace();
    this.els.mine.classList.remove('hidden');
    this.renderMine();
  }

  buildDigFace() {
    const m = this.mineData(), n = MINE.cols * MINE.rows;
    this.digGrid = Array.from({ length: n }, () => this.makeBlock(m.depth));
    const face = this.els.digFace;
    face.innerHTML = '';
    this.digCells = [];
    for (let i = 0; i < n; i++) {
      const cell = document.createElement('button');
      cell.className = 'block';
      const crack = document.createElement('span'); crack.className = 'crack';
      cell.appendChild(crack);
      cell.addEventListener('click', () => this.mineTap(i));
      face.appendChild(cell);
      this.digCells.push(cell);
    }
  }

  renderMine() {
    const E = this.els, m = this.mineData(), now = Date.now();
    E.mineEmeralds.textContent = `${this.save.emeralds}`;
    const cur = mineEnergy(m, now), cap = MINE.energyCap;
    E.energyBar.style.width = `${(cur / cap) * 100}%`;
    E.energyText.textContent = `⚡ ${cur} / ${cap}`;
    E.digFace.classList.toggle('spent', cur <= 0);
    const pick = PICKAXES.find(p => p.id === m.pickaxe) || PICKAXES[0];
    E.mineStats.textContent = `Depth ${m.depth}  ·  ${pick.name} Pickaxe (⛏ ${pick.dmg})`;
    for (let i = 0; i < this.digCells.length; i++) {
      const cell = this.digCells[i], blk = this.digGrid[i];
      cell.style.background = BLOCK_COLORS[blk.kind] || '#8a8a8a';
      const dmg = 1 - blk.hp / blk.maxHp;
      cell.querySelector('.crack').style.opacity = dmg > 0 ? (0.15 + dmg * 0.6).toFixed(2) : '0';
    }
    const next = nextPickaxe(m.pickaxe);
    if (next) {
      E.btnPickUp.innerHTML = `⬆ ${next.name} Pickaxe (⛏ ${next.dmg}) · <span class="em"></span> ${next.cost}`;
      E.btnPickUp.style.opacity = this.save.emeralds >= next.cost ? '1' : '0.6';
    } else {
      E.btnPickUp.innerHTML = '⛏ Netherite Pickaxe — maxed!';
      E.btnPickUp.style.opacity = '0.6';
    }
  }

  mineTap(i) {
    const m = this.mineData(), now = Date.now();
    const cur = mineEnergy(m, now);
    if (cur <= 0) { Audio.sfx('gate_bad'); this.renderMine(); return; }
    m.energy = cur - 1; m.energyTs = now; // spend one swing of energy
    const blk = this.digGrid[i], cell = this.digCells[i];
    blk.hp -= pickaxeDmg(m.pickaxe);
    if (blk.hp <= 0) {
      m.depth += 1;
      let pay = blockPay(blk.depth);
      const crit = Math.random() < MINE.gemCritChance;
      if (crit) pay *= MINE.gemCritMult;
      this.save.emeralds += pay;
      cell.classList.remove('pop'); void cell.offsetWidth; cell.classList.add('pop');
      const pop = document.createElement('span'); pop.className = 'pay';
      pop.textContent = (crit ? '💎 +' : '+') + pay;
      cell.appendChild(pop); setTimeout(() => pop.remove(), 700);
      Audio.sfx(crit ? 'chest' : 'emerald');
      this.digGrid[i] = this.makeBlock(m.depth);
    } else {
      Audio.sfx('hit', 30);
    }
    persistSave(this.save);
    this.renderMine();
  }

  upgradePickaxe() {
    const m = this.mineData(), next = nextPickaxe(m.pickaxe);
    if (!next) return;
    if (this.save.emeralds < next.cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= next.cost;
    m.pickaxe = next.id;
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderMine();
  }

  showSettings() {
    this.hideAll();
    this.els.saveExport.value = exportSave(this.save);
    this.els.saveImport.value = '';
    this.els.setMsg.textContent = '';
    this.els.settings.classList.remove('hidden');
  }

  hideAll() {
    for (const k of ['menu', 'shop', 'result', 'hud', 'pause', 'achScreen', 'settings', 'home', 'mine']) this.els[k].classList.add('hidden');
    this.els.bossBar.classList.add('hidden');
    // clear cached HUD values so the next run repaints from scratch
    this._bossShown = false;
    this._prog = this._fill = this._glabel = this._chips = this._em = this._lv = this._bossHint = this._ready = null;
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
    E.menuLevel.textContent = `LV ${this.save.level} · ${biome.name.toUpperCase()}`;
    E.menuEmeralds.textContent = `${this.save.emeralds}`;
    E.btnSound.textContent = this.save.sound ? '🔊 ON' : '🔇 OFF';
    E.btnCamera.textContent = `📷 ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    E.modeShooter.classList.toggle('sel', this.save.mode === 'shooter');
    E.modeGates.classList.toggle('sel', this.save.mode === 'gates');
    E.modeDesc.textContent = MODES[this.save.mode].desc;
    E.homeBadge.classList.toggle('hidden', this.homePending() <= 0); // idle emeralds waiting
    E.mineBadge.classList.toggle('hidden', mineEnergy(this.mineData(), Date.now()) < MINE.energyCap); // fully charged
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
    const body = getSprite(skin.body || 'runner_body_front', skin.palette, `body_${skin.id}`);
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
    const prog = `${(s.progress * 100).toFixed(1)}%`;
    if (this._prog !== prog) { this._prog = prog; E.hudProgress.style.width = prog; }
    const pct = s.redstone / s.redstoneMax;
    const fill = `${(pct * 100).toFixed(0)}%`;
    if (this._fill !== fill) { this._fill = fill; E.golemFill.style.height = fill; }
    const ready = pct >= 1;
    if (this._ready !== ready) { this._ready = ready; E.golemBtn.classList.toggle('ready', ready); }
    const glabel = ready ? 'GO!' : `${Math.floor(pct * 100)}%`;
    if (this._glabel !== glabel) { this._glabel = glabel; E.golemLabel.textContent = glabel; }
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
    if (s.bossActive) {
      if (!this._bossShown) { this._bossShown = true; E.bossBar.classList.remove('hidden'); E.bossName.textContent = s.boss.name; }
      E.bossFill.style.width = `${(s.boss.hp / s.boss.max * 100).toFixed(1)}%`;
      const hint = s.boss.needRunners ? `NEED ~${s.boss.needRunners} RUNNERS!` : '';
      if (this._bossHint !== hint) { this._bossHint = hint; E.bossHint.textContent = hint; }
    } else if (this._bossShown) {
      this._bossShown = false; E.bossBar.classList.add('hidden');
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
      ...(r.rods > 0 ? [['🔥 Blaze rods', `+${r.rods}`]] : []),
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
