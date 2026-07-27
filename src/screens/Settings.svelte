<!--
  Save & Data: automatic backups, a code you can copy or download, and a way
  back in if you paste one. RESET EVERYTHING keeps its confirm() guard — it
  destroys a kid's progress, and that is not something a stray tap should do.
-->
<script>
  import { tick } from 'svelte';
  import QRCode from 'qrcode';
  import { encodeSave, saveLink } from '../../js/savecode.js';
  import { save, nav } from '../lib/store.svelte.js';
  import { Audio } from '../../js/audio.js';
  import {
    ownsCraftRushCache,
    ownsCraftRushRegistration,
    updateReloadIsSafe,
  } from '../../js/pwa-safety.js';
  import {
    VERSION, dayStamp, exportSave, importSave, resetSave, listBackups, restoreBackup,
  } from '../../js/config.js';
  import Sprite from '../lib/Sprite.svelte';

  const code = $derived(exportSave(save));

  // backups live outside `save` (localStorage, keyed separately) so they are
  // read once per visit rather than derived; navigating away and back remounts
  // this screen and re-reads them, which is all the refresh this needs
  let backups = $state(listBackups());
  let importText = $state('');
  let qrShown = $state(false);
  let qrMsg = $state('');
  let updateMsg = $state('');
  let updateStatusEl = $state(null);

  async function showUpdateMessage(text) {
    updateMsg = text;
    await tick();
    updateStatusEl?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * The QR carries a LINK to the rescue page with the save in the fragment, not
   * the save alone. iOS has no BarcodeDetector, so the game cannot scan a code
   * itself on the device where this matters most — but the Camera app reads a QR
   * natively and offers to open a link. Nothing to install, no camera permission,
   * and the fragment never reaches a server.
   */
  async function showQr() {
    Audio.sfx('click');
    qrMsg = 'Building…';
    try {
      const raw = localStorage.getItem('craftrush_save_v1');
      if (!raw) { qrMsg = 'No save to share yet.'; return; }
      const link = saveLink(await encodeSave(raw));
      await QRCode.toCanvas(document.getElementById('saveQr'), link,
        { errorCorrectionLevel: 'L', margin: 2, width: 260 });
      qrShown = true;
      qrMsg = 'Scan this with the other device.';
    } catch (e) {
      qrShown = false;
      qrMsg = `Too big for a QR code — use COPY CODE instead. (${e.message})`;
    }
  }
  let setMsg = $state('');
  let showExport = $state(false);
  let exportEl = $state(null);

  function restore(day, level) {
    if (!confirm(`Go back to your ${day} save (level ${level})? Your current progress will be replaced.`)) return;
    if (restoreBackup(day)) {
      setMsg = 'Restored! Reloading…';
      setTimeout(() => location.reload(), 700);
    } else {
      setMsg = 'That backup could not be read.';
    }
  }

  function downloadSave() {
    Audio.sfx('click');
    const name = `craftrush-save-${dayStamp(Date.now())}.txt`;
    try {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg = `Saved ${name}`;
    } catch {
      showExport = true;
      setMsg = 'Could not save a file — copy the code instead.';
    }
  }

  async function copyCode() {
    Audio.sfx('click');
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      try { exportEl?.select(); document.execCommand('copy'); } catch { /* give up quietly */ }
    }
    setMsg = 'Copied! Keep it somewhere safe.';
  }

  function loadCode() {
    Audio.sfx('click');
    let hasCurrent = false;
    try { hasCurrent = localStorage.getItem('craftrush_save_v1') !== null; } catch { /* import will report failure */ }
    if (hasCurrent
        && !confirm('Replace this device’s save? Your current save will be kept as a one-step rollback on the rescue page.')) return;
    const merged = importSave(importText);
    if (merged) {
      setMsg = 'Loaded! Restarting…';
      setTimeout(() => location.reload(), 700);
    } else {
      setMsg = 'That code did not work. Check for typos.';
    }
  }

  async function forceUpdate() {
    Audio.sfx('click');
    if (!updateReloadIsSafe(nav)) {
      await showUpdateMessage('Finish or give up the current run before updating.');
      return;
    }
    await showUpdateMessage('Getting the latest version…');
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(ownsCraftRushCache).map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs
          .filter((r) => ownsCraftRushRegistration(r, location.href))
          .map((r) => r.unregister()));
      }
    } catch { /* clearing is best effort; the reload below still helps */ }
    // Cache and registration work is asynchronous. The player may have started
    // a run while it was in flight, so the entry guard alone is not enough.
    if (!updateReloadIsSafe(nav)) {
      await showUpdateMessage('Latest files are ready. Finish or give up the current run before reloading.');
      return;
    }
    location.reload();
  }

  function reset() {
    Audio.sfx('click');
    if (confirm('Reset EVERYTHING? Your emeralds, skins, and progress will be erased. This cannot be undone.')) {
      resetSave();
      location.reload();
    }
  }
