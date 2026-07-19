// Craft Rush — tuning, biomes, skins, modes, persistence.
// Everything gameplay-mechanical references ROLES (enemy ids, sprite ids) from
// here, so a full reskin = new sprite packs + new tables. No engine changes.

export const TUNE = {
  // world/camera
  laneHalf: 3.1,        // how far the crowd center can steer (blocks)
  trackHalf: 4.2,       // visible path half-width
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
  redstonePerHit: 1.6,
  redstonePerKill: 6,
  redstonePerEmeraldGatesMode: 7,
  golemSpeed: 1.7,      // multiplier vs run speed
  golemRange: 34,

  // economy
  emeraldPickup: 1,
  chestEmeralds: 10,
  killDropChance: 0.12,
  winBonusBase: 12,
  winBonusPerLevel: 6,

  // powerups
  powerupDur: 9,
};

// Camera presets — live-switchable in the menu, persisted in the save.
export const CAMERAS = {
  close:    { label: 'CLOSE',    camBack: 7.4,  camHeight: 4.6,  focal: 5.2, horizonFrac: 0.36 },
  far:      { label: 'FAR',      camBack: 10.5, camHeight: 6.4,  focal: 4.6, horizonFrac: 0.33 },
  overhead: { label: 'OVERHEAD', camBack: 6.5,  camHeight: 11.5, focal: 3.4, horizonFrac: 0.18 },
};

// Giga-Steve: crowd gains past the cap merge into giants (Bow Blitz only).
export const GIGA = {
  perGiga: 10,       // overflow runners per giga
  maxGigas: 12,
  hp: 10,
  dmgMul: 10,        // one fat arrow worth this many normal arrows
  scale: 2.3,        // sprite worldH multiplier
};

export const MODES = {
  shooter: { id: 'shooter', label: 'BOW BLITZ', desc: 'Your crowd auto-fires arrows. Blast mobs, shoot gates to boost them!' },
  gates:   { id: 'gates',   label: 'GATE DASH', desc: 'No bows — pick the best gates, dodge mobs, grow a giant crowd!' },
};

// Enemy behavior table. speed = blocks/sec (before level scale). hp at level 1.
export const ENEMY_TYPES = {
  creeper:           { hp: 7,  speed: 2.6, kind: 'exploder', boomRadius: 2.0, boomKills: 10, fuse: 0.75, worldH: 1.9 },
  zombie:            { hp: 10, speed: 2.2, kind: 'chaser',  bitePeriod: 0.7, worldH: 1.9 },
  husk:              { hp: 12, speed: 2.0, kind: 'chaser',  bitePeriod: 0.7, worldH: 1.9 },
  zombified_piglin:  { hp: 9,  speed: 3.4, kind: 'chaser',  bitePeriod: 0.6, worldH: 1.9 },
  skeleton:          { hp: 8,  speed: 2.4, kind: 'archer',  range: 15, shotPeriod: 1.7, worldH: 1.9 },
  stray:             { hp: 9,  speed: 2.4, kind: 'archer',  range: 16, shotPeriod: 1.5, worldH: 1.9 },
  blaze:             { hp: 11, speed: 1.8, kind: 'archer',  range: 16, shotPeriod: 2.1, spread: 3, projectile: 'fireball', floats: true, worldH: 1.9 },
  witch:             { hp: 13, speed: 1.6, kind: 'lobber',  range: 13, shotPeriod: 2.4, aoeRadius: 1.5, aoeKills: 2, worldH: 2.1 },
  spider:            { hp: 6,  speed: 4.2, kind: 'chaser',  bitePeriod: 0.9, zigzag: true, worldH: 1.0 },
  slime:             { hp: 8,  speed: 2.4, kind: 'chaser',  bitePeriod: 0.8, hops: true, splitsTo: 'slime_mini', worldH: 1.4 },
  slime_mini:        { hp: 3,  speed: 3.0, kind: 'chaser',  bitePeriod: 0.8, hops: true, worldH: 0.8, sprite: 'slime' },
  magma_cube:        { hp: 10, speed: 2.4, kind: 'chaser',  bitePeriod: 0.7, hops: true, splitsTo: 'magma_mini', worldH: 1.4 },
  magma_mini:        { hp: 4,  speed: 3.0, kind: 'chaser',  bitePeriod: 0.7, hops: true, worldH: 0.8, sprite: 'magma_cube' },
  phantom:           { hp: 7,  speed: 5.0, kind: 'swooper', worldH: 1.0, floats: true },
  enderman:          { hp: 14, speed: 3.0, kind: 'chaser',  bitePeriod: 0.5, teleports: true, worldH: 2.6 },
};

