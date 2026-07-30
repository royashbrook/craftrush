import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  CRAFTRUSH_APP_ORIGIN,
  craftRushScopePath,
  isStandaloneApp,
  ownsCraftRushCache,
  ownsCraftRushRegistration,
  parsePlayableSave,
  replayableCachedResponse,
  saveSchemaError,
  shouldOfferLegacyRestore,
  updateReloadIsSafe,
} from '../js/pwa-safety.js';

test('cache ownership never reaches a neighboring app', () => {
  assert.equal(ownsCraftRushCache('craftrush-v3'), true);
  assert.equal(ownsCraftRushCache('craftrush-1.4.0'), true);
  assert.equal(ownsCraftRushCache('quarkatamari-v7'), false);
  assert.equal(ownsCraftRushCache('craftrush'), false);
});

test('a redirected cache hit is safe to replay as a worker navigation response', async () => {
  const redirected = new Response('save rescue', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
  Object.defineProperty(redirected, 'redirected', { value: true });

  const replay = replayableCachedResponse(redirected);
  assert.notEqual(replay, redirected);
  assert.equal(replay.redirected, false);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('content-type'), 'text/html');
  assert.equal(await replay.text(), 'save rescue');

  const ordinary = new Response('asset');
  assert.equal(replayableCachedResponse(ordinary), ordinary);
});

test('registration ownership stays below the game mount', () => {
  const page = 'https://royashbrook.com/craftrush/rescue.html';
  assert.equal(craftRushScopePath(page), '/craftrush/');
  assert.equal(ownsCraftRushRegistration({ scope: 'https://royashbrook.com/craftrush/' }, page), true);
  assert.equal(ownsCraftRushRegistration({ scope: 'https://royashbrook.com/craftrush/tools/' }, page), true);
  assert.equal(ownsCraftRushRegistration({ scope: 'https://royashbrook.com/' }, page), false);
  assert.equal(ownsCraftRushRegistration({ scope: 'https://royashbrook.com/quarkatamari/' }, page), false);
  assert.equal(ownsCraftRushRegistration({ scope: 'https://example.com/craftrush/' }, page), false);
});

test('only the exact dedicated HTTPS origin grants root worker ownership', () => {
  const page = `${CRAFTRUSH_APP_ORIGIN}/rescue.html`;
  assert.equal(craftRushScopePath(page), '/');
  assert.equal(ownsCraftRushRegistration({ scope: `${CRAFTRUSH_APP_ORIGIN}/` }, page), true);
  assert.equal(ownsCraftRushRegistration({ scope: `${CRAFTRUSH_APP_ORIGIN}/tools/` }, page), true);

  for (const other of [
    'https://royashbrook.com/rescue.html',
    'https://royashbrook.com/craftrush/rescue.html',
    'http://127.0.0.1:8399/rescue.html',
    'http://localhost:8399/rescue.html',
    'http://craftrush.royashbrook.com/rescue.html',
    'https://craftrush.royashbrook.com:8443/rescue.html',
    'https://craftrush.royashbrook.com.evil.example/rescue.html',
    'https://quantamari.royashbrook.com/rescue.html',
  ]) {
    assert.notEqual(craftRushScopePath(other), '/');
    const origin = new URL(other).origin;
    assert.equal(
      ownsCraftRushRegistration({ scope: `${origin}/` }, other),
      false,
      `${other} must not own its root worker`,
    );
  }
});

test('standalone detection accepts both iOS and manifest display modes', () => {
  assert.equal(isStandaloneApp({ standalone: true }, () => ({ matches: false })), true);
  assert.equal(isStandaloneApp({}, () => ({ matches: true })), true);
  assert.equal(isStandaloneApp({}, () => ({ matches: false })), false);
  assert.equal(isStandaloneApp({}, () => { throw new Error('unsupported'); }), false);
});

test('legacy restore appears only for a fresh installed save', () => {
  const fresh = {
    level: 1,
    bestLevel: 1,
    emeralds: 18,
    unlocked: ['steve'],
    campaign: { done: [] },
    stats: { runs: 1, totalEmeralds: 18 },
  };
  assert.equal(shouldOfferLegacyRestore(fresh, true), true);
  assert.equal(shouldOfferLegacyRestore(fresh, false), false);
  assert.equal(shouldOfferLegacyRestore({ ...fresh, level: 2 }, true), false);
  assert.equal(shouldOfferLegacyRestore({
    ...fresh,
    campaign: { done: ['mine_obsidian'] },
  }, true), false);
  assert.equal(shouldOfferLegacyRestore({
    ...fresh,
    unlocked: ['steve', 'alex'],
  }, true), false);
  assert.equal(shouldOfferLegacyRestore({
    ...fresh,
    stats: { runs: 2, totalEmeralds: 18 },
  }, true), false);
});

test('save validation accepts playable partial and current-shaped saves', () => {
  assert.equal(saveSchemaError({ level: 1 }), '');
  assert.equal(saveSchemaError({
    level: 12,
    emeralds: 31337,
    unlocked: ['steve', 'alex'],
    cosmetics: { cape: 'none', hat: 'hat_cat', trail: 'none', pet: 'none' },
    inventory: { elytra: 1 },
    campaign: { done: ['mine_obsidian'] },
    mastery: {
      chapters: {
        mine_obsidian: {
          bestGrade: 'S+',
          bestCrowd: 37,
          badges: ['clean_line', 'future_badge'],
        },
      },
    },
    world: {
      town: 'plains',
      house: 0,
      carry: { skin: 'alex', cosmetics: { cape: 'none', hat: 'none' } },
      towns: {
        plains: {
          unlocked: true,
          houses: [{
            style: 'plains_cottage',
            decor: [],
            people: [{ skin: 'steve', cosmetics: { cape: 'none', hat: 'none' } }],
          }],
        },
      },
    },
  }), '');
});