</script>

<div id="settings" class="overlay">
  <div class="panel">
    <div class="setLabel">Automatic backups — one per day you play:</div>
    <div id="backupList" class="backupList">
      {#if backups.length === 0}
        <div class="backupEmpty">No backups yet — one is kept each day you beat a level.</div>
      {:else}
        {#each backups as b (b.day)}
          <button class="backupRow" onclick={() => restore(b.day, b.level)}>
            <span class="bDay">{b.day}</span>
            <span class="bMeta">LV {b.level} · {b.emeralds}</span>
          </button>
        {/each}
      {/if}
    </div>

    <div class="setLabel">Save a copy you can keep:</div>
    <button class="mcbtn small rowBtn" id="btnDownloadSave" onclick={downloadSave}><Sprite name="ui_bag" />SAVE TO A FILE</button>
    <button class="mcbtn small rowBtn" id="btnCopySave" onclick={copyCode}><Sprite name="ui_palette" />COPY CODE</button>

    <div class="setLabel">Paste a code to restore your game:</div>
    <textarea id="saveImport" class="saveBox" placeholder="paste your code here" bind:value={importText}></textarea>
    <button class="mcbtn small rowBtn" id="btnLoadSave" onclick={loadCode}><Sprite name="ui_back" />LOAD CODE</button>
    <button
      class="mcbtn small rowBtn"
      id="btnForceUpdate"
      aria-describedby="updateMsg"
      onclick={forceUpdate}
    ><Sprite name="ui_gear" />GET LATEST VERSION</button>
    <div
      id="updateMsg"
      class="setMsg"
      role="status"
      aria-live="polite"
      bind:this={updateStatusEl}
    >{updateMsg}</div>

    <div class="setLabel">Reloads the app files. Your save is NOT touched.</div>

    <div class="setLabel">Move your progress to another device:</div>
    <button class="mcbtn small rowBtn" id="btnShowQr" onclick={showQr}>
      <Sprite name="ui_world" />SHOW SAVE AS QR CODE
    </button>
    <div class="setMsg">{qrMsg}</div>
    <canvas id="saveQr" class="saveQr" class:hidden={!qrShown}></canvas>
    <div class="setLabel" class:hidden={!qrShown}>
      Point another device's camera at this. On iPhone the normal Camera app reads it.
    </div>

    <!-- Reachable from INSIDE the app on purpose. An installed app has no
         address bar, and on iOS its storage is separate from the browser's, so
         this is the only route to that save if the game ever will not start. -->
    <a class="mcbtn small rowBtn" id="btnRescue" href="./rescue.html" rel="external">
      <Sprite name="ui_bag" />SAVE RESCUE PAGE
    </a>
    <div class="setLabel">
      Works even if the game stops starting. Note the installed app and the browser
      each keep their own separate save.
    </div>
    <button class="mcbtn small rowBtn" id="btnReset" onclick={reset}><Sprite name="ui_trash" />RESET EVERYTHING</button>

    <textarea id="saveExport" class="saveBox" class:hidden={!showExport} readonly bind:this={exportEl}>{code}</textarea>
    <div id="setMsg">{setMsg}</div>
    <div class="setLabel" style="opacity:0.6">v{VERSION}</div>
  </div>
</div>
