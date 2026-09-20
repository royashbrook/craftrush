import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import * as safety from '../js/pwa-safety.ts';
import { finishRunSettlement } from '../js/settlement.ts';

const key = 'craftrush_save_v1';
const backupsKey = 'craftrush_backups_v1';
const rollbackKey = 'craftrush_pre_restore_v1';
let instance = 0;
async function freshRuntime() {
  const path = process.env.SAVE_RUNTIME || '../js/config.ts';
  const url = process.env.SAVE_RUNTIME ? pathToFileURL(resolve(path)) : new URL(path, import.meta.url);
  return import(`${url.href}?save-owner=${++instance}`);
}
function storage(raw, failure) {
  const values = new Map(raw === null ? [] : [[key, raw]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => { if (failure === 'read') throw new Error('blocked'); return values.get(k) ?? null; },
    setItem: (k, v) => { if (failure === 'write') throw new Error('full'); values.set(k, String(v)); },
    removeItem: k => values.delete(k),
  } });
  return values;
}

test('boot and subsequent saves never replace unreadable JSON', async () => {
  const raw = '{precious unfinished save';
  const values = storage(raw);
  const runtime = await freshRuntime();
  const save = runtime.loadSave();
  runtime.persistSave(save);
  save.emeralds += 20;
  runtime.persistSave(save);
  assert.equal(values.get(key), raw);
});

test('a structurally invalid save is preserved instead of normalised over', async () => {
  const raw = JSON.stringify({ level: 4, stats: null, campaign: { done: 123 } });
  const values = storage(raw);
  const runtime = await freshRuntime();
  const save = runtime.loadSave();
  runtime.persistSave(save);
  assert.equal(values.get(key), raw);
});

test('a stale page cannot overwrite a save adopted in another page', async () => {
  const values = storage(JSON.stringify({ level: 3, emeralds: 10 }));
  const runtime = await freshRuntime();
  const save = runtime.loadSave();
  const replacement = JSON.stringify({ level: 12, emeralds: 300 });
  values.set(key, replacement);
  save.emeralds += 20;
  runtime.persistSave(save);
  assert.equal(values.get(key), replacement);
});

test('failed persistence is observable instead of silently reporting success', async () => {
  storage(null, 'write');
  const runtime = await freshRuntime();
  assert.equal(runtime.persistSave(runtime.loadSave()), false);
});

for (const operation of ['import', 'reset']) {
  test(`${operation} retires the old page before its delayed reload`, async () => {
    const values = storage(JSON.stringify({ level: 3, emeralds: 10 }));
    const runtime = await freshRuntime();
    const stale = runtime.loadSave();
    values.set(backupsKey, '[]');
    if (operation === 'import') {
      assert.ok(runtime.importSave(runtime.exportSave({ level: 12, emeralds: 1000 })));
    } else assert.equal(runtime.resetSave(), true);
    const adopted = values.get(key);
    stale.camera = 'overhead';
    assert.equal(runtime.persistSave(stale), false);
    assert.deepEqual(runtime.writeBackup(stale), []);
    assert.equal(values.get(key), adopted);
    assert.equal(values.get(backupsKey), '[]');
    assert.equal(runtime.getSaveStatus(), 'replaced');
    const loaded = runtime.loadSave();
    assert.equal(loaded.level, operation === 'import' ? 12 : 1);
    assert.equal(runtime.persistSave(loaded), true, 'fresh load owns the replacement');
  });
}

test('an unreadable storage read is not permission to write a default save', async () => {
  const raw = JSON.stringify({ level: 7, emeralds: 300 });
  const values = storage(raw, 'read');
  const runtime = await freshRuntime();
  assert.equal(runtime.persistSave(runtime.loadSave()), false);
  assert.equal(runtime.getSaveStatus(), 'blocked');
  assert.equal(values.get(key), raw);
});

