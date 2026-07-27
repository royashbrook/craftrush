<!--
  The mine: a shaft you dig down through and climb back up.

  The canvas owns itself. MineWorld does the digging, the gravity and the
  drawing, and this component only feeds it pointer events and reads back what
  is in the bag. Everything outside the canvas derives from the save, so selling
  a haul updates the wallet with nothing to call.
-->
<script>
  import { save, commit } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { MINE, PICKAXES, mineEnergy, nextPickaxe, tileById } from '../../js/config.js';
  import { MineWorld } from '../../js/minegame.js';

  let canvas = $state(null);
  let world = null;   // not reactive: nothing renders from it, and writing
                      // $state inside the effect that creates it loops
  let message = $state('');
  /** bumped whenever the world changes under us, so the bag re-derives */
  let dug = $state(0);

  // seed the recharge clock the first time the shaft is opened
  const m = save.mine;
  if (!m.energyTs) { m.energyTs = Date.now(); commit(); }

  // The energy bar refills over real time, so it needs a clock. Ticking it from
  // the rAF loop wrote reactive state sixty times a second and Svelte rightly
  // gave up; twice a second is plenty for a bar that fills over minutes.
  let clock = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => { clock = Date.now(); }, 500);
    return () => clearInterval(id);
  });
  const now = { get t() { return clock; } };
  const energy = $derived(mineEnergy(save.mine, now.t));
  const pick = $derived(PICKAXES.find((p) => p.id === save.mine.pickaxe) || PICKAXES[0]);
  const next = $derived(nextPickaxe(save.mine.pickaxe));

  const bag = $derived.by(() => {
    void dug;
    const inv = save.mine.inv || {};
    const items = [];
    let worth = 0;
    for (const [id, n] of Object.entries(inv)) {
      if (!n) continue;
      const t = tileById(id);
      worth += (t.value || 0) * n;
      items.push({ id, n, color: t.color, label: `${id.replace('ore', '')} ${n}` });
    }
    return { items, worth };
  });

  $effect(() => {
    if (!canvas) return;
    // hold our own reference: `canvas` is a bind:this and is already null by the
    // time the cleanup runs on unmount
    const cv = canvas;
    world = new MineWorld(canvas, save);
    world.settle();
    // debug handle, the way the old UI exposed ui.mine. Tests and the console
    // need a way to reach the shaft.
    if (typeof window !== 'undefined' && window.CR) window.CR.mine = world;

    // tap a neighbouring block to swing at it; drag digs a run of them
    let down = false;
    const swing = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = world.tileFromPoint(e.clientX - r.left, e.clientY - r.top);
      digAt(p.x, p.y);
    };
    const onDown = (e) => { down = true; swing(e); };
    const onMove = (e) => { if (down) swing(e); };
    const onUp = () => { down = false; };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', onUp);

    let raf = 0;
    const tick = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w > 10 && h > 10 && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      world.update(1 / 30);
      world.draw();
      raf = requestAnimationFrame(tick);
    };
    tick();

    // the screen unmounts when you navigate away now, so this has to come down
    return () => {
      if (typeof window !== 'undefined' && window.CR && window.CR.mine === world) window.CR.mine = null;
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointerleave', onUp);
    };
  });

  if (save.music !== false) Audio.music('mine');

  function digAt(x, y) {
    const t = Date.now();
    const cur = mineEnergy(save.mine, t);
    const res = world.act(x, y, cur);
    if (!res.ok) {
      if (res.why === 'tier') { Audio.sfx('gate_bad'); message = `Your pickaxe is too weak for ${res.tile.id}!`; }
      else if (res.why === 'energy') Audio.sfx('gate_bad');
      return;
    }
    if (res.moved) { Audio.sfx('click'); return; }   // a step costs nothing
    save.mine.energy = Math.max(0, cur - res.spent);
    save.mine.energyTs = t;
    clock = t;
    dug++;
    Audio.sfx(res.broke ? (res.gained ? 'emerald' : 'hit') : 'hit', 30);
    commit();
  }

  function sellOre() {
    if (bag.worth <= 0) { Audio.sfx('gate_bad'); return; }
    save.emeralds += bag.worth;
    message = `Sold your haul for ${bag.worth}!`;
    save.mine.inv = {};
    dug++;
    commit();
    Audio.sfx('buy');
  }

  function upgradePickaxe() {
    if (!next) return;
    if (save.emeralds < next.cost) { Audio.sfx('gate_bad'); return; }
    save.emeralds -= next.cost;
    save.mine.pickaxe = next.id;
    commit();
    Audio.sfx('buy');
  }
</script>

<div id="mine" class="overlay">
  <div class="panel">
    <div class="chipRow">
      <span style="color:#fff">THE MINE</span>
      <span class="chip green"><span class="em"></span> <span id="mineEmeralds">{save.emeralds}</span></span>
    </div>
    <div id="mineStats" class="mineStats">
      {message || `Depth ${save.mine.depth}  ·  ${pick.name} Pickaxe  ·  power ${pick.dmg}`}
    </div>
    <div class="energyWrap">
      <div id="energyBar" class="energyBar" style="width:{(energy / MINE.energyCap) * 100}%"></div>
      <span id="energyText" class="energyText">ENERGY {energy} / {MINE.energyCap}</span>
    </div>
    <canvas id="mineCanvas" class="mineCanvas" bind:this={canvas}></canvas>
    <div id="mineBag" class="mineBag">
      {#if bag.items.length}
        {#each bag.items as it (it.id)}
          <span class="bagItem"><i class="bagDot" style="background:{it.color}"></i>{it.label}</span>
        {/each}
      {:else}
        Tap rock to dig, tap open space to climb.
      {/if}
    </div>
    <div class="btnGrid">
      <button class="mcbtn small" id="btnSellOre" style="opacity:{bag.worth ? 1 : 0.6}" onclick={sellOre}>
        {bag.worth ? `SELL ORE · ${bag.worth}` : 'BAG EMPTY'}
      </button>
      <button
        class="mcbtn small"
        id="btnPickUp"
        style="opacity:{next && save.emeralds >= next.cost ? 1 : 0.6}"
        onclick={upgradePickaxe}
      >
        {#if next}{next.name} PICK · <span class="em"></span> {next.cost}{:else}PICK MAXED{/if}
      </button>
    </div>
  </div>
</div>
