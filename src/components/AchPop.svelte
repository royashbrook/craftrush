<!--
  The achievement popup: earn one (or several at once) and they slide in one
  after another. No refresh hook to forget — this watches the save fields the
  achievement predicates actually read, so a check runs whenever progress
  that could unlock one changes.
-->
<script>
  import { save, nav, commit } from '../lib/store.svelte.js';
  import { checkAchievements } from '../../js/achievements.js';
  import { Audio } from '../../js/audio.js';
  import Sprite from '../lib/Sprite.svelte';

  let queue = $state([]);
  let current = $state(null);

  // touch every save field an ACHIEVEMENTS[].check() reads, so this effect
  // reruns exactly when something that could newly unlock one changes
  $effect(() => {
    void [
      save.stats?.runs, save.stats?.kills, save.stats?.golems, save.stats?.gigas,
      save.stats?.totalEmeralds, save.stats?.expeditions,
      save.stats?.bossWins && Object.keys(save.stats.bossWins).length,
      save.bestCrowd, save.bestLevel,
      save.unlocked?.length, save.cosmeticsOwned?.length,
      save.cosmetics?.cape, save.cosmetics?.pet,
      save.inventory?.blazeRods,
      save.expedition?.streak,
    ];
    const newly = checkAchievements(save);
    if (newly.length) {
      commit();
      queue.push(...newly);
    }
  });

  // drain the queue one at a time; guarded so setting `current` below does not
  // re-enter while one is already showing
  $effect(() => {
    if (current || queue.length === 0) return;
    current = queue.shift();
    nav.achPop = current;
    Audio.sfx('powerup');
  });

  // Schedule dismissal only after `current` has settled. Doing this in the
  // queue-draining effect cancels its own timer when assigning `current`
  // retriggers that effect, leaving the popup stuck over every later screen.
  $effect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      nav.achPop = null;
      current = null;
    }, 2600);
    return () => clearTimeout(t);
  });
</script>

<div id="achPop" class:hidden={!current}>
  {#if current}
    <Sprite name={current.icon} id="achPopIcon" scale={3} />
  {/if}
  <div>
    <div id="achPopHead">Achievement Get!</div>
    <div id="achPopName">{current ? current.name : ''}</div>
  </div>
</div>