export const BOSS_TYPES = {
  boss_slime:   { name: 'KING SLIME',    hp: 90,  worldH: 4.3, attacks: ['minions', 'shockwave'] },
  boss_ravager: { name: 'RAVAGER',       hp: 130, worldH: 4.5, attacks: ['charge', 'minions', 'shockwave'] },
  boss_wither:  { name: 'THE WITHER',    hp: 170, worldH: 4.8, attacks: ['skulls', 'minions', 'shockwave'] },
  boss_dragon:  { name: 'ENDER DRAGON',  hp: 220, worldH: 5.4, attacks: ['skulls', 'charge', 'minions'] },
};

export const BIOMES = [
  {
    id: 'plains', name: 'Sunny Plains',
    sky: ['#6db8ff', '#c9e8ff'], sun: '#fff3b0', clouds: true,
    hillFar: '#8fce7a', hillNear: '#6cb457', fog: '#bfe3ff',
    ground: { a: '#71b93f', b: '#65aa36', c: '#5c9e31', pathA: '#b0885a', pathB: '#a37b4e', edge: '#4c8428' },
    scenery: ['oak_tree', 'oak_tree', 'flowers', 'fence', 'hay_bale', 'pumpkin', 'village_house'],
    enemies: ['zombie', 'slime', 'creeper', 'spider'],
    obstacle: 'fence', boss: 'boss_slime',
  },
  {
    id: 'forest', name: 'Dark Forest',
    sky: ['#4f8fd0', '#a8d4e8'], sun: '#ffefa0', clouds: true,
    hillFar: '#4f8a48', hillNear: '#3a6f35', fog: '#a3c9b8',
    ground: { a: '#4f9436', b: '#46882e', c: '#3d7c2a', pathA: '#8a6844', pathB: '#7d5c3a', edge: '#33641f' },
    scenery: ['oak_tree', 'birch_tree', 'spruce_tree', 'red_mushroom', 'flowers'],
    enemies: ['zombie', 'skeleton', 'creeper', 'spider', 'witch'],
    obstacle: 'fence', boss: 'boss_ravager',
  },
  {
    id: 'desert', name: 'Blazing Desert',
    sky: ['#78c0e8', '#f2e3b8'], sun: '#fff8c8', clouds: false,
    hillFar: '#e0cf9a', hillNear: '#cdbb82', fog: '#f0e2ba',
    ground: { a: '#e3d49f', b: '#d9c992', c: '#cfbe85', pathA: '#c4a35f', pathB: '#b69451', edge: '#b3a26e' },
    scenery: ['cactus', 'cactus', 'dead_bush', 'dead_bush'],
    enemies: ['husk', 'creeper', 'spider', 'skeleton'],
    obstacle: 'cactus', boss: 'boss_ravager',
  },
  {
    id: 'snow', name: 'Frozen Peaks',
    sky: ['#8fb8e0', '#e8f2fa'], sun: '#ffffff', clouds: true,
    hillFar: '#cfdfea', hillNear: '#b0c8da', fog: '#e4eef6',
    ground: { a: '#e9f2f6', b: '#dce9f0', c: '#cfe0ea', pathA: '#9fb6c4', pathB: '#8ea6b5', edge: '#b8ccd8' },
    scenery: ['snowy_spruce', 'snowy_spruce', 'spruce_tree', 'fence'],
    enemies: ['stray', 'skeleton', 'creeper', 'spider'],
    obstacle: 'fence', boss: 'boss_ravager',
  },
  {
    id: 'swamp', name: 'Murky Swamp',
    sky: ['#5a7d6a', '#a8b890'], sun: '#e8e0a0', clouds: true,
    hillFar: '#5d7a4a', hillNear: '#48613a', fog: '#8fa080',
    ground: { a: '#5d7a35', b: '#54702e', c: '#4a6528', pathA: '#6b5d40', pathB: '#5f5238', edge: '#3f5522' },
    scenery: ['oak_tree', 'red_mushroom', 'dead_bush', 'flowers'],
    enemies: ['witch', 'zombie', 'slime', 'spider'],
    obstacle: 'fence', boss: 'boss_slime',
  },
  {
    id: 'nether', name: 'The Nether',
    sky: ['#1e0a0e', '#54181c'], sun: null, clouds: false, embers: true,
    hillFar: '#4a1a1e', hillNear: '#381216', fog: '#54181c',
    ground: { a: '#7a3030', b: '#6d2828', c: '#5f2222', pathA: '#4a3038', pathB: '#3e2830', edge: '#4f1c1c' },
    scenery: ['crimson_fungus', 'warped_fungus', 'basalt_pillar'],
    enemies: ['blaze', 'zombified_piglin', 'magma_cube', 'skeleton'],
    obstacle: 'basalt_pillar', boss: 'boss_wither',
  },
  {
    id: 'end', name: 'The End',
    sky: ['#0d0716', '#241238'], sun: null, clouds: false, stars: true,
    hillFar: '#2a1a3e', hillNear: '#1c1030', fog: '#241238',
    ground: { a: '#dbe0a8', b: '#cfd49a', c: '#c2c78d', pathA: '#a8ad7a', pathB: '#999e6c', edge: '#b0b583' },
    scenery: ['end_pillar', 'end_pillar'],
    enemies: ['enderman', 'phantom', 'creeper'],
    obstacle: 'end_pillar', boss: 'boss_dragon',
  },
];