test('an import cannot replace live bytes if its rollback write fails', async () => {
  const raw = '{unreadable but still owned';
  const values = storage(raw);
  const before = JSON.stringify({ ts: 1, raw: 'older rollback' });
  values.set(rollbackKey, before);
  const set = localStorage.setItem;
  localStorage.setItem = (k, v) => {
    if (k === rollbackKey) throw new Error('rollback quota');
    set(k, v);
  };
  const runtime = await freshRuntime();
  assert.equal(runtime.importSave(runtime.exportSave({ level: 8, emeralds: 1 })), null);
  assert.equal(values.get(key), raw);
  assert.equal(values.get(rollbackKey), before);
});

test('an import verifies rollback bytes instead of trusting a silent write', async () => {
  const raw = JSON.stringify({ level: 7, emeralds: 300 });
  const values = storage(raw);
  const set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k !== rollbackKey) set(k, v); };
  const runtime = await freshRuntime();
  assert.equal(runtime.importSave(runtime.exportSave({ level: 8, emeralds: 1 })), null);
  assert.equal(values.get(key), raw);
});

test('a failed import write retains the prior save and independent daily backups', async () => {
  const raw = JSON.stringify({ level: 7, emeralds: 300 });
  const values = storage(raw);
  const daily = '[{"retained":"opaque bytes"}]';
  values.set(backupsKey, daily);
  const set = localStorage.setItem;
  localStorage.setItem = (k, v) => {
    if (k === key) throw new Error('live save quota');
    set(k, v);
  };
  const runtime = await freshRuntime();
  assert.equal(runtime.importSave(runtime.exportSave({ level: 8, emeralds: 1 })), null);
  assert.equal(values.get(key), raw);
  assert.equal(JSON.parse(values.get(rollbackKey)).raw, raw);
  assert.equal(values.get(backupsKey), daily);
});

test('reset reports failed removal and preserves backups', async () => {
  const raw = JSON.stringify({ level: 7, emeralds: 300 });
  const values = storage(raw);
  values.set(backupsKey, 'daily bytes');
  values.set(rollbackKey, 'rollback bytes');
  localStorage.removeItem = () => {};
  const runtime = await freshRuntime();
  runtime.loadSave();
  assert.equal(runtime.resetSave(), false);
  assert.equal(values.get(key), raw);
  assert.equal(values.get(backupsKey), 'daily bytes');
  assert.equal(values.get(rollbackKey), 'rollback bytes');
});

test('corrupt daily backups are retained rather than replaced with a fresh list', async () => {
  const values = storage(null);
  values.set(backupsKey, '{owned damaged backup bytes');
  const runtime = await freshRuntime();
  assert.deepEqual(runtime.writeBackup(runtime.loadSave()), []);
  assert.equal(values.get(backupsKey), '{owned damaged backup bytes');
  assert.equal(runtime.getSaveStatus(), 'backup-failed');
});

test('refused stale progress cannot overwrite the current owner\'s daily backup', async () => {
  const values = storage(JSON.stringify({ level: 3, emeralds: 10 }));
  const runtime = await freshRuntime();
  const stale = runtime.loadSave();
  const now = Date.UTC(2026, 8, 19, 12);
  const newer = { level: 12, emeralds: 800 };
  const daily = JSON.stringify([{
    day: runtime.dayStamp(now), ts: now, ...newer, code: runtime.exportSave(newer),
  }]);
  values.set(key, JSON.stringify(newer));
  values.set(backupsKey, daily);
  stale.emeralds += 5;
  assert.equal(runtime.persistSave(stale), false);
  // The real win-settlement caller attempts this even after persistence refuses.
  runtime.writeBackup(stale, now);
  assert.equal(values.get(backupsKey), daily);
  assert.equal(runtime.getSaveStatus(), 'conflict');
});

test('refused corrupt-save defaults cannot replace a recoverable daily backup', async () => {
  const values = storage('{broken main slot');
  const runtime = await freshRuntime();
  const defaults = runtime.loadSave();
  const now = Date.UTC(2026, 8, 19, 12);
  const recoverable = { level: 12, emeralds: 800 };
  const daily = JSON.stringify([{
    day: runtime.dayStamp(now), ts: now, ...recoverable, code: runtime.exportSave(recoverable),
  }]);
  values.set(backupsKey, daily);
  assert.equal(runtime.persistSave(defaults), false);
  runtime.writeBackup(defaults, now);
  assert.equal(values.get(backupsKey), daily);
  assert.equal(runtime.getSaveStatus(), 'corrupt');
});

