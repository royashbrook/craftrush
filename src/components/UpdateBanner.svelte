<script lang="ts">
  import { nav } from '../lib/store.svelte.ts';
  import type { UpdateState } from '../lib/store.svelte.ts';
  import { updateReloadIsSafe } from '../../js/pwa-safety.ts';

  let { state = 'idle', onApply = () => {}, onCheck = () => {} }: {
    state?: UpdateState; onApply?: () => void; onCheck?: () => void;
  } = $props();
  const visible = $derived(['ready', 'applying', 'failed', 'unsaved'].includes(state) && updateReloadIsSafe(nav));
  const copy = $derived(state === 'applying' ? ['UPDATING…', 'Opening the downloaded build.']
    : state === 'failed' ? ['UPDATE DID NOT FINISH', 'Your current game is still here. Try again.']
    : state === 'unsaved' ? ['SAVE FIRST', 'Progress could not be saved. Export it before updating.']
    : ['UPDATE READY', 'A new version is ready to play.']);
</script>

{#if visible}
  <aside id="updateBanner" role="status" aria-live="polite" aria-atomic="true">
    <span class="updateMark" aria-hidden="true">↻</span>
    <span class="updateCopy">
      <b>{copy[0]}</b>
      <small>{copy[1]}</small>
    </span>
    <button id="btnApplyUpdate" type="button" onclick={state === 'failed' ? onCheck : onApply} disabled={state === 'applying' || state === 'unsaved'}>
      {state === 'applying' ? 'LOADING…' : state === 'failed' ? 'RETRY' : 'UPDATE'}
    </button>
  </aside>
{/if}
