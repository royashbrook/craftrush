// A run ends once, even if its result is delivered twice or the result screen
// remounts. Keep every persistent mutation on this side of that boundary.
import {
  completeChapter,
  dayKey,
  persistSave,
  recordExpedition,
  writeBackup,
} from './config.js';
import { mergeChapterMastery } from './mastery.js';

export const SETTLED_RUN_CAP = 12;

/**
 * Apply one engine result to the save. This mutates the existing save object so
 * Svelte keeps seeing the same reactive proxy.
 */
export function settleRunResult(save, result, { now = Date.now(), expeditionKey = dayKey(new Date(now)) } = {}) {
  if (!result || !result.id) throw new Error('A run result needs an id before it can be settled.');

  const settledIds = Array.isArray(save.settledRunIds) ? save.settledRunIds : [];
  if (settledIds.includes(result.id)) return { applied: false, backup: false, result };

  const isExpedition = !!result.expedition;
  let streakBonus = 0;
  let streak = 0;
  let expeditionFirst = false;

  if (isExpedition && result.win) {
    const recorded = recordExpedition(save, expeditionKey);
    streak = recorded.streak;
    expeditionFirst = recorded.first;
    if (recorded.first) streakBonus = 20 * Math.min(recorded.streak, 10);
  }

  // A replay has already received today's expedition multiplier. Practice runs
  // still pay the base amount, exactly as the old result screen did.
  const earned = isExpedition && !expeditionFirst
    ? Math.round(result.emeralds / (result.emeraldMul || 1))
    : result.emeralds;
  const banked = earned + streakBonus;

  save.stats = save.stats || {};
  save.stats.runs = (save.stats.runs || 0) + 1;
  save.stats.kills = (save.stats.kills || 0) + result.kills;
  if (result.win) {
    save.stats.wins = (save.stats.wins || 0) + 1;
    save.stats.bossWins = save.stats.bossWins || {};
    save.stats.bossWins[result.biomeId] = (save.stats.bossWins[result.biomeId] || 0) + 1;
  }
  if (isExpedition && result.win && expeditionFirst) {
    save.stats.expeditions = (save.stats.expeditions || 0) + 1;
  }

  if (result.rods > 0) {
    save.inventory = save.inventory || {};
    save.inventory.blazeRods = (save.inventory.blazeRods || 0) + result.rods;
  }

  save.emeralds += banked;
  save.stats.totalEmeralds = (save.stats.totalEmeralds || 0) + banked;
  if (result.win && !isExpedition) {
    save.level += 1;
    save.bestLevel = Math.max(save.bestLevel, save.level);
  }
  save.bestCrowd = Math.max(save.bestCrowd, result.bestCrowd);

  if (result.win && result.chapter) completeChapter(save, result.chapter.id);

  if (!isExpedition && result.chapter) {
    const mastery = mergeChapterMastery(save, result);
    if (mastery.applied) {
      result.mastery = {
        ...(result.mastery || {}),
        masteryUpdate: {
          newBadges: mastery.newBadges,
          record: mastery.record,
          nextTarget: mastery.nextTarget,
        },
      };
    }
  }

  result.settlement = { earned, banked, streakBonus, streak, expeditionFirst };
  save.settledRunIds = [result.id, ...settledIds.filter((id) => id !== result.id)]
    .slice(0, SETTLED_RUN_CAP);

  return { applied: true, backup: !!result.win, result };
}

/**
 * Settle and persist as one synchronous handoff from the engine. Dependencies
 * are injectable so tests can prove persistence and backup happen once.
 */
export function finishRunSettlement(save, result, {
  now = Date.now(),
  expeditionKey,
  persist = persistSave,
  backup = writeBackup,
} = {}) {
  const settled = settleRunResult(save, result, { now, expeditionKey });
  if (!settled.applied) return settled;
  persist(save);
  if (settled.backup) backup(save, now);
  return settled;
}
