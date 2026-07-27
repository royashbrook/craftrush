import { test } from 'node:test';
import assert from 'node:assert/strict';

const noop = () => {};

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    const set = this.listeners.get(type) || new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  count() {
    return [...this.listeners.values()].reduce((n, set) => n + set.size, 0);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
}

function fakeCtx() {
  return new Proxy({ canvas: { width: 0, height: 0 } }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'measureText') return () => ({ width: 0 });
      return noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

test('Game.destroy removes input listeners and pending callbacks, and is idempotent', async () => {
  const browserWindow = new Events();
  globalThis.window = browserWindow;
  globalThis.document = {
    createElement: () => ({ getContext: () => fakeCtx() }),
    getElementById: () => null,
  };

  const canvas = Object.assign(new Events(), {
    width: 430,
    height: 900,
    getContext: () => fakeCtx(),
    setPointerCapture: noop,
  });
  const [{ Game }, { loadSave }] = await Promise.all([
    import('../js/game.js'),
    import('../js/config.js'),
  ]);
  const game = new Game(canvas, loadSave(), {
    onHud: noop,
    onRunEnd: noop,
    onTutorial: noop,
    onPause: noop,
  });

  assert.equal(canvas.count(), 5);
  assert.equal(browserWindow.count(), 2);
  game.state = 'run';
  game.save.speed = 'normal';
  game.redstone = 100;
  canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100 });
  canvas.dispatch('pointerup', { pointerId: 1, clientX: 100 });
  assert.equal(game.summons.length, 1, 'a tap releases a ready golem');

  game.redstone = 100;
  canvas.dispatch('pointerdown', { pointerId: 2, clientX: 100 });
  canvas.dispatch('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 120 });
  canvas.dispatch('pointerup', { pointerId: 2, clientX: 120 });
  assert.equal(game.summons.length, 1, 'a steering drag does not release another golem');

  game.redstone = 100;
  canvas.dispatch('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 });
  canvas.dispatch('pointerup', { pointerId: 3, clientX: 100, clientY: 120 });
  assert.equal(game.summons.length, 1, 'vertical travel is not mistaken for a tap');

  let interactivePrevented = false;
  browserWindow.dispatch('keydown', {
    code: 'Space',
    repeat: false,
    target: { tagName: 'TEXTAREA' },
    preventDefault: () => { interactivePrevented = true; },
  });
  assert.equal(interactivePrevented, false);
  assert.equal(game.summons.length, 1, 'Space remains available to interactive controls');

  browserWindow.dispatch('keydown', {
    code: 'Space', repeat: false, preventDefault: noop,
  });
  assert.equal(game.summons.length, 2, 'Space releases the charged golem');

  game.state = 'menu';
  game.redstone = 100;
  let menuPrevented = false;
  browserWindow.dispatch('keydown', {
    code: 'Space', repeat: false, preventDefault: () => { menuPrevented = true; },
  });
  assert.equal(menuPrevented, false);
  assert.equal(game.summons.length, 2, 'Space outside a run is left to the screen');

  let timerRan = false;
  game._later(() => { timerRan = true; }, 10);
  game.destroy();
  assert.equal(canvas.count(), 0);
  assert.equal(browserWindow.count(), 0);
  assert.doesNotThrow(() => game.destroy());
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(timerRan, false);
});
