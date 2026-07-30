# Handoff

Everything needed to pick this project up. Read this first, then `README.md`.

## What it is

Craft Rush: a Minecraft-flavoured crowd runner, built for Roy's kids. It is live
at **craftrush.royashbrook.com** and is genuinely played, which is the single
most important fact about it. Two consequences:

- **A save is sacred.** It lives in `localStorage` under `craftrush_save_v1`,
  with daily backups under `craftrush_backups_v1` and the exact save from before
  the last restore under `craftrush_pre_restore_v1`. Nothing may destroy
  one. The only code allowed to clear the live save is the explicit RESET button
  behind a confirm.
- **No ads, ever.** That is the reason the project exists. It is on the About
  page in those words. Do not add analytics, trackers or third party embeds.

Current release: **v1.7.1**, tag `v1.7.1`, deployed builds count up from it
(`v1.7.2` and so on). `main` is the deployed branch.

## The standalone deploy and old-address handoff

This repo builds and deploys the game directly. Pushing to `main` runs
`.github/workflows/deploy-site.yml`: full-history checkout, unit tests,
`npm run build`, a real-version guard, then `wrangler deploy`. `wrangler.jsonc`
owns the `craftrush.royashbrook.com` custom domain and serves `build/` as static
assets.

Full history is not optional. The release and service-worker cache key come from
the latest tag plus commits since it. A shallow checkout stamps `0.0.0-dev`, so
CI refuses to deploy one.

The companion **`royashbrook/royashbrook.com`** repo no longer builds the game.
Its `/craftrush/` page stays as a first-party save handoff because localStorage
cannot cross origins. The handoff does not retire the historical
`/craftrush/` worker or its caches before the replacement save is verified.
The old installed app is the last rescue copy and must remain reopenable,
including offline. Any later cleanup must never touch another app on the old
origin.

The old handoff must never auto-navigate. On iPhone, following its link from an
installed app opens the new origin in a Safari view, and a later Home Screen
installation gets another isolated storage container. The handoff therefore
requires a portable copy before opening the new home and tells the player to
keep the old icon until the installed replacement shows the right progress. A
fresh installed replacement surfaces `RESTORE COPIED SAVE` on its menu and uses
the existing verified import and rollback path.

Watch the deploy with `gh run list --repo royashbrook/craftrush --limit 1` and
verify the live hostname afterwards, never just the CI status.

## Run it

```sh
npm install          # also installs the git hooks, see Conventions
npm run dev          # vite dev server, no service worker
npm test             # node unit and engine-integration tests
npm run test:e2e     # playwright, four browser/device projects, against dev
npm run test:build   # the same suite against the BUILT output. Do not skip this.
npm run art          # rebuild themes + atlas after editing art or theme data
npm run build        # production build into build/
npm run check        # svelte-check
```

`?theme=neon` in the browser, or `CRAFTRUSH_THEME=neon` for node, runs the
alternate theme.

## Shape

```
js/            the engine. Canvas only, touches no DOM but the one canvas.
               game, render, levelgen, encounters, combat, boss, crowd,
               minegame, townscene, config (rules + save schema), theme,
               assets, atlaskey, variants
src/           the SvelteKit app. One route, one screen stack, no URLs.
  routes/+page.svelte   boots the game, owns the stage and canvas
  App.svelte            top bar, bottom nav, the screen stack
  screens/*.svelte      one per screen
  lib/store.svelte.js   the save, nav state, the back gesture
  service-worker.js     precache list comes from $service-worker
themes/<id>/   a theme: data JSON, art/ source PNGs, built atlas
tools/         pack-atlas, pack-themes, build-rescue, png
static/        served verbatim. themes/ and rescue.html are GENERATED here.
tests/         node tests + tests/e2e (playwright)
```

The engine is plain JavaScript and stays that way. TypeScript is opt in per file
with a `// @ts-check` pragma; the data layer is checked, the rest is not.

## Themes are the big idea

A theme is a folder. Biomes, skins, cosmetics, mobs, the campaign, the village,
the mine and the expeditions are all data. `config.js` re-exports it so every
call site is untouched, which is what makes a theme swap a folder swap.

The line to hold: **if changing it changes how the game PLAYS it is engine; if
it changes how the game LOOKS or READS it is theme.** `TUNE`, `SPEEDS`,
`CAMERAS`, the economy curves and the save schema are engine. `ENEMY_TYPES` is
theme despite reading like rules, because it is wholly declarative: `kind` is
one of chaser, archer, lobber, exploder or swooper and the engine implements
those.

`themes/neon` exists to prove it: same engine, same drawings, different world.
The whole test suite passes against it. Keep that true.

## Gotchas that cost hours

Every one of these is a real scar. The comments in the code say so too.

**No `viewport-fit=cover`.** With it, iOS pins the 844pt viewport at the top of a
912pt screen and orphans the strip at the bottom, so the nav floats above the
home indicator. Took three wrong fixes to find.

**No top-level await, anywhere.** `theme.js` used to fetch its data, which made
it an async module, which under code splitting changes the order chunks
evaluate in. Safari enforces that order differently from Chromium. The router's
first navigation ran before the chunk holding Svelte's helpers had initialised,
and the game died on `Ti is not a function` in production only, on the exact
devices it is played on, while four WebKit setups passed. Theme data is compiled
in now by `tools/pack-themes.mjs`. Do not reintroduce one.

