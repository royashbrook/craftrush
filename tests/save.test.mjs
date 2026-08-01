import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, exportSave, importSave, resetSave } from '../js/config.js';

function withStorage(seed) {
  const store = {};
  if (seed) store['craftrush_save_v1'] = JSON.stringify(seed);
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

test('loadSave returns full defaults when nothing is stored', () => {
  withStorage(null);
  const s = loadSave();
  assert.equal(s.level, 1);
  assert.equal(s.mode, 'shooter');
  assert.deepEqual(s.unlocked, ['steve']);
  assert.ok(s.stats && s.expedition && s.cosmetics);
  assert.deepEqual(s.mastery, { chapters: {} });
});

test('loadSave merges a partial v0.1 save over the defaults', () => {
  withStorage({ emeralds: 500, level: 4, unlocked: ['steve', 'alex'] });
  const s = loadSave();
  assert.equal(s.emeralds, 500);
  assert.equal(s.level, 4);
  assert.deepEqual(s.unlocked, ['steve', 'alex']);
  // fields absent from the stored save fall back to defaults
  assert.equal(s.mode, 'shooter');
  assert.equal(s.camera, 'far');
  assert.ok(s.stats);
});

test('loadSave keeps a current-theme starter when owned skins are empty or foreign', () => {
  withStorage({ emeralds: 1, level: 2, unlocked: ['skin_from_another_theme'] });
  const s = loadSave();
  assert.ok(s.unlocked.includes('steve'));
  assert.ok(s.unlocked.includes('skin_from_another_theme'), 'foreign ownership is preserved');
});

test('import repairs an empty owned-skin list before it reaches a screen', () => {
  withStorage(null);
  const restored = importSave(exportSave({ level: 2, unlocked: [] }));
  assert.ok(restored.unlocked.includes('steve'));
});

test('a backup code round-trips through export and import', () => {
  withStorage(null);
  const s = loadSave();
  s.emeralds = 9876; s.level = 7; s.unlocked = ['steve', 'alex', 'zombie'];
  const code = exportSave(s);
  assert.ok(code.startsWith('CR1|'));
  const back = importSave(code);
  assert.equal(back.emeralds, 9876);
  assert.equal(back.level, 7);
  assert.deepEqual(back.unlocked, ['steve', 'alex', 'zombie']);
});

test('chapter mastery survives backup export and import', () => {
  withStorage(null);
  const s = loadSave();
  s.mastery.chapters.portal = {
    bestGrade: 'S+',
    bestCrowd: 42,
    badges: ['clean_line', 'future_badge'],
  };
  const back = importSave(exportSave(s));
  assert.deepEqual(back.mastery.chapters.portal, {
    bestGrade: 'S+',
    bestCrowd: 42,
    badges: ['clean_line', 'future_badge'],
  });
});

test('retired village, world, room, and mine data survives load and transfer unchanged', () => {
  const retired = {
    home: { villagers: { farmer: 7, miner: 3 }, lastCollect: 12345 },
    mine: { depth: 88, energy: 4, energyTs: 67890, pickaxe: 'diamond', dug: ['1,2'] },
    roomTiersOwned: ['cabin', 'castle'],
    decorOwned: { chair: 2 },
    world: {
      town: 'desert',
      house: 2,
      towns: { desert: { unlocked: true, houses: [{ style: 'sandstone', decor: [], people: [] }] } },
    },
  };
  withStorage({ level: 9, unlocked: ['steve'], ...retired });
  const loaded = loadSave();
  for (const [key, value] of Object.entries(retired)) assert.deepEqual(loaded[key], value, `${key} loads opaque`);

  const transferred = importSave(exportSave(loaded));
  for (const [key, value] of Object.entries(retired)) assert.deepEqual(transferred[key], value, `${key} transfers opaque`);
});

test('an import preserves the exact prior save in the rollback slot', () => {
  withStorage({ emeralds: 55, level: 4, unlocked: ['steve'] });
  const before = localStorage.getItem('craftrush_save_v1');
  const incoming = loadSave();
  incoming.emeralds = 9876;
  incoming.level = 7;

  assert.ok(importSave(exportSave(incoming)));
  const rollback = JSON.parse(localStorage.getItem('craftrush_pre_restore_v1'));
  assert.equal(rollback.raw, before);
  assert.equal(JSON.parse(localStorage.getItem('craftrush_save_v1')).emeralds, 9876);
});

test('an invalid backup code is rejected', () => {
  withStorage(null);
  assert.equal(importSave('not a real code'), null);
  assert.equal(importSave('CR1|@@@notbase64@@@'), null);
});

test('resetSave clears storage so defaults return', () => {
  withStorage({ emeralds: 500, level: 9 });
  resetSave();
  const s = loadSave();
  assert.equal(s.emeralds, 0);
  assert.equal(s.level, 1);
});

test('a corrupt save falls back to defaults instead of throwing', () => {
  const store = { 'craftrush_save_v1': '{not valid json' };
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: () => {} };
  assert.doesNotThrow(() => {
    const s = loadSave();
    assert.equal(s.level, 1);
  });
});

test('loadSave adds mastery to old saves and repairs malformed mastery in place', () => {
  withStorage({ level: 5, emeralds: 91 });
  assert.deepEqual(loadSave().mastery, { chapters: {} });

  withStorage({
    level: 5,
    emeralds: 91,
    mastery: {
      chapters: {
        portal: {
          bestGrade: 'Z',
          bestCrowd: 'many',
          badges: ['untouched', 'clean_line', 'clean_line', 7],
        },
        stronghold: {
          bestGrade: 7,
          bestCrowd: 12,
          badges: [],
        },
        fortress: 'broken',
      },
    },
  });
  const repaired = loadSave();
  assert.equal(repaired.level, 5);
  assert.equal(repaired.emeralds, 91);
  assert.deepEqual(repaired.mastery.chapters.portal, {
    bestGrade: 'Z',
    bestCrowd: 0,
    badges: ['clean_line', 'untouched'],
  });
  assert.deepEqual(repaired.mastery.chapters.stronghold, {
    bestGrade: null,
    bestCrowd: 12,
    badges: [],
  });
  assert.deepEqual(repaired.mastery.chapters.fortress, {
    bestGrade: null,
    bestCrowd: 0,
    badges: [],
  });

  withStorage({ level: 5, mastery: [] });
  assert.deepEqual(loadSave().mastery, { chapters: {} });
});
