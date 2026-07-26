// Bake the procedural sprite packs into a real art file.
//
// Every sprite the game can ask for, including the palette-swapped variants
// (skins, giant tiers, capes, villager robes, town houses), is rasterised once
// and packed into a single atlas PNG with a JSON manifest saying where each one
// lives. Nothing is redrawn by hand: the pixels this writes are the pixels the
// game draws today, so the atlas can be proved against the old path before the
// matrix files go away.
//
// Variants are keyed by CONTENT (sprite id + the palette it was drawn with),
// not by the cache-key strings the call sites happen to use. Three call sites
// asking for the same cape colours collapse to one region in the atlas.
//
// Usage: node tools/bake-atlas.mjs [--out assets]
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePNG } from './png.mjs';
import { enumerateVariants } from '../js/variants.js';

const OUT_DIR = (() => {
  const i = process.argv.indexOf('--out');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'assets';
})();

// ---------------------------------------------------------------- load packs

const { CORE } = await import('../js/sprites/core.js');
const PACKS = [CORE];
for (const [path, name] of [
  ['../js/sprites/hostiles.js', 'HOSTILES'],
  ['../js/sprites/bosses.js', 'BOSSES'],
  ['../js/sprites/scenery.js', 'SCENERY'],
  ['../js/sprites/items.js', 'ITEMS'],
  ['../js/sprites/decor.js', 'DECOR'],
  ['../js/sprites/ui.js', 'UIICONS'],
  ['../js/sprites/shop.js', 'SHOP'],
]) {
  const mod = await import(path);
  if (!mod[name]) throw new Error(`${path} has no export ${name}`);
  PACKS.push(mod[name]);
}

const DEFS = {};
for (const pack of PACKS) for (const [id, def] of Object.entries(pack)) DEFS[id] = def;

const { SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS } = await import('../js/config.js');

// ------------------------------------------------------- enumerate variants
// Shared with the verifier, so "the atlas matches the old renderer" is a claim
// that can be checked rather than asserted.
const variants = enumerateVariants({ SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS }, Object.keys(DEFS));

// ------------------------------------------------------------- rasterise

/** Draw one frame of a variant into a flat RGBA buffer. */
function raster(def, rows, palette) {
  const pal = palette ? { ...def.palette, ...palette } : def.palette;
  const px = new Uint8Array(def.w * def.h * 4);
  for (let y = 0; y < def.h; y++) {
    const row = rows[y];
    for (let x = 0; x < def.w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const hex = pal[ch] || '#ff00ff';         // same magenta the runtime falls back to
      const n = parseInt(hex.slice(1), 16);
      const o = (y * def.w + x) * 4;
      px[o] = (n >> 16) & 255;
      px[o + 1] = (n >> 8) & 255;
      px[o + 2] = n & 255;
      px[o + 3] = 255;
    }
  }
  return px;
}

// one entry per frame, since frames are packed individually
const cells = [];
for (const { key, id, palette } of variants) {
  const def = DEFS[id];
  def.frames.forEach((rows, i) => {
    cells.push({ key, id, frame: i, w: def.w, h: def.h, anchor: def.anchor || 'bottom', px: raster(def, rows, palette) });
  });
}

// ---------------------------------------------------------------- pack
// Shelf packing, tallest first. The art is small and the shapes are similar
// heights, so a shelf packer wastes very little and stays easy to read.
const PAD = 1;                                  // keeps neighbours from bleeding in when scaled

const totalArea = cells.reduce((a, c) => a + (c.w + PAD) * (c.h + PAD), 0);
let atlasW = 64;
while (atlasW * atlasW < totalArea * 1.25) atlasW *= 2;

cells.sort((a, b) => b.h - a.h || b.w - a.w);

let penX = PAD, penY = PAD, shelfH = 0;
for (const c of cells) {
  if (penX + c.w + PAD > atlasW) { penX = PAD; penY += shelfH + PAD; shelfH = 0; }
  c.x = penX; c.y = penY;
  penX += c.w + PAD;
  shelfH = Math.max(shelfH, c.h);
}
const atlasH = penY + shelfH + PAD;

// blit every cell into the atlas buffer
const atlas = new Uint8Array(atlasW * atlasH * 4);
for (const c of cells) {
  for (let y = 0; y < c.h; y++) {
    const src = y * c.w * 4;
    const dst = ((c.y + y) * atlasW + c.x) * 4;
    atlas.set(c.px.subarray(src, src + c.w * 4), dst);
  }
}

// ---------------------------------------------------------------- verify
// A packing bug would be near invisible in the game (one sprite quietly wearing
// a corner of another), so check it here where it is cheap to check.
for (let i = 0; i < cells.length; i++) {
  const a = cells[i];
  if (a.x < 0 || a.y < 0 || a.x + a.w > atlasW || a.y + a.h > atlasH) {
    throw new Error(`${a.key} frame ${a.frame} falls outside the atlas`);
  }
  for (let j = i + 1; j < cells.length; j++) {
    const b = cells[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
      throw new Error(`${a.key} frame ${a.frame} overlaps ${b.key} frame ${b.frame}`);
    }
  }
}

// ---------------------------------------------------------------- write

const sprites = {};
for (const c of cells) {
  const e = sprites[c.key] || (sprites[c.key] = { id: c.id, w: c.w, h: c.h, anchor: c.anchor, frames: [] });
  e.frames[c.frame] = [c.x, c.y];
}
for (const [key, e] of Object.entries(sprites)) {
  if (e.frames.some((f) => !f)) throw new Error(`${key} is missing a frame in the manifest`);
}

// what the runtime needs to turn a getSprite(id, palette) call into a content key
const manifest = {
  atlas: 'atlas.png',
  size: [atlasW, atlasH],
  // keys come from js/atlaskey.js, which the runtime imports too
  keying: 'js/atlaskey.js contentKey',
  sprites,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/atlas.png`, encodePNG(atlas, atlasW, atlasH));
writeFileSync(`${OUT_DIR}/atlas.json`, `${JSON.stringify(manifest, null, 1)}\n`);

const artPx = cells.reduce((a, c) => a + c.w * c.h, 0);
console.log(`atlas ${atlasW}x${atlasH}  ${variants.length} sprites, ${cells.length} frames, ${artPx} art pixels`);
console.log(`fill ${(artPx / (atlasW * atlasH) * 100).toFixed(1)}%  ->  ${OUT_DIR}/atlas.png, ${OUT_DIR}/atlas.json`);
