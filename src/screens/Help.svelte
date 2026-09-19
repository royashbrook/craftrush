<script lang="ts">
  import { back } from '../lib/store.svelte.ts';
  let { installing = false }: { installing?: boolean } = $props();
</script>

<div id={installing ? 'installHelp' : 'help'} class="overlay">
  <div class="panel">
    {#if installing}
      <h2>ADD TO HOME SCREEN</h2>
      <p>Open this game in Safari.</p>
      <ol>
        <li>Tap <strong>Share</strong> — the square with an up arrow.</li>
        <li>Choose <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>, then open Craft Rush from its icon.</li>
      </ol>
    {:else}
      <h2>HOW TO PLAY</h2>
      <h3>BOW BLITZ</h3>
      <p>Hold and drag to fire and steer. Let go to stop firing.</p>
      <h3>GATE DASH</h3>
      <p>Drag to steer. Blue gates grow your crowd; red gates shrink it. At a boss, hold to charge and drag into safe lanes.</p>
      <h3>IRON GOLEM</h3>
      <p>When the meter is ready, give the game a quick tap to send your Golem. CALM pace fires, charges and sends Golems for you.</p>
      <h3>KEYBOARD &amp; PAUSE</h3>
      <p>Arrow keys or A/D steer. Hold F to fire or charge. Space sends a ready Golem. Escape or the pause button pauses your run.</p>
      <p>Change your pace, camera and sound in Settings. Emeralds buy looks in the Shop.</p>
    {/if}
    <button class="mcbtn small" id="btnCloseHelp" onclick={back}>BACK</button>
  </div>
</div>

<style>
  .panel { overflow-y: auto; text-align: left; }
  h2 { font-size: 20px; margin-bottom: 16px; }
  h3 { font-size: 14px; margin-top: 16px; color: var(--ink); }
  p, li { font-size: 14px; line-height: 1.5; color: var(--ink); }
  ol { padding-left: 24px; margin: 16px 0; }
  li + li { margin-top: 12px; }
  button { width: 100%; min-height: 44px; margin-top: 20px; }
</style>
