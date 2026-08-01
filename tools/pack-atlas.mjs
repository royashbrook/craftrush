// Pack the art files into the atlas the game loads.
//
//   art/<id>.png     the drawing, frames left to right
//   art/sprites.json anchor, frame count and base palette per sprite
//        ->
//   assets/atlas.png + assets/atlas.json
//
// assets/ is build output. Nobody edits it. To change how something looks, open
// art/<id>.png in any image editor and run this again.
//
// Palette variants (skins and capes) are generated
// here by exact colour replacement: an override keyed by a matrix character
// resolves through the base palette to the colour that character used to be,
// and every pixel of that colour is swapped. That is sound because the sprites
// the game swaps have an invertible colour-to-character map; the check below
// refuses to guess when they do not.
//
// Usage: node tools/pack-atlas.mjs [--art art] [--out assets]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePNG, decodePNG } from './png.mjs';
import { enumerateVariants } from '../js/variants.js';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// the theme says where its drawings and its atlas belong; a theme that only
// recolours can borrow another theme's art and still build its own atlas
const { THEME_ART, THEME_ATLAS } = await import('../js/theme.js');   // resolves under public/themes
const ART = arg('--art', fileURLToPath(THEME_ART));
const OUT = arg('--out', fileURLToPath(THEME_ATLAS));

const meta = JSON.parse(readFileSync(`${ART}/sprites.json`, 'utf8'));
const { SKINS, COSMETICS, TIERS } = await import('../js/config.js');

const rgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

// load each art file once and slice its strip into frames
const art = {};
for (const [id, m] of Object.entries(meta)) {
  const { w, h, rgba } = decodePNG(readFileSync(`${ART}/${id}.png`));
  if (w !== m.w * m.frames || h !== m.h) {
    throw new Error(`${id}.png is ${w}x${h}, but sprites.json says ${m.frames} frames of ${m.w}x${m.h}`);
  }
  const frames = [];
  for (let f = 0; f < m.frames; f++) {
    const px = new Uint8Array(m.w * m.h * 4);
    for (let y = 0; y < m.h; y++) {
      const src = (y * w + f * m.w) * 4;
      px.set(rgba.subarray(src, src + m.w * 4), y * m.w * 4);
    }
    frames.push(px);
  }
  art[id] = frames;
}

/** Apply a character-keyed override by swapping the colours those characters drew. */
function recolour(px, base, override) {
  const swaps = [];
  for (const [ch, hex] of Object.entries(override)) {
    const from = base[ch];
    if (!from) continue;                          // a character this sprite never used
    if (from.toLowerCase() === hex.toLowerCase()) continue;
    // refuse to recolour when two characters shared the colour, since the swap
    // could not tell them apart and would quietly repaint the wrong pixels
    const sharers = Object.entries(base).filter(([, c]) => c.toLowerCase() === from.toLowerCase());
    if (sharers.length > 1) {
      throw new Error(`cannot recolour '${ch}': ${sharers.map(([k]) => `'${k}'`).join(' and ')} are both ${from}`);
    }
    swaps.push([rgb(from), rgb(hex)]);
  }
  if (!swaps.length) return px;

  const out = px.slice();
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    for (const [[fr, fg, fb], [tr, tg, tb]] of swaps) {
      if (out[i] === fr && out[i + 1] === fg && out[i + 2] === fb) {
        out[i] = tr; out[i + 1] = tg; out[i + 2] = tb;
        break;
      }
    }
  }
  return out;
}

const variants = enumerateVariants({ SKINS, COSMETICS, TIERS }, Object.keys(meta));

const cells = [];
for (const { key, id, palette } of variants) {
  const m = meta[id];
  art[id].forEach((px, f) => {
    cells.push({
      key, id, frame: f, w: m.w, h: m.h, anchor: m.anchor,
      px: palette ? recolour(px, m.palette, palette) : px,
    });
  });
}

// ---- shelf pack, tallest first ----
const PAD = 1;
const area = cells.reduce((a, c) => a + (c.w + PAD) * (c.h + PAD), 0);
let atlasW = 64;
while (atlasW * atlasW < area * 1.25) atlasW *= 2;

cells.sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.frame - b.frame));

let penX = PAD, penY = PAD, shelfH = 0;
for (const c of cells) {
  if (penX + c.w + PAD > atlasW) { penX = PAD; penY += shelfH + PAD; shelfH = 0; }
  c.x = penX; c.y = penY;
  penX += c.w + PAD;
  shelfH = Math.max(shelfH, c.h);
}
const atlasH = penY + shelfH + PAD;

const atlas = new Uint8Array(atlasW * atlasH * 4);
for (const c of cells) {
  for (let y = 0; y < c.h; y++) {
    const src = y * c.w * 4;
    atlas.set(c.px.subarray(src, src + c.w * 4), ((c.y + y) * atlasW + c.x) * 4);
  }
}

// a packing bug is nearly invisible in the game, so catch it where it is cheap
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

const sprites = {};
for (const c of cells) {
  const e = sprites[c.key] || (sprites[c.key] = { id: c.id, w: c.w, h: c.h, anchor: c.anchor, frames: [] });
  e.frames[c.frame] = [c.x, c.y];
}
for (const [key, e] of Object.entries(sprites)) {
  if (e.frames.some((f) => !f)) throw new Error(`${key} is missing a frame in the manifest`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/atlas.png`, encodePNG(atlas, atlasW, atlasH));
writeFileSync(`${OUT}/atlas.json`, `${JSON.stringify({
  atlas: 'atlas.png',
  size: [atlasW, atlasH],
  keying: 'js/atlaskey.js contentKey',
  sprites,
}, null, 1)}\n`);

const artPx = cells.reduce((a, c) => a + c.w * c.h, 0);
console.log(`atlas ${atlasW}x${atlasH}  ${variants.length} sprites, ${cells.length} frames`);
console.log(`fill ${(artPx / (atlasW * atlasH) * 100).toFixed(1)}%  ->  ${OUT}/atlas.png, ${OUT}/atlas.json`);
