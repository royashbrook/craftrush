<!-- The runner is the product. One large action starts the selected mode; the
  quest and expedition sit behind it as reasons to run, never destinations that
  compete with it. -->
<script>
  import { onMount, tick } from 'svelte';
  import { save, nav, commit, go, toast } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import {
    VERSION, BIOMES, CAMPAIGN, RESOURCES, currentChapter, chapterMissing,
    dailyExpedition, expeditionStatus, importSave,
  } from '../../js/config.js';
  import { masteryChapterEligible, nextMasteryTarget } from '../../js/mastery.js';
  import { isStandaloneApp, shouldOfferLegacyRestore } from '../../js/pwa-safety.js';
  import Sprite from '../lib/Sprite.svelte';

  let { game } = $props();

  let panel = $state(null);
  let tier = $state('');          // '', 'compact' or 'compact tight'
  let standalone = $state(false);
  let restoreBusy = $state(false);
  let restoreMessage = $state('');
  let restoreDone = $state(false);
  let restoreOfferLatched = $state(false);

  const LEGACY_RESTORE_DONE_KEY = 'craftrush_legacy_restore_done_v1';
  const LEGACY_RESTORE_OFFER_KEY = 'craftrush_legacy_restore_offer_v1';

  const done = $derived(save.campaign?.done ?? []);
  const chapter = $derived(currentChapter(save));
  const levelBiome = $derived(BIOMES[(save.level - 1) % BIOMES.length]);
  const biome = $derived(
    chapter && !chapter.cycleBiomes
      ? (BIOMES.find((entry) => entry.id === chapter.biome) || levelBiome)
      : levelBiome,
  );
  const next = $derived(CAMPAIGN.find((c) => !done.includes(c.id)));
  const missing = $derived(next && chapter && next.id !== chapter.id ? chapterMissing(save, next.id) : null);
  const exp = $derived(dailyExpedition());
  const expStat = $derived(expeditionStatus(save));
  const masteryTarget = $derived(
    masteryChapterEligible(chapter) ? nextMasteryTarget(save, chapter.id) : null,
  );
  const offerLegacyRestore = $derived(
    standalone
      && !restoreDone
      && (restoreOfferLatched || shouldOfferLegacyRestore(save, standalone)),
  );

  onMount(() => {
    standalone = isStandaloneApp();
    if (!standalone) return;
    try {
      restoreDone = localStorage.getItem(LEGACY_RESTORE_DONE_KEY) === '1';
      restoreOfferLatched = localStorage.getItem(LEGACY_RESTORE_OFFER_KEY) === '1';
      if (!restoreDone && !restoreOfferLatched && shouldOfferLegacyRestore(save, true)) {
        localStorage.setItem(LEGACY_RESTORE_OFFER_KEY, '1');
        restoreOfferLatched = true;
      }
    } catch {
      // Private browsing can deny storage. Keep the recovery action available
      // for this visit instead of hiding the only route to the old save.
      restoreOfferLatched = !restoreDone && shouldOfferLegacyRestore(save, true);
    }
  });

  function finishLegacyRestoreOffer() {
    restoreDone = true;
    restoreOfferLatched = false;
    try {
      localStorage.setItem(LEGACY_RESTORE_DONE_KEY, '1');
      localStorage.removeItem(LEGACY_RESTORE_OFFER_KEY);
    } catch { /* the in-memory dismissal still works for this visit */ }
  }

  function dismissLegacyRestore() {
    Audio.unlock();
    Audio.sfx('click');
    finishLegacyRestoreOffer();
  }

  function start(mode) {
    Audio.unlock();
    Audio.sfx('click');
    save.mode = mode;
    commit();
    nav.playing = true;
    game.startRun();
  }

  function selectMode(mode) {
    Audio.unlock();
    Audio.sfx('click');
    save.mode = mode;
    commit();
  }

  function startExpedition() {
    Audio.unlock();
    Audio.sfx('click');
    nav.playing = true;
    game.startRun(dailyExpedition());
  }

  function replayWalkHome() {
    Audio.unlock();
    Audio.sfx('click');
    nav.playing = true;
    game.startRun(null, 'credits');
  }

  async function restoreCopiedSave() {
    Audio.unlock();
    Audio.sfx('click');
    restoreBusy = true;
    restoreMessage = 'Checking your copied save…';
    let code = '';
    try {
      code = await navigator.clipboard?.readText();
    } catch { /* the paste screen below is the permission-safe fallback */ }
    if (code && importSave(code)) {
      finishLegacyRestoreOffer();
      restoreMessage = 'Save restored! Restarting…';
      setTimeout(() => location.reload(), 500);
      return;
    }
    restoreBusy = false;
    toast(code ? 'THAT WAS NOT A CRAFT RUSH SAVE' : 'PASTE YOUR OLD SAVE CODE');
    nav.restoreIntent = true;
    go('settings');
  }

  // The menu must never scroll, and how tall it is depends on what is in it (a
  // quest card, a replay button) as much as on the screen. So it measures itself
  // after each render and steps down through two compact tiers until it fits.
  // A height breakpoint cannot do this: it does not know what is on the page.
  $effect(() => {
    void [chapter, missing, exp, masteryTarget, save.level, offerLegacyRestore];
    if (!panel) return;
    const el = panel;
    let cancelled = false;
    (async () => {
      // await each step so the browser has actually applied the class before the
      // next measurement. Measuring in one pass reads the previous tier's layout
      // and picks the wrong one.
      const spills = () => el.scrollHeight - el.clientHeight > 1;
      for (const step of ['', 'compact', 'compact tight']) {
        if (cancelled) return;
        tier = step;
        await tick();
        if (!spills()) return;
      }
    })();
    return () => { cancelled = true; };
  });
