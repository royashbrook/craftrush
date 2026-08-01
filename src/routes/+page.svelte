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
  import { persistSave, THEME_ERROR } from '../../js/config.js';
  import { finishRunSettlement } from '../../js/settlement.js';
  import { checkAchievements } from '../../js/achievements.js';
  import { updateReloadIsSafe } from '../../js/pwa-safety.js';
  import { consumeMigration, takePendingToast } from '../../js/migrate.js';
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
    let cancelled = false;
    let updateWaiting = false;
    let reloadingForUpdate = false;
    const reloadUpdatedAppIfSafe = () => {
      if (!updateWaiting || reloadingForUpdate || !updateReloadIsSafe(nav)) return;
      reloadingForUpdate = true;
      location.reload();
    };

    // Listen before asset loading starts. A fast worker can claim the page while
    // boot is awaiting the atlas; attaching afterward loses that update event.
    let onControllerChange = null;
    if (!dev && 'serviceWorker' in navigator
        && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      let hadController = !!navigator.serviceWorker.controller;
      onControllerChange = () => {
        // First install should not bounce a page the player just opened. Once
        // that worker claims it, though, later deploys in this same long-lived
        // page are real updates and must follow the normal safe-reload path.
        if (!hadController) {
          hadController = true;
          return;
        }
        updateWaiting = true;
        reloadUpdatedAppIfSafe();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'module' }).catch(() => {});
    }

    // A save handed over from the game's old address, if there is one. Done here,
    // before assets, because adopting one means reloading: the store builds the
    // save proxy from localStorage once at module load and cannot be re-pointed
    // at a save that arrived after it. A reload is a path this app already walks
    // for updates, so it is the cheap correct answer rather than a new one.
    try {
      const moved = consumeMigration();
      if (moved?.adopted) { location.reload(); return; }
      const pending = moved?.message || takePendingToast();
      if (pending) toast(pending);
    } catch { /* never let the move stop the game from starting */ }

    (async () => {
      // the theme failing is the one error that used to render a blank page,
      // because it happens while modules are still evaluating
      if (THEME_ERROR) throw new Error(THEME_ERROR);
      await initAssets();
      if (cancelled) return;

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
        onRunEnd: (r) => {
          const settled = finishRunSettlement(save, r);
          if (!settled.applied) return;
          nav.playing = false;
          nav.paused = false;
          nav.result = settled.result;
        },
        onTutorial: (k) => toast(k),
        onPause: () => { if (nav.playing) togglePause(); },
      });

      // back-fill achievements a returning player already earned, silently
      checkAchievements(save);
      persistSave(save);

      game = g;
      const stopHistory = initHistory(pushState);   // the system back gesture walks the screen stack

      const onVisibility = () => {
        if (document.hidden && (g.state === 'run' || g.state === 'boss') && !g.paused) {
          g.firing = false;
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
        reloadUpdatedAppIfSafe();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      // Dev deliberately gets no service worker. It is the single biggest source
      // of "I edited it and nothing changed", and vite already serves fresh
      // modules. In production this is registered by hand rather than by
      // SvelteKit, so that rule lives in one visible place.
      stop = () => {
        cancelAnimationFrame(raf);
        g.destroy();
        stopHistory();
        document.removeEventListener('visibilitychange', onVisibility);
        document.removeEventListener('pointerdown', unlock);
        window.removeEventListener('resize', fit);
        window.removeEventListener('orientationchange', fit);
        window.visualViewport?.removeEventListener('resize', fit);
        window.visualViewport?.removeEventListener('scroll', fit);
        if (window.CR?.game === g) delete window.CR;
      };
    })().catch((e) => {
      if (cancelled) return;
      failed = e.message;
      console.error(e);
    });
    return () => {
      cancelled = true;
      stop();
      if (onControllerChange) navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  });
</script>

<div id="stage" bind:this={stage}>
  <canvas id="gameCanvas" bind:this={canvas}></canvas>
  {#if game}
    <App {game} />
  {:else}
    <div id="loading">
      {#if failed}
        <div>
          <div id="loadFail">COULD NOT START</div>
          <div class="loadWhy">{failed}</div>
          <!-- A player whose game will not boot still has their save sitting in
               localStorage. Say so, and hand them the one page that cannot break
               the same way, instead of leaving them to clear data and lose it. -->
          <div class="loadHelp">
            Your save is safe. Get it out here:
            <a href="./rescue.html">rescue page</a>
          </div>
        </div>
      {:else}
        LOADING…
      {/if}
    </div>
  {/if}
</div>
