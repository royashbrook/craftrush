import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulationClock, SIMULATION_STEP } from '../js/clock.ts';

test('30/60/120 Hz presentations feed identical 60 Hz simulation ticks', () => {
  const traces = [30, 60, 120].map(hz => {
    const clock = simulationClock(), ticks = [];
    for (let frame = 0; frame < hz * 5; frame++) clock.advance(1 / hz, false, dt => ticks.push(dt));
    return ticks;
  });
  assert.deepEqual(traces[0], Array(300).fill(SIMULATION_STEP));
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});

test('stall catch-up is bounded and paused time never joins a later tick', () => {
  const clock = simulationClock(), ticks = [];
  const update = dt => ticks.push(dt);
  clock.advance(30, false, update);
  assert.equal(ticks.length, 3, 'a thirty-second stall cannot advance more than 50ms');
  clock.advance(0, false, update);
  assert.equal(ticks.length, 3, 'discarded stall time is not deferred to later frames');
  clock.advance(SIMULATION_STEP / 2, false, update);
  clock.advance(100, true, update);
  clock.advance(SIMULATION_STEP / 2, false, update);
  assert.equal(ticks.length, 3, 'pause discards the old half-frame');
  clock.advance(SIMULATION_STEP / 2, false, update);
  assert.equal(ticks.length, 4);
});

test('invalid clock samples cannot poison later frames', () => {
  const clock = simulationClock(), ticks = [];
  for (const dt of [NaN, Infinity, -1]) clock.advance(dt, false, value => ticks.push(value));
  clock.advance(SIMULATION_STEP, false, value => ticks.push(value));
  assert.deepEqual(ticks, [SIMULATION_STEP]);
});
