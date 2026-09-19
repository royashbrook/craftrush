import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const SOURCE = readFileSync(new URL('../src/service-worker.ts', import.meta.url), 'utf8');
const ORIGIN = 'https://example.test';
const SCOPE = `${ORIGIN}/craft/`;
const VERSION = 'new-build';
const CURRENT = `craftrush-${VERSION}`;
const OLD = 'craftrush-old-build';
const OTHER = 'other-game-build';
const MODERN = { id: 'modern-client', url: SCOPE };
const HELD = { id: 'held-client', url: `${SCOPE}index.html` };
const BUILD = ['/craft/_app/immutable/app-new.js'];
const FILES = ['/craft/icons/icon.png', '/craft/icons/icon.png'];

// Executes the worker's real emitted handlers. Cache/client APIs are models;
// this pins its policy, not WebKit's service-worker lifecycle implementation.
function harness(source = SOURCE) {
  const listeners = new Map();
  const storage = new Map([[CURRENT, new Map()], [OLD, new Map()], [OTHER, new Map()]]);
  const calls = { addAll: [], open: [], match: [], deleted: [], network: [], skipped: 0, claimed: 0 };
  const state = {
    clients: [MODERN], failInstall: null, failNetwork: null,
    beforeKeys: async () => {}, beforeClients: async () => {},
  };
  const registration = { scope: SCOPE, active: {}, installing: null, waiting: null };
  const key = value => typeof value === 'string' ? value : value.url;
  const caches = {
    async keys() { await state.beforeKeys(); return [...storage.keys()]; },
    async delete(name) { calls.deleted.push(name); return storage.delete(name); },
    async open(name) {
      calls.open.push(name);
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async addAll(paths) {
          calls.addAll.push([...paths]);
          if (state.failInstall) throw state.failInstall;
          for (const url of paths) entries.set(url, new Response(`precache:${url}`));
        },
        async match(request) {
          calls.match.push([name, key(request)]);
          return entries.get(key(request))?.clone();
        },
      };
    },
  };
  const self = {
    registration,
    addEventListener(type, handler) { listeners.set(type, handler); },
    async skipWaiting() { calls.skipped++; },
    clients: {
      async claim() { calls.claimed++; },
      async matchAll(options) {
        assert.equal(options.type, 'window');
        assert.equal(options.includeUncontrolled, true);
        await state.beforeClients();
        return state.clients;
      },
    },
  };
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*? from ['"]\$service-worker['"];?\s*$/m, '');
  assert.ok(!javascript.includes('from \'$service-worker\''));
  vm.runInNewContext(javascript, {
    self, caches, URL, Request, Response, build: BUILD, files: FILES,
    prerendered: ['/craft/'], version: VERSION,
    fetch: async request => {
      calls.network.push(request);
      if (state.failNetwork) throw state.failNetwork;
      return new Response(`network:${key(request)}`);
    },
  });

  async function dispatch(type, fields = {}) {
    const pending = [];
    let response;
    listeners.get(type)({
      ports: [], ...fields,
      waitUntil(promise) { pending.push(promise); },
      respondWith(promise) { assert.equal(response, undefined); response = promise; },
    });
    await Promise.all(pending);
    return response;
  }
  function request(path, { navigate = false, method = 'GET' } = {}) {
    const value = new Request(new URL(path, SCOPE), { method });
    // Node cannot construct a navigation Request; only this mode property is
    // supplied by the harness, all cloning/cache/header behavior is native.
    if (navigate) Object.defineProperty(value, 'mode', { value: 'navigate' });
    return value;
  }
  function put(cache, path, text, { redirected = false, contentType = 'text/plain' } = {}) {
    const response = new Response(text, { headers: { 'content-type': contentType } });
    if (redirected) {
      // Response.clone does not carry a test-owned property; preserve the
      // browser's redirected flag on every modeled cache read.
      const clone = response.clone.bind(response);
      response.clone = () => {
        const result = clone();
        Object.defineProperty(result, 'redirected', { value: true });
        return result;
      };
    }
    storage.get(cache).set(new URL(path, SCOPE).href, response);
  }
  return { state, calls, registration, storage, request, put, dispatch };
}

const acknowledge = h => h.dispatch('message', {
  data: { type: 'CRAFTRUSH_CLIENT', fingerprint: VERSION }, source: MODERN,
});

