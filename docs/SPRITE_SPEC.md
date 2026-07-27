# CRAFT RUSH — Sprite Spec

Original pixel art only, "in the style of" blocky voxel mobs, NOT copies of
Mojang textures.

The art lives in `art/`: one PNG per sprite, plus one JSON file holding what a
PNG cannot say. `tools/pack-atlas.mjs` packs them into a texture atlas the game
loads. This is the ordinary sprite-sheet-plus-manifest arrangement every 2D
engine uses; see "Prior art" at the bottom.

Before v1.0 the art was pixel matrices written as JavaScript string arrays. That
is gone. It is still in git history if you want to look, at the `v0.2` tag.

## Layout

```
art/
  oak_tree.png      one sprite, frames laid out left to right
  cape.png
  ...
  sprites.json      anchor, frame count and base palette for every sprite
assets/
  atlas.png         BUILD OUTPUT, do not edit
  atlas.json        BUILD OUTPUT, do not edit
```

## Changing how something looks

1. Open `art/<id>.png` in any image editor
2. Draw
3. `node tools/pack-atlas.mjs`

That is the whole loop. The atlas and its manifest are rebuilt from `art/`, and
the game loads the atlas.

## Adding a new sprite

1. Draw `art/<id>.png`. If it animates, put the frames side by side in one row,
   all the same width.
2. Add an entry to `art/sprites.json`:

```json
"my_sprite": {
  "w": 16,
  "h": 24,
  "frames": 2,
  "anchor": "bottom",
  "palette": { "a": "#7fd957", "b": "#4fa832" }
}
```

3. `node tools/pack-atlas.mjs`

`w` and `h` are the size of ONE frame. The PNG must be `w * frames` wide and `h`
tall; the packer refuses it otherwise rather than packing something crooked.

`anchor` is `bottom` for anything standing on the ground, `center` for anything
floating (heads, icons, pickups).

## The palette field

`palette` maps a single character to the colour it draws. Nothing reads
characters out of an image. They exist so colour VARIANTS can be described.

A cape in the shop is defined as:

```js
{ id: 'cape_red', name: 'Hero Red', cost: 80, colors: { c: '#c8322a', C: '#8f1f14' } }
```

That says "whatever colour `c` was becomes `#c8322a`". The packer looks `c` up in
`art/cape.png`'s base palette, finds the colour, and replaces every pixel of it.
Skins, villager robes and town houses all work the same way.

Two rules follow:

- **Do not use one colour for two characters** in a sprite that gets recoloured.
  The swap cannot tell them apart, so the packer throws rather than guess.
- **If you redraw a sprite, keep its palette in `sprites.json` matching what you
  actually drew.** Otherwise the variants hunt for colours that are not there.
  They fail quietly by simply not swapping, so give it a look afterwards.

For a sprite nothing recolours, the palette is only documentation. Keep it
honest anyway.

## Which variants get built

`js/variants.js` decides, from the game data: every skin, every giant tier,
every cape, every villager, every town. Add a skin to `config.js` and its
variant shows up in the atlas on the next pack with nothing else to update.

## How the game asks for one

```js
getSprite('oak_tree')                                // as drawn
getSprite('cape', { c: '#c8322a', C: '#8f1f14' })    // the red variant
```

`js/atlaskey.js` turns the id and the palette into the name of a region in the
atlas. Two call sites asking for the same colours get the same region, so a
variant is stored once no matter how many screens want it.

## Checking your work

```bash
node tools/pack-atlas.mjs      # refuses bad sizes, overlaps, ambiguous recolours
node --test tests/*.test.mjs   # asserts every biome's art exists
npx playwright test            # asserts the browser actually loaded the atlas
```

`tools/preview.html` shows every sprite in the atlas at 4x with its name, which
is the fastest way to spot something that packed wrong.

## Prior art

None of the shape here is invented. A folder of images packed into one texture
with a JSON manifest of named regions is how 2D games have shipped art for
decades. TexturePacker, Aseprite's sprite-sheet export, libGDX `TextureAtlas`,
Unity's Sprite Atlas and the free-tex-packer output that Phaser and PixiJS read
are all the same idea with different field names.

What our manifest does NOT yet carry, and those formats do:

- **trim**, packing a sprite's opaque bounds and recording the original size and
  offset. Real space win on sprites with a lot of empty margin.
- **rotation**, turning a sprite ninety degrees to fit a gap.
- **animation tags**, naming frame ranges and per-frame durations, rather than
  the engine deciding what frame 0 and 1 mean.
- **multiple pages**, once one sheet outgrows a sensible texture size.

At 512x212 none of those earn their complexity yet. When they do, the move is to
adopt an existing format rather than grow ours, so an artist can export straight
from Aseprite and skip the packing step entirely. That is issue #64.

The one genuinely bespoke part is generating colour variants at pack time from
the game data. Most engines tint at runtime in a shader instead. Ours exists
because it is the honest translation of the palette-swap the matrices used to
do, and because a baked variant can later be hand-redrawn into something better
than a recolour, which a runtime tint cannot.
