import { test, expect } from '@playwright/test';

// The real worker against the real build, served the way the host serves it.
// Every other worker test stubs navigator.serviceWorker; this one lets it
// install for real, which is the only way to catch a precache entry the host
// refuses to serve.

test('the worker installs, fills its cache, and serves the menu offline', async ({ page, context, browserName }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');

  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();

  // A failed install leaves no registration behind, so poll for the activated
  // worker rather than awaiting `ready`, which would hang without saying why.
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state ?? 'none';
  }), { timeout: 15000 }).toBe('activated');

  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const names = (await caches.keys()).filter((name) => name.startsWith('craftrush-'));
    const entries = [];
    for (const name of names) entries.push(...(await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname));
    return { scope: registration.scope, names, entries };
  });
  expect(state.names.length).toBe(1);
  expect(state.entries).toContain('/');
  expect(state.entries).toContain('/manifest.webmanifest');
  expect(state.entries).not.toContain('/_headers');
  expect(state.entries.length).toBeGreaterThan(10);

  // WebKit's offline emulation does not hand a navigation to the worker (the
  // reload dies with an internal error), so the reload half runs in Chromium.
  // WebKit still proves the install and the filled cache above.
  if (browserName !== 'chromium') return;
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  await expect(page.locator('#menu')).toBeVisible();
});
