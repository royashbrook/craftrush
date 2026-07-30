import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave } from '../js/config.js';
import { finishRunSettlement, settleRunResult, SETTLED_RUN_CAP } from '../js/settlement.js';

const NOW = new Date(2026, 6, 27, 12).getTime();

function result(overrides = {}) {
  return {
    id: 'run-1',
    win: true,
    level: 1,
    emeralds: 50,
    emeraldMul: 1,
    rods: 2,
    kills: 7,
    bestCrowd: 30,
    biome: 'Plains',
    biomeId: 'plains',
    mode: 'shooter',
    expedition: null,
    chapter: null,
    ...overrides,
  };
}

test('a normal win settles every persistent run fact once', () => {
  const save = loadSave();
  let persisted = 0;
  let backedUp = 0;
  const r = result();

  const first = finishRunSettlement(save, r, {
    now: NOW,
    persist: () => { persisted++; },
    backup: () => { backedUp++; },
  });
  assert.equal(first.applied, true);
  assert.equal(save.emeralds, 50);
  assert.equal(save.level, 2);
  assert.equal(save.bestLevel, 2);
  assert.equal(save.bestCrowd, 30);
  assert.equal(save.inventory.blazeRods, 2);
  assert.equal(save.stats.runs, 1);
  assert.equal(save.stats.wins, 1);
  assert.equal(save.stats.kills, 7);
  assert.equal(save.stats.bossWins.plains, 1);
  assert.deepEqual(save.settledRunIds, ['run-1']);
  assert.equal(persisted, 1);
  assert.equal(backedUp, 1);

  const before = JSON.stringify(save);
  const duplicate = finishRunSettlement(save, { ...r }, {
    now: NOW,
    persist: () => { persisted++; },
    backup: () => { backedUp++; },
  });
  assert.equal(duplicate.applied, false);
  assert.equal(JSON.stringify(save), before, 'duplicate delivery leaves the save byte-identical');
  assert.equal(persisted, 1);
  assert.equal(backedUp, 1);
});

test('a loss records the run but does not advance or back up', () => {
  const save = loadSave();
  let backedUp = 0;
  const settled = finishRunSettlement(save, result({
    id: 'loss',
    win: false,
    emeralds: 4,
    rods: 0,
  }), {
    now: NOW,
    persist: () => {},
    backup: () => { backedUp++; },
  });
  assert.equal(settled.applied, true);
  assert.equal(save.level, 1);
  assert.equal(save.emeralds, 4);
  assert.equal(save.stats.runs, 1);
  assert.equal(save.stats.wins, 0);
  assert.equal(backedUp, 0);
});

test('expedition first clear and replay preserve the old reward rules', () => {
  const save = loadSave();
  const first = settleRunResult(save, result({
    id: 'exp-1',
    emeralds: 100,
    emeraldMul: 2,
    expedition: { id: 'raid', name: 'Raid' },
  }), { now: NOW, expeditionKey: '2026-07-27' });
  assert.equal(first.result.settlement.earned, 100);
  assert.equal(first.result.settlement.streakBonus, 20);
  assert.equal(save.emeralds, 120);
  assert.equal(save.stats.expeditions, 1);
  assert.equal(save.level, 1, 'an expedition never advances the campaign level');

  const replay = settleRunResult(save, result({
    id: 'exp-2',
    emeralds: 100,
    emeraldMul: 2,
    expedition: { id: 'raid', name: 'Raid' },
  }), { now: NOW, expeditionKey: '2026-07-27' });
  assert.equal(replay.result.settlement.earned, 50);
  assert.equal(replay.result.settlement.streakBonus, 0);
  assert.equal(save.emeralds, 170);
  assert.equal(save.stats.expeditions, 1);
});

test('campaign completion and its resource exchange happen once', () => {
  const save = loadSave();
  save.inventory.obsidian = 10;
  const r = result({ id: 'chapter', chapter: { id: 'portal', name: 'Light the Portal' } });
  settleRunResult(save, r, { now: NOW });
  assert.ok(save.campaign.done.includes('portal'));
  assert.equal(save.inventory.obsidian, 0);

  const before = JSON.stringify(save);
  settleRunResult(save, { ...r }, { now: NOW });
  assert.equal(JSON.stringify(save), before);
});

