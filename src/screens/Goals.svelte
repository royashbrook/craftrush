<!-- One useful mastery target, not a wall of boxes asking to be completed. -->
<script>
  import { save } from '../lib/store.svelte.js';
  import { CAMPAIGN, currentChapter } from '../../js/config.js';
  import {
    BADGES, chapterMastery, masteryChapterEligible, nextMasteryTarget,
  } from '../../js/mastery.js';
  import { ACHIEVEMENTS } from '../../js/achievements.js';
  import Sprite from '../lib/Sprite.svelte';

  let tab = $state('mastery');
  let selectedChapterId = $state('');
  const masteryChapters = CAMPAIGN.filter(masteryChapterEligible);
  const defaultChapter = $derived.by(() => {
    const current = currentChapter(save);
    if (masteryChapterEligible(current)) return current;
    const records = save.mastery?.chapters ?? {};
    const completed = save.campaign?.done ?? [];
    return masteryChapters
      .filter((entry) => Object.hasOwn(records, entry.id) || completed.includes(entry.id))
      .at(-1) || masteryChapters[0] || null;
  });
  const chapter = $derived(
    masteryChapters.find((entry) => entry.id === selectedChapterId) || defaultChapter,
  );
  const record = $derived(chapter ? chapterMastery(save, chapter.id) : null);
  const earned = $derived(BADGES.filter((badge) => record?.badges?.includes(badge.id)));
  const target = $derived(chapter ? nextMasteryTarget(save, chapter.id) : null);
  const achievements = $derived(save.achievements || []);
</script>

<div id="achievements" class="overlay">
  <div class="panel masteryGoals">
    <div class="goalsTabs" role="tablist" aria-label="Goals view">
      <button
        id="goalsTabMastery"
        class:sel={tab === 'mastery'}
        role="tab"
        aria-selected={tab === 'mastery'}
        onclick={() => { tab = 'mastery'; }}
      >MASTERY</button>
      <button
        id="goalsTabAchievements"
        class:sel={tab === 'achievements'}
        role="tab"
        aria-selected={tab === 'achievements'}
        onclick={() => { tab = 'achievements'; }}
      >ACHIEVEMENTS</button>
    </div>

    {#if tab === 'mastery'}
      <div class="masteryEyebrow">CHAPTER MASTERY</div>
      <label class="goalsChapterPicker" for="goalsChapterSelect">
        <span>CHAPTER</span>
        <select
          id="goalsChapterSelect"
          value={chapter?.id || ''}
          onchange={(event) => { selectedChapterId = event.currentTarget.value; }}
        >
          {#each masteryChapters as entry (entry.id)}
            <option value={entry.id}>{entry.name}</option>
          {/each}
        </select>
      </label>

      <div id="masteryRecord">
        <div>
          <span>BEST MARK</span>
          <strong id="masteryBestGrade">{record?.bestGrade || '—'}</strong>
        </div>
        <div>
          <span>BIGGEST CROWD</span>
          <strong id="masteryBestCrowd">{record?.bestCrowd || '—'}</strong>
        </div>
      </div>

      <section id="masteryBadges">
        <h2>BADGES EARNED <span>{earned.length}/{BADGES.length}</span></h2>
        {#if earned.length}
          <div class="masteryBadgeList">
            {#each earned as badge (badge.id)}
              <span class="masteryBadge" title={badge.description}>{badge.label}</span>
            {/each}
          </div>
        {:else}
          <p class="masteryEmpty">Your first badge is waiting in the next run.</p>
        {/if}
      </section>

      <section id="goalsNextTarget">
        <h2>NEXT TARGET</h2>
        {#if target}
          <strong>{target.label}</strong>
          {#if target.description}<p>{target.description}</p>{/if}
        {:else}
          <strong>CHAPTER MASTERED</strong>
          <p>Every mark is yours. Keep playing for a bigger crowd.</p>
        {/if}
      </section>
    {:else}
      <div class="chipRow">
        <span style="color:#fff">ACHIEVEMENTS</span>
        <span class="chip green" id="achCount">{achievements.length}/{ACHIEVEMENTS.length}</span>
      </div>
      <div id="achGrid">
        {#each ACHIEVEMENTS as achievement (achievement.id)}
          {@const got = achievements.includes(achievement.id)}
          <div class="achRow" class:locked={!got} class:special={achievement.special}>
            <Sprite name={achievement.icon} scale={2} />
            <div class="achText">
              <div class="achName">{got ? achievement.name : '???'}</div>
              <div class="achDesc">{achievement.desc}</div>
            </div>
            <div class="achMark">{got ? 'DONE' : 'LOCKED'}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
