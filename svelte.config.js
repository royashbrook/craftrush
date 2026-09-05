import adapter from '@sveltejs/adapter-static';
import { appVersion } from './tools/version.mjs';

// Files in static/ that the host reads as its own configuration and never serves.
export const isHostConfig = (file) => /^_(headers|redirects)$/.test(file);

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // A single prerendered page with no server behind it. There is no data to
    // fetch and nothing to render per-request: the whole game is a canvas and a
    // localStorage save.
    // No SPA fallback: there is exactly one route and it prerenders, so
    // index.html IS the page. That matters for more than tidiness — a fallback
    // has to use absolute asset URLs because it can be served at any depth, and
    // it was overwriting the prerendered page and taking the relative URLs with
    // it. The game is served from a subpath, so relative is the whole game.
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      precompress: false,
      strict: true,
    }),

    // The game is served from royashbrook.com/craftrush, not a domain root, and
    // the site build decides that path rather than this repo. Relative asset
    // URLs keep the output working wherever it is dropped, without hardcoding a
    // base here that would have to be kept in sync with someone else's config.
    paths: { relative: true },

    // The default version is a timestamp, so every rebuild would retire every
    // client's cache even when nothing changed. Key it to the release instead.
    version: { name: appVersion() },

    serviceWorker: {
      // registered by hand in src/routes/+layout.svelte, so dev never gets one:
      // a stale worker serving yesterday's app has cost real debugging time
      register: false,
      // `files` becomes the worker's precache list, and addAll is all or nothing.
      // Cloudflare consumes static/_headers as configuration and 404s the URL,
      // which failed the whole install and left the live site with no worker at
      // all: no offline play, no update banner, and nothing in the build to say so
      // because vite preview serves the same file happily.
      files: (file) => !/\.DS_Store/.test(file) && !isHostConfig(file),
    },
  },
};
