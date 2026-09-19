import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertNativeErrors } from '../tools/native-update-errors.mjs'

const fixture = () => ({
  browser: 'webkit', url: 'http://127.0.0.1:4394/', offlineStarted: 100,
  documentErrors: [],
  requests: [{ at: 110, path: '/release.json', query: '?update-probe', status: 0 }],
  errors: [
    { at: 111, url: 'http://127.0.0.1:4394/', message: 'TypeError: Load failed', stack: '' },
    { at: 111, url: 'http://127.0.0.1:4394/', message: '/127.0.0.1:4394/release.json?update-probe.', stack: '' },
  ],
})

test('admits only the measured native-worker diagnostic pair after origin denial', () => {
  assert.equal(assertNativeErrors(fixture()), true)
  assert.equal(assertNativeErrors({ ...fixture(), browser: 'chromium', errors: [] }), false)
})

for (const [name, mutate] of [
  ['document exception with the same message', value => value.documentErrors.push({ message: 'TypeError: Load failed' })],
  ['pre-denial diagnostic', value => { value.errors[0].at = 99 }],
  ['unrelated error', value => { value.errors[0].message = 'application failure' }],
  ['another resource URL', value => { value.errors[1].message = '/127.0.0.1:4394/game.js.' }],
  ['nonempty stack', value => { value.errors[0].stack = 'at application.ts:1' }],
  ['unpaired diagnostic', value => value.errors.pop()],
  ['missing denied origin request', value => { value.requests = [] }],
  ['origin request not denied', value => { value.requests[0].status = 200 }],
  ['denial on an unrelated URL', value => { value.requests[0].path = '/game.js' }],
  ['denial before the offline phase', value => { value.requests[0].at = 99 }],
  ['denial after the reported error', value => { value.requests[0].at = 120 }],
  ['this signature from Chromium', value => { value.browser = 'chromium' }],
]) test(`rejects ${name}`, () => {
  const value = fixture()
  mutate(value)
  assert.throws(() => assertNativeErrors(value))
})
