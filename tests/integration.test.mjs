// Headless integration: drive the REAL Game class through full runs in Node
// with a stubbed DOM/canvas, so a broken import or cross-module regression
// surfaces here even without a browser. Audio is already a no-op in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- minimal DOM stubs, installed before importing the game modules ---
const noop = () => {};
function fakeCtx() {
  return new Proxy({ canvas: { width: 0, height: 0 } }, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'measureText') return () => ({ width: 0 });
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function fakeCanvas(w = 0, h = 0) {
  return { width: w, height: h, getContext: () => fakeCtx(), toDataURL: () => 'data:,',
    addEventListener: noop, removeEventListener: noop, setPointerCapture: noop };
}
globalThis.document = { createElement: () => fakeCanvas(), getElementById: () => null };
globalThis.window = { addEventListener: noop, removeEventListener: noop };

const { initAssets } = await import('../js/assets.ts');
const { Game } = await import('../js/game.ts');
const { BIOMES, CAMPAIGN, TUNE, loadSave } = await import('../js/config.ts');
const { finishRunSettlement } = await import('../js/settlement.ts');
const { simulationClock } = await import('../js/clock.ts');
await initAssets();

function makeGame(overrides = {}, hookOverrides = {}) {
  const save = Object.assign(loadSave(), overrides); // loadSave returns defaults (no localStorage)
  const hooks = { onHud: noop, onRunEnd: noop, onTutorial: noop, onPause: noop, ...hookOverrides };
  const g = new Game(fakeCanvas(), save, hooks);
  g.save.tutorialSeen = true;
  g.resize(430, 900);
  return g;
}

test('the real game follows the same input/tick trace at 30, 60 and 120 display Hz', () => {
  const random = Math.random;
  try {
    const traces = [30, 60, 120].map(hz => {
      Math.random = () => 0.5;
      const game = makeGame({ mode: 'shooter', level: 1 });
      game.startRun();
      const clock = simulationClock(), trace = [];
      let tick = 0;
      for (let frame = 0; frame < hz * 8; frame++) {
        clock.advance(1 / hz, false, dt => {
          game.targetX = tick < 180 ? -1 : 1;
          game.firing = tick >= 60 && tick < 300;
          game.update(dt);
          trace.push([game.t, game.playerX, game.playerZ, game.armyPower(), game.volleysFired,
            game.kills, game.runEmeralds, game.state, JSON.stringify(game.mastery)]);
          tick++;
        });
      }
      const snapshot = JSON.stringify(trace);
      game.destroy();
      return snapshot;
    });
    assert.equal(traces[0], traces[1]);
    assert.equal(traces[1], traces[2]);
  } finally { Math.random = random; }
});

function runToBossDeath(g, maxTicks = 8000) {
  let ticks = 0;
  if (g.mode === 'shooter') g.firing = true;
  if (g.mode === 'gates') g.charging = true;
  // steer toward good gates so the crowd grows
  while (g.state === 'run' && ticks < maxTicks) {
    const ng = g.gates.filter((x) => !x.used && x.z > g.playerZ).sort((a, b) => a.z - b.z)[0];
    if (ng) {
      const pair = g.gates.filter((x) => x.z === ng.z);
      const good = pair.filter((x) => x.op === 'add' || x.op === 'mul' || x.op === 'scale');
      if (good.length) g.targetX = good[0].x;
    }
    g.update(1 / 60); g.render(); ticks++;
  }
  while (!g.bossDead && ticks < maxTicks) { g.update(1 / 60); g.render(); ticks++; }
  return ticks;
}

test('a full shooter run reaches and defeats the boss without throwing', () => {
  const g = makeGame({ mode: 'shooter', level: 1 });
  assert.doesNotThrow(() => {
    g.startRun();
    g.setWorth(200, true);
    runToBossDeath(g);
  });
  assert.equal(g.bossDead, true, 'boss should die');
});

test('a full gates run also completes and defeats the boss', () => {
  const g = makeGame({ mode: 'gates', level: 3 });
  assert.doesNotThrow(() => {
    g.startRun();
    g.setWorth(200, true);
    runToBossDeath(g);
  });
  assert.equal(g.bossDead, true);
});

test('the opening gathering chapter actually pilots Plains, Forest, and Desert', () => {
  const seen = [];
  for (const level of [1, 2, 3]) {
    const g = makeGame({ level });
    g.startRun();
    seen.push(g.biome.id);
    assert.equal(g.chapter.id, 'mine_obsidian');
    g.destroy();
  }
  assert.deepEqual(seen, ['plains', 'forest', 'desert']);
});

test('authored milestone chapters still own their biome', () => {
  const g = makeGame({
    level: 3,
    campaign: { done: ['mine_obsidian'] },
    inventory: { obsidian: 12 },
  });
  g.startRun();
  assert.equal(g.chapter.id, 'portal');
  assert.equal(g.biome.id, 'nether');
  g.destroy();
});

test('the engine marks the credits result so settlement can exclude it from mastery', () => {
  let result;
  const g = makeGame(
    { campaign: { done: CAMPAIGN.filter((chapter) => !chapter.credits).map((chapter) => chapter.id) } },
    { onRunEnd: (value) => { result = value; } },
  );
  g.startRun();
  assert.equal(g.chapter.id, 'credits');
  assert.equal(g.chapter.credits, true);
  g.endRun(true);
  assert.equal(result.chapter.id, 'credits');
  assert.equal(result.chapter.credits, true);
  assert.equal(result.chapter.coda, false);
  g.destroy();
});

test('a real engine result reaches the settlement boundary exactly once', () => {
  let result;
  let persists = 0;
  let backups = 0;
  const g = makeGame(
    { mode: 'shooter', level: 2 },
    { onRunEnd: (value) => { result = value; } },
  );
  g.startRun();
  g.chapter = null;
  g.runEmeralds = 7;
  g.runRods = 2;
  g.kills = 5;
  g.bestCrowd = 24;
  g.endRun(true);

  assert.ok(result.id);
  assert.equal(result.biomeId, g.biome.id);
  const settled = finishRunSettlement(g.save, result, {
    now: Date.UTC(2026, 6, 27),
    persist: () => { persists++; return true; },
    backup: () => { backups++; },
  });
  assert.equal(settled.applied, true);
  assert.equal(g.save.stats.runs, 1);
  assert.equal(g.save.stats.kills, 5);
  assert.equal(g.save.stats.wins, 1);
  assert.equal(g.save.inventory.blazeRods, 2);
  assert.equal(g.save.emeralds, result.settlement.banked);
  assert.equal(persists, 1);
  assert.equal(backups, 1);

  const saved = JSON.stringify(g.save);
  const duplicate = finishRunSettlement(g.save, result, {
    persist: () => { persists++; return true; },
    backup: () => { backups++; },
  });
  assert.equal(duplicate.applied, false);
  assert.equal(JSON.stringify(g.save), saved);
  assert.equal(persists, 1);
  assert.equal(backups, 1);
  g.destroy();
});

test('every biome including the fortress renders and plays a few seconds', () => {
  for (let level = 1; level <= 9; level++) {
    const g = makeGame({ mode: 'shooter', level });
    assert.doesNotThrow(() => {
      g.startRun();
      g.setWorth(80, true);
      for (let i = 0; i < 300; i++) { g.update(1 / 60); g.render(); }
    }, `level ${level} (${g.biome.id}) should not throw`);
    assert.equal(g.biome.id, BIOMES[level - 1].id);
  }
});

test('a multiply gate scales the whole army worth (end to end)', () => {
  const g = makeGame({ mode: 'gates', level: 1 });
  g.startRun();
  g.setWorth(4000, true);
  const before = g.armyPower();
  g.applyGate({ x: 0, z: g.playerZ, halfW: 2, op: 'mul', val: 2, used: false });
  // x2 doubles the WHOLE army's power (may cross a graduation, which preserves power)
  assert.ok(Math.abs(g.armyPower() - before * 2) <= 3, `power ${g.armyPower()} ~= ${before * 2}`);
});

test('a good gate creates a visible crowd-impact beat', () => {
  const g = makeGame({ mode: 'gates', level: 1 });
  g.startRun();
  const before = g.worth();
  g.applyGate({ x: 0, z: g.playerZ, halfW: 2, op: 'mul', val: 2, used: false });
  assert.equal(g.worth(), before * 2);
  assert.equal(g.crowdPulse, 1);
  assert.ok(g.freeze > 0);
  assert.ok(g.rings.length > 0);
  assert.ok(g.particles.length >= 20);
});

test('the automatic relief gate catches every lane without pretending to be a choice', () => {
  for (const x of [-3.1, 0, 3.1]) {
    const g = makeGame({ mode: 'gates', level: 8 });
    g.startRun();
    g.setWorth(10);
    g.playerX = x;
    g.targetX = x;
    g.gates = [{
      x: 0, z: g.playerZ, halfW: TUNE.laneHalf + TUNE.gateHitMargin,
      op: 'mul', val: 3, automatic: true, used: false, pulse: 0,
    }];
    const choices = g.mastery.gateChoices;
    g.updateGatesObstaclesPickups(1 / 60);
    assert.equal(g.worth(), 30, `lane ${x} receives the relief reward`);
    assert.equal(g.mastery.gateChoices, choices, 'automatic growth is not mastery credit');
    g.updateGatesObstaclesPickups(1 / 60);
    assert.equal(g.worth(), 30, 'the reward applies exactly once');
    g.destroy();
  }
});

test('one crowded volley emits one gate spark instead of one per arrow', () => {
  const g = makeGame({ mode: 'shooter', level: 1 });
  g.startRun();
  const gate = { x: 0, z: g.playerZ + 5, op: 'add', val: 2, hits: 0, pulse: 0 };
  g.volleysFired = 1;
  for (let i = 0; i < 4; i++) g.shootGate(gate);
  assert.equal(g.particles.length, 3);
  g.volleysFired = 2;
  g.shootGate(gate);
  assert.equal(gate.val, 3);
  assert.ok(g.particles.length <= 20, 'the upgrade adds one bounded celebration');
});

test('a giant-heavy army collects emeralds it runs over (integration)', () => {
  const g = makeGame({ mode: 'shooter', level: 1 });
  g.startRun();
  g.setWorth(6000, true); // mostly giants
  g.pickups.length = 0;
  let placed = 0;
  for (let lane = -3; lane <= 3; lane++) { g.pickups.push({ kind: 'emerald', x: lane, z: g.playerZ + 3, t: 0 }); placed++; }
  const before = g.runEmeralds;
  for (let i = 0; i < 120; i++) { g.update(1 / 60); }
  const leftBehind = g.pickups.filter((p) => p.kind === 'emerald' && !p.dead && p.z < g.playerZ - 2.4).length;
  assert.ok(g.runEmeralds - before >= placed, 'all placed emeralds collected');
  assert.equal(leftBehind, 0, 'nothing run over is left behind');
});

// The dragon's crystals are the whole point of her fight: while one stands she
// must not be damageable in EITHER mode. Gate Dash has no arrows, so the crowd
// charge has to break them or she could never be beaten at all.
for (const mode of ['shooter', 'gates']) {
  test(`the dragon takes nothing while a crystal stands (${mode})`, () => {
    const g = makeGame({
      mode,
      campaign: { done: ['mine_obsidian', 'portal', 'fortress', 'stronghold'] },
      inventory: { enderEyes: 12 },
    });
    g.startRun();
    if (mode === 'shooter') g.firing = true;
    if (mode === 'gates') g.charging = true;
    assert.equal(g.chapter && g.chapter.id, 'dragon', 'this is her fight');
    g.playerZ = g.length;
    g.setWorth(20000);
    g.update(1 / 60);
    assert.equal(g.state, 'boss');
    assert.ok(g.crystals.length >= 4, 'the crystals are up');

    const b = g.boss, hp0 = b.hp;
    let guardedLow = b.hp;
    for (let i = 0; i < 180; i++) {
      g.update(1 / 60);
      if (b.guarded) guardedLow = Math.min(guardedLow, b.hp);
      if (!g.crystals.some((c) => !c.dead)) break;
    }
    assert.ok(guardedLow >= hp0, `she healed or held while guarded (${hp0} -> ${guardedLow})`);

    if (mode === 'gates') {
      assert.ok(g.crystals.some((c) => c.dead), 'the crowd can actually break them');
    }

    // with them all down she is finally there to be hit
    for (const c of g.crystals) if (!c.dead) g.crystalDown(c);
    g.update(1 / 60);
    const hp1 = b.hp;
    for (let i = 0; i < 180; i++) g.update(1 / 60);
    assert.ok(b.hp < hp1, 'now she takes real damage');
  });
}
