// @ts-check
// Craft Rush — tuning, biomes, skins, modes, persistence.
// Everything gameplay-mechanical references ROLES (enemy ids, sprite ids) from
// here, so a full reskin = new sprite packs + new tables. No engine changes.
import { Audio } from './audio.js';
import { hash2 } from './engine.js';
import { normalizeMasterySave } from './mastery.js';
import { saveSchemaError } from './pwa-safety.js';

// Build version shown in the UI. Tag the next feature milestone in git; Vite
// appends the number of commits since it as the patch.
// Unbuilt source: an honest placeholder, so a dev/local page never looks like a
// real release.
// Vite replaces __APP_VERSION__ at build time with major.minor from the last
// tag plus commits since, so the number in the corner counts without anyone
// editing it. In dev the fallback keeps it obvious the build is not a release.
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

// What the game looks like and what is in it comes from the theme; what any of
// it does stays here. These re-exports keep the shape every other module
// already imports, so a theme swap is a folder swap and nothing else.
import { THEME } from './theme.js';

// Fallbacks so a theme that failed to load cannot throw while this module is
// still evaluating. An empty game that says why beats a blank page that does not.
const T = (name, fallback) => (THEME[name] === undefined ? fallback : THEME[name]);
export { THEME_INFO, THEME_ART, THEME_ATLAS, THEME_ID, THEME_ERROR } from './theme.js';

export const TUNE = {
  // world/camera
  laneHalf: 3.1,        // how far the crowd center can steer (blocks)
  trackHalf: 6.6,       // visible path half-width. Comfortably wider than both the
                        // steer range and the gate pairs, so the run has room.
  shoulderHalf: 10,     // grass extends this far each side
  camBack: 7.4,         // camera distance behind crowd
  camHeight: 4.6,       // camera height (blocks)
  focal: 5.2,           // projection focal length
  viewDist: 46,         // ground draw distance (blocks)
  spawnAhead: 44,       // entities materialize this far ahead

  // run
  runSpeed: 10.5,       // blocks/sec at level 1
  speedRamp: 0.03,      // +3%/level, capped
  speedCap: 15,
  steerLerp: 10,        // playerX chase rate

  // crowd
  crowdStart: 4,
  crowdCap: 170,
  memberRadius: 0.34,
  formationC: 0.52,     // phyllotaxis spacing

  // combat (shooter mode)
  volleyInterval: 0.42, // sec between volleys
  maxShooters: 24,      // arrows per volley cap (damage scales up instead)
  arrowSpeed: 30,       // blocks/sec
  arrowRange: 34,
  gateHitsPerPlus: 5,   // arrows to raise an add-gate by +1

  // golem ability
  redstoneMax: 100,
  golemSpeed: 1.7,      // multiplier vs run speed
  golemRange: 34,

  // economy
  emeraldPickup: 1,
  chestEmeralds: 10,
  killDropChance: 0.12,
  winBonusBase: 12,
  winBonusPerLevel: 6,
  winBonusPowerK: 8,    // log-scaled power term (bounded — no more uncapped exploit)

  // powerups
  powerupDur: 9,

  // pickup magnet + victory vacuum
  magnetRange: 4.6,     // blocks — covers the full lane so nothing slips past
  magnetPull: 5,        // per-second lerp toward the crowd
  vacuumPull: 7,        // post-boss suck-in lerp

  // enemy/combat tuning
  aggroRange: 26,       // blocks at which enemies notice the crowd
  biteReachX: 0.9, biteReachZ: 1.1,   // contact-bite box
  arrowHitX: 0.55,      // arrow vs enemy/obstacle half-width
  gateHitMargin: 0.25,  // gate crossing overlap slack
  gateHalfW: 1.75,      // normal gates leave a real neutral lane at the center
  tutorialGateHalfW: 2.15,
  aimConeNear: 0.9, aimConePerZ: 0.045, aimConeMax: 2.2,

  // boss arena (blocks past the track end)
  bossSpawnZ: 17, bossHoldZ: 10,
  bossShooterHpPerParPower: 21,
  bossGatesHpPerParPower: 2.1,
  bossGatesHpPerLevel: 0.06,
  bossGatesHpBonusCap: 0.24,
  bossGatesBaseHpCap: 2.4,
  bossSurplusLogScale: 0.38,
  chargeSpendDivisor: 84, // gates-mode charge: worth spent per tick = worth/this
};

