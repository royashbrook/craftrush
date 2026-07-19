// Sprite registry + baker. Packs are plain pixel-matrix data (see docs/SPRITE_SPEC.md);
// here they get baked to offscreen canvases once, including hit-flash variants and
// palette-swapped variants (skins). Missing packs degrade to a magenta placeholder
// so the game always boots.
import { CORE } from './sprites/core.js';

const DEFS = {};        // id -> def
const BAKED = new Map(); // cacheKey -> { frames:[canvas], flash:[canvas], w, h, anchor }

const PACK_FILES = [
  ['./sprites/hostiles.js', 'HOSTILES'],
  ['./sprites/bosses.js', 'BOSSES'],
  ['./sprites/scenery.js', 'SCENERY'],
  ['./sprites/items.js', 'ITEMS'],
];

export const missingPacks = [];

export async function initAssets() {
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
}

function registerPack(pack) {
  for (const [id, def] of Object.entries(pack)) DEFS[id] = def;
}

export function hasSprite(id) { return !!DEFS[id]; }

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

export function getSprite(id, paletteOverride, palKey) {
  const key = palKey ? `${id}|${palKey}` : id;
  let b = BAKED.get(key);
  if (!b) {
    const def = DEFS[id];
    b = def ? bake(def, paletteOverride) : placeholder();
    BAKED.set(key, b);
  }
  return b;
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
