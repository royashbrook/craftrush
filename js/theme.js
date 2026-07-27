// @ts-check
// A theme is a folder. It decides what the game looks like and what is in it;
// the engine decides how any of it behaves.
//
//   themes/<id>/theme.json    what the theme is called and which files it has
//   themes/<id>/biomes.json   places to run through
//   themes/<id>/skins.json    who you run as
//   ...
//   themes/<id>/art/          the drawings
//   themes/<id>/atlas.png     built from art/ by tools/pack-atlas.mjs
//
// This module loads one at import time, so everything downstream can keep
// importing plain constants. Top-level await means importers wait for the fetch
// without any of them knowing it happened.
//
// Which theme: `?theme=<id>` in the browser, CRAFTRUSH_THEME in node, else the
// default below.

export const DEFAULT_THEME = 'craft';

function chooseTheme() {
  if (typeof location !== 'undefined' && location.search) {
    const q = new URLSearchParams(location.search).get('theme');
    if (q) return q;
  }
  if (typeof process !== 'undefined' && process.env && process.env.CRAFTRUSH_THEME) {
    return process.env.CRAFTRUSH_THEME;
  }
  return DEFAULT_THEME;
}

export const THEME_ID = chooseTheme();

// The browser fetches; node reads from disk, because node's fetch does not do
// file: URLs and the tests import this module directly. Node is checked FIRST
// rather than sniffing for `document`: the headless tests stub a fake document
// to drive the real game, and sniffing that way sent them down the fetch path.
const inNode = typeof process !== 'undefined' && !!process.versions?.node;

// In the browser the themes are served from the site root, so resolve against
// the document rather than this module: after bundling, import.meta.url points
// at a hashed chunk and `../themes` would land nowhere. document.baseURI keeps
// working both at the root in dev and under /craftrush in production.
// In node there is no document, so read them off disk relative to the repo.
const ROOT = inNode
  ? new URL(`../themes/${THEME_ID}/`, import.meta.url)
  : new URL(`themes/${THEME_ID}/`, document.baseURI);

async function readJSON(name) {
  const url = new URL(`${name}.json`, ROOT);
  if (inNode) {
    // the specifier is built at runtime so the bundler does not try to follow
    // it into a browser build, where this branch never runs
    const { readFile } = await import(/* @vite-ignore */ 'node:' + 'fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.pathname} returned ${res.status}`);
  return res.json();
}

const manifest = await readJSON('theme');
const parts = await Promise.all((manifest.data || []).map((n) => readJSON(n)));

/** Everything the theme supplies, keyed by file name. */
export const THEME = Object.fromEntries((manifest.data || []).map((n, i) => [n, parts[i]]));

/** Where the built atlas lives. This is what the game loads. */
export const THEME_ATLAS = new URL(manifest.atlas || '.', ROOT).href;

// Where the source drawings live. Usually inside the theme, but a theme that
// only recolours can point at another theme's art rather than copying it, which
// is why this is separate from the atlas: the atlas still has to be its own,
// since palette variants are baked in.
export const THEME_ART = new URL(manifest.art || 'art', ROOT).href;

/** Name and blurb, for anywhere that wants to say which theme is running. */
export const THEME_INFO = { id: manifest.id || THEME_ID, name: manifest.name, blurb: manifest.blurb };
