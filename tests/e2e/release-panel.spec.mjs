import { test, expect } from '@playwright/test';

const PHONE = { width: 360, height: 640 };
const LANDSCAPE = { width: 640, height: 360 };

async function open(page) {
  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
}

async function keyboardTo(page, selector) {
  for (let step = 0; step < 40; step++) {
    if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(tabKey(page));
  }
  await expect(page.locator(selector)).toBeFocused();
}

function tabKey(page, backwards = false) {
  // Safari on macOS uses Option-Tab to include every control when the host's
  // Full Keyboard Access preference is off. Do not change that host setting.
  const option = page.context().browser().browserType().name() === 'webkit' ? 'Alt+' : '';
  return `${option}${backwards ? 'Shift+' : ''}Tab`;
}

async function nextDialogControl(page, selector, backwards = false) {
  // Engines differ on whether the native dialog itself or browser chrome sits
  // between its last and first controls. Both controls must remain reachable;
  // no intervening step may focus a background app control.
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press(tabKey(page, backwards));
    const focused = await page.evaluate((target) => ({
      allowed: document.activeElement === document.body || !!document.activeElement.closest('dialog[open]'),
      target: document.activeElement.matches(target),
      tag: document.activeElement.tagName, id: document.activeElement.id,
    }), selector);
    expect(focused, 'Tab must not reach background app controls').toMatchObject({ allowed: true });
    if (focused.target) return;
  }
  await expect(page.locator(selector)).toBeFocused();
}

async function topRight(page) {
  await expect(page.locator('#verTag')).toBeVisible();
  const position = await page.locator('#verTag').evaluate((button) => {
    const box = button.getBoundingClientRect();
    const stage = document.querySelector('#stage').getBoundingClientRect();
    return { right: stage.right - box.right, top: box.top - stage.top, width: box.width, height: box.height };
  });
  expect(position.right).toBeGreaterThanOrEqual(0);
  expect(position.right).toBeLessThanOrEqual(18);
  expect(position.top).toBeGreaterThanOrEqual(0);
  expect(position.top).toBeLessThanOrEqual(16);
  expect(position.width).toBeGreaterThanOrEqual(44);
  expect(position.height).toBeGreaterThanOrEqual(44);
}