// Run pace, chosen by the player. Going faster is harder to read and react to, so it
// pays more; going slower is a gentler ride for a smaller cut.
export const SPEEDS = [
  { id: 'calm',   label: 'CALM',   speedMul: 0.8,  rewardMul: 0.8 },
  { id: 'normal', label: 'NORMAL', speedMul: 1.0,  rewardMul: 1.0 },
  { id: 'fast',   label: 'FAST',   speedMul: 1.28, rewardMul: 1.5 },
  { id: 'turbo',  label: 'TURBO',  speedMul: 1.6,  rewardMul: 2.0 },
];
export const speedById = (id) => SPEEDS.find((s) => s.id === id) || SPEEDS[1];

// Camera presets — live-switchable in the menu, persisted in the save.
export const CAMERAS = {
  // crowd should sit in the bottom third with lots of track receding ahead, so
  // you can see hazards coming. FAR (the default) is a steep behind-and-above
  // view; sprites are billboards so they still read face-on at any angle.
  // With the bottom buttons gone the whole lower screen is playfield, so the crowd
  // sits lower (~0.80 of the canvas) and the camera is closer: bigger sprites,
  // bigger gate signs, and MORE track between the crowd and the horizon.
  // Screen position depends on the camHeight/camBack ratio; sprite size on camBack.
  close:    { label: 'CLOSE',    camBack: 7.5, camHeight: 11.6, focal: 4.6, horizonFrac: 0.30 },
  far:      { label: 'FAR',      camBack: 9.5, camHeight: 19.0, focal: 3.9, horizonFrac: 0.28 },
  overhead: { label: 'OVERHEAD', camBack: 5.5, camHeight: 13.2, focal: 3.4, horizonFrac: 0.18 },
};

// Tiered crowd: worth grows without limit. Runners merge upward through the
// ladder; worth beyond the render caps is held in `reserve`, which scales the
// top tier bigger and hits harder ("bigger and bigger", no max).
export const TIERS = T('tiers', { units: [] });

export const MODES = {
  shooter: { id: 'shooter', label: 'BOW BLITZ', desc: 'Your crowd auto-fires arrows. Blast mobs, shoot gates to boost them!' },
  gates:   { id: 'gates',   label: 'GATE DASH', desc: 'No bows — pick the best gates, dodge mobs, grow a giant crowd!' },
};

// Enemy behavior table. speed = blocks/sec (before level scale). hp at level 1.
export const ENEMY_TYPES = T('enemies', {}).mobs || {};

export const BOSS_TYPES = T('enemies', {}).bosses || {};

// Pickup registry: sprite + behavior for every collectible. Adding a new
// minecrafty pickup (obsidian, blaze rods, wither skulls) is one entry here.
// grounded = sits on the ground (no float bob). shooterAuto:false = must be
// shot open, not collected by touch (chests). magnet = drawn toward the crowd.
export const PICKUPS = {
  emerald: {
    sprite: 'emerald', worldH: 0.72, magnet: true,
    onCollect(g, p) {
      g.runEmeralds += TUNE.emeraldPickup;
      Audio.sfx('emerald', 60);
      g.burst(p.x, 1, p.z, ['#2eff70', '#1fcf58'], 4, 3);
    },
  },
  apple: {
    sprite: 'golden_apple', worldH: 0.72,
    onCollect(g) { g.addRunners(3); Audio.sfx('apple'); },
  },
  tnt: {
    sprite: 'tnt_block', worldH: 0.72,
    onCollect(g) {
      g.flashFx = 0.8; g.freeze = 0.09; Audio.sfx('bigboom'); g.cam.shake = 1;
      for (const e of g.enemies) if (!e.dead && e.z > g.playerZ - 2 && e.z < g.playerZ + 30) g.damageEnemy(e, 999, true);
      for (const o of g.obstacles) if (o.z < g.playerZ + 30) { o.hp = 0; g.breakObstacle(o); }
      g.floaty('BOOM!', g.playerX, g.playerZ + 5, '#ff9d3c', 2.2);
    },
  },
  chest: {
    sprite: 'chest', worldH: 1.0, grounded: true, shooterAuto: false,
    onCollect(g, p) { g.openChest(p); },
  },
};

