<!--
  The app shell: the fixed top bar, the bottom nav, and one screen at a time.

  What used to be openScreen() is now just `nav.screen` and an {#if} chain. The
  `refresh` hook every screen had to remember to declare is gone: screens read
  the save directly and it is reactive, so a price cannot be stale.

  The first nav tab doubles as BACK once you are deeper than a tab root, so
  there is one obvious way out and nothing to hunt for in a corner.
-->
<script>
  import { save, nav, go, back, canGoBack, SCREENS } from './lib/store.svelte.js';
  import { Audio } from '../js/audio.js';
  import Sprite from './lib/Sprite.svelte';

  import Menu from './screens/Menu.svelte';
  import Shop from './screens/Shop.svelte';
  import More from './screens/More.svelte';
  import About from './screens/About.svelte';
  import Goals from './screens/Goals.svelte';
  import Settings from './screens/Settings.svelte';
  import Result from './screens/Result.svelte';
  import Hud from './components/Hud.svelte';
  import Pause from './components/Pause.svelte';
  import Toast from './components/Toast.svelte';
  import AchPop from './components/AchPop.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';

  let { game, pauseGame, updateState = 'idle', applyWaitingUpdate = () => {} } = $props();

  const TABS = [
    { tab: 'play',  screen: 'menu',  icon: 'ui_play',    label: 'Play' },
    { tab: 'shop',  screen: 'shop',  icon: 'ui_person',  label: 'Shop' },
  ];

  const def = $derived(SCREENS[nav.screen] || {});
  const backable = $derived(canGoBack());

  const title = $derived(def.title || 'CraftRush');

  // A run only takes the whole screen while it is actually running. Paused, the
  // bars come back so you can step into the shop or your goals and come back.
  const immersive = $derived(nav.playing && !nav.paused);
  $effect(() => {
    document.getElementById('stage')?.classList.toggle('playing', immersive);
  });

  function tap(t) {
    Audio.unlock();
    Audio.sfx('click');
    if (t.tab === 'play' && backable) { back(); return; }
    go(t.screen, { push: false });
  }
</script>

<header id="appbar">
  <span id="appTitle">{title}</span>
  <span class="chip green" id="barWallet">
    <span class="em"></span> <span id="barEmeralds">{save.emeralds}</span>
  </span>
  <button id="navMore" class="barBtn" onclick={() => { Audio.sfx('click'); go('more'); }}>
    <Sprite name="ui_gear" />
  </button>
</header>

<main id="screens" class:hidden={immersive}>
  {#if nav.screen === 'menu'}<Menu {game} />
  {:else if nav.screen === 'shop'}<Shop {game} />
  {:else if nav.screen === 'more'}<More {game} />
  {:else if nav.screen === 'about'}<About />
  {:else if nav.screen === 'goals'}<Goals />
  {:else if nav.screen === 'settings'}<Settings />
  {:else if nav.screen === 'pause'}<Pause {game} />
  {/if}
</main>

{#if nav.playing}<Hud {game} {pauseGame} />{/if}
{#if nav.result}<Result {game} />{/if}
<Toast />
<AchPop />
<UpdateBanner state={updateState} onApply={applyWaitingUpdate} />

<nav id="navbar">
  {#each TABS as t (t.tab)}
    <button
      class="navTab"
      class:sel={def.tab === t.tab}
      data-tab={t.tab}
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
