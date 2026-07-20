// Craft Rush — tuning, biomes, skins, modes, persistence.
// Everything gameplay-mechanical references ROLES (enemy ids, sprite ids) from
// here, so a full reskin = new sprite packs + new tables. No engine changes.
import { Audio } from './audio.js';

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

  // pickup magnet + victory vacuum
  magnetRange: 4.6,     // blocks — covers the full lane so nothing slips past
  magnetPull: 5,        // per-second lerp toward the crowd
  vacuumPull: 7,        // post-boss suck-in lerp

  // enemy/combat tuning
  aggroRange: 26,       // blocks at which enemies notice the crowd
  biteReachX: 0.9, biteReachZ: 1.1,   // contact-bite box
  arrowHitX: 0.55,      // arrow vs enemy/obstacle half-width
  gateHitMargin: 0.25,  // gate crossing overlap slack

  // boss arena (blocks past the track end)
  bossSpawnZ: 17, bossHoldZ: 10,
  chargeSpendDivisor: 40, // gates-mode charge: worth spent per tick = worth/this
};

// Camera presets — live-switchable in the menu, persisted in the save.
export const CAMERAS = {
  close:    { label: 'CLOSE',    camBack: 7.4,  camHeight: 4.6,  focal: 5.2, horizonFrac: 0.36 },
  far:      { label: 'FAR',      camBack: 10.5, camHeight: 6.4,  focal: 4.6, horizonFrac: 0.33 },
  overhead: { label: 'OVERHEAD', camBack: 6.5,  camHeight: 11.5, focal: 3.4, horizonFrac: 0.18 },
};

// Tiered crowd: worth grows without limit. Runners merge upward through the
// ladder; worth beyond the render caps is held in `reserve`, which scales the
// top tier bigger and hits harder ("bigger and bigger", no max).
export const TIERS = {
  maxRunners: 96,
  // ladder above the basic runner; each unit fires one arrow worth `worth`
  units: [
    { name: 'MEGA STEVE',  worth: 10,   scale: 1.7, max: 12, boots: '#f3c53f', weight: 3,  color: '#ffd94d' },
    { name: 'GIGA STEVE',  worth: 100,  scale: 2.6, max: 10, boots: '#ff8c1a', weight: 6,  color: '#ff8c1a' },
    { name: 'ULTRA STEVE', worth: 1000, scale: 3.8, max: 8,  boots: '#c76bff', weight: 10, color: '#c76bff' },
  ],
  topMaxGrow: 1.5,          // extra top-tier scale at very high reserve
  reserveFullScale: 30000,  // reserve worth at which top tier reaches topMaxGrow
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
  boss_warden:  { name: 'THE WARDEN',    hp: 300, worldH: 5.0, attacks: ['sonicboom', 'minions', 'sonicboom', 'charge'] },
};