test('installation waits on one complete deduplicated precache and never autoactivates', async () => {
  const h = harness();
  await h.dispatch('install');
  assert.equal(h.calls.addAll.length, 1);
  const paths = h.calls.addAll[0];
  assert.equal(paths.length, new Set(paths).size);
  for (const path of [SCOPE, ...BUILD, 'release.json', 'rescue.html', 'licenses.json', 'third-party-notices.txt']) {
    assert.ok(paths.includes(new URL(path, SCOPE).href), path);
  }
  assert.equal(h.calls.skipped, 0);
  assert.deepEqual(h.calls.deleted, []);

  const broken = harness();
  const failure = new Error('one asset did not download');
  broken.state.failInstall = failure;
  broken.put(OLD, 'held.js', 'old');
  await assert.rejects(broken.dispatch('install'), error => error === failure);
  assert.equal(broken.storage.get(CURRENT).size, 0);
  assert.equal(broken.storage.get(OLD).size, 1);
  assert.equal(broken.calls.skipped, 0);
  assert.deepEqual(broken.calls.deleted, []);
});

test('activation claims clients without retiring held generations', async () => {
  const h = harness();
  h.state.clients = [MODERN, HELD];
  await h.dispatch('activate');
  assert.equal(h.calls.claimed, 1);
  assert.equal(h.calls.skipped, 0);
  assert.deepEqual(h.calls.deleted, []);
});

test('only the explicit and legacy activation messages skip waiting; identity is exact', async () => {
  const h = harness();
  for (const type of ['unrelated', 'CRAFTRUSH_VERSION', 'CRAFTRUSH_CLIENT']) {
    await h.dispatch('message', { data: { type } });
  }
  assert.equal(h.calls.skipped, 0);
  for (const type of ['CRAFTRUSH_ACTIVATE', 'ACTIVATE_UPDATE']) {
    await h.dispatch('message', { data: { type } });
  }
  assert.equal(h.calls.skipped, 2);
  let reply;
  await h.dispatch('message', { data: { type: 'CRAFTRUSH_VERSION' }, ports: [{ postMessage(value) { reply = value; } }] });
  assert.equal(reply, VERSION);
});

test('retirement requires the sole scoped client, matching sender and exact fingerprint', async () => {
  const h = harness();
  h.state.clients = [MODERN, { id: 'neighbor', url: `${ORIGIN}/elsewhere/` }];
  await acknowledge(h);
  assert.deepEqual(h.calls.deleted, [OLD]);
  assert.equal(h.storage.has(CURRENT), true);
  assert.equal(h.storage.has(OTHER), true);

  for (const configure of [
    h => { h.state.clients = [MODERN, HELD]; },
    h => { h.state.clients = []; },
    h => { h.state.clients = [HELD]; },
    h => { h.registration.waiting = {}; },
    h => { h.registration.installing = {}; },
  ]) {
    const guarded = harness(); configure(guarded);
    await acknowledge(guarded);
    assert.deepEqual(guarded.calls.deleted, []);
  }
  for (const fields of [
    { data: { type: 'CRAFTRUSH_CLIENT', fingerprint: 'other-build' }, source: MODERN },
    { data: { type: 'CRAFTRUSH_CLIENT', fingerprint: VERSION }, source: null },
    { data: { type: 'CRAFTRUSH_CLIENT', fingerprint: VERSION }, source: {} },
  ]) {
    const guarded = harness(); await guarded.dispatch('message', fields);
    assert.deepEqual(guarded.calls.deleted, []);
  }
});

test('retirement rechecks activation, installing and waiting after asynchronous snapshots', async () => {
  for (const field of ['active', 'installing', 'waiting']) {
    for (const phase of ['beforeKeys', 'beforeClients']) {
      const h = harness();
      h.state[phase] = async () => { h.registration[field] = {}; };
      await acknowledge(h);
      assert.deepEqual(h.calls.deleted, [], `${field} changed during ${phase}`);
    }
  }
});