// Skins are palette swaps over core.runner_back + a head sprite for the shop.
export const SKINS = [
  { id: 'steve',    name: 'Steve',    cost: 0,   head: 'head_steve',
    palette: { h: '#4a2f1b', s: '#d8a077', t: '#00afaf', T: '#008f8f', l: '#3d55b8', L: '#2e4090', b: '#6e6e6e' } },
  { id: 'alex',     name: 'Alex',     cost: 25,  head: 'head_alex',
    palette: { h: '#e5843c', s: '#eab88f', t: '#7ea33c', T: '#63822c', l: '#6b4f35', L: '#573f2a', b: '#4a4a4a' } },
  { id: 'zombie',   name: 'Zombie',   cost: 60,  head: 'head_zombie',
    palette: { h: '#2e7d32', s: '#4fa554', t: '#1e8b8b', T: '#177070', l: '#5e3f8f', L: '#4a3172', b: '#333333' } },
  { id: 'skeleton', name: 'Skeleton', cost: 140, head: 'head_skeleton',
    palette: { h: '#d6d6d6', s: '#e8e8e8', t: '#9e9e9e', T: '#7d7d7d', l: '#cfcfcf', L: '#ababab', b: '#8a8a8a' } },
  { id: 'creeper',  name: 'Creeper Kid', cost: 250, head: 'head_creeper',
    palette: { h: '#4fbf3c', s: '#66d94f', t: '#3da52e', T: '#2b7d20', l: '#2b7d20', L: '#1e4f16', b: '#173d10' } },
  { id: 'piglin',   name: 'Piglin',   cost: 400, head: 'head_piglin',
    palette: { h: '#f3c53f', s: '#efa08f', t: '#8a6d3b', T: '#6f562d', l: '#4d3a22', L: '#3d2d1a', b: '#3a2a16' } },
  { id: 'enderman', name: 'Enderman', cost: 650, head: 'head_enderman',
    palette: { h: '#171717', s: '#101010', t: '#1c1c1c', T: '#0c0c0c', l: '#171717', L: '#0b0b0b', b: '#7b2fbe' } },
];

