# Craft Rush — Mob Runner

A blocky, Minecraft-inspired crowd-runner PWA for kids (7–11). Steer a growing mob
of runners down a pseudo-3D track, pick math gates, blast cartoon mobs, summon an
Iron Golem, and beat a boss at the end of every biome. All art and sound are
generated procedurally — original pixel art "in the style of", zero downloaded
assets, fully offline after first load.

## Versioning

The version shown in the top corner of the menu is **computed at build time** by
`tools/build.mjs` and stamped into `dist/`, you don't hand-edit it. It's semver:
**major.minor come from the latest git tag, and the patch is the number of commits
since that tag.** So every deploy bumps the patch automatically (`0.2.3`, `0.2.4`, …),
and cutting a milestone is just tagging the next `v0.x` in git (`v0.3`, …), which
resets the patch. (`VERSION` in `js/config.js` is only a fallback for an unbuilt or
git-less checkout.)

## Develop

```sh
npm install        # once
npm run dev        # vite dev server, no service worker, always fresh
npm test           # unit + headless integration (121 tests)
npm run test:e2e   # browser e2e (playwright)
npm run art        # rebuild the atlas after editing themes/<id>/art/*.png
npm run build      # build/, a prerendered page plus a service worker
npm run preview    # serve the built output exactly as it deploys
npm run check      # svelte-check over the components and typed modules
```

Play a different theme with `?theme=neon` in the browser, or
`CRAFTRUSH_THEME=neon` for the node tools and tests.

**Every commit must reference an issue** (`Closes #12`, or just `#12`). `npm install`
points git at `.githooks`, which enforces it locally, and a workflow checks it on
push as well, since a hook cannot police a commit made somewhere else.

Two test layers:
- **Unit + integration** (`tests/*.test.mjs`) — pure logic
  plus a headless harness that drives the real `Game` class through full runs
  with a stubbed canvas, so cross-module regressions surface without a browser.
- **Browser e2e** (Playwright, dev-only). One-time setup then run:
  ```sh
  npm install && npx playwright install chromium
  npx playwright test              # desktop + mobile viewports
  ```

`tools/build.mjs` copies the runtime files into `dist/` and regenerates the
service-worker precache list and a content-hashed cache version from the actual
file tree, so the precache can never drift. All asset paths are relative, so
`dist/` serves correctly under a subpath such as `/craftrush`.

## Contributing

This repo requires every commit message to reference a GitHub issue (e.g.
`#12` or `Closes #12`). The check lives in a shared hook. Enable it once after
cloning:

```sh
git config core.hooksPath .githooks
```

## Run it

Any static file server works (needs http:// for ES modules + service worker):

```sh
cd craftshoot
python3 -m http.server 8080
# or: npx serve .
# for cache-free iteration on the ES modules: python3 tools/devserver.py 8300
```

Open http://localhost:8080 — on a phone, use your machine's LAN IP, then
"Add to Home Screen" to install it as an app (fullscreen, offline).

## Play

- **Drag anywhere** (or A/D / arrow keys) to steer the crowd.
- **Gates**: blue = good (+N, ×N), red = bad (−N, ÷N). In Bow Blitz you can
  SHOOT gates: good gates grow, bad gates shrink toward harmless.
- **Redstone gauge** fills from hits/kills (or emeralds in Gate Dash). Tap the
  🗿 button (or Space) to summon an Iron Golem that flattens everything ahead.
- **Uncapped army**: crowd worth grows without limit. Beyond the rendered cap,
  runners merge into **Giga Steves** (worth 10) and then **Titan Steves**
  (worth 100), which grow bigger and hit harder the larger your army gets. The
  on-screen number is your total army worth and just keeps climbing.
- **Emeralds** buy skins AND cosmetics in the shop: capes (always visible — the
  camera rides behind the crowd), hats, arrow trails, pets. Beat the boss to
  advance to the next biome.
- **Camera**: menu button cycles Close / Far / Overhead, saved per device.
- **Daily Expedition**: one themed run per day (same for everyone, chosen by a
  date seed, no server) with its own modifiers — a Nether raid, a creeper storm,
  a Deep Dark Warden hunt, and so on. Finish it to build a play streak that
  pays escalating bonus emeralds. The full-reward multiplier and streak count
  only on the first clear each day; replays give base emeralds. Expeditions are
  a side mode and do not affect campaign level progression.

## Two game modes, one engine

- **BOW BLITZ** — the shooter version: crowd auto-fires arrows, powerups
  (triple/rapid/power shot), bosses with attack patterns.
- **GATE DASH** — the classic gate-multiplier version: no shooting; gates,
  dodging and the golem are everything. Boss = crowd slam: bring enough runners.

The toggle is data-driven (`mode` in `js/config.js` / menu button) — same engine,
systems switch off cleanly.

## Reskinning / extending

Everything visual is data:

- `themes/<id>/` — what the game looks like and what is in it. Biomes, skins,
  cosmetics, mobs, the campaign and the mine tiles, all as JSON, plus the art.
  The engine reads a theme; it does not contain one. `?theme=neon` in the
  browser or `CRAFTRUSH_THEME=neon` in node picks a different one.
- `themes/<id>/art/*.png` — one file per sprite, frames left to right. Open any
  of them in an image editor, then run `node tools/pack-atlas.mjs`.
  `art/sprites.json` carries what a PNG cannot: anchor, frame count, and the
  base palette the colour variants are derived from.
- `themes/<id>/atlas.png` + `atlas.json` — build output. Nothing edits these by
  hand.
- `js/config.js` — biomes (palettes, enemy rosters, bosses, scenery), skins
  (palette swaps + head sprite), enemy behavior stats, tuning.
- Levels are procedurally generated from the level number (seeded), difficulty
  scales automatically; 7 biomes cycle forever.

## Structure

```
index.html        shell + CSS
js/main.js        boot + loop + resize
js/config.js      tuning, biomes, skins, save
js/engine.js      camera, pseudo-3D ground/sky renderer
js/assets.js      sprite baker/registry (palette swaps, hit-flash)
js/game.js        crowd sim, combat, gates, bosses, fx
js/ui.js          menu/shop/HUD/results DOM
js/audio.js       WebAudio chiptune sfx + music
sw.js             offline cache
tools/            icon generator, sprite validator
```