test('version probes use network no-store, never cache reads or cached fallback', async () => {
  for (const path of ['release.json', '_app/version.json', 'icons/icon.png?update-probe=1']) {
    const h = harness();
    h.put(CURRENT, path, 'stale');
    const response = await h.dispatch('fetch', { request: h.request(path) });
    assert.equal(await response.text(), `network:${new URL(path, SCOPE).href}`);
    assert.equal(h.calls.network[0].cache, 'no-store');
    assert.deepEqual(h.calls.open, []);
    assert.deepEqual(h.calls.match, []);
    h.state.failNetwork = new Error('network down');
    await assert.rejects(h.dispatch('fetch', { request: h.request(path) }), /network down/);
  }
});

test('cached rescue redirects replay the actual document, not the app shell', async () => {
  const h = harness();
  h.put(CURRENT, './', 'game shell');
  h.put(CURRENT, 'rescue.html', 'save rescue', { redirected: true, contentType: 'text/html' });
  const rescue = await h.dispatch('fetch', { request: h.request('rescue.html', { navigate: true }) });
  assert.equal(rescue.redirected, false);
  assert.equal(rescue.status, 200);
  assert.equal(rescue.headers.get('content-type'), 'text/html');
  assert.equal(await rescue.text(), 'save rescue');
  assert.deepEqual(h.calls.network, []);
  h.state.failNetwork = new Error('offline');
  for (const path of ['rescue', 'rescue?from=menu', 'rescue.html?from=menu']) {
    const alias = await h.dispatch('fetch', { request: h.request(path, { navigate: true }) });
    assert.equal(await alias.text(), 'save rescue', path);
    assert.equal(alias.redirected, false, path);
  }
  const home = await h.dispatch('fetch', { request: h.request('index.html', { navigate: true }) });
  assert.equal(await home.text(), 'game shell');
});

test('held immutable modules can use old app caches but not neighboring app caches', async () => {
  const h = harness();
  h.put(OLD, '_app/immutable/held-old.js', 'old module bytes');
  h.put(OTHER, '_app/immutable/foreign.js', 'neighbor private bytes');
  const held = await h.dispatch('fetch', { request: h.request('_app/immutable/held-old.js') });
  assert.equal(await held.text(), 'old module bytes');
  assert.equal(h.calls.network.length, 0);
  const foreign = await h.dispatch('fetch', { request: h.request('_app/immutable/foreign.js') });
  assert.equal(await foreign.text(), `network:${SCOPE}_app/immutable/foreign.js`);
  assert.ok(!h.calls.open.includes(OTHER));
  assert.deepEqual(h.calls.deleted, []);
});

test('worker does not intercept writes, cross-origin requests or neighboring paths', async () => {
  const h = harness();
  for (const request of [
    h.request('save', { method: 'POST' }),
    h.request('https://other.test/craft/'),
    h.request(`${ORIGIN}/craft-neighbor/`),
  ]) assert.equal(await h.dispatch('fetch', { request }), undefined);
  assert.deepEqual(h.calls.network, []);
  assert.deepEqual(h.calls.open, []);
});

test('retirement and probe assertions reject deliberate guard-removal mutants', async () => {
  const mutate = (before, after) => {
    assert.equal(SOURCE.split(before).length, 2, 'mutation must touch exactly one real guard');
    return SOURCE.replace(before, after);
  };
  const keepWaiting = async source => {
    const h = harness(source); h.registration.waiting = {};
    await acknowledge(h); assert.deepEqual(h.calls.deleted, []);
  };
  const keepHeld = async source => {
    const h = harness(source); h.state.clients = [MODERN, HELD];
    await acknowledge(h); assert.deepEqual(h.calls.deleted, []);
  };
  const keepNewActive = async source => {
    const h = harness(source); h.state.beforeClients = async () => { h.registration.active = {}; };
    await acknowledge(h); assert.deepEqual(h.calls.deleted, []);
  };
  const noStore = async source => {
    const h = harness(source);
    await h.dispatch('fetch', { request: h.request('release.json') });
    assert.equal(h.calls.network[0].cache, 'no-store');
  };
  for (const check of [keepWaiting, keepHeld, keepNewActive, noStore]) await check(SOURCE);
  for (const [check, before, after] of [
    [keepWaiting, ' || worker.registration.waiting', ''],
    [keepHeld, 'clients.length !== 1 || ', ''],
    [keepNewActive, 'worker.registration.active !== active ||', 'false ||'],
    [noStore, "new Request(request, { cache: 'no-store' })", 'request'],
  ]) await assert.rejects(check(mutate(before, after)), { name: 'AssertionError' });
});
