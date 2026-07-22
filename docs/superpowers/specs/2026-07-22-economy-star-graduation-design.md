# Economy Rebalance + Star Graduation — Design

## Problem

1. **Economy is trivially broken.** The win bonus is `12 + level*6 + floor(bestCrowd/4)`
   and `bestCrowd` is the uncapped army worth. A gate-stacked 12,000 army pays
   ~3,000 emeralds in one run; the entire shop costs ~3,700. Everything is
   buyable in ~2 runs.
2. **Top-tier Steves cover the screen.** `topTierScale` grows the 8 Ultra Steves
   up to 9.5× (render scale ~13.8×) as reserve climbs to 30,000. Testers can't
   see hazards. Tier size jumps (1.7 → 2.6 → 3.8) are also coarse.

## Goals

- Gentle, hard-capped sprite sizes; nothing ever covers the screen.
- An endless power fantasy that stays visually bounded ("Super Steve mode").
- Fix the earn exploit; buying everything takes many sessions, not two runs.

## Star Graduation (sizes + power)

**Tiers** — gentler steps, hard cap:

| Tier | worth | scale (old → new) | max slots |
|------|-------|-------------------|-----------|
| Steve (runner) | 1 | 1.0 | 96 |
| Mega Steve | 10 | 1.7 → 1.35 | 12 |
| Giga Steve | 100 | 2.6 → 1.7 | 10 |
| Ultra Steve | 1000 | 3.8 → 2.15 (cap) | 6 |

`topTierScale` runaway is removed. Max render scale ≈ 3.1× a runner (was ~13.8×).

**Graduation.** Constants: `GRAD_WORTH = 5000`, `STAR_MULT = 3`.
When army `worth >= GRAD_WORTH`:
- `stars += 1`
- `worth = round(worth / STAR_MULT)` (clump compacts, ~1,600)
- celebration: `SUPER STEVE ★{stars}`, burst, ring, shake, sfx
- per-run tint shifts with star count

**Effects of stars (per run, reset each run):**
- Arrow **damage ×= STAR_MULT^stars**
- Damage **taken ×= 1 / (1 + stars)** (gentle tankiness — the "health" half)
- `power = worth * STAR_MULT^stars` is the true strength; shown in the HUD with
  the ★ count. Because worth ÷STAR_MULT offsets damage ×STAR_MULT, power is
  **continuous** across a graduation (no dip).

`bestCrowd` now tracks best **power** (for the win bonus + bragging).

## Economy

**Earn fix.** Win bonus power term: `floor(bestCrowd/4)` → `round(log10(max(1,bestCrowd)) * 8)`.
Bonus becomes `12 + level*6 + ~40`. A million-power run pays ~48 from the term,
not 250,000. Pickups (1 each) + chests (10) stay the steady drip.

**Steeper shop** (~3,700 → ~19,000 total), cheap starters, expensive top end:
- Skins: 0 / 40 / 120 / 300 / 700 / 1500 / 3000
- Capes: 0 / 80 / 200 / 400 / 800 / 1400 / 2500
- Hats: 0 / 120 / 300 / 550 / 900 / 1500
- Trails: 0 / 150 / 400 / 800 / 1600
- Pets: 0 / 500 / 1200

A good win nets ~100; buying everything is many sessions.

## Testing

- Graduation: worth crossing 5000 → stars +1, worth ≈ worth/3, power continuous.
- Repeated graduations stack stars; power monotonic non-decreasing across the step.
- Damage scales ×STAR_MULT^stars; damage taken shrinks with stars.
- Win bonus bounded: a 1e6-power run yields a small two-figure power term.
- Shop totals match the ladder above.
- Browser: no Ultra ever exceeds the cap; SUPER STEVE pop fires; HUD shows ★.

## Out of scope

Cross-run/meta prestige (that's the town/hub, #35). Stars are per-run.
