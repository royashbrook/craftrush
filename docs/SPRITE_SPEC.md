# CRAFT RUSH — Sprite Pack Spec

Pixel-art sprite data for a Minecraft-inspired crowd-runner game. Original art only —
"in the style of" blocky voxel mobs, NOT copies of Mojang textures.

## File format

Each pack is an ES module at `js/sprites/<pack>.js` exporting ONE const object.
Export names: `HOSTILES`, `BOSSES`, `SCENERY`, `ITEMS` (one per file).

```js
export const HOSTILES = {
  creeper: {
    w: 16, h: 24,            // pixel grid size (max 64x64)
    anchor: 'bottom',        // 'bottom' = feet on ground (mobs/scenery), 'center' = items/floating
    palette: { g:'#4fbf3c', G:'#3da52e', k:'#0f1a0c' },   // single-char keys -> hex
    frames: [
      [ "................", /* exactly h rows, each exactly w chars */ ],
      [ /* optional frame 2 for walk/idle animation */ ],
    ],
  },
  // ...more sprites
};
```

## Hard rules (validator enforces)

- Every row string length === `w`. Every frame has exactly `h` rows.
- Every non-`.` char must exist in `palette`. `.` = transparent.
- All frames of a sprite share w/h.
- `anchor` is `'bottom'` or `'center'`.
- Pure data module. No imports, no functions, no comments containing backticks.
- Validate before finishing: `node tools/validate_sprites.mjs js/sprites/<file>.js` must print `OK`.

## Style guide (quality bar)

- Blocky voxel look: big cubic head, chunky limbs, straight edges. No anti-aliasing, no gradients.
- 2–4 shades per hue. Texture via mottling: sprinkle mid/dark shade pixels ~15% like Minecraft grass noise.
- Outline with the DARKEST shade of the sprite's own hue, not pure black. Pure near-black only for eyes/mouth.
- Faces are the identity: eyes/mouth must read at small size. When in doubt, bigger eyes.
- Silhouette first: sprite must be recognizable as a filled black shape.
- Mobs are FRONT view (they face the camera; player runs toward them).
- 2 frames wherever the mob walks/hops/flaps (alternate leg lengths, squash+stretch for slimes, wing up/down).
- Kid-friendly cartoon: cute-menacing, not scary. Round-ish proportions, oversized heads.

## Reference art — this is the bar (include verbatim in HOSTILES as `creeper`)

```js
creeper: {
  w: 16, h: 24, anchor: 'bottom',
  palette: { a:'#66d94f', g:'#4fbf3c', G:'#3da52e', d:'#2b7d20', m:'#1e4f16', k:'#0f1a0c' },
  frames: [
    [
      "...gaggGggagg...",
      "...agGggaggGg...",
      "...ggggGggggG...",
      "...gkkggggkkg...",
      "...GkkagagkkG...",
      "...gggkkkkggg...",
      "...gGgkkkkgGg...",
      "...ggkkggkkgg...",
      "...agkkggkkGg...",
      "...ggkggggkgg...",
      "....gGgaggGg....",
      "....GgggGgga....",
      "....gaGggagG....",
      "....ggggGggg....",
      "....aGgaggGg....",
      "....gggGgagg....",
      "....Ggagggga....",
      "....gGggagGg....",
      "..gGgGg..gGgGg..",
      "..GgggG..GgggG..",
      "..gGgag..gaGgg..",
      "..dGdgd..dgdGd..",
      "..mdmdm..mdmdm..",
      "..mmmmm..mmmmm..",
    ],
    [
      "...gaggGggagg...",
      "...agGggaggGg...",
      "...ggggGggggG...",
      "...gkkggggkkg...",
      "...GkkagagkkG...",
      "...gggkkkkggg...",
      "...gGgkkkkgGg...",
      "...ggkkggkkgg...",
      "...agkkggkkGg...",
      "...ggkggggkgg...",
      "....gGgaggGg....",
      "....GgggGgga....",
      "....gaGggagG....",
      "....ggggGggg....",
      "....aGgaggGg....",
      "....gggGgagg....",
      "....Ggagggga....",
      "....gGggagGg....",
      "..gGgGg.........",
      "..GgggG..gGgGg..",
      "..gGgag..GgggG..",
      "..dGdgd..gaGgg..",
      "..mdmdm..dgdGd..",
      "..mmmmm..mdmdm..",
    ],
  ],
},
```

## Pack manifests (required sprite ids, sizes are guidance ±4px)

