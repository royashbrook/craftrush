import { COHORT_ORDER } from '../tests/support/balance-cohorts.mjs';
import {
  measureIntrinsicBoss,
  measureActiveBoss,
  simulateBalanceRun,
  summarizeRuns,
} from '../tests/support/balance-simulator.mjs';

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

const intrinsic = [];
const active = [];
for (const mode of ['shooter', 'gates']) {
  for (const level of [1, 6, 12, 20]) {
    for (const arrivalMultiple of [1, 2, 5]) {
      intrinsic.push(measureIntrinsicBoss({ mode, level, arrivalMultiple }));
      if (arrivalMultiple <= 2) active.push(measureActiveBoss({ mode, level, arrivalMultiple }));
    }
  }
}

const bandFor = (level) => level <= 3 ? '1-3' : level <= 10 ? '4-10' : '11-20';
const levelBands = [];
for (const mode of ['shooter', 'gates']) {
  for (const cohort of COHORT_ORDER) {
    for (const band of ['1-3', '4-10', '11-20']) {
      const selected = runs.filter((run) => run.mode === mode && run.cohort === cohort
        && bandFor(run.level) === band);
      levelBands.push({
        mode, cohort, band, runs: selected.length,
        winRate: selected.filter((run) => run.win).length / selected.length,
      });
    }
  }
}

console.log(JSON.stringify({ summary: summarizeRuns(runs), levelBands, intrinsic, active }, null, 2));
