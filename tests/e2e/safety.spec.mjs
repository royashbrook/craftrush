import { test, expect } from '@playwright/test';

const CURRENT_SAVE = JSON.stringify({
  emeralds: 4242,
  level: 9,
  unlocked: ['steve', 'alex'],
  campaign: { done: ['mine_obsidian'] },
});

const migrationUrl = (save, backups) => {
  const code = `CR1|${Buffer.from(JSON.stringify(save), 'utf8').toString('base64')}`;
  const payload = Buffer.from(JSON.stringify({ s: code, ...(backups ? { b: backups } : {}) }), 'utf8')
    .toString('base64url');
  return { code, url: `/#cr-migrate=${payload}` };
};

test('the pre-boot handoff adopts a save before the app store starts', async ({ page }) => {
  const arriving = { level: 7, emeralds: 707, unlocked: ['alex'] };
  const moved = migrationUrl(arriving);

  await page.goto(moved.url);
  // Adoption intentionally reloads once so the app store is rebuilt from the
  // newly imported bytes. Wait for the post-reload cue before reading storage;
  // evaluating during that navigation makes a successful handoff look flaky.
  await expect(page.locator('#toast')).toContainText('YOUR GAME CAME WITH YOU!');
  const adoptedLevel = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('craftrush_save_v1')).level; } catch { return null; }
  });
  expect(adoptedLevel).toBe(7);

  const state = await page.evaluate(() => ({
    hash: location.hash,
    inbox: localStorage.getItem('craftrush_migration_inbox_v1'),
    backups: JSON.parse(localStorage.getItem('craftrush_backups_v1')),
  }));
  expect(state.hash).toBe('');
  expect(state.inbox).toBeNull();
  expect(state.backups[0].code).toBe(moved.code);
});

test('a failed pre-boot inbox write leaves the migration fragment retryable', async ({ page, context }) => {
  const moved = migrationUrl({ level: 4, emeralds: 44 });
  await context.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'craftrush_migration_inbox_v1') throw new Error('storage unavailable');
      return set.call(this, key, value);
    };
  });

  await page.goto(moved.url);
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  expect(new URL(page.url()).hash).toContain('cr-migrate=');
  expect(await page.evaluate(() =>
    localStorage.getItem('craftrush_migration_inbox_v1'))).toBeNull();
});

test('rescue cleanup removes only Craft Rush caches and scoped registrations', async ({ page, context }) => {
  await context.addInitScript((save) => localStorage.setItem('craftrush_save_v1', save), CURRENT_SAVE);
  await page.goto('/rescue.html');
  await page.evaluate(async () => {
    await caches.open('craftrush-stale-build');
    await caches.open('quarkatamari-v7');
    window.__unregisteredScopes = [];
    const registrations = [
      {
        scope: `${location.origin}/craftrush/`,
        unregister: async () => { window.__unregisteredScopes.push('craftrush'); },
      },
      {
        scope: `${location.origin}/quarkatamari/`,
        unregister: async () => { window.__unregisteredScopes.push('quarkatamari'); },
      },
      {
        scope: `${location.origin}/`,
        unregister: async () => { window.__unregisteredScopes.push('root'); },
      },
    ];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: async () => registrations },
    });
  });

  await page.locator('#clean').click();
  await expect(page.locator('#msg3')).toContainText('still here');
  const state = await page.evaluate(async () => ({
    caches: await caches.keys(),
    registrations: window.__unregisteredScopes,
    save: localStorage.getItem('craftrush_save_v1'),
  }));
  expect(state.caches).not.toContain('craftrush-stale-build');
  expect(state.caches).toContain('quarkatamari-v7');
  expect(state.registrations).toEqual(['craftrush']);
  expect(state.save).toBe(CURRENT_SAVE);
});

