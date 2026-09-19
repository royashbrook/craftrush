import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { deriveRelease, inputFingerprint, versionFromTag } from '../tools/version.mjs';

test('major-minor tags keep the historical commit-count patch rule', () => {
  assert.equal(versionFromTag('v1.7', 0), '1.7.0');
  assert.equal(versionFromTag('v1.7', 2), '1.7.2');
});

test('invalid tags and commit counts cannot stamp a release', () => {
  for (const tag of ['v1.7.1', '1.7', 'v01.7', 'v1.07', 'release-1.7']) assert.throws(() => versionFromTag(tag, 0));
  for (const count of [-1, 1.2, '01', '2e3', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => versionFromTag('v1.11', count));
});

const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'craftrush-version-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Version Fixture');
  git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  git(cwd, 'config', 'core.hooksPath', '/dev/null');
  git(cwd, 'commit', '--allow-empty', '-m', 'initial (refs #139)');
  return cwd;
}
const commit = (cwd, label) => git(cwd, 'commit', '--allow-empty', '-m', `${label} (refs #139)`);

test('first-parent anchor and all-reachable distance survive merges and a new milestone', t => {
  const cwd = repository(t);
  git(cwd, 'tag', 'v1.11');
  assert.equal(deriveRelease(cwd, 'release').version, '1.11.0');
  commit(cwd, 'main advance');
  git(cwd, 'checkout', '-b', 'side');
  commit(cwd, 'side change');
  git(cwd, 'tag', 'v99.0');
  git(cwd, 'tag', 'v99.0.1');
  git(cwd, 'checkout', 'main');
  commit(cwd, 'main second');
  git(cwd, 'merge', '--no-ff', 'side', '-m', 'merge side (refs #139)');
  const release = deriveRelease(cwd, 'release');
  assert.equal(release.version, '1.11.4');
  assert.equal(release.anchor, 'v1.11');
  assert.equal(release.source, git(cwd, 'rev-parse', 'HEAD'));
  assert.equal(release.dirty, false);
  assert.deepEqual(deriveRelease(cwd, 'release'), release);
  git(cwd, 'tag', 'v1.12');
  assert.equal(deriveRelease(cwd, 'release').version, '1.12.0');
});

test('release refuses missing or invalid anchor, dirty tree, shallow history and legacy regression', t => {
  const cwd = repository(t);
  git(cwd, 'tag', 'v01.2');
  assert.throws(() => deriveRelease(cwd, 'release'), /first-parent/);
  assert.equal(deriveRelease(cwd, 'development').version, '0.0.0-dev');
  git(cwd, 'tag', 'v1.9');
  git(cwd, 'tag', 'v1.10.1');
  assert.throws(() => deriveRelease(cwd, 'release'), /predates legacy/);
  commit(cwd, 'new release');
  git(cwd, 'tag', 'v1.11');
  writeFileSync(join(cwd, 'untracked.txt'), 'dirty');
  assert.throws(() => deriveRelease(cwd, 'release'), /clean working tree/);
  assert.equal(deriveRelease(cwd, 'development').dirty, true);
  rmSync(join(cwd, 'untracked.txt'));
  const shallow = join(cwd, 'shallow');
  git(cwd, 'clone', '--depth=1', pathToFileURL(cwd).href, shallow);
  assert.throws(() => deriveRelease(shallow, 'release'), /shallow/);
});

test('fingerprint covers app, art, toolchain and metadata, not generated copies or absolute checkout paths', t => {
  const cwd = repository(t);
  const second = repository(t);
  const identity = { version: '1.11.0', source: 'a'.repeat(40), anchor: 'v1.11', development: false, dirty: false };
  for (const directory of [cwd, second]) {
    mkdirSync(join(directory, 'js'));
    writeFileSync(join(directory, 'js/game.ts'), 'export const score = 1');
  }
  const original = inputFingerprint(cwd, identity);
  assert.equal(inputFingerprint(second, identity), original);
  mkdirSync(join(cwd, 'static/themes'), { recursive: true });
  writeFileSync(join(cwd, 'static/themes/generated.png'), 'copy');
  writeFileSync(join(cwd, 'static/rescue.html'), 'generated rescue');
  assert.equal(inputFingerprint(cwd, identity), original);
  for (const path of ['js/game.ts', 'src/page.svelte', 'themes/craft/atlas.png', 'static/icons/icon.png', 'tools/builder.mjs', 'package-lock.json']) {
    const before = inputFingerprint(cwd, identity);
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), 'changed input');
    assert.notEqual(inputFingerprint(cwd, identity), before, path);
  }
  assert.notEqual(inputFingerprint(second, { ...identity, dirty: true }), original);
});
