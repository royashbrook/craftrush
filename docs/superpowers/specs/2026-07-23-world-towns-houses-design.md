# World, Towns, Houses, Travelling People (slice of #35)

## Goal

Turn the single Playroom into a Toca-Boca style hierarchy: a world of biome
towns you unlock with emeralds, each holding houses you buy, each house a
playroom you decorate — and friends you can carry from house to house.

## Structure

```
Home  →  🗺️ WORLD (map of towns)  →  🏘️ TOWN (its houses)  →  🏠 HOUSE (playroom)
```

Back navigation reverses that chain. The HOUSE view is the existing playroom
(pan, ragdoll drag, dress, decor, trash bin) pointed at the current house's data.

## Data model

```js
save.world = {
  town: 'plains',      // where you are
  house: 0,            // index within that town
  carry: null,         // a person you're carrying, or {skin, cosmetics}
  towns: {
    plains: { unlocked: true, houses: [ { style, decor: [...], people: [...] } ] },
    desert: { unlocked: false, houses: [] },
    ...
  },
}
```

A house is `{ style, decor: [{item,x,y}], people: [{skin,cosmetics,x,y}] }` —
exactly today's flat playroom fields, scoped per house.

**Migration:** the existing flat `playmates` / `decor` / `roomTier` become
`world.towns.plains.houses[0]` so nothing a player already built is lost. The
old flat keys are then dropped.

## Towns

Eight biome towns, each with its own native interior materials and a
pre-decoration preset. Unlock cost is the emerald sink:

| id | name | cost | native style |
|----|------|------|--------------|
| plains | Plains Village | 0 | oak cabin |
| cherry | Cherry Grove | 800 | pink cherry wood |
| desert | Desert Town | 2000 | sandstone |
| snowy | Snowy City | 4000 | packed ice/blue |
| savanna | Savanna Camp | 7000 | acacia |
| mushroom | Mushroom Isle | 11000 | mushroom stem |
| end | End City | 16000 | purpur |
| nether | Nether Bastion | 22000 | blackstone/crimson |

Unlocking a town creates its first house, pre-decorated from the town preset.

## Houses

Each town starts with one house. More can be bought, up to 4 per town, at an
escalating price: `housePrice(owned) = round(400 * 1.8^owned)` (400, 720, 1296).
Every new house spawns pre-decorated from its town's preset so it is never empty.

## Styles

`ROOM_TIERS` (Cozy Cabin / Oak Hall / Stone Keep / Quartz Palace) remain
globally purchasable and applicable to any house. Each town also has a native
style available for free in that town. `styleById(id, town)` resolves either.

## Carrying people

`world.carry` holds at most one person. While dragging a friend, a 🧳 slot
appears next to the 🗑️ bin; dropping on it removes them from the house and puts
them in `carry`. In any house, a 🧳 button appears while carrying — tapping it
places that friend into the current house. Everyone else stays where they are.

## Pure helpers (config.js)

- `townById(id)`, `TOWNS`
- `housePrice(ownedCount)` — escalating cost of the next house
- `makeHouse(townId)` — a fresh pre-decorated house for a town
- `migrateWorld(save)` — build/repair `save.world`, folding legacy flat fields in
- `styleById(id, townId)` — resolve a house style to materials

## Tests

- Migration: legacy flat save lands in plains house 0 with its people/decor/style;
  a fresh save gets one pre-decorated plains house; an already-migrated save is
  left alone (idempotent).
- `housePrice` escalates; town costs ascend.
- `makeHouse` returns a pre-decorated house with no people.
- Unlock deducts emeralds, marks unlocked, creates the first house.
- Buying a house appends a pre-decorated house and deducts.
- Carry: pick up removes from house and fills carry; place appends to the current
  house and clears carry.
- Browser: navigate Home → World → Town → House, unlock a town, buy a house,
  carry a friend between two houses, verify no console errors and mobile fit.

## Out of scope

Town-specific outdoor scenes (the town screen is a house picker, not a walkable
street), villager NPCs living in houses, prestige.
