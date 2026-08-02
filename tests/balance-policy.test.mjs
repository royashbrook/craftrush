import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COHORT_ORDER, TARGET_WIN_BANDS } from './support/balance-cohorts.mjs';
import {
  measureActiveBoss,
  measureIntrinsicBoss,
  simulateBalanceRun,
  summarizeRuns,
} from './support/balance-simulator.mjs';

const LEVEL_BANDS = Object.freeze([
  { name: 'early', levels: [1, 2, 3], low: 0.8, high: 1 },
  { name: 'mid', levels: [4, 5, 6, 7, 8, 9, 10], low: 0.7, high: 1 },
  { name: 'late', levels: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], low: 0.45, high: 0.7 },
]);

test('five deterministic cohorts expose a real skill gradient', { timeout: 30000 }, () => {
  const runs = [];
  for (const mode of ['shooter', 'gates']) {
    for (const cohort of COHORT_ORDER) {
      for (let level = 1; level <= 20; level++) {
        for (const behaviorSeed of [1, 2, 3, 4]) {
          runs.push(simulateBalanceRun({ mode, level, cohort, behaviorSeed }));
        }
      }
    }
  }
  const summary = summarizeRuns(runs);
  for (const mode of ['shooter', 'gates']) {
    const get = (cohort) => summary.find((row) => row.mode === mode && row.cohort === cohort);
    for (const cohort of COHORT_ORDER) {
      const [low, high] = TARGET_WIN_BANDS[cohort];
      assert.ok(get(cohort).winRate >= low && get(cohort).winRate <= high,
        `${mode} ${cohort} win rate ${get(cohort).winRate} must stay in ${low}-${high}`);
    }
    assert.ok(get('noisy').winRate > get('lazy').winRate,
      `${mode} better execution must beat lazy play`);
    assert.ok(get('skilled').winRate > get('greedy').winRate,
      `${mode} hazard reads must beat blind greed`);
  }
  for (const cohort of COHORT_ORDER) {
    const shooter = summary.find((row) => row.mode === 'shooter' && row.cohort === cohort);
    const gates = summary.find((row) => row.mode === 'gates' && row.cohort === cohort);
    assert.ok(Math.abs(shooter.winRate - gates.winRate) <= 0.100001,
      `${cohort} mode gap must stay within 10 points`);
  }

  for (const mode of ['shooter', 'gates']) {
    const rates = LEVEL_BANDS.map(({ name, levels, low, high }) => {
      const selected = runs.filter((run) => run.mode === mode && run.cohort === 'noisy'
        && levels.includes(run.level));
      const rate = selected.filter((run) => run.win).length / selected.length;
      assert.ok(rate >= low && rate <= high,
        `${mode} noisy ${name} win rate ${rate} must stay in ${low}-${high}`);
      return rate;
    });
    assert.ok(rates[2] < rates[1], `${mode} late levels must be tougher than mid levels`);
  }
});

test('cohort simulation is repeatable but behavior seeds explore different runs', () => {
  const sample = { mode: 'gates', level: 12, cohort: 'noisy' };
  const first = simulateBalanceRun({ ...sample, behaviorSeed: 1 });
  assert.deepEqual(simulateBalanceRun({ ...sample, behaviorSeed: 1 }), first);

  const variations = [2, 3, 4].map((behaviorSeed) =>
    simulateBalanceRun({ ...sample, behaviorSeed }));
  assert.ok(variations.some((run) => JSON.stringify(run) !== JSON.stringify(first)),
    'behavior seeds must explore more than one deterministic policy path');
});

test('boss metrics count resolved beats once even when a remix paints several lanes', () => {
  const run = simulateBalanceRun({ mode: 'gates', level: 1, cohort: 'skilled', behaviorSeed: 3 });
  assert.ok(run.bossWarnings >= 2, 'the encounter exposes multiple warned beats');
  assert.ok(run.bossResolved >= 2, 'the encounter resolves multiple beats');
  assert.ok(run.bossResolved <= run.bossWarnings, 'multi-lane warnings are deduplicated by beat');
});

test('active par bosses start three attack beats and 2x bosses start two', () => {
  for (const mode of ['shooter', 'gates']) {
    for (const level of [1, 6, 12, 20]) {
      const par = measureActiveBoss({ mode, level, arrivalMultiple: 1 });
      const strong = measureActiveBoss({ mode, level, arrivalMultiple: 2 });
      assert.equal(par.won, true);
      assert.equal(strong.won, true);
      assert.ok(par.actionsStarted >= 3,
        `${mode} level ${level} par starts ${par.actionsStarted} attack beats`);
      assert.ok(strong.actionsStarted >= 2,
        `${mode} level ${level} 2x starts ${strong.actionsStarted} attack beats`);
    }
  }
});

test('intrinsic boss TTK stays in the v1.9 arrival-strength bands', () => {
  const bands = new Map([
    [1, [11.8, 14.1]],
    [2, [9, 10.2]],
    [5, [7, 7.9]],
  ]);
  for (const mode of ['shooter', 'gates']) {
    for (const level of [1, 6, 12, 20]) {
      for (const [arrivalMultiple, [low, high]] of bands) {
        const result = measureIntrinsicBoss({ mode, level, arrivalMultiple });
        assert.equal(result.won, true);
        assert.ok(result.seconds >= low && result.seconds <= high,
          `${mode} level ${level} at ${arrivalMultiple}x took ${result.seconds}s, expected ${low}-${high}s`);
      }
    }
  }
});
