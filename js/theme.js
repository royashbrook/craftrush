// @ts-check
// A theme is a folder. It decides what the game looks like and what is in it;
// the engine decides how any of it behaves.
//
//   themes/<id>/theme.json    what the theme is called and which files it has
//   themes/<id>/biomes.json   places to run through
//   ...
//   themes/<id>/art/          the source drawings
//   themes/<id>/atlas.png     built from art/ by tools/pack-atlas.mjs
//
// The DATA is compiled into js/themes.generated.js and imported synchronously.
// It used to be fetched, which made this an async module, which under code
// splitting changes the order chunks evaluate in. Safari enforces that order
// differently from Chromium: the router's first navigation ran before the chunk
// holding Svelte's helpers had initialised, and the game died on "ki is not a
// function" with no useful stack, in production only, on the phone it is
// actually played on. There is no top-level await in this file any more, and
// there should not be one again. See #69.
//
// Which theme: `?theme=<id>` in the browser, CRAFTRUSH_THEME in node, else the
// default below.
import { THEMES, THEME_IDS } from './themes.generated.js';

export const DEFAULT_THEME = 'craft';

function chooseTheme() {
  let want = '';
  if (typeof location !== 'undefined' && location.search) {
    want = new URLSearchParams(location.search).get('theme') || '';
  }
  if (!want && typeof process !== 'undefined' && process.env && process.env.CRAFTRUSH_THEME) {
    want = process.env.CRAFTRUSH_THEME;
  }
  // an unknown id falls back rather than leaving the game with no content
  return THEMES[want] ? want : DEFAULT_THEME;
}

export const THEME_ID = chooseTheme();

const picked = THEMES[THEME_ID] || THEMES[DEFAULT_THEME];
const manifest = picked.manifest;

/** Kept for the app to render. Nothing sets it now that the data is compiled in. */
export const THEME_ERROR = null;

/** Everything the theme supplies, keyed by file name. */
export const THEME = picked.data;

/** Every theme that shipped, for anything that wants to offer a choice. */
export { THEME_IDS };

// Where the theme's files live, for the art loader and the tools. The atlas is
// still a real file: it is a PNG, and it is fetched inside initAssets where a
// failure degrades to placeholder art instead of killing the app.
const inNode = typeof process !== 'undefined' && !!process.versions?.node;
const ROOT = inNode
  ? new URL(`../themes/${THEME_ID}/`, import.meta.url)
  : new URL(`themes/${THEME_ID}/`, document.baseURI);

/** Where the built atlas lives. This is what the game loads. */
export const THEME_ATLAS = new URL(manifest.atlas || '.', ROOT).href;

// Where the source drawings live. Usually inside the theme, but a theme that
// only recolours can point at another theme's art rather than copying it, which
// is why this is separate from the atlas: the atlas still has to be its own,
// since palette variants are baked in.
export const THEME_ART = new URL(manifest.art || 'art', ROOT).href;

/** Name and blurb, for anywhere that wants to say which theme is running. */
export const THEME_INFO = { id: manifest.id || THEME_ID, name: manifest.name, blurb: manifest.blurb };
