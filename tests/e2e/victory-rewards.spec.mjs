import { test, expect } from '@playwright/test';

for (const mode of ['Shooter', 'Gates']) {
  test(`a high-level saved run wins without allocating an unbounded fountain (${mode})`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('craftrush_save_v1', JSON.stringify({ level: 1e12, emeralds: 17 }));
    });
    await page.goto('/');
    await page.locator(`#btnPlay${mode}`).click();
    const receipt = await page.evaluate(() => {
      const game = window.CR.game;
      const loadedLevel = game.level;
      game.playerZ = game.length;
      game.startBoss();
      game.enemies = [];
      game.pickups = [];
      game.gates = [];
      game.obstacles = [];
      // Stop the old allocator safely at 65, not after a hang/OOM.
      game.pickups.push = function (p) {
        if (this.length >= 64) throw new Error('Unbounded victory fountain');
        return Array.prototype.push.call(this, p);
      };
      game.bossDefeated();
      const count = game.pickups.length;
      const quantity = game.pickups.reduce((total, p) => total + (p.quantity ?? 1), 0);
      game.updateGatesObstaclesPickups(1);
      return { loadedLevel, count, quantity, remaining: game.pickups.length };
    });
    expect(receipt).toEqual({ loadedLevel: 1e12, count: 64, quantity: 2e12 + 8, remaining: 0 });
    await expect(page.locator('#result')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('craftrush_save_v1')));
    expect(saved.level).toBe(1e12 + 1);
    expect(Number.isFinite(saved.emeralds)).toBe(true);
    expect(saved.emeralds).toBeGreaterThan(17);
  });
}
