// Pausing, and the settings hanging off it: sound, music, camera and pace.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { Audio } from '../audio.js';
import { CAMERAS, dailyExpedition, persistSave } from '../config.js';

export const PauseMixin = {
  // ---------- pause ----------
  openPause() {
    if (this.game.state !== 'run' && this.game.state !== 'boss') return;
    this.game.paused = true;
    Audio.stopMusic(); // don't let the sequencer pile up notes while hidden/paused
    this.refreshPause();
    this.els.pause.classList.remove('hidden');
  },
  closePause() {
    this.game.paused = false;
    this.els.pause.classList.add('hidden');
    if (this.save.sound) Audio.music(this.game.state === 'boss' ? 'boss' : 'run');
  },
  // Escape key: toggle pause during a run; ignore on other screens
  togglePause() {
    if (this.game.state !== 'run' && this.game.state !== 'boss') return;
    if (this.game.paused) { Audio.sfx('click'); this.closePause(); }
    else { Audio.sfx('click'); this.openPause(); }
  },
  refreshPause() {
    this.els.btnPauseCamera.textContent = `CAMERA: ${(CAMERAS[this.save.camera] || CAMERAS.far).label}`;
    this.els.btnPauseSound.textContent = this.save.sound ? 'ALL SOUND ON' : 'ALL SOUND OFF';
  },
  back() {
    if (this.returnTo === 'pause') { this.hideAll(); this.els.hud.classList.remove('hidden'); this.openPause(); }
    else this.showMenu();
  },
  setMode(mode) {
    Audio.sfx('click');
    this.save.mode = mode;
    persistSave(this.save);
    this.refreshMenu();
  },
  startRun() {
    this.hideAll();
    this.els.hud.classList.remove('hidden');
    this.setPlaying(true);
    this.game.startRun();
    this.toast(null);
  },
  // the chain is finished, but the walk home is worth walking again
  replayChapter(id) {
    this.hideAll();
    this.els.hud.classList.remove('hidden');
    this.setPlaying(true);
    this.game.startRun(null, id);
    this.toast(null);
  },
  startExpedition() {
    this.hideAll();
    this.els.hud.classList.remove('hidden');
    this.setPlaying(true);
    this.game.startRun(dailyExpedition());
    this.toast(null);
  },
};
