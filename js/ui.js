// DOM UI: menu, shop, HUD, results, tutorial toasts. Game world stays on canvas;
// chrome lives in DOM for crisp text and fat touch targets.
import { SKINS, MODES, BIOMES, CAMERAS, COSMETICS, VERSION, VILLAGERS, villagerCost, homeIncomeRate, pendingIdle, MINE, PICKAXES, blockHp, blockPay, blockKind, mineEnergy, pickaxeDmg, nextPickaxe, clamp01, DECOR, decorById, ROOM_TIERS, roomTierById, TOWNS, townById, MAX_HOUSES, housePrice, makeHouse, styleById, migrateWorld, dailyExpedition, expeditionStatus, recordExpedition, persistSave, exportSave, importSave, resetSave, writeBackup, listBackups, restoreBackup, dayStamp } from './config.js';
const BLOCK_COLORS = { stone: '#8a8a8a', coal: '#42413f', iron: '#c8a878', gold: '#e8c84a', diamond: '#5ce0e0', emerald: '#2ecc5e' };
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { getSprite, blit, hasSprite } from './assets.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, save) {
    this.game = game;
    this.save = save;
    this.els = {
      menu: $('menu'), shop: $('shop'), result: $('result'), hud: $('hud'),
      menuLevel: $('menuLevel'), menuEmeralds: $('menuEmeralds'),
      btnPlay: $('btnPlay'),
      modeShooter: $('modeShooter'), modeGates: $('modeGates'), modeDesc: $('modeDesc'),
      shopGrid: $('shopGrid'), shopEmeralds: $('shopEmeralds'),
      resultTitle: $('resultTitle'), resultStats: $('resultStats'),
      btnNext: $('btnNext'), btnRetry: $('btnRetry'), btnMenu: $('btnMenu'),
      hudEmeralds: $('hudEmeralds'), hudLevel: $('hudLevel'), hudProgress: $('hudProgress'),
      powerChips: $('powerChips'),
      golemMeter: $('golemMeter'), golemFill: $('golemFill'), golemLabel: $('golemLabel'),
      bossBar: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), bossHint: $('bossHint'),
      toast: $('toast'),
      btnPause: $('btnPause'), pause: $('pause'), btnResume: $('btnResume'),
      btnPauseCamera: $('btnPauseCamera'), btnPauseShop: $('btnPauseShop'),
      btnPauseAch: $('btnPauseAch'), btnPauseSound: $('btnPauseSound'), btnQuit: $('btnQuit'), achScreen: $('achievements'), achGrid: $('achGrid'),
      achCount: $('achCount'),
      achPop: $('achPop'), achPopIcon: $('achPopIcon'), achPopName: $('achPopName'),
      expCard: $('expCard'), expIcon: $('expIcon'), expName: $('expName'),
      expDesc: $('expDesc'), expStreak: $('expStreak'), btnExpedition: $('btnExpedition'), homeBadge: $('homeBadge'), home: $('home'), homeEmeralds: $('homeEmeralds'),
      homeWelcome: $('homeWelcome'), homeIncome: $('homeIncome'), homeScene: $('homeScene'),
      villagerList: $('villagerList'), playroom: $('playroom'), btnAddFriend: $('btnAddFriend'),
      btnDecor: $('btnDecor'), btnRoom: $('btnRoom'), playEmeralds: $('playEmeralds'),
      playScene: $('playScene'), dressPanel: $('dressPanel'), playHint: $('playHint'),
      roomWorld: $('roomWorld'), roomBg: $('roomBg'), roomItems: $('roomItems'), trashZone: $('trashZone'),
      carryZone: $('carryZone'), btnPlaceCarry: $('btnPlaceCarry'), playHouseTitle: $('playHouseTitle'),
      world: $('world'), worldEmeralds: $('worldEmeralds'), townGrid: $('townGrid'),
      town: $('town'), townTitle: $('townTitle'), townEmeralds: $('townEmeralds'), townHint: $('townHint'),
      houseGrid: $('houseGrid'), btnBuyHouse: $('btnBuyHouse'), mineBadge: $('mineBadge'), mine: $('mine'), mineEmeralds: $('mineEmeralds'),
      mineStats: $('mineStats'), energyBar: $('energyBar'), energyText: $('energyText'), digFace: $('digFace'),
      btnPickUp: $('btnPickUp'), settings: $('settings'), saveExport: $('saveExport'),
      saveImport: $('saveImport'), btnCopySave: $('btnCopySave'), btnLoadSave: $('btnLoadSave'),
      btnReset: $('btnReset'), setMsg: $('setMsg'),
      // app shell
      appbar: $('appbar'), appTitle: $('appTitle'), navBack: $('navBack'), navMore: $('navMore'),
      barWallet: $('barWallet'), barEmeralds: $('barEmeralds'), navbar: $('navbar'),
      navDotHome: $('navDotHome'), navDotMine: $('navDotMine'),
      more: $('more'), about: $('about'), aboutVersion: $('aboutVersion'),
      btnGoals: $('btnGoals'), btnCameraMore: $('btnCameraMore'), btnSoundMore: $('btnSoundMore'),
      btnSaveMore: $('btnSaveMore'), btnAbout: $('btnAbout'),
      cameraLabel: $('cameraLabel'), soundLabel: $('soundLabel'),
      btnMusicMore: $('btnMusicMore'), musicLabel: $('musicLabel'),
      btnDownloadSave: $('btnDownloadSave'), backupList: $('backupList'),
    };
    this.returnTo = 'menu';   // where BACK from shop/achievements goes
    this.achQueue = [];
    const vt = $('verTag'); if (vt) vt.textContent = 'v' + VERSION;
    // currency icon: bake the green emerald sprite into a CSS var so name + icon agree
    try {
      const em = getSprite('emerald');
      document.documentElement.style.setProperty('--em-icon', `url(${em.frames[0].toDataURL()})`);
    } catch { /* asset missing — chips just show the count */ }
    Audio.setMusic(this.save.music !== false);
    Audio.setSfx(this.save.sfx !== false);
    this._wire();
    this.wireShell();
    this.paintIcons();
    // back-fill achievements a returning player already earned — silently, no popups
    checkAchievements(this.save);
    persistSave(this.save);
    this.refreshMenu();
    this.showMenu();
  }

  _wire() {
    const E = this.els;
    E.btnPlay.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.startRun(); });
    E.btnExpedition.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.startExpedition(); });
    E.btnBuyHouse.addEventListener('click', () => this.buyHouse());
    E.btnPlaceCarry.addEventListener('click', () => this.placeCarry());
    E.btnAddFriend.addEventListener('click', () => this.addFriend());
    E.btnDecor.addEventListener('click', () => this.showDecorCatalog());
    E.btnRoom.addEventListener('click', () => this.showRoomPicker());
    E.btnPickUp.addEventListener('click', () => this.upgradePickaxe());
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
    E.modeShooter.addEventListener('click', () => this.setMode('shooter'));
    E.modeGates.addEventListener('click', () => this.setMode('gates'));
    E.btnNext.addEventListener('click', () => { Audio.sfx('click'); this.startRun(); });
    E.btnRetry.addEventListener('click', () => { Audio.sfx('click'); this.startRun(); });
    E.btnMenu.addEventListener('click', () => { Audio.sfx('click'); this.showMenu(); });
    // "More": the meta screens that do not deserve a tab of their own
    E.btnGoals.addEventListener('click', () => { Audio.sfx('click'); this.showAchievements('more'); });
    E.btnSaveMore.addEventListener('click', () => { Audio.sfx('click'); this.showSettings(); });
    E.btnAbout.addEventListener('click', () => {
      Audio.sfx('click');
      E.aboutVersion.textContent = VERSION;
      this.openScreen('about');
    });
    E.btnSoundMore.addEventListener('click', () => {
      this.save.sfx = !this.save.sfx;
      Audio.setSfx(this.save.sfx);
      if (this.save.sfx) { Audio.unlock(); Audio.sfx('click'); }
      persistSave(this.save);
      this.refreshMore();
    });
    E.btnMusicMore.addEventListener('click', () => {
      this.save.music = !this.save.music;
      Audio.unlock();
      Audio.setMusic(this.save.music);
      if (this.save.music) Audio.music('menu');
      persistSave(this.save);
      this.refreshMore();
    });
    E.btnDownloadSave.addEventListener('click', () => { Audio.sfx('click'); this.downloadSave(); });
    E.btnCameraMore.addEventListener('click', () => {
      Audio.sfx('click');
      const keys = Object.keys(CAMERAS);
      this.save.camera = keys[(keys.indexOf(this.save.camera) + 1) % keys.length];
      persistSave(this.save);
      this.game.applyCamera();
      this.refreshMore();
    });

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
    this.els.btnPauseCamera.textContent = `CAMERA: ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    this.els.btnPauseSound.textContent = this.save.sound ? 'ALL SOUND ON' : 'ALL SOUND OFF';
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
    this.setPlaying(true);
    this.game.startRun();
    this.toast(null);
  }

  startExpedition() {
    this.hideAll();
    this.els.hud.classList.remove('hidden');
    this.setPlaying(true);
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
    const h = this.homeData();
    if (!h.lastCollect) { h.lastCollect = Date.now(); persistSave(this.save); } // seed the clock on first visit
    this.openScreen('home');
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
    const m = this.mineData();
    if (!m.energyTs) { m.energyTs = Date.now(); persistSave(this.save); } // seed the recharge clock
    this.buildDigFace();
    this.openScreen('mine');
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
    E.energyText.textContent = `ENERGY ${cur} / ${cap}`;
    E.digFace.classList.toggle('spent', cur <= 0);
    const pick = PICKAXES.find(p => p.id === m.pickaxe) || PICKAXES[0];
    E.mineStats.textContent = `Depth ${m.depth}  ·  ${pick.name} Pickaxe  ·  power ${pick.dmg}`;
    for (let i = 0; i < this.digCells.length; i++) {
      const cell = this.digCells[i], blk = this.digGrid[i];
      cell.style.background = BLOCK_COLORS[blk.kind] || '#8a8a8a';
      const dmg = 1 - blk.hp / blk.maxHp;
      cell.querySelector('.crack').style.opacity = dmg > 0 ? (0.15 + dmg * 0.6).toFixed(2) : '0';
    }
    const next = nextPickaxe(m.pickaxe);
    if (next) {
      E.btnPickUp.innerHTML = `UPGRADE: ${next.name} Pickaxe (power ${next.dmg}) · <span class="em"></span> ${next.cost}`;
      E.btnPickUp.style.opacity = this.save.emeralds >= next.cost ? '1' : '0.6';
    } else {
      E.btnPickUp.innerHTML = 'Netherite Pickaxe — fully upgraded';
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
      pop.textContent = (crit ? 'GEM +' : '+') + pay;
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

  // ---- playroom (dressable playmates) ----
  ownedSkins() { return SKINS.filter(s => this.save.unlocked.includes(s.id)); }
  ownedCos(cat) { return COSMETICS[cat].filter(c => c.id === 'none' || this.save.cosmeticsOwned.includes(c.id)); }
  skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

  // draw a limb sprite hanging from a joint (jx,jy), rotated by `angle` radians
  drawLimb(g, name, palette, key, jx, jy, hPx, angle) {
    const spr = getSprite(name, palette, key);
    const src = spr.frames[0];
    const wPx = spr.w * (hPx / spr.h);
    g.save(); g.translate(jx, jy); g.rotate(angle);
    g.drawImage(src, -wPx / 2, 0, wPx, hPx); // top edge at the joint, hangs down
    g.restore();
  }

  // Compose a front-facing character from separate limbs so it can ragdoll.
  // pose = { aL, aR, lL, lR } are arm/leg swing angles in radians (default rest).
  drawDressedCharacter(cv, skinObj, cos = {}, pose = null) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const S = cv.height / 80, cx = cv.width / 2, pal = skinObj.palette, key = skinObj.id;
    const P = pose || { aL: 0, aR: 0, lL: 0, lR: 0 };
    const shoulderY = 30 * S, hipY = 50 * S, headCY = 16 * S;
    const shoulderDX = 9 * S, hipDX = 4.5 * S;
    const armLen = 22 * S, legLen = 26 * S, headH = 24 * S, torsoH = 24 * S;

    // cape: a wide cloak behind the torso (peeks out both sides so it actually reads)
    if (cos.cape && cos.cape !== 'none') {
      const def = COSMETICS.cape.find(c => c.id === cos.cape);
      if (def) {
        const cape = getSprite('cape', def.rainbow ? { c: '#ff5545', C: '#3fa9ff' } : def.colors, `pm_cape_${cos.cape}`);
        const w = 30 * S, h = 34 * S;
        g.save(); g.translate(cx, shoulderY - 4 * S); g.rotate((P.lL + P.lR) * 0.15);
        g.drawImage(cape.frames[0], -w / 2, 0, w, h); g.restore();
      }
    }
    // legs (behind the torso)
    this.drawLimb(g, 'pm_leg', pal, `${key}_leg`, cx - hipDX, hipY, legLen, P.lL);
    this.drawLimb(g, 'pm_leg', pal, `${key}_leg`, cx + hipDX, hipY, legLen, P.lR);
    // torso
    const torso = getSprite('pm_torso', pal, `${key}_torso`);
    const tw = torso.w * (torsoH / torso.h);
    g.drawImage(torso.frames[0], cx - tw / 2, hipY - torsoH, tw, torsoH);
    // arms (in front of the torso)
    this.drawLimb(g, 'pm_arm', pal, `${key}_arm`, cx - shoulderDX, shoulderY, armLen, P.aL);
    this.drawLimb(g, 'pm_arm', pal, `${key}_arm`, cx + shoulderDX, shoulderY, armLen, P.aR);
    // head
    const head = getSprite(skinObj.head);
    const hw = head.w * (headH / head.h);
    const headTop = headCY - headH / 2;
    g.drawImage(head.frames[0], cx - hw / 2, headTop, hw, headH);
    // hat on the head
    if (cos.hat && cos.hat !== 'none') {
      const def = COSMETICS.hat.find(h => h.id === cos.hat);
      if (def && hasSprite(def.sprite)) {
        const hat = getSprite(def.sprite);
        const hatW = hw * 1.05, hatH = hat.h * (hatW / hat.w);
        g.drawImage(hat.frames[0], cx - hatW / 2, headTop - hatH + 3 * S, hatW, hatH);
      }
    }
  }

  // ensure the current house's people list exists and references owned/valid items
  // ---- world / towns / houses ----
  worldData() { return migrateWorld(this.save); }
  townRec(id) { const w = this.worldData(); return w.towns[id || w.town]; }
  curHouse() {
    const w = this.worldData();
    const houses = w.towns[w.town].houses;
    return houses[w.house] || houses[0];
  }

  showWorld() {
    this.worldData();
    this.openScreen('world');
    this.renderWorld();
  }

  renderWorld() {
    const E = this.els, w = this.worldData();
    E.worldEmeralds.textContent = `${this.save.emeralds}`;
    E.townGrid.innerHTML = '';
    for (const t of TOWNS) {
      const rec = w.towns[t.id];
      const affordable = this.save.emeralds >= t.cost;
      const card = document.createElement('button');
      card.className = 'townCard' + (rec.unlocked ? (t.id === w.town ? ' here' : '') : (affordable ? ' locked' : ' locked cant'));
      const icon = document.createElement('canvas'); icon.className = 'townIcon';
      this.drawTownIcon(icon, t, rec.unlocked);
      const name = document.createElement('div'); name.className = 'townName'; name.textContent = t.name;
      const meta = document.createElement('div');
      if (rec.unlocked) {
        meta.className = 'townMeta';
        meta.textContent = `${rec.houses.length} ${rec.houses.length === 1 ? 'house' : 'houses'}`;
      } else {
        meta.className = 'townMeta cost';
        meta.innerHTML = `<span class="em"></span> ${t.cost}`;
      }
      card.append(icon, name, meta);
      card.addEventListener('click', () => (rec.unlocked ? this.enterTown(t.id) : this.unlockTown(t.id)));
      E.townGrid.appendChild(card);
    }
  }

  unlockTown(id) {
    const t = townById(id), rec = this.townRec(id);
    if (rec.unlocked) return;
    if (this.save.emeralds < t.cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= t.cost;
    rec.unlocked = true;
    if (!rec.houses.length) rec.houses.push(makeHouse(id)); // arrives pre-decorated
    persistSave(this.save);
    Audio.sfx('fanfare');
    this.enterTown(id);
  }

  enterTown(id) {
    const w = this.worldData();
    w.town = id; w.house = 0;
    persistSave(this.save);
    Audio.sfx('click');
    this.showTown();
  }

  showTown() {
    this.worldData();
    this.openScreen('town');
    this.renderTown();
  }

  renderTown() {
    const E = this.els, w = this.worldData(), t = townById(w.town), rec = this.townRec();
    E.townTitle.textContent = t.name.toUpperCase();
    E.townEmeralds.textContent = `${this.save.emeralds}`;
    E.townHint.textContent = w.carry
      ? 'You are carrying a friend — go into a house to place them'
      : 'Tap a house to go inside';
    E.houseGrid.innerHTML = '';
    rec.houses.forEach((h, i) => {
      const card = document.createElement('button');
      card.className = 'townCard' + (i === w.house ? ' here' : '');
      const icon = document.createElement('canvas'); icon.className = 'townIcon';
      this.drawTownIcon(icon, t, true);
      const name = document.createElement('div'); name.className = 'townName'; name.textContent = `House ${i + 1}`;
      const meta = document.createElement('div'); meta.className = 'townMeta';
      meta.textContent = `${h.people.length} ${h.people.length === 1 ? 'friend' : 'friends'}`;
      card.append(icon, name, meta);
      card.addEventListener('click', () => this.enterHouse(i));
      E.houseGrid.appendChild(card);
    });
    const full = rec.houses.length >= MAX_HOUSES;
    const cost = housePrice(rec.houses.length);
    E.btnBuyHouse.classList.toggle('hidden', full);
    if (!full) {
      E.btnBuyHouse.innerHTML = `＋ BUY HOUSE · <span class="em"></span> ${cost}`;
      E.btnBuyHouse.style.opacity = this.save.emeralds >= cost ? '1' : '0.6';
    }
  }

  buyHouse() {
    const rec = this.townRec(), w = this.worldData();
    if (rec.houses.length >= MAX_HOUSES) return;
    const cost = housePrice(rec.houses.length);
    if (this.save.emeralds < cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= cost;
    rec.houses.push(makeHouse(w.town)); // pre-decorated, never an empty box
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderTown();
  }

  enterHouse(i) {
    const w = this.worldData();
    w.house = i;
    this.panX = 0;
    persistSave(this.save);
    Audio.sfx('click');
    this.showPlayroom();
  }

  // put the carried friend down in the house you're standing in
  placeCarry() {
    const w = this.worldData();
    if (!w.carry) return;
    const p = w.carry;
    const worldW = this.worldW || 1, vx = ((this.panX || 0) + (this.sceneW || worldW) * 0.5) / worldW;
    p.x = clamp01(vx); p.y = 0.8;
    this.curHouse().people.push(p);
    w.carry = null;
    persistSave(this.save);
    Audio.sfx('powerup');
    this.renderPlayroom();
  }

  playmatesData() {
    const house = this.curHouse();
    if (!Array.isArray(house.people)) house.people = [];
    const owned = new Set(this.save.unlocked);
    for (const p of house.people) {
      if (!owned.has(p.skin)) p.skin = 'steve';
      if (!p.cosmetics) p.cosmetics = { cape: 'none', hat: 'none' };
      for (const cat of ['cape', 'hat']) {
        const id = p.cosmetics[cat];
        if (id && id !== 'none' && !this.save.cosmeticsOwned.includes(id)) p.cosmetics[cat] = 'none';
      }
      p.x = clamp01(typeof p.x === 'number' ? p.x : 0.5);
      p.y = clamp01(typeof p.y === 'number' ? p.y : 0.7);
    }
    return house.people;
  }

  showPlayroom() {
    this.playmatesData();
    this.els.dressPanel.classList.add('hidden');
    this.openScreen('playroom');
    this.panX = this.panX || 0;
    this.wirePan();
    this.renderPlayroom();
  }

  // drag the empty background to pan through the wide house (Toca-Boca style)
  wirePan() {
    if (this._panWired) return;
    this._panWired = true;
    const scene = this.els.playScene;
    let last = 0, active = false;
    const move = (e) => { if (!active) return; this.setPan(this.panX - (e.clientX - last)); last = e.clientX; };
    const up = () => { active = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    scene.addEventListener('pointerdown', (e) => {
      // playmates/decor stop propagation, so a pointerdown that reaches here is background
      active = true; last = e.clientX;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  addFriend() {
    const owned = this.ownedSkins();
    const list = this.playmatesData();
    const skin = owned[list.length % owned.length].id; // cycle through owned skins
    // drop the new friend where you're currently looking, in world coords
    const w = this.worldW || 1, vx = ((this.panX || 0) + (this.sceneW || w) * (0.35 + Math.random() * 0.3)) / w;
    list.push({ skin, cosmetics: { cape: 'none', hat: 'none' }, x: clamp01(vx), y: 0.72 + Math.random() * 0.2 });
    persistSave(this.save);
    Audio.sfx('powerup');
    this.renderPlayroom();
  }

  decorData() {
    const house = this.curHouse();
    if (!Array.isArray(house.decor)) house.decor = [];
    house.decor = house.decor.filter(d => decorById(d.item));
    for (const d of house.decor) { d.x = clamp01(typeof d.x === 'number' ? d.x : 0.5); d.y = clamp01(typeof d.y === 'number' ? d.y : 0.8); }
    return house.decor;
  }

  roomData() {
    // room styles are owned globally; each house picks one (or its town's native)
    const first = ROOM_TIERS[0].id;
    if (!Array.isArray(this.save.roomTiersOwned)) this.save.roomTiersOwned = [first];
    this.save.roomTiersOwned = this.save.roomTiersOwned.filter(id => ROOM_TIERS.some(r => r.id === id));
    if (!this.save.roomTiersOwned.includes(first)) this.save.roomTiersOwned.unshift(first);
    return this.save;
  }

  // the materials the current house renders with
  curStyle() {
    const w = this.worldData();
    return styleById(this.curHouse().style, w.town);
  }

  // draw a single decoration sprite fitted (bottom-anchored) into a canvas
  drawSprite(cv, name) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    if (!name || !hasSprite(name)) return;
    const spr = getSprite(name);
    let h = cv.height * 0.92;
    if (spr.w * (h / spr.h) > cv.width * 0.95) h = cv.width * 0.95 * spr.h / spr.w;
    blit(g, spr, 0, cv.width / 2, cv.height - 2, h);
  }

  // The house is wider than the viewport — you drag the background to pan through it.
  WORLD_SCALE = 2.4;

  layoutWorld() {
    const rect = this.els.playScene.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return null; // not laid out yet
    this.worldW = Math.round(rect.width * this.WORLD_SCALE);
    this.sceneW = rect.width;
    this.els.roomWorld.style.width = `${this.worldW}px`;
    if (this.panX == null) this.panX = 0;
    this.setPan(this.panX);
    return rect;
  }

  setPan(px) {
    const max = Math.max(0, (this.worldW || 0) - (this.sceneW || 0));
    this.panX = Math.max(0, Math.min(max, px));
    this.els.roomWorld.style.transform = `translateX(${-this.panX}px)`;
  }

  // paint the whole wide house interior: patterned wall, floor with depth, trim,
  // and windows + a door spread across the wall so panning reveals them
  drawRoom() {
    const rect = this.layoutWorld();
    if (!rect) { requestAnimationFrame(() => { if (!this.els.mine.classList.contains('hidden')) return; this.drawRoom(); }); return; }
    const cv = this.els.roomBg;
    const LH = Math.max(60, Math.min(360, Math.round(128 * rect.height / rect.width)));
    const LW = Math.round(LH * this.worldW / rect.height);
    cv.width = LW; cv.height = LH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const t = this.curStyle();
    const floorY = Math.round(LH * 0.56);

    g.fillStyle = t.wall; g.fillRect(0, 0, LW, floorY);
    g.fillStyle = t.wallAlt;
    if (t.pattern === 'bricks') {
      for (let y = 0, row = 0; y < floorY; y += 6, row++) {
        g.fillRect(0, y + 5, LW, 1);
        for (let x = (row % 2 ? 0 : 6); x < LW; x += 12) g.fillRect(x, y, 1, 5);
      }
    } else if (t.pattern === 'tiles') {
      for (let y = 0; y < floorY; y += 8) g.fillRect(0, y, LW, 1);
      for (let x = 0; x < LW; x += 8) g.fillRect(x, 0, 1, floorY);
    } else {
      for (let y = 0, row = 0; y < floorY; y += 7, row++) {
        g.fillRect(0, y, LW, 1);
        for (let x = (row % 2 ? 42 : 0); x < LW; x += 84) g.fillRect(x, y, 1, 7); // staggered joints
      }
    }

    g.fillStyle = t.floor; g.fillRect(0, floorY, LW, LH - floorY);
    g.fillStyle = t.floorAlt;
    for (let y = floorY + 3, step = 3; y < LH; step *= 1.34, y += step) g.fillRect(0, Math.round(y), LW, 1);
    if (t.pattern === 'tiles') for (let x = 0; x < LW; x += 12) g.fillRect(x, floorY, 1, LH - floorY);

    g.fillStyle = t.trim; g.fillRect(0, floorY - 3, LW, 4);

    // furniture built into the wall, spread across the wide room
    const winH = Math.round(floorY * 0.30), doorH = Math.round(floorY * 0.5);
    if (hasSprite('room_window')) {
      blit(g, getSprite('room_window'), 0, Math.round(LW * 0.12), Math.round(floorY * 0.40), winH);
      blit(g, getSprite('room_window'), 0, Math.round(LW * 0.55), Math.round(floorY * 0.40), winH);
    }
    if (hasSprite('room_door')) blit(g, getSprite('room_door'), 0, Math.round(LW * 0.80), floorY + 1, doorH);
  }

  renderPlayroom() {
    const E = this.els, list = this.playmatesData(), decor = this.decorData();
    this.roomData();
    const w = this.worldData(), t = townById(w.town);
    E.playEmeralds.textContent = `${this.save.emeralds}`;
    E.playHouseTitle.textContent = `HOUSE ${w.house + 1}`;
    E.btnPlaceCarry.classList.toggle('hidden', !w.carry);
    E.playHint.textContent = w.carry
      ? 'Tap PLACE FRIEND to bring your visitor into this house'
      : 'Drag friends & decor · tap a friend to dress · drop one on the bag to take them along';
    this.drawRoom();
    const layer = E.roomItems;
    layer.innerHTML = '';
    if (!list.length && !decor.length) {
      const empty = document.createElement('div');
      empty.className = 'playEmpty';
      empty.textContent = 'Your house is empty — add a friend or some decor!';
      layer.appendChild(empty);
      return;
    }
    // decor first so furniture sits behind the friends
    decor.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = 'playmate decor';
      el.style.left = `${d.x * 100}%`; el.style.top = `${d.y * 100}%`;
      const cv = document.createElement('canvas'); cv.width = 56; cv.height = 56;
      this.drawSprite(cv, decorById(d.item) && decorById(d.item).sprite);
      el.appendChild(cv);
      this.wireDrag(el, d, { onRemove: () => this.removeDecor(i) });
      layer.appendChild(el);
    });
    list.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'playmate';
      el.style.left = `${p.x * 100}%`; el.style.top = `${p.y * 100}%`;
      const cv = document.createElement('canvas'); cv.width = 52; cv.height = 74;
      cv.style.animationDelay = `${(i % 5) * 0.4}s`;
      const skin = this.skinById(p.skin);
      this.drawDressedCharacter(cv, skin, p.cosmetics);
      el.appendChild(cv);
      this.wireDrag(el, p, {
        onTap: () => this.openDress(i), onRemove: () => this.removePlaymate(i),
        redraw: (pose) => this.drawDressedCharacter(cv, skin, p.cosmetics, pose),
        onCarry: this.worldData().carry ? null : () => this.pickUpPlaymate(i), // one passenger at a time
      });
      layer.appendChild(el);
    });
  }

  // Drag any room item in WORLD coordinates (accounting for the pan). Playmates
  // (redraw given) ragdoll — arms and legs swing opposite the motion and wobble
  // to rest via damped springs. Decor tilts as a whole. Drop on the bin to remove.
  wireDrag(el, obj, { onTap, onRemove, redraw, onCarry } = {}) {
    const bin = this.els.trashZone, sack = this.els.carryZone;
    let moved = false, startX = 0, startY = 0, lastX = 0, overBin = false, overSack = false, dragging = false, raf = 0, tilt = 0, vx = 0;
    const inside = (e, node) => {
      const b = node.getBoundingClientRect();
      return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
    };
    const L = { aL: { a: 0, v: 0 }, aR: { a: 0, v: 0 }, lL: { a: 0, v: 0 }, lR: { a: 0, v: 0 } };
    const putTilt = (a, s) => { el.style.transform = `translate(-50%, -100%) rotate(${a.toFixed(2)}deg) scale(${s})`; };
    // looser damping = more wobble = more ragdolly
    const spring = (limb, target, stiff) => { limb.v += (target - limb.a) * stiff; limb.v *= 0.87; limb.a += limb.v; };

    const tick = () => {
      vx *= 0.84;
      const d = Math.max(-1.1, Math.min(1.1, -vx * 0.028));
      spring(L.aL, d * 1.3, 0.26); spring(L.aR, d * 1.0, 0.26); // arms swing most
      spring(L.lL, d * 0.65, 0.20); spring(L.lR, d * 0.85, 0.20); // legs less, slight asymmetry
      redraw({ aL: L.aL.a, aR: L.aR.a, lL: L.lL.a, lR: L.lR.a });
      const still = ['aL', 'aR', 'lL', 'lR'].every(k => Math.abs(L[k].a) < 0.008 && Math.abs(L[k].v) < 0.008);
      if (!dragging && Math.abs(vx) < 0.3 && still) { raf = 0; redraw(null); return; }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      const rect = this.els.playScene.getBoundingClientRect();
      const nx = clamp01((e.clientX - rect.left + (this.panX || 0)) / (this.worldW || rect.width));
      const ny = clamp01((e.clientY - rect.top) / rect.height);
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 6) moved = true;
      el.style.left = `${nx * 100}%`; el.style.top = `${ny * 100}%`;
      obj.x = nx; obj.y = ny;
      const dx = e.clientX - lastX; lastX = e.clientX;
      if (redraw) { vx += (dx - vx) * 0.6; el.style.transform = 'translate(-50%, -100%) scale(1.07)'; }
      else { tilt += (Math.max(-20, Math.min(20, -dx * 1.6)) - tilt) * 0.35; putTilt(tilt, 1.08); }
      if (onRemove) {
        const hot = inside(e, bin);
        if (hot !== overBin) { overBin = hot; bin.classList.toggle('hot', hot); }
      }
      if (onCarry) {
        const hot = inside(e, sack);
        if (hot !== overSack) { overSack = hot; sack.classList.toggle('hot', hot); }
      }
    };

    const onUp = () => {
      dragging = false; el.classList.remove('dragging');
      bin.classList.remove('show', 'hot'); sack.classList.remove('show', 'hot');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (overSack && onCarry) { Audio.sfx('powerup'); onCarry(); return; }
      if (overBin && onRemove) { Audio.sfx('pop'); onRemove(); return; }
      persistSave(this.save);
      if (!moved) { el.style.transform = 'translate(-50%, -100%)'; if (redraw) redraw(null); if (onTap) onTap(); return; }
      if (redraw) { el.style.transform = 'translate(-50%, -100%)'; if (!raf) raf = requestAnimationFrame(tick); return; }
      let a = tilt, v = 0; // decor: spring the whole-sprite tilt back
      const settle = () => {
        v += -a * 0.26; v *= 0.80; a += v;
        putTilt(a, 1);
        if (Math.abs(a) > 0.2 || Math.abs(v) > 0.2) requestAnimationFrame(settle);
        else el.style.transform = 'translate(-50%, -100%)';
      };
      requestAnimationFrame(settle);
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); // an item drag must not start a pan
      moved = false; dragging = true; startX = lastX = e.clientX; startY = e.clientY; overBin = overSack = false; vx = 0; tilt = 0;
      el.classList.add('dragging');
      if (onRemove) bin.classList.add('show');
      if (onCarry) sack.classList.add('show');
      if (redraw && !raf) raf = requestAnimationFrame(tick);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // furniture you own but haven't placed; putting something in the bin comes back here
  decorOwnedData() {
    if (!this.save.decorOwned || typeof this.save.decorOwned !== 'object') this.save.decorOwned = {};
    return this.save.decorOwned;
  }

  showDecorCatalog() {
    const panel = this.els.dressPanel; panel.innerHTML = ''; Audio.sfx('click');
    const stock = this.decorOwnedData();
    const lab = document.createElement('div'); lab.className = 'dressLabel';
    lab.textContent = 'DECOR · tap to place · bin sends it back here';
    panel.appendChild(lab);
    const row = document.createElement('div'); row.className = 'dressRow';
    for (const d of DECOR) {
      const have = stock[d.id] || 0;
      const cell = document.createElement('button');
      // owning one means placing is free; otherwise you buy one
      cell.className = 'dressItem' + (have > 0 ? ' sel' : (this.save.emeralds < d.cost ? ' cant' : ''));
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; this.drawSprite(cv, d.sprite); cell.appendChild(cv);
      const cost = document.createElement('div'); cost.className = 'dItemCost';
      cost.innerHTML = have > 0 ? `x${have}` : `<span class="em"></span>${d.cost}`;
      cell.appendChild(cost);
      cell.addEventListener('click', () => this.placeDecor(d.id));
      row.appendChild(cell);
    }
    panel.appendChild(row);
    this._dressClose(panel);
  }

  // place one from your inventory; only buy when you have none left
  placeDecor(id) {
    const def = decorById(id); if (!def) return;
    const stock = this.decorOwnedData();
    if (stock[id] > 0) { stock[id]--; Audio.sfx('click'); }
    else {
      if (this.save.emeralds < def.cost) { Audio.sfx('gate_bad'); return; }
      this.save.emeralds -= def.cost; Audio.sfx('buy');
    }
    // drop it where you're looking, in world coords
    const w = this.worldW || 1, vx = ((this.panX || 0) + (this.sceneW || w) * (0.35 + Math.random() * 0.3)) / w;
    this.decorData().push({ item: id, x: clamp01(vx), y: 0.78 + Math.random() * 0.18 });
    persistSave(this.save);
    this.renderPlayroom(); this.showDecorCatalog();
  }

  // the bin puts furniture BACK in your inventory — nothing you paid for is ever lost
  removeDecor(i) {
    const gone = this.curHouse().decor.splice(i, 1)[0];
    if (gone) {
      const stock = this.decorOwnedData();
      stock[gone.item] = (stock[gone.item] || 0) + 1;
    }
    persistSave(this.save); Audio.sfx('pop');
    this.renderPlayroom();
  }

  showRoomPicker() {
    const panel = this.els.dressPanel; panel.innerHTML = ''; Audio.sfx('click'); this.roomData();
    const native = townById(this.worldData().town).style;
    const cur = this.curHouse().style;
    const lab = document.createElement('div'); lab.className = 'dressLabel'; lab.textContent = 'ROOM STYLE'; panel.appendChild(lab);
    const row = document.createElement('div'); row.className = 'dressRow';
    // the town's own look is free here, then the styles you can buy anywhere
    const options = [{ ...native, cost: 0, free: true }, ...ROOM_TIERS];
    for (const t of options) {
      const owned = t.free || this.save.roomTiersOwned.includes(t.id);
      const cell = document.createElement('button');
      cell.className = 'dressItem' + (cur === t.id ? ' sel' : '') + (!owned && this.save.emeralds < t.cost ? ' cant' : '');
      const sw = document.createElement('div'); sw.className = 'roomSwatch';
      sw.style.background = `linear-gradient(${t.wall} 0%, ${t.wall} 54%, ${t.trim} 54%, ${t.floor} 62%, ${t.floorAlt} 100%)`;
      cell.appendChild(sw);
      const cap = document.createElement('div'); cap.className = 'dItemCost';
      cap.innerHTML = owned ? (cur === t.id ? 'ON' : (t.free ? 'TOWN' : 'OWNED')) : `<span class="em"></span>${t.cost}`;
      cell.appendChild(cap);
      cell.addEventListener('click', () => this.setRoomTier(t.id, t.free));
      row.appendChild(cell);
    }
    panel.appendChild(row);
    this._dressClose(panel);
  }

  setRoomTier(id, free = false) {
    this.roomData();
    if (!free && !this.save.roomTiersOwned.includes(id)) {
      const t = roomTierById(id);
      if (this.save.emeralds < t.cost) { Audio.sfx('gate_bad'); return; }
      this.save.emeralds -= t.cost; this.save.roomTiersOwned.push(id); Audio.sfx('buy');
    } else Audio.sfx('click');
    this.curHouse().style = id; // styles are owned globally, applied per house
    persistSave(this.save);
    this.renderPlayroom(); this.showRoomPicker();
  }

  _dressClose(panel) {
    const close = document.createElement('button'); close.className = 'mcbtn small dressClose'; close.textContent = 'DONE';
    close.addEventListener('click', () => { Audio.sfx('click'); panel.classList.add('hidden'); });
    panel.appendChild(close);
    panel.classList.remove('hidden');
  }

  // take a friend out of this house and carry them; place them in any other house
  pickUpPlaymate(i) {
    const w = this.worldData();
    if (w.carry) return; // one passenger at a time
    w.carry = this.curHouse().people.splice(i, 1)[0];
    persistSave(this.save);
    this.renderPlayroom();
  }

  removePlaymate(i) {
    this.curHouse().people.splice(i, 1);
    persistSave(this.save);
    Audio.sfx('pop');
    this.els.dressPanel.classList.add('hidden');
    this.renderPlayroom();
  }

  openDress(i) {
    const p = this.playmatesData()[i];
    if (!p) return;
    const panel = this.els.dressPanel;
    panel.innerHTML = '';
    Audio.sfx('click');

    const rowFor = (label, items, isSel, drawInto) => {
      const lab = document.createElement('div'); lab.className = 'dressLabel'; lab.textContent = label; panel.appendChild(lab);
      const row = document.createElement('div'); row.className = 'dressRow';
      for (const it of items) {
        const cell = document.createElement('button');
        cell.className = 'dressItem' + (isSel(it) ? ' sel' : '');
        drawInto(cell, it);
        cell.addEventListener('click', () => it.onPick());
        row.appendChild(cell);
      }
      panel.appendChild(row);
    };

    // skins
    rowFor('SKIN', this.ownedSkins().map(s => ({ s, onPick: () => this.setPlaymate(i, 'skin', s.id) })),
      (o) => p.skin === o.s.id,
      (cell, o) => { const cv = document.createElement('canvas'); cv.width = 40; cv.height = 54; this.drawSkinPreview(cv, o.s); cell.appendChild(cv); });

    // hats + capes (owned; 'none' always available)
    for (const cat of ['hat', 'cape']) {
      rowFor(cat.toUpperCase(), this.ownedCos(cat).map(c => ({ c, onPick: () => this.setPlaymate(i, cat, c.id) })),
        (o) => (p.cosmetics[cat] || 'none') === o.c.id,
        (cell, o) => {
          if (o.c.id === 'none') { const n = document.createElement('span'); n.className = 'none'; n.textContent = 'NONE'; cell.appendChild(n); return; }
          if (cat === 'hat' && o.c.sprite && hasSprite(o.c.sprite)) {
            const cv = document.createElement('canvas'); cv.width = 40; cv.height = 42;
            const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
            const hat = getSprite(o.c.sprite); blit(g, hat, 0, 20, 40, (hat.h / hat.w) * 32);
            cell.appendChild(cv); return;
          }
          const sw = document.createElement('div'); sw.className = 'swatch';
          const col = o.c.colors ? (Array.isArray(o.c.colors) ? o.c.colors[0] : o.c.colors.c) : '#7a5a3a';
          sw.style.background = col; cell.appendChild(sw);
        });
    }

    const close = document.createElement('button');
    close.className = 'mcbtn small dressClose'; close.textContent = 'DONE';
    close.addEventListener('click', () => { Audio.sfx('click'); panel.classList.add('hidden'); });
    panel.appendChild(close);
    panel.classList.remove('hidden');
  }

  setPlaymate(i, field, value) {
    const p = this.curHouse().people[i];
    if (!p) return;
    if (field === 'skin') p.skin = value;
    else p.cosmetics[field] = value;
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderPlayroom();
    this.openDress(i); // refresh selection highlights
  }

  // hand the player an actual file instead of asking a kid to copy a wall of text
  downloadSave() {
    const code = exportSave(this.save);
    const name = `craftrush-save-${dayStamp(Date.now())}.txt`;
    try {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.els.setMsg.textContent = `Saved ${name}`;
    } catch {
      this.els.saveExport.classList.remove('hidden'); // fall back to the code
      this.els.setMsg.textContent = 'Could not save a file — copy the code instead.';
    }
  }

  renderBackups() {
    const list = this.els.backupList;
    list.innerHTML = '';
    const backups = listBackups();
    if (!backups.length) {
      const d = document.createElement('div');
      d.className = 'backupEmpty';
      d.textContent = 'No backups yet — one is kept each day you beat a level.';
      list.appendChild(d);
      return;
    }
    for (const b of backups) {
      const row = document.createElement('button');
      row.className = 'backupRow';
      const day = document.createElement('span'); day.className = 'bDay'; day.textContent = b.day;
      const meta = document.createElement('span'); meta.className = 'bMeta';
      meta.textContent = `LV ${b.level} · ${b.emeralds}`;
      row.append(day, meta);
      row.addEventListener('click', () => {
        if (!confirm(`Go back to your ${b.day} save (level ${b.level})? Your current progress will be replaced.`)) return;
        if (restoreBackup(b.day)) { this.els.setMsg.textContent = 'Restored! Reloading…'; setTimeout(() => location.reload(), 700); }
        else this.els.setMsg.textContent = 'That backup could not be read.';
      });
      list.appendChild(row);
    }
  }

  showSettings() {
    this.els.saveExport.value = exportSave(this.save);
    this.els.saveImport.value = '';
    this.els.setMsg.textContent = '';
    this.renderBackups();
    this.openScreen('settings');
    this.paintIcons(this.els.settings);
  }

  // ---- app shell: fixed top bar + bottom nav, one screen at a time ----
  // Each screen declares which tab owns it and what sits above it, so BACK (and a
  // swipe from the left edge) works everywhere without per-screen back buttons.
  static SCREENS = {
    menu:      { tab: 'play',  title: 'CraftRush' },
    shop:      { tab: 'shop',  title: 'Skins & Shop' },
    home:      { tab: 'home',  title: 'Your Village' },
    world:     { tab: 'world', title: 'World' },
    town:      { tab: 'world', title: 'Town', parent: 'world' },
    playroom:  { tab: 'world', title: 'House', parent: 'town' },
    mine:      { tab: 'mine',  title: 'The Mine' },
    more:      { title: 'More', parent: 'menu' },
    about:     { title: 'About', parent: 'more' },
    achScreen: { title: 'Goals', parent: 'more' },
    settings:  { title: 'Save & Data', parent: 'more' },
    result:    { title: 'Results', bare: true },
  };

  // paint every <canvas class="icon" data-icon="..."> from the sprite pack
  paintIcons(root = document) {
    for (const cv of root.querySelectorAll('canvas.icon[data-icon]')) {
      const name = cv.dataset.icon;
      if (!hasSprite(name)) continue;
      const spr = getSprite(name);
      const S = 2; // 2 device px per art px keeps it crisp
      cv.width = spr.w * S; cv.height = spr.h * S;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(spr.frames[0], 0, 0, cv.width, cv.height);
    }
  }

  // each town's card shows a house in that town's own materials, so the map reads
  // as eight different places without eight more sprites
  drawTownIcon(cv, town, unlocked) {
    const S = 2;
    const name = unlocked ? 'ui_house' : 'ui_lock';
    if (!hasSprite(name)) return;
    const st = town.style;
    const pal = unlocked ? { r: st.trim, R: st.trim, w: st.wall, W: st.wallAlt } : null;
    const spr = getSprite(name, pal, unlocked ? `town_${town.id}` : 'town_locked');
    cv.width = spr.w * S; cv.height = spr.h * S;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(spr.frames[0], 0, 0, cv.width, cv.height);
  }

  wireShell() {
    const E = this.els;
    E.navBack.addEventListener('click', () => { Audio.sfx('click'); this.goBack(); });
    E.navMore.addEventListener('click', () => { Audio.sfx('click'); this.openScreen('more'); this.refreshMore(); });
    for (const tab of document.querySelectorAll('.navTab')) {
      tab.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.openTab(tab.dataset.tab); });
    }
    // swipe in from the left edge to go back, the way a phone app behaves
    let sx = 0, sy = 0, tracking = false;
    const stage = document.getElementById('stage');
    stage.addEventListener('pointerdown', (e) => {
      tracking = e.clientX - stage.getBoundingClientRect().left < 28 && !this.inRun();
      sx = e.clientX; sy = e.clientY;
    });
    stage.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      if (e.clientX - sx > 55 && Math.abs(e.clientY - sy) < 45) this.goBack();
    });
  }

  inRun() { return this.game && (this.game.state === 'run' || this.game.state === 'boss'); }

  // a run hides the bars and takes the whole screen
  setPlaying(on) {
    this.screen = on ? 'hud' : this.screen;
    document.getElementById('stage').classList.toggle('playing', !!on);
  }

  openTab(tab) {
    // tapping a tab always returns to that tab's root screen
    const root = Object.entries(UI.SCREENS).find(([, s]) => s.tab === tab && !s.parent);
    if (root) this.openScreen(root[0]);
  }

  // show one screen and sync the bars to it
  openScreen(name) {
    const def = UI.SCREENS[name] || {};
    this.screen = name;
    this.hideAll();
    this.els[name].classList.remove('hidden');
    const E = this.els;
    E.appTitle.textContent = this.screenTitle(name, def);
    E.navBack.classList.toggle('hidden', !def.parent);
    E.barWallet.classList.toggle('hidden', !!def.bare);
    E.navMore.classList.toggle('hidden', !!def.bare);
    E.barEmeralds.textContent = `${this.save.emeralds}`;
    for (const t of document.querySelectorAll('.navTab')) t.classList.toggle('sel', !!def.tab && t.dataset.tab === def.tab);
    this.refreshBadges();
  }

  // a couple of screens name themselves after where you actually are
  screenTitle(name, def) {
    if (name === 'town') return townById(this.worldData().town).name;
    if (name === 'playroom') return `House ${this.worldData().house + 1}`;
    return def.title || 'CraftRush';
  }

  goBack() {
    const def = UI.SCREENS[this.screen] || {};
    if (def.parent) this.openScreen(def.parent);
  }

  refreshMore() {
    const E = this.els;
    E.soundLabel.textContent = this.save.sfx ? 'EFFECTS ON' : 'EFFECTS OFF';
    E.soundLabel.previousElementSibling.dataset.icon = this.save.sfx ? 'ui_sound_on' : 'ui_sound_off';
    E.musicLabel.textContent = this.save.music ? 'MUSIC ON' : 'MUSIC OFF';
    E.musicLabel.previousElementSibling.dataset.icon = this.save.music ? 'ui_sound_on' : 'ui_sound_off';
    E.cameraLabel.textContent = `CAMERA: ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    this.paintIcons(E.more);
  }

  refreshBadges() {
    const E = this.els;
    if (E.navDotHome) E.navDotHome.classList.toggle('hidden', this.homePending() <= 0);
    if (E.navDotMine) E.navDotMine.classList.toggle('hidden', mineEnergy(this.mineData(), Date.now()) < MINE.energyCap);
  }

  hideAll() {
    for (const k of ['menu', 'shop', 'result', 'hud', 'pause', 'achScreen', 'settings', 'home', 'mine', 'playroom', 'world', 'town', 'more', 'about']) this.els[k].classList.add('hidden');
    this.els.bossBar.classList.add('hidden');
    // clear cached HUD values so the next run repaints from scratch
    this._bossShown = false;
    this._prog = this._fill = this._glabel = this._chips = this._em = this._lv = this._bossHint = this._ready = null;
  }

  showMenu() {
    this.game.paused = false;
    this.setPlaying(false);
    this.game.state = 'menu';
    this.refreshMenu();
    this.openScreen('menu');
    if (this.save.sound) Audio.music('menu');
  }

  refreshMenu() {
    const E = this.els;
    const biome = BIOMES[(this.save.level - 1) % BIOMES.length];
    E.menuLevel.textContent = `LV ${this.save.level} · ${biome.name.toUpperCase()}`;
    E.menuEmeralds.textContent = `${this.save.emeralds}`;
    E.modeShooter.classList.toggle('sel', this.save.mode === 'shooter');
    E.modeGates.classList.toggle('sel', this.save.mode === 'gates');
    E.modeDesc.textContent = MODES[this.save.mode].desc;
    this.refreshBadges(); // the "come back" dots live on the nav bar now
    this.refreshExpedition();
  }

  refreshExpedition() {
    const E = this.els;
    const exp = dailyExpedition();
    const st = expeditionStatus(this.save);
    E.expName.textContent = exp.name;
    E.expDesc.textContent = exp.desc + ' (new expedition every week)';
    E.expStreak.textContent = st.streak > 0 ? `${st.streak} DAY STREAK` : '';
    E.btnExpedition.textContent = st.doneToday ? '↻ REPLAY EXPEDITION' : '▶ START EXPEDITION';
    const g = E.expIcon.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 40, 40);
    this.drawIcon(g, exp.icon, 40, 34);
  }

  // ---------- shop ----------
  showShop(from = 'menu') {
    this.returnTo = from;
    this.openScreen('shop');
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
    tag.innerHTML = selected ? 'PICKED' : owned ? 'OWNED' : `<span class="em"></span> ${cost}`;
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

    this._section(grid, 'SKINS');
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

    const CAT_LABELS = { cape: 'CAPES', hat: 'HATS', trail: 'ARROW TRAILS', pet: 'PETS' };
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
    this.openScreen('achScreen');
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
      mark.textContent = got ? 'DONE' : 'LOCKED';
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
    if (this._fill !== fill) { this._fill = fill; E.golemFill.style.width = fill; }
    const ready = pct >= 1;
    if (this._ready !== ready) { this._ready = ready; E.golemMeter.classList.toggle('ready', ready); }
    const glabel = ready ? 'GOLEM INCOMING!' : `GOLEM ${Math.floor(pct * 100)}%`;
    if (this._glabel !== glabel) { this._glabel = glabel; E.golemLabel.textContent = glabel; }
    // powerups
    const chips = [];
    if (s.power.triple > 0) chips.push(`3× ${Math.ceil(s.power.triple)}s`);
    if (s.power.rapid > 0) chips.push(`RAPID ${Math.ceil(s.power.rapid)}s`);
    if (s.power.power > 0) chips.push(`POWER ${Math.ceil(s.power.power)}s`);
    if (s.power.sword > 0) chips.push(`SWORD ${Math.ceil(s.power.sword)}s`);
    if (s.power.axe > 0) chips.push(`AXE ${Math.ceil(s.power.axe)}s`);
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

    E.resultTitle.textContent = r.win ? (isExp ? 'EXPEDITION DONE!' : 'VICTORY!') : 'CROWD WIPED OUT';
    E.resultTitle.className = r.win ? 'win' : 'lose';
    E.resultStats.innerHTML = '';
    const rows = [
      ...(isExp ? [[r.expedition.name, r.win ? 'CLEARED!' : 'failed']] : []),
      ['<span class="em"></span> Emeralds earned', `+${earned}`],
      ...(r.win && !isExp ? [['Victory bonus', `+${r.bonus}`]] : []),
      ...(expFirst && r.emeraldMul > 1 ? [['Expedition bonus', `${r.emeraldMul}× emeralds`]] : []),
      ...(streakBonus > 0 ? [[`Day ${streak} streak`, `+${streakBonus}`]] : []),
      ...(r.rods > 0 ? [['Blaze rods', `+${r.rods}`]] : []),
      ...(isExp && !expFirst && r.win ? [['↻ Replay', 'base reward only']] : []),
      ['Biggest crowd', `${r.bestCrowd}`],
      ...(r.mode === 'shooter' ? [[' Mobs blasted', `${r.kills}`]] : []),
      ...(isExp ? [] : [[' ' + r.biome, r.win ? 'CLEARED!' : 'try again!']]),
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
    // clearing a level snapshots the day, overwriting any earlier one, so there is
    // always a recent point to go back to without the list growing
    if (r.win) writeBackup(this.save);
    this.grantAchievements();
  }

  // ---------- toasts ----------
  toast(kind) {
    const T = this.els.toast;
    clearTimeout(this._toastTimer);
    if (!kind) { T.classList.add('hidden'); return; }
    T.textContent = kind === 'steer' ? 'DRAG ANYWHERE TO STEER!' : 'GOLEM CHARGED — HERE IT COMES!';
    T.classList.remove('hidden');
    if (kind === 'steer') persistSave(this.save);
    this._toastTimer = setTimeout(() => T.classList.add('hidden'), 3500);
  }
}