// Campaign resource: blaze rods drop from blazes in the Nether Fortress and
// bank into the save inventory (the first step toward the structure campaign).
PICKUPS.blaze_rod = {
  sprite: 'blaze_rod', worldH: 0.7, magnet: true,
  onCollect(g, p) {
    g.runRods = (g.runRods || 0) + 1;
    Audio.sfx('emerald', 60);
    g.floaty('+1 ROD', p.x, p.z, '#ffd94d', 1.2);
    g.burst(p.x, 1, p.z, ['#f5c542', '#ff8c1a'], 5, 3);
  },
};

const POWERUP_NAMES = { triple: 'TRIPLE SHOT!', rapid: 'RAPID FIRE!', power: 'POWER SHOT!', sword: 'SWORD TIME!', axe: 'AXE TIME!' };
for (const k of Object.keys(POWERUP_NAMES)) {
  PICKUPS['powerup_' + k] = {
    sprite: 'powerup_' + k, worldH: 0.72,
    onCollect(g, p) {
      g.power[k] = TUNE.powerupDur;
      Audio.sfx('powerup');
      g.floaty(POWERUP_NAMES[k], p.x, p.z, '#ffd94d', 1.4);
    },
  };
}

export const BIOMES = T('biomes', []);

// Skins are palette swaps over core.runner_back + a head sprite for the shop.
export const SKINS = T('skins', []);

// Cosmetics — all purchasable with emeralds. Capes/hats render on every runner
// (camera sits behind the crowd, so capes are always on screen).
export const COSMETICS = T('cosmetics', { cape: [], hat: [], trail: [], pet: [] });

// Home hub: buy villager friends who populate the home and earn emeralds while
// you're away. Each additional villager of a type costs base * costRate^owned
// (the classic idle curve). Art reuses existing character skins — no new sprites.
export const HOME = { costRate: 1.15, idleCapMs: 8 * 3600 * 1000, townCap: 8 };
export const VILLAGERS = T('village', {}).villagers || [];

// cost of the NEXT villager of `id` given how many are already owned
export function villagerCost(id, owned) {
  const v = VILLAGERS.find(x => x.id === id);
  return v ? Math.round(v.base * Math.pow(HOME.costRate, owned)) : Infinity;
}

// total idle income in emeralds per hour
export function homeIncomeRate(villagers) {
  let r = 0;
  for (const v of VILLAGERS) r += (villagers && villagers[v.id] || 0) * v.income;
  return r;
}

// how many villagers live in a town, and whether there is room for one more
export function townPop(rec) {
  let n = 0;
  for (const v of VILLAGERS) n += (rec && rec.villagers && rec.villagers[v.id]) || 0;
  return n;
}
export const townHasRoom = (rec) => townPop(rec) < HOME.townCap;

// every unlocked town earns on its own; the world rate is the sum
export function worldIncomeRate(world) {
  if (!world || !world.towns) return 0;
  let r = 0;
  for (const t of TOWNS) {
    const rec = world.towns[t.id];
    if (rec && rec.unlocked) r += homeIncomeRate(rec.villagers);
  }
  return r;
}

// idle earnings across the whole world, clamped to the same cap
export function pendingIdleWorld(world, lastCollect, now) {
  const elapsed = Math.max(0, Math.min(now - (lastCollect || now), HOME.idleCapMs));
  return Math.floor(worldIncomeRate(world) * elapsed / 3600000);
}

// emeralds accrued since lastCollect, clamped to the idle cap. A falsy
// lastCollect (fresh save) banks nothing until the home is first opened.
export function pendingIdle(villagers, lastCollect, now) {
  const elapsed = Math.max(0, Math.min(now - (lastCollect || now), HOME.idleCapMs));
  return Math.floor(homeIncomeRate(villagers) * elapsed / 3600000);
}

// Playroom decorations: buyable placeable furniture (an emerald sink) and room
// backdrops. Each buy drops one draggable instance into the playroom.
export const DECOR = T('village', {}).decor || [];
export const decorById = (id) => DECOR.find(d => d.id === id);
// Room styles are real house interiors: a patterned wall, a floor with depth, and
// baseboard trim, drawn to a pixel canvas. The first is free; the rest you keep.
export const ROOM_TIERS = T('village', {}).roomTiers || [];
export const roomTierById = (id) => ROOM_TIERS.find(r => r.id === id) || ROOM_TIERS[0];

