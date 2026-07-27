<!--
  A compact dressing room. Cards only choose what to inspect; buying, claiming,
  equipping and removing are separate actions in the selected-item preview.
-->
<script>
  import { save, nav, commit, toast } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { blit, getSprite } from '../../js/assets.js';
  import { COSMETICS, SKINS, questCosmeticEarned } from '../../js/config.js';

  let { game } = $props();

  const CATEGORIES = [
    { id: 'skin', label: 'SKINS' },
    { id: 'cape', label: 'CAPES' },
    { id: 'hat', label: 'HATS' },
    { id: 'trail', label: 'TRAILS' },
    { id: 'pet', label: 'PETS' },
  ];

  let selectedId = $state(null);

  const activeSkin = $derived(SKINS.find((s) => s.id === save.skin) || SKINS[0]);
  const category = $derived(CATEGORIES.some((c) => c.id === nav.shopCategory) ? nav.shopCategory : 'skin');
  const items = $derived.by(() => category === 'skin'
    ? SKINS
    : (COSMETICS[category] || []).filter((d) => d.id !== 'none'));
  const selected = $derived.by(() => {
    const equipped = category === 'skin' ? save.skin : save.cosmetics?.[category];
    return items.find((d) => d.id === selectedId)
      || items.find((d) => d.id === equipped)
      || items[0]
      || null;
  });

  function itemState(cat, def) {
    const skin = cat === 'skin';
    const owned = skin
      ? save.unlocked.includes(def.id)
      : save.cosmeticsOwned.includes(def.id);
    const equipped = skin
      ? save.skin === def.id
      : save.cosmetics?.[cat] === def.id;
    const earned = !!def.quest && questCosmeticEarned(save, def);
    const affordable = !def.quest && save.emeralds >= (def.cost || 0);
    const need = Math.max(0, (def.cost || 0) - save.emeralds);

    let badge = 'PRICE';
    if (equipped) badge = 'EQUIPPED';
    else if (owned) badge = 'OWNED';
    else if (earned) badge = 'EARNED';
    else if (def.quest) badge = 'QUEST';
    else if (affordable) badge = 'READY';

    return { owned, equipped, earned, affordable, need, badge };
  }

  function actionFor(cat, def, state) {
    if (!def || !state) return { kind: 'none', label: 'UNAVAILABLE', disabled: true, blocked: true };
    if (state.equipped) {
      return cat === 'skin'
        ? { kind: 'equipped', label: 'EQUIPPED', disabled: true, blocked: true }
        : { kind: 'remove', label: 'REMOVE', disabled: false, blocked: false };
    }
    if (state.owned) return { kind: 'equip', label: 'EQUIP', disabled: false, blocked: false };
    if (def.quest) {
      return state.earned
        ? { kind: 'claim', label: 'CLAIM', disabled: false, blocked: false }
        : { kind: 'quest', label: 'QUEST REWARD', disabled: false, blocked: true };
    }
    return state.affordable
      ? { kind: 'buy', label: `BUY ${def.cost}`, disabled: false, blocked: false }
      : { kind: 'need', label: `NEED ${state.need} MORE`, disabled: false, blocked: true };
  }

  function stateDescription(def, state) {
    if (state.equipped) return `${def.name}, equipped`;
    if (state.owned) return `${def.name}, owned`;
    if (state.earned) return `${def.name}, quest reward earned`;
    if (def.quest) return `${def.name}, quest reward locked`;
    if (state.affordable) return `${def.name}, affordable for ${def.cost} emeralds`;
    return `${def.name}, costs ${def.cost} emeralds, need ${state.need} more`;
  }

  const selectedState = $derived(selected ? itemState(category, selected) : null);
  const primaryAction = $derived(actionFor(category, selected, selectedState));

  // ---------- previews: composites drawn straight into a canvas ----------
  // Sprite only draws one sprite; these are two (body+cape, head+hat), so they
  // stay as small canvas actions rather than <Sprite>.
  function drawSkinPreview(canvas, skin) {
    function draw(s) {
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas.width, canvas.height);
      const head = getSprite(s.head);
      const body = getSprite(s.body || 'runner_body_front', s.palette, `body_${s.id}`);
      blit(g, body, 0, 32, 86, 46);
      blit(g, head, 0, 32, 22, 36);
    }
    draw(skin);
    return { update: draw };
  }

  function drawCosmeticPreview(canvas, { cat, def, skin }) {
    function draw({ cat, def, skin }) {
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (cat === 'cape') {
        const body = getSprite('runner_back', skin.palette, `back_${skin.id}`);
        blit(g, body, 0, 32, 84, 70);
        const cape = getSprite('cape', def.rainbow ? { c: '#ff5545', C: '#3fa9ff' } : def.colors, `shop_${def.id}`);
        blit(g, cape, 0, 32, 84 - 70 * (3.5 / 18), 70 * (9 / 18));
        if (def.rainbow) {
          const cols = ['#ff5545', '#ffd94d', '#2eff70', '#3fa9ff', '#c76bff'];
          cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(10 + i * 9, 6, 7, 5); });
        }
      } else if (cat === 'hat') {
        const head = getSprite(skin.head);
        blit(g, head, 0, 32, 74, 44);
        const hat = getSprite(def.sprite);
        blit(g, hat, 0, 32, 74 - 44 + hat.h * 2.5, hat.h * 5.5);
      } else if (cat === 'trail') {
        const cols = def.colors;
        for (let i = 0; i < 4; i++) {
          g.globalAlpha = 1 - i * 0.2;
          g.fillStyle = cols[i % cols.length];
          const s = 10 - i * 1.5;
          g.fillRect(32 - s / 2, 34 + i * 13, s, s);
        }
        g.globalAlpha = 1;
        const arrow = getSprite('arrow');
        blit(g, arrow, 0, 32, 30, 26);
      } else if (cat === 'pet') {
        const spr = getSprite(def.sprite);
        blit(g, spr, 0, 32, 76, 54);
      }
    }
    draw({ cat, def, skin });
    return { update: draw };
  }

  // ---------- navigation and explicit actions ----------
  function chooseCategory(id, focus = false) {
    if (!CATEGORIES.some((c) => c.id === id)) return;
    nav.shopCategory = id;
    selectedId = null;
    Audio.sfx('click');
    if (focus) requestAnimationFrame(() => document.getElementById(`shopTab-${id}`)?.focus());
  }

  function onTabKeydown(event, index) {
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % CATEGORIES.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + CATEGORIES.length) % CATEGORIES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = CATEGORIES.length - 1;
    if (next === null) return;
    event.preventDefault();
    chooseCategory(CATEGORIES[next].id, true);
  }

  function chooseItem(def) {
    selectedId = def.id;
    Audio.sfx('click');
  }

  function deny(action, def, state) {
    Audio.sfx('gate_bad');
    if (action.kind === 'quest') toast(`Find this on your quest: ${def.name}.`);
    else if (action.kind === 'need') toast(`You need ${state.need} more emeralds.`);
  }

  function runPrimaryAction() {
    if (!selected) return;

    // Recompute from the live save. A stale rendered button can never spend twice
    // or equip something that is no longer owned.
    const state = itemState(category, selected);
    const action = actionFor(category, selected, state);
    if (action.blocked) {
      deny(action, selected, state);
      return;
    }

    const skin = category === 'skin';
    if (action.kind === 'buy') {
      if (skin) save.unlocked.push(selected.id);
      else save.cosmeticsOwned.push(selected.id);
      save.emeralds -= selected.cost;
      Audio.sfx('buy');
      commit();
      return;
    }

    if (action.kind === 'claim') {
      // Quest loot is claimed into ownership first. Equipping remains a second,
      // explicit action just like every purchased item.
      if (skin) save.unlocked.push(selected.id);
      else save.cosmeticsOwned.push(selected.id);
      Audio.sfx('buy');
      commit();
      return;
    }

    if (action.kind === 'equip') {
      if (skin) {
        save.skin = selected.id;
        Audio.sfx('click');
        commit();
        game?.applySkin();
      } else {
        save.cosmetics[category] = selected.id;
        Audio.sfx('click');
        commit();
        game?.refreshCosmetics();
      }
      return;
    }

    if (action.kind === 'remove' && !skin) {
      save.cosmetics[category] = 'none';
      Audio.sfx('click');
      commit();
      game?.refreshCosmetics();
    }
  }
