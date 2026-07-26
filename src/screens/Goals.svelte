<!--
  Goals: every achievement, earned ones lit and the rest dimmed, Java-edition
  style — quiet about what an unearned one needs, just its name held back.
-->
<script>
  import { save } from '../lib/store.svelte.js';
  import { ACHIEVEMENTS } from '../../js/achievements.js';
  import Sprite from '../lib/Sprite.svelte';

  const owned = $derived(save.achievements || []);
</script>

<div id="achievements" class="overlay">
  <div class="panel">
    <div class="chipRow">
      <span style="color:#fff">ACHIEVEMENTS</span>
      <span class="chip green" id="achCount">{owned.length}/{ACHIEVEMENTS.length}</span>
    </div>
    <div id="achGrid">
      {#each ACHIEVEMENTS as a (a.id)}
        {@const got = owned.includes(a.id)}
        <div class="achRow" class:locked={!got} class:special={a.special}>
          <Sprite name={a.icon} scale={2} />
          <div class="achText">
            <div class="achName">{got ? a.name : '???'}</div>
            <div class="achDesc">{a.desc}</div>
          </div>
          <div class="achMark">{got ? 'DONE' : 'LOCKED'}</div>
        </div>
      {/each}
    </div>
  </div>
</div>