test('release details are keyboard modal and restore the version trigger on Escape and Close', async ({ page, context }) => {
  // This test owns focus, not service-worker transport. A browser without that
  // capability keeps the check button stable while native Tab visits chrome.
  await context.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await open(page);
  await keyboardTo(page, '#verTag');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'CRAFT RUSH' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'CHECK FOR UPDATES', exact: true })).toBeEnabled();
  await keyboardTo(page, 'dialog button:last-child');
  await nextDialogControl(page, 'dialog button:first-child');
  await expect(dialog.getByRole('button', { name: 'CHECK FOR UPDATES', exact: true })).toBeFocused();
  await nextDialogControl(page, 'dialog button:last-child', true);
  await expect(dialog.getByRole('button', { name: 'CLOSE', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#verTag')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'CLOSE', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#verTag')).toBeFocused();
});

for (const viewport of [PHONE, LANDSCAPE]) {
  test(`release details fit, center and own 44px targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await topRight(page);
    const version = await page.locator('#verTag').innerText();
    await page.locator('#verTag').click();
    const dialog = page.getByRole('dialog', { name: 'CRAFT RUSH' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(version);
    const layout = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x, y: box.y, right: box.right, bottom: box.bottom,
        centerX: box.x + box.width / 2 - innerWidth / 2,
        centerY: box.y + box.height / 2 - innerHeight / 2,
        overflow: element.scrollWidth - element.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        buttons: [...element.querySelectorAll('button')].map((button) => {
          const r = button.getBoundingClientRect();
          const cx = r.x + r.width / 2; const cy = r.y + r.height / 2;
          const points = [[cx, cy], [r.left + 3, cy], [r.right - 3, cy], [cx, r.top + 3], [cx, r.bottom - 3]];
          return {
            width: r.width, height: r.height,
            owned: points.every(([x, y]) => button.contains(document.elementFromPoint(x, y))),
          };
        }),
      };
    });
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.y).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.bottom).toBeLessThanOrEqual(viewport.height);
    expect(Math.abs(layout.centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.centerY)).toBeLessThanOrEqual(1);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.documentOverflow).toBeLessThanOrEqual(1);
    for (const button of layout.buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.owned).toBe(true);
    }
    await dialog.getByRole('button', { name: 'CLOSE', exact: true }).click();
    await page.locator('#navMore').click();
    await topRight(page);
    for (const [button, panel] of [['#btnHelp', '#help'], ['#btnAbout', '#about'], ['#btnSaveMore', '#settings']]) {
      await page.locator(button).click();
      await expect(page.locator(panel)).toBeVisible();
      await topRight(page);
      await page.locator('#navMore').click();
    }
    await page.locator('[data-tab="play"]').click();
    await page.locator('#btnPlayShooter').click();
    await page.locator('#btnPause').click();
    await topRight(page);
  });
}

test('save recovery remains a separate warning after release details close', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('craftrush_save_v1', '{broken'));
  await page.setViewportSize(PHONE);
  await open(page);
  const warning = page.locator('#saveWarning');
  await expect(warning).toBeVisible();
  const warningText = await warning.innerText();
  await page.locator('#verTag').click();
  const dialog = page.getByRole('dialog', { name: 'CRAFT RUSH' });
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('#saveWarning').count()).toBe(0);
  await dialog.getByRole('button', { name: 'CLOSE', exact: true }).click();
  await expect(warning).toHaveText(warningText);
  await warning.getByRole('button', { name: 'SAVE & DATA', exact: true }).click();
  await expect(page.locator('#settings')).toBeVisible();
  await expect(warning.getByRole('link', { name: 'RESCUE', exact: true })).toBeVisible();
  await topRight(page);
});

test('control help remains reachable after first-run hints are learned', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('craftrush_save_v1', JSON.stringify({ level: 1, tutorialSeen: true })));
  await page.setViewportSize(PHONE);
  await open(page);
  await page.locator('#navMore').click();
  await page.locator('#btnHelp').click();
  await expect(page.locator('#help')).toContainText('Hold and drag to fire and steer');
  await expect(page.locator('#help')).toContainText('hold to charge');
  await expect(page.locator('#help')).toContainText('Space sends a ready Golem');
  await page.locator('#btnCloseHelp').click();
  await expect(page.locator('#more')).toBeVisible();
  await page.locator('#btnHelp').click();
  await expect(page.locator('#help')).toBeVisible();
  await page.locator('[data-tab="play"]').click();
  await expect(page.locator('#more')).toBeVisible();
});

test('a persistent save warning does not cover the help return action on a short phone', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('craftrush_save_v1', '{broken'));
  await page.setViewportSize(PHONE);
  await open(page);
  await page.locator('#navMore').click();
  await page.locator('#btnHelp').click();
  await expect(page.locator('#saveWarning')).toBeVisible();
  await page.locator('#btnCloseHelp').click();
  await expect(page.locator('#more')).toBeVisible();
});

test('native installation is only offered after the browser permits it and only prompts on tap', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android Chrome' });
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Linux aarch64' });
  });
  await open(page);
  await page.locator('#navMore').click();
  await expect(page.locator('#btnInstall')).toHaveCount(0);
  await page.locator('[data-tab="play"]').click();
  await page.evaluate(() => {
    window.__installPrompts = 0;
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = async () => { window.__installPrompts++; };
    window.dispatchEvent(offer);
    window.__installPrevented = offer.defaultPrevented;
  });
  expect(await page.evaluate(() => window.__installPrompts)).toBe(0);
  expect(await page.evaluate(() => window.__installPrevented)).toBe(true);
  await page.locator('#navMore').click();
  await page.locator('#btnInstall').click();
  expect(await page.evaluate(() => window.__installPrompts)).toBe(1);
  await expect(page.locator('#btnInstall')).toHaveCount(0);
  await page.evaluate(() => {
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = async () => { window.__installPrompts++; };
    window.dispatchEvent(offer);
  });
  await expect(page.locator('#btnInstall')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#btnInstall')).toHaveCount(0);
});

test('iOS gets a dismissible Safari install sheet, not a pretend native prompt', async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' }));
  await page.setViewportSize(PHONE);
  await open(page);
  await expect(page.locator('#installHelp')).toHaveCount(0);
  await page.locator('#navMore').click();
  await page.locator('#btnInstall').click();
  await expect(page.locator('#installHelp')).toContainText('Open this game in Safari');
  await expect(page.locator('#installHelp')).toContainText('Share');
  await expect(page.locator('#installHelp')).toContainText('Add to Home Screen');
  await page.locator('#btnCloseHelp').click();
  await expect(page.locator('#more')).toBeVisible();
});

test('an installed iOS app never offers installation', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
  await open(page);
  await page.locator('#navMore').click();
  await expect(page.locator('#btnInstall')).toHaveCount(0);
});
