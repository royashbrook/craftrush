# Mining Minigame (slice of #35)

## Goal

An active, tap-driven "something to do" between runs that feeds the emerald
economy. Its own screen so the Home hub stays compact. Energy-gated (generous)
so it can't out-earn the runner economy and gives a recharge return-hook.

## Access

`⛏️ MINE` button on the menu → `#mine` overlay. Backed by `save.mine`.

## The loop

A dig face of blocks (4×4 grid). Tap a block to swing the pickaxe:
- costs 1 energy, deals `pickaxeDmg` to the block's HP
- when HP hits 0 the block breaks, pays emeralds, and a deeper block drops in
- `mine.depth` (deepest reached) climbs; blocks get tougher and pay more

Deep blocks are tanky, so a weak pickaxe drains energy fast — that drives the
tap → earn → upgrade → dig-deeper loop.

## Numbers

`MINE = { energyCap: 60, energyRefillMs: 20000, gemCritChance: 0.06, gemCritMult: 5, cols: 4, rows: 4 }`

- `blockHp(depth) = 1 + floor(depth / 6)`
- `blockPay(depth) = 1 + floor(depth / 8)` (base emeralds; a gem crit pays ×5)
- `blockKind(depth)`: 0 stone, 10 coal, 25 iron, 50 gold, 100 diamond, 200 emerald
- Energy refills 1 per 20s (full 60 in ~20 min), timestamp-based like the village.

Pickaxes (one-time buys, a fixed ladder):

| id | name | dmg | cost |
|----|------|-----|------|
| wood | Wooden | 1 | 0 |
| stone | Stone | 2 | 200 |
| iron | Iron | 4 | 1000 |
| gold | Gold | 7 | 4000 |
| diamond | Diamond | 12 | 15000 |
| netherite | Netherite | 20 | 50000 |

A full-energy session nets roughly a run's worth (~60–150 emeralds), scaling with
depth and pickaxe — earns *and* sinks emeralds, feeding village + shop.

## Save

`mine: { depth: 0, energy: 60, energyTs: 0, pickaxe: 'wood' }`. The grid is
runtime-only (regenerated from `depth` on open); only depth/energy/pickaxe
persist. `energyTs` seeds to now on first open so a fresh save starts full, not
banking. Migrates defensively like the other save fields.

## Pure, testable helpers (config.js)

`blockHp`, `blockPay`, `blockKind`, `mineEnergy(mine, now)`, `pickaxeDmg(id)`,
`nextPickaxe(id)`, `pickaxeCost(id)`.

## UI

`#mine` overlay: header + emeralds, a stat line (Depth / energy / pickaxe), an
energy bar, the 4×4 dig-face grid (block buttons colored by kind with a crack
shade from HP), a pickaxe-upgrade button when a next tier exists and is
affordable, and BACK. Out of energy → blocks disabled + "recharging" note. A
badge on the menu MINE button when energy is full (come mine).

## Tests

- HP/pay curves monotonic, base at depth 0; kind thresholds.
- Energy: full when fresh, refills with elapsed time, clamped at cap.
- Pickaxe dmg/cost/next-tier lookups; netherite has no next.
- Browser sim: tapping breaks blocks and banks emeralds; energy drains; tapping
  at 0 energy does nothing; upgrading deducts and raises damage.

## Out of scope (later)

Resource inventory (named ores as items), prestige, decoration. This slice is the
core active loop + energy + pickaxe upgrades.
