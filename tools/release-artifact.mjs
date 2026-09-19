import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function artifactManifest(directory, release) {
  const files = {};
  const walk = (path = '') => {
    for (const entry of readdirSync(join(directory, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const name = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile() && name !== 'artifact.json') files[name] = digest(readFileSync(join(directory, name)));
      else if (!entry.isFile()) throw new Error(`unsupported artifact entry: ${name}`);
    }
  };
  walk();
  return { schema: 1, release, files, sha256: digest(JSON.stringify(files)) };
}

export function assertCurrentDeploy(source, mainHead, ref = 'refs/heads/main') {
  assert.equal(ref, 'refs/heads/main', 'only main can deploy');
  assert.match(source, /^[a-f0-9]{40}$/, 'deploy source is an exact commit');
  assert.equal(source, mainHead, 'outdated deployment refused: validated source is no longer main HEAD');
}

export function verifyArtifact(directory, { allowDevelopment = false, expectedSource } = {}) {
  const read = name => readFileSync(join(directory, name), 'utf8');
  const manifest = JSON.parse(read('artifact.json'));
  const release = JSON.parse(read('release.json'));
  assert.deepEqual(manifest, artifactManifest(directory, release), 'artifact bytes or manifest changed after validation');
  assert.match(release.fingerprint, /^[a-f0-9]{64}$/);
  assert.match(release.source, /^[a-f0-9]{40}$/);
  if (expectedSource) assert.equal(release.source, expectedSource, 'artifact must come from the requested commit');
  if (!allowDevelopment) {
    assert.equal(release.development, false, 'development artifact cannot deploy');
    assert.equal(release.dirty, false, 'dirty artifact cannot deploy');
    assert.match(release.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    assert.match(release.anchor, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  }
  assert.equal(JSON.parse(read('_app/version.json')).version, release.fingerprint, 'Kit updater and release fingerprint agree');
  const clientCode = Object.keys(manifest.files).filter(name => name.endsWith('.js') && name !== 'service-worker.js').map(read).join('\n');
  assert.ok(clientCode.includes(release.version), 'client shell agrees with release version');
  assert.ok(read('service-worker.js').includes(release.fingerprint), 'worker cache agrees with release fingerprint');
  for (const name of ['index.html', 'manifest.webmanifest', 'rescue.html', 'third-party-notices.txt', 'licenses.json']) {
    assert.ok(manifest.files[name], `artifact includes ${name}`);
  }
  const inventory = JSON.parse(read('licenses.json'));
  const notices = read('third-party-notices.txt');
  assert.ok(inventory.firstParty.notice.length > 80 && notices.includes(inventory.firstParty.notice), 'first-party license travels with the artifact');
  for (const name of ['svelte', 'qrcode']) assert.ok(inventory.packages.some(pkg => pkg.name === name), `artifact inventory includes ${name}`);
  for (const pkg of inventory.packages) {
    assert.ok(pkg.modules.length && pkg.notices.length, `inventory has evidence for ${pkg.name}`);
    for (const notice of pkg.notices) assert.ok(notices.includes(notice.text), `complete notice for ${pkg.name}`);
  }
  for (const asset of inventory.staticAssets) assert.equal(manifest.files[asset.path.replace(/^static\//, '')], asset.sha256, `static asset matches inventory: ${asset.path}`);
  // Membership alone is not offline availability. Browser tests exercise the
  // service worker's actual offline response separately.
  for (const name of ['third-party-notices.txt', 'licenses.json', 'release.json']) {
    assert.ok(read('service-worker.js').includes(name), `worker includes offline ${name}`);
  }
  return release;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--current') assertCurrentDeploy(process.argv[3], process.argv[4], process.argv[5]);
  else {
    const release = verifyArtifact(process.argv[2] || 'build', {
      allowDevelopment: process.argv.includes('--development'),
      expectedSource: process.env.CRAFTRUSH_EXPECTED_SOURCE ?? process.env.GITHUB_SHA,
    });
    console.log(`artifact verified: ${release.version} / ${release.fingerprint} / ${release.source}`);
  }
}
