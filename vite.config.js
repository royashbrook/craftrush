import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { execSync } from 'node:child_process';

// Version: major.minor from the last tag, patch from commits since it. Same
// rule the hand-rolled build used, so the number in the corner keeps counting
// from where it was rather than resetting when the toolchain changed.
function appVersion() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const since = execSync(`git rev-list ${tag}..HEAD --count`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${tag.replace(/^v/, '')}.${since}`;
  } catch {
    return '0.0.0-dev';
  }
}

const walk = (dir, out = [], root = dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out, root);
    else out.push(relative(root, p).split(/[\\/]/).join('/'));
  }
  return out;
};

/**
 * Sync each theme's RUNTIME files into static/themes/<id>/.
 *
 * A theme folder holds its data, its source drawings and its built atlas. Only
 * the data and the atlas are runtime: art/ is what the atlas was packed FROM and
 * the browser never reads it. Copying the whole folder into static/ would put
 * 137 source PNGs into the build and into the precache.
 *
 * static/ is the directory SvelteKit serves, which is what makes $service-worker's
 * `files` cover the themes for nothing. That was the point of the move, so the
 * copy lives here rather than the themes being hand-listed in the worker.
 */
const isRuntime = (p) => /(^|\/)atlas\.(png|json)$/.test(p.split(/[\\]/).join('/'));

let synced = false;
function syncThemes(force = false) {
  // vite loads the config once per environment (ssr and client), so this runs
  // more than once per build. Copy in place and prune stale files individually
  // rather than removing the directory, which the two passes raced on.
  if (!existsSync('themes') || (synced && !force)) return;
  synced = true;
  const want = walk('themes').filter(isRuntime);
  for (const f of want) {
    const src = join('themes', f);
    const dst = join('static/themes', f);
    // Only write when the bytes actually differ. Rewriting an identical file
    // makes the dev server's watcher fire, which re-ran this, which rewrote the
    // file again: a loop that truncated responses mid-stream and left the app
    // failing to boot with ERR_CONTENT_LENGTH_MISMATCH.
    if (existsSync(dst)) {
      const a = statSync(src), b = statSync(dst);
      if (a.size === b.size && b.mtimeMs >= a.mtimeMs) continue;
    }
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
  if (existsSync('static/themes')) {
    const keep = new Set(want);
    for (const f of walk('static/themes')) {
      if (!keep.has(f)) rmSync(join('static/themes', f), { force: true });
    }
  }
}

// Run at config load, NOT in a plugin hook: SvelteKit walks static/ while it
// resolves the config, which is before buildStart, and it throws if a directory
// it listed has gone missing underneath it.
syncThemes();

function themes() {
  return {
    name: 'craftrush-themes',
    configureServer(server) {
      syncThemes();
      // pick up `npm run art` without needing a dev-server restart
      server.watcher.add('themes');
      server.watcher.on('all', (_event, file) => {
        // the SOURCE folder only: watching the copy would watch our own writes
        const rel = relative(process.cwd(), file).split(/[\\/]/).join('/');
        if (rel.startsWith('themes/') && isRuntime(rel)) syncThemes(true);
      });
    },
  };
}

export default defineConfig({
  plugins: [themes(), sveltekit()],
  build: {
    // Ship sourcemaps. A minified production-only failure reported as
    // "Ti is not a function" costs hours that a real function name costs
    // minutes, and for a game this size the maps are free.
    sourcemap: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: { port: 8123, strictPort: false },
});
