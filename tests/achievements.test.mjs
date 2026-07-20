import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAchievements, ACHIEVEMENTS } from '../js/achievements.js';

const fullSave = () => ({
  bestCrowd: 600, bestLevel: 9,
  unlocked: ['steve', 'alex', 'zombie'],
  cosmetics: { cape: 'cape_red', hat: 'none', trail: 'none', pet: 'pet_wolf' },
  cosmeticsOwned: ['none', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  stats: { runs: 3, kills: 1000, golems: 1, gigas: 1, totalEmeralds: 2000,
    bossWins: { plains: 1, end: 1, deepdark: 1 }, expeditions: 1 },
  expedition: { streak: 7 },
  achievements: [],
});

test('a maxed save unlocks the flagship achievements', () => {
  const save = fullSave();
  const got = checkAchievements(save);
  assert.ok(got.length > 0);
  for (const id of ['warden', 'dragon', 'titan', 'streak7', 'worldtour', 'giga']) {
    assert.ok(save.achievements.includes(id), `expected ${id} unlocked`);
  }
});

test('already-earned achievements are not re-reported', () => {
  const save = fullSave();
  checkAchievements(save);
  assert.deepEqual(checkAchievements(save), [], 'second pass yields nothing new');
});

test('an old save missing stat fields does not throw', () => {
  const old = {
    bestCrowd: 0, bestLevel: 1,
    unlocked: ['steve'],
    cosmetics: { cape: 'none', hat: 'none', trail: 'none', pet: 'none' },
    cosmeticsOwned: ['none'],
    stats: {}, // no bossWins, no expeditions
    achievements: [],
  };
  assert.doesNotThrow(() => checkAchievements(old));
});

test('every achievement has the required fields', () => {
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && a.name && a.desc && a.icon && typeof a.check === 'function');
  }
});