// ---------------------------------------------------------------------------
// World: biome towns you unlock, each holding houses you buy and decorate.
// Every town has a native interior style (free in that town) and a preset of
// starting furniture, so an unlocked house is never an empty box.
// ---------------------------------------------------------------------------
const PRESET_COZY = [
  { item: 'bed', x: 0.10, y: 0.80 }, { item: 'room_rug', x: 0.34, y: 0.95 },
  { item: 'room_lamp', x: 0.56, y: 0.86 }, { item: 'crafting_table', x: 0.74, y: 0.95 },
  { item: 'potted_plant', x: 0.90, y: 0.92 },
];
const PRESET_HALL = [
  { item: 'room_shelf', x: 0.16, y: 0.70 }, { item: 'chest', x: 0.30, y: 0.93 },
  { item: 'room_rug', x: 0.50, y: 0.96 }, { item: 'painting', x: 0.66, y: 0.66 },
  { item: 'bed', x: 0.86, y: 0.82 },
];
const PRESET_PARTY = [
  { item: 'cake', x: 0.22, y: 0.92 }, { item: 'torch', x: 0.40, y: 0.72 },
  { item: 'room_rug', x: 0.56, y: 0.96 }, { item: 'room_lamp', x: 0.78, y: 0.88 },
  { item: 'potted_plant', x: 0.92, y: 0.94 },
];

export const TOWNS = T('village', {}).towns || [];
export const townById = (id) => TOWNS.find(t => t.id === id) || TOWNS[0];

export const MAX_HOUSES = 4;
// cost of the NEXT house in a town given how many it already has
export const housePrice = (owned) => Math.round(400 * Math.pow(1.8, owned));

// a fresh house for a town: town's native style, pre-decorated, nobody home yet
export function makeHouse(townId) {
  const t = townById(townId);
  return { style: t.style.id, decor: t.preset.map(d => ({ ...d })), people: [] };
}

// resolve a house style id to materials: a bought ROOM_TIER, else the town's native
export function styleById(id, townId) {
  const t = townById(townId);
  if (id === t.style.id) return t.style;
  return ROOM_TIERS.find(r => r.id === id) || t.style;
}

