<!--
  The end-of-run screen: what you got, and where to go next.

  A result is already settled before this component sees it. Drawing or
  remounting this screen therefore cannot touch the save.
-->
<script>
  import { nav, go, toast } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { BADGES } from '../../js/mastery.js';
  import Sprite from '../lib/Sprite.svelte';

  let { game } = $props();

  const view = $derived(nav.result ? resultView(nav.result) : null);

  function badgeLabel(entry) {
    if (typeof entry === 'object') return entry.label || entry.id;
    return BADGES.find((badge) => badge.id === entry)?.label || entry;
  }

  function resultView(r) {
    const isExp = !!r.expedition;
    const settled = r.settlement || {};
    const earned = settled.earned ?? r.emeralds;
    const streakBonus = settled.streakBonus || 0;
    const streak = settled.streak || 0;
    const expFirst = !!settled.expeditionFirst;
    const mastery = r.mastery || null;
    const update = mastery?.masteryUpdate || settled.masteryUpdate || {};
    const newBadges = mastery?.badgesEarned || mastery?.newBadges || update.newBadges || update.badgesEarned || [];
    const record = mastery?.record || update.record || null;
    const nextTarget = mastery?.nextTarget || update.nextTarget || null;

    const rows = [
      ...(isExp ? [[r.expedition.name, r.win ? 'CLEARED!' : 'failed']] : []),
      ['<span class="em"></span> Emeralds earned', `+${earned}`],
      ...(r.win && !isExp ? [['Victory bonus', `+${r.bonus}`]] : []),
      ...(expFirst && r.emeraldMul > 1 ? [['Expedition bonus', `${r.emeraldMul}× emeralds`]] : []),
      ...(streakBonus > 0 ? [[`Day ${streak} streak`, `+${streakBonus}`]] : []),
      ...(r.rods > 0 ? [['Blaze rods', `+${r.rods}`]] : []),
      ...(isExp && !expFirst && r.win ? [['↻ Replay', 'base reward only']] : []),
      ...(mastery?.objective ? [['Quest goal', mastery.objective.done ? 'DONE!' : `${mastery.objective.current}/${mastery.objective.target}`]] : []),
      ['Biggest crowd', `${r.bestCrowd}`],
      ...(r.mode === 'shooter' ? [[' Mobs blasted', `${r.kills}`]] : []),
      ...(isExp ? [] : [[' ' + r.biome, r.win ? 'CLEARED!' : 'try again!']]),
    ];

    return {
      title: r.win ? (isExp ? 'EXPEDITION DONE!' : 'VICTORY!') : 'CROWD WIPED OUT',
      titleClass: r.win ? 'win' : 'lose',
      rows,
      mastery,
      newBadges: newBadges.map(badgeLabel),
      record,
      nextTarget,
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
      {#if view.mastery}
        <div id="masteryCallout">
          <strong>{view.mastery.grade}</strong>
          <span>{view.mastery.label}<small>{view.mastery.praise}</small></span>
        </div>
        <div id="resultMasteryProgress">
          {#if view.newBadges.length}
            <div id="resultNewBadges">
              <span>NEW {view.newBadges.length === 1 ? 'BADGE' : 'BADGES'}</span>
              <strong>{view.newBadges.join(' · ')}</strong>
            </div>
          {/if}
          {#if view.record}
            <div id="resultMasteryRecord">
              <span>{view.record.isNew ? 'NEW RECORD' : 'CHAPTER RECORD'}</span>
              <strong>{view.record.bestGrade || view.record.grade || '—'} · CROWD {view.record.bestCrowd || '—'}</strong>
            </div>
          {/if}
          {#if view.nextTarget}
            <div id="resultNextTarget">
              <span>NEXT TARGET</span>
              <strong>{view.nextTarget.label}</strong>
            </div>
          {/if}
        </div>
      {/if}
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
