<!--
  One sprite from the atlas, drawn into a canvas at whole-pixel scale.

  Used for every pixel-art icon in the chrome. Redraws itself when the name or
  the palette changes, so a skin swap in the shop updates the preview without
  anyone calling a repaint.
-->
<script>
  import { getSprite, hasSprite } from '../../js/assets.js';

  let {
    /** sprite id, e.g. 'ui_pickaxe' */
    name,
    /** optional palette override, for skins and capes */
    palette = null,
    /** cache key for the palette variant */
    palKey = null,
    /** device pixels per art pixel; 2 keeps it crisp without blurring */
    scale = 2,
    /** which frame, for animated sprites */
    frame = 0,
    class: klass = 'icon',
    ...rest
  } = $props();

  let canvas = $state(null);

  $effect(() => {
    // referenced so the effect re-runs when any of them change
    const [n, p, k, s, f] = [name, palette, palKey, scale, frame];
    if (!canvas || !n || !hasSprite(n)) return;
    const spr = getSprite(n, p, k);
    canvas.width = spr.w * s;
    canvas.height = spr.h * s;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(spr.frames[f % spr.frames.length], 0, 0, canvas.width, canvas.height);
  });
</script>

<canvas bind:this={canvas} class={klass} {...rest}></canvas>
