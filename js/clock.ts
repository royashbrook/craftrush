// Simulation seconds, not display frames. The existing balance fixtures use
// 60 Hz; three ticks preserve the former 50 ms catch-up ceiling. Excess time
// is dropped rather than making a resumed or overloaded game race to catch up.
export const SIMULATION_STEP = 1 / 60;
const MAX_CATCH_UP = 3 * SIMULATION_STEP;

export function simulationClock() {
  let remainder = 0;
  return {
    advance(elapsed: number, paused: boolean, update: (seconds: number) => void) {
      if (paused || !Number.isFinite(elapsed) || elapsed < 0) { remainder = 0; return; }
      remainder += Math.min(MAX_CATCH_UP, elapsed);
      // Nanosecond tolerance only absorbs addition rounding at exact ticks.
      let steps = Math.min(3, Math.floor((remainder + 1e-9) / SIMULATION_STEP));
      remainder = Math.max(0, remainder - steps * SIMULATION_STEP);
      while (steps-- > 0) update(SIMULATION_STEP);
    },
  };
}
