import { test, expect } from '@playwright/test';

test('pause swaps the run HUD for shell chrome and resume restores the run HUD', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#appMeta')).not.toBeVisible();
  await page.locator('#btnPause').click();
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#appMeta')).toBeVisible();
  await expect(page.locator('#hud')).not.toBeVisible();
  await expect(page.locator('#bossBar')).not.toBeVisible();
  await page.locator('#btnPauseShop').click();
  await expect(page.locator('#hud')).not.toBeVisible();
  await page.locator('[data-tab="play"]').click();
  await page.locator('#btnResume').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#appMeta')).not.toBeVisible();
});