### `js/sprites/hostiles.js` → `export const HOSTILES`
Front-view enemies, `anchor:'bottom'`, 2 frames each (walk/hop/flap):
- `creeper` 16x24 — verbatim reference above
- `zombie` 16x24 — green skin, teal shirt, purple pants, arms raised forward (classic zombie reach)
- `husk` 16x24 — sand-tan zombie variant
- `skeleton` 16x24 — bone white/gray, holds small brown bow to one side, dark eye sockets
- `stray` 16x24 — pale blue-white skeleton variant, ragged gray cloak
- `spider` 22x12 — wide, black/dark-gray, 3 visible legs per side, row of red eyes
- `slime` 16x14 — translucent-look green cube blob, simple dot eyes + mouth, frame2 = squashed wider/shorter
- `witch` 16x26 — purple robe, tall dark hat with buckle, green-tinged face, warty nose
- `blaze` 16x24 — yellow/orange glowing head, floating dark-gold rod segments below, frame2 rods rotated
- `zombified_piglin` 16x24 — pink/rotted-green split skin, gold accents
- `magma_cube` 16x14 — dark red/black cube blob, orange glowing seams, frame2 stretched taller showing orange gaps
- `phantom` 24x12 — blue-gray winged manta shape, green eyes, frame2 wings angled

### `js/sprites/bosses.js` → `export const BOSSES`
Big front-view bosses, `anchor:'bottom'`, 2 frames each, extra detail welcome:
- `boss_slime` 36x30 — giant king slime, crown optional, angry brows
- `boss_ravager` 40x30 — huge gray-brown bull/rhino beast, dark saddle plate, horns, heavy jaw
- `boss_wither` 36x34 — three dark skulls (center big, two small on shoulders), black spine ribs, blue-ish glow eyes
- `boss_dragon` 48x30 — black dragon: head center with purple eyes, two spread wings, frame2 wings down

### `js/sprites/scenery.js` → `export const SCENERY`
Trackside decoration billboards, front view, `anchor:'bottom'`, 1 frame (2 only if it obviously animates):
- `oak_tree` 24x32 — brown trunk, leafy green blob canopy
- `birch_tree` 24x32 — white/black-flecked trunk, lighter leaves
- `spruce_tree` 20x36 — dark green triangle tiers
- `snowy_spruce` 20x36 — spruce with white snow caps on tiers
- `cactus` 12x24 — green column, 2 arms, darker vertical ribs
- `dead_bush` 12x12 — sparse brown twigs
- `red_mushroom` 16x16 — red cap white spots, pale stem
- `crimson_fungus` 16x20 — nether: dark red cap, orange glow specks
- `warped_fungus` 16x20 — nether: teal cap, orange specks
- `end_pillar` 12x36 — dark purple-black obsidian column, small glowing pink crystal on top
- `fence` 16x12 — brown wood: 2 posts + 2 horizontal rails
- `flowers` 12x8 — small patch: one red poppy + one yellow dandelion + green stems
- `pumpkin` 14x12 — orange ridged pumpkin, no face
- `hay_bale` 16x14 — yellow/tan bale with brown cross straps
- `village_house` 36x32 — tiny cottage: cobble base, oak plank walls, dark roof, door + window
- `basalt_pillar` 12x30 — gray-black fluted column
- `cloud` 24x10 — flat white blocky cloud, `anchor:'center'`

### `js/sprites/items.js` → `export const ITEMS`
Pickups/icons `anchor:'center'` unless noted; allies bottom-anchored:
- `emerald` 12x14, 2 frames — green faceted gem, frame2 has white sparkle pixel moved
- `golden_apple` 12x14 — gold apple, brown stem, leaf, white shine pixel
- `tnt_block` 14x14 — red block, white middle band, black "TNT"-suggestion marks
- `heart` 12x11 — classic red pixel heart, lighter top-left shine
- `arrow` 6x14 — vertical arrow: gray tip up, brown shaft, white/gray fletching
- `fireball` 10x10, 2 frames — orange/yellow ball with flicker
- `xp_orb` 8x8, 2 frames — green-yellow glowing orb
- `potion` 10x14 — glass bottle, purple liquid, cork
- `powerup_triple` 14x14 — icon: three small arrows fanned
- `powerup_rapid` 14x14 — icon: arrow + yellow speed lines
- `powerup_power` 14x14 — icon: arrow + red up-chevron
- `chest` 16x14 — brown chest, dark lid seam, gold latch
- `iron_golem` 22x30, 2 frames, anchor bottom — gray iron body, long arms, red vine accent, small head
- `wolf` 18x14, 2 frames, anchor bottom — gray/white wolf, side-ish 3/4 view ok, red collar
- `snow_golem` 14x24, 2 frames, anchor bottom — two snowballs + carved pumpkin head, stick arms
- `head_steve` 8x8 — face: brown hair, tan skin, blue eyes
- `head_alex` 8x8 — orange hair, pale skin, green eyes
- `head_zombie` 8x8 — green skin, dark eyes
- `head_skeleton` 8x8 — white/gray skull, dark sockets
- `head_enderman` 8x8 — black head, purple glowing eyes
- `head_piglin` 8x8 — pink skin, gold/blond hair, tusk pixels
- `head_creeper` 8x8 — green mottle + creeper face

Heads are shop avatars: fill the full 8x8 (no transparent border), face reads clearly.
