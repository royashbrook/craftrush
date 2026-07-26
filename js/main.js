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
    const vv = window.visualViewport;
    // The VISUAL viewport is the part actually on screen: it already excludes
    // browser chrome (Safari's toolbar) and tracks it sliding in and out. Pinning
    // the stage to it is what puts the bottom nav on the real bottom edge; CSS
    // units and innerHeight both left a chrome-sized black gap underneath.
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const phone = vw / vh <= 0.68;
    stage.classList.toggle('fullscreen', phone);
    if (phone) {
      // CSS (100dvh) owns the size here. Pinning to the visual viewport was wrong in
      // an installed PWA: it reports the area INSIDE the safe areas, so the stage
      // stopped short of the physical bottom and left a band under the nav.
      stage.style.left = ''; stage.style.top = '';
      stage.style.width = ''; stage.style.height = '';
    } else {
      stage.style.left = ''; stage.style.top = '';
      stage.style.width = Math.round(vh * 0.58) + 'px';
      stage.style.height = vh + 'px';
    }
    const r = stage.getBoundingClientRect();
    const resH = Math.min(1000, Math.round(RES_W * (r.height / Math.max(1, r.width))));
    game.resize(RES_W, resH);
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('resize', () => ui && ui.fitMenu());   // the menu re-fits when the screen does
  window.addEventListener('orientationchange', fit);
  // the visual viewport changes as mobile browser chrome collapses; keep up with it
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit); // offsetTop shifts as chrome moves
  }

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
    // A new deploy activates immediately (the worker calls skipWaiting + claim),
    // but THIS page keeps running the JS it booted with, so it would keep showing
    // the previous build until the app was fully killed. Reload once when a new
    // worker takes over. Guarded so a first install (no prior controller) and
    // repeat events can't loop.
    // Whether a worker was already driving this page must be captured NOW: by the
    // time controllerchange fires there is always a controller, so checking it
    // then would reload on a first install too.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return; // first install: nothing to refresh
      reloading = true;
      location.reload();
    });
  }
}

boot().catch((e) => {
  const el = document.getElementById('loading');
  if (el) el.textContent = 'FAILED TO LOAD: ' + e.message;
  console.error(e);
});
