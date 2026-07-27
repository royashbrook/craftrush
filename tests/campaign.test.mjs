import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN, chapterById, chapterMissing, chapterUnlocked, currentChapter, completeChapter, THEME_ART } from '../js/config.js';

const fresh = () => ({ inventory: {}, campaign: { done: [] } });

test('the chain is ordered and every chapter is described', () => {
  assert.ok(CAMPAIGN.length >= 8);
  const ids = new Set();
  for (const c of CAMPAIGN) {
    assert.ok(c.id && c.name && c.blurb, `${c.id} is described`);
    assert.ok(!ids.has(c.id), `${c.id} appears once`);
    ids.add(c.id);
  }
});

test('only the first chapter is open on a fresh save', () => {
  const s = fresh();
  assert.equal(chapterUnlocked(s, CAMPAIGN[0].id), true);
  assert.equal(chapterUnlocked(s, CAMPAIGN[1].id), false, 'the second waits its turn');
  assert.equal(currentChapter(s).id, CAMPAIGN[0].id);
});

test('a chapter stays shut until you have what it asks for', () => {
  const s = fresh();
  completeChapter(s, 'mine_obsidian');            // grants 4 obsidian, portal wants 10
  const missing = chapterMissing(s, 'portal');
  assert.deepEqual(missing, { obsidian: 6 }, 'it says exactly what is short');
  assert.equal(chapterUnlocked(s, 'portal'), false);

  completeChapter(s, 'mine_obsidian');
  completeChapter(s, 'mine_obsidian');            // 12 obsidian now
  assert.equal(chapterMissing(s, 'portal'), null);
  assert.equal(chapterUnlocked(s, 'portal'), true);
});

test('finishing a chapter spends its cost and pays its reward', () => {
  const s = fresh();
  s.inventory.obsidian = 12;
  s.campaign.done = ['mine_obsidian'];
  completeChapter(s, 'portal');
  assert.equal(s.inventory.obsidian, 2, 'ten went into the frame');
  assert.ok(s.campaign.done.includes('portal'));

  completeChapter(s, 'fortress');
  assert.equal(s.inventory.blazeRods, 2, 'the fortress pays rods');
});

test('completing the same chapter twice does not duplicate it', () => {
  const s = fresh();
  completeChapter(s, 'mine_obsidian');
  completeChapter(s, 'mine_obsidian');
  assert.equal(s.campaign.done.filter((x) => x === 'mine_obsidian').length, 1);
});

test('spending can never drive a resource negative', () => {
  const s = fresh();
  s.campaign.done = ['mine_obsidian'];
  completeChapter(s, 'portal');                    // consumes 10 it does not have
  assert.equal(s.inventory.obsidian, 0);
});

test('the finale is gated behind the whole chain', () => {
  const s = fresh();
  const last = CAMPAIGN[CAMPAIGN.length - 1];
  assert.equal(chapterUnlocked(s, last.id), false);
  for (const c of CAMPAIGN.slice(0, -1)) {
    s.inventory = { obsidian: 99, blazeRods: 99, enderEyes: 99, elytra: 9, trims: 9, witherSkulls: 9 };
    completeChapter(s, c.id);
  }
  assert.equal(chapterUnlocked(s, last.id), true, 'the walk home opens last');
  assert.equal(currentChapter(s).id, last.id);
});

test('the two big fights are multi-phase, and the dragon has her crystals', () => {
  assert.equal(chapterById('dragon').phases, 3);
  assert.equal(chapterById('dragon').crystals, true);
  assert.equal(chapterById('wither').phases, 3);
});

test('a gate sends you back to gather, it is never a dead end', () => {
  const s = fresh();
  completeChapter(s, 'mine_obsidian');            // 4 obsidian, portal wants 10
  // the portal is not open, so the game should hand you the obsidian run again
  assert.equal(chapterUnlocked(s, 'portal'), false);
  assert.equal(currentChapter(s).id, 'mine_obsidian', 'go get more obsidian');

  completeChapter(s, 'mine_obsidian');
  completeChapter(s, 'mine_obsidian');            // 12 now
  assert.equal(currentChapter(s).id, 'portal', 'and now the portal is what is next');
});

test('a milestone chapter is not replayed once it is done', () => {
  const s = fresh();
  s.inventory.obsidian = 12;
  completeChapter(s, 'mine_obsidian');
  completeChapter(s, 'portal');
  assert.notEqual(currentChapter(s).id, 'portal', 'the portal is lit for good');
});

test('the walk home is peaceful: no enemies, no obstacles, only kind gates', async () => {
  const { LevelMixin } = await import('../js/levelgen.js');
  const g = { chapter: chapterById('credits'), level: 1, mode: 'gates', mut: {}, biome: { enemies: [], obstacle: 'fence' } };
  Object.assign(g, LevelMixin);
  g.genLevel(1);
  const kinds = new Set(g.events.map((e) => e.type));
  assert.equal(kinds.has('enemy'), false, 'nothing attacks you on the way home');
  assert.equal(kinds.has('obstacle'), false, 'nothing blocks you either');
  assert.ok(g.events.some((e) => e.type === 'gate'), 'there are still gates to run');
  for (const e of g.events.filter((x) => x.type === 'gate')) {
    assert.ok(e.op === 'add' || e.op === 'mul', `${e.op} gate would shrink the crowd`);
  }
  assert.ok(g.creditSigns.length >= 5, 'the thanks are there to run past');
  assert.ok(g.creditSigns.every((c) => c.z < g.length), 'every sign is on the track');
});

test('campaign loot cannot be bought, only brought home', async () => {
  const { COSMETICS, questCosmeticEarned } = await import('../js/config.js');
  const loot = Object.values(COSMETICS).flat().filter((c) => c.quest);
  assert.ok(loot.length >= 2, 'the chain hands back things you can wear');
  const rich = { inventory: {}, emeralds: 9e9 };
  for (const c of loot) {
    assert.equal(questCosmeticEarned(rich, c), false, `${c.id} is not for sale`);
    assert.equal(questCosmeticEarned({ inventory: { [c.quest]: 1 } }, c), true, `${c.id} opens once earned`);
  }
  // and every quest key is something a chapter actually grants
  const granted = new Set(CAMPAIGN.flatMap((ch) => Object.keys(ch.grants || {})));
  for (const c of loot) assert.ok(granted.has(c.quest), `${c.quest} is granted somewhere in the chain`);
});

test('every chapter has a real place to happen, built out of real art', async () => {
  const { BIOMES } = await import('../js/config.js');
  const { readFileSync } = await import('node:fs');
  const ART = JSON.parse(readFileSync(new URL('sprites.json', THEME_ART + '/'), 'utf8'));
  const places = new Set(BIOMES.map((b) => b.id));
  for (const c of CAMPAIGN) assert.ok(places.has(c.biome), `${c.id} runs in ${c.biome}, which exists`);
  for (const b of BIOMES) {
    for (const s of b.scenery) assert.ok(ART[s], `${b.id} scenery ${s} has an art file`);
    assert.ok(ART[b.obstacle], `${b.id} obstacle ${b.obstacle} has an art file`);
  }
});
