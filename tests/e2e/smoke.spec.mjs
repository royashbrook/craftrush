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
  await expect(page.locator('#btnPlayGates')).toBeVisible();
  await expect(page.locator('#modePicker')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
  // compact status corners and bottom navigation stay present outside a run
  await expect(page.locator('#appbar')).toHaveCount(0);
  await expect(page.locator('#appMeta')).toBeVisible();
  await expect(page.locator('#navbar')).toBeVisible();
  await expect(page.locator('#barWallet')).toBeVisible();
  await expect(page.locator('#barEmeralds')).toHaveText('0');
  // menu fits without scrolling: the panel is within the viewport height
  const overflow = await page.evaluate(() => {
    const p = document.querySelector('#menu .panel');
    return p.scrollHeight - p.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('each game mode launches in one tap with no selector step', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  await expect(page.locator('#btnPlayGates')).toBeVisible();

  await page.locator('#btnPlayGates').click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => CR.save.mode)).toBe('gates');

  await page.reload();
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => CR.save.mode)).toBe('shooter');
});

test('the direct-play menu does not overlap on an iPhone Air viewport', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 912 });
  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  await expect(page.locator('#btnPlayGates')).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const overlay = rect('#menu');
    const panel = rect('#menu .panel');
    const shooter = rect('#btnPlayShooter');
    const gates = rect('#btnPlayGates');
    const panelEl = document.querySelector('#menu .panel');
    return {
      overflow: panelEl.scrollHeight - panelEl.clientHeight,
      duplicatedLogoGone: !document.querySelector('#menu .logo'),
      panelInsideOverlay: panel.top >= overlay.top && panel.bottom <= overlay.bottom,
      shooterInsidePanel: shooter.top >= panel.top && shooter.bottom <= panel.bottom,
      gatesInsidePanel: gates.top >= panel.top && gates.bottom <= panel.bottom,
      buttonsDoNotOverlap: shooter.right <= gates.left,
    };
  });
  expect(layout).toEqual({
    overflow: 0,
    duplicatedLogoGone: true,
    panelInsideOverlay: true,
    shooterInsidePanel: true,
    gatesInsidePanel: true,
    buttonsDoNotOverlap: true,
  });
});

test('a fresh installed app restores the save copied before relocation', async ({ page, context }) => {
  const oldSave = {
    level: 6,
    bestLevel: 6,
    emeralds: 606,
    unlocked: ['steve', 'alex'],
    campaign: { done: ['mine_obsidian'] },
  };
  const code = `CR1|${Buffer.from(JSON.stringify(oldSave), 'utf8').toString('base64')}`;
  await context.addInitScript((copied) => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => copied },
    });
  }, code);

  await page.goto('/');
  await expect(page.locator('#btnRestoreCopiedSave')).toBeVisible();
  await page.locator('#btnRestoreCopiedSave').click();
  await expect(page.locator('#menuLevel')).toContainText('LV 6');
  await expect(page.locator('#barEmeralds')).toHaveText('606');
  await expect(page.locator('#btnRestoreCopiedSave')).toHaveCount(0);
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('craftrush_save_v1')).level)).toBe(6);
  expect(await page.evaluate(() =>
    localStorage.getItem('craftrush_legacy_restore_done_v1'))).toBe('1');
});

test('installed-app restore focuses a persistent manual paste path and completes it', async ({ page, context }) => {
  const oldSave = {
    level: 4,
    bestLevel: 4,
    emeralds: 404,
    unlocked: ['steve', 'alex'],
    campaign: { done: ['mine_obsidian'] },
  };
  const code = `CR1|${Buffer.from(JSON.stringify(oldSave), 'utf8').toString('base64')}`;
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => { throw new Error('clipboard denied'); } },
    });
  });

  await page.goto('/');
  await expect(page.locator('#btnRestoreCopiedSave')).toBeVisible();
  await page.locator('#btnRestoreCopiedSave').click();
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('PASTE YOUR OLD SAVE CODE');
  await expect(page.locator('#legacyRestoreHint')).toContainText('then tap LOAD CODE');
  await expect(page.locator('#saveImport')).toBeFocused();
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('craftrush_save_v1')).level)).toBe(1);

  await page.locator('#saveImport').fill(code);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#btnLoadSave').click();
  await expect(page.locator('#menuLevel')).toContainText('LV 4');
  await expect(page.locator('#barEmeralds')).toHaveText('404');
  await expect(page.locator('#btnRestoreCopiedSave')).toHaveCount(0);
});

