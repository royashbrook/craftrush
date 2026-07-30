import test from 'node:test';
import assert from 'node:assert/strict';
import { versionFromTag } from '../tools/version.mjs';

test('major-minor tags keep the historical commit-count patch rule', () => {
  assert.equal(versionFromTag('v1.7', 0), '1.7.0');
  assert.equal(versionFromTag('v1.7', 2), '1.7.2');
});

test('patch tags stay three-part and continue incrementing the patch', () => {
  assert.equal(versionFromTag('v1.7.1', 0), '1.7.1');
  assert.equal(versionFromTag('v1.7.1', 1), '1.7.2');
  assert.equal(versionFromTag('2.0.9', 3), '2.0.12');
});

test('invalid tags and commit counts cannot stamp a release', () => {
  assert.throws(() => versionFromTag('release-1.7', 0));
  assert.throws(() => versionFromTag('v1.7.1.2', 0));
  assert.throws(() => versionFromTag('v1.7.1', -1));
});