test('a direct daily backup checks ownership even before persistence detects a stale tab', async () => {
  const values = storage(JSON.stringify({ level: 3, emeralds: 10 }));
  const runtime = await freshRuntime();
  const stale = runtime.loadSave();
  values.set(key, JSON.stringify({ level: 12, emeralds: 800 }));
  values.set(backupsKey, '[]');
  runtime.writeBackup(stale);
  assert.equal(values.get(backupsKey), '[]');
  assert.equal(runtime.getSaveStatus(), 'conflict');
});

test('winning settlement requires confirmed persistence before writing a daily backup', async () => {
  for (const acknowledgement of [false, undefined]) {
    storage(null);
    const runtime = await freshRuntime();
    const save = runtime.loadSave();
    let backedUp = 0;
    const settled = finishRunSettlement(save, {
      id: `refused-${acknowledgement}`, win: true, level: 1, emeralds: 50,
      emeraldMul: 1, rods: 0, kills: 0, bestCrowd: 3,
      biome: 'Plains', biomeId: 'plains', mode: 'shooter', expedition: null, chapter: null,
    }, {
      persist: () => acknowledgement,
      backup: () => { backedUp++; },
    });
    assert.equal(settled.applied, true);
    assert.equal(save.emeralds, 50, 'unsaved progress remains available for export');
    assert.equal(backedUp, 0, `persist returned ${acknowledgement}`);
  }
});

// This invokes the real rescue entry event handlers with small DOM/storage
// doubles. It pins data and message decisions, not native browser lifecycle/UI.
function rescueHarness({ confirm = () => true, clipboard } = {}) {
  const elements = new Map();
  function element() {
    let text = '';
    let children = [];
    return {
      value: '', hidden: false, disabled: false, handlers: new Map(),
      get textContent() { return text + children.map(child => child.textContent).join(''); },
      set textContent(value) { text = value; children = []; },
      get innerHTML() { return text; },
      set innerHTML(value) { text = value; children = []; },
      replaceChildren(...items) { children = items; text = ''; },
      append(...items) { children.push(...items); },
      addEventListener(type, handler) { this.handlers.set(type, handler); },
      querySelector() { return null; },
      focus() {}, select() {}, setSelectionRange() {}, scrollIntoView() {},
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const document = {
    getElementById: get, createElement: element,
    createTextNode: textContent => ({ textContent }), execCommand: () => false,
  };
  const entry = process.env.RESCUE_RUNTIME
    ? resolve(process.env.RESCUE_RUNTIME) : new URL('../js/rescue-entry.ts', import.meta.url);
  const source = readFileSync(entry, 'utf8');
  const compiled = transpileModule(source, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.CommonJS },
  }).outputText;
  const navigator = { clipboard };
  const location = { hash: '', pathname: '/rescue', search: '', href: 'https://craftrush.royashbrook.com/rescue' };
  runInNewContext(compiled, {
    exports: {}, document, navigator, window: { navigator }, location,
    localStorage, confirm, console, URL, Blob, atob, btoa,
    require: name => {
      if (name === 'qrcode') return { default: {} };
      if (name.includes('pwa-safety.')) return safety;
      if (name.includes('savecode.')) return { codeFromHash: () => null };
      throw new Error(`Unexpected rescue dependency: ${name}`);
    },
  });
  return { get, click: id => get(id).handlers.get('click')() };
}

test('rescue refuses restore when the current save cannot be read', async () => {
  const raw = JSON.stringify({ level: 12, emeralds: 800 });
  const values = storage(raw, 'read');
  const rescue = rescueHarness();
  rescue.get('restoreBox').value = JSON.stringify({ level: 3, emeralds: 2 });
  await rescue.click('restore');
  assert.equal(values.get(key), raw, 'read failure is not an empty save');
  assert.doesNotMatch(rescue.get('msg2').textContent, /^Restored\./);
});