test('installed-app restore offer stays recoverable, dismissible, and fits a short iPhone', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => true,
    });
  });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.locator('#btnRestoreCopiedSave')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const panel = document.querySelector('#menu .panel');
    return panel.scrollHeight - panel.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(1);

  // Once offered on a fresh install, a run cannot silently make the recovery
  // route disappear before the player restores or explicitly dismisses it.
  await page.evaluate(() => {
    CR.save.stats.runs = 4;
    CR.save.stats.totalEmeralds = 400;
    CR.commit();
  });
  await page.reload();
  await expect(page.locator('#btnRestoreCopiedSave')).toBeVisible();

  await page.locator('#btnDismissLegacyRestore').click();
  await expect(page.locator('#btnRestoreCopiedSave')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#btnRestoreCopiedSave')).toHaveCount(0);
});

test('an earned achievement clears instead of covering later screens', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => {
    CR.save.stats.golems = 1;
    CR.commit();
  });

  await expect(page.locator('#achPop')).toBeVisible();
  await expect(page.locator('#achPopName')).toHaveText('Iron Friend');
  await expect(page.locator('#achPop')).toBeHidden({ timeout: 5000 });
});

test('the top-right status corner is the one canonical version display and About keeps only its credits', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#verTag')).toHaveCount(1);
  await expect(page.locator('#verTag')).toHaveText(/^v\d+\.\d+\.\d+(?:-dev)?$/);

  await page.locator('#navMore').click();
  await page.locator('#btnAbout').click();
  await expect(page.locator('#about')).toBeVisible();
  await expect(page.locator('#aboutVersion')).toHaveCount(0);
  await expect(page.locator('.aboutMeta')).toHaveCount(0);
  await expect(page.locator('#about')).not.toContainText(/\bversion\b/i);
});

test('PLAY starts a run and the HUD shows, still no errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.click('#btnPlayShooter');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#btnPause')).toBeVisible();
  // the play area stays button-free; normal pace releases a charged golem by tap
  await expect(page.locator('#golemMeter')).toBeVisible();
  await expect(page.locator('#steerL')).toHaveCount(0);
  await expect(page.locator('#golemBtn')).toHaveCount(0);
  // a run takes the whole screen: the shell steps out of the way
  await expect(page.locator('#navbar')).toBeHidden();
  await expect(page.locator('#appMeta')).toBeHidden();
  await page.waitForTimeout(2500); // let the run play a couple seconds
  expect(errors).toEqual([]);
});

test('Bow Blitz fires only while the player holds and drags', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnPlayShooter');
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => CR.game.volleysFired)).toBe(0);
  await expect(page.locator('#powerChips')).toContainText('HOLD TO FIRE');

  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.72, { steps: 5 });
  await page.waitForTimeout(550);
  await expect(page.locator('#powerChips')).toContainText('FIRING');
  const held = await page.evaluate(() => ({ volleys: CR.game.volleysFired, targetX: CR.game.targetX }));
  expect(held.volleys).toBeGreaterThanOrEqual(2);
  expect(held.targetX).toBeGreaterThan(0.2);

  await page.mouse.up();
  const released = await page.evaluate(() => CR.game.volleysFired);
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => CR.game.volleysFired)).toBe(released);
  await expect(page.locator('#powerChips')).toContainText('HOLD TO FIRE');

  await page.evaluate(() => { CR.game.redstone = 100; });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.72);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  expect(await page.evaluate(() => ({ summons: CR.game.summons.length, redstone: CR.game.redstone })))
    .toEqual({ summons: 0, redstone: 100 });

  await page.mouse.down();
  expect(await page.evaluate(() => CR.game.firing)).toBe(true);
  await canvas.dispatchEvent('lostpointercapture');
  expect(await page.evaluate(() => CR.game.firing)).toBe(false);
  await page.mouse.up();

  await page.keyboard.down('f');
  expect(await page.evaluate(() => CR.game.firing)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => CR.game.firing)).toBe(false);
  await page.keyboard.up('f');
});

test('a standard boss shows armor stages and survives a burst', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnPlayShooter');
  await page.evaluate(() => {
    CR.game.playerZ = CR.game.length;
    CR.game.update(1 / 60);
    CR.game.boss.entering = false;
  });
  await expect(page.locator('#bossHint')).toContainText('ARMOR 2/2');

  const result = await page.evaluate(() => {
    const b = CR.game.boss;
    CR.game.damageBoss(b.maxHp * 10);
    return { hp: b.hp, phase: b.phase, shielded: b.shielded };
  });
  expect(result.phase).toBe(2);
  expect(result.hp).toBeGreaterThan(0);
  expect(result.shielded).toBeGreaterThan(0);
  await expect(page.locator('#bossHint')).toContainText('ARMOR BROKEN');
});

