import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { artifactManifest, assertCurrentDeploy, verifyArtifact } from '../tools/release-artifact.mjs';
import { compareLive } from '../tools/release-live.mjs';
import { assertRescueCurrent, inventoryForModules, mergedInventory, noticeText, rescueBuildInputs } from '../tools/license-inventory.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('build preflight generates Kit configuration before compiling the typed rescue entry', () => {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  const steps = scripts.prebuild.split(/\s*&&\s*/);
  assert.equal(steps[0], 'svelte-kit sync', 'a fresh checkout has no generated tsconfig');
  assert.ok(steps.indexOf('node tools/build-rescue.mjs') > 0);
  assert.ok(scripts['build:dev'].startsWith('npm run prebuild && '));
});

function artifact(t) {
  const directory = mkdtempSync(join(tmpdir(), 'craftrush-artifact-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const release = { version: '1.11.0', source: 'a'.repeat(40), anchor: 'v1.11', dirty: false, development: false, fingerprint: 'b'.repeat(64) };
  const write = (name, text) => {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), text);
  };
  const license = 'A complete first-party license fixture with enough text to distinguish it from an empty or truncated notice.';
  const inventory = {
    firstParty: { notice: license },
    packages: ['svelte', 'qrcode'].map(name => ({ name, modules: ['fixture.js'], notices: [{ text: `${name} complete upstream notice` }] })),
    staticAssets: [{ path: 'static/manifest.webmanifest', sha256: digest('{}') }],
  };
  write('index.html', '<html>app</html>');
  write('rescue.html', '<html>rescue</html>');
  write('release.json', JSON.stringify(release));
  write('app.js', JSON.stringify(release));
  write('service-worker.js', `${release.fingerprint} release.json licenses.json third-party-notices.txt`);
  write('_app/version.json', JSON.stringify({ version: release.fingerprint }));
  write('manifest.webmanifest', '{}');
  write('licenses.json', JSON.stringify(inventory));
  write('third-party-notices.txt', `${license}\nsvelte complete upstream notice\nqrcode complete upstream notice`);
  const seal = () => write('artifact.json', JSON.stringify(artifactManifest(directory, JSON.parse(readFileSync(join(directory, 'release.json'), 'utf8')))));
  seal();
  return { directory, release, inventory, write, seal };
}

test('artifact seal rejects changed bytes and changed release source', t => {
  const f = artifact(t);
  assert.deepEqual(verifyArtifact(f.directory, { expectedSource: f.release.source }), f.release);
  assert.throws(() => verifyArtifact(f.directory, { expectedSource: 'c'.repeat(40) }), /requested commit/);
  f.write('app.js', 'changed');
  assert.throws(() => verifyArtifact(f.directory), /artifact bytes/);
});

test('artifact identity checks remain effective even after resealing a bad build', t => {
  const mutations = [
    ['_app/version.json', JSON.stringify({ version: 'wrong' }), /Kit updater/],
    ['service-worker.js', 'release.json licenses.json third-party-notices.txt', /worker cache/],
    ['app.js', 'old version', /client shell/],
    ['third-party-notices.txt', 'notice deleted', /first-party license/],
    ['service-worker.js', 'b'.repeat(64), /offline/],
    ['manifest.webmanifest', '{"id":"changed"}', /static asset matches inventory/],
  ];
  for (const [name, body, error] of mutations) {
    const f = artifact(t);
    f.write(name, body);
    f.seal();
    assert.throws(() => verifyArtifact(f.directory), error, name);
  }
});

test('release verifier refuses dirty/development builds and stale or non-main deployment', t => {
  for (const delta of [{ development: true }, { dirty: true }]) {
    const f = artifact(t);
    f.write('release.json', JSON.stringify({ ...f.release, ...delta }));
    f.seal();
    assert.throws(() => verifyArtifact(f.directory), /artifact cannot deploy/);
    assert.doesNotThrow(() => verifyArtifact(f.directory, { allowDevelopment: true }));
  }
  const current = 'b'.repeat(40);
  assert.doesNotThrow(() => assertCurrentDeploy(current, current));
  assert.throws(() => assertCurrentDeploy('a'.repeat(40), current), /outdated/);
  assert.throws(() => assertCurrentDeploy(current, current, 'refs/heads/topic'), /only main/);
});

test('notice inventory includes complete installed runtime notices, merges rescue-only packages and no machine paths', () => {
  const main = inventoryForModules([resolve('node_modules/svelte/src/internal/client/index.js'), '\0vite/preload-helper.js']);
  const rescue = inventoryForModules([resolve('node_modules/qrcode/lib/browser.js'), resolve('node_modules/dijkstrajs/dijkstra.js')]);
  const inventory = mergedInventory(main, rescue);
  assert.deepEqual(inventory.packages.map(pkg => pkg.name), ['dijkstrajs', 'qrcode', 'svelte', 'vite']);
  const text = noticeText(inventory);
  assert.ok(text.includes(readFileSync('node_modules/svelte/LICENSE.md', 'utf8').trim()));
  assert.ok(text.includes(readFileSync('node_modules/qrcode/license', 'utf8').trim()));
  for (const pkg of inventory.packages) for (const notice of pkg.notices) assert.ok(text.includes(notice.text));
  assert.ok(!JSON.stringify(inventory).includes(process.cwd()));
  assert.equal(inventory.packages.find(pkg => pkg.name === 'qrcode').modules[0], 'qrcode/lib/browser.js');
});