test('unsafe level representations cannot replace or overwrite recoverable saves', async () => {
  for (const level of [1e100, Number.MAX_SAFE_INTEGER + 1]) {
    const raw = JSON.stringify({ level: 7, emeralds: 300 });
    const values = storage(raw);
    const runtime = await freshRuntime();
    assert.equal(runtime.importSave(runtime.exportSave({ level })), null);
    assert.equal(values.get(key), raw);
    const rescue = rescueHarness();
    rescue.get('restoreBox').value = JSON.stringify({ level });
    await rescue.click('restore');
    assert.equal(values.get(key), raw);
    assert.doesNotMatch(rescue.get('msg2').textContent, /^Restored\./);
    const unsafe = JSON.stringify({ level, emeralds: 300 });
    values.set(key, unsafe);
    const loaded = runtime.loadSave();
    assert.equal(runtime.getSaveStatus(), 'corrupt');
    assert.equal(runtime.persistSave(loaded), false);
    assert.equal(values.get(key), unsafe, 'invalid legacy bytes stay available for recovery');
  }
});

test('rescue re-read failing after confirmation leaves the confirmed save untouched', async () => {
  const raw = JSON.stringify({ level: 12, emeralds: 800 });
  const values = storage(raw);
  const rescue = rescueHarness({ confirm: () => {
    localStorage.getItem = () => { throw new Error('storage became unavailable'); };
    return true;
  } });
  rescue.get('restoreBox').value = JSON.stringify({ level: 3, emeralds: 2 });
  await rescue.click('restore');
  assert.equal(values.get(key), raw, 'post-confirmation read failure must stop replacement');
});

test('rescue success preserves exact current bytes and does not consume daily backups', async () => {
  const raw = '{corrupt current slot still belongs to the player';
  const values = storage(raw);
  values.set(backupsKey, '[]');
  const rescue = rescueHarness();
  const incoming = JSON.stringify({ level: 3, emeralds: 2 });
  rescue.get('restoreBox').value = incoming;
  await rescue.click('restore');
  assert.equal(values.get(key), incoming);
  assert.equal(JSON.parse(values.get(rollbackKey)).raw, raw);
  assert.equal(values.get(backupsKey), '[]');
  assert.match(rescue.get('msg2').textContent, /^Restored\./);
});

test('rescue aborts replacement if rollback cannot be verified', async () => {
  const raw = JSON.stringify({ level: 12, emeralds: 800 });
  const values = storage(raw);
  const set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k !== rollbackKey) set(k, v); };
  const rescue = rescueHarness();
  rescue.get('restoreBox').value = JSON.stringify({ level: 3, emeralds: 2 });
  await rescue.click('restore');
  assert.equal(values.get(key), raw);
  assert.match(rescue.get('msg2').textContent, /Nothing was replaced/);
});

test('rescue copy does not claim success before the clipboard promise succeeds', async () => {
  storage(JSON.stringify({ level: 12, emeralds: 800 }));
  let resolveCopy;
  const pending = new Promise(resolve => { resolveCopy = resolve; });
  const rescue = rescueHarness({ clipboard: { writeText: () => pending } });
  const clicked = rescue.click('copy');
  const before = rescue.get('msg1').textContent;
  resolveCopy();
  await clicked;
  assert.doesNotMatch(before, /Copied\./, 'a pending clipboard write is not a backup');
  assert.match(rescue.get('msg1').textContent, /Copied\./);
});

test('rescue clipboard rejection leaves manual recovery available without false success', async () => {
  const raw = JSON.stringify({ level: 12, emeralds: 800 });
  storage(raw);
  const denied = Promise.reject(new Error('clipboard permission denied'));
  // Keep the legacy unobserved rejection from ending the whole test process.
  denied.catch(() => {});
  const rescue = rescueHarness({ clipboard: { writeText: () => denied } });
  await rescue.click('copy');
  assert.doesNotMatch(rescue.get('msg1').textContent, /Copied\./);
  assert.match(rescue.get('msg1').textContent, /copy.*by hand|select the text/i);
  assert.equal(rescue.get('box').value, raw);
});
