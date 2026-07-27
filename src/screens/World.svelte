<!--
  The world map: eight towns you swipe between, each drawn as a living scene.

  TownScene owns the canvas and keeps the villagers walking. This component
  decides which town is being looked at and what the bar underneath says.
-->
<script>
  import { save, commit, go } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import {
    MAX_HOUSES, TOWNS, homeIncomeRate, housePrice, makeHouse, townById, townPop,
  } from '../../js/config.js';
  import { TownScene } from '../../js/townscene.js';
  import Sprite from '../lib/Sprite.svelte';

  const world = save.world;

  let canvas = $state(null);
  let scene = null;
  let viewTown = $state(world.town);
  /** bumped when a town is bought, so the derived lines below recompute */
  let rev = $state(0);

  const ids = TOWNS.map((t) => t.id);
  const town = $derived(townById(viewTown));
  const rec = $derived.by(() => { void rev; return save.world.towns[viewTown]; });
  const at = $derived(ids.indexOf(viewTown));

  const sub = $derived.by(() => {
    if (!rec.unlocked) return `Locked · ${town.cost} emeralds`;
    const pop = townPop(rec), rate = homeIncomeRate(rec.villagers);
    return `${rec.houses.length} ${rec.houses.length === 1 ? 'house' : 'houses'} · ${pop} villagers · +${rate}/hr`;
  });
  const affordable = $derived(rec.unlocked || save.emeralds >= town.cost);

  $effect(() => {
    if (!canvas) return;
    // hold our own reference: `canvas` is a bind:this and is already null by the
    // time the cleanup runs on unmount
    const cv = canvas;
    scene = new TownScene(cv);
    scene.setTown(viewTown, rec);

    let sx = 0, sy = 0, moved = false, down = false;
    const onDown = (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; };
    const onMove = (e) => { if (down && Math.abs(e.clientX - sx) > 12) moved = true; };
    const onUp = (e) => {
      if (!down) return;
      down = false;
      const dx = e.clientX - sx;
      // a swipe travels, a tap pokes a house
      if (moved && Math.abs(dx) > 40 && Math.abs(e.clientY - sy) < 60) { step(dx < 0 ? 1 : -1); return; }
      if (!moved) tapTown(e);
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);

    let raf = 0;
    const tick = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w > 10 && h > 10 && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      scene.update(1 / 30);
      scene.draw(!rec.unlocked);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
    };
  });

  // hand the scene the town whenever the one being looked at changes
  $effect(() => {
    const [id, r] = [viewTown, rec];
    if (scene) scene.setTown(id, r);
  });

  if (save.music !== false) Audio.music('village');

  function step(dir) {
    const next = ids[Math.min(ids.length - 1, Math.max(0, at + dir))];
    if (next === viewTown) return;
    viewTown = next;
    Audio.sfx('click');
  }

  function enterHouse(index) {
    const w = save.world;
    w.town = viewTown;
    w.house = index;
    commit();
    go('playroom');
  }

  function tapTown(e) {
    if (!rec.unlocked) { action(); return; }
    const r = canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    for (const slot of scene.houseSlots()) {
      if (Math.abs(fx - slot.x) < 0.13 && Math.abs(fy - slot.y) < 0.15) {
        if (slot.owned) enterHouse(slot.index);
        else if (slot.price != null) buyHouseHere();
        return;
      }
    }
  }

  // the bottom button does whatever this town needs next
  function action() {
    if (!rec.unlocked) { unlock(); return; }
    enterHouse(0);
  }

  function unlock() {
    if (rec.unlocked) return;
    if (save.emeralds < town.cost) { Audio.sfx('gate_bad'); return; }
    save.emeralds -= town.cost;
    rec.unlocked = true;
    if (!rec.houses.length) rec.houses.push(makeHouse(viewTown));  // arrives pre-decorated
    commit();
    Audio.sfx('fanfare');
    rev++;
  }

  function buyHouseHere() {
    const price = housePrice(rec.houses.length);
    if (rec.houses.length >= MAX_HOUSES) { Audio.sfx('gate_bad'); return; }
    if (save.emeralds < price) { Audio.sfx('gate_bad'); return; }
    save.emeralds -= price;
    rec.houses.push(makeHouse(viewTown));
    commit();
    Audio.sfx('buy');
    rev++;
  }
</script>

<div id="world" class="overlay worldOverlay">
  <div class="worldWrap">
    <canvas id="townCanvas" class="townCanvas" bind:this={canvas}></canvas>
    <button class="townArrow left" id="townPrev" disabled={at <= 0} onclick={() => step(-1)}>
      <Sprite name="ui_back" />
    </button>
    <button class="townArrow right" id="townNext" disabled={at >= ids.length - 1} onclick={() => step(1)}>
      <Sprite name="ui_back" />
    </button>
    <div id="townDots" class="townDots">
      {#each TOWNS as t (t.id)}
        {@const r = save.world.towns[t.id]}
        <i class={t.id === viewTown ? 'on' : (r.unlocked ? '' : 'locked')}></i>
      {/each}
    </div>
  </div>
  <div class="worldBar">
    <div class="worldName">
      <span id="worldTownName">{town.name}</span><span id="worldTownSub">{sub}</span>
    </div>
    <button class="mcbtn small" id="btnTownAction" style="opacity:{affordable ? 1 : 0.6}" onclick={action}>
      {rec.unlocked ? 'VISIT' : (affordable ? 'UNLOCK' : 'TOO PRICEY')}
    </button>
  </div>
</div>
