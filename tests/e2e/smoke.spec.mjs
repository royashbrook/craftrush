import { test, expect } from '@playwright/test';

// Browser smoke tests. These load the real page, so they catch anything the
// node harness can't: DOM wiring, canvas rendering, input, console errors.

test('boots to the menu with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/index.html');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  await expect(page.locator('#menu')).toBeVisible();
  // the app shell is always present outside a run
  await expect(page.locator('#appbar')).toBeVisible();
  await expect(page.locator('#navbar')).toBeVisible();
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
  await page.click('#btnPlayShooter');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#btnPause')).toBeVisible();
  // the play area is button-free now; the golem charges and fires itself
  await expect(page.locator('#golemMeter')).toBeVisible();
  await expect(page.locator('#steerL')).toHaveCount(0);
  await expect(page.locator('#golemBtn')).toHaveCount(0);
  // a run takes the whole screen: the bars step out of the way
  await expect(page.locator('#navbar')).toBeHidden();
  await expect(page.locator('#appbar')).toBeHidden();
  await page.waitForTimeout(2500); // let the run play a couple seconds
  expect(errors).toEqual([]);
});

test('pause and resume work', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#btnPlayShooter');
  await page.click('#btnPause');
  await expect(page.locator('#pause')).toBeVisible();
  await page.click('#btnResume');
  await expect(page.locator('#pause')).toBeHidden();
});

test('every bottom-nav tab opens a screen with real content', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/index.html');
  for (const [tab, screen] of [['shop', '#shop'], ['home', '#home'], ['mine', '#mine']]) {
    await page.click(`.navTab[data-tab="${tab}"]`);
    await expect(page.locator(screen)).toBeVisible();
    // the tab must BUILD the screen, not just reveal an empty panel
    const kids = await page.locator(`${screen} .panel > *`).count();
    expect(kids, `${tab} tab renders content`).toBeGreaterThan(1);
  }
  // the world is a drawn scene rather than a panel: it must name a town and size its canvas
  await page.click('.navTab[data-tab="world"]');
  await expect(page.locator('#world')).toBeVisible();
  await expect(page.locator('#worldTownName')).not.toBeEmpty();
  const size = await page.locator('#townCanvas').evaluate((c) => c.width * c.height);
  expect(size, 'the town diorama is drawn at a real size').toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('the bottom-left tab becomes BACK inside a stack and walks back out', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('.navTab[data-tab="world"]');
  await expect(page.locator('#tabPlayLabel')).toHaveText('Play');   // world is a tab root
  await page.click('#btnTownAction');                               // VISIT the town's house
  await expect(page.locator('#playroom')).toBeVisible();
  await expect(page.locator('#tabPlayLabel')).toHaveText('Back');
  await page.click('.navTab[data-tab="play"]');                     // back out
  await expect(page.locator('#world')).toBeVisible();
  await expect(page.locator('#tabPlayLabel')).toHaveText('Play');
});
