// The app shell: the fixed top bar, the bottom nav, and the one-screen-at-a-time
// stack everything else lives inside. openScreen is the spine, and it rebuilds a
// screen on EVERY entry, which is what stops a back or a tab showing a stale price.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { getSprite, hasSprite } from '../assets.js';
import { Audio } from '../audio.js';
import { BIOMES, CAMERAS, CAMPAIGN, MINE, RESOURCES, chapterMissing, currentChapter, dailyExpedition, expeditionStatus, mineEnergy, speedById, townById } from '../config.js';

// Every screen the app can show: which tab owns it, what the bar says, who it
// goes back to, and what to re-run on entry. That last field is the fix for
// screens showing stale prices after a back or a tab switch.
export const SCREENS = {
  menu:      { tab: 'play',  title: 'CraftRush', refresh: 'refreshMenu' },
  shop:      { tab: 'shop',  title: 'Skins & Shop', refresh: 'buildShop' },
  home:      { tab: 'home',  title: 'Your Village', refresh: 'renderHome' },
  world:     { tab: 'world', title: 'World', refresh: 'renderWorld' },
  playroom:  { tab: 'world', title: 'House', parent: 'world', refresh: 'renderPlayroom' },
  mine:      { tab: 'mine',  title: 'The Mine', refresh: 'renderMine' },
  more:      { title: 'More', parent: 'menu', refresh: 'refreshMore' },
  about:     { title: 'About', parent: 'more' },
  achScreen: { title: 'Goals', parent: 'more', refresh: 'buildAchievements' },
  settings:  { title: 'Save & Data', parent: 'more', refresh: 'renderBackups' },
  result:    { title: 'Results', bare: true },
};

