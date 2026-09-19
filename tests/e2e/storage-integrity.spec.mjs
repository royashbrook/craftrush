import { test, expect } from '@playwright/test';

const SAVE_KEY = 'craftrush_save_v1';
const ROLLBACK_KEY = 'craftrush_pre_restore_v1';
const INITIAL = JSON.stringify({
  level: 3, bestLevel: 3, emeralds: 177, camera: 'far', speed: 'normal',
  unlocked: ['steve'], campaign: { done: [] },
});
const decodeCode = (code) => JSON.parse(Buffer.from(code.replace(/^CR1\|/, ''), 'base64').toString('utf8'));

async function seed(context, raw = INITIAL, failure = null) {
  await context.addInitScript(({ raw, failure, key }) => {
    const boots = Number(sessionStorage.getItem('storage_probe_boots') || 0) + 1;
    sessionStorage.setItem('storage_probe_boots', String(boots));
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    if (failure === 'write') {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return set.call(this, name, value);
      };
    }
    if (failure === 'remove-throw' || failure === 'remove-noop') {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (name) {
        if (name === key) {
          if (failure === 'remove-throw') throw new DOMException('Storage is unavailable.', 'SecurityError');
          return;
        }
        return remove.call(this, name);
      };
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedSave = text; } },
    });
  }, { raw, failure, key: SAVE_KEY });
}

async function open(page) {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
}

async function settings(page) {
  await page.locator('#navMore').click();
  await page.locator('#btnSaveMore').click();
  await expect(page.locator('#settings')).toBeVisible();
}

async function primary(page) {
  return page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
}

async function exported(page) {
  await page.locator('#btnCopySave').click();
  await expect(page.locator('#setMsg')).toContainText('Copied!');
  return decodeCode(await page.evaluate(() => window.__copiedSave));
}

test('corrupt primary bytes survive boot and a normal settings commit with recovery visible', async ({ page, context }) => {
  const corrupt = '{"level":9,"emeralds":4242,"unfinished":';
  await seed(context, corrupt);
  await open(page);
  expect(await primary(page)).toBe(corrupt);
  await expect(page.locator('#saveWarning')).toBeVisible();
  await expect(page.locator('#saveWarning a[href$="rescue.html"]')).toBeVisible();

  await page.locator('#navMore').click();
  await page.locator('#btnCameraMore').click();
  await expect(page.locator('#cameraLabel')).toContainText('OVERHEAD');
  expect(await primary(page)).toBe(corrupt);
  await expect(page.locator('#saveWarning')).toBeVisible();
});

test('write failure remains visible and export contains the current in-memory choice', async ({ page, context }) => {
  await seed(context, INITIAL, 'write');
  await open(page);
  await expect(page.locator('#saveWarning')).toBeVisible();
  expect(await primary(page)).toBe(INITIAL);

  await page.locator('#navMore').click();
  await page.locator('#btnCameraMore').click();
  await expect(page.locator('#cameraLabel')).toContainText('OVERHEAD');
  await page.locator('#btnSaveMore').click();
  const code = await exported(page);
  expect(code.camera).toBe('overhead');
  expect(code.level).toBe(3);
  expect(code.emeralds).toBe(177);
  expect(await primary(page)).toBe(INITIAL);
  await expect(page.locator('#saveWarning')).toBeVisible();
});

test('a stale tab cannot overwrite another tab’s completed save', async ({ page, context }) => {
  await seed(context);
  await open(page);
  const second = await context.newPage();
  await open(second);
  await second.locator('#navMore').click();
  await second.locator('#btnSpeedMore').click();
  const external = await primary(second);
  expect(JSON.parse(external).speed).not.toBe('normal');

  await page.locator('#navMore').click();
  await page.locator('#btnCameraMore').click();
  await expect(page.locator('#cameraLabel')).toContainText('OVERHEAD');
  expect(await primary(page)).toBe(external);
  await expect(page.locator('#saveWarning')).toBeVisible();
  await page.locator('#btnSaveMore').click();
  const current = await exported(page);
  expect(current.camera).toBe('overhead');
  expect(current.speed).toBe('normal');
  expect(await primary(second)).toBe(external);
});

for (const failure of ['remove-throw', 'remove-noop']) {
  test(`a reset whose deletion ${failure === 'remove-throw' ? 'throws' : 'retains the slot'} stays on the recovery screen`, async ({ page, context }) => {
    await seed(context, INITIAL, failure);
    await open(page);
    await settings(page);
    const before = await primary(page);
    const boots = await page.evaluate(() => sessionStorage.getItem('storage_probe_boots'));
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#btnReset').click();
    await expect(page.locator('#setMsg')).toContainText('Could not reset your save');
    await expect(page.locator('#settings')).toBeVisible();
    await expect(page.locator('#saveWarning')).toBeVisible();
    expect(await primary(page)).toBe(before);
    expect(await page.evaluate(() => sessionStorage.getItem('storage_probe_boots'))).toBe(boots);
  });
}

test('import cancellation preserves both slots, accepted import retains exact rollback and exports the replacement', async ({ page, context }) => {
  await seed(context);
  await open(page);
  await settings(page);
  const before = await primary(page);
  const rollbackBefore = await page.evaluate((key) => localStorage.getItem(key), ROLLBACK_KEY);
  const arriving = { level: 7, emeralds: 707, camera: 'close', unlocked: ['alex'], campaign: { done: [] } };
  const code = `CR1|${Buffer.from(JSON.stringify(arriving)).toString('base64')}`;
  await page.locator('#saveImport').fill(code);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#btnLoadSave').click();
  expect(await primary(page)).toBe(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), ROLLBACK_KEY)).toBe(rollbackBefore);

  let prompt = '';
  page.once('dialog', async (dialog) => { prompt = dialog.message(); await dialog.accept(); });
  await page.locator('#btnLoadSave').click();
  await expect(page.locator('#menu')).toBeVisible();
  expect(prompt).toContain('one-step rollback');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).raw, ROLLBACK_KEY)).toBe(before);
  await settings(page);
  const restored = await exported(page);
  expect(restored.level).toBe(7);
  expect(restored.emeralds).toBe(707);
  expect(restored.camera).toBe('close');
  expect(restored.unlocked).toContain('alex');
});