test('valid JSON with a broken save shape cannot replace progress', async ({ page, context }) => {
  await context.addInitScript((save) => localStorage.setItem('craftrush_save_v1', save), CURRENT_SAVE);
  await page.goto('/rescue.html');
  await page.locator('#restoreBox').fill(
    '{"level":1,"world":{"town":"plains","towns":{"plains":{"unlocked":true,"houses":[{}]}}}}',
  );
  await page.locator('#restore').click();
  await expect(page.locator('#msg2')).toContainText('not a playable Craft Rush save');
  expect(await page.evaluate(() => localStorage.getItem('craftrush_save_v1'))).toBe(CURRENT_SAVE);

  await page.locator('#restoreBox').fill(
    '{"level":1,"inventory":{"<img src=x onerror=window.__pwned=1>":-1}}',
  );
  await page.locator('#restore').click();

  await expect(page.locator('#msg2')).toContainText('not a playable Craft Rush save');
  await expect(page.locator('#msg2 img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('craftrush_save_v1'))).toBe(CURRENT_SAVE);
  expect(await page.evaluate(() => localStorage.getItem('craftrush_pre_restore_v1'))).toBeNull();
});

test('restore makes a byte-exact rollback and keeps daily backups intact', async ({ page, context }) => {
  const incoming = JSON.stringify({ emeralds: 77, level: 3, unlocked: ['steve'] });
  await context.addInitScript((save) => {
    const code = 'CR1|' + btoa(unescape(encodeURIComponent(save)));
    const daily = JSON.stringify([{
      day: '2026-07-26',
      ts: 123,
      level: 9,
      emeralds: 4242,
      code,
    }]);
    localStorage.setItem('craftrush_save_v1', save);
    localStorage.setItem('craftrush_backups_v1', daily);
    window.__dailyBeforeRestore = daily;
  }, CURRENT_SAVE);
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/rescue.html');
  await expect(page.locator('#backups')).toContainText('2026-07-26');
  await page.locator('#restoreBox').fill(incoming);
  await page.locator('#restore').click();
  await expect(page.locator('#msg2')).toContainText('previous save is available in Backups');

  const stored = await page.evaluate(() => ({
    live: localStorage.getItem('craftrush_save_v1'),
    rollback: JSON.parse(localStorage.getItem('craftrush_pre_restore_v1')),
    daily: localStorage.getItem('craftrush_backups_v1'),
    dailyBefore: window.__dailyBeforeRestore,
  }));
  expect(stored.live).toBe(incoming);
  expect(stored.rollback.raw).toBe(CURRENT_SAVE);
  expect(stored.daily).toBe(stored.dailyBefore);

  await page.getByRole('button', { name: 'USE THIS ONE' }).first().click();
  expect(await page.locator('#restoreBox').inputValue()).toBe(CURRENT_SAVE);
  await page.locator('#restore').click();
  await expect(page.locator('#msg2')).toContainText('Restored');
  expect(await page.evaluate(() => localStorage.getItem('craftrush_save_v1'))).toBe(CURRENT_SAVE);
});

test('a malformed current slot is preserved but never called safe', async ({ page, context }) => {
  const malformed = '{"level":"oops","still":"copyable"}';
  await context.addInitScript((save) => localStorage.setItem('craftrush_save_v1', save), malformed);
  await page.goto('/rescue.html');

  await expect(page.locator('#status')).toContainText('not playable');
  await expect(page.locator('#summary')).toContainText('Backups & one-step rollback');
  expect(await page.locator('#box').inputValue()).toBe(malformed);
});

test('Get Latest Version refuses to reload a paused run', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await page.locator('#btnPause').click();
  await page.locator('#navMore').click();
  await page.locator('#btnSaveMore').click();
  await page.evaluate(async () => {
    await caches.open('craftrush-active-run');
    window.__updateUnregistered = false;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: async () => [{
          scope: `${location.origin}/craftrush/`,
          unregister: async () => { window.__updateUnregistered = true; },
        }],
      },
    });
  });

  await page.locator('#btnForceUpdate').click();
  await expect(page.locator('#updateMsg')).toContainText('Finish or give up the current run');
  await expect(page.locator('#updateMsg')).toBeInViewport();
  expect(await page.evaluate(() => CR.nav.playing)).toBe(true);
  expect(await page.evaluate(async () => (await caches.keys()).includes('craftrush-active-run'))).toBe(true);
  expect(await page.evaluate(() => window.__updateUnregistered)).toBe(false);
});

test('Get Latest Version rechecks safety after asynchronous cleanup', async ({ page, context }) => {
  await context.addInitScript(() => {
    const boots = Number(sessionStorage.getItem('craftrush_update_race_boots') || 0) + 1;
    sessionStorage.setItem('craftrush_update_race_boots', String(boots));
  });
  await page.goto('/');
  await page.locator('#navMore').click();
  await page.locator('#btnSaveMore').click();
  await page.evaluate(() => {
    let release;
    window.__registrationsStarted = false;
    window.__releaseRegistrations = () => release?.([]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: () => {
          window.__registrationsStarted = true;
          return new Promise((resolve) => { release = resolve; });
        },
      },
    });
  });

  await page.locator('#btnForceUpdate').click();
  await expect.poll(() => page.evaluate(() => window.__registrationsStarted)).toBe(true);
  await page.evaluate(() => {
    CR.nav.playing = true;
    window.__releaseRegistrations();
  });
  await expect(page.locator('#updateMsg')).toContainText('Latest files are ready');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() =>
    sessionStorage.getItem('craftrush_update_race_boots'))).toBe('1');
});

