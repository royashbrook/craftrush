import { test, expect } from '@playwright/test';

// Browser smoke tests. These load the real page, so they catch anything the
// node harness can't: DOM wiring, canvas rendering, input, console errors.

test('boots to the menu with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/index.html');
  await expect(page.locator('#btnPlay')).toBeVisible();
  await expect(page.locator('#menu')).toBeVisible();
  // menu fits without scrolling: the panel is within the viewport height
  const overflow = await page.evaluate(() => {
    const p = document.querySelector('#menu .panel');
    return p.scrollHeight - p.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('PLAY starts a run and the HUD shows, still no errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/index.html');
  await page.click('#btnPlay');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#btnPause')).toBeVisible();
  await expect(page.locator('#steerL')).toBeVisible();
  await expect(page.locator('#steerR')).toBeVisible();
  await page.waitForTimeout(2500); // let the run play a couple seconds
  expect(errors).toEqual([]);
});

test('pause and resume work', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#btnPlay');
  await page.click('#btnPause');
  await expect(page.locator('#pause')).toBeVisible();
  await page.click('#btnResume');
  await expect(page.locator('#pause')).toBeHidden();
});
