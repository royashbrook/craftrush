import { test, expect } from '@playwright/test';

// Browser smoke tests. These load the real page, so they catch anything the
// node harness can't: DOM wiring, canvas rendering, input, console errors.

test('boots to the menu with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
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

  await page.goto('/');
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
  await page.goto('/');
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

  await page.goto('/');
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
  await page.goto('/');
  await page.click('.navTab[data-tab="world"]');
  await expect(page.locator('#tabPlayLabel')).toHaveText('Play');   // world is a tab root
  await page.click('#btnTownAction');                               // VISIT the town's house
  await expect(page.locator('#playroom')).toBeVisible();
  await expect(page.locator('#tabPlayLabel')).toHaveText('Back');
  await page.click('.navTab[data-tab="play"]');                     // back out
  await expect(page.locator('#world')).toBeVisible();
  await expect(page.locator('#tabPlayLabel')).toHaveText('Play');
});

test('the HUD chips stay readable over a dark biome sky', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#hud')).toBeVisible();
  // black text on a near-black chip is invisible; every chip must carry real contrast
  const colors = await page.evaluate(() =>
    [...document.querySelectorAll('#hudTop .chip')].map((c) => getComputedStyle(c).color));
  for (const c of colors) {
    const [r, g, b] = c.match(/\d+/g).map(Number);
    expect(r + g + b, `chip colour ${c} is not near-black`).toBeGreaterThan(200);
  }
});

test('the menu still fits once the whole quest is finished', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  // the finished state adds the replay button, which is where the menu used to spill
  // finishing the quest is now just a save change: the menu re-derives itself,
  // which is the whole point of the port. No refresh call to make.
  await page.evaluate(() => {
    CR.save.campaign.done = ['mine_obsidian', 'portal', 'fortress', 'stronghold', 'dragon',
      'endcity', 'bastion', 'skulls', 'wither', 'credits'];
  });
  await expect(page.locator('#btnQuestReplay')).toBeVisible();
  const overflow = await page.evaluate(() => {
    const p = document.querySelector('#menu .panel');
    return p.scrollHeight - p.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the browser actually loaded the art', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  // a missing atlas degrades to magenta placeholders rather than crashing, so
  // without this the suite would pass on a build that shipped no art at all
  const ready = await page.evaluate(() => import('/js/assets.js').then((m) => m.assetsReady()));
  expect(ready).toBe(true);
});

test('the system back gesture walks the screen stack instead of leaving the game', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();

  await page.click('.navTab[data-tab="world"]');
  await page.click('#btnTownAction');                 // into a house
  await expect(page.locator('#playroom')).toBeVisible();

  await page.goBack();
  await expect(page.locator('#world')).toBeVisible();  // up one, not out of the app
  await page.goBack();
  await expect(page.locator('#menu')).toBeVisible();

  // mid-run, back means "wait, stop" rather than "go somewhere"
  await page.click('#btnPlayShooter');
  await expect(page.locator('#hud')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#pause')).toBeVisible();
});
