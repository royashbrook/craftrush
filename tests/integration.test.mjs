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
    addEventListener: noop, setPointerCapture: noop };
}
globalThis.document = { createElement: () => fakeCanvas(), getElementById: () => null };
globalThis.window = { addEventListener: noop };

const { initAssets } = await import('../js/assets.js');
const { Game } = await import('../js/game.js');
const { loadSave } = await import('../js/config.js');
await initAssets();

function makeGame(overrides = {}) {
  const save = Object.assign(loadSave(), overrides); // loadSave returns defaults (no localStorage)
  const hooks = { onHud: noop, onRunEnd: noop, onTutorial: noop, onPause: noop };
  const g = new Game(fakeCanvas(), save, hooks);
  g.save.tutorialSeen = true;
  g.resize(430, 900);
  return g;
}

function runToBossDeath(g, maxTicks = 8000) {
  let ticks = 0;
  // steer toward good gates so the crowd grows
  while (g.state === 'run' && ticks < maxTicks) {
    const ng = g.gates.filter((x) => !x.used && x.z > g.playerZ).sort((a, b) => a.z - b.z)[0];
    if (ng) {
      const pair = g.gates.filter((x) => x.z === ng.z);
      const good = pair.filter((x) => x.op === 'add' || x.op === 'mul');
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

test('every biome including the fortress renders and plays a few seconds', () => {
  for (let level = 1; level <= 9; level++) {
    const g = makeGame({ mode: 'shooter', level });
    assert.doesNotThrow(() => {
      g.startRun();
      g.setWorth(80, true);
      for (let i = 0; i < 300; i++) { g.update(1 / 60); g.render(); }
    }, `level ${level} (${g.biome.id}) should not throw`);
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
