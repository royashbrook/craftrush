<!--
  The shop: skins, then capes, hats, arrow trails and pets. Buying an item
  equips it; the equipped item can be tapped off again. Campaign loot wears a
  QUEST tag no amount of emeralds will clear, until it is actually earned.
-->
<script>
  import { save, commit, toast } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { blit, getSprite } from '../../js/assets.js';
  import { COSMETICS, SKINS, questCosmeticEarned } from '../../js/config.js';

  let { game } = $props();

  const CAT_LABELS = { cape: 'CAPES', hat: 'HATS', trail: 'ARROW TRAILS', pet: 'PETS' };

  const activeSkin = $derived(SKINS.find((s) => s.id === save.skin) || SKINS[0]);

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

  // ---------- clicks ----------
  function onSkinClick(skin) {
    const owned = save.unlocked.includes(skin.id);
    if (owned) {
      save.skin = skin.id;
      Audio.sfx('click');
    } else if (save.emeralds >= skin.cost) {
      save.emeralds -= skin.cost;
      save.unlocked.push(skin.id);
      save.skin = skin.id;
      Audio.sfx('buy');
    } else {
      Audio.sfx('gate_bad');
      return;
    }
    commit();
    game?.applySkin();
  }

  function onCosmeticClick(cat, def) {
    const owned = save.cosmeticsOwned.includes(def.id);
    if (owned) {
      // click equipped item again to take it off
      save.cosmetics[cat] = save.cosmetics[cat] === def.id ? 'none' : def.id;
      Audio.sfx('click');
    } else if (def.quest) {
      // campaign loot: free once you have it, and no amount of emeralds buys it early
      if (!questCosmeticEarned(save, def)) {
        toast(`Find this on your quest: ${def.name}.`);
        Audio.sfx('gate_bad');
        return;
      }
      save.cosmeticsOwned.push(def.id);
      save.cosmetics[cat] = def.id;
      Audio.sfx('buy');
    } else if (save.emeralds >= def.cost) {
      save.emeralds -= def.cost;
      save.cosmeticsOwned.push(def.id);
      save.cosmetics[cat] = def.id;
      Audio.sfx('buy');
    } else {
      Audio.sfx('gate_bad');
      return;
    }
    commit();
    game?.refreshCosmetics();
  }
</script>

<div id="shop" class="overlay">
  <div class="panel">
    <div class="chipRow">
      <span style="color:#fff">PICK YOUR HERO</span>
      <span class="chip green"><span class="em"></span> <span id="shopEmeralds">{save.emeralds}</span></span>
    </div>
    <div id="shopGrid">
      <div class="shopSection">SKINS</div>
      {#each SKINS as skin (skin.id)}
        {@const owned = save.unlocked.includes(skin.id)}
        {@const selected = save.skin === skin.id}
        {@const short = save.emeralds < skin.cost}
        <button
          class="skinCard"
          class:sel={selected}
          class:locked={!owned && short}
          onclick={() => onSkinClick(skin)}
        >
          <canvas width="64" height="88" use:drawSkinPreview={skin}></canvas>
          <div class="skinName">{skin.name}</div>
          <div class="skinTag">
            {#if selected}PICKED{:else if owned}OWNED{:else}<span class="em"></span> {skin.cost}{/if}
          </div>
        </button>
      {/each}

      {#each Object.entries(CAT_LABELS) as [cat, label] (cat)}
        <div class="shopSection">{label}</div>
        {#each COSMETICS[cat].filter((d) => d.id !== 'none') as def (def.id)}
          {@const owned = save.cosmeticsOwned.includes(def.id)}
          {@const selected = save.cosmetics[cat] === def.id}
          {@const questState = def.quest ? (questCosmeticEarned(save, def) ? 'EARNED' : 'QUEST') : null}
          {@const short = questState ? questState === 'QUEST' : save.emeralds < def.cost}
          <button
            class="skinCard"
            class:sel={selected}
            class:locked={!owned && short}
            onclick={() => onCosmeticClick(cat, def)}
          >
            <canvas width="64" height="88" use:drawCosmeticPreview={{ cat, def, skin: activeSkin }}></canvas>
            <div class="skinName">{def.name}</div>
            <div class="skinTag">
              {#if selected}PICKED{:else if owned}OWNED{:else if questState}<span class="questTag">{questState}</span>{:else}<span class="em"></span> {def.cost}{/if}
            </div>
          </button>
        {/each}
      {/each}
    </div>
  </div>
</div>