test('bundled dependency without an upstream notice is a loud inventory failure', t => {
  const directory = mkdtempSync(join(tmpdir(), 'craftrush-notice-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dependency = join(directory, 'node_modules/unlicensed');
  mkdirSync(dependency, { recursive: true });
  writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'unlicensed', version: '1.0.0' }));
  writeFileSync(join(dependency, 'index.js'), 'export const value = 1;');
  assert.throws(() => inventoryForModules([join(dependency, 'index.js')], directory), /missing license text/);
});

test('matching generated rescue bytes cannot hide stale template, source, builder or lockfile inputs', t => {
  const directory = mkdtempSync(join(tmpdir(), 'craftrush-rescue-inputs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const modulePath = 'js/rescue-entry.ts';
  const paths = [...rescueBuildInputs, modulePath];
  const write = (path, text) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  for (const path of paths) write(path, `original ${path}`);
  write('static/rescue.html', '<html>generated rescue</html>');
  const rescue = {
    sha256: digest('<html>generated rescue</html>'), node: process.version,
    inputs: Object.fromEntries(paths.map(path => [path, digest(`original ${path}`)])),
    inventory: { firstPartyModules: [{ path: modulePath }] },
  };
  assert.doesNotThrow(() => assertRescueCurrent(rescue, directory));
  for (const path of paths) {
    write(path, `changed ${path}`);
    assert.throws(() => assertRescueCurrent(rescue, directory), /rescue input changed/, path);
    write(path, `original ${path}`);
  }
  assert.throws(() => assertRescueCurrent({ ...rescue, inputs: undefined }, directory), /rescue input changed/);
  assert.throws(() => assertRescueCurrent({ ...rescue, node: 'v0.0.0' }, directory), /Node runtime/);
});

test('theme sync uses source bytes even when a stale same-size generated copy has a newer timestamp', t => {
  const directory = mkdtempSync(join(tmpdir(), 'craftrush-theme-sync-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'themes/craft/atlas.png');
  const destination = join(directory, 'static/themes/craft/atlas.png');
  for (const path of [source, destination]) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(source, 'new atlas');
  writeFileSync(destination, 'old atlas');
  utimesSync(source, 1, 1);
  utimesSync(destination, 2, 2);
  execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(resolve('vite.config.js')).href)});`], {
    cwd: directory,
    env: { ...process.env, CRAFTRUSH_RELEASE_IDENTITY: JSON.stringify({ version: '0.0.0-dev', fingerprint: 'fixture' }) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(readFileSync(destination, 'utf8'), 'new atlas');
});

const bodies = {
  'index.html': '<html>app</html>', 'rescue.html': '<html>rescue</html>',
  'service-worker.js': 'worker', 'release.json': '{"version":"1.11.0"}',
  '_app/version.json': '{"version":"fingerprint"}', '_app/immutable/app.js': 'bundle',
  'manifest.webmanifest': '{}', 'third-party-notices.txt': 'notices', '_headers': 'host config',
};
const manifest = { release: { version: '1.11.0' }, files: Object.fromEntries(Object.entries(bodies).map(([name, body]) => [name, digest(body)])) };
function host(basePath = '/', changes = {}, calls = []) {
  return async (url, options) => {
    assert.ok(url.pathname.startsWith(basePath), 'request escaped deployment subpath');
    const name = url.pathname.slice(basePath.length) || 'index.html';
    calls.push({ name, url, options });
    if (name === 'artifact.json') return Response.json(changes.manifest ?? manifest);
    const headers = {
      'x-content-type-options': 'nosniff',
      'cache-control': name.endsWith('.html') ? 'no-store, no-transform'
        : name.startsWith('_app/immutable/') ? 'public, max-age=31536000, immutable' : 'no-store',
    };
    return new Response(bodies[name], { status: name === '_headers' ? 404 : 200, headers, ...changes[name] });
  };
}

test('live verifier covers exact artifact at both domain root and subpath with browser-shaped HTML requests', async () => {
  for (const base of ['/', '/craftrush/']) {
    const calls = [];
    assert.deepEqual(await compareLive(manifest, `https://example.test${base}`, host(base, {}, calls)), manifest.release);
    assert.equal(calls.length, Object.keys(bodies).length + 1);
    assert.ok(calls.find(call => call.name === 'index.html').options.headers.accept.includes('text/html'));
    assert.ok(calls.find(call => call.name === 'rescue.html').options.headers['user-agent'].includes('Mozilla/'));
  }
});

test('live verifier rejects navigation-only injection, incomplete notices, altered manifest and host/header mistakes', async () => {
  const origin = 'https://example.test/';
  const rewritingHost = async (url, options) => {
    const response = await host()(url, options);
    if (url.pathname === '/' && options.headers?.accept.includes('text/html')) {
      return new Response(`${bodies['index.html']}<script>injected</script>`, { headers: response.headers });
    }
    return response;
  };
  assert.equal(digest(await (await rewritingHost(new URL(origin), {})).text()), manifest.files['index.html']);
  await assert.rejects(compareLive(manifest, origin, rewritingHost), /differs/);
  for (const [changes, error] of [
    [{ 'third-party-notices.txt': { status: 404 } }, /validated artifact/],
    [{ 'index.html': { headers: { 'cache-control': 'no-store' } } }, /nosniff/],
    [{ 'index.html': { headers: { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } } }, /not transform/],
    [{ 'release.json': { headers: { 'x-content-type-options': 'nosniff' } } }, /not cache/],
    [{ '_app/immutable/app.js': { headers: { 'x-content-type-options': 'nosniff' } } }, /immutable/],
    [{ '_headers': { status: 200 } }, /not be served/],
    [{ manifest: { ...manifest, release: { version: 'old' } } }, /exact validated bytes/],
  ]) await assert.rejects(compareLive(manifest, origin, host('/', changes)), error);
});
