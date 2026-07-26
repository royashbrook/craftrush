# Screens

How the UI is put together. The port is done; this is the shape to keep.

## The shape

- **Svelte 5 runes.** `$state`, `$derived`, `$props`, `$effect`. No stores, no
  `export let`, no `$:` labels.
- **One component per screen**, in `src/screens/`. Chrome that floats over
  everything (HUD, pause, toasts) lives in `src/components/`.
- **No `<style>` blocks.** All CSS is global in `src/app.css` and already
  written. Use the existing class names. If a style is genuinely missing, add it
  to `src/app.css` rather than scoping it into a component.

## State

```js
import { save, nav, commit, go, back } from '../lib/store.svelte.js';
```

- `save` is the player's save, and it is a `$state` proxy. **The engine holds
  the same proxy**, so a run banking emeralds updates every screen showing them.
  Read it directly; never copy it into local state.
- `commit()` writes to localStorage. Reads are reactive, saving is deliberate:
  call it after you change something worth keeping.
- `nav` holds `screen`, `stack`, `playing`, `paused`, `toast`, `result`.
- `go('shop')` navigates, `back()` goes up.

**There is no refresh hook, and adding one is a bug.** The old code made every
screen declare a `refresh` method that ran on entry, and forgetting it caused
stale prices and blank tabs more than once. Derive from `save` instead and it
cannot happen.

```js
const price = $derived(villagerCost(v.id, crew[v.id] ?? 0));   // yes
let price = villagerCost(...); function refresh() { price = ... }  // no
```

## Sprites

```svelte
<script>import Sprite from '../lib/Sprite.svelte';</script>

<Sprite name="ui_pickaxe" />                       <!-- an icon -->
<Sprite name="cape" palette={def.colors} palKey={def.id} scale={4} />
```

It redraws itself when its props change. Never call `getSprite` and poke a
canvas by hand unless you are drawing a whole scene.

## Element ids

**Keep every `id` the old markup had.** The Playwright suite drives them, and
that suite is the proof this port did not change behaviour. Copy the markup
structure and class names from `index.html` as closely as you can; change the
logic, not the shape.

## Canvas screens

The mine, the world map and the playroom each own a `<canvas>` and drive an
existing class (`MineWorld`, `TownScene`) or their own pointer maths. Those port
across unchanged: bind the canvas, set it up in `$effect`, and keep the
animation loop. Do not try to make the canvas contents reactive.

```svelte
let canvas = $state(null);
$effect(() => {
  if (!canvas) return;
  const world = new MineWorld(canvas, save);
  let raf, run = () => { world.update(1/30); world.draw(); raf = requestAnimationFrame(run); };
  run();
  return () => cancelAnimationFrame(raf);     // cleanup matters, screens unmount now
});
```

Screens unmount when you navigate away, which the old code never did. Anything
with a timer, an animation frame or a listener must return a cleanup.

## Audio

```js
import { Audio } from '../../js/audio.js';
Audio.sfx('click');    // on a tap
Audio.unlock();        // before the first sound of a gesture
```

Existing sfx names: `click`, `buy`, `gate_bad`, `hit`, `bigboom`, `hurt`.

## Three traps, all of which bit during the port

**Do not put a value the engine reuses straight into `$state`.** `hudState()`
returns the SAME object every frame on purpose, to stay allocation-free. Assigning
that reference never looks like a change, so the HUD rendered once and froze.
`main.js` copies it.

**Do not call a function that mutates the save from inside `$derived`.**
`migrateWorld()` writes `save.world`, so deriving from it wrote the state it read
and Svelte looped until it gave up. It runs once, in the store.

**Objects nothing renders from should not be `$state`.** `MineWorld` and
`TownScene` are created inside an `$effect`; making them reactive meant the
effect wrote state on every run. They are plain `let`.

The common thread: reactivity is for what the screen DRAWS. Engine objects,
canvases and per-frame values are not that.

## What good looks like

`src/screens/Menu.svelte` is the reference. It reads `save`, derives everything,
keeps the old ids, and has no refresh anywhere.
