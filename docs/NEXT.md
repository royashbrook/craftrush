# What comes next

Research and adversarial review, 2026-07-27.

## Implementation status

v1.1 delivered the settlement and post-port hardening work in #74 and #75.
v1.2 delivers #76, #77, #78, and #80. The same NORMAL level 2 through 20
headless matrix now separates the two players cleanly:

| Mode | Passive wins | Competent wins |
| --- | ---: | ---: |
| Bow Blitz | 0/19 | 19/19 |
| Gate Dash | 0/19 | 19/19 |

The compact shop remains #79. Issue #81 intentionally waits for observations
from the production playtest described in `docs/PLAYTEST.md`.

## Product direction

The next release should make Craft Rush feel like a game the player wins, not a
spectacle that wins in front of them.

The target feeling is **playful mastery**:

- steering changes the outcome
- a better run produces a visibly easier boss fight and a better reward
- mistakes are readable and recoverable
- CALM remains welcoming for younger players
- no ads, analytics, trackers, or hidden difficulty tricks
- save compatibility is never put at risk

## What is actually on the backlog

Two GitHub issues were already open before this review:

- [#64 Adopt a standard atlas format](https://github.com/royashbrook/craftrush/issues/64).
  Keep deferred. The current atlas is tiny and does not need more machinery.
- [#72 Sourcemaps do not reach production](https://github.com/royashbrook/craftrush/issues/72).
  Closed after the production map returned HTTP 200, parsed as a valid source
  map, and contained all 69 source files.

The product backlog below is tracked in issues #74 through #81.

## The balance problem is proven

A headless no-input player was run through levels 1 through 20 in both modes. It
never steered, tapped, or chose anything.

| Mode | No-input wins |
| --- | ---: |
| Bow Blitz | 18/20 |
| Gate Dash | 18/20 |

The primary cause is deterministic:

1. Gate centers are at `-2.4` and `2.4`.
2. Each gate has a half-width of `2.4`, plus a `0.25` hit margin.
3. A player at `x = 0` therefore overlaps both gates.
4. The collision code sorts the two equal-distance gates. JavaScript sort is
   stable, so it selects the first generated gate.
5. The first generated gate is always good.

Several other mechanics compound that result:

- Bow Blitz targets every enemy in range regardless of the player's lane.
- shooting is automatic
- the golem is automatic
- Gate Dash boss charging is automatic
- Gate Dash bosses do not run the dodgeable attack loop
- boss health is normalized to the army that arrives, which erases much of the
  advantage earned by a skilled run

Raising enemy health alone will not fix this. Input has to change outcomes.

## Proposed issue backlog

### P0: Make lane choices real ([#76](https://github.com/royashbrook/craftrush/issues/76))

- Stop gate hitboxes from overlapping at the center.
- Keep the good-gate side randomized and cover that behavior with a regression
  test.
- After the tutorial levels, stop generating so many good-good pairs.
- Prefer a readable tradeoff over an obvious good/bad answer: safe growth versus
  a larger reward with a harder line.
- Add two headless players to the test suite:
  - passive: never moves
  - competent: steers toward the selected gate and dodges a known gap

Acceptance:

- passive player wins no more than 25% of levels 2 through 20 on NORMAL
- competent player wins at least 80% on NORMAL
- level 1 still teaches without punishing a child who is learning the gesture
- every generated choice remains solvable

### P0: Make skill survive into the boss fight ([#77](https://github.com/royashbrook/craftrush/issues/77))

- Base boss health on expected active-play power for that level, not the exact
  army that arrived.
- Let a strong run create a shorter or safer boss fight.
- Give Gate Dash an active boss phase instead of an automatic charge race.
- Make steering select weak points, crystals, lanes, or safe gaps in both modes.
- Keep aim assist, but limit target acquisition to a generous cone around the
  player's lane so positioning matters.
- Consider tap-to-release for a charged golem on NORMAL and faster paces, while
  CALM may keep automatic release.

Acceptance:

- a competent run reaches the boss with a measurable advantage
- doing nothing at the boss usually loses after level 1
- every boss attack has a visible warning and a reachable safe response
- CALM remains completable by a young or motor-limited player

### P1: Replace the shop wall with a dressing room ([#79](https://github.com/royashbrook/craftrush/issues/79))

The live iPhone-size shop contains 59 cards in one two-column page. Its scroll
container is 5,007 pixels tall inside a 690-pixel viewport, over seven screens.
A card is about 135 by 144 pixels, and only eight complete cards are visible at
once. The emerald balance is also shown twice.

Change it to:

- category tabs: Skins, Capes, Hats, Trails, Pets
- a three-column grid with compact cards
- one larger selected-item preview and Buy / Equip action
- a single wallet display
- badges for newly affordable, newly earned, owned, and equipped
- remember the selected category when returning from a paused run

Acceptance:

- three items fit per row on a 390 by 844 viewport
- every touch target remains at least 44 by 44 CSS pixels
- any category is reachable in one tap
- a category requires no more than about two viewport heights of scrolling
- buying cannot happen from an accidental first tap while browsing

Apple recommends 44 by 44 point iOS targets, Android recommends 48 by 48 dp, and
WCAG 2.2's web minimum is 24 by 24 CSS pixels:

- [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
- [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

### P1: Add visible mastery, not more currencies ([#78](https://github.com/royashbrook/craftrush/issues/78))

- Grade the run on choices, dodges, damage avoided, and crowd retained.
- Add a short combo for consecutive good decisions.
- Use near-miss feedback and distinct sounds to make a dodge feel intentional.
- Give campaign chapters one run-specific objective when it fits the story.
- Let the result screen explain one thing the player did well.

Do not add another economy, battle pass, card-upgrade ladder, or daily obligation.
The village, mine, campaign, cosmetics, and expedition already provide enough
progression surfaces.

### P1: Run short behavioral playtests ([#80](https://github.com/royashbrook/craftrush/issues/80))

Test five or more children across the actual 7 to 11 age range. Sessions should
be short and observational. Ask less about whether they "liked it" and record:

- whether they touch the screen without prompting
- whether they understand why the crowd changed
- how often they choose a lane
- whether they notice a boss warning
- whether they can find and equip a specific shop item
- whether they ask to play another run

The Games User Research guidance for children specifically recommends behavioral
evidence over opinion and warns that small age differences matter:
[How to test games with kids](https://gamesuserresearch.com/how-to-test-games-with-kids/).

No network telemetry is needed. Use the headless players for repeatable balance
checks and an observer sheet for human sessions.

### P1: Move save settlement out of the result screen ([#74](https://github.com/royashbrook/craftrush/issues/74))

`Result.svelte` currently advances the level, banks emeralds, completes campaign
chapters, writes backups, and renders the result. Its identity guard protects
against duplicate settlement only for the lifetime of that component instance.

- Extract settlement into a plain tested function.
- Invoke it once when the engine emits the result.
- Give the result an id or another durable idempotency guard.
- Keep `Result.svelte` as a renderer of an already-settled result.
- Test duplicate delivery, remount, expedition replay, campaign completion, and
  backup creation.

This is the only restructuring follow-up that should precede feature work because
it touches the sacred-save boundary.

### P2: Repair the small post-port seams ([#75](https://github.com/royashbrook/craftrush/issues/75))

- Give the village income and top-nav notification dots a reactive clock. Their
  `$derived(... Date.now())` values do not advance while the app sits open. The
  mine already demonstrates the correct twice-per-second pattern.
- Add teardown for `Game` canvas and window input listeners.
- Let `initHistory` return a popstate cleanup function.
- Stop shipping compiled theme data twice. Theme JSON is compiled into
  `themes.generated.js`, but non-atlas JSON is still copied into the build and
  precache. Keep `atlas.png` and `atlas.json`; the other built theme JSON totals
  about 70 KB and is no longer fetched.
- Refresh `README.md`; its build paths and architecture still describe the old
  app.

### P3: Revisit content after the core feels good ([#81](https://github.com/royashbrook/craftrush/issues/81))

- More distinct boss behavior and biome-specific hazards.
- Original music, if the core loop first proves replayable.
- A challenge run with transparent rules and a cosmetic reward.
- Revisit atlas format issue #64 only when animation timing, trim, or multiple
  pages become a real need.

## Adversarial reviews

### The skeptical player

"I am not making decisions. The game fires, targets, summons, chooses the good
center gate, and resolves the boss for me. My crowd gets bigger, but the boss
scales to whatever I brought, so getting better does not feel powerful."

Verdict: correct. Fix agency before adding content.

### The kid UX reviewer

"The shop looks like one enormous list. I cannot see that Capes, Hats, Trails,
and Pets exist until I scroll past every skin. Cards are attractive but too
large for browsing, and a tap spends currency before I can inspect an item."

Verdict: correct. Categories plus compact browse and explicit action.

### The maintenance reviewer

"The SvelteKit move is not the problem. The screen split, single reactive save,
plain-JavaScript engine, built-output WebKit tests, service-worker tombstone, and
standalone rescue page form a coherent system. Rewriting it again would add risk
without helping the game."

Verdict: keep the architecture. Harden settlement, clocks, and lifecycle cleanup.

The structural graph supports that conclusion. The major bridge files are
`js/config.js`, `src/lib/store.svelte.js`, `src/App.svelte`, and `js/game.js`.
Those are expected boundaries. `js/config.js` remains the largest bridge by far,
but splitting its 626 lines again is not urgent. Extract a domain only when work
in that domain needs it, and preserve the current re-export surface.

### The ponytail review

`src/App.svelte:L12: delete: unused commit import. Nothing replaces it.`

`src/lib/store.svelte.js:L19-20: delete: unused world() wrapper. Read save.world directly.`

`vite.config.js:L49-53: shrink: copied runtime theme set still includes compiled data JSON. Copy only atlas.png and atlas.json.`

`net: -3 source lines possible, plus about 70 KB removed from the build and precache.`

The code is otherwise lean for the amount of game present.

## Why this plan

The MDA framework recommends reasoning from the intended player experience back
to the dynamics and mechanics that create it. Here, the intended experience is
mastery, while the current automatic mechanics create passivity:
[MDA: A Formal Approach to Game Design and Game Research](https://www.cs.northwestern.edu/~hunicke/MDA.pdf).

Research on game engagement links enjoyment and continued play to autonomy and
competence. A player must feel that their choices matter and that their skill is
effective:
[A Motivational Model of Video Game Engagement](https://doi.org/10.1037/a0019440).

Difficulty adjustment can improve experience, but research also reports reduced
sense of control under some automatic systems. Craft Rush should therefore use
transparent CALM / NORMAL / FAST / TURBO rules and a visible retry assist, not
secret rubber-banding:
[Comparing Effects of Dynamic Difficulty Adjustment Systems](https://doi.org/10.1145/3116595.3116623).

The genre still benefits from its simple verbs. A comparable crowd game is
described around aiming, shooting through gates, and collection progression:
[Mob Control: Champions Edition](https://www.nintendo.com/us/store/products/mob-control-champions-edition-switch/).
Craft Rush does not need more systems than that. It needs its existing steering,
gates, combat, crowd, and bosses to produce meaningful choices.

## Recommended order

1. File the P0 balance issue and add passive/competent headless players.
2. Fix gate choice and boss payoff together.
3. Playtest the changed run with children before adding content.
4. Build the compact categorized shop.
5. Harden result settlement before broad campaign changes.
6. Clear the small post-port seams.
7. Add polish only where playtests show the core is now asking for more.
