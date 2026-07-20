import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyExpedition, weekKey, dayKey, recordExpedition, expeditionStatus } from '../js/config.js';

test('the expedition is the same theme all week and rotates by week', () => {
  // a Monday and the Sunday of the same week
  const mon = new Date(2026, 6, 20, 12);
  const sun = new Date(2026, 6, 26, 12);
  const nextMon = new Date(2026, 6, 27, 12);
  const a = dailyExpedition(dayKey(mon), weekKey(mon)).id;
  const b = dailyExpedition(dayKey(sun), weekKey(sun)).id;
  const c = dailyExpedition(dayKey(nextMon), weekKey(nextMon)).id;
  assert.equal(a, b, 'Mon and Sun of one week share a theme');
  assert.notEqual(b, c, 'the theme rotates on Monday');
});

test('streak increments on consecutive days and resets after a gap', () => {
  const save = { expedition: { lastDay: null, streak: 0 } };
  const d1 = dayKey(new Date(2026, 6, 20));
  const d2 = dayKey(new Date(2026, 6, 21));
  const d4 = dayKey(new Date(2026, 6, 23)); // skip a day

  const r1 = recordExpedition(save, d1);
  assert.deepEqual([r1.streak, r1.first], [1, true]);

  const r1again = recordExpedition(save, d1); // same day: no repeat reward
  assert.equal(r1again.first, false);
  assert.equal(save.expedition.streak, 1);

  const r2 = recordExpedition(save, d2);
  assert.deepEqual([r2.streak, r2.first], [2, true]);

  const r4 = recordExpedition(save, d4);
  assert.deepEqual([r4.streak, r4.first], [1, true], 'a missed day resets the streak');
});

test('expeditionStatus reports doneToday correctly', () => {
  const d = dayKey(new Date(2026, 6, 20));
  const save = { expedition: { lastDay: d, streak: 3 } };
  const st = expeditionStatus(save, d);
  assert.equal(st.doneToday, true);
  assert.equal(st.streak, 3);
  assert.equal(expeditionStatus(save, dayKey(new Date(2026, 6, 21))).doneToday, false);
});
