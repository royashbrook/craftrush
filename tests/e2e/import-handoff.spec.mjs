import { test, expect } from '@playwright/test';

const SAVE_KEY = 'craftrush_save_v1';
const ROLLBACK_KEY = 'craftrush_pre_restore_v1';
const arriving = { level: 12, emeralds: 1000, camera: 'close' };

test('a normal settings change during the import handoff cannot replace the restored save', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    if (sessionStorage.getItem('import_handoff_seeded')) return;
    localStorage.setItem(key, JSON.stringify({ level: 3, emeralds: 10, camera: 'far' }));
    sessionStorage.setItem('import_handoff_seeded', '1');
  }, { key: SAVE_KEY });
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.locator('#navMore').click();
  await page.locator('#btnSaveMore').click();
  const before = await page.evaluate(key => ({
    raw: localStorage.getItem(key), boot: performance.timeOrigin,
  }), SAVE_KEY);
  const code = `CR1|${Buffer.from(JSON.stringify(arriving)).toString('base64')}`;
  await page.locator('#saveImport').fill(code);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#btnLoadSave').click();

  // These are ordinary user clicks during the existing reload delay. Do not
  // replace timers, stop navigation, call commit directly, or replace the store.
  await page.locator('#navMore').click();
  await page.locator('#btnCameraMore').click();
  const pending = await page.evaluate(({ key, rollbackKey }) => ({
    boot: performance.timeOrigin,
    memory: { level: window.CR.save.level, camera: window.CR.save.camera },
    stored: JSON.parse(localStorage.getItem(key)),
    rollback: JSON.parse(localStorage.getItem(rollbackKey)).raw,
  }), { key: SAVE_KEY, rollbackKey: ROLLBACK_KEY });
  expect(pending.boot).toBe(before.boot);
  expect(pending.memory).toEqual({ level: 3, camera: 'overhead' });
  expect(pending.stored).toMatchObject(arriving);
  expect(pending.rollback).toBe(before.raw);

  await expect.poll(() => page.evaluate(() => performance.timeOrigin)).not.toBe(before.boot);
  await page.locator('#btnPlayShooter').waitFor();
  const restored = await page.evaluate(key => ({
    memory: { level: window.CR.save.level, emeralds: window.CR.save.emeralds, camera: window.CR.save.camera },
    stored: JSON.parse(localStorage.getItem(key)),
  }), SAVE_KEY);
  expect(restored.memory).toEqual(arriving);
  expect(restored.stored).toMatchObject(arriving);
});
