<!--
  The menu: where you are in the quest, the two modes, and today's expedition.

  The quest card names the chapter the next START will actually play, so the
  campaign is something you can see yourself walking through. When it says you
  are short of something, it says exactly how short.
-->
<script>
  import { tick } from 'svelte';
  import { save, nav, commit } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import {
    VERSION, BIOMES, CAMPAIGN, RESOURCES, currentChapter, chapterMissing,
    dailyExpedition, expeditionStatus,
  } from '../../js/config.js';
  import Sprite from '../lib/Sprite.svelte';

  let { game } = $props();

  let panel = $state(null);
  let tier = $state('');          // '', 'compact' or 'compact tight'

  const biome = $derived(BIOMES[(save.level - 1) % BIOMES.length]);
  const done = $derived(save.campaign?.done ?? []);
  const chapter = $derived(currentChapter(save));
  const next = $derived(CAMPAIGN.find((c) => !done.includes(c.id)));
  const missing = $derived(next && chapter && next.id !== chapter.id ? chapterMissing(save, next.id) : null);
  const exp = $derived(dailyExpedition());
  const expStat = $derived(expeditionStatus(save));

  function start(mode) {
    Audio.unlock();
    Audio.sfx('click');
    save.mode = mode;
    commit();
    nav.playing = true;
    game.startRun();
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

  // The menu must never scroll, and how tall it is depends on what is in it (a
  // quest card, a replay button) as much as on the screen. So it measures itself
  // after each render and steps down through two compact tiers until it fits.
  // A height breakpoint cannot do this: it does not know what is on the page.
  $effect(() => {
    void [chapter, missing, exp, save.level];   // re-measure when the content changes
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

    <div id="questCard">
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
      {#if !chapter}
        <button class="mcbtn small" id="btnQuestReplay" onclick={replayWalkHome}>REPLAY THE WALK HOME</button>
      {/if}
    </div>

    <div class="gameCard" id="cardShooter" class:sel={save.mode === 'shooter'}>
      <div class="gameHead"><Sprite name="ui_bow" />BOW BLITZ</div>
      <div class="gameDesc">Your crowd auto-fires arrows. Blast mobs, shoot gates to boost them.</div>
      <button class="mcbtn small primary" id="btnPlayShooter" onclick={() => start('shooter')}>START</button>
    </div>

    <div class="gameCard" id="cardGates" class:sel={save.mode === 'gates'}>
      <div class="gameHead"><Sprite name="ui_door" />GATE DASH</div>
      <div class="gameDesc">No shooting. Pure gates, dodging, and the golem. Grow a giant crowd.</div>
      <button class="mcbtn small primary" id="btnPlayGates" onclick={() => start('gates')}>START</button>
    </div>

    <div id="expCard">
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
