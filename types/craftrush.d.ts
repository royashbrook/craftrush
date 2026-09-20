// Public engine, content and save contracts. Retired save payloads stay opaque.

/** A single pixel-art sprite as the art manifest describes it. */
export interface SpriteMeta {
  /** width of ONE frame */
  w: number;
  h: number;
  /** how many frames sit side by side in the PNG */
  frames: number;
  /** 'bottom' for anything standing on the ground, 'center' for floating things */
  anchor: 'bottom' | 'center';
  /** character to colour, so colour variants can be described. See docs/SPRITE_SPEC.md */
  palette: Record<string, string>;
}

/** A sprite baked into the atlas, and where to find it. */
export interface AtlasEntry {
  id: string;
  w: number;
  h: number;
  anchor: 'bottom' | 'center';
  /** top-left of each frame in the atlas */
  frames: [number, number][];
}

export interface AtlasManifest {
  atlas: string;
  size: [number, number];
  sprites: Record<string, AtlasEntry>;
}

export interface Biome {
  id: string;
  name: string;
  sky: [string, string];
  sun: string | null;
  clouds?: boolean;
  embers?: boolean;
  stars?: boolean;
  dropsRods?: boolean;
  structure?: boolean;
  hillFar: string;
  hillNear: string;
  fog: string;
  ground: { a: string; b: string; c: string; pathA: string; pathB: string; edge: string; vein?: string };
  /** sprite names, which must exist in the theme's art */
  scenery: string[];
  enemies: string[];
  runStyle?: 'open' | 'fork' | 'sweep';
  obstacle: string;
  boss: string;
}

export interface Chapter {
  id: string;
  name: string;
  blurb: string;
  icon?: string;
  biome: string;
  boss?: string;
  phases?: number;
  crystals?: boolean;
  credits?: boolean;
  coda?: boolean;
  structure?: boolean;
  /** must be held before it opens */
  requires?: Record<string, number>;
  /** spent on completing it */
  consumes?: Record<string, number>;
  /** paid out on completing it */
  grants?: Record<string, number>;
  /** optional run goal shown in the HUD and graded with the result */
  objective?: {
    kind: 'goodGates' | 'dodges' | 'combo' | 'finishCrowd';
    target: number;
    text: string;
  };
  /** a gathering chapter you come back to, rather than a milestone */
  repeatable?: boolean;
  /** use the level's biome while repeating this gathering chapter */
  cycleBiomes?: boolean;
}

export type MasteryGrade = 'D' | 'C' | 'B' | 'A' | 'S';
export type MasteryBadgeId = 'clean_line' | 'golem_ace' | 'untouched';

export interface ChapterMasteryRecord {
  /** Current grades plus future string grades preserved by an older build. */
  bestGrade: MasteryGrade | string | null;
  bestCrowd: number;
  /** Known badge IDs plus any future IDs preserved across an older build. */
  badges: string[];
}

/** Result-only snapshot. `isNew` is never persisted in the save. */
export interface ChapterMasteryUpdateRecord extends ChapterMasteryRecord {
  isNew: boolean;
}

export interface PersistentMastery {
  chapters: Record<string, ChapterMasteryRecord>;
}

/**
 * A kid's progress. Every field here survives a theme swap and an app update,
 * so anything added needs a default in loadSave and, if it changes shape, a
 * migration. Losing this is the one unrecoverable bug in the game.
 */
export interface Save {
  emeralds: number;
  level: number;
  bestLevel: number;
  mode: 'shooter' | 'gates';
  skin: string;
  unlocked: string[];
  sound: boolean;
  music?: boolean;
  sfx?: boolean;
  bestCrowd: number;
  tutorialSeen: boolean;
  camera: string;
  speed: string;
  cosmetics: Record<string, string>;
  cosmeticsOwned: string[];
  stats: SaveStats;
  achievements: string[];
  expedition: { lastDay: string | null; streak: number; [key: string]: unknown };
  /** campaign resources: obsidian, blazeRods, enderEyes, elytra, trims, witherSkulls */
  inventory: Record<string, number>;
  campaign: { done: string[] };
  mastery: PersistentMastery;
  home: { lastCollect: number; [key: string]: unknown };
  mine: {
    depth: number; pickaxe: string; energy?: number; [key: string]: unknown;
  };
  roomTiersOwned: string[];
  decorOwned: Record<string, number>;
  world: unknown;
  settledRunIds?: string[];
  [key: string]: unknown;
}

