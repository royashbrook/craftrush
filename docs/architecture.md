# architecture and house-spec migration

Scope: [#139](https://github.com/royashbrook/craftrush/issues/139). The baseline is
`2aac84666806238febac53f6e701bef8f1e16b2d` (displayed 1.10.6). This document describes
the candidate, not an advance claim that it has shipped. The issue owns the final
exact-head checks and production receipt. Security scanning is a separate pass.

Maturity target: the house **1.0 release floor** for an established offline-capable
game, adopted here as the next **1.11** milestone. Profile: a single-player Canvas
arcade game with a SvelteKit static shell, local saves and optional installation.
No server, multiplayer, account, remote-save service or new rendering engine is
needed for this profile.

## boundaries

SvelteKit supplies one prerendered route, asset paths and the worker's generated
file list. There is no application server. Svelte owns the screen stack, semantic
controls, reactive save/HUD and mount lifetime. Vite bundles strict TypeScript.
Canvas remains the renderer: making each runner a reactive component would add a
second entity representation without solving a measured problem.

`js/game.ts` composes framework-free rule modules with declared `this: Game`
contracts. Theme JSON is compiled once into a typed module, not fetched during
module evaluation. `types/craftrush.d.ts` describes save, theme, entity and event
boundaries. Tests and build tools remain JavaScript. `npm run check` covers the
whole app with strict checking; no unchecked-JS application island remains.

`src/routes/+page.svelte` owns one game, RAF, input/history bindings, resize and
visibility listeners. Unmount destroys the game, removes bindings, cancels RAF,
stops the music scheduler and disposes update work. Audio uses one reusable
AudioContext; short effects end themselves, music uses audio time, not RAF time.
Visibility pauses a running game and clears held actions.

The shell passes fixed **1/60-second ticks** to the unchanged engine. This is the
rate used by the pre-existing balance fixtures. Render cadence does not change the
number of simulation steps. At most three ticks run per frame (50 ms, the previous
catch-up ceiling); excess elapsed time is dropped. Pausing clears partial ticks.
Rendering currently draws the latest state without interpolation. This is not a
claim of improved frame rate or a complete deterministic replay system: inputs
arrive on browser events and some visual effects still use randomness.

## preservation and deliberate changes

`tests/runtime-parity.test.mjs` reads the actual old Git objects and compares
executable syntax after type erasure and import-suffix normalization for fifteen
engine modules. A changed-speed mutant proves the comparator sees rule changes.
It does not certify browser paint or timing. The existing engine completion,
five-cohort balance, chapter/mastery and two-mode fixtures remain separate checks.

Intentional exceptions to the mechanical port:

- Asset URLs lose the duplicate slash that made both original built boot/art
  tests fail. The sprites, atlas inputs, theme data and rules are unchanged.
- The fixed shell clock makes 30/60/120-Hz presentations feed the same 60-Hz
  simulation trace. Clock tests cover stall/paused time; real-game traces cover
  steering, fire, position, worth, rewards and mastery for the chosen scenario.
- Settlement writes a daily backup only after persistence explicitly succeeds.
- Persistence refuses corrupt/unreadable storage, stale-tab overwrites and
  unverifiable writes. A visible warning offers export/rescue instead of silently
  claiming success. Unrelated keys and opaque retired progress are preserved.
- Import/reset/clipboard/QR flows report actual results. Rescue cannot interpret
  a failed read as permission to replace the save. Exact pre-restore bytes must
  be written and read back in a separate rollback slot first.
  A successful import/reset retires the outgoing page's save authority before
  reload, including daily backup writes. QR and copy export the same current
  in-memory progress, even when browser storage has refused its latest write.
- Pausing replaces the run HUD with shell chrome, rather than overlapping two
  wallets and the level/version labels. Help remains accessible after first-run
  coaching; install advice is conditional on browser capability and install state.
- The release coordinator and worker adopt the consent/identity/cache-retention
  rules documented in [release.md](release.md). Save keys, manifest identity,
  origin and worker URL do not change.
  The old capability-timeout install helper is removed: the new worker never
  decides to activate merely because no page answered in time. The page still
  answers the deployed worker's V2 messages. Native legacy upgrade and worker
  install/activation tests replace the obsolete timeout-helper unit cases.

## storage limits, not guarantees

The live slot remains `craftrush_save_v1`. The daily list and pre-restore slot
remain independent. Persist checks the last observed raw string immediately
before writing, so an observed stale tab refuses to overwrite a newer save.
LocalStorage is not a transactional compare-and-swap between processes; the code
does not promise atomic arbitration of simultaneous writes. Storage denial,
quota and eviction are browser constraints. Explicit export is still necessary
for a durable copy outside one browser container ([#100](https://github.com/royashbrook/craftrush/issues/100)).

Portable `cr1` codes keep both raw and compressed compatibility. Decoded UTF-8
data is capped at 1 MiB, including retired world data; encoded input has the
corresponding base64 bound. Consumption stops at the first chunk crossing the
limit, cancels the reader and has a five-second deadline. The cap bounds retained
output, not the native decompressor's individual chunk allocation. A 476,862-byte
legacy-world fixture round-trips exactly. Raw JSON export remains available when
a save is too large for QR transport; no save is truncated to fit.

## acceptance evidence

Use [release.md](release.md) for commands. The release issue records exact counts,
build identity and hosted/live outcomes; none are inferred from this checklist.

| area | instrument and limit |
|---|---|
| rules/types | strict Svelte/TS, pinned executable comparator, existing balance and full-run fixtures; not proof of every procedural seed |
| lifecycle/input | built Chromium/WebKit touch, release/cancel, pause, background, rotation, reduced motion and teardown checks |
| data | old/corrupt/blocked/quota/stale fixtures; real settings/reset/import controls; no cloud recovery added |
| updates/offline | native pinned legacy-to-candidate install, consent, second held client, old module hash, retirement, origin denial, rescue/notices; not physical airplane-mode evidence |
| layout/art | existing art/token and viewport tests plus direct visual inspection; no phone screenshot supplied for this candidate yet |
| privacy/rights | runtime notice inventory, exact served bytes and first-party request/cookie checks; not a security scan |
| product | representative real-control playthrough distinct from deterministic completion tests; no new child playtest claimed |

The atlas-format expansion in [#64](https://github.com/royashbrook/craftrush/issues/64)
and cross-container recovery in #100 are separate product decisions, not hidden
unfinished TypeScript work. A separate security scan follows this migration.
