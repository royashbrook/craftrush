import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
  const ready = await page.evaluate(() => window.CR.assetsReady());
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

// The rescue page exists for players whose game will not start, so it must not
// depend on anything the game depends on. Blocking the app bundle is the test:
// if it still works with every module aborted, it cannot break the same way.
test('the save rescue page works with the whole app bundle blocked', async ({ page, context }) => {
  const SAVE = JSON.stringify({ emeralds: 4242, level: 9, unlocked: ['steve'], campaign: { done: ['mine_obsidian'] } });
  await context.addInitScript((s) => localStorage.setItem('craftrush_save_v1', s), SAVE);
  await page.route('**/_app/**', (r) => r.abort());

  await page.goto('/rescue.html');
  await expect(page.locator('#status')).toContainText('FOUND YOUR SAVE');
  await expect(page.locator('#summary')).toContainText('4242 emeralds');
  expect(await page.inputValue('#box')).toBe(SAVE);

  // clearing the app cache must never take the save with it
  await page.click('#clean');
  await expect(page.locator('#msg3')).toContainText('still here');
  const kept = await page.evaluate(() => localStorage.getItem('craftrush_save_v1'));
  expect(kept, 'the rescue page never deletes a save').toBe(SAVE);
});

// An installed app has no address bar, and on iOS its storage is separate from
// the browser's — so if the game will not start, the save inside it is reachable
// ONLY from inside it. The watchdog in app.html is inline and dependency free
// precisely so it still runs when every module is dead.
test('a dead app still offers a way to reach the save', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { get: () => true });
    localStorage.setItem('craftrush_save_v1', JSON.stringify({ emeralds: 777, level: 5, unlocked: ['steve'] }));
  });
  // kill the app's modules in BOTH environments: the built bundle lives under
  // _app/, the dev server serves them straight out of src/
  await page.route('**/_app/**', (r) => r.abort());
  await page.route('**/src/**', (r) => r.abort());

  await page.goto('/');
  await expect(page.locator('#stuck')).toBeVisible({ timeout: 15000 });
  await page.click('#stuckLink');

  await expect(page.locator('#status')).toContainText('FOUND YOUR SAVE');
  await expect(page.locator('#summary')).toContainText('777 emeralds');
  // and it names which storage you are looking at, since the app and the
  // browser keep different ones
  await expect(page.locator('#where')).toContainText('installed app');
});

test('the settings screen links to the rescue page', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => CR.nav.screen = 'settings');
  const href = await page.locator('#btnRescue').getAttribute('href');
  expect(href).toBe('./rescue.html');
  // a real page load, not a client-side navigation into a route that does not exist
  expect(await page.locator('#btnRescue').getAttribute('rel')).toBe('external');
});

// Moving a save between the installed app and the browser, which on iPhone keep
// separate storage. The code carries a LINK, not the save alone, because iOS has
// no BarcodeDetector — but its Camera app opens links from a QR natively.
test('a save survives a round trip through a QR link', async ({ browser }) => {
  const SAVE = JSON.stringify({ emeralds: 31337, level: 12, unlocked: ['steve', 'alex'] });

  const from = await browser.newContext();
  await from.addInitScript((s) => localStorage.setItem('craftrush_save_v1', s), SAVE);
  const a = await from.newPage();
  await a.goto('/rescue.html');
  await a.click('#showQr');
  await expect(a.locator('#qrWrap')).toBeVisible();
  const link = await a.inputValue('#qrLink');
  expect(link).toContain('#save=');

  // a second device, empty, opening what the camera scanned
  const to = await browser.newContext();
  const b = await to.newPage();
  b.on('dialog', (d) => d.accept());
  await b.goto(link);
  await expect(b.locator('#incoming')).toBeVisible();
  await expect(b.locator('#incomingWhat')).toContainText('31337 emeralds');
  // the save must not be left sitting in the address bar
  expect(b.url()).not.toContain('save=');

  await b.click('#restore');
  await expect(b.locator('#msg2')).toContainText('Restored');
  expect(await b.evaluate(() => localStorage.getItem('craftrush_save_v1'))).toBe(SAVE);

  await from.close();
  await to.close();
});

test('the rescue page pulls in nothing at runtime', async ({ page }) => {
  // its whole value is that it cannot fail the way the app failed, so it must
  // not fetch a module, a chunk or a library
  const extra = [];
  page.on('request', (r) => { if (!r.url().includes('/rescue.html')) extra.push(r.url()); });
  await page.goto('/rescue.html');
  await page.waitForTimeout(500);
  expect(extra, 'the rescue page loaded something external').toEqual([]);
});

test('real-time village and mine notices update without navigation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();

  await page.evaluate(() => {
    const town = CR.save.world.towns[CR.save.world.town];
    town.villagers.farmer = 10000;
    CR.save.home.lastCollect = Date.now();
    CR.save.mine.energy = 59;
    CR.save.mine.energyTs = Date.now() - 19_900;
    CR.commit();
  });

  await expect(page.locator('#navDotHome')).toBeHidden();
  await expect(page.locator('#navDotMine')).toBeHidden();
  await expect(page.locator('#navDotHome')).toBeVisible({ timeout: 2500 });
  await expect(page.locator('#navDotMine')).toBeVisible({ timeout: 2500 });

  await page.click('.navTab[data-tab="home"]');
  await expect(page.locator('#homeWelcome')).toBeVisible();
});

test('runtime themes ship only their atlas files', async ({ request }) => {
  const atlas = await request.get('/themes/craft/atlas.json');
  expect(atlas.ok()).toBe(true);
  if (process.env.PW_TARGET === 'build') {
    for (const theme of ['craft', 'neon']) {
      expect(readdirSync(join(process.cwd(), 'build', 'themes', theme)).sort())
        .toEqual(['atlas.json', 'atlas.png']);
    }
  }
});