test('Gate Dash carries one hold into the boss and stops on release or blur', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnPlayGates');
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();

  await page.evaluate(() => {
    const par = CR.game.expectedBossArmy().power;
    CR.game.setWorth(par);
    CR.game.playerZ = CR.game.length;
    CR.game.update(1 / 60);
    CR.game.boss.entering = false;
    CR.game.boss.attackT = 999;
  });
  const idleHp = await page.evaluate(() => CR.game.boss.hp);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => CR.game.boss.hp)).toBe(idleHp);

  await page.evaluate(() => {
    CR.game.startRun();
    CR.game.setWorth(CR.game.expectedBossArmy().power);
  });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.72);
  await page.mouse.down();
  expect(await page.evaluate(() => CR.game.charging)).toBe(true);
  await page.evaluate(() => {
    CR.game.playerZ = CR.game.length;
    CR.game.update(1 / 60);
    CR.game.boss.entering = false;
    CR.game.boss.attackT = 999;
  });
  await expect(page.locator('#powerChips')).toContainText('CHARGING');
  expect(await page.evaluate(() => CR.game.charging)).toBe(true);
  const heldHp = await page.evaluate(() => CR.game.boss.hp);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => CR.game.boss.hp)).toBeLessThan(heldHp);

  await page.mouse.up();
  expect(await page.evaluate(() => CR.game.charging)).toBe(false);
  await expect(page.locator('#powerChips')).toContainText('HOLD TO CHARGE');
  const releasedHp = await page.evaluate(() => CR.game.boss.hp);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => CR.game.boss.hp)).toBe(releasedHp);

  await page.keyboard.down('f');
  expect(await page.evaluate(() => CR.game.charging)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => CR.game.charging)).toBe(false);
  await page.keyboard.up('f');

  const calmHp = await page.evaluate(() => {
    CR.save.speed = 'calm';
    CR.game.startRun();
    CR.game.setWorth(CR.game.expectedBossArmy().power);
    CR.game.playerZ = CR.game.length;
    CR.game.update(1 / 60);
    CR.game.boss.entering = false;
    CR.game.boss.attackT = 999;
    return CR.game.boss.hp;
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => CR.game.boss.hp)).toBeLessThan(calmHp);
});

test('CALM says clearly that the ready golem sends automatically', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => {
    CR.save.speed = 'calm';
    CR.commit();
  });
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#golemLabel')).toContainText('CALM · AUTO AT 100%');

  await page.evaluate(() => {
    CR.paused = true;
    CR.game.gainGolemCharge(1 / 3);
    const hud = CR.game.hudState();
    CR.nav.hud = { ...hud, boss: { ...hud.boss } };
  });
  await expect.poll(() => page.evaluate(() => CR.game.summons.length)).toBe(1);
  await expect(page.locator('#golemLabel')).toContainText('CALM · AUTO AT 100%');
});

test('a cycling chapter names the same biome on the menu and in the run', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => {
    window.CR.save.level = 3;
    window.CR.save.campaign.done = [];
  });

  await expect(page.locator('#menuLevel')).toHaveText('LV 3 · BLAZING DESERT');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#hudLevel')).toHaveText('LV 3 · Blazing Desert');
});

test('an authored milestone owns the same biome on the menu and in the run', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => {
    window.CR.save.level = 3;
    window.CR.save.campaign.done = ['mine_obsidian'];
    window.CR.save.inventory.obsidian = 10;
  });

  await expect(page.locator('#menuLevel')).toHaveText('LV 3 · THE NETHER');
  await page.locator('#btnPlayShooter').click();
  await expect(page.locator('#hudLevel')).toHaveText('LV 3 · The Nether');
});

