// Sprite registry. Art comes from one of two places:
//
//   the atlas   assets/atlas.png plus a manifest, sliced up at load
//   the packs   the original pixel-matrix data, baked to canvases at load
//
// The atlas is the real art file and the direction of travel; the packs are
// kept alongside it until the atlas has been proved on real screens. Either way
// the sprite objects handed out are identical, so nothing downstream can tell
// which path it got. Missing art degrades to a magenta placeholder so the game
// always boots.
import { CORE } from './sprites/core.js';
import { contentKey } from './atlaskey.js';

const DEFS = {};        // id -> def
const BAKED = new Map(); // cacheKey -> { frames:[canvas], flash:[canvas], w, h, anchor }

let ATLAS = null;       // { sprites, ids } once the atlas is loaded and sliced

/** Which art path is live. Useful in the console and in tests. */
export function assetSource() { return ATLAS ? 'atlas' : 'packs'; }

const PACK_FILES = [
  ['./sprites/hostiles.js', 'HOSTILES'],
  ['./sprites/bosses.js', 'BOSSES'],
  ['./sprites/scenery.js', 'SCENERY'],
  ['./sprites/items.js', 'ITEMS'],
  ['./sprites/decor.js', 'DECOR'],
  ['./sprites/ui.js', 'UIICONS'],
  ['./sprites/shop.js', 'SHOP'],
];

export const missingPacks = [];

export async function initAssets({ atlas = 'assets', useAtlas = true } = {}) {
  registerPack(CORE);
  for (const [path, name] of PACK_FILES) {
    try {
      const mod = await import(path);
      if (!mod[name]) throw new Error(`no export ${name}`);
      registerPack(mod[name]);
    } catch (e) {
      console.warn(`[assets] pack ${path} unavailable:`, e.message);
      missingPacks.push(path);
    }
  }
  if (useAtlas) {
    try {
      await loadAtlas(atlas);
    } catch (e) {
      // the packs are still registered, so a missing or broken atlas costs
      // nothing but the log line
      console.warn('[assets] atlas unavailable, drawing from the packs:', e.message);
      ATLAS = null;
    }
  }
}

/** Slice the atlas into per-frame canvases, one pass at load. */
async function loadAtlas(dir) {
  const manifest = await (await fetch(`${dir}/atlas.json`)).json();
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`${dir}/${manifest.atlas} did not load`));
    i.src = `${dir}/${manifest.atlas}`;
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

      // the hit-flash is the same shape in solid white, so it comes from the
      // sprite's own alpha rather than from a second copy in the atlas
      const f = document.createElement('canvas');
      f.width = e.w; f.height = e.h;
      const fg = f.getContext('2d');
      fg.imageSmoothingEnabled = false;
      fg.drawImage(c, 0, 0);
      fg.globalCompositeOperation = 'source-in';
      fg.fillStyle = '#ffffff';
      fg.fillRect(0, 0, e.w, e.h);
      flash.push(f);
    }
    sprites.set(key, { frames, flash, w: e.w, h: e.h, anchor: e.anchor });
  }
  ATLAS = { sprites, ids: new Set(Object.values(manifest.sprites).map((e) => e.id)) };
}

function registerPack(pack) {
  for (const [id, def] of Object.entries(pack)) DEFS[id] = def;
}

export function hasSprite(id) { return ATLAS ? ATLAS.ids.has(id) : !!DEFS[id]; }

function bake(def, paletteOverride) {
  const pal = paletteOverride ? { ...def.palette, ...paletteOverride } : def.palette;
  const frames = [], flash = [];
  for (const rows of def.frames) {
    const c = document.createElement('canvas');
    c.width = def.w; c.height = def.h;
    const g = c.getContext('2d');
    const f = document.createElement('canvas');
    f.width = def.w; f.height = def.h;
    const fg = f.getContext('2d');
    for (let y = 0; y < def.h; y++) {
      const row = rows[y];
      for (let x = 0; x < def.w; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = pal[ch] || '#ff00ff';
        g.fillRect(x, y, 1, 1);
        fg.fillStyle = '#ffffff';
        fg.fillRect(x, y, 1, 1);
      }
    }
    frames.push(c); flash.push(f);
  }
  return { frames, flash, w: def.w, h: def.h, anchor: def.anchor || 'bottom' };
}

function placeholder() {
  const def = {
    w: 8, h: 8, anchor: 'bottom',
    palette: { m: '#ff00ff', k: '#1a1a1a' },
    frames: [[ 'mmkkmmkk', 'mmkkmmkk', 'kkmmkkmm', 'kkmmkkmm', 'mmkkmmkk', 'mmkkmmkk', 'kkmmkkmm', 'kkmmkkmm' ]],
  };
  return bake(def);
}

/**
 * Fetch a sprite, optionally in a different palette.
 *
 * `paletteOverride` still means what it always did. Against the atlas it only
 * selects which pre-drawn variant to hand back, since those are baked. It stays
 * in the signature because it is the seam a tint or recolour would hook into,
 * and threading it back through every call site later would be the expensive
 * part. `palKey` is now only a cache hint and may be omitted.
 */
export function getSprite(id, paletteOverride, palKey) {
  if (ATLAS) {
    const hit = ATLAS.sprites.get(contentKey(id, paletteOverride));
    if (hit) return hit;
    // an unbaked palette falls back to the sprite as drawn rather than to
    // magenta, so a theme with a stray colour still reads
    const plain = ATLAS.sprites.get(id);
    if (plain) {
      if (paletteOverride) warnUnbaked(id, palKey);
      return plain;
    }
  }
  const key = palKey ? `${id}|${palKey}` : id;
  let b = BAKED.get(key);
  if (!b) {
    const def = DEFS[id];
    b = def ? bake(def, paletteOverride) : placeholder();
    BAKED.set(key, b);
  }
  return b;
}

const warned = new Set();
function warnUnbaked(id, palKey) {
  const k = `${id}|${palKey}`;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[assets] ${id} was asked for in a palette the atlas does not carry (${palKey}). Re-run tools/bake-atlas.mjs.`);
}

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
