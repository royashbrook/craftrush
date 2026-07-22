# Home Hub — Idle Village (first slice of #35)

## Goal

A persistent HOME the player reaches from the menu: buy villager friends who
populate the home as sprites and earn emeralds while the player is away
(welcome-back income). The deep emerald sink + the reason to keep playing.
First slice of the #35 phased plan; decoration/placement, mining, and prestige
are later slices.

## Access & UI

- New `🏠 HOME` button on the menu → `#home` overlay (same show/BACK pattern as
  `#shop`). A small `●` badge shows on the button when idle emeralds are waiting.
- `#home` contents:
  - Title + live emerald balance.
  - Welcome-back banner when pending > 0: "Your villagers gathered +X" + COLLECT.
  - Income rate line: "Earning +N/hr".
  - Home scene canvas: a cozy room backdrop with each owned villager drawn as a
    gently bobbing sprite (reuses existing character art — no new sprites).
  - Villager list: per type a card with sprite, name, owned count, income, next
    cost, BUY (disabled if unaffordable).
  - BACK → menu.

## Villagers

Five types. Buying the Nth of a type costs `round(base * RATE^owned)`,
`RATE = 1.15`. Each earns `income` emeralds per real hour.

| id | name | base | income/hr | art |
|----|------|------|-----------|-----|
| farmer | Farmer | 50 | 5 | steve |
| miner | Miner | 250 | 24 | alex |
| fisher | Fisher | 1000 | 85 | zombie |
| trader | Trader | 4000 | 300 | piglin |
| librarian | Librarian | 15000 | 1000 | enderman |

## Idle income

- `rate(villagers)` = Σ count * income/hr.
- On return, `pending = floor(rate * min(now - lastCollect, CAP) / 3_600_000)`,
  `CAP = 8h` in ms. Cap keeps it a pleasant secondary drip, not a replacement
  for run earning, and rewards coming back.
- COLLECT: `emeralds += pending`, `lastCollect = now`, persist.
- Timestamps use `Date.now()` (browser only — never runs in a Workflow script).

## Save

`home: { villagers: { farmer:0, miner:0, fisher:0, trader:0, librarian:0 },
lastCollect: 0 }`. Added to the save default; the home code defensively fills any
missing villager keys so older saves migrate cleanly. `lastCollect` seeds to
"now" the first time HOME is opened so a fresh save doesn't bank 8h instantly.

## Pure, testable helpers (in config.js)

- `villagerCost(type, owned)` → next-buy cost.
- `homeIncomeRate(villagers)` → emeralds/hr.
- `pendingIdle(villagers, lastCollect, now)` → capped accrued emeralds.

## Tests

- Cost curve rises with ownership (`villagerCost` monotonic; base at owned 0).
- Income rate sums correctly across mixed villagers.
- Idle accrual scales with elapsed time and is clamped at the 8h cap.
- A fresh home (no villagers) accrues nothing.
- Browser: buy deducts emeralds and adds a bobbing sprite; COLLECT banks pending
  and zeroes it; badge shows on the menu button when income waits.

## Out of scope (later slices)

Free furniture/decoration placement, dressing villagers, the mining minigame,
and prestige.