test('run skill cues survive the real browser input and result flow', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnPlayShooter');
  await expect(page.locator('#runObjective')).toContainText('QUEST:');

  await page.evaluate(() => {
    const game = window.CR.game;
    window.CR.paused = true;
    game.obstacles = [{
      x: game.playerX,
      baseX: game.playerX,
      z: game.playerZ + 8,
      hp: 3,
      sprite: game.biome.obstacle,
      wobble: 0,
      stationary: true,
      directed: false,
      motion: null,
    }];
    game.redstone = game.hudState().redstoneMax;
    const hud = game.hudState();
    window.CR.nav.hud = { ...hud, boss: { ...hud.boss } };
  });
  await expect(page.locator('#golemLabel')).toHaveText('GOLEM READY · TAP');
  await page.locator('#gameCanvas').click({ position: { x: 215, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.CR.game.summons.length)).toBe(1);
  await page.evaluate(() => {
    const game = window.CR.game;
    for (let i = 0; i < 80 && game.mastery.usefulGolems === 0; i++) game.updateSummons(0.05);
  });
  await expect.poll(() => page.evaluate(() => window.CR.game.mastery.usefulGolems)).toBe(1);

  await page.evaluate(() => {
    const mastery = window.CR.game.mastery;
    mastery.gateChoices = 3;
    mastery.goodGates = 3;
    mastery.badGates = 0;
    mastery.missedGates = 0;
    window.CR.game.endRun(false);
  });
  await expect(page.locator('#masteryCallout')).toBeVisible();
  await expect(page.locator('#masteryCallout strong')).toHaveText(/[A-S]/);
  await expect(page.locator('#masteryCallout small')).not.toBeEmpty();
  await expect(page.locator('#resultNewBadges')).toContainText('Clean Line');
  await expect(page.locator('#resultMasteryRecord')).toBeVisible();
  await expect(page.locator('#resultMasteryRecord')).toContainText('NEW RECORD');
  await expect(page.locator('#resultNextTarget')).toContainText('Golem Ace');

  await page.reload();
  await expect(page.locator('#menuMasteryTarget')).toContainText('Golem Ace');
});

test('menu and Goals surface one concrete chapter mastery target', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => {
    CR.save.mastery = {
      chapters: {
        mine_obsidian: { bestGrade: 'A', bestCrowd: 321, badges: ['clean_line'] },
      },
    };
    CR.commit();
  });

  await expect(page.locator('#menuMasteryTarget')).toContainText('Golem Ace');
  await page.locator('#navMore').click();
  await page.locator('#btnGoals').click();
  await expect(page.locator('#goalsChapterSelect')).toHaveValue('mine_obsidian');
  await expect(page.locator('#masteryBestGrade')).toHaveText('A');
  await expect(page.locator('#masteryBestCrowd')).toHaveText('321');
  await expect(page.locator('#masteryBadges')).toContainText('Clean Line');
  await expect(page.locator('#goalsNextTarget')).toContainText('Golem Ace');
  await expect(page.locator('#achGrid')).toHaveCount(0);
  await page.locator('#goalsTabAchievements').click();
  await expect(page.locator('#achGrid .achRow').first()).toBeVisible();
  expect(await page.locator('#achGrid .achRow').count()).toBeGreaterThan(0);
  await expect(page.locator('#achCount')).toHaveText(/\d+\/\d+/);
});

