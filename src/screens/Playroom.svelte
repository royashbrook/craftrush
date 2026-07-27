<!--
  The playroom: a house wider than the viewport, panned by dragging the empty
  background (Toca-Boca style). Friends ragdoll when dragged (arms/legs swing on
  damped springs, see lib/draggable.js); decor tilts as a whole. Drop either on
  the bin to put it away, or a friend on the carry bag to bring them to another
  house.

  The canvas backdrop (lib/roomart.js#drawRoom) repaints on room-tier changes and
  on resize; the friends/decor themselves are ordinary reactive DOM nodes so
  adding one just appears, no render call needed. Screens unmount on navigate,
  so the pan wiring, the resize listener and the drag's own rAF/window listeners
  all have to come down — see the cleanups below and in draggable.js.
-->
<script>
  import { save, commit } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import {
    COSMETICS, DECOR, ROOM_TIERS, SKINS,
    clamp01, decorById, roomTierById, styleById, townById,
  } from '../../js/config.js';
  import { blit, getSprite, hasSprite } from '../../js/assets.js';
  import { drawDressedCharacter, drawRoom, drawSprite } from '../lib/roomart.js';
  import { draggable } from '../lib/draggable.js';
  import Sprite from '../lib/Sprite.svelte';

  // The house is wider than the viewport — dragging the background pans it.
  const WORLD_SCALE = 2.4; // the house is this much wider than the viewport

  const world = save.world;
  function curHouse() {
    const houses = world.towns[world.town].houses;
    return houses[world.house] || houses[0];
  }
  const house = curHouse();

  // one-time repair/normalize on entry, mirroring the old playmatesData() /
  // decorData() / roomData() (which used to run on every render — here it only
  // needs to run once, since screens remount fresh whenever you come back)
  if (!Array.isArray(house.people)) house.people = [];
  {
    const owned = new Set(save.unlocked);
    for (const p of house.people) {
      if (!owned.has(p.skin)) p.skin = 'steve';
      if (!p.cosmetics) p.cosmetics = { cape: 'none', hat: 'none' };
      for (const cat of ['cape', 'hat']) {
        const id = p.cosmetics[cat];
        if (id && id !== 'none' && !save.cosmeticsOwned.includes(id)) p.cosmetics[cat] = 'none';
      }
      p.x = clamp01(typeof p.x === 'number' ? p.x : 0.5);
      p.y = clamp01(typeof p.y === 'number' ? p.y : 0.7);
    }
  }
  if (!Array.isArray(house.decor)) house.decor = [];
  house.decor = house.decor.filter((d) => decorById(d.item));
  for (const d of house.decor) {
    d.x = clamp01(typeof d.x === 'number' ? d.x : 0.5);
    d.y = clamp01(typeof d.y === 'number' ? d.y : 0.8);
  }
  {
    const first = ROOM_TIERS[0].id;
    if (!Array.isArray(save.roomTiersOwned)) save.roomTiersOwned = [first];
    save.roomTiersOwned = save.roomTiersOwned.filter((id) => ROOM_TIERS.some((r) => r.id === id));
    if (!save.roomTiersOwned.includes(first)) save.roomTiersOwned.unshift(first);
  }
  if (!save.decorOwned || typeof save.decorOwned !== 'object') save.decorOwned = {};

  if (save.music !== false) Audio.music('cozy');

  // the room's materials: a bought ROOM_TIER, else the town's native style
  const style = $derived(styleById(house.style, world.town));
  // room picker options: the town's own look (free here), then the buyable tiers
  const roomOptions = [{ ...townById(world.town).style, cost: 0, free: true }, ...ROOM_TIERS];

  const ownedSkinsList = $derived(SKINS.filter((s) => save.unlocked.includes(s.id)));
  const ownedCosBy = $derived({
    hat: COSMETICS.hat.filter((c) => c.id === 'none' || save.cosmeticsOwned.includes(c.id)),
    cape: COSMETICS.cape.filter((c) => c.id === 'none' || save.cosmeticsOwned.includes(c.id)),
  });
  function skinById(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }

  // small local preview painters — not part of the pure-drawing set moved into
  // lib/roomart.js, just enough to render the dress panel's rows
  function drawSkinPreview(cv, skin) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const head = getSprite(skin.head);
    const body = getSprite(skin.body || 'runner_body_front', skin.palette, `body_${skin.id}`);
    blit(g, body, 0, 32, 86, 46);
    blit(g, head, 0, 32, 22, 36);
  }
  function drawHatPreview(cv, c) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const hat = getSprite(c.sprite);
    blit(g, hat, 0, 20, 40, (hat.h / hat.w) * 32);
  }

  // generic "paint this canvas, and repaint it if the draw function changes"
  // action, used for every canvas whose content isn't the ragdoll (that one
  // needs the redraw handle below instead)
  function paint(node, draw) {
    draw(node);
    return { update: draw };
  }
  // lets a friend's draggable (attached to the wrapping div) reach back into
  // its own canvas to redraw the ragdoll pose
  const canvasFor = new WeakMap();
  function registerCanvasFor(node, obj) {
    canvasFor.set(obj, node);
    return {
      update(next) { canvasFor.set(next, node); },
      destroy() { canvasFor.delete(obj); },
    };
  }

  // ---- pan/layout state (screen-local; not saved) ----
  let sceneEl = $state(null);
  let roomWorldEl = $state(null);
  let roomBgCanvas = $state(null);
  let trashZoneEl = $state(null);
  let carryZoneEl = $state(null);

  let panX = $state(0);
  let worldW = $state(0);
  let sceneW = $state(0);

  function setPan(px) {
    const max = Math.max(0, worldW - sceneW);
    panX = Math.max(0, Math.min(max, px));
    if (roomWorldEl) roomWorldEl.style.transform = `translateX(${-panX}px)`;
  }
  function layoutWorld() {
    if (!sceneEl) return null;
    const rect = sceneEl.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return null; // not laid out yet
    worldW = Math.round(rect.width * WORLD_SCALE);
    sceneW = rect.width;
    if (roomWorldEl) roomWorldEl.style.width = `${worldW}px`;
    setPan(panX);
    return rect;
  }

  let layoutRaf = 0;
  function paintRoom() {
    if (!sceneEl || !roomBgCanvas) return;
    const rect = layoutWorld();
    if (!rect) { layoutRaf = requestAnimationFrame(paintRoom); return; }
    drawRoom(roomBgCanvas, style, worldW, rect);
  }

  // repaint the backdrop whenever it's ready, or the room's materials change
  $effect(() => {
    void style;
    if (!sceneEl || !roomBgCanvas) return;
    paintRoom();
  });

  // background pan + keeping the layout right on resize; wired once per mount
  $effect(() => {
    if (!sceneEl) return;
    const onResize = () => paintRoom();
    window.addEventListener('resize', onResize);

    let active = false, last = 0;
    const move = (e) => { if (!active) return; setPan(panX - (e.clientX - last)); last = e.clientX; };
    const up = () => { active = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    const down = (e) => {
      active = true; last = e.clientX;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    sceneEl.addEventListener('pointerdown', down);

    // the screen unmounts on navigate now, so all of this has to come down
    return () => {
      window.removeEventListener('resize', onResize);
      sceneEl.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
    };
  });

  // ---- friends ----
  function addFriend() {
    const owned = ownedSkinsList;
    const skin = owned[house.people.length % owned.length].id; // cycle through owned skins
    // drop the new friend where you're currently looking, in world coords
    const w = worldW || 1, vx = ((panX || 0) + (sceneW || w) * (0.35 + Math.random() * 0.3)) / w;
    house.people.push({ skin, cosmetics: { cape: 'none', hat: 'none' }, x: clamp01(vx), y: 0.72 + Math.random() * 0.2 });
    commit();
    Audio.sfx('powerup');
  }
  // put the carried friend down in the house you're standing in
  function placeCarry() {
    if (!world.carry) return;
    const p = world.carry;
    const w = worldW || 1, vx = ((panX || 0) + (sceneW || w) * 0.5) / w;
    p.x = clamp01(vx); p.y = 0.8;
    house.people.push(p);
    world.carry = null;
    commit();
    Audio.sfx('powerup');
  }
  // take a friend out of this house and carry them; place them in any other house
  function pickUpPlaymate(i) {
    if (world.carry) return; // one passenger at a time
    world.carry = house.people.splice(i, 1)[0];
    commit();
  }
  function removePlaymate(i) {
    house.people.splice(i, 1);
    commit();
    Audio.sfx('pop');
    panel = null;
  }
  function openDress(i) {
    Audio.sfx('click');
    panel = 'friend';
    panelIndex = i;
  }
  function setPlaymate(p, field, value) {
    if (field === 'skin') p.skin = value;
    else p.cosmetics[field] = value;
    commit();
    Audio.sfx('buy');
  }

  // ---- decor ----
  // furniture you own but haven't placed; putting something in the bin comes back here
  function showDecorCatalog() { Audio.sfx('click'); panel = 'decor'; }
  // place one from your inventory; only buy when you have none left
  function placeDecor(id) {
    const def = decorById(id); if (!def) return;
    const stock = save.decorOwned;
    if (stock[id] > 0) { stock[id]--; Audio.sfx('click'); }
    else {
      if (save.emeralds < def.cost) { Audio.sfx('gate_bad'); return; }
      save.emeralds -= def.cost; Audio.sfx('buy');
    }
    // drop it where you're looking, in world coords
    const w = worldW || 1, vx = ((panX || 0) + (sceneW || w) * (0.35 + Math.random() * 0.3)) / w;
    house.decor.push({ item: id, x: clamp01(vx), y: 0.78 + Math.random() * 0.18 });
    commit();
  }
  // the bin puts furniture BACK in your inventory — nothing you paid for is ever lost
  function removeDecor(i) {
    const gone = house.decor.splice(i, 1)[0];
    if (gone) {
      const stock = save.decorOwned;
      stock[gone.item] = (stock[gone.item] || 0) + 1;
    }
    commit();
    Audio.sfx('pop');
  }

  // ---- room style ----
  function showRoomPicker() { Audio.sfx('click'); panel = 'room'; }
  function setRoomTier(id, free = false) {
    if (!free && !save.roomTiersOwned.includes(id)) {
      const t = roomTierById(id);
      if (save.emeralds < t.cost) { Audio.sfx('gate_bad'); return; }
      save.emeralds -= t.cost; save.roomTiersOwned.push(id); Audio.sfx('buy');
    } else Audio.sfx('click');
    house.style = id; // styles are owned globally, applied per house
    commit();
  }

  // ---- the one shared panel: dressing a friend, the decor catalog, or the room picker ----
  let panel = $state(null); // null | 'friend' | 'decor' | 'room'
  let panelIndex = $state(-1);
  function closeDress() { Audio.sfx('click'); panel = null; }
</script>

<div id="playroom" class="overlay">
  <div class="panel">
    <div class="chipRow">
      <span style="color:#fff" id="playHouseTitle">HOUSE {world.house + 1}</span>
      <span class="chip green"><span class="em"></span> <span id="playEmeralds">{save.emeralds}</span></span>
    </div>
    <div class="playBtns">
      <button class="mcbtn rowBtn small" id="btnAddFriend" onclick={addFriend}><Sprite name="ui_person" />FRIEND</button>
      <button class="mcbtn rowBtn small" id="btnDecor" onclick={showDecorCatalog}><Sprite name="ui_sofa" />DECOR</button>
      <button class="mcbtn rowBtn small" id="btnRoom" onclick={showRoomPicker}><Sprite name="ui_palette" />ROOM</button>
    </div>
    <div id="playHint" class="playHint">
      {world.carry
        ? 'Tap PLACE FRIEND to bring your visitor into this house'
        : 'Drag friends & decor · tap a friend to dress · drop one on the bag to take them along'}
    </div>
    <div id="playScene" class="playScene" bind:this={sceneEl}>
      <div id="roomWorld" class="roomWorld" bind:this={roomWorldEl}>
        <canvas id="roomBg" class="roomBg" bind:this={roomBgCanvas}></canvas>
        <div id="roomItems" class="roomItems">
          {#if !house.people.length && !house.decor.length}
            <div class="playEmpty">Your house is empty — add a friend or some decor!</div>
          {/if}
          <!-- decor first, then friends, so furniture sits behind people -->
          {#each house.decor as d, i (d)}
            <div
              class="playmate decor"
              style="left:{d.x * 100}%; top:{d.y * 100}%"
              use:draggable={{
                obj: d, scene: sceneEl, panX, worldW, bin: trashZoneEl, sack: carryZoneEl, commit,
                onRemove: () => removeDecor(i),
              }}
            >
              <canvas width="56" height="56" use:paint={(cv) => drawSprite(cv, decorById(d.item)?.sprite)}></canvas>
            </div>
          {/each}
          {#each house.people as p, i (p)}
            <div
              class="playmate"
              style="left:{p.x * 100}%; top:{p.y * 100}%"
              use:draggable={{
                obj: p, scene: sceneEl, panX, worldW, bin: trashZoneEl, sack: carryZoneEl, commit,
                onTap: () => openDress(i),
                onRemove: () => removePlaymate(i),
                onCarry: world.carry ? null : () => pickUpPlaymate(i),
                redraw: (pose) => {
                  const cv = canvasFor.get(p);
                  if (cv) drawDressedCharacter(cv, skinById(p.skin), p.cosmetics, pose);
                },
              }}
            >
              <canvas
                width="52" height="74"
                style="animation-delay:{(i % 5) * 0.4}s"
                use:registerCanvasFor={p}
                use:paint={(cv) => drawDressedCharacter(cv, skinById(p.skin), p.cosmetics)}
              ></canvas>
            </div>
          {/each}
        </div>
      </div>
      <div id="trashZone" class="trashZone" bind:this={trashZoneEl}><Sprite name="ui_trash" /></div>
      <div id="carryZone" class="trashZone carryZone" bind:this={carryZoneEl}><Sprite name="ui_bag" /></div>
      {#if world.carry}
        <button id="btnPlaceCarry" class="placeCarry rowBtn" onclick={placeCarry}>
          <Sprite name="ui_bag" />PLACE FRIEND
        </button>
      {/if}
    </div>
    <div id="dressPanel" class="dressPanel" class:hidden={!panel}>
      {#if panel === 'friend' && house.people[panelIndex]}
        {@const p = house.people[panelIndex]}
        <div class="dressLabel">SKIN</div>
        <div class="dressRow">
          {#each ownedSkinsList as s (s.id)}
            <button class="dressItem" aria-label={s.name || s.id} class:sel={p.skin === s.id} onclick={() => setPlaymate(p, 'skin', s.id)}>
              <canvas width="40" height="54" use:paint={(cv) => drawSkinPreview(cv, s)}></canvas>
            </button>
          {/each}
        </div>
        {#each ['hat', 'cape'] as cat (cat)}
          <div class="dressLabel">{cat.toUpperCase()}</div>
          <div class="dressRow">
            {#each ownedCosBy[cat] as c (c.id)}
              <button
                class="dressItem"
                class:sel={(p.cosmetics[cat] || 'none') === c.id}
                onclick={() => setPlaymate(p, cat, c.id)}
              >
                {#if c.id === 'none'}
                  <span class="none">NONE</span>
                {:else if cat === 'hat' && c.sprite && hasSprite(c.sprite)}
                  <canvas width="40" height="42" use:paint={(cv) => drawHatPreview(cv, c)}></canvas>
                {:else}
                  <div class="swatch" style="background:{c.colors ? (Array.isArray(c.colors) ? c.colors[0] : c.colors.c) : '#7a5a3a'}"></div>
                {/if}
              </button>
            {/each}
          </div>
        {/each}
        <button class="mcbtn small dressClose" onclick={closeDress}>DONE</button>
      {:else if panel === 'decor'}
        <div class="dressLabel">DECOR · tap to place · bin sends it back here</div>
        <div class="dressRow">
          {#each DECOR as d (d.id)}
            {@const have = save.decorOwned[d.id] || 0}
            <button
              class="dressItem"
              class:sel={have > 0}
              class:cant={have <= 0 && save.emeralds < d.cost}
              onclick={() => placeDecor(d.id)}
            >
              <canvas width="40" height="40" use:paint={(cv) => drawSprite(cv, d.sprite)}></canvas>
              <div class="dItemCost">{#if have > 0}x{have}{:else}<span class="em"></span>{d.cost}{/if}</div>
            </button>
          {/each}
        </div>
        <button class="mcbtn small dressClose" onclick={closeDress}>DONE</button>
      {:else if panel === 'room'}
        <div class="dressLabel">ROOM STYLE</div>
        <div class="dressRow">
          {#each roomOptions as t (t.id)}
            {@const owned = t.free || save.roomTiersOwned.includes(t.id)}
            <button
              class="dressItem"
              class:sel={house.style === t.id}
              class:cant={!owned && save.emeralds < t.cost}
              onclick={() => setRoomTier(t.id, t.free)}
            >
              <div class="roomSwatch" style="background: linear-gradient({t.wall} 0%, {t.wall} 54%, {t.trim} 54%, {t.floor} 62%, {t.floorAlt} 100%)"></div>
              <div class="dItemCost">
                {#if owned}{house.style === t.id ? 'ON' : (t.free ? 'TOWN' : 'OWNED')}{:else}<span class="em"></span>{t.cost}{/if}
              </div>
            </button>
          {/each}
        </div>
        <button class="mcbtn small dressClose" onclick={closeDress}>DONE</button>
      {/if}
    </div>
  </div>
</div>
