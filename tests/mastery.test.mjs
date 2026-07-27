import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMastery, finishMastery, objectiveState, recordDamage, recordDodge, recordGate,
} from '../js/mastery.js';

test('the same run facts always produce the same grade', () => {
  const facts = createMastery(null, 4);
  recordGate(facts, true);
  recordGate(facts, true, true);
  recordDodge(facts, true);
  recordDamage(facts, 2);
  const input = { win: true, finalCrowd: 18, bestCrowd: 22, kills: 7 };
  assert.deepEqual(finishMastery(structuredClone(facts), input), finishMastery(structuredClone(facts), input));
});

test('a smarter line earns a better grade without changing a reward', () => {
  const rough = createMastery(null, 4);
  recordGate(rough, null);
  recordGate(rough, false);
  recordDamage(rough, 8);

  const smart = createMastery(null, 4);
  recordGate(smart, true);
  recordGate(smart, true, true);
  recordGate(smart, true);
  recordDodge(smart, true);

  const ending = { win: true, finalCrowd: 20, bestCrowd: 24, kills: 5 };
  const roughGrade = finishMastery(rough, ending);
  const smartGrade = finishMastery(smart, ending);
  assert.ok(smartGrade.score > roughGrade.score);
  assert.notEqual(smartGrade.grade, roughGrade.grade);
  assert.equal('emeralds' in smartGrade, false);
});

test('chapter objectives report live progress and completion', () => {
  const mastery = createMastery({
    objective: { kind: 'goodGates', target: 3, text: 'Pick 3 growing gates' },
  }, 4);
  recordGate(mastery, true);
  recordGate(mastery, true);
  assert.deepEqual(objectiveState(mastery), {
    text: 'Pick 3 growing gates', current: 2, target: 3, done: false,
  });
  recordGate(mastery, true);
  assert.equal(objectiveState(mastery).done, true);
  assert.match(finishMastery(mastery, {
    win: true, finalCrowd: 12, bestCrowd: 12, kills: 0,
  }).praise, /^Quest done:/);
});

test('a finish-crowd objective keeps the boss-arrival result', () => {
  const mastery = createMastery({
    objective: { kind: 'finishCrowd', target: 12, text: 'Bring 12 runners to the boss' },
  }, 4);
  const result = finishMastery(mastery, {
    win: true,
    finalCrowd: 3,
    finishCrowd: 18,
    bestCrowd: 24,
    kills: 0,
  });
  assert.equal(result.objective.done, true);
  assert.equal(result.objective.current, 12);
});
