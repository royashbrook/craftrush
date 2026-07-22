# Playroom — Dressable Playmates (slice of #35)

## Goal

The Toca-Boca payoff: characters you bring into a room to dress up and move
around. Reuses owned skins + cosmetics (zero new art) and gives a reason to buy
shop cosmetics. Lives in its own Playroom sub-screen so Home stays compact.

## Access

A `🧸 PLAYROOM` button on the Home screen opens `#playroom`. Backed by
`save.playmates`.

## Screen

- A big cozy room scene filling the panel.
- Each playmate is a **draggable** character sprite; position saved as fractions
  (x,y in [0,1]) so it scales on any screen.
- `＋ ADD FRIEND` → pick from the **skins you own**; adds one to the room.
- Tap a playmate → a **dress panel**: swap its **skin** (owned) and **hat** and
  **cape** (owned), applied to that playmate only. Its own `✕` removes it.
- Dressing a playmate is independent of the run character.

Cosmetics in v1: skin + hat + cape (the front-on visible ones). Trail and pet are
deferred (a trail is motion, a pet is a companion — awkward on a static portrait).

## Rendering

`drawDressedCharacter(cv, skin, cosmetics)` composes on a canvas at any size,
generalizing `drawSkinPreview`'s proportions (body bottom, head above) and adding
the cape behind and the hat on the head, positions tuned to match the in-game
layering. Reuses `getSprite`/`blit` and the villager `body` field.

## Save

`playmates: [{ skin, cosmetics: { cape, hat }, x, y }]`. Defaults to `[]`;
migration-safe. Outfits and skins are filtered to owned items on load (a sold-off
or unknown id falls back to a safe default).

## Pure helpers (config.js)

- `clamp01(v)` — clamp a fraction to [0,1] (drag position safety).

## Tests

- New save has `playmates: []`.
- `clamp01` clamps below 0 and above 1, passes through mid-range.
- Browser: add a friend, drag it (position persists + clamps in-bounds), dress it
  (skin/hat/cape change visibly and independently), remove it; menu/home fit.

## Out of scope (later)

Trail/pet on playmates, furniture/decoration, room backdrops, prestige.
