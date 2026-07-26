import adapter from '@sveltejs/adapter-static';
import { execSync } from 'node:child_process';

// major.minor from the last tag, patch from commits since it. Also what the
// corner of the menu shows, so a player reading out a version number is naming
// the same build the cache is keyed on.
function appVersion() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const since = execSync(`git rev-list ${tag}..HEAD --count`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${tag.replace(/^v/, '')}.${since}`;
  } catch {
    return '0.0.0-dev';
  }
}

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
    },
  },
};
