import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentKey, paletteKey } from '../js/atlaskey.js';
import { enumerateVariants } from '../js/variants.js';
import { SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS } from '../js/config.js';
import { CORE } from '../js/sprites/core.js';

const cfg = { SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS };

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
  const ids = Object.keys(CORE);
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
