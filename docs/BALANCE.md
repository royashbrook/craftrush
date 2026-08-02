# Balance model and v1.9.1 findings

Updated 2026-08-02. Run `npm run metrics:balance` to reproduce the full JSON
report. The release gates are in `tests/balance-policy.test.mjs`.

## What we measure

The simulator runs the real engine at 60 updates per second. Each cohort plays
levels 1 through 20 in both modes with four independent behavior seeds. Combat
randomness is held separate from policy randomness, so every cohort faces the
same authored level and combat scenario.

The five policies are intentionally legible rather than presented as human
prediction:

| Cohort | Behavior represented |
| --- | --- |
| Passive | no steering and no attack input |
| Lazy | 800ms delayed steering, incomplete attack holds, inconsistent choices and dodges |
| Noisy | 280ms delayed steering, mostly sustained input, occasional decision and dodge errors |
| Greedy | always takes the largest visible immediate gate, but reads hazards poorly |
| Skilled | 100ms delayed steering, accurate choices, aiming, attack holds, and dodges |

We report:

- win, track-failure, boss-failure, and boss-reach rates
- best, alternate, safe, and missed gate decisions
- arrival power as a ratio of the authored boss par
- action transitions and run/boss time
- boss attack beats started
- warned lane-wave beats, threatening beats, hits, and dodges
- intrinsic boss TTK with attacks disabled, plus wall-clock active-fight TTK

`warnedWaveHitRate` is hits divided only by waves projected to hit the player,
not every wave drawn. Forest ambushes, summoned minions, and projectile attacks
are included in total boss attack beats but are not mislabeled as lane dodges.

This is offline test telemetry. Craft Rush does not send analytics or player
data anywhere.

## v1.9.1 release matrix

Each cell is 80 runs: 20 levels times four behavior seeds on NORMAL.

| Cohort | Bow Blitz | Gate Dash | Release band |
| --- | ---: | ---: | ---: |
| Passive | 0.0% | 0.0% | 0–5% |
| Lazy | 23.8% | 17.5% | 15–40% |
| Noisy | 68.8% | 61.3% | 55–75% |
| Greedy | 47.5% | 42.5% | 35–60% |
| Skilled | 93.8% | 87.5% | 85–95% |

No equivalent cohort differs by more than ten percentage points between modes.
The ordering also proves something useful about the core: greedy arithmetic is
not enough. Reading the follow-through hazard and boss warning is worth more
than always choosing the largest number.

The level curve is visible in the noisy cohort:

| Levels | Bow Blitz | Gate Dash |
| --- | ---: | ---: |
| 1–3 | 100.0% | 83.3% |
| 4–10 | 71.4% | 71.4% |
| 11–20 | 57.5% | 47.5% |

This keeps onboarding generous while making later runs meaningfully losable.
Passive play wins none of the early levels, deliberately: the player must at
least make the one-finger input that the game is teaching.

## Gate consequence budget

Every normal run has three real decision rows and one clearly automatic relief
reward. The authored route uses relative scale gates so mistakes compound from
the crowd the player actually has, including expeditions with a larger starting
army.

- one alternate retains 83–87% of the par route
- any two alternates retain 68–78%
- the middle and final choices add visible follow-through hazards after onboarding
- the automatic reward catches every legal lane and never awards mastery credit
- track growth stops at level 20, so endless progression cannot create a 14-minute run

v1.9.1 broadens the physical gates without restoring a center-lane autopilot.
Their labels are clipped to an inset sign face and have no fixed screen-pixel
minimum, so the lettering grows with the projected gate instead of floating
over it near the horizon. The fractional alternate remains for now because it
is what preserves the tested one-error budget; the presentation and arithmetic
can be judged separately in the next human playtest.

## Boss time and pressure

Intrinsic TTK isolates the health and damage curve. The range below covers
levels 1, 6, 12, and 20 on NORMAL.

| Arrival | Bow Blitz | Gate Dash |
| --- | ---: | ---: |
| 1× par | 13.88–13.90s | 11.95–13.35s |
| 2× par | 9.95–10.03s | 9.15–9.75s |
| 5× par | 7.28–7.42s | 7.05–7.85s |

A strong run still earns a faster boss, but surplus damage is logarithmically
compressed and cannot erase the encounter. Active par fights start at least
three boss attack beats; 2× fights start at least two. Gate Dash attacks only
while the field is held outside CALM. A warned boss hit removes the larger of
its authored fixed loss or 26% of the current crowd, bypassing star mitigation,
so the threat stays relevant after large multipliers.

## Comparison with the genre

[Count Masters](https://apps.apple.com/us/app/count-masters-crowd-runner-3d/id1568245971)
advertises the same core promise: choose the best gate, grow the crowd, avoid
obstacles, then defeat a final enemy. Its public store page does not publish
level-clear or boss-TTK data, so claiming numerical parity would be invented.
The comparison we can make is structural: Craft Rush now requires the same
three skills instead of letting center-lane growth and automatic boss damage
complete the spectacle.

GameAnalytics recommends tracking progression starts, completions, failures,
win percentage, time, and score, and warns that levels that are too easy can
hurt retention. It also recommends making the first level close to impossible
to fail. We use its measurable progression model, but make one deliberate
departure: completely passive play cannot clear level 1 because that was the
exact failure observed in playtests.

- [GameAnalytics progression events](https://docs.gameanalytics.com/events-metrics-and-filtering/event-types/progression-events/)
- [GameAnalytics progression metrics](https://docs.gameanalytics.com/events-metrics-and-filtering/metrics/)
- [GameAnalytics on hyper-casual difficulty](https://www.gameanalytics.com/blog/hyper-casual-game-common-mistakes)

## What the simulator cannot prove

These policies are reproducible probes, not children. They cannot measure fun,
clarity, delight, fatigue, or whether someone voluntarily starts another run.
The next production playtest should record first input, understood cause and
effect, gate mistakes, boss-warning response, win/loss, and replay choice using
`docs/PLAYTEST.md`. Do not retune from one anecdote or add another side system
before that observation.
