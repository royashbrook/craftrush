<script lang="ts">
  import { onMount } from 'svelte';
  import type { UpdateStatus } from '../lib/update.ts';
  let { state, onCheck, onClose }: {
    state: UpdateStatus; onCheck: () => void; onClose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  onMount(() => {
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous instanceof HTMLElement) previous.focus(); };
  });
  const status: Record<UpdateStatus, string> = {
    idle: 'Ready to check', checking: 'Checking…', current: 'This build is current',
    downloading: 'Downloading an update…', ready: 'Update ready', offline: 'Could not reach the update server',
    failed: 'Update did not finish. Try again.', unavailable: 'Updates are unavailable in this browser',
    applying: 'Opening the downloaded build…', unsaved: 'Save or export your progress before updating',
  };
</script>

<dialog bind:this={dialog} oncancel={onClose} onkeydown={(event) => {
  // Keep the game-wide pause shortcut from cancelling the browser's native
  // Escape-to-close action. The dialog itself still receives that action.
  if (event.key === 'Escape') event.stopPropagation();
}} aria-labelledby="releaseTitle">
  <h2 id="releaseTitle">CRAFT RUSH</h2>
  <p>v{__RELEASE__.version}</p>
  <dl>
    <dt>Build</dt><dd>{__RELEASE__.fingerprint.slice(0, 12)}</dd>
    <dt>Source</dt><dd>{__RELEASE__.source.slice(0, 12)}</dd>
  </dl>
  <p role="status">{status[state]}</p>
  <div class="actions">
    <button class="mcbtn small primary" onclick={onCheck} disabled={state === 'checking' || state === 'applying'}>CHECK FOR UPDATES</button>
    <button class="mcbtn small" onclick={onClose}>CLOSE</button>
  </div>
</dialog>

<style>
  dialog { position: fixed; inset: 0; margin: auto; max-width: min(90vw, 28rem);
    max-height: 90dvh; overflow: auto; border: 3px solid var(--line); border-radius: var(--radius);
    background: var(--surface-raised); color: var(--ink); padding: 1.25rem; }
  dialog::backdrop { background: var(--overlay-bg); }
  h2 { margin: 0; } p { margin: .8rem 0; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .4rem 1rem; }
  dd { margin: 0; overflow-wrap: anywhere; font-family: var(--font-mono); }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  button { min-height: 44px; padding: .5rem .8rem; }
</style>
