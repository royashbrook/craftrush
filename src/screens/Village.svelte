<!--
  The village hub: hiring villagers in the town you are standing in, and
  collecting what they earned while you were away. The collection clock is
  world-wide; the crew lives per town.
-->
<script>
  import { save, commit } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { blit, getSprite } from '../../js/assets.js';
  import {
    HOME, VILLAGERS, homeIncomeRate, pendingIdleWorld,
    townById, townHasRoom, townPop, villagerCost, worldIncomeRate,
  } from '../../js/config.js';

  let { game } = $props();

  const world = $derived(save.world);
  const townId = $derived(world.town);
  const rec = $derived(world.towns[townId]);
  const town = $derived(townById(townId));
  const crew = $derived(rec.villagers);

  const rate = $derived(worldIncomeRate(world));
  const here = $derived(homeIncomeRate(crew));
  const pending = $derived(pendingIdleWorld(world, save.home.lastCollect, Date.now()));

  const ownedVillagers = $derived(VILLAGERS.filter((v) => crew[v.id] > 0));

  // seed the collection clock on first-ever visit, so a fresh save doesn't
  // instantly show hours of idle income
  $effect(() => {
    if (!save.home.lastCollect) {
      save.home.lastCollect = Date.now();
      commit();
    }
  });

  $effect(() => {
    if (save.music !== false) Audio.music('village');
  });

  function drawSkinPreview(canvas, villager) {
    function draw(v) {
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas.width, canvas.height);
      const head = getSprite(v.head);
      const body = getSprite(v.body || 'runner_body_front', v.palette, `body_${v.id}`);
      blit(g, body, 0, 32, 86, 46);
      blit(g, head, 0, 32, 22, 36);
    }
    draw(villager);
    return { update: draw };
  }

  function collectIdle() {
    if (pending <= 0) return;
    save.emeralds += pending;
    save.home.lastCollect = Date.now();
    commit();
    Audio.sfx('emerald');
  }

  function buyVillager(id) {
    if (!townHasRoom(rec)) { Audio.sfx('gate_bad'); return; }   // this town is full
    const cost = villagerCost(id, rec.villagers[id]);
    if (save.emeralds < cost) { Audio.sfx('gate_bad'); return; }
    save.emeralds -= cost;
    rec.villagers[id]++;
    commit();
    Audio.sfx('buy');
  }
</script>

<div id="home" class="overlay">
  <div class="panel">
    <div class="chipRow">
      <span style="color:#fff">YOUR VILLAGE</span>
      <span class="chip green"><span class="em"></span> <span id="homeEmeralds">{save.emeralds}</span></span>
    </div>
    <div id="homeWelcome" class="homeWelcome" class:hidden={pending <= 0}>
      {#if pending > 0}
        <span>Villagers gathered <span class="em"></span> {pending}!</span>
        <button class="mcbtn small" onclick={collectIdle}>COLLECT</button>
      {/if}
    </div>
    <div id="homeIncome" class="homeIncome">
      {#if rate > 0}
        {town.name}: {townPop(rec)}/{HOME.townCap} villagers, +{here}/hr · all towns +{rate}/hr
      {:else}
        Hire someone in {town.name} to start earning emeralds!
      {/if}
    </div>
    <div id="homeScene" class="homeScene">
      {#if !ownedVillagers.length}
        <div class="homeEmpty">No one lives in {town.name} yet. Hire someone!</div>
      {:else}
        {#each ownedVillagers as v, i (v.id)}
          <div class="homeSprite">
            <canvas
              width="40"
              height="56"
              style="animation-delay: {(VILLAGERS.indexOf(v) % 5) * 0.2}s"
              use:drawSkinPreview={v}
            ></canvas>
            <div class="cnt">×{crew[v.id]}</div>
          </div>
        {/each}
      {/if}
    </div>
    <div id="villagerList" class="villagerList">
      {#each VILLAGERS as v (v.id)}
        {@const count = crew[v.id]}
        {@const cost = villagerCost(v.id, count)}
        {@const canAfford = save.emeralds >= cost}
        <div class="vCard">
          <canvas width="64" height="88" use:drawSkinPreview={v}></canvas>
          <div class="vInfo">
            <div class="vName">{v.name} <span style="color:#b8f0c8">×{count}</span></div>
            <div class="vMeta">+{v.income}/hr each · next <span class="em"></span> {cost}</div>
          </div>
          <button class="vBuy" class:cant={!canAfford} onclick={() => buyVillager(v.id)}>
            <span class="em"></span> {cost}
          </button>
        </div>
      {/each}
    </div>
  </div>
</div>