</script>

<div id="shop" class="overlay">
  <div class="panel">
    <div id="shopTabs" class="shopTabs" role="tablist" aria-label="Shop categories">
      {#each CATEGORIES as cat, index (cat.id)}
        <button
          type="button"
          id={`shopTab-${cat.id}`}
          class="shopTab"
          class:sel={category === cat.id}
          data-shop-category={cat.id}
          role="tab"
          aria-selected={category === cat.id}
          aria-controls="shopCatalog"
          tabindex={category === cat.id ? 0 : -1}
          onclick={() => chooseCategory(cat.id)}
          onkeydown={(event) => onTabKeydown(event, index)}
        >{cat.label}</button>
      {/each}
    </div>

    {#if selected && selectedState}
      <section id="shopPreview" class="shopPreview" aria-live="polite" aria-label={stateDescription(selected, selectedState)}>
        {#if category === 'skin'}
          <canvas
            class="shopPreviewCanvas"
            width="64"
            height="88"
            aria-hidden="true"
            use:drawSkinPreview={selected}
          ></canvas>
        {:else}
          <canvas
            class="shopPreviewCanvas"
            width="64"
            height="88"
            aria-hidden="true"
            use:drawCosmeticPreview={{ cat: category, def: selected, skin: activeSkin }}
          ></canvas>
        {/if}
        <div class="shopPreviewInfo">
          <div class="shopPreviewName">{selected.name}</div>
          <div class="shopPreviewState">{stateDescription(selected, selectedState)}</div>
          <button
            type="button"
            id="shopAction"
            class="mcbtn small shopAction"
            data-action={primaryAction.kind}
            disabled={primaryAction.disabled}
            aria-disabled={primaryAction.blocked}
            onclick={runPrimaryAction}
          >
            {#if primaryAction.kind === 'buy'}BUY <span class="em"></span> {selected.cost}
            {:else}{primaryAction.label}{/if}
          </button>
        </div>
      </section>
    {/if}

    <div
      id="shopCatalog"
      class="shopCatalog"
      role="tabpanel"
      aria-labelledby={`shopTab-${category}`}
      tabindex="0"
    >
      {#if items.length}
        <div id="shopGrid">
          {#each items as def (def.id)}
            {@const state = itemState(category, def)}
            {@const chosen = selected?.id === def.id}
            <button
              type="button"
              class="skinCard"
              class:sel={chosen}
              class:equipped={state.equipped}
              class:locked={!state.owned && !state.affordable && !state.earned}
              data-shop-item={def.id}
              data-shop-category={category}
              aria-pressed={chosen}
              aria-label={stateDescription(def, state)}
              onclick={() => chooseItem(def)}
            >
              {#if category === 'skin'}
                <canvas width="64" height="88" aria-hidden="true" use:drawSkinPreview={def}></canvas>
              {:else}
                <canvas
                  width="64"
                  height="88"
                  aria-hidden="true"
                  use:drawCosmeticPreview={{ cat: category, def, skin: activeSkin }}
                ></canvas>
              {/if}
              <div class="skinName">{def.name}</div>
              <div class="skinTag" class:questTag={state.badge === 'QUEST' || state.badge === 'EARNED'}>
                {#if state.badge === 'PRICE'}<span class="em"></span> {def.cost}
                {:else}{state.badge}{/if}
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div id="shopEmpty">NOTHING HERE YET</div>
      {/if}
    </div>
  </div>
</div>
