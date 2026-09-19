<script lang="ts">
  import { onMount } from 'svelte';
  import { getSaveStatus, subscribeSaveStatus, type SaveStatus } from '../../js/config.ts';
  import { go, nav } from '../lib/store.svelte.ts';
  let { pauseGame }: { pauseGame: (force?: boolean) => void } = $props();
  let status = $state<SaveStatus>(getSaveStatus());
  let warning = $state<HTMLElement>();
  let height = $state(0);
  onMount(() => subscribeSaveStatus(value => { status = value; }));
  $effect(() => {
    const stage = warning?.closest<HTMLElement>('#stage');
    stage?.style.setProperty('--save-warning-space', `${height + 16}px`);
    return () => stage?.style.removeProperty('--save-warning-space');
  });
  const copy: Record<SaveStatus, string> = {
    saved: '', corrupt: 'Stored save needs recovery. Its original data has been kept.',
    conflict: 'Another tab changed the save. Export this game before reloading.',
    replaced: 'Save replaced. Reload to use the new progress.',
    blocked: 'Could not save on this device. Export your progress before leaving.',
    'backup-failed': 'Could not save a backup. Check or export your progress.',
  };
</script>

{#if status !== 'saved'}
  <aside id="saveWarning" bind:this={warning} bind:clientHeight={height} role="status" aria-live="polite">
    <span>{copy[status]}</span>
    <button class="mcbtn small" onclick={() => { if (nav.playing) pauseGame(true); go('settings'); }}>SAVE & DATA</button>
    <a class="mcbtn small" href="./rescue.html" rel="external">RESCUE</a>
  </aside>
{/if}

<style>
  aside { position: absolute; z-index: 60; bottom: calc(var(--bar-bottom, 62px) + env(safe-area-inset-bottom) + 8px);
    left: 8px; right: 8px; padding: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    border: 2px solid var(--warn); border-radius: var(--radius); background: var(--surface-raised); color: var(--ink); font-size: 14px; }
  span { flex: 1 1 100%; } button, a { min-height: 44px; width: auto; flex: 1; display: inline-flex; justify-content: center; align-items: center; padding: 6px 12px; }
  a { color: inherit; text-decoration: underline; }
</style>
