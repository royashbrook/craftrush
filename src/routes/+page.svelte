<!--
  The whole game. One page, because the game has no URLs: what you are looking
  at is a screen in a stack, not a route, and the back gesture walks that stack
  from the store rather than from history entries per screen.

  Boot order matters in one non-obvious way. The save is a $state proxy created
  in the store, and the Game is handed THAT proxy rather than a plain object. So
  when a run banks emeralds or finishes a chapter, every screen showing those
  numbers updates on its own.
-->
<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { pushState } from '$app/navigation';
  import { dev } from '$app/environment';
  import { initAssets, getSprite, assetsReady } from '../../js/assets.js';
  import { persistSave } from '../../js/config.js';
  import { checkAchievements } from '../../js/achievements.js';
  import { Game } from '../../js/game.js';
  import { Audio } from '../../js/audio.js';
  import { save, nav, toast, commit, togglePause, initHistory } from '../lib/store.svelte.js';
  import App from '../App.svelte';

  const RES_W = 430; // internal logical width; height derived from viewport aspect

  let canvas = $state(null);
  let stage = $state(null);
  let game = $state(null);
  let failed = $state('');

  onMount(() => {
    let stop = () => {};
    (async () => {
      await initAssets();

      Audio.setEnabled(save.sound);
      Audio.setMusic(save.music !== false);
      Audio.setSfx(save.sfx !== false);

      // currency icon: bake the emerald sprite into a CSS var so name and icon agree
      try {
        const em = getSprite('emerald');
        document.documentElement.style.setProperty('--em-icon', `url(${em.frames[0].toDataURL()})`);
      } catch { /* art missing: chips just show the count */ }

      const g = new Game(canvas, save, {
        // hudState() reuses ONE object every frame to stay allocation-free, so
        // assigning that reference would never look like a change and the HUD
        // would render once and freeze. Copy it, nested boss included.
        onHud: (s) => { nav.hud = { ...s, boss: { ...s.boss } }; },
        onRunEnd: (r) => { nav.playing = false; nav.paused = false; nav.result = r; },
        onTutorial: (k) => toast(k),
        onPause: () => { if (nav.playing) togglePause(); },
      });

      // back-fill achievements a returning player already earned, silently
      checkAchievements(save);
      persistSave(save);

      game = g;
      initHistory(pushState);   // the system back gesture walks the screen stack

      const onVisibility = () => {
        if (document.hidden && (g.state === 'run' || g.state === 'boss') && !g.paused) {
          g.paused = true;
          togglePause(true);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      function fit() {
        const vv = window.visualViewport;
        // The VISUAL viewport is the part actually on screen: it already excludes
        // browser chrome (Safari's toolbar) and tracks it sliding in and out.
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        const phone = vw / vh <= 0.68;
        stage.classList.toggle('fullscreen', phone);
        if (phone) {
          // CSS (100dvh) owns the size here. Pinning to the visual viewport was
          // wrong in an installed PWA: it reports the area INSIDE the safe areas,
          // so the stage stopped short of the bottom and left a band under the nav.
          stage.style.width = ''; stage.style.height = '';
        } else {
          stage.style.width = `${Math.round(vh * 0.58)}px`;
          stage.style.height = `${vh}px`;
        }
        const r = stage.getBoundingClientRect();
        const resH = Math.min(1000, Math.round(RES_W * (r.height / Math.max(1, r.width))));
        g.resize(RES_W, resH);
      }
      fit();
      window.addEventListener('resize', fit);
      window.addEventListener('orientationchange', fit);
      window.visualViewport?.addEventListener('resize', fit);
      window.visualViewport?.addEventListener('scroll', fit); // offsetTop shifts as chrome moves

      // audio needs a user gesture
      const unlock = () => { Audio.unlock(); if (g.state === 'menu' && save.sound) Audio.music('menu'); };
      document.addEventListener('pointerdown', unlock, { once: true });

      // debug/testing handle. assetsReady is here because the e2e suite runs
      // against the BUILT output too, where js/assets.js is bundled and cannot
      // be imported by path.
      window.CR = { game: g, save, nav, commit, togglePause, assetsReady };

      let raf = 0, last = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!g.paused && !window.CR.paused) g.update(dt);
        g.render();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      // Dev deliberately gets no service worker. It is the single biggest source
      // of "I edited it and nothing changed", and vite already serves fresh
      // modules. In production this is registered by hand rather than by
      // SvelteKit, so that rule lives in one visible place.
      if (!dev && 'serviceWorker' in navigator
          && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'module' }).catch(() => {});
        // A new deploy activates immediately, but THIS page keeps running the JS
        // it booted with. Whether a worker was already driving the page has to be
        // captured NOW: by the time controllerchange fires there is always one,
        // so checking it then would reload on a first install too.
        const hadController = !!navigator.serviceWorker.controller;
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading || !hadController) return;
          reloading = true;
          location.reload();
        });
      }

      stop = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('resize', fit);
        window.removeEventListener('orientationchange', fit);
        window.visualViewport?.removeEventListener('resize', fit);
        window.visualViewport?.removeEventListener('scroll', fit);
      };
    })().catch((e) => {
      failed = e.message;
      console.error(e);
    });
    return () => stop();
  });
</script>

<div id="stage" bind:this={stage}>
  <canvas id="gameCanvas" bind:this={canvas}></canvas>
  {#if game}
    <App {game} />
  {:else}
    <div id="loading">{failed ? `FAILED TO LOAD: ${failed}` : 'LOADING…'}</div>
  {/if}
</div>
