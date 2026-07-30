import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BADGES,
  chapterMastery,
  createMastery,
  finishMastery,
  masteryChapterEligible,
  mergeChapterMastery,
  nextMasteryTarget,
  normalizeMasterySave,
  objectiveState,
  recordDamage,
  recordDodge,
  recordGate,
} from '../js/mastery.js';

test('the same run facts always produce the same grade', () => {
  const facts = createMastery(null, 4);
  assert.deepEqual(
    { sends: facts.golemSends, useful: facts.usefulGolems, hits: facts.golemHits },
    { sends: 0, useful: 0, hits: 0 },
    'no-send runs still carry explicit golem mastery counters',
  );
  recordGate(facts, true);
  recordGate(facts, true, true);
  recordDodge(facts, true);
  recordDamage(facts, 2);
  const input = { win: true, finalCrowd: 18, bestCrowd: 22, kills: 7 };
  assert.deepEqual(finishMastery(structuredClone(facts), input), finishMastery(structuredClone(facts), input));
});

test('a smarter line earns a better grade without changing a reward', () => {
  const rough = createMastery(null, 4);
  recordGate(rough, null);
  recordGate(rough, false);
  recordDamage(rough, 8);

  const smart = createMastery(null, 4);
  recordGate(smart, true);
  recordGate(smart, true, true);
  recordGate(smart, true);
  recordDodge(smart, true);

  const ending = { win: true, finalCrowd: 20, bestCrowd: 24, kills: 5 };
  const roughGrade = finishMastery(rough, ending);
  const smartGrade = finishMastery(smart, ending);
  assert.ok(smartGrade.score > roughGrade.score);
  assert.notEqual(smartGrade.grade, roughGrade.grade);
  assert.equal('emeralds' in smartGrade, false);
});

test('chapter objectives report live progress and completion', () => {
  const mastery = createMastery({
    objective: { kind: 'goodGates', target: 3, text: 'Pick 3 growing gates' },
  }, 4);
  recordGate(mastery, true);
  recordGate(mastery, true);
  assert.deepEqual(objectiveState(mastery), {
    text: 'Pick 3 growing gates', current: 2, target: 3, done: false,
  });
  recordGate(mastery, true);
  assert.equal(objectiveState(mastery).done, true);
  assert.match(finishMastery(mastery, {
    win: true, finalCrowd: 12, bestCrowd: 12, kills: 0,
  }).praise, /^Quest done:/);
});

test('a finish-crowd objective keeps the boss-arrival result', () => {
  const mastery = createMastery({
    objective: { kind: 'finishCrowd', target: 12, text: 'Bring 12 runners to the boss' },
  }, 4);
  const result = finishMastery(mastery, {
    win: true,
    finalCrowd: 3,
    finishCrowd: 18,
    bestCrowd: 24,
    kills: 0,
  });
  assert.equal(result.objective.done, true);
  assert.equal(result.objective.current, 12);
});

test('persistent badge order defines the next clear chapter target', () => {
  assert.deepEqual(BADGES.map((badge) => badge.id), [
    'clean_line', 'golem_ace', 'untouched',
  ]);
  const save = {};
  assert.deepEqual(nextMasteryTarget(save, 'portal'), {
    kind: 'badge',
    ...BADGES[0],
  });
  assert.deepEqual(save, {}, 'derived mastery reads never write through the save');
  assert.deepEqual(chapterMastery(save, 'portal'), {
    bestGrade: null,
    bestCrowd: 0,
    badges: [],
  });
  assert.deepEqual(save, {}, 'an absent chapter remains absent after a direct read');
});

test('old and malformed mastery records are repaired without erasing future fields', () => {
  const save = {
    emeralds: 77,
    mastery: {
      futureField: 'keep me',
      chapters: {
        portal: {
          bestGrade: 'legendary',
          bestCrowd: -12,
          badges: ['untouched', 'clean_line', 'clean_line', null, 'future_badge'],
          futureRecordField: 9,
        },
        fortress: null,
      },
    },
  };
  const normalized = normalizeMasterySave(save);
  assert.equal(save.emeralds, 77);
  assert.equal(normalized.futureField, 'keep me');
  assert.deepEqual(normalized.chapters.portal, {
    bestGrade: 'legendary',
    bestCrowd: 0,
    badges: ['clean_line', 'untouched', 'future_badge'],
    futureRecordField: 9,
  });
  assert.deepEqual(normalized.chapters.fortress, {
    bestGrade: null,
    bestCrowd: 0,
    badges: [],
  });
  const once = JSON.stringify(save.mastery);
  normalizeMasterySave(save);
  assert.equal(JSON.stringify(save.mastery), once, 'normalization is idempotent');
});

test('a chapter run earns badges from exact run facts and stores its bests', () => {
  const save = {};
  const update = mergeChapterMastery(save, {
    chapter: { id: 'portal' },
    win: true,
    bestCrowd: 31,
    mastery: {
      grade: 'B',
      bestCrowd: 29,
      goodGates: 3,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 2,
      damageTaken: 0,
    },
  });
  assert.equal(update.applied, true);
  assert.deepEqual(update.newBadges, ['clean_line', 'golem_ace', 'untouched']);
  assert.deepEqual(update.record, {
    bestGrade: 'B',
    bestCrowd: 31,
    badges: ['clean_line', 'golem_ace', 'untouched'],
    isNew: true,
  });
  assert.equal('isNew' in save.mastery.chapters.portal, false);
  assert.deepEqual(update.nextTarget, {
    kind: 'grade',
    grade: 'A',
    label: 'Earn grade A',
  });
});

