import { test, expect } from '@playwright/test';

async function openShop(page, setup) {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  if (setup) await page.evaluate(setup);
  await page.locator('.navTab[data-tab="shop"]').click();
  await expect(page.locator('#shop')).toBeVisible();
}

test('the phone shop is a compact, scrollable three-column dressing room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openShop(page);

  await expect(page.locator('#shopTabs [role="tab"]')).toHaveCount(5);
  await expect(page.locator('#shopEmeralds')).toHaveCount(0);
  await expect(page.locator('#barWallet')).toBeVisible();

  const layout = await page.evaluate(() => {
    const grid = document.querySelector('#shopGrid');
    const catalog = document.querySelector('#shopCatalog');
    const controls = [...document.querySelectorAll(
      '#shopTabs button, #shopAction, #shopCatalog [data-shop-item], #navMore',
    )].filter((node) => node.offsetParent !== null);
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      touchAction: getComputedStyle(catalog).touchAction,
      scrollRatio: catalog.scrollHeight / catalog.clientHeight,
      controls: controls.map((node) => {
        const box = node.getBoundingClientRect();
        return { id: node.id || node.dataset.shopItem, width: box.width, height: box.height };
      }),
    };
  });

  expect(layout.columns).toBe(3);
  expect(layout.touchAction).toBe('pan-y');
  expect(layout.scrollRatio).toBeLessThanOrEqual(2.1);
  for (const control of layout.controls) {
    expect(control.width, `${control.id} is wide enough to tap`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.id} is tall enough to tap`).toBeGreaterThanOrEqual(44);
  }

  await page.locator('#shopTab-cape').click();
  await expect(page.locator('[data-shop-item][data-shop-category="cape"]')).not.toHaveCount(0);
  await expect(page.locator('[data-shop-item][data-shop-category="skin"]')).toHaveCount(0);
});

test('selection cannot spend, and buying never silently equips', async ({ page }) => {
  await openShop(page, () => {
    CR.save.emeralds = 1000;
    CR.save.unlocked = ['steve', 'skin_from_another_theme'];
    CR.save.cosmeticsOwned = ['none', 'cosmetic_from_another_theme'];
  });

  await page.locator('[data-shop-item="alex"]').click();
  expect(await page.evaluate(() => CR.save.emeralds)).toBe(1000);
  expect(await page.evaluate(() => CR.save.unlocked.includes('alex'))).toBe(false);
  expect(await page.evaluate(() => CR.save.skin)).toBe('steve');

  await expect(page.locator('#shopAction')).toHaveAttribute('data-action', 'buy');
  await page.locator('#shopAction').click();
  expect(await page.evaluate(() => CR.save.emeralds)).toBe(960);
  expect(await page.evaluate(() => CR.save.unlocked.includes('alex'))).toBe(true);
  expect(await page.evaluate(() => CR.save.skin)).toBe('steve');
  await expect(page.locator('#shopAction')).toHaveAttribute('data-action', 'equip');

  await page.locator('#shopAction').click();
  expect(await page.evaluate(() => CR.save.emeralds)).toBe(960);
  expect(await page.evaluate(() => CR.save.skin)).toBe('alex');

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('craftrush_save_v1')));
  expect(persisted.unlocked).toContain('skin_from_another_theme');
  expect(persisted.cosmeticsOwned).toContain('cosmetic_from_another_theme');
});

test('owned cosmetics can be removed without being forgotten', async ({ page }) => {
  await openShop(page, () => {
    CR.save.cosmeticsOwned = [...new Set([...CR.save.cosmeticsOwned, 'cape_red'])];
    CR.save.cosmetics.cape = 'cape_red';
  });

  await page.locator('#shopTab-cape').click();
  await expect(page.locator('#shopAction')).toHaveAttribute('data-action', 'remove');
  await page.locator('#shopAction').click();

  expect(await page.evaluate(() => CR.save.cosmetics.cape)).toBe('none');
  expect(await page.evaluate(() => CR.save.cosmeticsOwned.includes('cape_red'))).toBe(true);
});

test('quest loot must be earned, claimed, and then equipped', async ({ page }) => {
  await openShop(page, () => {
    CR.save.emeralds = 500;
    CR.save.inventory.elytra = 0;
    CR.save.cosmetics.cape = 'none';
    CR.save.cosmeticsOwned = CR.save.cosmeticsOwned.filter((id) => id !== 'cape_elytra');
  });

  await page.locator('#shopTab-cape').click();
  await page.locator('[data-shop-item="cape_elytra"]').click();
  await expect(page.locator('#shopAction')).toHaveAttribute('data-action', 'quest');
  await expect(page.locator('#shopAction')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('#shopAction').dispatchEvent('click');
  await expect(page.locator('#toast')).toContainText('Find this on your quest: Elytra.');
  expect(await page.evaluate(() => CR.save.emeralds)).toBe(500);
  expect(await page.evaluate(() => CR.save.cosmeticsOwned.includes('cape_elytra'))).toBe(false);

  await page.evaluate(() => { CR.save.inventory.elytra = 1; });
  await expect(page.locator('#shopAction')).toHaveAttribute('data-action', 'claim');
  await page.locator('#shopAction').click();
  expect(await page.evaluate(() => CR.save.cosmeticsOwned.includes('cape_elytra'))).toBe(true);
  expect(await page.evaluate(() => CR.save.cosmetics.cape)).toBe('none');

  await expect(page.locator('#shopAction')).toHaveAttribute('data-action', 'equip');
  await page.locator('#shopAction').click();
  expect(await page.evaluate(() => CR.save.cosmetics.cape)).toBe('cape_elytra');
});

test('shop tabs and cards work by keyboard without accidental purchases', async ({ page }) => {
  await openShop(page, () => { CR.save.emeralds = 1000; });

  await page.locator('#shopTab-skin').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#shopTab-cape')).toBeFocused();
  await expect(page.locator('#shopTab-cape')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.locator('#shopTab-pet')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('#shopTab-skin')).toBeFocused();

  await page.locator('[data-shop-item="alex"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-shop-item="alex"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => CR.save.emeralds)).toBe(1000);
  expect(await page.evaluate(() => CR.save.unlocked.includes('alex'))).toBe(false);
});

test('the selected category survives a round trip through a paused run', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await page.locator('#btnPause').click();
  await page.locator('#btnPauseShop').click();

  await page.locator('#shopTab-hat').click();
  await page.locator('.navTab[data-tab="play"]').click();
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#btnPauseShop').click();
  await expect(page.locator('#shopTab-hat')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-shop-item][data-shop-category="hat"]')).not.toHaveCount(0);
});

test('the alternate theme can use the same compact shop contract', async ({ page }) => {
  await page.goto('/?theme=neon');
  await page.locator('#btnPlayShooter').waitFor();
  await page.locator('.navTab[data-tab="shop"]').click();
  await page.locator('#shopTab-cape').click();

  await expect(page.locator('#shopPreview')).toContainText('Neon Hero Red');
  await expect(page.locator('[data-shop-item="cape_red"]')).toBeVisible();
  expect(await page.locator('#shopGrid').evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(3);
});
