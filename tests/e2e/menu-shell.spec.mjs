import { test, expect } from '@playwright/test';

// The menu and run shell as a kid sees them on the phone this is played on:
// wording that means one thing, captions big enough to read, and every button
// big enough to hit. Measured, not eyeballed.

const PHONE = { width: 430, height: 932 };

test('the per-run objective is a GOAL, and a lost run never calls it done', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#runObjective')).toContainText('GOAL:');
  await expect(page.locator('#runObjective')).not.toContainText('QUEST');

  // level 1's objective is "bring 12 runners to the boss": hand the crowd 20
  // runners so the objective reads done, then lose the run
  await page.evaluate(() => {
    window.CR.game.setWorth(20);
    window.CR.game.endRun(false);
  });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#resultStats')).toContainText('This run');
  await expect(page.locator('#result')).not.toContainText(/quest/i);
  await expect(page.locator('#result')).not.toContainText(/done/i);

  // and a won run does
  await page.locator('#btnRetry').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => {
    window.CR.game.setWorth(20);
    window.CR.game.endRun(true);
  });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#resultStats')).toContainText('DONE!');
  await expect(page.locator('#masteryCallout')).toContainText('Goal done');
});

test('menu captions are readable and every button is a full tap target on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  await expect(page.locator('#menuMasteryTarget')).toBeVisible();

  const shell = await page.evaluate(() => {
    const size = (selector) => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const height = (selector) => document.querySelector(selector).getBoundingClientRect().height;
    const panel = document.querySelector('#menu .panel');
    return {
      tier: document.querySelector('#menu').className.trim(),
      overflow: panel.scrollHeight - panel.clientHeight,
      modeCaption: size('.modeLaunch small'),
      navLabel: size('.navTab span'),
      nextMark: size('#menuMasteryTarget'),
      nextMarkValue: size('#menuMasteryTarget b'),
      questDesc: size('#questDesc'),
      expDesc: size('#expDesc'),
      descriptionsShown: ['#questDesc', '#expDesc'].every((s) => getComputedStyle(document.querySelector(s)).display !== 'none'),
      shortestButton: Math.min(...[...document.querySelectorAll('#menu button, #navbar button')]
        .map((b) => b.getBoundingClientRect().height)),
      expeditionButton: height('#btnExpedition'),
    };
  });
  expect(shell.tier).toBe('overlay');
  expect(shell.overflow).toBe(0);
  expect(shell.descriptionsShown).toBe(true);
  expect(shell.modeCaption).toBeGreaterThanOrEqual(11);
  expect(shell.navLabel).toBeGreaterThanOrEqual(11);
  expect(shell.nextMark).toBeGreaterThanOrEqual(11);
  expect(shell.nextMarkValue).toBeGreaterThanOrEqual(11);
  expect(shell.questDesc).toBeGreaterThanOrEqual(12);
  expect(shell.expDesc).toBeGreaterThanOrEqual(12);
  expect(shell.expeditionButton).toBeGreaterThanOrEqual(44);
  expect(shell.shortestButton).toBeGreaterThanOrEqual(44);
});

// The pause button is the only thing a kid taps in the HUD strip, so it gets the
// same 44px floor as the menu. Measured on the button box, and then hit-tested at
// the centre and 4px in from each edge: a target that a chip or the progress bar
// sits on top of is not 44px, whatever its rect says.
for (const phone of [PHONE, { width: 375, height: 812 }]) {
  test(`the pause button is a 44px target that owns its area at ${phone.width}x${phone.height}`, async ({ page }) => {
    await page.setViewportSize(phone);
    await page.goto('/');
    await page.locator('#btnPlayShooter').click();
    await expect(page.locator('#btnPause')).toBeVisible();

    const pause = await page.evaluate(() => {
      const btn = document.querySelector('#btnPause');
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const probes = [[cx, cy], [r.left + 4, cy], [r.right - 4, cy], [cx, r.top + 4], [cx, r.bottom - 4]];
      const rect = (s) => document.querySelector(s).getBoundingClientRect();
      const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      return {
        width: r.width,
        height: r.height,
        owned: probes.filter(([x, y]) => document.elementFromPoint(x, y) === btn).length,
        clearOf: ['#hudTop .chip.green', '#hudLevel', '#progressWrap'].filter((s) => apart(r, rect(s))),
        onScreen: r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
      };
    });
    expect(pause.width).toBeGreaterThanOrEqual(44);
    expect(pause.height).toBeGreaterThanOrEqual(44);
    expect(pause.owned).toBe(5);
    expect(pause.clearOf).toEqual(['#hudTop .chip.green', '#hudLevel', '#progressWrap']);
    expect(pause.onScreen).toBe(true);
  });
}

test('the expedition card says what the code does: one a week, a streak a day', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#expHead')).toContainText("THIS WEEK'S EXPEDITION");
  await expect(page.locator('#expHead')).not.toContainText('TODAY');
  await expect(page.locator('#expDesc')).toContainText('every week');
  await expect(page.locator('#expDesc')).toContainText('daily');
});

test('HOLD TO FIRE is shown until the first hold has taught it, then never again', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#powerChips')).toContainText('HOLD TO FIRE');

  await context.addInitScript(() => {
    localStorage.setItem('craftrush_save_v1', JSON.stringify({ level: 1, tutorialSeen: true }));
  });
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator('#powerChips')).not.toContainText('HOLD TO FIRE');
  await expect(page.locator('#toast')).not.toContainText('AIM + FIRE');
});
