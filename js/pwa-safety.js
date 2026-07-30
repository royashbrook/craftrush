// Shared-origin and save-boundary rules. Keep this module browser-agnostic so
// the app, rescue bundle, service worker, and node tests all enforce the same
// narrow ownership rules.

export const CRAFTRUSH_CACHE_PREFIX = 'craftrush-';
export const CRAFTRUSH_APP_ORIGIN = 'https://craftrush.royashbrook.com';

export function ownsCraftRushCache(name) {
  return typeof name === 'string' && name.startsWith(CRAFTRUSH_CACHE_PREFIX);
}

/**
 * A static host may canonicalize `rescue.html` to `/rescue`. Cache.addAll keeps
 * the final 200 response under the original request, including redirected=true.
 * Chromium rejects that response when a worker passes it directly to
 * respondWith for a navigation. Re-wrapping preserves the bytes and headers
 * while dropping only the redirect metadata.
 */
export function replayableCachedResponse(response) {
  if (!response?.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Craft Rush owns the root only on its dedicated production origin. Everywhere
 * else it retains the old, deliberately narrow /craftrush/ boundary. That
 * includes royashbrook.com, local development and lookalike hostnames: a rescue
 * or update button must never unregister a neighboring app's root worker.
 */
export function craftRushScopePath(pageHref) {
  try {
    const page = new URL(pageHref);
    if (page.origin === CRAFTRUSH_APP_ORIGIN) return '/';
    const path = new URL('./', page).pathname;
    return path === '/' ? '/craftrush/' : path;
  } catch {
    return '/craftrush/';
  }
}

export function ownsCraftRushRegistration(registration, pageHref) {
  try {
    const page = new URL(pageHref);
    const scope = new URL(registration.scope, page);
    const root = craftRushScopePath(page.href);
    return scope.origin === page.origin
      && (scope.pathname === root || scope.pathname.startsWith(root));
  } catch {
    return false;
  }
}

/**
 * Home Screen apps on iOS keep storage separate from Safari. Keep this check
 * browser-agnostic so the menu can offer the old-save recovery path only inside
 * an installed app, while ordinary browser players keep the compact menu.
 */
export function isStandaloneApp(
  navigatorLike = globalThis.navigator,
  matchMediaLike = globalThis.matchMedia,
) {
  if (navigatorLike?.standalone === true) return true;
  try {
    return matchMediaLike?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * A newly installed app has no signal from the old origin because that storage
 * boundary is the problem. Offer recovery while the local game is still close
 * to its untouched starting state, then step out of the way once it is clearly
 * an established save.
 */
export function shouldOfferLegacyRestore(save, standalone) {
  if (!standalone || !record(save)) return false;
  const done = Array.isArray(save.campaign?.done) ? save.campaign.done : [];
  const unlocked = Array.isArray(save.unlocked) ? save.unlocked : [];
  const runs = Number.isFinite(save.stats?.runs) ? save.stats.runs : 0;
  const earned = Number.isFinite(save.stats?.totalEmeralds) ? save.stats.totalEmeralds : 0;
  return save.level === 1
    && (save.bestLevel ?? 1) <= 1
    && done.length === 0
    && runs <= 1
    && earned <= 50
    && unlocked.every((skin) => skin === 'steve');
}

const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const stringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const finiteAtLeast = (value, min) => typeof value === 'number' && Number.isFinite(value) && value >= min;
function friendSchemaError(friend, path) {
  if (!record(friend) || typeof friend.skin !== 'string') return `${path} must be a friend`;
  if ('cosmetics' in friend && !record(friend.cosmetics)) return `${path}.cosmetics must be an object`;
  for (const category of ['cape', 'hat']) {
    if (friend.cosmetics && category in friend.cosmetics
        && typeof friend.cosmetics[category] !== 'string') {
      return `${path}.cosmetics.${category} must be text`;
    }
  }
  for (const coordinate of ['x', 'y']) {
    if (coordinate in friend
        && (typeof friend[coordinate] !== 'number' || !Number.isFinite(friend[coordinate]))) {
      return `${path}.${coordinate} must be a number`;
    }
  }
  return '';
}

/**
 * Accept old and partial saves, which the normal loader fills with defaults,
 * while rejecting values that would overwrite those defaults with structures
 * the game cannot use.
 */
export function saveSchemaError(save) {
  if (!record(save)) return 'the save must be a JSON object';
  if (!Number.isInteger(save.level) || save.level < 1) return 'level must be a positive whole number';
  if ('emeralds' in save && !finiteAtLeast(save.emeralds, 0)) return 'emeralds must be a non-negative number';
  for (const key of ['bestLevel', 'bestCrowd']) {
    if (key in save && !finiteAtLeast(save[key], 0)) return `${key} must be a non-negative number`;
  }

  for (const key of ['skin', 'camera', 'speed']) {
    if (key in save && typeof save[key] !== 'string') return `${key} must be text`;
  }
  if ('mode' in save && !['shooter', 'gates'].includes(save.mode)) return 'mode must be shooter or gates';
  for (const key of ['sound', 'music', 'sfx', 'tutorialSeen']) {
    if (key in save && typeof save[key] !== 'boolean') return `${key} must be true or false`;
  }
  for (const key of ['unlocked', 'cosmeticsOwned', 'achievements', 'roomTiersOwned', 'settledRunIds']) {
    if (key in save && !stringArray(save[key])) return `${key} must be a list of names`;
  }
  if ('playmates' in save) {
    if (!Array.isArray(save.playmates)) return 'playmates must be a list';
    for (const [index, person] of save.playmates.entries()) {
      const error = friendSchemaError(person, `playmates[${index}]`);
      if (error) return error;
    }
  }
  if ('decor' in save) {
    if (!Array.isArray(save.decor)) return 'decor must be a list';
    for (const item of save.decor) {
      if (!record(item) || typeof item.item !== 'string') {
        return 'decor must contain placed items';
      }
    }
  }
  if ('roomTier' in save && typeof save.roomTier !== 'string') return 'roomTier must be text';
  for (const key of ['cosmetics', 'stats', 'expedition', 'inventory', 'campaign', 'home', 'mine', 'decorOwned', 'mastery']) {
    if (key in save && !record(save[key])) return `${key} must be an object`;
  }
  if ('world' in save && save.world !== null && !record(save.world)) return 'world must be an object';
  if (save.campaign && 'done' in save.campaign && !stringArray(save.campaign.done)) {
    return 'campaign.done must be a list of chapter names';
  }
  if (save.mastery) {
    if ('chapters' in save.mastery && !record(save.mastery.chapters)) {
      return 'mastery.chapters must be an object';
    }
    for (const [chapter, value] of Object.entries(save.mastery.chapters || {})) {
      if (!record(value)) return `mastery.chapters.${chapter} must be an object`;
      if ('bestGrade' in value
          && value.bestGrade !== null
          && (typeof value.bestGrade !== 'string' || !value.bestGrade.trim())) {
        return `mastery.chapters.${chapter}.bestGrade must be nonempty text or null`;
      }
      if ('bestCrowd' in value && !finiteAtLeast(value.bestCrowd, 0)) {
        return `mastery.chapters.${chapter}.bestCrowd must be a non-negative number`;
      }
      if ('badges' in value && !stringArray(value.badges)) {
        return `mastery.chapters.${chapter}.badges must be a list of badge names`;
      }
    }
  }
  if (save.cosmetics) {
    for (const key of ['cape', 'hat', 'trail', 'pet']) {
      if (key in save.cosmetics && typeof save.cosmetics[key] !== 'string') {
        return `cosmetics.${key} must be text`;
      }
    }
  }
  if (save.inventory) {
    for (const [key, value] of Object.entries(save.inventory)) {
      if (!finiteAtLeast(value, 0)) return `inventory.${key} must be a non-negative number`;
    }
  }
  if (save.stats) {
    for (const [key, value] of Object.entries(save.stats)) {
      if (key === 'bossWins') {
        if (!record(value)) return 'stats.bossWins must be an object';
        for (const [boss, wins] of Object.entries(value)) {
          if (!finiteAtLeast(wins, 0)) return `stats.bossWins.${boss} must be a non-negative number`;
        }
      } else if (!finiteAtLeast(value, 0)) {
        return `stats.${key} must be a non-negative number`;
      }
    }
  }
  if (save.expedition) {
    if ('lastDay' in save.expedition
        && save.expedition.lastDay !== null
        && typeof save.expedition.lastDay !== 'string') return 'expedition.lastDay must be text or null';
    if ('streak' in save.expedition && !finiteAtLeast(save.expedition.streak, 0)) {
      return 'expedition.streak must be a non-negative number';
    }
  }
  if (save.home) {
    if ('lastCollect' in save.home && !finiteAtLeast(save.home.lastCollect, 0)) {
      return 'home.lastCollect must be a non-negative number';
    }
    if ('villagers' in save.home && !record(save.home.villagers)) return 'home.villagers must be an object';
    for (const [villager, count] of Object.entries(save.home.villagers || {})) {
      if (!finiteAtLeast(count, 0)) return `home.villagers.${villager} must be a non-negative number`;
    }
  }
  if (save.mine) {
    for (const key of ['depth', 'energy', 'energyTs']) {
      if (key in save.mine && !finiteAtLeast(save.mine[key], 0)) {
        return `mine.${key} must be a non-negative number`;
      }
    }
    if ('pickaxe' in save.mine && typeof save.mine.pickaxe !== 'string') return 'mine.pickaxe must be text';
    if ('dug' in save.mine && !stringArray(save.mine.dug)) return 'mine.dug must be a list of tile names';
    for (const key of ['mx', 'my']) {
      if (key in save.mine && (typeof save.mine[key] !== 'number' || !Number.isFinite(save.mine[key]))) {
        return `mine.${key} must be a number`;
      }
    }
    if ('inv' in save.mine && !record(save.mine.inv)) return 'mine.inv must be an object';
    for (const [ore, count] of Object.entries(save.mine.inv || {})) {
      if (!finiteAtLeast(count, 0)) return `mine.inv.${ore} must be a non-negative number`;
    }
  }
  for (const [decor, count] of Object.entries(save.decorOwned || {})) {
    if (!finiteAtLeast(count, 0)) return `decorOwned.${decor} must be a non-negative number`;
  }
  if (save.world) {
    if ('towns' in save.world && !record(save.world.towns)) return 'world.towns must be an object';
    if ('town' in save.world && typeof save.world.town !== 'string') return 'world.town must be text';
    if ('house' in save.world && (!Number.isInteger(save.world.house) || save.world.house < 0)) {
      return 'world.house must be a non-negative whole number';
    }
    if ('carry' in save.world && save.world.carry !== null) {
      const error = friendSchemaError(save.world.carry, 'world.carry');
      if (error) return error;
    }
    for (const [town, value] of Object.entries(save.world.towns || {})) {
      if (!record(value)) return `world.towns.${town} must be an object`;
      if ('unlocked' in value && typeof value.unlocked !== 'boolean') {
        return `world.towns.${town}.unlocked must be true or false`;
      }
      if ('houses' in value && !Array.isArray(value.houses)) return `world.towns.${town}.houses must be a list`;
      if ('villagers' in value && !record(value.villagers)) {
        return `world.towns.${town}.villagers must be an object`;
      }
      for (const [villager, count] of Object.entries(value.villagers || {})) {
        if (!finiteAtLeast(count, 0)) {
          return `world.towns.${town}.villagers.${villager} must be a non-negative number`;
        }
      }
      for (const house of value.houses || []) {
        if (!record(house)) return `world.towns.${town}.houses must contain objects`;
        if (typeof house.style !== 'string') {
          return `world.towns.${town}.house style must be text`;
        }
        if (!Array.isArray(house.decor)) {
          return `world.towns.${town}.house decor must be a list`;
        }
        if (!Array.isArray(house.people)) {
          return `world.towns.${town}.house people must be a list`;
        }
        for (const decor of house.decor) {
          if (!record(decor) || typeof decor.item !== 'string') {
            return `world.towns.${town}.house decor must contain placed items`;
          }
        }
        for (const [index, person] of house.people.entries()) {
          const error = friendSchemaError(person, `world.towns.${town}.house people[${index}]`);
          if (error) return error;
        }
      }
    }
  }
  return '';
}

export function parsePlayableSave(json) {
  let save;
  try {
    save = JSON.parse(json);
  } catch {
    return { save: null, error: 'not valid JSON' };
  }
  const error = saveSchemaError(save);
  return error ? { save: null, error } : { save, error: '' };
}

export function updateReloadIsSafe(nav) {
  return !nav.playing && !nav.result;
}
