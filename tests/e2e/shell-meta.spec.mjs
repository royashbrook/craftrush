import { test, expect } from '@playwright/test';

// The served bytes, not the booted DOM: ssr is off, so anything a component
// sets in svelte:head is invisible to a crawler, a link preview or the fleet
// checker. These read the raw responses the way those readers do.

const ETHOS = 'no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.';
const DESCRIPTION = `A blocky crowd-runner for kids: grow your mob, blast creepers, beat the boss. ${ETHOS} Works offline.`;

test('the served html carries the title and the description', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('<title>Craft Rush</title>');
  expect(html).toContain(`<meta name="description" content="${DESCRIPTION}">`);
});

test('the manifest description is the same sentence', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.description).toBe(DESCRIPTION);
});

test('the about page ends with the exact ethos line above the maker mark', async ({ page }) => {
  await page.goto('/');
  await page.locator('#navMore').click();
  await page.locator('#btnAbout').click();
  await expect(page.locator('#aboutEthos')).toHaveText(ETHOS);
  await expect(page.locator('#about')).not.toContainText(/just fun|pushing you to pay/i);
  const order = await page.evaluate(() => {
    const ethos = document.querySelector('#aboutEthos');
    const mark = document.querySelector('#about .makerMark');
    return ethos && mark ? ethos.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
  });
  expect(order).toBeTruthy();
});
