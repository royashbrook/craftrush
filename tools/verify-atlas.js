// Prove the atlas is the same art the game draws today.
//
// For every sprite and every frame, compare the pixels sitting in the atlas
// against the pixels the old matrix baker produces. Any difference at all is a
// failure: this is the check that lets js/sprites/*.js be deleted without
// anyone having to take it on faith.
//
// Run it from the page console:  (await import('/tools/verify-atlas.js')).verifyAtlas()
import { initAssets, getSprite, hasSprite } from '../js/assets.js';
import { enumerateVariants } from '../js/variants.js';
import { SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS } from '../js/config.js';
import { CORE } from '../js/sprites/core.js';

async function allSpriteIds() {
  const ids = new Set(Object.keys(CORE));
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
    for (const id of Object.keys(mod[name] || {})) ids.add(id);
  }
  return [...ids];
}

export async function verifyAtlas(base = '/assets') {
  await initAssets();

  const manifest = await (await fetch(`${base}/atlas.json`)).json();
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('atlas.png did not load'));
    i.src = `${base}/${manifest.atlas}`;
  });

  const [aw, ah] = manifest.size;
  if (img.width !== aw || img.height !== ah) {
    return { ok: false, fail: [`atlas is ${img.width}x${img.height}, manifest says ${aw}x${ah}`] };
  }

  const ac = document.createElement('canvas');
  ac.width = aw; ac.height = ah;
  const ag = ac.getContext('2d', { willReadFrequently: true });
  ag.imageSmoothingEnabled = false;
  ag.drawImage(img, 0, 0);
  const atlas = ag.getImageData(0, 0, aw, ah).data;

  const variants = enumerateVariants({ SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS }, await allSpriteIds());

  const fail = [];
  let framesChecked = 0, pixelsChecked = 0;

  // scratch canvas for reading the old baker's output back out
  const sc = document.createElement('canvas');
  const sg = sc.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingEnabled = false;

  for (const { key, id, palette } of variants) {
    const entry = manifest.sprites[key];
    if (!entry) { fail.push(`${key} (${id}) is missing from the manifest`); continue; }
    if (!hasSprite(id)) { fail.push(`${key} names sprite ${id}, which the packs do not define`); continue; }

    const old = getSprite(id, palette, key);
    if (old.w !== entry.w || old.h !== entry.h) {
      fail.push(`${key} is ${entry.w}x${entry.h} in the atlas, ${old.w}x${old.h} in the packs`);
      continue;
    }
    if (old.anchor !== entry.anchor) fail.push(`${key} anchor ${entry.anchor} != ${old.anchor}`);
    if (old.frames.length !== entry.frames.length) {
      fail.push(`${key} has ${entry.frames.length} frames in the atlas, ${old.frames.length} in the packs`);
      continue;
    }

    for (let f = 0; f < old.frames.length; f++) {
      sc.width = entry.w; sc.height = entry.h;
      sg.clearRect(0, 0, entry.w, entry.h);
      sg.drawImage(old.frames[f], 0, 0);
      const want = sg.getImageData(0, 0, entry.w, entry.h).data;

      const [ox, oy] = entry.frames[f];
      let bad = 0, firstBad = null;
      for (let y = 0; y < entry.h; y++) {
        for (let x = 0; x < entry.w; x++) {
          const a = ((oy + y) * aw + (ox + x)) * 4;
          const b = (y * entry.w + x) * 4;
          // transparent is transparent whatever the dead colour channels say
          if (atlas[a + 3] === 0 && want[b + 3] === 0) continue;
          if (atlas[a] !== want[b] || atlas[a + 1] !== want[b + 1]
            || atlas[a + 2] !== want[b + 2] || atlas[a + 3] !== want[b + 3]) {
            if (!firstBad) firstBad = { x, y, atlas: [...atlas.slice(a, a + 4)], packs: [...want.slice(b, b + 4)] };
            bad++;
          }
          pixelsChecked++;
        }
      }
      framesChecked++;
      if (bad) fail.push(`${key} frame ${f}: ${bad} pixels differ, first at ${firstBad.x},${firstBad.y} atlas=${firstBad.atlas} packs=${firstBad.packs}`);
    }
  }

  // anything in the atlas nobody asked for is dead weight worth knowing about
  const wanted = new Set(variants.map((v) => v.key));
  const orphans = Object.keys(manifest.sprites).filter((k) => !wanted.has(k));

  return {
    ok: fail.length === 0,
    sprites: variants.length,
    framesChecked,
    pixelsChecked,
    orphans,
    fail: fail.slice(0, 20),
    failCount: fail.length,
  };
}
