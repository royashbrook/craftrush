<!--
  The end-of-run screen: what you got, and where to go next.

  Banking the payout, advancing the level, and marking a campaign chapter done
  are all side effects of a run ENDING, not of this screen being drawn. The
  engine hands us one result object per run (`nav.result`), so applying those
  effects is guarded on that object's identity — the effect fires once when a
  new result arrives and never again for the same object, no matter how many
  times this component re-renders. Without that guard, re-rendering (or a stray
  remount) could bank the reward, or complete a chapter, twice.
-->
<script>
  import { save, nav, commit, go, toast } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { completeChapter, recordExpedition, writeBackup } from '../../js/config.js';
  import Sprite from '../lib/Sprite.svelte';

  let { game } = $props();

  let view = $state(null);
  let appliedFor = null; // the result object we've already banked — not reactive on purpose

  $effect(() => {
    const r = nav.result;
    if (!r || r === appliedFor) return;
    appliedFor = r;
    view = applyResult(r);
  });

  // Mirrors the old showResult exactly: same payout,
  // same level advance, same chapter completion. Returns what the markup needs
  // instead of poking the DOM.
  function applyResult(r) {
    const isExp = !!r.expedition;

    // expedition streak: the multiplier + streak bonus apply only to the FIRST
    // completion of today's expedition. Replays are practice for base emeralds.
    let streakBonus = 0, streak = 0, expFirst = false;
    if (isExp && r.win) {
      const rec = recordExpedition(save);
      streak = rec.streak;
      expFirst = rec.first;
      if (rec.first) {
        streakBonus = 20 * Math.min(rec.streak, 10);
        save.stats.expeditions = (save.stats.expeditions || 0) + 1;
      }
    }
    // strip the expedition multiplier on a replay (already cleared today)
    const earned = (isExp && !expFirst) ? Math.round(r.emeralds / (r.emeraldMul || 1)) : r.emeralds;

    const rows = [
      ...(isExp ? [[r.expedition.name, r.win ? 'CLEARED!' : 'failed']] : []),
      ['<span class="em"></span> Emeralds earned', `+${earned}`],
      ...(r.win && !isExp ? [['Victory bonus', `+${r.bonus}`]] : []),
      ...(expFirst && r.emeraldMul > 1 ? [['Expedition bonus', `${r.emeraldMul}× emeralds`]] : []),
      ...(streakBonus > 0 ? [[`Day ${streak} streak`, `+${streakBonus}`]] : []),
      ...(r.rods > 0 ? [['Blaze rods', `+${r.rods}`]] : []),
      ...(isExp && !expFirst && r.win ? [['↻ Replay', 'base reward only']] : []),
      ['Biggest crowd', `${r.bestCrowd}`],
      ...(r.mode === 'shooter' ? [[' Mobs blasted', `${r.kills}`]] : []),
      ...(isExp ? [] : [[' ' + r.biome, r.win ? 'CLEARED!' : 'try again!']]),
    ];

    // bank it
    const banked = earned + streakBonus;
    save.emeralds += banked;
    save.stats.totalEmeralds = (save.stats.totalEmeralds || 0) + banked;
    if (r.win && !isExp) {
      save.level += 1;
      save.bestLevel = Math.max(save.bestLevel, save.level);
    }
    save.bestCrowd = Math.max(save.bestCrowd, r.bestCrowd);
    commit();
    // expeditions never advance the campaign — this only ever fires for a
    // normal win, and only once per result thanks to the guard above.
    if (r.win && r.chapter) {
      completeChapter(save, r.chapter.id);
      commit();
    }
    if (r.win) writeBackup(save);

    return {
      title: r.win ? (isExp ? 'EXPEDITION DONE!' : 'VICTORY!') : 'CROWD WIPED OUT',
      titleClass: r.win ? 'win' : 'lose',
      rows,
      // expeditions never advance the campaign — NEXT only shows for a normal win
      showNext: r.win && !isExp,
    };
  }

  function playAgain() {
    Audio.sfx('click');
    nav.result = null;
    nav.playing = true;
    toast(null);
    game.startRun();
  }

  function menu() {
    Audio.sfx('click');
    nav.result = null;
    go('menu', { push: false });
  }
</script>

{#if view}
  <div id="result" class="overlay">
    <div class="panel">
      <div id="resultTitle" class={view.titleClass}>{view.title}</div>
      <div id="resultStats">
        {#each view.rows as [k, v]}
          <div class="statRow"><span>{@html k}</span><b>{@html v}</b></div>
        {/each}
      </div>
      <button class="mcbtn primary" id="btnNext" class:hidden={!view.showNext} onclick={playAgain}>NEXT LEVEL ▶</button>
      <button class="mcbtn primary" id="btnRetry" class:hidden={view.showNext} onclick={playAgain}>↻ TRY AGAIN</button>
      <button class="mcbtn rowBtn small" id="btnMenu" onclick={menu}><Sprite name="ui_house" />MENU</button>
    </div>
  </div>
{/if}
