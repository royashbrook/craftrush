import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentKey, paletteKey } from '../js/atlaskey.js';
import { enumerateVariants } from '../js/variants.js';
import { SKINS, COSMETICS, TIERS, THEME_ART } from '../js/config.js';
import { readFileSync } from 'node:fs';
import { decodePNG } from '../tools/png.mjs';

const ART = JSON.parse(readFileSync(new URL('sprites.json', THEME_ART + '/'), 'utf8'));

const cfg = { SKINS, COSMETICS, TIERS };

test('a sprite with no palette keys as its own name', () => {
  assert.equal(contentKey('oak_tree', null), 'oak_tree');
  assert.equal(contentKey('oak_tree', {}), 'oak_tree', 'an empty override is no override');
});

test('the same colours key the same however the object was built', () => {
  const a = { c: '#ff0000', C: '#880000' };
  const b = { C: '#880000', c: '#ff0000' };      // same palette, keys in the other order
  assert.equal(paletteKey(a), paletteKey(b));
  assert.equal(contentKey('cape', a), contentKey('cape', b), 'three call sites, one region');
});

test('different colours never collide', () => {
  const keys = new Set();
  for (const def of COSMETICS.cape) {
    if (!def.colors) continue;
    const k = contentKey('cape', def.colors);
    assert.ok(!keys.has(k), `${def.id} would share a region with another cape`);
    keys.add(k);
  }
});

test('every variant the game can ask for is enumerable, and named once', () => {
  const ids = Object.keys(ART);
  const vs = enumerateVariants(cfg, ids);
  const keys = new Set(vs.map((v) => v.key));
  assert.equal(keys.size, vs.length, 'no duplicate keys');
  for (const v of vs) assert.ok(ids.includes(v.id), `${v.key} names a sprite the packs define`);

  // every skin gets a runner body, or the crowd is wrong for that skin
  for (const skin of SKINS) {
    assert.ok(keys.has(contentKey('runner_back', skin.palette)), `${skin.id} has a back sprite`);
    for (const unit of TIERS.units) {
      assert.ok(keys.has(contentKey('runner_back', { ...skin.palette, b: unit.boots })),
        `${skin.id} has a tier ${unit.boots} giant`);
    }
  }
});

test('a theme that ships fewer sprites asks for fewer variants, and does not throw', () => {
  const vs = enumerateVariants(cfg, ['oak_tree']);
  assert.deepEqual(vs.map((v) => v.id), ['oak_tree'], 'nothing is invented for art that is absent');
  assert.deepEqual(enumerateVariants({}, []), [], 'an empty theme is empty, not an error');
});

test('retired side-system art is not packed into the runtime atlas', () => {
  const ids = ['pm_torso', 'room_rug', 'villager_body', 'oak_tree'];
  assert.deepEqual(enumerateVariants(cfg, ids).map((v) => v.id), ['oak_tree']);
});

test('the pickaxe point curves down on the left of its handle', () => {
  const { w, h, rgba } = decodePNG(readFileSync(new URL('ui_pickaxe.png', THEME_ART + '/')));
  assert.deepEqual([w, h], [13, 13]);

  const metal = new Set([ART.ui_pickaxe.palette.g, ART.ui_pickaxe.palette.G].map((hex) => {
    const value = parseInt(hex.slice(1), 16);
    return `${value >> 16},${(value >> 8) & 255},${value & 255}`;
  }));
  const isMetal = (x, y) => {
    const i = (y * w + x) * 4;
    return rgba[i + 3] > 0 && metal.has(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  };

  let lowerLeftMetal = 0;
  let lowerRightMetal = 0;
  for (let y = 5; y < 8; y++) {
    for (let x = 0; x < 5; x++) lowerLeftMetal += Number(isMetal(x, y));
    for (let x = 9; x < w; x++) lowerRightMetal += Number(isMetal(x, y));
  }
  assert.ok(lowerLeftMetal >= 3, 'the pointed end descends on the left');
  assert.equal(lowerRightMetal, 0, 'the right side stays a straight tool head');
});