**Test the built output, and test WebKit.** Both e2e projects used to be
Chromium, on a game played on an iPhone, and the suite only ever ran the dev
server. That combination shipped the bug above. `npm run test:build` and the
`safari`/`iphone` projects exist because of it.

**Reactivity is for what a screen draws.** Three separate infinite loops and one
frozen HUD came from getting this wrong. `hudState()` reuses one object per frame
on purpose, so assigning it to `$state` never looks like a change. `migrateWorld()`
mutates the save, so calling it inside `$derived` writes what it reads.
`MineWorld` and `TownScene` are created inside effects, so making them `$state`
loops. See `docs/SVELTE_PORT.md`.

**Do not rename the service worker** without leaving a tombstone at the old path.
`static/sw.js` is one: a registration whose script 404s can leave an old worker
alive forever, intercepting fetches and holding a stale cache.

**The origins are split, but cleanup still has boundaries.** On
`craftrush.royashbrook.com`, Craft Rush owns its root service worker and cache
names beginning `craftrush-`. On `royashbrook.com`, the permanent handoff page
owns only the historical `/craftrush/` scope and the same cache prefix. Never
broaden either cleanup path to neighboring origins, registrations, or caches.

**The host canonicalizes some `.html` URLs.** In particular, `rescue.html`
redirects to `/rescue`. A redirected response stored by `cache.addAll` cannot be
passed directly to a Chromium navigation's `respondWith`; use
`replayableCachedResponse` so offline rescue remains navigable.

**The rescue page must have no runtime module graph.** `static/rescue.html` is
generated by `tools/build-rescue.mjs`, which bundles and inlines everything into
one file. Bundling npm code into it is fine, the library becomes part of the
file. What it must never do is import at runtime, because it is the page a
player reaches when the app's modules already failed them. There is a test
asserting it fetches nothing external.

**The installed PWA and the browser have separate storage on iOS.** Same phone,
two different saves. The rescue page says which one you are in, and the QR
transfer exists to move progress between them. An installed app also has no
address bar, which is why `src/app.html` carries an inline watchdog that offers
a way out when the app fails to mount. This also means an origin-migration link
opened in a Safari view cannot seed a later Home Screen installation. Copy the
portable save first and restore it from inside the installed app.

**Cloudflare serves `.html` at the extensionless path.** Link to `./rescue.html`,
not `./rescue`: the bare path 404s on any plain static server including
`vite preview`.

## Conventions

**Every commit must reference an issue** (`Closes #12`, or just `#12`).
`npm install` points git at `.githooks`, and a workflow checks the same rule on
push, since a hook cannot police a commit made through the web UI. File the
issue first, including for small things.

Commit messages are prose that explains WHY, in Roy's voice. Read a few with
`git log` before writing one. No em dashes anywhere in issues or PR bodies:
there is a hook that rejects them, and it is right to.

Comments explain why, not what. Match the density around you.

## What is open

The researched product roadmap lives in `docs/NEXT.md` and is tracked by issues
#74 through #90. v1.1 delivered settlement safety and post-port cleanup
(#74, #75). v1.2 delivered gameplay agency, boss skill, visible mastery, and the
offline observer sheet (#76, #77, #78, #80). v1.3 delivered the compact
dressing-room shop (#79). v1.4 delivered shared-origin PWA/save hardening (#82).
v1.5 made standard boss fights survive strong arrivals with logarithmic surplus
damage and fixed Gate Dash's star-power discontinuity (#90). v1.6 moved the
production app to its dedicated subdomain, added the safe first-party save
handoff, and replaced event lottery with an eight-beat encounter director. Its
Plains, Forest, and Desert pilot each has a distinct run and boss identity
(#81, #95). v1.7 delivered three progress-timed Golem opportunities, accessible
CALM auto-release, persistent per-chapter records and skill badges, one compact
next target, and restrained impact feedback (#94). It also removed the duplicate
About-page version while keeping the menu as the canonical release display
(#89). v1.7.1 made the old iPhone handoff explicitly recoverable and restored
the always-visible menu wallet (#98, #99, royashbrook/royashbrook.com#9).

- **#64 Adopt a standard atlas format.** Deliberately deferred. Our manifest
  lacks trim, rotation, animation tags and multi page support that TexturePacker
  and Aseprite exports have. At 512x212 none of that earns its complexity. When
  it does, adopt an existing format rather than growing ours.
- **#72 Sourcemaps do not reach production.** Closed after production verification:
  the map returns, parses, and embeds all source bodies.

Ideas raised but not filed, because they may not be wanted: a save editor (the
rescue page's paste box already does it, and a friendly emerald editor is also a
friendly way for a kid to wipe a campaign), and more original 8 bit music.

## How Roy works

Worth knowing, because it will save friction.

- **Verify, do not assert.** Claiming something works without checking is the
  fastest way to lose trust here, and it has happened. Run it, load it in a
  browser, look at the bytes.
- **Say what you did not do**, and why, rather than quietly narrowing scope.
- He will push back with good technical arguments. When he is right, say so
  plainly and change course. He was right about SvelteKit, right that the build
  should have caught the Safari bug, and right that npm inside a bundle is not a
  runtime dependency.
- Terse prose. No preamble, no flattery, no restating the question.
- He runs a `/caveman` output style and other personal plugins. Those are his
  environment, not project requirements.

## The one rule

If you are about to suggest that someone clear their browser data, stop. That
destroys a save. Send them to
`https://craftrush.royashbrook.com/rescue.html` first, every time.
