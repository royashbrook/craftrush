// @ts-check
// Which palette-swapped sprites the game can ask for.
//
// Skins, giant tiers, and capes are the same
// sprite drawn with a different palette. This list is derived from the same
// data the game reads, so the atlas covers every variant by construction rather
// than by anyone remembering to add one.
//
// The bake tool and the verifier both import this, which is what makes "the
// atlas matches the old renderer" a claim that can actually be checked.
import { contentKey } from './atlaskey.js';

// the rainbow cape cycles through these at runtime rather than holding a palette
const RAINBOW = ['#ff5545', '#ffd94d', '#2eff70', '#3fa9ff', '#c76bff'];
const RETIRED_ART = new Set([
  'head_villager', 'villager_body', 'pm_torso', 'pm_arm', 'pm_leg',
  'room_window', 'room_door', 'room_rug', 'room_shelf', 'room_lamp',
  'crafting_table', 'torch', 'potted_plant', 'painting', 'bed', 'cake',
  'ui_sofa', 'ui_lock',
]);

/**
 * @typedef {Record<string, string>} Palette a character to hex-colour map
 *
 * @param {{
 *   SKINS?: {id: string, body?: string, palette: Palette}[],
 *   COSMETICS?: Record<string, {id: string, colors?: Palette, rainbow?: boolean}[]>,
 *   TIERS?: {units?: {boots: string}[]},
 * }} cfg the theme's content
 * @param {string[]} ids every sprite id the art supplies
 * @returns {{key: string, id: string, palette: Palette|null}[]}
 */
export function enumerateVariants(cfg, ids) {
  const { SKINS = [], COSMETICS = {}, TIERS = {} } = cfg;
  const known = new Set(ids);
  const out = new Map();

  /** @type {(id: string, palette?: Palette|null) => void} */
  const want = (id, palette = null) => {
    if (!known.has(id)) return;                  // a theme need not ship every sprite
    const key = contentKey(id, palette);
    if (!out.has(key)) out.set(key, { key, id, palette });
  };

  // every sprite in the palette it was drawn in
  for (const id of ids) if (!RETIRED_ART.has(id)) want(id);

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

  return [...out.values()];
}
