<!--
  The global stylesheet, and nothing else. Every screen shares one plain CSS
  file rather than scoped component styles: the look is a single coherent pixel
  theme, and splitting it per component would only make it harder to keep so.
-->
<script>
  import '../app.css';
  let { children } = $props();
</script>

<svelte:head>
  <title>Craft Rush</title>
</svelte:head>

{@render children()}