test('syntactically valid but unplayable JSON is rejected', () => {
  assert.match(parsePlayableSave('{"hello":"world"}').error, /level/);
  assert.match(parsePlayableSave('{"level":"nine"}').error, /level/);
  assert.match(parsePlayableSave('{"level":1,"mode":"spectator"}').error, /mode/);
  assert.match(parsePlayableSave('{"level":1,"cosmetics":[]}').error, /cosmetics/);
  assert.match(parsePlayableSave('{"level":1,"inventory":{"elytra":-1}}').error, /elytra/);
  assert.match(parsePlayableSave('{"level":1,"mine":{"energy":"lots"}}').error, /mine.energy/);
  assert.match(parsePlayableSave('{"level":1,"mine":{"inv":{"diamond":"many"}}}').error, /diamond/);
  assert.match(parsePlayableSave('{"level":1,"stats":{"runs":[]}}').error, /stats.runs/);
  assert.match(parsePlayableSave('{"level":1,"home":{"lastCollect":"yesterday"}}').error, /lastCollect/);
  assert.match(parsePlayableSave('{"level":1,"decorOwned":{"bed":-1}}').error, /decorOwned.bed/);
  assert.match(parsePlayableSave('{"level":1,"mastery":[]}').error, /mastery/);
  assert.match(parsePlayableSave('{"level":1,"mastery":{"chapters":[]}}').error, /mastery.chapters/);
  assert.match(parsePlayableSave(
    '{"level":1,"mastery":{"chapters":{"portal":{"bestGrade":7,"bestCrowd":2,"badges":[]}}}}',
  ).error, /bestGrade/);
  assert.match(parsePlayableSave(
    '{"level":1,"mastery":{"chapters":{"portal":{"bestGrade":"   ","bestCrowd":2,"badges":[]}}}}',
  ).error, /bestGrade/);
  assert.match(parsePlayableSave(
    '{"level":1,"mastery":{"chapters":{"portal":{"bestGrade":"A","bestCrowd":-1,"badges":[]}}}}',
  ).error, /bestCrowd/);
  assert.match(parsePlayableSave(
    '{"level":1,"mastery":{"chapters":{"portal":{"bestGrade":"A","bestCrowd":2,"badges":[7]}}}}',
  ).error, /badges/);
  assert.match(parsePlayableSave('{"level":1,"world":{"towns":{"plains":"broken"}}}').error, /plains/);
  assert.match(parsePlayableSave(
    '{"level":1,"world":{"town":"plains","towns":{"plains":{"unlocked":true,"houses":[{}]}}}}',
  ).error, /house style/);
  assert.match(parsePlayableSave(
    '{"level":1,"world":{"towns":{"plains":{"houses":[{"style":"cabin","people":[],"decor":[null]}]}}}}',
  ).error, /placed items/);
  assert.match(parsePlayableSave('{"level":1,"world":{"carry":"broken"}}').error, /world.carry/);
  assert.match(parsePlayableSave(
    '{"level":1,"world":{"carry":{"skin":"alex","cosmetics":"broken"}}}',
  ).error, /world.carry.cosmetics/);
  assert.match(parsePlayableSave(
    '{"level":1,"world":{"towns":{"plains":{"houses":[{"style":"cabin","decor":[],"people":[{"skin":"alex","cosmetics":"broken"}]}]}}}}',
  ).error, /cosmetics/);
  assert.match(parsePlayableSave('{"level":1,"playmates":[null]}').error, /playmates/);
  assert.match(parsePlayableSave('{"level":1,"decor":[null]}').error, /placed items/);
  assert.match(parsePlayableSave('[]').error, /object/);
});

test('an update waits through a run and its result', () => {
  assert.equal(updateReloadIsSafe({ playing: true, result: null }), false);
  assert.equal(updateReloadIsSafe({ playing: false, result: {} }), false);
  assert.equal(updateReloadIsSafe({ playing: false, result: null }), true);
});

test('the legacy worker tombstone retires only Craft Rush caches and never navigates clients', async () => {
  const listeners = {};
  const deleted = [];
  let unregistered = 0;
  let waited;
  const source = readFileSync(new URL('../static/sw.js', import.meta.url), 'utf8');
  const sandbox = {
    caches: {
      keys: async () => ['craftrush-v3', 'craftrush-old-hash', 'quarkatamari-v7'],
      delete: async (key) => { deleted.push(key); },
    },
    self: {
      addEventListener: (type, listener) => { listeners[type] = listener; },
      skipWaiting: () => {},
      registration: { unregister: async () => { unregistered++; } },
      clients: {
        matchAll: async () => {
          throw new Error('the tombstone must not navigate active clients');
        },
      },
    },
  };
  vm.runInNewContext(source, sandbox);
  listeners.activate({ waitUntil: (promise) => { waited = promise; } });
  await waited;

  assert.deepEqual(deleted, ['craftrush-v3', 'craftrush-old-hash']);
  assert.equal(unregistered, 1);
});
