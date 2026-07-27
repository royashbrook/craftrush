# Handoff

Everything needed to pick this project up. Read this first, then `README.md`.

## What it is

Craft Rush: a Minecraft-flavoured crowd runner, built for Roy's kids. It is live
at **royashbrook.com/craftrush** and is genuinely played, which is the single
most important fact about it. Two consequences:

- **A save is sacred.** It lives in `localStorage` under `craftrush_save_v1`,
  with daily backups under `craftrush_backups_v1` and the exact save from before
  the last restore under `craftrush_pre_restore_v1`. Nothing may destroy
  one. The only code allowed to clear the live save is the explicit RESET button
  behind a confirm.
- **No ads, ever.** That is the reason the project exists. It is on the About
  page in those words. Do not add analytics, trackers or third party embeds.

Current release: **v1.4**, tag `v1.4`, deployed builds count up from it
(`v1.4.1` and so on). `main` is the deployed branch.

## The two repo deploy, which is easy to miss

This repo does **not** build the deployed site. Pushing to `main` here fires
`.github/workflows/deploy-site.yml`, which clones **`royashbrook/royashbrook.com`**
and runs *its* build. That site's `scripts/pull-craftrush.mjs` clones this repo
(full clone, no `--depth`, because the version comes from git tags), runs
`npm ci && npm run build`, and copies whatever appears in `build/` or `dist/`
into `public/craftrush/`.

Three things follow:

1. **A change to this repo's build output shape can silently break the site.**
   That pull script fails soft on purpose so a broken game cannot take the whole
   site down, which means a mistake ships as "the game quietly vanished". It
   prints a loud block when it gives up. Read it before changing the build.
2. Both repos are on this machine: `~/gh/craftshoot` and `~/gh/royashbrook.com`.
3. Another agent owns the site repo. Coordinate rather than assuming.

Deploy takes roughly three to four minutes. Watch it with
`gh run list --limit 1` and verify the live site afterwards, never just the CI
status.

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
               game, render, levelgen, combat, boss, crowd, minegame, townscene,
               config (rules + save schema), theme, assets, atlaskey, variants
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

**The origin is shared.** Craft Rush owns cache names beginning `craftrush-` and
service-worker scopes below `/craftrush/`, nothing else. The worker, tombstone,
Settings, and rescue page all enforce that boundary. Never broaden their cleanup
to every cache or registration on royashbrook.com.

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
a way out when the app fails to mount.

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
#74 through #82. v1.1 delivered settlement safety and post-port cleanup
(#74, #75). v1.2 delivered gameplay agency, boss skill, visible mastery, and the
offline observer sheet (#76, #77, #78, #80). v1.3 delivered the compact
dressing-room shop (#79). v1.4 delivered shared-origin PWA/save hardening (#82).
Content issue #81 stays gated on actual playtest observations.

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
destroys a save. Send them to `/craftrush/rescue.html` first, every time.