export const ShellMixin = {
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
  },
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
  },
  wireShell() {
    const E = this.els;
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
  },
  inRun() { return this.game && (this.game.state === 'run' || this.game.state === 'boss'); },
  // a run hides the bars and takes the whole screen
  setPlaying(on) {
    this.screen = on ? 'hud' : this.screen;
    document.getElementById('stage').classList.toggle('playing', !!on);
  },
  // Tapping a tab goes to that tab's root screen THROUGH its show method — those
  // build the screen's contents, so routing straight to openScreen left them blank.
  openTab(tab) {
    if (tab === 'play') { if (this.canGoBack()) { this.goBack(); return; } this.showMenu(); return; }
    if (tab === 'shop') return this.showShop('menu');
    if (tab === 'home') return this.showHome();
    if (tab === 'world') return this.showWorld();
    if (tab === 'mine') return this.showMine();
  },
  canGoBack() { return !!(SCREENS[this.screen] || {}).parent; },
  // show one screen and sync the bars to it
  openScreen(name) {
    const def = SCREENS[name] || {};
    this.screen = name;
    this.hideAll();
    this.els[name].classList.remove('hidden');
    const E = this.els;
    E.appTitle.textContent = this.screenTitle(name, def);
    E.barWallet.classList.toggle('hidden', !!def.bare);
    E.navMore.classList.toggle('hidden', !!def.bare);
    E.barEmeralds.textContent = `${this.save.emeralds}`;
    for (const t of document.querySelectorAll('.navTab')) t.classList.toggle('sel', !!def.tab && t.dataset.tab === def.tab);
    // the first tab doubles as BACK once you're deeper than a tab root, so there's
    // one obvious way out and nothing to hunt for in the corner
    const back = !!def.parent;
    E.tabPlayIcon.dataset.icon = back ? 'ui_back' : 'ui_play';
    E.tabPlayLabel.textContent = back ? 'Back' : 'Play';
    this.paintIcons(E.navbar);
    this.refreshBadges();
    // rebuild the screen's contents on EVERY entry, so a back or a tab never shows
    // a stale price, balance, or list
    if (def.refresh && typeof this[def.refresh] === 'function') this[def.refresh]();
  },
  // a couple of screens name themselves after where you actually are
  screenTitle(name, def) {
    if (name === 'town') return townById(this.worldData().town).name;
    if (name === 'playroom') return `House ${this.worldData().house + 1}`;
    return def.title || 'CraftRush';
  },
  goBack() {
    const def = SCREENS[this.screen] || {};
    if (def.parent) this.openScreen(def.parent);
  },
  refreshMore() {
    const E = this.els;
    E.soundLabel.textContent = this.save.sfx ? 'EFFECTS ON' : 'EFFECTS OFF';
    E.soundLabel.previousElementSibling.dataset.icon = this.save.sfx ? 'ui_sound_on' : 'ui_sound_off';
    const pace = speedById(this.save.speed);
    E.speedLabel.textContent = `PACE: ${pace.label} · ${pace.rewardMul}x REWARD`;
    E.musicLabel.textContent = this.save.music ? 'MUSIC ON' : 'MUSIC OFF';
    E.musicLabel.previousElementSibling.dataset.icon = this.save.music ? 'ui_sound_on' : 'ui_sound_off';
    E.cameraLabel.textContent = `CAMERA: ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    this.paintIcons(E.more);
  },
  refreshBadges() {
    const E = this.els;
    if (E.navDotHome) E.navDotHome.classList.toggle('hidden', this.homePending() <= 0);
    if (E.navDotMine) E.navDotMine.classList.toggle('hidden', mineEnergy(this.mineData(), Date.now()) < MINE.energyCap);
  },
  hideAll() {
    for (const k of ['menu', 'shop', 'result', 'hud', 'pause', 'achScreen', 'settings', 'home', 'mine', 'playroom', 'world', 'more', 'about']) this.els[k].classList.add('hidden');
    this.els.bossBar.classList.add('hidden');
    // clear cached HUD values so the next run repaints from scratch
    this._bossShown = false;
    this._prog = this._fill = this._glabel = this._chips = this._em = this._lv = this._bossHint = this._ready = null;
  },
  showMenu() {
    this.game.paused = false;
    this.setPlaying(false);
    this.game.state = 'menu';
    this.refreshMenu();
    this.openScreen('menu');
    if (this.save.sound) Audio.music('menu');
  },
  refreshMenu() {
    const E = this.els;
    const biome = BIOMES[(this.save.level - 1) % BIOMES.length];
    E.menuLevel.textContent = `LV ${this.save.level} · ${biome.name.toUpperCase()}`;
    E.cardShooter.classList.toggle('sel', this.save.mode === 'shooter');
    E.cardGates.classList.toggle('sel', this.save.mode === 'gates');
    this.refreshBadges(); // the "come back" dots live on the nav bar now
    this.refreshQuest();
    this.refreshExpedition();
    this.fitMenu();
    // the first paint of a boot can measure before the shell has its real height,
    // so take the decision again once the browser has actually laid the page out
    requestAnimationFrame(() => this.fitMenu());
  },
  // The quest card names the chapter the next START will actually play, so the
  // campaign is something you can see yourself walking through.
  // The menu must never scroll. What is on it changes (a quest card, a replay
  // button), so instead of guessing a breakpoint we measure and step down
  // through the compact tiers until the panel fits the screen it is on.
  fitMenu() {
    const m = this.els.menu;
    const panel = m.querySelector('.panel');
    if (!panel || m.classList.contains('hidden')) return;   // nothing to measure while hidden
    m.classList.remove('compact', 'tight');
    const spills = () => panel.scrollHeight - panel.clientHeight > 1;
    if (!spills()) return;
    m.classList.add('compact');
    if (!spills()) return;
    m.classList.add('tight');
  },
  refreshQuest() {
    const E = this.els;
    const done = (this.save.campaign && this.save.campaign.done) || [];
    const ch = currentChapter(this.save);
    E.questCard.classList.remove('hidden');
    E.btnQuestReplay.classList.toggle('hidden', !!ch);
    if (!ch) {                                    // the whole chain is behind you
      E.questStep.textContent = `${done.length} OF ${CAMPAIGN.length}`;
      E.questName.textContent = 'QUEST COMPLETE';
      E.questDesc.textContent = 'The dragon, the wither, all of it. Nothing left to beat.';
      E.questNeed.textContent = '';
      const gc = E.questIcon.getContext('2d');
      gc.imageSmoothingEnabled = false;
      gc.clearRect(0, 0, 40, 40);
      this.drawIcon(gc, 'ui_trophy', 40, 34);
      return;
    }
    E.questStep.textContent = `${done.length} OF ${CAMPAIGN.length}`;
    E.questName.textContent = ch.name.toUpperCase();
    E.questDesc.textContent = ch.blurb;

    // if you are back on a gathering run, say plainly what it is buying you
    const next = CAMPAIGN.find((c) => !done.includes(c.id));
    const missing = next && next.id !== ch.id ? chapterMissing(this.save, next.id) : null;
    E.questNeed.textContent = missing
      ? `Need ${Object.entries(missing).map(([k, n]) => `${n} more ${RESOURCES[k].label}`).join(', ')} for ${next.name}.`
      : '';

    const g = E.questIcon.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 40, 40);
    this.drawIcon(g, ch.icon, 40, 34);
  },
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
  },
};
