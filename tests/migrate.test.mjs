import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { consumeMigration, takePendingToast } from '../js/migrate.js';

const INBOX_KEY = 'craftrush_migration_inbox_v1';
const DONE_KEY = 'craftrush_migration_done_v1';
const TOAST_KEY = 'craftrush_migration_toast_v1';
const SAVE_KEY = 'craftrush_save_v1';
const BACKUP_KEY = 'craftrush_backups_v1';
const ROLLBACK_KEY = 'craftrush_pre_restore_v1';

class MemoryStorage {
  constructor(seed = {}) {
    this.data = new Map(Object.entries(seed));
    this.failGet = new Set();
    this.failSet = new Set();
    this.failRemove = new Set();
  }

  getItem(key) {
    if (this.failGet.has(key)) throw new Error(`get blocked: ${key}`);
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSet.has(key)) throw new Error(`set blocked: ${key}`);
    this.data.set(key, String(value));
  }

  removeItem(key) {
    if (this.failRemove.has(key)) throw new Error(`remove blocked: ${key}`);
    this.data.delete(key);
  }
}

const saveCode = (save) =>
  `CR1|${Buffer.from(JSON.stringify(save), 'utf8').toString('base64')}`;
const inbox = (save, backups) =>
  JSON.stringify({ s: saveCode(save), ...(backups ? { b: backups } : {}) });
const useStorage = (seed = {}) => {
  const storage = new MemoryStorage(seed);
  globalThis.localStorage = storage;
  return storage;
};

afterEach(() => {
  delete globalThis.localStorage;
});

test('an empty destination adopts a valid save and leaves a recoverable snapshot', () => {
  const arriving = { level: 6, emeralds: 321, unlocked: ['alex'] };
  const code = saveCode(arriving);
  const storage = useStorage({ [INBOX_KEY]: JSON.stringify({ s: code }) });

  const result = consumeMigration();

  assert.equal(result.adopted, true);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).level, 6);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).emeralds, 321);
  const backups = JSON.parse(storage.getItem(BACKUP_KEY));
  assert.equal(backups.length, 1);
  assert.match(backups[0].day, /^moved-\d{4}-\d{2}-\d{2}$/);
  assert.equal(backups[0].code, code);
  assert.equal(storage.getItem(INBOX_KEY), null);
  assert.match(storage.getItem(DONE_KEY), /^save-/);
  assert.equal(takePendingToast(), 'YOUR GAME CAME WITH YOU!');
  assert.equal(takePendingToast(), null);
});

test('an existing save is never overwritten and the arriving save becomes a backup', () => {
  const current = '{"level":9,"emeralds":4242,"keep":"these exact bytes"}';
  const arriving = { level: 3, emeralds: 77 };
  const code = saveCode(arriving);
  const storage = useStorage({
    [SAVE_KEY]: current,
    [INBOX_KEY]: JSON.stringify({ s: code }),
  });

  const result = consumeMigration();

  assert.equal(result.adopted, false);
  assert.match(result.message, /ALREADY HAD A GAME/);
  assert.equal(storage.getItem(SAVE_KEY), current);
  assert.equal(storage.getItem(ROLLBACK_KEY), null);
  assert.equal(JSON.parse(storage.getItem(BACKUP_KEY))[0].code, code);
  assert.equal(storage.getItem(INBOX_KEY), null);
});

test('malformed payloads and unplayable save codes cannot write save data', async (t) => {
  const cases = [
    ['not JSON', '{'],
    ['missing save code', JSON.stringify({ b: [] })],
    ['wrong transfer prefix', JSON.stringify({ s: 'XX1|abcd' })],
    ['invalid base64', JSON.stringify({ s: 'CR1|not-base64!' })],
    ['invalid save schema', inbox({ level: 'six', emeralds: 10 })],
  ];

  for (const [name, raw] of cases) {
    await t.test(name, () => {
      const storage = useStorage({ [INBOX_KEY]: raw });
      const result = consumeMigration();
      assert.equal(result.adopted, false);
      assert.match(result.message, /DID NOT TRANSFER/);
      assert.equal(storage.getItem(SAVE_KEY), null);
      assert.equal(storage.getItem(BACKUP_KEY), null);
      assert.equal(storage.getItem(INBOX_KEY), null);
    });
  }
});

test('destination backups win collisions and only validated source backups cross origins', () => {
  const arriving = { level: 8, emeralds: 800 };
  const oldDaily = {
    day: '2026-07-20',
    ts: 1,
    level: 10,
    emeralds: 1000,
    code: saveCode({ level: 10, emeralds: 1000 }),
  };
  const validSource = {
    day: '2026-07-21',
    ts: 2,
    level: 999,
    emeralds: 999,
    code: saveCode({ level: 2, emeralds: 20 }),
  };
  const storage = useStorage({
    [INBOX_KEY]: inbox(arriving, [
      { ...validSource, day: oldDaily.day },
      validSource,
      { day: '2026-07-22', code: saveCode({ level: 'broken' }) },
      { day: '<img onerror=alert(1)>', code: 'CR1|broken' },
    ]),
    [BACKUP_KEY]: JSON.stringify([oldDaily]),
  });

  assert.equal(consumeMigration().adopted, true);
  const backups = JSON.parse(storage.getItem(BACKUP_KEY));

  assert.equal(backups[0].code, saveCode(arriving));
  assert.deepEqual(backups.find((entry) => entry.day === oldDaily.day), oldDaily);
  assert.equal(backups.find((entry) => entry.day === validSource.day).level, 2);
  assert.equal(backups.find((entry) => entry.day === validSource.day).emeralds, 20);
  assert.equal(backups.some((entry) => entry.day === '2026-07-22'), false);
  assert.equal(backups.some((entry) => String(entry.day).includes('<img')), false);
});