test('chapter grades and crowd records only move upward', () => {
  const save = {};
  mergeChapterMastery(save, {
    chapter: { id: 'portal' },
    win: true,
    bestCrowd: 40,
    mastery: {
      grade: 'A',
      goodGates: 3,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 2,
      damageTaken: 0,
    },
  });
  const lower = mergeChapterMastery(save, {
    chapter: { id: 'portal' },
    win: false,
    bestCrowd: 12,
    mastery: {
      grade: 'C',
      goodGates: 0,
      badGates: 2,
      missedGates: 1,
      usefulGolems: 0,
      damageTaken: 4,
    },
  });
  assert.deepEqual(lower.newBadges, []);
  assert.equal(lower.record.bestGrade, 'A');
  assert.equal(lower.record.bestCrowd, 40);
  assert.equal(lower.record.isNew, false);
  assert.deepEqual(lower.nextTarget, {
    kind: 'grade',
    grade: 'S',
    label: 'Earn grade S',
  });

  const higherGrade = mergeChapterMastery(save, {
    chapter: { id: 'portal' },
    win: false,
    bestCrowd: 39,
    mastery: { grade: 'S', damageTaken: 1 },
  });
  assert.equal(higherGrade.record.isNew, true);
  assert.equal('isNew' in save.mastery.chapters.portal, false);
  assert.deepEqual(nextMasteryTarget(save, 'portal'), {
    kind: 'crowd',
    target: 41,
    label: 'Build a crowd of 41',
  });

  const higherCrowd = mergeChapterMastery(save, {
    chapter: { id: 'portal' },
    win: false,
    bestCrowd: 44,
    mastery: { grade: 'D', damageTaken: 1 },
  });
  assert.equal(higherCrowd.record.isNew, true);
  assert.equal(higherCrowd.record.bestCrowd, 44);
  assert.equal('isNew' in save.mastery.chapters.portal, false);
});

test('unknown future grades survive and are never replaced by this grade scale', () => {
  const save = {
    mastery: {
      chapters: {
        portal: {
          bestGrade: 'S+',
          bestCrowd: 52,
          badges: BADGES.map((badge) => badge.id),
        },
      },
    },
  };
  normalizeMasterySave(save);
  const update = mergeChapterMastery(save, {
    chapter: { id: 'portal' },
    win: true,
    bestCrowd: 50,
    mastery: { grade: 'S', damageTaken: 0 },
  });
  assert.equal(update.record.bestGrade, 'S+');
  assert.equal(update.record.isNew, false);
  assert.equal(save.mastery.chapters.portal.bestGrade, 'S+');
  assert.deepEqual(nextMasteryTarget(save, 'portal'), {
    kind: 'crowd',
    target: 53,
    label: 'Build a crowd of 53',
  });
});

test('badge thresholds do not award near misses', () => {
  const cases = [
    {
      id: 'two-gates',
      result: {
        win: true,
        mastery: { grade: 'D', goodGates: 2, badGates: 0, missedGates: 0, damageTaken: 1 },
      },
    },
    {
      id: 'bad-gate',
      result: {
        win: true,
        mastery: { grade: 'D', goodGates: 3, badGates: 1, missedGates: 0, damageTaken: 1 },
      },
    },
    {
      id: 'missed-gate',
      result: {
        win: true,
        mastery: { grade: 'D', goodGates: 3, badGates: 0, missedGates: 1, damageTaken: 1 },
      },
    },
    {
      id: 'one-golem',
      result: {
        win: true,
        mastery: { grade: 'D', usefulGolems: 1, damageTaken: 1 },
      },
    },
    {
      id: 'loss',
      result: {
        win: false,
        mastery: { grade: 'D', damageTaken: 0 },
      },
    },
    {
      id: 'missing-damage-fact',
      result: {
        win: true,
        mastery: { grade: 'D' },
      },
    },
  ];

  for (const { id, result } of cases) {
    const save = {};
    const update = mergeChapterMastery(save, { chapter: { id }, ...result });
    assert.deepEqual(update.newBadges, [], id);
  }
});

test('expeditions cannot write campaign mastery even when handed a chapter', () => {
  const save = {};
  const before = JSON.stringify(save);
  assert.deepEqual(mergeChapterMastery(save, {
    expedition: { id: 'daily' },
    chapter: { id: 'portal' },
    win: true,
    bestCrowd: 99,
    mastery: {
      grade: 'S',
      goodGates: 9,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 3,
      damageTaken: 0,
    },
  }), {
    applied: false,
    newBadges: [],
    record: null,
    nextTarget: null,
  });
  assert.equal(JSON.stringify(save), before);
});

test('credits and coda chapters never create persistent mastery', () => {
  assert.equal(masteryChapterEligible({ id: 'credits', credits: true }), false);
  assert.equal(masteryChapterEligible({ id: 'walk_home', coda: true }), false);
  assert.equal(masteryChapterEligible({ id: 'portal' }), true);

  for (const chapter of [
    { id: 'credits', credits: true },
    { id: 'walk_home', coda: true },
  ]) {
    const save = {};
    const before = JSON.stringify(save);
    assert.deepEqual(mergeChapterMastery(save, {
      chapter,
      win: true,
      bestCrowd: 99,
      mastery: {
        grade: 'S',
        goodGates: 9,
        badGates: 0,
        missedGates: 0,
        usefulGolems: 3,
        damageTaken: 0,
      },
    }), {
      applied: false,
      newBadges: [],
      record: null,
      nextTarget: null,
    });
    assert.equal(JSON.stringify(save), before);
  }
});