// Build or repair save.world, folding a legacy flat playroom into plains house 0.
// Idempotent: safe to call on every load.
export function migrateWorld(save) {
  const w = save.world && typeof save.world === 'object' ? save.world : (save.world = {});
  if (!w.towns || typeof w.towns !== 'object') w.towns = {};
  const normalizeHouse = (storedHouse, town) => {
    const house = storedHouse && typeof storedHouse === 'object' && !Array.isArray(storedHouse)
      ? storedHouse
      : makeHouse(town.id);
    if (typeof house.style !== 'string') house.style = town.style.id;
    if (!Array.isArray(house.decor)) house.decor = [];
    house.decor = house.decor.filter((d) =>
      d && typeof d === 'object' && typeof d.item === 'string');
    if (!Array.isArray(house.people)) house.people = [];
    house.people = house.people.filter((p) =>
      p && typeof p === 'object' && typeof p.skin === 'string');
    for (const person of house.people) {
      if (!person.cosmetics || typeof person.cosmetics !== 'object' || Array.isArray(person.cosmetics)) {
        person.cosmetics = { cape: 'none', hat: 'none' };
      }
    }
    return house;
  };
  for (const t of TOWNS) {
    const stored = w.towns[t.id];
    const rec = stored && typeof stored === 'object' && !Array.isArray(stored)
      ? stored
      : (w.towns[t.id] = { unlocked: t.cost === 0, houses: [] });
    if (!Array.isArray(rec.houses)) rec.houses = [];
    if (!rec.villagers || typeof rec.villagers !== 'object') rec.villagers = {};
    for (const v of VILLAGERS) if (typeof rec.villagers[v.id] !== 'number') rec.villagers[v.id] = 0;
    if (rec.unlocked && !rec.houses.length) rec.houses.push(makeHouse(t.id));
    for (let i = 0; i < rec.houses.length; i++) {
      rec.houses[i] = normalizeHouse(rec.houses[i], t);
    }
  }
  // legacy flat playroom -> plains house 0 (only once; the flat keys are dropped)
  const legacy = Array.isArray(save.playmates) || Array.isArray(save.decor);
  if (legacy) {
    const h = w.towns.plains.houses[0] || (w.towns.plains.houses[0] = makeHouse('plains'));
    if (Array.isArray(save.playmates) && save.playmates.length) h.people = save.playmates;
    if (Array.isArray(save.decor) && save.decor.length) h.decor = save.decor;
    if (save.roomTier) h.style = save.roomTier;
    w.towns.plains.houses[0] = normalizeHouse(h, townById('plains'));
    delete save.playmates; delete save.decor; delete save.roomTier;
  }
  // the old single global village becomes the starter town's crew
  if (save.home && save.home.villagers && !w._villagersMoved) {
    const plains = w.towns.plains;
    for (const v of VILLAGERS) plains.villagers[v.id] += save.home.villagers[v.id] || 0;
    w._villagersMoved = true;
    delete save.home.villagers;
  }
  // An unknown record can exist in a save from a removed theme or malformed
  // import. Only known towns were normalized above, so never point a screen at
  // an arbitrary record merely because it happens to exist.
  if (!TOWNS.some((town) => town.id === w.town)) w.town = 'plains';
  const houses = w.towns[w.town].houses;
  if (typeof w.house !== 'number' || w.house < 0 || w.house >= houses.length) w.house = 0;
  if (w.carry === undefined) w.carry = null;
  else if (w.carry !== null
      && (!w.carry || typeof w.carry !== 'object' || Array.isArray(w.carry)
        || typeof w.carry.skin !== 'string')) w.carry = null;
  else if (w.carry && (!w.carry.cosmetics || typeof w.carry.cosmetics !== 'object'
      || Array.isArray(w.carry.cosmetics))) {
    w.carry.cosmetics = { cape: 'none', hat: 'none' };
  }
  return w;
}

// Mining minigame: tap a dig face to break blocks for emeralds, dig endlessly
// downward, upgrade the pickaxe. Energy-gated (refills over real time) so it
// can't out-earn the runner and gives a recharge return-hook.
export const MINE = { energyCap: 60, energyRefillMs: 20000, cols: 11, rows: 15 };

// The underground is a real tile world: every block has a hardness, a tool tier that
// can break it, and a worth. Ores come in veins rather than lone tiles, and the deeper
// you go the better it gets. Generation is a pure function of (x, y) so the same shaft
// always looks the same, no world to store.
export const TILES = T('mine', {}).tiles || {};
export const tileById = (id) => TILES[id] || TILES.stone;

// which ores can appear at a depth, and how likely, deepest first
/**
 * What can appear at what depth, and how often. Typed so the pairs stay pairs:
 * without it the tuples widen to (string|number)[] and the chance arithmetic
 * below silently accepts a name where a probability belongs.
 * @type {{at: number, ores: [string, number][]}[]}
 */
const ORE_BANDS = [
  { at: 110, ores: [['emeraldore', 0.030], ['diamond', 0.055], ['gold', 0.055], ['redstone', 0.075], ['lapis', 0.05]] },
  { at: 70,  ores: [['diamond', 0.030], ['gold', 0.055], ['redstone', 0.075], ['lapis', 0.05], ['iron', 0.07]] },
  { at: 40,  ores: [['gold', 0.035], ['redstone', 0.05], ['lapis', 0.045], ['iron', 0.08], ['coal', 0.09]] },
  { at: 18,  ores: [['iron', 0.07], ['copper', 0.07], ['coal', 0.10]] },
  { at: 0,   ores: [['coal', 0.09], ['copper', 0.05]] },
];

