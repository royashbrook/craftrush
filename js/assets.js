// Sprite registry. The art is assets/atlas.png plus a manifest saying where
// each sprite lives in it; both are built from art/ by tools/pack-atlas.mjs.
//
// At load the atlas is sliced into per-frame canvases, including the white
// hit-flash silhouettes, which are derived from each sprite's own alpha. A
// sprite the atlas does not carry degrades to a magenta placeholder so the
// game always boots rather than dying on one missing name.
import { contentKey } from './atlaskey.js';
import { THEME_ATLAS } from './theme.js';

let ATLAS = null;       // { sprites, ids } once loaded and sliced
let PLACEHOLDER = null;

/** True once the art is loaded. */
export function assetsReady() { return !!ATLAS; }

export async function initAssets({ atlas = THEME_ATLAS } = {}) {
  try {
    await loadAtlas(atlas);
  } catch (e) {
    // a missing atlas means every sprite draws as the magenta placeholder,
    // which is ugly and obvious. Better than a blank screen and no clue why.
    console.warn('[assets] the art did not load, everything will draw as placeholder:', e.message);
  }
}

async function loadAtlas(atlas) {
  const manifest = await (await fetch(`${atlas}/atlas.json`)).json();
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`${atlas}/${manifest.atlas} did not load`));
    i.src = `${atlas}/${manifest.atlas}`;
  });
  const [aw, ah] = manifest.size;
  if (img.width !== aw || img.height !== ah) {
    throw new Error(`atlas is ${img.width}x${img.height}, manifest says ${aw}x${ah}`);
  }

  const sprites = new Map();
  for (const [key, e] of Object.entries(manifest.sprites)) {
    const frames = [], flash = [];
    for (const [sx, sy] of e.frames) {
      const c = document.createElement('canvas');
      c.width = e.w; c.height = e.h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, sx, sy, e.w, e.h, 0, 0, e.w, e.h);
      frames.push(c);
      flash.push(whiteOut(c));
    }
    sprites.set(key, { frames, flash, w: e.w, h: e.h, anchor: e.anchor });
  }
  ATLAS = { sprites, ids: new Set(Object.values(manifest.sprites).map((e) => e.id)) };
}

/** The hit flash is the sprite's own shape in solid white. */
function whiteOut(src) {
  const f = document.createElement('canvas');
  f.width = src.width; f.height = src.height;
  const g = f.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, f.width, f.height);
  return f;
}

export function hasSprite(id) { return !!ATLAS && ATLAS.ids.has(id); }

function placeholder() {
  if (PLACEHOLDER) return PLACEHOLDER;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? '#ff00ff' : '#1a1a1a';
      g.fillRect(x, y, 1, 1);
    }
  }
  PLACEHOLDER = { frames: [c], flash: [whiteOut(c)], w: 8, h: 8, anchor: 'bottom' };
  return PLACEHOLDER;
}

/**
 * Fetch a sprite, optionally in a different palette.
 *
 * `paletteOverride` selects which pre-drawn variant to hand back: the variants
 * are baked into the atlas by tools/pack-atlas.mjs. It stays in the signature
 * because it is the seam a runtime tint or recolour would hook into, and
 * threading it back through every call site later would be the expensive part.
 * `palKey` is only used in warnings now and may be omitted.
 */
export function getSprite(id, paletteOverride, palKey) {
  if (!ATLAS) return placeholder();
  const hit = ATLAS.sprites.get(contentKey(id, paletteOverride));
  if (hit) return hit;
  // an unbaked palette falls back to the sprite as drawn rather than to
  // magenta, so a theme with a stray colour still reads
  const plain = ATLAS.sprites.get(id);
  if (plain) {
    if (paletteOverride) warnUnbaked(id, palKey);
    return plain;
  }
  warnMissing(id);
  return placeholder();
}

const warned = new Set();
function warnOnce(k, msg) {
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(msg);
}
const warnUnbaked = (id, palKey) => warnOnce(`p:${id}|${palKey}`,
  `[assets] ${id} was asked for in a palette the atlas does not carry (${palKey}). Re-run tools/pack-atlas.mjs.`);
const warnMissing = (id) => warnOnce(`m:${id}`,
  `[assets] no art named ${id}. Add art/${id}.png and re-run tools/pack-atlas.mjs.`);

// Draw a sprite as a billboard in screen space.
// x, y: screen anchor point (bottom-center or center). hPx: target on-screen height.
export function blit(ctx, sprite, frameIdx, x, y, hPx, { flash = false, alpha = 1, flip = false } = {}) {
  const src = (flash ? sprite.flash : sprite.frames)[frameIdx % sprite.frames.length];
  const scale = hPx / sprite.h;
  const wPx = sprite.w * scale;
  const dx = x - wPx / 2;
  const dy = sprite.anchor === 'bottom' ? y - hPx : y - hPx / 2;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(dx + wPx / 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, -wPx / 2, dy, wPx, hPx);
    ctx.restore();
  } else {
    ctx.drawImage(src, dx, dy, wPx, hPx);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}