// Pickup registry: sprite + behavior for every collectible. Adding a new
// minecrafty pickup (obsidian, blaze rods, wither skulls) is one entry here.
// grounded = sits on the ground (no float bob). shooterAuto:false = must be
// shot open, not collected by touch (chests). magnet = drawn toward the crowd.
export const PICKUPS = {
  emerald: {
    sprite: 'emerald', worldH: 0.72, magnet: true,
    onCollect(g, p) {
      g.runEmeralds += TUNE.emeraldPickup;
      if (g.mode === 'gates') g.redstone = Math.min(TUNE.redstoneMax, g.redstone + TUNE.redstonePerEmeraldGatesMode);
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
  {
    id: 'deepdark', name: 'The Deep Dark',
    sky: ['#05090b', '#0c1a1e'], sun: null, clouds: false, stars: true, embers: false,
    hillFar: '#0c1a1e', hillNear: '#081215', fog: '#0a1518',
    ground: { a: '#0f2226', b: '#0c1c20', c: '#12282d', pathA: '#112326', pathB: '#0d2024', edge: '#164a44', vein: '#2fd6d6' },
    scenery: ['deepslate_pillar', 'sculk_sensor', 'sculk_shrieker', 'deepslate_pillar'],
    enemies: ['enderman', 'skeleton', 'creeper', 'spider'],
    obstacle: 'deepslate_pillar', boss: 'boss_warden',
  },
  {
    // First campaign STRUCTURE: the Nether Fortress. Blaze-heavy, rods drop
    // and bank to the save inventory. Boss: the Wither.
    id: 'nether_fortress', name: 'Nether Fortress', structure: true, dropsRods: true,
    sky: ['#160406', '#43101a'], sun: null, clouds: false, embers: true,
    hillFar: '#3a1218', hillNear: '#2a0d12', fog: '#43101a',
    ground: { a: '#4e1a22', b: '#451620', c: '#3a1218', pathA: '#5a2028', pathB: '#4e1a22', edge: '#6e2028' },
    scenery: ['nether_brick_pillar', 'nether_brick_pillar', 'crimson_fungus', 'basalt_pillar'],
    enemies: ['blaze', 'zombified_piglin', 'skeleton', 'blaze'],
    obstacle: 'nether_brick_pillar', boss: 'boss_wither',
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

// Daily Expeditions: one date-seeded themed run per day, identical for everyone
// with no server. `mut` holds the run modifiers the engine reads.
export const EXPEDITIONS = [
  { id: 'blaze_rush',   name: 'Blaze Rush',    icon: 'head_piglin',   biome: 'nether',   mode: 'shooter',
    desc: 'Nether raid — double emeralds and extra speed.',      mut: { emeraldMul: 2, speedMul: 1.15 } },
  { id: 'creeper_storm', name: 'Creeper Storm', icon: 'head_creeper',  mode: 'shooter',
    desc: 'Creepers everywhere. Grab the TNT and blast them!',   mut: { enemies: ['creeper', 'creeper', 'spider'], tntCommon: true, emeraldMul: 1.5 } },
  { id: 'giant_march',  name: 'Giant March',   icon: 'iron_golem',    mode: 'shooter',
    desc: 'Start with a Giga Steve, but the mobs hit harder.',   mut: { startWorth: 60, enemyHpMul: 1.4, emeraldMul: 1.5 } },
  { id: 'golden_hour',  name: 'Golden Hour',   icon: 'golden_apple',  mode: 'shooter',
    desc: 'Golden apples rain down. Triple emeralds!',           mut: { emeraldMul: 3, appleCommon: true } },
  { id: 'endless_night', name: 'Endless Night', icon: 'boss_warden',  biome: 'deepdark', mode: 'shooter',
    desc: 'The Deep Dark calls. Face the Warden.',               mut: { emeraldMul: 2 } },
  { id: 'bone_brigade', name: 'Bone Brigade',  icon: 'head_skeleton', mode: 'shooter',
    desc: 'Skeletons only. Dodge the arrow storm!',              mut: { enemies: ['skeleton', 'stray', 'skeleton'], emeraldMul: 1.5 } },
  { id: 'gate_frenzy',  name: 'Gate Frenzy',   icon: 'emerald',       mode: 'gates',
    desc: 'No bows — pure gates. Grow a giant army!',            mut: { gateBoost: true, emeraldMul: 2 } },
  { id: 'frozen_stampede', name: 'Frozen Stampede', icon: 'head_skeleton', biome: 'snow', mode: 'shooter',
    desc: 'Icy sprint — everything is faster. Hold on!',         mut: { speedMul: 1.3, emeraldMul: 2 } },
  { id: 'swamp_things', name: 'Swamp Things',  icon: 'head_zombie',   biome: 'swamp',    mode: 'gates',
    desc: 'Witch country, gates only. Choose wisely.',           mut: { gateBoost: true, enemyHpMul: 1.3, emeraldMul: 2 } },
];

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

export function loadSave() {
  const def = { emeralds: 0, level: 1, bestLevel: 1, mode: 'shooter', skin: 'steve',
    unlocked: ['steve'], sound: true, bestCrowd: 0, tutorialSeen: false,
    camera: 'far',
    cosmetics: { cape: 'none', hat: 'none', trail: 'none', pet: 'none' },
    cosmeticsOwned: ['none'],
    stats: { runs: 0, wins: 0, kills: 0, golems: 0, gigas: 0, totalEmeralds: 0, bossWins: {}, expeditions: 0 },
    achievements: [],
    expedition: { lastDay: null, streak: 0 },
    inventory: { blazeRods: 0, obsidian: 0 } };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch { return def; }
}

export function persistSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}
