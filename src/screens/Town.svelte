<!--
  Inside a town: the houses you own, and the offer to buy another.
-->
<script>
  import { save, commit, go } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { MAX_HOUSES, housePrice, makeHouse, townById } from '../../js/config.js';
  import Sprite from '../lib/Sprite.svelte';

  let rev = $state(0);
  const world = $derived.by(() => { void rev; return save.world; });
  const town = $derived(townById(world.town));
  const rec = $derived(world.towns[world.town]);
  const full = $derived(rec.houses.length >= MAX_HOUSES);
  const cost = $derived(housePrice(rec.houses.length));

  // each town's card shows a house in that town's own materials, so the map
  // reads as eight different places without eight more sprites
  const housePalette = $derived({
    r: town.style.trim, R: town.style.trim, w: town.style.wall, W: town.style.wallAlt,
  });

  function enterHouse(i) {
    world.house = i;
    commit();
    Audio.sfx('click');
    go('playroom');
  }

  function buyHouse() {
    if (full) return;
    if (save.emeralds < cost) { Audio.sfx('gate_bad'); return; }
    save.emeralds -= cost;
    rec.houses.push(makeHouse(world.town));   // pre-decorated, never an empty box
    commit();
    Audio.sfx('buy');
    rev++;
  }
</script>

<div id="town" class="overlay">
  <div class="panel">
    <div class="chipRow">
      <span style="color:#fff" id="townTitle">{town.name.toUpperCase()}</span>
      <span class="chip green"><span class="em"></span> <span id="townEmeralds">{save.emeralds}</span></span>
    </div>
    <div class="playHint" id="townHint">
      {world.carry ? 'You are carrying a friend — go into a house to place them' : 'Tap a house to go inside'}
    </div>
    <div id="houseGrid" class="townGrid">
      {#each rec.houses as h, i (i)}
        <button class="townCard" class:here={i === world.house} onclick={() => enterHouse(i)}>
          <Sprite name="ui_house" palette={housePalette} palKey="town_{town.id}" class="townIcon" />
          <div class="townName">House {i + 1}</div>
          <div class="townMeta">{h.people.length} {h.people.length === 1 ? 'friend' : 'friends'}</div>
        </button>
      {/each}
    </div>
    {#if !full}
      <button class="mcbtn small" id="btnBuyHouse" style="opacity:{save.emeralds >= cost ? 1 : 0.6}" onclick={buyHouse}>
        ＋ BUY HOUSE · <span class="em"></span> {cost}
      </button>
    {/if}
  </div>
</div>
