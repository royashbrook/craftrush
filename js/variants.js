// Which palette-swapped sprites the game can ask for.
//
// Skins, giant tiers, capes, villager robes and town houses are all the same
// sprite drawn with a different palette. This list is derived from the same
// data the game reads, so the atlas covers every variant by construction rather
// than by anyone remembering to add one.
//
// The bake tool and the verifier both import this, which is what makes "the
// atlas matches the old renderer" a claim that can actually be checked.
import { contentKey } from './atlaskey.js';

// the rainbow cape cycles through these at runtime rather than holding a palette
const RAINBOW = ['#ff5545', '#ffd94d', '#2eff70', '#3fa9ff', '#c76bff'];

/**
 * @param {object} cfg   the theme data: SKINS, COSMETICS, VILLAGERS, TOWNS, TIERS
 * @param {string[]} ids every sprite id the packs define
 * @returns {Array<{key: string, id: string, palette: object|null}>}
 */
export function enumerateVariants(cfg, ids) {
  const { SKINS = [], COSMETICS = {}, VILLAGERS = [], TOWNS = [], TIERS = {} } = cfg;
  const known = new Set(ids);
  const out = new Map();

  const want = (id, palette = null) => {
    if (!known.has(id)) return;                  // a theme need not ship every sprite
    const key = contentKey(id, palette);
    if (!out.has(key)) out.set(key, { key, id, palette });
  };

  // every sprite in the palette it was drawn in
  for (const id of ids) want(id);

  // runners: a body per skin, plus a boot accent per giant tier
  for (const skin of SKINS) {
    want('runner_back', skin.palette);
    want(skin.body || 'runner_body_front', skin.palette);
    for (const unit of (TIERS.units || [])) want('runner_back', { ...skin.palette, b: unit.boots });
  }

  // capes, including the colours the rainbow one cycles through
  for (const def of (COSMETICS.cape || [])) {
    if (def.colors) want('cape', def.colors);
    if (def.rainbow) {
      want('cape', { c: '#ff5545', C: '#3fa9ff' });
      for (const c of RAINBOW) want('cape', { c, C: c });
    }
  }

  // villagers walking their towns, and the playroom bodies that share a palette
  const LIMBS = ['pm_torso', 'pm_leg', 'pm_arm'];
  for (const v of VILLAGERS) {
    if (v.body) want(v.body, v.palette || null);
    for (const part of LIMBS) want(part, v.palette || null);
  }
  for (const skin of SKINS) for (const part of LIMBS) want(part, skin.palette);

  // each town's house in that town's own materials
  for (const t of TOWNS) {
    const st = t.style;
    if (st) want('ui_house', { r: st.trim, R: st.trim, w: st.wall, W: st.wallAlt });
  }

  return [...out.values()];
}
