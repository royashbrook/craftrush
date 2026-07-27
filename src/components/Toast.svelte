<!--
  Tutorial toasts. One line, at the right moment, then gone.

  The store already owns the auto-hide timer (see toast() in store.svelte.js);
  this only maps the kind it was given onto the copy it means and shows it
  while nav.toast is non-null.
-->
<script>
  import { nav } from '../lib/store.svelte.js';

  const text = $derived(nav.toast === 'steer'
    ? 'DRAG ANYWHERE TO STEER!'
    : 'GOLEM READY: TAP OR PRESS SPACE!');
</script>

<div id="toast" class:hidden={!nav.toast}>{nav.toast ? text : ''}</div>