/** Everything a theme folder supplies, keyed by file name. */
export interface Theme {
  biomes: Biome[];
  skins: Skin[];
  cosmetics: Cosmetics;
  enemies: { mobs: Record<string, EnemyType>; bosses: Record<string, BossType> };
  campaign: { resources: Record<string, { label: string; icon?: string }>; chapters: Chapter[] };
  tiers: Tiers;
  expeditions: Expedition[];
}

declare global {
  /** replaced by vite at build time with major.minor.commits-since-tag */
  const __APP_VERSION__: string;
  interface Window { webkitAudioContext?: typeof AudioContext }
}

export type Palette = Record<string, string>;
export type Mode = 'shooter' | 'gates';
export type RunState = 'menu' | 'run' | 'boss' | 'won' | 'lost' | 'destroyed';
export type RunStyle = 'classic' | 'open' | 'fork' | 'sweep';
export type ChoiceTier = 'best' | 'risky' | 'safe' | 'alternate';
export type GateOp = 'add' | 'mul' | 'scale' | 'sub' | 'div';
export interface Sprite { frames: HTMLCanvasElement[]; flash: HTMLCanvasElement[]; w: number; h: number; anchor: string }
export interface BlitOptions { flash?: boolean; alpha?: number; flip?: boolean }
export interface BillboardOptions extends BlitOptions { palette?: Palette; palKey?: string; zBias?: number; readable?: boolean; shadow?: boolean; yOff?: number; frame?: number }
export interface Projection { sx: number; sy: number; s: number; rel: number }
export interface CameraPreset { label: string; camBack: number; camHeight: number; focal: number; horizonFrac: number }
export type Objective = NonNullable<Chapter['objective']>;
export interface Skin { id: string; name: string; cost: number; head: string; body?: string; palette: Palette }
export interface Cosmetic { id: string; name: string; cost: number; quest?: string; rainbow?: boolean; sprite?: string }
export interface Cape extends Cosmetic { colors?: Palette }
export interface Trail extends Cosmetic { colors?: string[] }
export interface Cosmetics { cape: Cape[]; hat: Cosmetic[]; trail: Trail[]; pet: Cosmetic[] }
export interface Tier { name: string; worth: number; scale: number; max: number; boots: string; weight: number; color: string }
export interface Tiers { units: Tier[]; maxRunners: number; gradWorth: number; starMult: number }
export interface EnemyBase { hp: number; speed: number; worldH: number; sprite?: string; hops?: boolean; floats?: boolean; splitsTo?: string; bitePeriod?: number; zigzag?: boolean; teleports?: boolean }
export interface ExploderType extends EnemyBase { kind: 'exploder'; boomRadius: number; boomKills: number; fuse: number }
export interface ArcherType extends EnemyBase { kind: 'archer'; range: number; shotPeriod: number; spread?: number; projectile?: 'arrow' | 'fireball' }
export interface LobberType extends EnemyBase { kind: 'lobber'; range: number; shotPeriod: number; aoeRadius: number; aoeKills: number }
export type EnemyType = EnemyBase & { kind: 'chaser' | 'swooper' } | ExploderType | ArcherType | LobberType;
export interface BossType { name: string; hp: number; worldH: number; attacks: string[] }
export interface Modifiers { speedMul?: number; startWorth?: number; emeraldMul?: number; enemyHpMul?: number; enemies?: string[]; gateBoost?: boolean; appleCommon?: boolean; tntCommon?: boolean }
export interface Expedition { id: string; name: string; icon: string; desc: string; mode?: Mode; biome?: string; mut?: Modifiers }
export interface DailyExpedition extends Expedition { level: number; key: string; week: number }
export interface ThemeManifest { id: string; name: string; blurb: string; art?: string; atlas?: string; data?: string[]; [key: string]: unknown }
export interface PackedTheme { manifest: ThemeManifest; data: Theme }
export interface SaveStats { runs: number; wins: number; kills: number; golems: number; gigas: number; totalEmeralds: number; bossWins: Record<string, number>; expeditions: number; [key: string]: unknown }
export interface Backup { day: string; ts: number; level: number; emeralds: number; code: string }
export interface Mastery {
  gateChoices: number; goodGates: number; badGates: number; missedGates: number; riskyGates: number;
  bestGates: number; alternateGates: number; safeGates: number; combo: number; maxCombo: number;
  dodges: number; nearMisses: number; damageTaken: number; golemSends: number; usefulGolems: number;
  golemHits: number; startCrowd: number; objective: Objective | null;
}
export interface ObjectiveState { text: string; current: number; target: number; done: boolean }
export interface FinishFacts { win: boolean; finalCrowd: number; finishCrowd?: number; bestCrowd: number; kills: number }
export type MasteryTarget = { kind: 'badge'; id: string; label: string; description: string }
  | { kind: 'grade'; grade: string; label: string } | { kind: 'crowd'; target: number; label: string };