test('the settled run window stays bounded', () => {
  const save = loadSave();
  for (let i = 0; i < SETTLED_RUN_CAP + 4; i++) {
    settleRunResult(save, result({ id: `run-${i}`, win: false, emeralds: 0, rods: 0 }), { now: NOW });
  }
  assert.equal(save.settledRunIds.length, SETTLED_RUN_CAP);
  assert.equal(save.settledRunIds[0], `run-${SETTLED_RUN_CAP + 3}`);
});

test('campaign settlement attaches a persistent mastery update without changing rewards', () => {
  const save = loadSave();
  const settled = settleRunResult(save, result({
    id: 'mastery-first',
    chapter: { id: 'chapter-under-test' },
    mastery: {
      grade: 'B',
      goodGates: 3,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 2,
      damageTaken: 0,
      bestCrowd: 28,
    },
  }), { now: NOW });

  assert.equal(save.emeralds, 50, 'mastery never changes the payout');
  assert.equal(settled.result.settlement.earned, 50);
  assert.deepEqual(settled.result.mastery.masteryUpdate, {
    newBadges: ['clean_line', 'golem_ace', 'untouched'],
    record: {
      bestGrade: 'B',
      bestCrowd: 30,
      badges: ['clean_line', 'golem_ace', 'untouched'],
      isNew: true,
    },
    nextTarget: {
      kind: 'grade',
      grade: 'A',
      label: 'Earn grade A',
    },
  });
  const { isNew, ...persistentRecord } = settled.result.mastery.masteryUpdate.record;
  assert.equal(isNew, true);
  assert.deepEqual(save.mastery.chapters['chapter-under-test'], persistentRecord);
  assert.equal('isNew' in save.mastery.chapters['chapter-under-test'], false);
});

test('mastery settlement is monotonic and duplicate delivery remains idempotent', () => {
  const save = loadSave();
  settleRunResult(save, result({
    id: 'mastery-high',
    chapter: { id: 'chapter-under-test' },
    bestCrowd: 45,
    mastery: {
      grade: 'A',
      goodGates: 3,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 2,
      damageTaken: 0,
    },
  }), { now: NOW });

  const lower = result({
    id: 'mastery-low',
    win: false,
    chapter: { id: 'chapter-under-test' },
    bestCrowd: 10,
    mastery: {
      grade: 'D',
      goodGates: 0,
      badGates: 1,
      missedGates: 2,
      usefulGolems: 0,
      damageTaken: 8,
    },
  });
  settleRunResult(save, lower, { now: NOW });
  assert.equal(lower.mastery.masteryUpdate.record.bestGrade, 'A');
  assert.equal(lower.mastery.masteryUpdate.record.bestCrowd, 45);
  assert.equal(lower.mastery.masteryUpdate.record.isNew, false);
  assert.deepEqual(lower.mastery.masteryUpdate.newBadges, []);

  const before = JSON.stringify(save);
  settleRunResult(save, { ...lower }, { now: NOW });
  assert.equal(JSON.stringify(save), before);
});

test('daily expeditions remain isolated from campaign mastery', () => {
  const save = loadSave();
  const expedition = result({
    id: 'mastery-expedition',
    expedition: { id: 'daily' },
    chapter: { id: 'chapter-under-test' },
    mastery: {
      grade: 'S',
      goodGates: 9,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 3,
      damageTaken: 0,
    },
  });
  settleRunResult(save, expedition, { now: NOW, expeditionKey: '2026-07-27' });
  assert.equal(Object.hasOwn(save.mastery.chapters, 'chapter-under-test'), false);
  assert.equal('masteryUpdate' in expedition.mastery, false);
});

test('credits can complete the campaign without creating a mastery record', () => {
  const save = loadSave();
  const credits = result({
    id: 'credits-run',
    chapter: { id: 'credits', name: 'The Long Walk Home', credits: true },
    mastery: {
      grade: 'S',
      goodGates: 9,
      badGates: 0,
      missedGates: 0,
      usefulGolems: 3,
      damageTaken: 0,
    },
  });

  settleRunResult(save, credits, { now: NOW });

  assert.ok(save.campaign.done.includes('credits'));
  assert.equal(Object.hasOwn(save.mastery.chapters, 'credits'), false);
  assert.equal('masteryUpdate' in credits.mastery, false);
});
