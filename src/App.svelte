<!--
  The app shell: the fixed top bar, the bottom nav, and one screen at a time.

  What used to be openScreen() is now just `nav.screen` and an {#if} chain. The
  `refresh` hook every screen had to remember to declare is gone: screens read
  the save directly and it is reactive, so a price cannot be stale.

  The first nav tab doubles as BACK once you are deeper than a tab root, so
  there is one obvious way out and nothing to hunt for in a corner.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { save, nav, go, back, canGoBack, SCREENS } from './lib/store.svelte.ts';
  import type { Screen, UpdateState } from './lib/store.svelte.ts';
  import type { Game } from '../js/game.ts';
  import { Audio } from '../js/audio.ts';
  import { VERSION } from '../js/config.ts';
  import Sprite from './lib/Sprite.svelte';
  import { trackInstall } from './lib/install.svelte.ts';

  import Menu from './screens/Menu.svelte';
  import Shop from './screens/Shop.svelte';
  import More from './screens/More.svelte';
  import About from './screens/About.svelte';
  import Help from './screens/Help.svelte';
  import Goals from './screens/Goals.svelte';
  import Settings from './screens/Settings.svelte';
  import Result from './screens/Result.svelte';
  import Hud from './components/Hud.svelte';
  import Pause from './components/Pause.svelte';
  import Toast from './components/Toast.svelte';
  import AchPop from './components/AchPop.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import ReleasePanel from './components/ReleasePanel.svelte';
  import SaveWarning from './components/SaveWarning.svelte';

  let { game, pauseGame, updateState = 'idle', applyWaitingUpdate = () => {}, checkForUpdate = () => {} }: {
    game: Game;
    pauseGame: (force?: boolean) => void;
    updateState?: UpdateState;
    applyWaitingUpdate?: () => void;
    checkForUpdate?: () => void;
  } = $props();
  let releaseOpen = $state(false);
  onMount(trackInstall);

  const TABS: { tab: string; screen: Screen; icon: string; label: string }[] = [
    { tab: 'play',  screen: 'menu',  icon: 'ui_play',    label: 'Play' },
    { tab: 'shop',  screen: 'shop',  icon: 'ui_person',  label: 'Shop' },
    { tab: 'settings', screen: 'more', icon: 'ui_gear', label: 'Settings' },
  ];

  const def = $derived(SCREENS[nav.screen] || {});
  const backable = $derived(canGoBack());

  // A run only takes the whole screen while it is actually running. Paused, the
  // bars come back so you can step into the shop or your goals and come back.
  const immersive = $derived(nav.playing && !nav.paused);
  $effect(() => {
    document.getElementById('stage')?.classList.toggle('playing', immersive);
  });

  function tap(t: (typeof TABS)[number]) {
    Audio.unlock();
    Audio.sfx('click');
    if (t.tab === 'play' && backable) { back(); return; }
    go(t.screen, { push: false });
  }
</script>

<div id="appMeta" aria-label="Game status">
  <span class="chip green" id="barWallet">
    <span class="em"></span> <span id="barEmeralds">{save.emeralds}</span>
  </span>
  <button id="verTag" aria-label={`Version ${VERSION}, build and updates`} onclick={() => { if (nav.playing) pauseGame(true); releaseOpen = true; }}>v{VERSION}</button>
</div>

<main id="screens" class:hidden={immersive}>
  {#if nav.screen === 'menu'}<Menu {game} />
  {:else if nav.screen === 'shop'}<Shop {game} />
  {:else if nav.screen === 'more'}<More {game} />
  {:else if nav.screen === 'about'}<About />
  {:else if nav.screen === 'help'}<Help />
  {:else if nav.screen === 'install'}<Help installing />
  {:else if nav.screen === 'goals'}<Goals />
  {:else if nav.screen === 'settings'}<Settings />
  {:else if nav.screen === 'pause'}<Pause {game} />
  {/if}
</main>

{#if immersive}<Hud {game} {pauseGame} />{/if}
{#if nav.result}<Result {game} />{/if}
<Toast />
<AchPop />
<SaveWarning {pauseGame} />
<UpdateBanner state={updateState} onApply={applyWaitingUpdate} onCheck={checkForUpdate} />
{#if releaseOpen}<ReleasePanel state={updateState} onCheck={checkForUpdate} onClose={() => { releaseOpen = false; }} />{/if}

<nav id="navbar">
  {#each TABS as t (t.tab)}
    <button
      class="navTab"
      class:sel={def.tab === t.tab}
      data-tab={t.tab}
      id={t.tab === 'settings' ? 'navMore' : undefined}
      onclick={() => tap(t)}
    >
      {#if t.tab === 'play'}
        <Sprite name={backable ? 'ui_back' : 'ui_play'} id="tabPlayIcon" />
        <span id="tabPlayLabel">{backable ? 'Back' : 'Play'}</span>
      {:else}
        <Sprite name={t.icon} />
        <span>{t.label}</span>
      {/if}
    </button>
  {/each}
</nav>
