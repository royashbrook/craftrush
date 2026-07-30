// Pure run-mastery bookkeeping. These facts explain play; they never change
// rewards, progression, or the save schema.

const GRADE_STEPS = [
  [90, 'S', 'AMAZING!'],
  [78, 'A', 'AWESOME!'],
  [64, 'B', 'NICE RUN!'],
  [48, 'C', 'GOOD TRY!'],
  [0, 'D', 'KEEP GOING!'],
];

const GRADE_ORDER = ['D', 'C', 'B', 'A', 'S'];
const GRADE_SET = new Set(GRADE_ORDER);

// Ordered deliberately: the menu always gives one clear target instead of
// presenting a checklist. IDs are the persistent contract; labels and
// descriptions can change without migrating a save.
export const BADGES = Object.freeze([
  Object.freeze({
    id: 'clean_line',
    label: 'Clean Line',
    description: 'Pick 3 growing gates with no bad or missed gates.',
  }),
  Object.freeze({
    id: 'golem_ace',
    label: 'Golem Ace',
    description: 'Land 2 useful golem sends in one run.',
  }),
  Object.freeze({
    id: 'untouched',
    label: 'Untouched',
    description: 'Win without losing any crowd power.',
  }),
]);

const BADGE_IDS = new Set(BADGES.map((badge) => badge.id));
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function emptyChapterMastery() {
  return { bestGrade: null, bestCrowd: 0, badges: [] };
}

function normalizeChapterRecord(value) {
  const source = record(value) ? value : {};
  // A newer build may add grades above S. Keep any nonempty string verbatim so
  // an older cached build can read and save the file without downgrading it.
  const bestGrade = typeof source.bestGrade === 'string' && source.bestGrade.trim()
    ? source.bestGrade
    : null;
  const bestCrowd = Number.isFinite(source.bestCrowd) && source.bestCrowd >= 0
    ? Math.floor(source.bestCrowd)
    : 0;
  const storedBadges = Array.isArray(source.badges)
    ? [...new Set(source.badges.filter((badge) => typeof badge === 'string' && badge))]
    : [];
  // Known badges use the canonical order. Preserve unknown string IDs after
  // them so an older build cannot erase progress written by a newer one.
  const badges = [
    ...BADGES.filter((badge) => storedBadges.includes(badge.id)).map((badge) => badge.id),
    ...storedBadges.filter((badge) => !BADGE_IDS.has(badge)),
  ];
  return { ...source, bestGrade, bestCrowd, badges };
}

/**
 * Add or repair the additive persistent mastery seam without touching any
 * unrelated save data. Safe to call on every load and before every write.
 */
export function normalizeMasterySave(save) {
  if (!record(save)) return { chapters: {} };
  const mastery = record(save.mastery) ? save.mastery : {};
  const storedChapters = record(mastery.chapters) ? mastery.chapters : {};
  const chapters = Object.fromEntries(
    Object.entries(storedChapters)
      .filter(([chapterId]) => chapterId.length > 0)
      .map(([chapterId, value]) => [chapterId, normalizeChapterRecord(value)]),
  );
  mastery.chapters = chapters;
  save.mastery = mastery;
  return mastery;
}

/**
 * Read one normalized chapter record without ever writing through the save.
 * Svelte calls this from derived UI; a read that creates state can retrigger the
 * derivation forever.
 */
export function chapterMastery(save, chapterId) {
  if (typeof chapterId !== 'string' || !chapterId) return emptyChapterMastery();
  const chapters = record(save?.mastery?.chapters) ? save.mastery.chapters : {};
  return normalizeChapterRecord(
    Object.hasOwn(chapters, chapterId) ? chapters[chapterId] : null,
  );
}

function earnedBadgeIds(result) {
  const run = record(result?.mastery) ? result.mastery : {};
  const earned = [];
  if (Number.isFinite(run.goodGates) && run.goodGates >= 3
      && run.badGates === 0 && run.missedGates === 0) {
    earned.push('clean_line');
  }
  if (Number.isFinite(run.usefulGolems) && run.usefulGolems >= 2) {
    earned.push('golem_ace');
  }
  if (result?.win === true && run.damageTaken === 0) earned.push('untouched');
  return earned;
}

