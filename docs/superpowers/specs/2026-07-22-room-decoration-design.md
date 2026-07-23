# Room Decoration (slice of #35)

## Goal

Turn the Playroom into a decorate-and-build sandbox: buy placeable furniture and
room backdrops. Another emerald sink; the room-building half of the Toca-Boca
feel to go with the dressable playmates.

## Decorations

A `🛋️ DECOR` catalog (in the Playroom) sells furniture. Each buy drops one
draggable instance into the room (reusing the playmate drag), removable with a ✕.

`DECOR` (config.js): chest (reuses existing sprite), torch, plant, crafting
table, cake, painting, bed — each `{ id, name, sprite, cost }`, costs 30–250.
`save.decor: [{ item, x, y }]` with x,y fractions; migration filters unknown ids
and clamps positions.

## Room backdrops

A `🎨 ROOM` picker sells backdrop styles (CSS gradients): Grassy Yard (free),
Oak Cabin (600), Stone Hall (2000), Quartz Palace (6000). Owned rooms switch for
free. `save.roomTier` + `save.roomTiersOwned` (always includes 'yard'); the
current tier's gradient is applied as the scene background.

## Sprites

Six furniture sprites authored in parallel by a workflow (one agent per sprite in
the CORE char-matrix format), format-validated with `tools/validate_sprites.mjs`;
the painting was hand-corrected (a malformed hex + row lengths). `chest` reuses
the existing item sprite. New `js/sprites/decor.js` registered in the pack list.
`drawSprite(cv, name)` fits any decoration bottom-anchored into a canvas.

## Tests

- Fresh save: empty `decor`, `roomTier: 'yard'`, `roomTiersOwned: ['yard']`.
- `decorById`/`roomTierById` resolve valid ids and fall back safely.
- Browser: buy deducts + places, room tiers buy/own/switch (owned is free), decor
  drags and removes, playroom fits mobile.

## Out of scope (later)

Trail/pet on playmates, grid snapping, layering controls, prestige.