export interface MasteryMerge { applied: boolean; newBadges: string[]; record: ChapterMasteryUpdateRecord | null; nextTarget: MasteryTarget | null }
export interface FinishedMastery extends Omit<Mastery, 'objective'> {
  objective: ObjectiveState | null; win: boolean; finalCrowd: number; bestCrowd: number; kills: number;
  score: number; grade: MasteryGrade; label: string; praise: string;
  masteryUpdate?: Pick<MasteryMerge, 'newBadges' | 'record' | 'nextTarget'>;
}
export interface RunResult {
  id: string; win: boolean; level: number; emeralds: number; pickupEmeralds: number; bonus: number;
  emeraldMul: number; rods: number; kills: number; bestCrowd: number; biome: string; biomeId: string;
  mode: Mode; structure: boolean; expedition: Pick<Expedition, 'id' | 'name'> | null;
  chapter: Pick<Chapter, 'id' | 'name' | 'credits' | 'coda'> | null; mastery: FinishedMastery;
  settlement?: { earned: number; banked: number; streakBonus: number; streak: number; expeditionFirst: boolean };
}
export interface HudState {
  emeralds: number; crowd: number; stars: number; progress: number; redstone: number; redstoneMax: number;
  golemReady: boolean; golemGrants: number; nextGolemGrant: number | null;
  level: number; biome: string; mode: Mode; firing: boolean; autoFire: boolean; charging: boolean;
  autoCharge: boolean; autoGolem: boolean; power: Record<string, number>;
  objectiveText: string; objectiveProgress: string; objectiveDone: boolean; bossActive: boolean;
  boss: { name: string; hp: number; max: number; needRunners: number | null; phase: number; phases: number; shielded: boolean };
}
export interface GameHooks { onHud: (hud: HudState) => void; onRunEnd: (result: RunResult) => void; onTutorial: (step: 'aim_fire' | 'steer' | 'golem' | null) => void; onPause?: () => void }
export interface Position { x: number; z: number }
export interface Unit { ox: number; oz: number; tx: number; tz: number; phase: number; flash: number }
export interface Enemy extends Position { id: string; type: EnemyType; hp: number; maxHp: number; t: number; flash: number; fuse: number; shotT: number; biteT: number; tpT: number; dead: boolean; routeSide: number }
export interface Crystal extends Position { hp: number; t: number; dead: boolean }
export interface Boss extends Position {
  id: string; type: BossType; name: string; hp: number; maxHp: number; parPower: number; arrivalPower: number;
  targetZ: number; t: number; flash: number; attackT: number; attackIdx: number; lunge: number;
  entering: boolean; phases: number; phase: number; shielded: number; rhythmIdx: number; remixIdx: number;
  healing?: boolean; guarded?: boolean; chargeX?: number; lungeWarn?: number;
}
export interface GateShape extends Position { op: GateOp; val: number; halfW: number; risk?: boolean; par?: boolean; automatic?: boolean; meaningful?: boolean; choiceTier?: ChoiceTier | null; parBefore?: number; bestAfter?: number; alternateAfter?: number; followThroughZ?: number; encounterId?: string; reward?: boolean }
export interface Gate extends GateShape { hits: number; used: boolean; pulse: number; sparkVolley?: number }
export type SweepMotion = { kind: 'sweep'; amplitude: number; groupId?: string; startZ: number; endZ: number; direction?: number; initialSafeLane?: number; finalSafeLane?: number; originZ?: never; frequency?: never; phase?: never }
  | { kind: 'sweep'; amplitude: number; startZ?: never; endZ?: never; direction?: never; originZ: number; frequency: number; phase: number };
