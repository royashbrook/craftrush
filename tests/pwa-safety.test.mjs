import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  craftRushScopePath,
  ownsCraftRushCache,
  ownsCraftRushRegistration,
  parsePlayableSave,
  replayableCachedResponse,
  saveSchemaError,
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

test('root-hosted development never grants root service-worker ownership', () => {
  const page = 'http://127.0.0.1:8399/rescue.html';
  assert.equal(craftRushScopePath(page), '/craftrush/');
  assert.equal(ownsCraftRushRegistration({ scope: 'http://127.0.0.1:8399/' }, page), false);
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
