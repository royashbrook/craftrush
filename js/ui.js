// The UI class: what it owns, how it boots, and how the screens hang together.
// Each screen lives in js/ui/<name>.js as a mixin over this prototype, the same
// way the game composes its own halves, so `this` means the same thing
// everywhere and no screen has to be handed a pile of dependencies.
//
// Game world stays on canvas; chrome lives in DOM for crisp text and fat touch
// targets.
import { SKINS, MODES, BIOMES, CAMERAS, COSMETICS, VERSION, VILLAGERS, HOME, villagerCost, homeIncomeRate, pendingIdle, MINE, PICKAXES, mineEnergy, pickaxeDmg, nextPickaxe, tileById, clamp01, questCosmeticEarned, DECOR, decorById, ROOM_TIERS, roomTierById, SPEEDS, speedById, CAMPAIGN, currentChapter, chapterMissing, completeChapter, RESOURCES, TOWNS, townById, MAX_HOUSES, housePrice, makeHouse, styleById, migrateWorld, townPop, townHasRoom, worldIncomeRate, pendingIdleWorld, dailyExpedition, expeditionStatus, recordExpedition, persistSave, exportSave, importSave, resetSave, writeBackup, listBackups, restoreBackup, dayStamp } from './config.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { getSprite, blit, hasSprite } from './assets.js';
import { TownScene } from './townscene.js';
import { MineWorld } from './minegame.js';
import { Audio } from './audio.js';

import { AchievementsMixin } from './ui/achievements.js';
import { HudMixin } from './ui/hud.js';
import { MineMixin } from './ui/mine.js';
import { PauseMixin } from './ui/pause.js';
import { PlayroomMixin } from './ui/playroom.js';
import { ResultMixin } from './ui/result.js';
import { SettingsMixin } from './ui/settings.js';
import { ShellMixin, SCREENS } from './ui/shell.js';
import { ShopMixin } from './ui/shop.js';
import { ToastMixin } from './ui/toast.js';
import { VillageMixin } from './ui/village.js';
import { WorldMixin } from './ui/world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  static SCREENS = SCREENS;   // kept on the class: it reads as part of the UI's shape

  constructor(game, save) {
    this.game = game;
    this.save = save;
    this.els = {
      menu: $('menu'), shop: $('shop'), result: $('result'), hud: $('hud'),
      menuLevel: $('menuLevel'),
      questCard: $('questCard'), questStep: $('questStep'), questIcon: $('questIcon'),
      questName: $('questName'), questDesc: $('questDesc'), questNeed: $('questNeed'),
      btnQuestReplay: $('btnQuestReplay'),
      btnPlayShooter: $('btnPlayShooter'), btnPlayGates: $('btnPlayGates'),
      cardShooter: $('cardShooter'), cardGates: $('cardGates'),
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
      world: $('world'), townCanvas: $('townCanvas'), townPrev: $('townPrev'), townNext: $('townNext'),
      townDots: $('townDots'), worldTownName: $('worldTownName'), worldTownSub: $('worldTownSub'),
      btnTownAction: $('btnTownAction'),
      town: $('town'), townTitle: $('townTitle'), townEmeralds: $('townEmeralds'), townHint: $('townHint'),
      houseGrid: $('houseGrid'), btnBuyHouse: $('btnBuyHouse'), mineBadge: $('mineBadge'), mine: $('mine'), mineEmeralds: $('mineEmeralds'),
      mineStats: $('mineStats'), energyBar: $('energyBar'), energyText: $('energyText'),
      mineCanvas: $('mineCanvas'), mineBag: $('mineBag'), btnSellOre: $('btnSellOre'),
      btnPickUp: $('btnPickUp'), settings: $('settings'), saveExport: $('saveExport'),
      saveImport: $('saveImport'), btnCopySave: $('btnCopySave'), btnLoadSave: $('btnLoadSave'),
      btnReset: $('btnReset'), setMsg: $('setMsg'),
      // app shell
      appbar: $('appbar'), appTitle: $('appTitle'), navMore: $('navMore'),
      tabPlayIcon: $('tabPlayIcon'), tabPlayLabel: $('tabPlayLabel'),
      barWallet: $('barWallet'), barEmeralds: $('barEmeralds'), navbar: $('navbar'),
      navDotHome: $('navDotHome'), navDotMine: $('navDotMine'),
      more: $('more'), about: $('about'), aboutVersion: $('aboutVersion'),
      btnGoals: $('btnGoals'), btnCameraMore: $('btnCameraMore'), btnSoundMore: $('btnSoundMore'),
      btnSaveMore: $('btnSaveMore'), btnAbout: $('btnAbout'),
      cameraLabel: $('cameraLabel'), soundLabel: $('soundLabel'),
      btnSpeedMore: $('btnSpeedMore'), speedLabel: $('speedLabel'),
      btnMusicMore: $('btnMusicMore'), musicLabel: $('musicLabel'),
      btnDownloadSave: $('btnDownloadSave'), backupList: $('backupList'),
      btnForceUpdate: $('btnForceUpdate'),
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
    E.btnPlayShooter.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.setMode('shooter'); this.startRun(); });
    E.btnPlayGates.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.setMode('gates'); this.startRun(); });
    E.btnExpedition.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.startExpedition(); });
    E.btnQuestReplay.addEventListener('click', () => { Audio.unlock(); Audio.sfx('click'); this.replayChapter('credits'); });
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
    E.btnSpeedMore.addEventListener('click', () => {
      Audio.sfx('click');
      const ids = SPEEDS.map((x) => x.id);
      this.save.speed = ids[(ids.indexOf(this.save.speed || 'normal') + 1) % ids.length];
      persistSave(this.save);
      this.refreshMore();
    });
    E.btnDownloadSave.addEventListener('click', () => { Audio.sfx('click'); this.downloadSave(); });
    E.btnForceUpdate.addEventListener('click', () => { Audio.sfx('click'); this.forceUpdate(); });
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

  // ---- app shell: fixed top bar + bottom nav, one screen at a time ----
  // Each screen declares which tab owns it and what sits above it, so BACK (and a
  // swipe from the left edge) works everywhere without per-screen back buttons.

}

Object.assign(UI.prototype,
  AchievementsMixin,
  HudMixin,
  MineMixin,
  PauseMixin,
  PlayroomMixin,
  ResultMixin,
  SettingsMixin,
  ShellMixin,
  ShopMixin,
  ToastMixin,
  VillageMixin,
  WorldMixin);