function cloneChapterRecord(value) {
  return { ...value, badges: [...value.badges] };
}

export function masteryChapterEligible(chapter) {
  const id = typeof chapter === 'string' ? chapter : chapter?.id;
  return typeof id === 'string' && !!id
    && id !== 'credits'
    && id !== 'coda'
    && !chapter?.credits
    && !chapter?.coda;
}

/**
 * The next single improvement worth showing for a chapter: missing badges in
 * their authored order, then the next grade, then one runner past the record.
 */
export function nextMasteryTarget(save, chapterId) {
  const chapter = chapterMastery(save, chapterId);
  const missing = BADGES.find((badge) => !chapter.badges.includes(badge.id));
  if (missing) return { kind: 'badge', ...missing };

  const gradeIndex = GRADE_ORDER.indexOf(chapter.bestGrade);
  // Unknown string grades come from a newer build and are treated as beyond
  // this build's scale. Never invite the player to replace one with D through S.
  if (chapter.bestGrade && gradeIndex < 0) {
    const target = chapter.bestCrowd + 1;
    return { kind: 'crowd', target, label: `Build a crowd of ${target}` };
  }
  if (gradeIndex < GRADE_ORDER.length - 1) {
    const grade = GRADE_ORDER[Math.max(0, gradeIndex + 1)];
    return { kind: 'grade', grade, label: `Earn grade ${grade}` };
  }

  const target = chapter.bestCrowd + 1;
  return {
    kind: 'crowd',
    target,
    label: `Build a crowd of ${target}`,
  };
}

/**
 * Merge one campaign result into its chapter record. Expeditions deliberately
 * never enter this progression lane, even if a caller attached a chapter.
 */
export function mergeChapterMastery(save, result) {
  const chapterId = typeof result?.chapter === 'string'
    ? result.chapter
    : result?.chapter?.id;
  if (result?.expedition || !masteryChapterEligible(result?.chapter)) {
    return { applied: false, newBadges: [], record: null, nextTarget: null };
  }

  const mastery = normalizeMasterySave(save);
  const firstRecord = !Object.hasOwn(mastery.chapters, chapterId);
  if (firstRecord) {
    Object.defineProperty(mastery.chapters, chapterId, {
      value: emptyChapterMastery(),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const chapter = mastery.chapters[chapterId];
  const previousGrade = chapter.bestGrade;
  const previousCrowd = chapter.bestCrowd;
  const previousBadges = new Set(chapter.badges);
  const earned = earnedBadgeIds(result);
  const newBadges = earned.filter((badge) => !previousBadges.has(badge));
  chapter.badges = [
    ...BADGES
      .map((badge) => badge.id)
      .filter((badge) => previousBadges.has(badge) || earned.includes(badge)),
    ...chapter.badges.filter((badge) => !BADGE_IDS.has(badge)),
  ];

  const grade = result?.mastery?.grade;
  const storedGradeIndex = GRADE_ORDER.indexOf(chapter.bestGrade);
  const futureGrade = !!chapter.bestGrade && storedGradeIndex < 0;
  if (!futureGrade && GRADE_SET.has(grade)
      && (!chapter.bestGrade
        || GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf(chapter.bestGrade))) {
    chapter.bestGrade = grade;
  }

  const crowdCandidates = [
    result?.bestCrowd,
    result?.mastery?.bestCrowd,
    result?.mastery?.finalCrowd,
  ].filter((value) => Number.isFinite(value) && value >= 0);
  chapter.bestCrowd = Math.max(chapter.bestCrowd, ...crowdCandidates.map(Math.floor));
  const isNew = firstRecord
    || chapter.bestGrade !== previousGrade
    || chapter.bestCrowd > previousCrowd;

  return {
    applied: true,
    newBadges,
    record: { ...cloneChapterRecord(chapter), isNew },
    nextTarget: nextMasteryTarget(save, chapterId),
  };
}

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
    golemSends: 0,
    usefulGolems: 0,
    golemHits: 0,
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
