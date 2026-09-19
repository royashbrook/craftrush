import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');

const SAVE = JSON.stringify({ level: 3, emeralds: 177, unlocked: ['steve'], campaign: { done: [] } });

async function openSettings(page) {
  await page.locator('#navMore').click();
  await page.locator('#btnSaveMore').click();
  await expect(page.locator('#settings')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('craftrush_save_v1')) localStorage.setItem('craftrush_save_v1', raw);
  }, SAVE);
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await openSettings(page);
});

for (const outcome of ['false', 'throw']) {
  test(`failed clipboard and ${outcome} fallback expose the code without claiming copied`, async ({ page }) => {
    await page.evaluate((result) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('clipboard denied'); } },
      });
      document.execCommand = () => {
        if (result === 'throw') throw new Error('copy unsupported');
        return false;
      };
    }, outcome);

    await page.locator('#btnCopySave').click();
    await expect(page.locator('#setMsg')).toContainText('Copy the code below');
    await expect(page.locator('#setMsg')).not.toContainText('Copied!');
    await expect(page.locator('#saveExport')).toBeVisible();
    await expect(page.locator('#saveExport')).toHaveValue(/^CR1\|/);
    await expect(page.locator('#saveExport')).toBeFocused();
  });
}

test('the clipboard fallback only confirms a visible selected code when it succeeds', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } },
    });
    document.execCommand = () => {
      const field = document.querySelector('#saveExport');
      window.__copyAttempt = {
        visible: field.getBoundingClientRect().height > 0,
        selected: field.selectionEnd - field.selectionStart,
        length: field.value.length,
      };
      return true;
    };
  });
  await page.locator('#btnCopySave').click();
  await expect(page.locator('#setMsg')).toContainText('Copied!');
  const copied = await page.evaluate(() => window.__copyAttempt);
  expect(copied.visible).toBe(true);
  expect(copied.selected).toBe(copied.length);
  expect(copied.length).toBeGreaterThan(4);
});

test('QR export encodes current progress when a failed write leaves older bytes on disk', async ({ page }) => {
  const retained = await page.evaluate(() => localStorage.getItem('craftrush_save_v1'));
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'craftrush_save_v1') throw new DOMException('Storage full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
    const encode = TextEncoder.prototype.encode;
    TextEncoder.prototype.encode = function (text) {
      if (typeof text === 'string' && text.startsWith('{')) window.__qrInput = text;
      return encode.call(this, text);
    };
  });
  await page.locator('#navMore').click();
  await page.locator('#btnCameraMore').click();
  await expect(page.locator('#cameraLabel')).toContainText('OVERHEAD');
  await openSettings(page);
  await page.locator('#btnShowQr').click();
  await expect(page.locator('#saveQr')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__qrInput && JSON.parse(window.__qrInput).camera)).toBe('overhead');
  expect(await page.evaluate(() => localStorage.getItem('craftrush_save_v1'))).toBe(retained);
  expect(JSON.parse(retained).camera).toBe('far');
});

for (const remount of [false, true]) {
  test(`an older QR request cannot repaint the current canvas${remount ? ' after remount' : ''}`, async ({ page }) => {
    await page.evaluate(() => {
      window.__qrPaints = 0;
      const paint = CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData = function (...args) {
        if (this.canvas.id === 'saveQr' && this.canvas.isConnected) window.__qrPaints++;
        return paint.apply(this, args);
      };
      const Compress = CompressionStream;
      let held = false;
      window.CompressionStream = class {
        constructor(format) {
          const stream = new Compress(format);
          if (held) return stream;
          held = true;
          const gate = new Promise((resolve) => { window.__releaseQr = resolve; });
          return {
            writable: stream.writable,
            readable: stream.readable.pipeThrough(new TransformStream({
              async transform(chunk, controller) {
                window.__qrBlocked = true;
                await gate;
                controller.enqueue(chunk);
              },
              flush() { setTimeout(() => { window.__qrSettled = true; }, 0); },
            })),
          };
        }
      };
    });
    await page.locator('#btnShowQr').click();
    await expect.poll(() => page.evaluate(() => window.__qrBlocked)).toBe(true);

    if (remount) {
      await page.locator('#navMore').click();
      await page.locator('#btnCameraMore').click();
      await expect(page.locator('#cameraLabel')).toContainText('OVERHEAD');
      await page.locator('#btnSaveMore').click();
    }
    await page.locator('#btnShowQr').click();
    await expect(page.locator('#saveQr')).toBeVisible();
    expect(await page.evaluate(() => window.__qrPaints)).toBe(1);
    const currentQr = digest(await page.locator('#saveQr').evaluate((canvas) => canvas.toDataURL()));
    await page.evaluate(() => window.__releaseQr());
    await expect.poll(() => page.evaluate(() => window.__qrSettled)).toBe(true);
    expect(await page.evaluate(() => window.__qrPaints)).toBe(1);
    expect(digest(await page.locator('#saveQr').evaluate((canvas) => canvas.toDataURL()))).toBe(currentQr);
  });
}