// The tile at a column/depth. Veins come from sampling the hash on a coarser grid, so
// ore arrives in clumps you can chase instead of single lucky squares.
export function mineTileAt(x, y) {
  if (y < 0) return TILES.air;
  if (y < 2) return TILES.dirt;

  // caves: open pockets that make the shaft interesting to navigate
  const cave = hash2(Math.floor(x / 3) + 41, Math.floor(y / 3) + 17);
  if (y > 6 && cave > 0.93) return TILES.air;

  if (y > 90 && hash2(x + 7, y + 3) > 0.985) return TILES.lava;
  if (hash2(x + 13, y + 29) > 0.975) return TILES.gravel;

  const band = ORE_BANDS.find((b) => y >= b.at) || ORE_BANDS[ORE_BANDS.length - 1];
  const vein = hash2(Math.floor(x / 2) + 101, Math.floor(y / 2) + 211);
  let acc = 0;
  for (const [ore, chance] of band.ores) {
    acc += chance;
    if (vein < acc) return TILES[ore];
  }
  if (y > 60 && hash2(x + 3, y + 61) > 0.55) return TILES.deepslate;
  if (y > 100 && hash2(x + 5, y + 71) > 0.9) return TILES.obsidian;
  return TILES.stone;
}
export const PICKAXES = T('mine', {}).pickaxes || [];
export const pickaxeTier = (id) => (PICKAXES.find((p) => p.id === id) || PICKAXES[0]).tier;
export const canBreak = (pickId, tile) => !tile.hazard && tile.solid !== false && pickaxeTier(pickId) >= (tile.tier || 0);
// strata by depth — deeper is rarer/prettier
const MINE_STRATA = [
  { at: 200, kind: 'emerald' }, { at: 100, kind: 'diamond' }, { at: 50, kind: 'gold' },
  { at: 25, kind: 'iron' }, { at: 10, kind: 'coal' }, { at: 0, kind: 'stone' },
];
export const blockHp = (depth) => 1 + Math.floor(depth / 6);
export const blockPay = (depth) => 1 + Math.floor(depth / 8);
export const blockKind = (depth) => (MINE_STRATA.find(s => depth >= s.at) || MINE_STRATA[MINE_STRATA.length - 1]).kind;
export const pickaxeDmg = (id) => (PICKAXES.find(p => p.id === id) || PICKAXES[0]).dmg;
export const pickaxeCost = (id) => { const p = PICKAXES.find(x => x.id === id); return p ? p.cost : Infinity; };
export function nextPickaxe(id) {
  const i = PICKAXES.findIndex(p => p.id === id);
  return (i >= 0 && i < PICKAXES.length - 1) ? PICKAXES[i + 1] : null;
}
// current energy given the stored value + real time since energyTs, capped
export function mineEnergy(mine, now) {
  const gained = Math.floor((now - (mine.energyTs || now)) / MINE.energyRefillMs);
  return Math.max(0, Math.min(MINE.energyCap, (mine.energy ?? MINE.energyCap) + gained));
}

// ---------------------------------------------------------------------------
// The campaign: a fixed chain of chapters you unlock in order, each gated by
// something you have to go and earn first. Resources bank between runs, so a
// chapter is a goal you work toward rather than a level that just arrives.
// ---------------------------------------------------------------------------
export const RESOURCES = T('campaign', {}).resources || {};

export const CAMPAIGN = T('campaign', {}).chapters || [];
// Some cosmetics are campaign loot: the shop shows them, but emeralds cannot
// buy them - you have to have brought the thing home.
export function questCosmeticEarned(save, def) {
  if (!def || !def.quest) return true;
  return ((save && save.inventory && save.inventory[def.quest]) || 0) > 0;
}

export const chapterById = (id) => CAMPAIGN.find((c) => c.id === id);
export const chapterIndex = (id) => CAMPAIGN.findIndex((c) => c.id === id);

// what the save owes a chapter before it will open
export function chapterMissing(save, id) {
  const c = chapterById(id);
  if (!c || !c.requires) return null;
  const inv = (save && save.inventory) || {};
  const missing = {};
  let any = false;
  for (const [k, n] of Object.entries(c.requires)) {
    const have = inv[k] || 0;
    if (have < n) { missing[k] = n - have; any = true; }
  }
  return any ? missing : null;
}

// a chapter opens once the one before it is done and its cost is covered
export function chapterUnlocked(save, id) {
  const i = chapterIndex(id);
  if (i < 0) return false;
  const done = (save && save.campaign && save.campaign.done) || [];
  if (i > 0 && !done.includes(CAMPAIGN[i - 1].id)) return false;
  return !chapterMissing(save, id);
}

