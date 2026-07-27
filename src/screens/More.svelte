<!--
  The meta menu: the settings and screens that don't deserve a tab of their own.

  Ported from the old refreshMore. There is no refresh to forget —
  every label below is derived straight from `save`, so it can never go stale.
-->
<script>
  import { save, go, commit } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import { CAMERAS, SPEEDS, speedById } from '../../js/config.js';
  import Sprite from '../lib/Sprite.svelte';

  let { game } = $props();

  const soundIcon = $derived(save.sfx ? 'ui_sound_on' : 'ui_sound_off');
  const soundLabel = $derived(save.sfx ? 'EFFECTS ON' : 'EFFECTS OFF');
  const musicIcon = $derived(save.music ? 'ui_sound_on' : 'ui_sound_off');
  const musicLabel = $derived(save.music ? 'MUSIC ON' : 'MUSIC OFF');
  const pace = $derived(speedById(save.speed));
  const speedLabel = $derived(`PACE: ${pace.label} · ${pace.rewardMul}x REWARD`);
  const cameraLabel = $derived(`CAMERA: ${(CAMERAS[save.camera] || CAMERAS.far).label}`);

  function onGoals() {
    Audio.sfx('click');
    go('goals');
  }

  function onCamera() {
    Audio.sfx('click');
    const keys = Object.keys(CAMERAS);
    save.camera = keys[(keys.indexOf(save.camera) + 1) % keys.length];
    commit();
    game.applyCamera();
  }

  function onSpeed() {
    Audio.sfx('click');
    const ids = SPEEDS.map((x) => x.id);
    save.speed = ids[(ids.indexOf(save.speed || 'normal') + 1) % ids.length];
    commit();
  }

  function onMusic() {
    save.music = !save.music;
    Audio.unlock();
    Audio.setMusic(save.music);
    if (save.music) Audio.music('menu');
    commit();
  }

  function onSound() {
    save.sfx = !save.sfx;
    Audio.setSfx(save.sfx);
    if (save.sfx) { Audio.unlock(); Audio.sfx('click'); }
    commit();
  }

  function onSave() {
    Audio.sfx('click');
    go('settings');
  }

  function onAbout() {
    Audio.sfx('click');
    go('about');
  }
</script>

<div id="more" class="overlay">
  <div class="panel">
    <button class="mcbtn small rowBtn" id="btnGoals" onclick={onGoals}><Sprite name="ui_trophy" />GOALS</button>
    <button class="mcbtn small rowBtn" id="btnCameraMore" onclick={onCamera}><Sprite name="ui_camera" /><span id="cameraLabel">{cameraLabel}</span></button>
    <button class="mcbtn small rowBtn" id="btnSpeedMore" onclick={onSpeed}><Sprite name="ui_play" /><span id="speedLabel">{speedLabel}</span></button>
    <button class="mcbtn small rowBtn" id="btnMusicMore" onclick={onMusic}><Sprite name={musicIcon} /><span id="musicLabel">{musicLabel}</span></button>
    <button class="mcbtn small rowBtn" id="btnSoundMore" onclick={onSound}><Sprite name={soundIcon} /><span id="soundLabel">{soundLabel}</span></button>
    <button class="mcbtn small rowBtn" id="btnSaveMore" onclick={onSave}><Sprite name="ui_gear" />SAVE &amp; DATA</button>
    <button class="mcbtn small rowBtn" id="btnAbout" onclick={onAbout}><Sprite name="ui_info" />ABOUT</button>
  </div>
</div>
