<!--
  The global stylesheet, and nothing else. Every screen shares one plain CSS
  file rather than scoped component styles: the look is a single coherent pixel
  theme, and splitting it per component would only make it harder to keep so.

  No svelte:head here: with ssr off it only runs after boot, so the title and
  description live in src/app.html where the served bytes carry them.
-->
<script>
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
