import assert from 'node:assert/strict'

// WebKit forwards a rejected worker fetch as two page-error events even when
// the document catches the rejection. The native no-game control pins this
// signature; the classifier never treats a document exception as network noise.
export function assertNativeErrors({ browser, errors, documentErrors, offlineStarted, url, requests }) {
  assert.deepEqual(documentErrors, [], 'uncaught document errors occurred in the real journey')
  if (browser !== 'webkit' || errors.length === 0) {
    assert.deepEqual(errors, [], 'unexpected page errors occurred in the real journey')
    return false
  }
  const urlError = `/${new URL(url).host}/release.json?update-probe.`
  assert.equal(errors.length % 2, 0, 'unpaired WebKit error')
  for (let i = 0; i < errors.length; i += 2) {
    const [failure, path] = errors.slice(i, i + 2)
    assert.equal(failure.message, 'TypeError: Load failed')
    assert.equal(path.message, urlError)
    for (const event of [failure, path]) {
      assert.equal(event.stack, '')
      assert(event.at >= offlineStarted, 'worker error predates deliberate network denial')
      assert.equal(event.url, url)
    }
    assert(requests.some(request => request.status === 0 && request.path === '/release.json'
      && request.query === '?update-probe' && request.at >= offlineStarted && request.at <= failure.at),
    'worker rejection has no matching deliberately denied origin request')
  }
  return true
}
