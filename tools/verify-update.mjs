import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium, webkit, expect } from '@playwright/test'
import { assertNativeErrors } from './native-update-errors.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const legacySource = '2aac84666806238febac53f6e701bef8f1e16b2d'
const saveKey = 'craftrush_save_v1'
const contentTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
}

function filesIn(root) {
  const result = new Map()
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`
      if (entry.isDirectory()) visit(join(dir, entry.name), path)
      else {
        assert(entry.isFile(), `artifact is not a regular file: ${path}`)
        result.set(path, readFileSync(join(dir, entry.name)))
      }
    }
  }
  visit(root)
  return result
}

const inventory = files => Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))
  .map(([path, bytes]) => [path, digest(bytes)]))

function snapshot(dir, target) {
  const before = inventory(filesIn(dir))
  cpSync(dir, target, { recursive: true })
  const files = filesIn(target)
  assert.deepEqual(inventory(files), before, 'artifact changed while taking its snapshot')
  assert.deepEqual(inventory(filesIn(dir)), before, 'source artifact changed during snapshot')
  return { files, hashes: before, directory: target }
}

function command(executable, args, cwd, log) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` } })
  writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`)
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} failed; see ${log}\n${result.stderr?.slice(-3000)}`)
  return result.stdout.trim()
}

function historyState(root, logs, name) {
  const shallow = command('git', ['rev-parse', '--is-shallow-repository'], root, join(logs, `${name}-history.log`))
  const marker = resolve(root, command('git', ['rev-parse', '--git-path', 'shallow'], root, join(logs, `${name}-marker-path.log`)))
  const state = { shallow, marker: existsSync(marker) ? readFileSync(marker, 'utf8') : null }
  writeFileSync(join(logs, `${name}-history.json`), `${JSON.stringify(state, null, 2)}\n`)
  console.log(`legacy fixture ${name} history: ${JSON.stringify(state)}`)
  return shallow
}

function buildLegacy(root, work, evidence) {
  const dir = join(work, 'legacy-source')
  const logs = join(evidence, 'legacy-build')
  mkdirSync(logs, { recursive: true })
  command('git', ['--version'], root, join(logs, 'git-version.log'))
  historyState(root, logs, 'source')
  // A separate clone owns its hook config, dependencies and generated files.
  // Do not repoint the active checkout or share its postinstall configuration.
  command('git', ['clone', '--no-hardlinks', '--no-checkout', root, dir], root, join(logs, 'legacy-clone.log'))
  command('git', ['checkout', '--detach', legacySource], dir, join(logs, 'legacy-checkout.log'))
  assert.equal(command('git', ['rev-parse', 'HEAD'], dir, join(logs, 'legacy-head.log')), legacySource)
  assert.equal(historyState(dir, logs, 'clone'), 'false')
  command('npm', ['ci'], dir, join(logs, 'legacy-install.log'))
  command('npm', ['run', 'build'], dir, join(logs, 'legacy-build.log'))
  return join(dir, 'build')
}

