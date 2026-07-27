// The shapes worth naming.
//
// Not an attempt to type nine thousand lines of engine. These are the places
// this project has actually been bitten: the save, which is a kid's progress
// and must never be corrupted; the theme, which is now loaded from disk and so
// can be wrong in ways nothing else would notice; and the sprite manifest,
// which is the contract between the art and the code.

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
  structure?: boolean;
  hillFar: string;
  hillNear: string;
  fog: string;
  ground: { a: string; b: string; c: string; pathA: string; pathB: string; edge: string };
  /** sprite names, which must exist in the theme's art */
  scenery: string[];
  enemies: string[];
  obstacle: string;
  boss?: string;
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
  stats: Record<string, number>;
  achievements: string[];
  expedition: Record<string, unknown>;
  /** campaign resources: obsidian, blazeRods, enderEyes, elytra, trims, witherSkulls */
  inventory: Record<string, number>;
  campaign: { done: string[] };
  home: { lastCollect: number };
  mine: {
    dug: string[]; mx: number; my: number; depth: number;
    pickaxe: string; inv: Record<string, number>; energy?: number;
  };
  roomTiersOwned: string[];
  decorOwned: Record<string, number>;
  world: Record<string, unknown>;
  settledRunIds?: string[];
}

/** Everything a theme folder supplies, keyed by file name. */
export interface Theme {
  biomes: Biome[];
  skins: unknown[];
  cosmetics: Record<string, unknown[]>;
  enemies: { mobs: Record<string, unknown>; bosses: Record<string, unknown> };
  campaign: { resources: Record<string, { label: string }>; chapters: Chapter[] };
  mine: { tiles: Record<string, unknown>; pickaxes: unknown[] };
  village: { villagers: unknown[]; towns: unknown[]; decor: unknown[]; roomTiers: unknown[] };
  tiers: unknown;
  expeditions: unknown[];
}

declare global {
  /** replaced by vite at build time with major.minor.commits-since-tag */
  const __APP_VERSION__: string;
}
