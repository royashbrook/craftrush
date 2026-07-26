<!--
  The pause menu: resume, camera cycle, shop, goals, sound toggle, quit.

  Camera and sound both write straight to `save` and commit immediately —
  there is no separate refresh, the labels are derived from `save` itself.
-->
<script>
  import { save, nav, commit, go, togglePause } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { CAMERAS } from '../../js/config.js';
  import Sprite from '../lib/Sprite.svelte';

  let { game } = $props();

  const cameraLabel = $derived((CAMERAS[save.camera] || CAMERAS.far).label);
  const soundLabel = $derived(save.sound ? 'ALL SOUND ON' : 'ALL SOUND OFF');

  // don't let the music sequencer pile up notes while paused; pick back up
  // where the run left off (or the boss track) once this closes
  $effect(() => {
    Audio.stopMusic();
    // only pick the run's music back up if the run is actually resuming; leaving
    // for the shop keeps it suspended and the shop starts its own
    return () => { if (save.sound && !nav.paused) Audio.music(game.state === 'boss' ? 'boss' : 'run'); };
  });

  function resume() {
    Audio.sfx('click');
    game.paused = false;
    togglePause(false);
  }

  function cycleCamera() {
    Audio.sfx('click');
    const keys = Object.keys(CAMERAS);
    save.camera = keys[(keys.indexOf(save.camera) + 1) % keys.length];
    commit();
    game.applyCamera();
  }

  function openShop() {
    Audio.sfx('click');
    go('shop', { push: true });   // BACK returns to the pause menu
  }

  function openGoals() {
    Audio.sfx('click');
    go('goals', { push: true });
  }

  function toggleSound() {
    save.sound = !save.sound;
    Audio.setEnabled(save.sound);
    if (save.sound) Audio.unlock();
    commit();
  }

  function quit() {
    Audio.sfx('click');
    game.abandonRun();
    nav.playing = false;
    nav.paused = false;
    go('menu');
  }
</script>

<div id="pause" class="overlay">
  <div class="panel">
    <div class="logo" style="font-size:24px">PAUSED</div>
    <button class="mcbtn primary" id="btnResume" onclick={resume}>▶ RESUME</button>
    <button class="mcbtn rowBtn small" id="btnPauseCamera" onclick={cycleCamera}><Sprite name="ui_camera" />CAMERA: {cameraLabel}</button>
    <button class="mcbtn rowBtn small" id="btnPauseShop" onclick={openShop}><Sprite name="ui_person" />SKINS &amp; SHOP</button>
    <button class="mcbtn rowBtn small" id="btnPauseAch" onclick={openGoals}><Sprite name="ui_trophy" />ACHIEVEMENTS</button>
    <button class="mcbtn rowBtn small" id="btnPauseSound" onclick={toggleSound}><Sprite name="ui_sound_on" />{soundLabel}</button>
    <button class="mcbtn rowBtn small" id="btnQuit" onclick={quit}><Sprite name="ui_door" />GIVE UP</button>
  </div>
</div>
