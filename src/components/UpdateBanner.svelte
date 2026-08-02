<script>
  import { nav } from '../lib/store.svelte.js';
  import { updateReloadIsSafe } from '../../js/pwa-safety.js';

  let { state = 'idle', onApply = () => {} } = $props();
  const visible = $derived(state !== 'idle' && updateReloadIsSafe(nav));
</script>

{#if visible}
  <aside id="updateBanner" role="status" aria-live="polite" aria-atomic="true">
    <span class="updateMark" aria-hidden="true">↻</span>
    <span class="updateCopy">
      <b>{state === 'applying' ? 'UPDATING…' : 'UPDATE READY'}</b>
      <small>{state === 'applying' ? 'Opening the latest build.' : 'A new version is ready to play.'}</small>
    </span>
    <button id="btnApplyUpdate" type="button" onclick={onApply} disabled={state === 'applying'}>
      {state === 'applying' ? 'LOADING…' : 'UPDATE'}
    </button>
  </aside>
{/if}