test('in-app import confirms replacement and keeps a byte-exact rollback', async ({ page, context }) => {
  const incoming = JSON.stringify({ emeralds: 77, level: 3, unlocked: ['steve'] });
  const code = `CR1|${Buffer.from(incoming, 'utf8').toString('base64')}`;
  await context.addInitScript((save) => {
    if (sessionStorage.getItem('craftrush_import_seeded')) return;
    sessionStorage.setItem('craftrush_import_seeded', '1');
    localStorage.setItem('craftrush_save_v1', save);
  }, CURRENT_SAVE);
  let confirmation = '';
  page.on('dialog', async (dialog) => {
    confirmation = dialog.message();
    await dialog.accept();
  });

  await page.goto('/');
  await page.locator('#navMore').click();
  await page.locator('#btnSaveMore').click();
  const beforeImport = await page.evaluate(() => localStorage.getItem('craftrush_save_v1'));
  await page.locator('#saveImport').fill(code);
  await page.locator('#btnLoadSave').click();
  await expect.poll(async () => {
    try {
      return await page.evaluate(() =>
        JSON.parse(localStorage.getItem('craftrush_save_v1')).emeralds);
    } catch {
      return null;
    }
  }).toBe(77);

  expect(confirmation).toContain('one-step rollback');
  const rollback = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('craftrush_pre_restore_v1')));
  expect(rollback.raw).toBe(beforeImport);
  await expect(page.locator('#menu')).toBeVisible();
});

test('a claimed worker update waits until the run and result are both clear', async ({ page, context }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');
  await context.addInitScript(() => {
    const boots = Number(sessionStorage.getItem('craftrush_test_boots') || 0) + 1;
    sessionStorage.setItem('craftrush_test_boots', String(boots));
    let controllerChange = null;
    const serviceWorker = {
      controller: {},
      register: async () => ({}),
      addEventListener: (type, listener) => {
        if (type === 'controllerchange') controllerChange = listener;
      },
      removeEventListener: (type, listener) => {
        if (type === 'controllerchange' && controllerChange === listener) controllerChange = null;
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    window.__claimUpdatedWorker = () => controllerChange?.();
  });

  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await page.evaluate(() => window.__claimUpdatedWorker());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => sessionStorage.getItem('craftrush_test_boots'))).toBe('1');
  expect(await page.evaluate(() => CR.nav.playing)).toBe(true);

  await page.evaluate(() => CR.game.endRun(false));
  await expect(page.locator('#result')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => sessionStorage.getItem('craftrush_test_boots'))).toBe('1');

  await page.evaluate(() => {
    CR.nav.result = null;
    CR.nav.playing = false;
  });
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => sessionStorage.getItem('craftrush_test_boots'));
    } catch {
      return null;
    }
  }).toBe('2');
  await expect(page.locator('#menu')).toBeVisible();
});

test('a first worker install stays put and a later claim reloads safely', async ({ page, context }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');
  await context.addInitScript(() => {
    const boots = Number(sessionStorage.getItem('craftrush_first_install_boots') || 0) + 1;
    sessionStorage.setItem('craftrush_first_install_boots', String(boots));
    let controllerChange = null;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: async () => ({}),
        addEventListener: (type, listener) => {
          if (type === 'controllerchange') controllerChange = listener;
        },
        removeEventListener: () => {},
      },
    });
    window.__claimFirstWorker = () => controllerChange?.();
  });

  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => window.__claimFirstWorker());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() =>
    sessionStorage.getItem('craftrush_first_install_boots'))).toBe('1');
  await expect(page.locator('#menu')).toBeVisible();

  await page.evaluate(() => window.__claimFirstWorker());
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => sessionStorage.getItem('craftrush_first_install_boots'));
    } catch {
      return null;
    }
  }).toBe('2');
  await expect(page.locator('#menu')).toBeVisible();
});

test('a worker claim during asset boot is not missed', async ({ page, context }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');
  await context.addInitScript(() => {
    const boots = Number(sessionStorage.getItem('craftrush_boot_claim_boots') || 0) + 1;
    sessionStorage.setItem('craftrush_boot_claim_boots', String(boots));
    let controllerChange = null;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register: async () => {
          if (boots === 1) setTimeout(() => controllerChange?.(), 0);
          return {};
        },
        addEventListener: (type, listener) => {
          if (type === 'controllerchange') controllerChange = listener;
        },
        removeEventListener: () => {},
      },
    });
  });

  await page.goto('/');
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => sessionStorage.getItem('craftrush_boot_claim_boots'));
    } catch {
      return null;
    }
  }).toBe('2');
  await expect(page.locator('#menu')).toBeVisible();
});