export interface AmbushEnemy extends Position { id: string }
export interface EncounterTrigger { choiceZ: number; dangerZ: number; defaultSide: number; branches: { left: AmbushEnemy[]; right: AmbushEnemy[] }; encounterId?: string; fired: boolean }
export interface EventCommon { z: number; encounterId?: string; role?: string; _order?: number }
export type LevelEvent = EventCommon & (
  | GateShape & { type: 'gate' }
  | Position & { type: 'enemy'; id: string; routeSide?: number }
  | Position & { type: 'obstacle'; baseX?: number; motion?: SweepMotion; stationary?: boolean; directed?: boolean }
  | Position & { type: 'pickup'; kind: string }
  | Omit<EncounterTrigger, 'fired'> & { type: 'ambush_trigger'; branchRewards?: { left: string; right: string } }
);
export interface Encounter { id: string; role: string; startZ: number; endZ: number; threat: boolean; relief: boolean; agency: number; mechanic: string; choiceZ?: number; dangerZ?: number; safeLane?: number; bossPreview?: boolean }
export interface Obstacle extends Position { baseX: number; hp: number; sprite: string; wobble: number; stationary: boolean; directed: boolean; motion: SweepMotion | null; encounterId?: string }
export interface Pickup extends Position { kind: string; t: number; quantity?: number; hp?: number; dead?: boolean }
export interface Arrow extends Position { vx: number; dmg: number; big?: boolean; dead?: boolean }
export type EnemyShot = Position & { vx: number; vz?: number; y: number; dead?: boolean } & (
  { kind: 'potion'; vy: number; aoe: LobberType } | { kind: 'arrow' | 'fireball' }
);
export interface Summon extends Position { t: number; stompT: number; source: string; perfectTiming: boolean; firstImpactT: number | null; impactCount: number; dead?: boolean }
export interface Particle extends Position { y: number; vx: number; vy: number; vz: number; life: number; color: string; size: number }
export interface Ring extends Position { r: number; maxR: number; life: number; T: number }
export interface Floaty extends Position { text: string; y: number; vy: number; life: number; T: number; color: string; sizeMul: number }
export interface Wave extends Position {
  halfW: number; warn: number; speed: number; kills: number; color?: string; lossFraction?: number;
  warnTotal?: number; sweep?: { fromX: number; toX: number }; threatened?: boolean; beatId?: string;
  groupId?: string; ambush?: AmbushEnemy[]; remix?: string; safeLane?: number; stationaryLane?: boolean;
  commitSide?: number; dead?: boolean;
}
export interface BossMetrics { warnings: number; resolved: number; threatening: number; hits: number; dodges: number; actionsStarted: number; beats: Map<string, { active: number; threatened: boolean; hit: boolean }> }
export interface GolemGrant { progress: number; awarded: boolean; wasted: boolean }