// The chapter you are working on. If the next milestone is short of materials, you
// are sent back to the gathering chapter that supplies them, so a gate reads as
// "go get more" rather than a dead end with nothing to play.
export function currentChapter(save) {
  const done = (save && save.campaign && save.campaign.done) || [];
  const next = CAMPAIGN.find((c) => !done.includes(c.id));
  if (!next) return null;
  const missing = chapterMissing(save, next.id);
  if (!missing) return next;
  const needed = Object.keys(missing);
  const source = CAMPAIGN.find((c) => c.repeatable && done.includes(c.id)
    && Object.keys(c.grants || {}).some((k) => needed.includes(k)));
  return source || next;
}

// finishing a chapter spends what it costs and pays what it promises
export function completeChapter(save, id) {
  const c = chapterById(id);
  if (!c) return null;
  save.campaign = save.campaign || { done: [] };
  if (!Array.isArray(save.campaign.done)) save.campaign.done = [];
  save.inventory = save.inventory || {};
  for (const [k, n] of Object.entries(c.consumes || {})) {
    save.inventory[k] = Math.max(0, (save.inventory[k] || 0) - n);
  }
  for (const [k, n] of Object.entries(c.grants || {})) {
    save.inventory[k] = (save.inventory[k] || 0) + n;
  }
  if (!save.campaign.done.includes(id)) save.campaign.done.push(id);
  return save.campaign;
}

// Daily Expeditions: one date-seeded themed run per day, identical for everyone
// with no server. `mut` holds the run modifiers the engine reads.
export const EXPEDITIONS = T('expeditions', []);

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Expeditions rotate WEEKLY: the same theme runs all week and changes each
// week, so ~9 themes covers about two months. The play streak stays daily.
export function weekKey(d = new Date()) {
  const days = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return Math.floor((days + 3) / 7); // +3 aligns the boundary to Mondays
}

// The expedition offered today (same all week; `key` stays the day for streaks).
export function dailyExpedition(key = dayKey(), week = weekKey()) {
  const h = hashStr(`week-${week}`);
  const exp = EXPEDITIONS[h % EXPEDITIONS.length];
  const level = 1 + (Math.floor(h / 7) % BIOMES.length); // varies scenery when biome not forced
  return { ...exp, level, key, week };
}

function prevKey(key) {
  const [Y, M, D] = key.split('-').map(Number);
  const d = new Date(Y, M - 1, D);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function expeditionStatus(save, key = dayKey()) {
  const e = save.expedition || { lastDay: null, streak: 0 };
  return { streak: e.streak || 0, doneToday: e.lastDay === key };
}

// Record a completed expedition; extends or resets the streak. first=false if
// today's expedition was already completed (no repeat reward).
export function recordExpedition(save, key = dayKey()) {
  const e = save.expedition || (save.expedition = { lastDay: null, streak: 0 });
  if (e.lastDay === key) return { streak: e.streak, first: false };
  e.streak = (e.lastDay === prevKey(key)) ? (e.streak || 0) + 1 : 1;
  e.lastDay = key;
  return { streak: e.streak, first: true };
}

const SAVE_KEY = 'craftrush_save_v1';
const PRE_RESTORE_KEY = 'craftrush_pre_restore_v1';

function normalizeUnlockedSkins(save) {
  const unlocked = Array.isArray(save.unlocked)
    ? save.unlocked.filter((id) => typeof id === 'string')
    : [];
  const known = new Set(SKINS.map((skin) => skin.id));
  if (!unlocked.some((id) => known.has(id))) unlocked.unshift(SKINS[0]?.id || 'steve');
  save.unlocked = [...new Set(unlocked)];
}

export function loadSave() {
  const def = { emeralds: 0, level: 1, bestLevel: 1, mode: 'shooter', skin: 'steve',
    unlocked: ['steve'], sound: true, bestCrowd: 0, tutorialSeen: false,
    camera: 'far', speed: 'normal',
    cosmetics: { cape: 'none', hat: 'none', trail: 'none', pet: 'none' },
    cosmeticsOwned: ['none'],
    stats: { runs: 0, wins: 0, kills: 0, golems: 0, gigas: 0, totalEmeralds: 0, bossWins: {}, expeditions: 0 },
    achievements: [],
    expedition: { lastDay: null, streak: 0 },
    inventory: { blazeRods: 0, obsidian: 0, enderEyes: 0, elytra: 0, trims: 0, witherSkulls: 0 },
    campaign: { done: [] },
    home: { villagers: { farmer: 0, miner: 0, fisher: 0, trader: 0, librarian: 0 }, lastCollect: 0 },
    mine: { depth: 0, energy: 60, energyTs: 0, pickaxe: 'wood' },
    roomTiersOwned: ['cabin'],
    music: true, sfx: true,   // music and effects toggle independently
    decorOwned: {},   // furniture bought but not currently placed (the bin refills this)
    // world/towns/houses live here; migrateWorld() builds and repairs it on load
    world: null,
    // A short idempotency window for engine results. Additive only: old saves
    // receive the default and keep every existing field.
    settledRunIds: [],
    mastery: { chapters: {} } };
  let save = def;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = { ...def, ...JSON.parse(raw) };
  } catch { save = def; }
  normalizeUnlockedSkins(save);
  normalizeMasterySave(save);
  migrateWorld(save); // build/repair the world, folding in any legacy flat playroom
  return save;
}