test('completed campaigns can inspect each playable chapter without offering credits mastery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();
  await page.evaluate(() => {
    CR.save.campaign.done = [
      'mine_obsidian', 'portal', 'fortress', 'stronghold', 'dragon',
      'endcity', 'bastion', 'skulls', 'wither', 'credits',
    ];
    CR.save.mastery = {
      chapters: {
        portal: { bestGrade: 'A', bestCrowd: 44, badges: ['clean_line'] },
        wither: { bestGrade: 'S+', bestCrowd: 88, badges: ['clean_line', 'golem_ace'] },
      },
    };
    CR.commit();
  });

  await page.locator('#navMore').click();
  await page.locator('#btnGoals').click();

  const selector = page.locator('#goalsChapterSelect');
  await expect(selector).toHaveValue('wither');
  await expect(page.locator('#masteryBestGrade')).toHaveText('S+');
  await expect(page.locator('#masteryBestCrowd')).toHaveText('88');
  await expect(selector.locator('option[value="credits"]')).toHaveCount(0);
  expect(await selector.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

  await selector.selectOption('portal');
  await expect(page.locator('#masteryBestGrade')).toHaveText('A');
  await expect(page.locator('#masteryBestCrowd')).toHaveText('44');

  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const panel = document.querySelector('#achievements .panel').getBoundingClientRect();
    return {
      left: panel.left - stage.left,
      top: panel.top - stage.top,
      right: panel.right - stage.right,
      bottom: panel.bottom - stage.bottom,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(1);
  expect(geometry.bottom).toBeLessThanOrEqual(1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
});

test('mastery surfaces stay inside an iPhone-size stage', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btnPlayShooter').waitFor();

  const expectInsideStage = async (selector) => {
    const geometry = await page.evaluate((target) => {
      const stage = document.querySelector('#stage').getBoundingClientRect();
      const box = document.querySelector(target).getBoundingClientRect();
      return {
        left: box.left - stage.left,
        top: box.top - stage.top,
        right: box.right - stage.right,
        bottom: box.bottom - stage.bottom,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, selector);
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.right).toBeLessThanOrEqual(1);
    expect(geometry.bottom).toBeLessThanOrEqual(1);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
  };

  await expectInsideStage('#menu');
  await page.locator('#navMore').click();
  await page.locator('#btnGoals').click();
  await expectInsideStage('#achievements .panel');

  await page.evaluate(() => {
    CR.nav.result = {
      id: 'iphone-mastery-result',
      win: true,
      level: 1,
      emeralds: 42,
      bonus: 12,
      emeraldMul: 1,
      rods: 2,
      kills: 15,
      bestCrowd: 321,
      biome: 'Grassy Plains',
      mode: 'shooter',
      mastery: {
        grade: 'S',
        label: 'AMAZING!',
        praise: 'No runners lost',
        newBadges: ['clean_line', 'golem_ace', 'untouched'],
        record: { bestGrade: 'S', bestCrowd: 321 },
        nextTarget: { label: 'Build a crowd of 322' },
      },
    };
  });
  await expect(page.locator('#result')).toBeVisible();
  await expectInsideStage('#result .panel');
});

test('pause and resume work', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnPlayGates');
  await page.keyboard.down('f');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  expect(await page.evaluate(() => ({ paused: CR.game.paused, charging: CR.game.charging })))
    .toEqual({ paused: true, charging: false });
  const z = await page.evaluate(() => CR.game.playerZ);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => CR.game.playerZ)).toBe(z);
  await page.keyboard.up('f');
  await page.click('#btnResume');
  await expect(page.locator('#pause')).toBeHidden();
  expect(await page.evaluate(() => CR.game.paused)).toBe(false);
});

test('the focused bottom navigation exposes Play, Shop, and Settings', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.locator('.navTab')).toHaveCount(3);
  await expect(page.locator('.navTab[data-tab="play"]')).toBeVisible();
  await expect(page.locator('.navTab[data-tab="settings"]')).toBeVisible();
  await page.click('.navTab[data-tab="shop"]');
  await expect(page.locator('#shop')).toBeVisible();
  const kids = await page.locator('#shop .panel > *').count();
  expect(kids, 'shop tab renders content').toBeGreaterThan(1);
  await expect(page.locator('[data-tab="home"], [data-tab="world"], [data-tab="mine"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the bottom-left tab becomes BACK inside the More stack and walks back out', async ({ page }) => {
  await page.goto('/');
  await page.click('#navMore');
  await page.click('#btnAbout');
  await expect(page.locator('#about')).toBeVisible();
  await expect(page.locator('#tabPlayLabel')).toHaveText('Back');
  await page.click('.navTab[data-tab="play"]');
  await expect(page.locator('#more')).toBeVisible();
  await page.click('.navTab[data-tab="play"]');
  await expect(page.locator('#menu')).toBeVisible();
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

test('power, golem, objective, and boss HUD rows do not overlap', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btnPlayShooter').click();
  await page.evaluate(() => {
    const game = window.CR.game;
    game.power.triple = 10;
    game.redstone = game.hudState().redstoneMax;
    game.startBoss();
    game.boss.entering = false;
    game.boss.z = game.boss.targetZ;
    game.boss.attackT = 999;
  });
  await expect(page.locator('#powerChips')).toContainText('3×');
  await expect(page.locator('#runObjective')).toBeVisible();
  await expect(page.locator('#bossBar')).toBeVisible();

  const rows = await page.evaluate(() => {
    const rect = (id) => {
      const box = document.querySelector(id).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    };
    return [
      rect('#golemMeter'),
      rect('#powerChips'),
      rect('#runObjective'),
      rect('#bossBar'),
    ];
  });
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i - 1].bottom, `HUD rows ${i - 1} and ${i}`).toBeLessThanOrEqual(rows[i].top);
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

  await page.click('#navMore');
  await page.click('#btnAbout');
  await expect(page.locator('#about')).toBeVisible();

  await page.goBack();
  await expect(page.locator('#more')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#menu')).toBeVisible();

  // mid-run, back means "wait, stop" rather than "go somewhere"
  await page.click('#btnPlayShooter');
  await expect(page.locator('#hud')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await page.evaluate(() => CR.game.paused)).toBe(true);
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
