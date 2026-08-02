export const BALANCE_COHORTS = Object.freeze({
  passive: Object.freeze({
    label: 'Passive', reaction: Infinity, attackDuty: { shooter: 0, gates: 0 }, gateAccuracy: 0,
    trackDodge: 0, bossDodge: { shooter: 0, gates: 0 }, aimAccuracy: 0, golemUse: 0,
  }),
  lazy: Object.freeze({
    label: 'Lazy', reaction: 0.8, attackDuty: { shooter: 0.62, gates: 0.95 }, gateAccuracy: 0.6,
    trackDodge: 0.4, bossDodge: { shooter: 0.45, gates: 0.45 }, aimAccuracy: 0.6, golemUse: 0.25,
  }),
  noisy: Object.freeze({
    label: 'Noisy', reaction: 0.28, attackDuty: { shooter: 0.72, gates: 0.95 }, gateAccuracy: 0.8,
    trackDodge: 0.72, bossDodge: { shooter: 0.72, gates: 0.72 }, aimAccuracy: 0.82, golemUse: 0.65,
  }),
  greedy: Object.freeze({
    label: 'Greedy', reaction: 0.18, attackDuty: { shooter: 0.78, gates: 0.98 }, gateAccuracy: 1,
    trackDodge: 0.18, bossDodge: { shooter: 0.25, gates: 0.35 }, aimAccuracy: 0.9, golemUse: 0.8,
  }),
  skilled: Object.freeze({
    label: 'Skilled', reaction: 0.1, attackDuty: { shooter: 0.84, gates: 0.98 }, gateAccuracy: 0.93,
    trackDodge: 0.9, bossDodge: { shooter: 0.9, gates: 0.9 }, aimAccuracy: 0.96, golemUse: 0.95,
  }),
});

export const COHORT_ORDER = Object.freeze(['passive', 'lazy', 'noisy', 'greedy', 'skilled']);

export const TARGET_WIN_BANDS = Object.freeze({
  passive: [0, 0.05],
  lazy: [0.2, 0.4],
  greedy: [0.35, 0.6],
  noisy: [0.55, 0.75],
  skilled: [0.85, 0.95],
});