// Cosmetics — all purchasable with emeralds. Capes/hats render on every runner
// (camera sits behind the crowd, so capes are always on screen).
export const COSMETICS = {
  cape: [
    { id: 'none', name: 'No Cape', cost: 0 },
    { id: 'cape_red', name: 'Hero Red', cost: 40, colors: { c: '#c8322a', C: '#8f1f14' } },
    { id: 'cape_emerald', name: 'Emerald', cost: 60, colors: { c: '#2ecc5e', C: '#1d8f3e' } },
    { id: 'cape_ice', name: 'Frost', cost: 80, colors: { c: '#9fd8f0', C: '#6aaece' } },
    { id: 'cape_ender', name: 'Ender', cost: 120, colors: { c: '#8b3fd6', C: '#5c2496' } },
    { id: 'cape_gold', name: 'Royal Gold', cost: 180, colors: { c: '#f3c53f', C: '#c29222' } },
    { id: 'cape_rainbow', name: 'Rainbow', cost: 300, rainbow: true, colors: { c: '#ff5545', C: '#3fa9ff' } },
  ],
  hat: [
    { id: 'none', name: 'No Hat', cost: 0 },
    { id: 'hat_pumpkin', name: 'Pumpkin', cost: 50, sprite: 'hat_pumpkin' },
    { id: 'hat_slime', name: 'Slime Blob', cost: 70, sprite: 'hat_slime' },
    { id: 'hat_crown', name: 'Crown', cost: 100, sprite: 'hat_crown' },
    { id: 'hat_tnt', name: 'TNT Cap', cost: 130, sprite: 'hat_tnt' },
    { id: 'hat_santa', name: 'Santa', cost: 160, sprite: 'hat_santa' },
  ],
  trail: [
    { id: 'none', name: 'No Trail', cost: 0 },
    { id: 'trail_emerald', name: 'Emerald', cost: 50, colors: ['#2eff70', '#1fcf58'] },
    { id: 'trail_fire', name: 'Fire', cost: 90, colors: ['#ffb63c', '#ff5e2e'] },
    { id: 'trail_ender', name: 'Ender', cost: 140, colors: ['#c76bff', '#8b3fd6'] },
    { id: 'trail_rainbow', name: 'Rainbow', cost: 240, rainbow: true, colors: ['#ff5545', '#ffd94d', '#2eff70', '#3fa9ff'] },
  ],
  pet: [
    { id: 'none', name: 'No Pet', cost: 0 },
    { id: 'pet_wolf', name: 'Wolf', cost: 150, sprite: 'wolf' },
    { id: 'pet_parrot', name: 'Parrot', cost: 260, sprite: 'parrot' },
  ],
};

const SAVE_KEY = 'craftrush_save_v1';

export function loadSave() {
  const def = { emeralds: 0, level: 1, bestLevel: 1, mode: 'shooter', skin: 'steve',
    unlocked: ['steve'], sound: true, bestCrowd: 0, tutorialSeen: false,
    camera: 'far',
    cosmetics: { cape: 'none', hat: 'none', trail: 'none', pet: 'none' },
    cosmeticsOwned: ['none'],
    stats: { runs: 0, wins: 0, kills: 0, golems: 0, gigas: 0, totalEmeralds: 0, bossWins: {} },
    achievements: [] };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch { return def; }
}

export function persistSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}