test('replaying a completed handoff is idempotent even without its done marker', () => {
  const arriving = { level: 5, emeralds: 55 };
  const rawInbox = inbox(arriving);
  const storage = useStorage({ [INBOX_KEY]: rawInbox });

  assert.equal(consumeMigration().adopted, true);
  const live = storage.getItem(SAVE_KEY);
  const backups = storage.getItem(BACKUP_KEY);
  storage.removeItem(DONE_KEY);
  storage.setItem(INBOX_KEY, rawInbox);

  assert.equal(consumeMigration(), null);
  assert.equal(storage.getItem(SAVE_KEY), live);
  assert.equal(storage.getItem(BACKUP_KEY), backups);
  assert.equal(storage.getItem(ROLLBACK_KEY), null);
  assert.equal(storage.getItem(INBOX_KEY), null);
});

test('an invalid handoff is reported once even when inbox removal fails', () => {
  const rawInbox = '{"s":"CR1|broken"}';
  const storage = useStorage({ [INBOX_KEY]: rawInbox });
  storage.failRemove.add(INBOX_KEY);

  assert.match(consumeMigration().message, /DID NOT TRANSFER/);
  assert.equal(storage.getItem(INBOX_KEY), rawInbox);
  assert.equal(consumeMigration(), null);
  assert.match(storage.getItem(DONE_KEY), /^invalid-/);
});

test('storage failures retain the only actionable inbox and never replace live bytes', async (t) => {
  await t.test('save-slot read failure', () => {
    const storage = useStorage({ [INBOX_KEY]: inbox({ level: 2 }) });
    storage.failGet.add(SAVE_KEY);

    const result = consumeMigration();
    assert.equal(result.adopted, false);
    assert.match(result.message, /COULD NOT CHECK/);
    assert.notEqual(storage.data.get(INBOX_KEY), undefined);
    assert.equal(storage.data.get(SAVE_KEY), undefined);
  });

  await t.test('save-slot write failure', () => {
    const rawInbox = inbox({ level: 2 });
    const storage = useStorage({ [INBOX_KEY]: rawInbox });
    storage.failSet.add(SAVE_KEY);

    assert.equal(consumeMigration().adopted, false);
    assert.equal(storage.getItem(INBOX_KEY), rawInbox);
    assert.equal(storage.getItem(SAVE_KEY), null);
  });

  await t.test('backup read failure beside an existing save', () => {
    const current = '{"level":11,"emeralds":110}';
    const rawInbox = inbox({ level: 2 });
    const storage = useStorage({ [SAVE_KEY]: current, [INBOX_KEY]: rawInbox });
    storage.failGet.add(BACKUP_KEY);

    assert.equal(consumeMigration().adopted, false);
    assert.equal(storage.getItem(SAVE_KEY), current);
    assert.equal(storage.getItem(INBOX_KEY), rawInbox);
  });

  await t.test('backup write failure beside an existing save', () => {
    const current = '{"level":11,"emeralds":110}';
    const priorBackups = JSON.stringify([{
      day: '2026-07-01',
      code: saveCode({ level: 10 }),
    }]);
    const rawInbox = inbox({ level: 2 });
    const storage = useStorage({
      [SAVE_KEY]: current,
      [BACKUP_KEY]: priorBackups,
      [INBOX_KEY]: rawInbox,
    });
    storage.failSet.add(BACKUP_KEY);

    const result = consumeMigration();
    assert.match(result.message, /COULD NOT SAVE/);
    assert.equal(storage.getItem(SAVE_KEY), current);
    assert.equal(storage.getItem(BACKUP_KEY), priorBackups);
    assert.equal(storage.getItem(INBOX_KEY), rawInbox);
  });

  await t.test('failed marker and inbox cleanup after adoption', () => {
    const rawInbox = inbox({ level: 7, emeralds: 70 });
    const storage = useStorage({ [INBOX_KEY]: rawInbox });
    storage.failSet.add(DONE_KEY);
    storage.failRemove.add(INBOX_KEY);

    assert.equal(consumeMigration().adopted, true);
    const live = storage.getItem(SAVE_KEY);
    const backups = storage.getItem(BACKUP_KEY);
    assert.equal(storage.getItem(INBOX_KEY), rawInbox);

    storage.failSet.clear();
    storage.failRemove.clear();
    assert.equal(consumeMigration(), null);
    assert.equal(storage.getItem(SAVE_KEY), live);
    assert.equal(storage.getItem(BACKUP_KEY), backups);
    assert.equal(storage.getItem(INBOX_KEY), null);
  });
});
