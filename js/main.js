// Boot: load assets, wire game+UI, run the loop, register the service worker.
import { initAssets } from './assets.js';
import { loadSave } from './config.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';

const RES_W = 430; // internal logical width; height derived from viewport aspect

async function boot() {
  await initAssets();

  const save = loadSave();
  Audio.setEnabled(save.sound);

  const canvas = document.getElementById('gameCanvas');
  let ui = null;
  const game = new Game(canvas, save, {
    onHud: (s) => ui && ui.updateHud(s),
    onRunEnd: (r) => ui && ui.showResult(r),
    onTutorial: (k) => ui && ui.toast(k),
    onPause: () => ui && ui.togglePause(),
  });
  ui = new UI(game, save);

  // auto-pause when the tab is hidden so runs don't die in the background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (game.state === 'run' || game.state === 'boss') && !game.paused) {
      ui.openPause();
    }
  });

  const stage = document.getElementById('stage');
  function fit() {
    const aw = window.innerWidth, ah = window.innerHeight;
    let cssW, cssH;
    if (aw / ah <= 0.68) { cssW = aw; cssH = ah; }        // phone portrait: fullscreen
    else { cssH = ah; cssW = Math.round(ah * 0.58); }     // desktop/landscape: centered column
    stage.style.width = cssW + 'px';
    stage.style.height = cssH + 'px';
    const resH = Math.min(1000, Math.round(RES_W * (cssH / cssW)));
    game.resize(RES_W, resH);
  }
  fit();
  window.addEventListener('resize', fit);

  // audio needs a user gesture
  const unlock = () => { Audio.unlock(); if (game.state === 'menu' && save.sound) Audio.music('menu'); };
  document.addEventListener('pointerdown', unlock, { once: true });

  document.getElementById('loading').remove();

  window.CR = { game, ui, save }; // debug/testing handle

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!game.paused && !window.CR.paused) game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((e) => {
  const el = document.getElementById('loading');
  if (el) el.textContent = 'FAILED TO LOAD: ' + e.message;
  console.error(e);
});
