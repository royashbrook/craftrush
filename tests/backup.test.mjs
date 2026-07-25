import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeBackup, listBackups, restoreBackup, dayStamp, MAX_BACKUPS } from '../js/config.js';

function freshStorage() {
  const store = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
  return store;
}

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 6, 23, 12, 0, 0); // a fixed noon so day math is stable

test('dayStamp is the calendar day', () => {
  assert.equal(dayStamp(T0), '2026-07-23');
  assert.equal(dayStamp(T0 + DAY), '2026-07-24');
});

test('a backup captures the save and can be restored', () => {
  freshStorage();
  const s = loadSave();
  s.level = 7; s.emeralds = 1234;
  writeBackup(s, T0);
  const list = listBackups();
  assert.equal(list.length, 1);
  assert.equal(list[0].level, 7);
  assert.equal(list[0].emeralds, 1234);
  const restored = restoreBackup('2026-07-23');
  assert.equal(restored.level, 7);
  assert.equal(restored.emeralds, 1234);
});

test('a second backup the same day overwrites, it does not pile up', () => {
  freshStorage();
  const s = loadSave();
  s.level = 2; writeBackup(s, T0);
  s.level = 5; writeBackup(s, T0 + 3600 * 1000); // later the same day
  const list = listBackups();
  assert.equal(list.length, 1, 'one entry per day');
  assert.equal(list[0].level, 5, 'keeps the newer progress');
});

test('different days each keep an entry, newest first', () => {
  freshStorage();
  const s = loadSave();
  s.level = 1; writeBackup(s, T0);
  s.level = 2; writeBackup(s, T0 + DAY);
  s.level = 3; writeBackup(s, T0 + 2 * DAY);
  const list = listBackups();
  assert.equal(list.length, 3);
  assert.equal(list[0].level, 3, 'newest first');
  assert.equal(list[2].level, 1);
});

test('old backups are pruned to the cap', () => {
  freshStorage();
  const s = loadSave();
  for (let i = 0; i < MAX_BACKUPS + 4; i++) { s.level = i + 1; writeBackup(s, T0 + i * DAY); }
  const list = listBackups();
  assert.equal(list.length, MAX_BACKUPS);
  assert.equal(list[0].level, MAX_BACKUPS + 4, 'newest kept');
});

test('restoring a day that has no backup returns null', () => {
  freshStorage();
  assert.equal(restoreBackup('1999-01-01'), null);
});

test('a fresh save has music and effects on independently', () => {
  freshStorage();
  const s = loadSave();
  assert.equal(s.music, true);
  assert.equal(s.sfx, true);
});