</script>

<div id="menu" class="overlay {tier}">
  <div id="verTag">v{VERSION}</div>
  <div class="logo">CraftRush</div>
  <div class="panel" bind:this={panel}>
    <div class="levelChip" id="menuLevel">LV {save.level} · {biome.name.toUpperCase()}</div>

    {#if offerLegacyRestore}
      <div id="legacyRestore">
        <div id="legacyRestoreText">
          <b>PLAYED BEFORE THE MOVE?</b>
          <span>Your old app and this one keep separate saves.</span>
        </div>
        <button
          class="mcbtn small"
          id="btnRestoreCopiedSave"
          disabled={restoreBusy}
          onclick={restoreCopiedSave}
        >{restoreBusy ? restoreMessage : 'RESTORE COPIED SAVE'}</button>
        <button
          class="legacyDismiss"
          id="btnDismissLegacyRestore"
          disabled={restoreBusy}
          onclick={dismissLegacyRestore}
        >NOT MY OLD APP</button>
      </div>
    {/if}

    <section id="playHero" class:gateMode={save.mode === 'gates'}>
      <div id="playHeroCopy">
        <Sprite name={save.mode === 'shooter' ? 'ui_bow' : 'ui_door'} id="playHeroIcon" scale={5} />
        <div>
          <span>READY TO RUN</span>
          <strong>{save.mode === 'shooter' ? 'BOW BLITZ' : 'GATE DASH'}</strong>
          <small>{save.mode === 'shooter'
            ? 'Steer the archers, multiply the volley, break the boss.'
            : 'Choose the gates, dodge the danger, grow the crowd.'}</small>
        </div>
      </div>
      {#if save.mode === 'shooter'}
        <button class="mcbtn primary" id="btnPlayShooter" onclick={() => start('shooter')}>▶ PLAY BOW BLITZ</button>
      {:else}
        <button class="mcbtn primary" id="btnPlayGates" onclick={() => start('gates')}>▶ PLAY GATE DASH</button>
      {/if}
    </section>

    <div id="modePicker" aria-label="Game mode">
      <button class:sel={save.mode === 'shooter'} id="btnModeShooter" onclick={() => selectMode('shooter')}>
        <Sprite name="ui_bow" />BOW BLITZ
      </button>
      <button class:sel={save.mode === 'gates'} id="btnModeGates" onclick={() => selectMode('gates')}>
        <Sprite name="ui_door" />GATE DASH
      </button>
    </div>

    <div id="questCard" class="menuSupportCard">
      <div id="questHead">YOUR QUEST<span id="questStep">{done.length} OF {CAMPAIGN.length}</span></div>
      <div id="questBody">
        <Sprite name={chapter ? chapter.icon : 'ui_trophy'} class="" id="questIcon" scale={4} />
        <div class="expText">
          <div id="questName">{chapter ? chapter.name.toUpperCase() : 'QUEST COMPLETE'}</div>
          <div id="questDesc">
            {chapter ? chapter.blurb : 'The dragon, the wither, all of it. Nothing left to beat.'}
          </div>
        </div>
      </div>
      <div id="questNeed">
        {#if missing}
          Need {Object.entries(missing).map(([k, n]) => `${n} more ${RESOURCES[k].label}`).join(', ')} for {next.name}.
        {/if}
      </div>
      {#if masteryChapterEligible(chapter)}
        <div id="menuMasteryTarget">
          <span>YOUR NEXT MARK</span>
          <b>{masteryTarget?.label || 'CHAPTER MASTERED'}</b>
        </div>
      {/if}
      {#if !chapter}
        <button class="mcbtn small" id="btnQuestReplay" onclick={replayWalkHome}>REPLAY THE WALK HOME</button>
      {/if}
    </div>

    <div id="expCard" class="menuSupportCard">
      <div id="expHead">
        TODAY'S EXPEDITION<span id="expStreak">{expStat.streak > 0 ? `${expStat.streak} DAY STREAK` : ''}</span>
      </div>
      <div id="expBody">
        <Sprite name={exp.icon} class="" id="expIcon" scale={4} />
        <div class="expText">
          <div id="expName">{exp.name}</div>
          <div id="expDesc">{exp.desc} (new expedition every week)</div>
        </div>
      </div>
      <button class="mcbtn small" id="btnExpedition" onclick={startExpedition}>
        {expStat.doneToday ? '↻ REPLAY EXPEDITION' : '▶ START EXPEDITION'}
      </button>
    </div>
  </div>
</div>