test('a waiting worker offers an in-app update and activates on request', async ({ page, context }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');
  await context.addInitScript(() => {
    const boots = Number(sessionStorage.getItem('craftrush_update_banner_boots') || 0) + 1;
    sessionStorage.setItem('craftrush_update_banner_boots', String(boots));
    let controllerChange = null;
    let updateChecks = 0;
    const worker = {
      state: 'installed',
      postMessage: (message) => {
        sessionStorage.setItem('craftrush_update_message', JSON.stringify(message));
        if (message?.type !== 'ACTIVATE_UPDATE') return;
        worker.state = 'activating';
        setTimeout(() => {
          worker.state = 'activated';
          serviceWorker.controller = {};
          controllerChange?.();
        }, 0);
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const registration = {
      waiting: boots === 1 ? worker : null,
      installing: null,
      update: async () => { updateChecks++; },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const serviceWorker = {
      controller: {},
      register: async () => registration,
      addEventListener: (type, listener) => {
        if (type === 'controllerchange') controllerChange = listener;
      },
      removeEventListener: (type, listener) => {
        if (type === 'controllerchange' && controllerChange === listener) controllerChange = null;
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    window.__updateChecks = () => updateChecks;
  });

  await page.goto('/');
  await expect(page.locator('#updateBanner')).toContainText('UPDATE READY');
  const initialChecks = await page.evaluate(() => window.__updateChecks());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => window.__updateChecks())).toBeGreaterThan(initialChecks);

  await page.locator('#btnApplyUpdate').click();
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem('craftrush_update_banner_boots'))).toBe('2');
  expect(await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('craftrush_update_message')))).toEqual({ type: 'ACTIVATE_UPDATE' });
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#updateBanner')).toHaveCount(0);
});

test('a newly installed update stays out of the run and result', async ({ page, context }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');
  await context.addInitScript(() => {
    let updateFound = null;
    let workerStateChanged = null;
    const worker = {
      state: 'installing',
      postMessage: () => {},
      addEventListener: (type, listener) => {
        if (type === 'statechange') workerStateChanged = listener;
      },
      removeEventListener: () => {},
    };
    const registration = {
      waiting: null,
      installing: null,
      update: async () => {},
      addEventListener: (type, listener) => {
        if (type === 'updatefound') updateFound = listener;
      },
      removeEventListener: () => {},
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register: async () => registration,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    window.__installUpdate = () => {
      registration.installing = worker;
      updateFound?.();
      registration.waiting = worker;
      worker.state = 'installed';
      workerStateChanged?.();
    };
  });

  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await page.evaluate(() => window.__installUpdate());
  await expect(page.locator('#updateBanner')).toHaveCount(0);

  await page.evaluate(() => CR.game.endRun(false));
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#updateBanner')).toHaveCount(0);

  await page.evaluate(() => {
    CR.nav.result = null;
    CR.nav.playing = false;
  });
  await expect(page.locator('#updateBanner')).toContainText('UPDATE READY');
});

test('the modern worker activates without deleting a neighboring app cache', async ({ page }) => {
  test.skip(process.env.PW_TARGET !== 'build', 'service workers are deliberately absent in dev');
  await page.goto('/rescue.html');
  const cacheNames = await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      await registration.unregister();
    }
    for (const key of await caches.keys()) await caches.delete(key);
    await caches.open('craftrush-stale-build');
    await caches.open('quarkatamari-v7');

    const registration = await navigator.serviceWorker.register(
      `/service-worker.js?activation-test=${Date.now()}`,
      { type: 'module', scope: '/' },
    );
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker && worker.state !== 'activated') {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('worker activation timed out')), 10000);
        const advance = () => {
          if (worker.state === 'installed') worker.postMessage({ type: 'ACTIVATE_UPDATE' });
          if (worker.state === 'activated') {
            clearTimeout(timeout);
            resolve();
          }
        };
        worker.addEventListener('statechange', advance);
        advance();
      });
    }
    return caches.keys();
  });

  expect(cacheNames).not.toContain('craftrush-stale-build');
  expect(cacheNames).toContain('quarkatamari-v7');
  expect(cacheNames.some((name) => name.startsWith('craftrush-'))).toBe(true);
});
