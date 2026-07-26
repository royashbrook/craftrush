// Boot: load the art, wire the game to the UI, run the loop, register the worker.
//
// The order matters in one non-obvious way. The save is a $state proxy created
// in the store, and the Game is handed THAT proxy rather than a plain object.
// So when a run banks emeralds or finishes a chapter, every screen showing those
// numbers updates on its own. It is why the old refresh-on-entry machinery is
// gone rather than rewritten.
import { mount } from 'svelte';
import { initAssets, getSprite } from '../js/assets.js';
import { VERSION, persistSave } from '../js/config.js';
import { checkAchievements } from '../js/achievements.js';
import { Game } from '../js/game.js';
import { Audio } from '../js/audio.js';
import { save, nav, toast, commit, togglePause, initHistory } from './lib/store.svelte.js';
import App from './App.svelte';
import './app.css';

const RES_W = 430; // internal logical width; height derived from viewport aspect

async function boot() {
  await initAssets();

  Audio.setEnabled(save.sound);
  Audio.setMusic(save.music !== false);
  Audio.setSfx(save.sfx !== false);

  // currency icon: bake the emerald sprite into a CSS var so name and icon agree
  try {
    const em = getSprite('emerald');
    document.documentElement.style.setProperty('--em-icon', `url(${em.frames[0].toDataURL()})`);
  } catch { /* art missing: chips just show the count */ }

  const canvas = document.getElementById('gameCanvas');
  const game = new Game(canvas, save, {
    // hudState() deliberately reuses ONE object to stay allocation-free at 15Hz.
    // Assigning that same reference would never look like a change, so the HUD
    // would render once and then freeze. Copy it, including the nested boss.
    onHud: (s) => { nav.hud = { ...s, boss: { ...s.boss } }; },
    onRunEnd: (r) => { nav.playing = false; nav.paused = false; nav.result = r; },
    onTutorial: (k) => toast(k),
    onPause: () => { if (nav.playing) togglePause(); },
  });

  // back-fill achievements a returning player already earned, silently
  checkAchievements(save);
  persistSave(save);

  mount(App, { target: document.getElementById('app'), props: { game } });
  initHistory();   // the system back gesture walks the screen stack

  // auto-pause when the tab is hidden so runs do not die in the background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (game.state === 'run' || game.state === 'boss') && !game.paused) {
      game.paused = true;
      togglePause(true);
    }
  });

  const stage = document.getElementById('stage');
  function fit() {
    const vv = window.visualViewport;
    // The VISUAL viewport is the part actually on screen: it already excludes
    // browser chrome (Safari's toolbar) and tracks it sliding in and out.
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const phone = vw / vh <= 0.68;
    stage.classList.toggle('fullscreen', phone);
    if (phone) {
      // CSS (100dvh) owns the size here. Pinning to the visual viewport was wrong
      // in an installed PWA: it reports the area INSIDE the safe areas, so the
      // stage stopped short of the physical bottom and left a band under the nav.
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
  window.addEventListener('orientationchange', fit);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit); // offsetTop shifts as chrome moves
  }

  // audio needs a user gesture
  const unlock = () => { Audio.unlock(); if (game.state === 'menu' && save.sound) Audio.music('menu'); };
  document.addEventListener('pointerdown', unlock, { once: true });

  document.getElementById('loading')?.remove();

  window.CR = { game, save, nav, commit, togglePause }; // debug/testing handle

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!game.paused && !window.CR.paused) game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Dev deliberately has no service worker. It is the single biggest source of
  // "I edited it and nothing changed", and vite already serves fresh modules.
  const wantSW = typeof import.meta.env === 'undefined' ? true : import.meta.env.PROD;
  if (wantSW && 'serviceWorker' in navigator
      && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // A new deploy activates immediately, but THIS page keeps running the JS it
    // booted with. Whether a worker was already driving the page has to be
    // captured NOW: by the time controllerchange fires there is always one, so
    // checking it then would reload on a first install too.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
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