// Both artifacts are immutable byte maps. Only the origin changes, not any
// service-worker API or response the browser receives from its own worker.
export async function startArtifactServer(artifacts, port = 0) {
  let current = 'legacy'
  let offline = false
  const requests = []
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid')
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    const body = ['/_headers', '/_redirects'].includes(path) ? undefined : artifacts[current].files.get(path)
    const status = offline ? 0 : body ? 200 : 404
    requests.push({ at: Date.now(), artifact: current, path, query: url.search, status })
    if (offline) { response.destroy(); return }
    const payload = body ?? Buffer.from('fixture 404')
    response.writeHead(status, {
      'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store',
      ...(path === '/service-worker.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    })
    response.end(payload)
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}/`, requests,
    flip() { current = 'candidate' },
    denyNetwork() { offline = true; server.closeAllConnections() },
    close: () => new Promise(done => { server.close(done); server.closeAllConnections() }),
  }
}

// No application code participates. The document deliberately catches the
// failed fetch, while the real native worker forwards it without modification.
// This control runs with the same WebKit binary as the game journey, so a
// changed driver diagnostic cannot silently widen the accepted error shape.
export async function verifyWorkerDenialControl() {
  const files = new Map([
    ['/index.html', Buffer.from(`<button id="probe">probe</button><output id="result">initial</output>
      <script>
        window.events = [];
        addEventListener('error', e => events.push({ type: 'error', message: e.message }));
        addEventListener('unhandledrejection', e => events.push({ type: 'rejection', message: String(e.reason) }));
        navigator.serviceWorker.register('/service-worker.js');
        document.querySelector('button').onclick = async () => {
          try { await fetch('/release.json?update-probe'); result.textContent = 'unexpected success' }
          catch { result.textContent = 'handled failure' }
        };
      </script>`)],
    ['/service-worker.js', Buffer.from(`
      self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));
    `)],
  ])
  const server = await startArtifactServer({ legacy: { files }, candidate: { files } })
  let browser
  const proof = { browser: 'webkit', url: server.url, errors: [], requests: server.requests }
  try {
    browser = await webkit.launch()
    const page = await browser.newPage()
    page.on('pageerror', error => proof.errors.push({ at: Date.now(), url: page.url(), message: error.message, stack: error.stack }))
    await page.goto(server.url)
    await page.waitForFunction(() => navigator.serviceWorker.controller)
    proof.offlineStarted = Date.now()
    server.denyNetwork()
    await page.locator('#probe').click()
    await expect(page.locator('#result')).toHaveText('handled failure')
    proof.documentErrors = await page.evaluate(() => window.events)
    assertNativeErrors(proof)
    return proof
  } finally {
    await browser?.close()
    await server.close()
  }
}

function assertPreserved(actual, expected, path = 'save') {
  // Additive defaults are permitted. Every existing field, including opaque
  // retired progress, must survive; arrays and scalar values are exact.
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    assert(actual && typeof actual === 'object', `${path} disappeared`)
    for (const [key, value] of Object.entries(expected)) assertPreserved(actual[key], value, `${path}.${key}`)
  } else assert.deepEqual(actual, expected, `${path} changed across the update`)
}

async function inspect(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      url: location.href, origin: performance.timeOrigin,
      version: document.querySelector('#verTag')?.textContent,
      banner: document.querySelector('#updateBanner')?.textContent,
      playing: window.CR?.nav.playing, paused: window.CR?.nav.paused,
      controller: navigator.serviceWorker.controller?.state,
      active: registration?.active?.state, waiting: registration?.waiting?.state,
      installing: registration?.installing?.state, caches: await caches.keys(),
      save: localStorage.getItem('craftrush_save_v1'),
      documentErrors: window.__nativeUpdateDocumentErrors ?? [],
    }
  })
}

async function assertStoragePreserved(page, before) {
  const actual = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
    .map(key => [key, localStorage.getItem(key)])))
  for (const [key, value] of Object.entries(before)) {
    if (key === saveKey) assertPreserved(JSON.parse(actual[key]), JSON.parse(value))
    else assert.equal(actual[key], value, `stored ${key} changed across the update`)
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const { values } = parseArgs({ options: {
    legacy: { type: 'string' },
    candidate: { type: 'string', default: join(root, 'build') },
    browser: { type: 'string', default: 'both' },
    port: { type: 'string', default: '0' },
    evidence: { type: 'string' },
  } })
  assert.equal(Number(process.versions.node.split('.')[0]), 22, 'native release proof uses Node 22')
  assert(['both', 'chromium', 'webkit'].includes(values.browser), 'browser must be both, chromium, or webkit')
  const work = mkdtempSync(join(tmpdir(), 'craftrush-native-update-'))
  const evidence = values.evidence ? resolve(values.evidence) : work
  mkdirSync(evidence, { recursive: true })
  const legacyBuild = values.legacy ? resolve(values.legacy) : buildLegacy(root, work, evidence)
  const artifacts = {
    legacy: snapshot(legacyBuild, join(work, 'legacy')),
    candidate: snapshot(resolve(values.candidate), join(work, 'candidate')),
  }
  const release = JSON.parse(artifacts.candidate.files.get('/release.json'))
  assert.match(release.fingerprint, /^[a-f0-9]{64}$/)
  const legacyVersion = JSON.parse(artifacts.legacy.files.get('/_app/version.json')).version
  const oldCache = `craftrush-${legacyVersion}`
  const newCache = `craftrush-${release.fingerprint}`
  assert.notEqual(oldCache, newCache, 'the fixture must contain two distinct worker generations')
  const manifest = {
    legacy: { directory: artifacts.legacy.directory, source: values.legacy ? 'supplied artifact; see hashes' : legacySource,
      version: legacyVersion, hashes: artifacts.legacy.hashes },
    candidate: { directory: artifacts.candidate.directory, release, hashes: artifacts.candidate.hashes },
  }
  writeFileSync(join(evidence, 'artifacts.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Native update evidence: ${evidence}; frozen fixtures: ${work}`)
  console.log(`Legacy ${legacyVersion}; candidate ${release.version} / ${release.fingerprint}`)
  const results = []
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (values.browser !== 'both' && values.browser !== name) continue
    const server = await startArtifactServer(artifacts, Number(values.port))
    const result = { browser: name, status: 'running', stages: [], errors: [], documentErrors: [], requests: server.requests }
    results.push(result)
    let browser, context, page, held
    const stage = label => { result.stages.push({ label, at: Date.now() }); console.log(`${name}: ${label}`) }
    try {
      if (name === 'webkit') result.workerControl = await verifyWorkerDenialControl()
      browser = await engine.launch({ headless: true })
      context = await browser.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: 'allow' })
      context.setDefaultTimeout(15000)
      context.setDefaultNavigationTimeout(20000)
      await context.exposeBinding('__reportNativeUpdateDocumentError', (_, error) => {
        result.documentErrors.push({ at: Date.now(), ...error })
      })
      context.on('page', tab => tab.on('pageerror', error => result.errors.push({
        at: Date.now(), url: tab.url(), message: error.message, stack: error.stack,
      })))
      await context.addInitScript(({ key }) => {
        // Playwright also evaluates this in the initial opaque about:blank.
        // That document has no storage origin and is not the app fixture.
        if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') return
        window.__nativeUpdateDocumentErrors = []
        const report = detail => {
          window.__nativeUpdateDocumentErrors.push(detail)
          window.__reportNativeUpdateDocumentError(detail)
        }
        window.addEventListener('error', event => report({
          type: 'error', message: event.message, file: event.filename, line: event.lineno,
        }))
        window.addEventListener('unhandledrejection', event => report({
          type: 'unhandledrejection', message: String(event.reason),
        }))
        if (localStorage.getItem(key) === null) {
          const raw = JSON.stringify({
            level: 4, bestLevel: 4, emeralds: 404, unlocked: ['steve', 'alex'],
            tutorialSeen: true, sound: false, music: false, sfx: false,
            campaign: { done: ['mine_obsidian'] },
          })
          localStorage.setItem(key, raw)
          localStorage.setItem('craftrush_pre_restore_v1', JSON.stringify({ ts: 123, raw }))
          localStorage.setItem('craftrush_backups_v1', JSON.stringify([{
            day: '2026-09-01', ts: 123, level: 4, emeralds: 404, code: `CR1|${btoa(raw)}`,
          }]))
          localStorage.setItem('native-update-unrelated', 'keep this exactly')
        }
      }, { key: saveKey })
      page = await context.newPage()
      await page.goto(server.url)
      await page.locator('#btnPlayShooter').waitFor()
      await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated')
      await page.evaluate(() => caches.open('unrelated-fixture-cache').then(cache => cache.put('/unrelated-fixture', new Response('keep'))))
      await expect(page.locator('#verTag')).toHaveText(`v${legacyVersion}`)
      held = await context.newPage()
      await held.goto(server.url)
      await held.locator('#btnPlayShooter').click()
      await held.locator('#btnPause').click()
      await held.locator('#btnResume').waitFor()
      const heldBefore = await inspect(held)
      assert(heldBefore.playing && heldBefore.paused, 'held client must remain in an unfinished run')
      const savedBefore = JSON.parse(heldBefore.save)
      const storageBefore = await held.evaluate(() => Object.fromEntries(Object.keys(localStorage)
        .map(key => [key, localStorage.getItem(key)])))
      result.preservedStorageKeys = Object.keys(storageBefore).sort()
      const oldModule = await held.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => new URL(entry.name).pathname).filter(path => path.startsWith('/_app/immutable/') && path.endsWith('.js')))
        .then(paths => paths.find(path => artifacts.legacy.files.has(path) && !artifacts.candidate.files.has(path)))
      assert(oldModule, 'fixture needs a loaded legacy module absent from the new origin')
      stage('two real legacy clients, second held in a paused run')
      const firstBefore = await inspect(page)
      server.flip()
      await page.bringToFront()
      // Dispatch only a lifecycle trigger. Installation, waiting, activation,
      // cache reads and controllerchange all use the native browser APIs.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.locator('#btnApplyUpdate').waitFor()
      const waiting = await inspect(page)
      assert.equal(waiting.waiting, 'installed')
      assert.equal(waiting.origin, firstBefore.origin, 'update reloaded before consent')
      assert.equal(waiting.version, `v${legacyVersion}`)
      assert(waiting.caches.includes(oldCache) && waiting.caches.includes(newCache))
      stage('new worker downloaded and waits for the real menu UPDATE button')
      await page.locator('#btnApplyUpdate').click()
      await expect(page.locator('#verTag')).toHaveText(`v${release.version}`, { timeout: 20000 })
      await page.locator('#btnPlayShooter').waitFor()
      const current = await inspect(page)
      assert.notEqual(current.origin, firstBefore.origin)
      assertPreserved(JSON.parse(current.save), savedBefore)
      await assertStoragePreserved(page, storageBefore)
      const heldAfter = await inspect(held)
      assert.equal(heldAfter.origin, heldBefore.origin, 'second client was reloaded in an unfinished run')
      assert(heldAfter.playing && heldAfter.paused)
      assert(heldAfter.caches.includes(oldCache), 'old cache retired while its client is held')
      const oldRequests = server.requests.filter(request => request.path === oldModule).length
      const servedOldHash = await held.evaluate(async path => {
        const response = await fetch(path)
        if (!response.ok) throw new Error(`legacy module: ${response.status}`)
        const bytes = await response.arrayBuffer()
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map(byte => byte.toString(16).padStart(2, '0')).join('')
      }, oldModule)
      assert.equal(servedOldHash, artifacts.legacy.hashes[oldModule], 'held module bytes changed')
      assert.equal(server.requests.filter(request => request.path === oldModule).length, oldRequests,
        'held legacy module escaped to the origin instead of its retained cache')
      result.oldModule = oldModule
      stage('consented client updated; held client and its exact old module survive')
      await held.close()
      held = null
      await page.locator('#verTag').click()
      await page.getByRole('button', { name: 'CHECK FOR UPDATES', exact: true }).click()
      await expect(page.getByRole('dialog')).toContainText('This build is current')
      await page.getByRole('button', { name: 'CLOSE', exact: true }).click()
      await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 15000 })
        .not.toContain(oldCache)
      const retired = await page.evaluate(() => caches.keys())
      assert(retired.includes(newCache) && retired.includes('unrelated-fixture-cache'))
      assert.equal(await page.evaluate(() => localStorage.getItem('native-update-unrelated')), 'keep this exactly')
      stage('sole current client acknowledges; only obsolete app cache retires')
      result.offlineStarted = Date.now()
      server.denyNetwork()
      // Deny requests at the HTTP origin in both engines. WebKit's Playwright
      // driver-offline navigation is a different instrument with known limits;
      // this proves loss of the origin, not an iOS radio/airplane-mode switch.
      result.offlineInstrument = 'origin destroys every network response; browser service workers remain native'
      await page.reload()
      await page.locator('#btnPlayShooter').click()
      await page.locator('#btnPause').click()
      await page.locator('#btnResume').waitFor()
      await expect(page.locator('#gameCanvas')).toBeVisible()
      assertPreserved(JSON.parse((await inspect(page)).save), savedBefore)
      for (const address of ['rescue.html', 'rescue?from=offline-check']) {
        await page.goto(new URL(address, server.url).href)
        await expect(page.locator('h1')).toHaveText('Save Rescue')
        await expect(page.locator('#box')).not.toHaveValue('')
        assertPreserved(JSON.parse(await page.locator('#box').inputValue()), savedBefore)
        await assertStoragePreserved(page, storageBefore)
      }
      const notices = await page.evaluate(async () => {
        const response = await fetch('./third-party-notices.txt')
        return { status: response.status, text: await response.text() }
      })
      assert.equal(notices.status, 200)
      assert.equal(digest(notices.text), artifacts.candidate.hashes['/third-party-notices.txt'])
      assert.match(notices.text, /Permission is hereby granted/)
      stage('without origin: reload, play, pause, rescue progress and exact licence notice')
      result.final = await inspect(page)
      if (assertNativeErrors({ ...result, url: server.url })) {
        assert(result.workerControl.errors.length > 0, 'current WebKit control did not exhibit this diagnostic')
        result.workerNetworkDiagnostics = 'exact native-worker rejection pairs, with document catch intact; retained above'
      }
      result.status = 'passed'
    } catch (error) {
      result.status = 'failed'
      result.failure = error.stack
      for (const [label, tab] of [['current', page], ['held', held]]) {
        if (tab && !tab.isClosed()) {
          try { result[label] = await inspect(tab) } catch (diagnosticError) { result[label] = { error: diagnosticError.message } }
          try { await tab.screenshot({ path: join(evidence, `${name}-${label}.png`) }) } catch {}
        }
      }
      console.error(`${name}: ${error.stack}`)
    } finally {
      await context?.close().catch(() => {})
      await browser?.close().catch(() => {})
      await server.close()
      writeFileSync(join(evidence, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
    }
  }
  assert(results.length > 0 && results.every(result => result.status === 'passed'), `Native update did not pass: ${evidence}/results.json`)
  assert.deepEqual(inventory(filesIn(resolve(values.candidate))), artifacts.candidate.hashes,
    'candidate artifact changed while its native proof was running')
  console.log(`Native old → new → offline PASS (${results.map(result => result.browser).join(', ')}). Evidence: ${evidence}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