// Win bonus: flat base + per-level, plus a LOG-scaled term on best power so a
// giant run pays a little more, never thousands. Bounded by design.
export function winBonus(level, bestPower) {
  return TUNE.winBonusBase + level * TUNE.winBonusPerLevel
    + Math.round(Math.log10(Math.max(1, bestPower)) * TUNE.winBonusPowerK);
}

// clamp a normalized fraction (used for draggable playmate positions)
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function persistSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

// ---- backup codes (Cookie-Clicker style) + reset ----
// A save code is base64(JSON) with a short "CR1|" prefix so it's recognizable.
export function exportSave(save) {
  try { return 'CR1|' + btoa(unescape(encodeURIComponent(JSON.stringify(save)))); } catch { return ''; }
}

export function importSave(code) {
  try {
    const raw = String(code).trim().replace(/^CR1\|/, '');
    const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if (saveSchemaError(obj)) return null;
    const merged = { ...loadSave(), ...obj }; // fill any missing fields with defaults
    normalizeUnlockedSkins(merged);
    normalizeMasterySave(merged);
    migrateWorld(merged);
    const incoming = JSON.stringify(merged);
    const current = localStorage.getItem(SAVE_KEY);
    if (current !== null) {
      localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify({ ts: Date.now(), raw: current }));
      const rollbackRaw = localStorage.getItem(PRE_RESTORE_KEY);
      if (!rollbackRaw) return null;
      const rollback = JSON.parse(rollbackRaw);
      if (rollback?.raw !== current) return null;
    }
    try {
      localStorage.setItem(SAVE_KEY, incoming);
      if (localStorage.getItem(SAVE_KEY) !== incoming) throw new Error('save write could not be verified');
    } catch {
      // If a browser reports a failed or partial replacement, put the exact
      // prior bytes back before reporting failure.
      if (current !== null) {
        try { localStorage.setItem(SAVE_KEY, current); } catch { /* rollback slot still holds it */ }
      }
      return null;
    }
    return merged;
  } catch { return null; }
}

// ---- automatic daily backups ----
// One snapshot per calendar day, taken when a level is cleared and overwritten by
// later clears the same day, so the list stays short and each entry is that day's
// best progress. Kept OUT of the save itself so a reset can't destroy them.
const BACKUP_KEY = 'craftrush_backups_v1';
export const MAX_BACKUPS = 7;
export const dayStamp = (now) => new Date(now).toISOString().slice(0, 10);

export function listBackups() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice().sort((a, b) => (a.day < b.day ? 1 : -1)) : [];
  } catch { return []; }
}

// snapshot today's save; replaces today's existing entry, prunes the oldest
export function writeBackup(save, now = Date.now()) {
  const day = dayStamp(now);
  const entry = { day, ts: now, level: save.level, emeralds: save.emeralds, code: exportSave(save) };
  const kept = listBackups().filter(b => b.day !== day);
  kept.unshift(entry);
  const out = kept.slice(0, MAX_BACKUPS);
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(out)); } catch { /* private mode */ }
  return out;
}

export function restoreBackup(day) {
  const b = listBackups().find(x => x.day === day);
  return b ? importSave(b.code) : null;
}

export function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
