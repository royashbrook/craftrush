// Pure run-mastery bookkeeping. These facts explain play; they never change
// rewards, progression, or the save schema.

const GRADE_STEPS = [
  [90, 'S', 'AMAZING!'],
  [78, 'A', 'AWESOME!'],
  [64, 'B', 'NICE RUN!'],
  [48, 'C', 'GOOD TRY!'],
  [0, 'D', 'KEEP GOING!'],
];

export function createMastery(chapter, startCrowd) {
  return {
    gateChoices: 0,
    goodGates: 0,
    badGates: 0,
    missedGates: 0,
    riskyGates: 0,
    combo: 0,
    maxCombo: 0,
    dodges: 0,
    nearMisses: 0,
    damageTaken: 0,
    startCrowd,
    objective: chapter?.objective ? { ...chapter.objective } : null,
  };
}

export function recordGate(mastery, good, risky = false) {
  if (!mastery) return 0;
  mastery.gateChoices++;
  if (good === true) {
    mastery.goodGates++;
    mastery.combo++;
    if (risky) mastery.riskyGates++;
  } else {
    mastery.combo = 0;
    if (good === false) mastery.badGates++;
    else mastery.missedGates++;
  }
  mastery.maxCombo = Math.max(mastery.maxCombo, mastery.combo);
  return mastery.combo;
}

export function recordDamage(mastery, amount) {
  if (mastery) mastery.damageTaken += Math.max(0, amount || 0);
}

export function recordDodge(mastery, near = false) {
  if (!mastery) return;
  mastery.dodges++;
  if (near) mastery.nearMisses++;
}

export function objectiveState(mastery, facts = {}) {
  const objective = mastery?.objective;
  if (!objective) return null;
  let current = 0;
  if (objective.kind === 'goodGates') current = mastery.goodGates;
  else if (objective.kind === 'dodges') current = mastery.dodges;
  else if (objective.kind === 'combo') current = mastery.maxCombo;
  else if (objective.kind === 'finishCrowd') {
    current = facts.finishCrowd ?? facts.finalCrowd ?? mastery.startCrowd;
  }
  const target = Math.max(1, objective.target || 1);
  return {
    text: objective.text,
    current: Math.min(target, Math.max(0, current)),
    target,
    done: current >= target,
  };
}

export function finishMastery(mastery, {
  win, finalCrowd, finishCrowd = finalCrowd, bestCrowd, kills,
}) {
  const m = mastery || createMastery(null, 0);
  const best = Math.max(1, bestCrowd || m.startCrowd || finalCrowd || 1);
  const choices = Math.max(1, m.gateChoices);
  const objective = objectiveState(m, { finalCrowd, finishCrowd });
  const score = Math.max(0, Math.min(100, Math.round(
    (win ? 15 : 0)
    + (m.goodGates / choices) * 25
    + Math.max(0, 1 - m.damageTaken / best) * 20
    + Math.min(1, Math.max(0, finalCrowd) / best) * 15
    + Math.min(15, m.dodges * 5)
    + Math.min(10, m.maxCombo * 2)
    + (objective?.done ? 5 : 0)
  )));
  const [_, grade, label] = GRADE_STEPS.find(([minimum]) => score >= minimum);

  let praise;
  if (objective?.done) praise = `Quest done: ${objective.text}`;
  else if (m.nearMisses > 0) praise = `${m.nearMisses} close dodge${m.nearMisses === 1 ? '' : 's'}`;
  else if (m.dodges > 0) praise = `${m.dodges} boss attack${m.dodges === 1 ? '' : 's'} dodged`;
  else if (m.maxCombo >= 2) praise = `${m.maxCombo} smart choices in a row`;
  else if (m.goodGates > 0) praise = `${m.goodGates} growing gate${m.goodGates === 1 ? '' : 's'} picked`;
  else if (m.damageTaken === 0) praise = 'No runners lost';
  else praise = `Built a crowd of ${best}`;

  return {
    ...m,
    win: !!win,
    finalCrowd: Math.max(0, finalCrowd),
    bestCrowd: best,
    kills: kills || 0,
    score,
    grade,
    label,
    praise,
    objective,
  };
}
