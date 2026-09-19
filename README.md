# Craft Rush — Mob Runner

A blocky, Minecraft-inspired crowd-runner PWA for kids (7–11). Steer a growing mob
of runners down a pseudo-3D track, pick math gates, blast cartoon mobs, summon an
Iron Golem, and beat a boss at the end of every biome. All art and sound are
generated procedurally — original pixel art "in the style of", zero downloaded
assets, fully offline after first load.

## Versioning

The top-right version is derived from the nearest `vMAJOR.MINOR` milestone on
main's first-parent history. Patch counts all commits since it. A separate build
fingerprint identifies the exact input snapshot for updates. Production refuses
missing history/tags, dirty trees and backwards legacy anchors; no fallback build
can deploy. See [the release contract](docs/release.md) for commands and evidence.

Picking this up cold? Read [docs/HANDOFF.md](docs/HANDOFF.md) first: architecture,
the standalone deploy, save handoff, and the gotchas that cost hours.

## Develop

```sh
npm ci             # Node 22, exact lockfile
npm run dev        # vite dev server, no service worker, always fresh
npm test           # unit + headless integration
npm run test:e2e   # browser e2e (playwright)
npm run art        # rebuild the atlas after editing themes/<id>/art/*.png
npm run build:dev  # explicitly labelled local artifact, including a worker
npm run build      # strict release: clean tree and eligible milestone required
npm run preview    # serve the built output exactly as it deploys
npm run check      # strict Svelte + TypeScript over the complete application
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
- **Browser e2e** (Playwright, against dev or the built output). One-time setup
  then run:
  ```sh
  npm ci && npx playwright install chromium webkit
  npm run test:e2e                  # dev server, desktop + mobile viewports
  PW_TARGET=build PW_PREBUILT=1 npm run test:e2e # the artifact already built above
  ```

SvelteKit writes the production app to `build/`. Its service worker receives the
real generated file list from `$service-worker`, so the precache follows the
build automatically. Relative asset paths keep local preview and the production
root at `https://craftrush.royashbrook.com/` on the same artifact.

## Contributing

This repo requires every commit message to reference a GitHub issue (e.g.
`#12` or `Closes #12`). The check lives in a shared hook. Enable it once after
cloning:

```sh
git config core.hooksPath .githooks
```

## Run it

The dev server is the quickest local path:

```sh
npm run dev
```

For the local production shape, run `npm run build:dev && npm run preview`. On a
phone, use the machine's LAN address, then "Add to Home Screen" to install it as
an offline fullscreen app.

## Play

- **Bow Blitz:** hold and drag to fire and steer. Release to stop firing. CALM
  keeps automatic fire as its accessibility option.
- **Gate Dash:** drag anywhere (or use A/D / arrow keys) to steer the crowd.
- **Gates**: blue = good (+N, ×N), red = bad (−N, ÷N). In Bow Blitz you can
  SHOOT gates: good gates grow, bad gates shrink toward harmless.
- **Iron Golem** readiness arrives at one-third, two-thirds, and boss arrival,
  so every run has the same three readable opportunities. On NORMAL and faster
  paces, tap anywhere without dragging (or press Space) to choose the release
  timing. CALM releases it automatically. Holding a ready Golem through the next
  opportunity wastes that grant rather than stacking a hidden extra charge.
- **Chapter mastery** keeps each campaign chapter's best grade, biggest crowd,
  and three skill badges. The menu and Goals show one useful next target; mastery
  never changes rewards, purchases, or campaign progression.
- **Uncapped army**: crowd worth grows without limit. Beyond the rendered cap,
  runners merge into **Giga Steves** (worth 10) and then **Titan Steves**
  (worth 100), which grow bigger and hit harder the larger your army gets. The
  on-screen number is your total army worth and just keeps climbing.
- **Emeralds** buy skins AND cosmetics in the shop: capes (always visible — the
  camera rides behind the crowd), hats, arrow trails, pets. Beat the boss to
  advance to the next biome.
- **Camera**: menu button cycles Close / Far / Overhead, saved per device.
- **Expedition**: one themed run per week (same for everyone, chosen by a
  week seed, no server) with its own modifiers: a Nether raid, a creeper storm,
  a Deep Dark Warden hunt, and so on. Finish it each day to build a play streak
  that pays escalating bonus emeralds. The full-reward multiplier and streak
  count only on the first clear each day; replays give base emeralds.
  Expeditions are a side mode and do not affect campaign level progression.

## Two game modes, one engine

- **BOW BLITZ** — the shooter version: hold and drag to fire arrows, powerups
  (triple/rapid/power shot), bosses with attack patterns.
- **GATE DASH** — the classic gate-multiplier version: no shooting; gates,
  dodging and the golem are everything. Bosses still attack, so steer through
  warned safe lanes while the crowd charges.

The mode is data-driven (`mode` in `js/config.ts` / the two play buttons): same engine,
systems switch off cleanly.

## Reskinning / extending

Everything visual is data:

- `themes/<id>/` — what the game looks like and what is in it. Biomes, skins,
  cosmetics, mobs, the campaign, and expeditions, all as JSON, plus the art.
  The engine reads a theme; it does not contain one. `?theme=neon` in the
  browser or `CRAFTRUSH_THEME=neon` in node picks a different one.
- `themes/<id>/art/*.png` — one file per sprite, frames left to right. Open any
  of them in an image editor, then run `node tools/pack-atlas.mjs`.
  `art/sprites.json` carries what a PNG cannot: anchor, frame count, and the
  base palette the colour variants are derived from.
- `themes/<id>/atlas.png` + `atlas.json` — build output. Nothing edits these by
  hand.
- `js/config.ts` — engine tuning, economy, save schema and compatibility
  re-exports for theme data.
- Levels are procedurally generated from the level number (seeded), difficulty
  scales automatically; 7 biomes cycle forever.

## Structure

```
src/routes/+page.svelte   boot, canvas sizing and engine loop
src/App.svelte            app bar, screen stack and bottom navigation
src/screens/              one Svelte component per game screen
src/lib/store.svelte.ts   reactive save, navigation and back gesture
src/lib/update.ts         bounded update discovery, consent and lifecycle
src/service-worker.ts     exact-build precache, held-client cache retention
js/game.ts                run lifecycle and engine composition
js/clock.ts               fixed 60Hz simulation, bounded catch-up
js/encounters.ts          seeded eight-beat encounter direction
js/levelgen.ts            directed track runtime and event spawning
js/combat.ts              gates, enemies, pickups and summons
js/boss.ts                boss fights
js/mastery.ts             run grades, persistent records, badges and next target
js/config.ts              tuning, economy, save and theme re-exports
themes/<id>/              theme data, source art and packed atlas
tools/                    theme, atlas and rescue-page builders
tests/                    node integration and Playwright browser coverage
```
