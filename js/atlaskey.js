// How a getSprite(id, palette) call turns into a name in the atlas.
//
// The bake tool and the runtime MUST agree on this exactly, so it lives in one
// file that both import. Variants are keyed by what they look like, not by the
// cache-key strings the call sites pass, so three screens asking for the same
// cape colours all land on the same region of the atlas.

/** Stable order-independent fingerprint of a palette override. */
export function paletteKey(palette) {
  if (!palette) return '';
  const keys = Object.keys(palette);
  if (!keys.length) return '';
  keys.sort();
  let s = '';
  for (const k of keys) s += k + palette[k];
  return s;
}

/** FNV-1a, base36. Short enough to stay readable in the manifest. */
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The atlas name for a sprite drawn with an optional palette override. */
export function contentKey(id, palette) {
  const pk = paletteKey(palette);
  return pk ? `${id}#${hash(pk)}` : id;
}
