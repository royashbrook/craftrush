import { test, expect } from '@playwright/test';

const SAVE_KEY = 'craftrush_save_v1';
const ROLLBACK_KEY = 'craftrush_pre_restore_v1';
const arriving = { level: 12, emeralds: 1000, camera: 'close' };

test('rapid DOM control activation during import cannot replace the restored save', async ({ page }) => {
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

  // Native pointer clicks independently reproduced the original loss, but CI
  // driver round trips can let the real 700ms reload win before the last click.
  // This is deliberately synthetic rapid DOM control activation, not a native
  // input test. Run the real handlers in one renderer task, flushing Svelte's
  // microtask before using its newly rendered camera control. Timers, reload,
  // the save/store, and commit are not overridden or called directly.
  const [, pending] = await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.evaluate(async ({ key, rollbackKey }) => {
      const activate = selector => {
        const button = document.querySelector(selector);
        if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing control: ${selector}`);
        button.click();
      };
      activate('#btnLoadSave');
      const imported = JSON.parse(localStorage.getItem(key));
      activate('#navMore');
      await Promise.resolve();
      activate('#btnCameraMore');
      return {
        boot: performance.timeOrigin,
        imported,
        memory: { level: window.CR.save.level, camera: window.CR.save.camera },
        stored: JSON.parse(localStorage.getItem(key)),
        rollback: JSON.parse(localStorage.getItem(rollbackKey)).raw,
      };
    }, { key: SAVE_KEY, rollbackKey: ROLLBACK_KEY }),
  ]);
  expect(pending.boot).toBe(before.boot);
  expect(pending.imported).toMatchObject(arriving);
  expect(pending.memory).toEqual({ level: 3, camera: 'overhead' });
  expect(pending.stored).toMatchObject(arriving);
  expect(pending.rollback).toBe(before.raw);

  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(before.boot);
  await page.locator('#btnPlayShooter').waitFor();
  const restored = await page.evaluate(key => ({
    memory: { level: window.CR.save.level, emeralds: window.CR.save.emeralds, camera: window.CR.save.camera },
    stored: JSON.parse(localStorage.getItem(key)),
  }), SAVE_KEY);
  expect(restored.memory).toEqual(arriving);
  expect(restored.stored).toMatchObject(arriving);
});
