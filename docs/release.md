# release contract

Tracked by [#139](https://github.com/royashbrook/craftrush/issues/139). This is the
required release path, not a claim that any particular candidate has passed it.
The issue records the exact source, artifact identity, gate results and live receipt.

## version and build identity

`tools/version.mjs` selects the nearest immutable `vMAJOR.MINOR` tag on HEAD's
first-parent history. Patch is the count of **all** commits reachable from HEAD
but not the anchor, including merged branch commits and the merge itself.
For example, `v1.11` produces `1.11.0`; the next two commits produce `1.11.2`.
Side-branch tags never become release anchors. Legacy three-part tags stay intact.

A release requires full Git history and tags, a clean tree and an eligible anchor.
There is no successful `0.0.0-dev` fallback. `npm run build:dev` is an explicit
development artifact, including a `-dev` label and dirty status; it cannot deploy.

The wrapper derives one identity before Vite's server/client/worker compilation.
`__RELEASE__` and `release.json` carry version, source commit, milestone, dirty and
development flags, plus a SHA-256 input fingerprint. Sources, original theme inputs,
build tools, lockfile and Node version participate. Generated copies and checkout
paths do not. A second fingerprint after compilation refuses inputs changed mid-build.
The Kit version document and service-worker cache use that fingerprint, not an
ordered version number, so a rebuild or intentional rollback can offer an update.

`artifact.json` separately hashes every emitted file except itself. The release
verifier checks those bytes, exact source, UI/worker identity agreement and complete
distribution notices. The input fingerprint is not presented as a hash of emitted
bytes; the artifact manifest supplies that separate proof.

## local and pull-request checks

Use Node 22 and a lockfile install:

```sh
npm ci
npm run check
npm test
npm run build:dev
npx playwright install --with-deps chromium webkit
PW_TARGET=build PW_PREBUILT=1 npx playwright test --forbid-only --retries=0
node tools/release-artifact.mjs build --development
node tools/verify-update.mjs --candidate build --evidence test-results/native-update
```

`check.yml` runs this pre-tag path on pull requests and main, with desktop/mobile
Chromium and desktop/iPhone WebKit projects. `PW_TARGET=build` enables worker tests;
`PW_PREBUILT=1` serves the already-built artifact instead of rebuilding it. The
workflow rejects zero tests, skips, unexpected results and flaky results. No test
assertion or timeout is weakened to pass release checks. Browser evidence remains
available for seven days. Hosted browser tests are not physical-phone evidence.

The native update proof rebuilds the frozen legacy source
`2aac84666806238febac53f6e701bef8f1e16b2d` in a separate local clone, using that
commit's own lockfile and build command on Node 22. Full checkout history is
required. It never changes the candidate or the caller's checkout/hook settings.
Both byte trees are snapshotted and hashed before either browser starts; the
candidate hashes must still match afterward. For a local rerun, `--legacy path/to/build`
accepts an existing frozen legacy artifact and records that it was supplied rather
than claiming to have rebuilt it from the pin.

Each workflow runs this proof **once per already-built candidate artifact** on
native Chromium and WebKit. The real UPDATE button applies the downloaded worker
while a second legacy client holds a paused run. The proof checks that held
document and its old module bytes survive, old cache retirement waits for the
sole current client, all existing save/recovery keys survive, and an unrelated
cache/key is retained. It then denies all HTTP-origin responses and proves
reload, play, pause, rescue export and exact offline licence notice bytes.
This models loss of the origin; it does not claim an iOS airplane-mode or
Playwright driver-offline result.

A minimal no-game native-worker control runs on the same WebKit binary. WebKit
can report its caught worker fetch rejection as two page-error diagnostics.
Those exact paired events are retained, not erased: they are admitted only after
deliberate origin denial with a matching refused request and no document error or
unhandled rejection. `tests/pwa-native.test.mjs` rejects document errors, unrelated
or early diagnostics, mismatched resources, missing requests and the same events
from Chromium. Any other failure still fails the gate.

## production path and ordering

`deploy-site.yml` keeps the existing workflow identity, Worker configuration,
hostname and `CLOUDFLARE_API_TOKEN` repository secret. The credential is injected
only into the deploy step and is never printed. Wrangler comes from the lockfile,
not a newly fetched CLI at deployment time.

Every production job checks out **main's current tip**, regardless of the triggering
event's age. One fixed concurrency group serializes production jobs and does not
cancel a running deploy. GitHub's pending queue is not assumed to preserve event
order; checking out current main is what makes a late old event harmless.
Immediately before publishing, a fresh fetch must still agree with the validated
source. A superseded candidate fails rather than publishing stale bytes.
This guard describes the final fetch, not an atomic lock on later main advances;
any subsequently queued job still validates main again before publishing.

The job installs from the lockfile, checks strict application types and unit tests,
builds once in strict release mode, runs all artifact browser projects, verifies
the artifact and retains it. It deploys that same directory without another build.
It then compares every served file with the validated manifest, checks host headers,
and verifies the deployed artifact manifest. Docs and workflow changes are not
excluded from main validation or commit-count release identity.

The deployment itself uses the existing `wrangler.jsonc` target. The scripts neither
mint milestone tags nor change the application's origin, manifest identity or save keys.

## the first house-spec release

The previous `v1.10.0` and `v1.10.1` tags are historical inputs, not tags to move,
delete or reinterpret. The older two-part `v1.9` anchor would move the visible
major/minor backwards, so strict release mode deliberately refuses it.

After the migration is reviewed and merged, establish **`v1.11` on the approved
main merge commit**. Record that exact source on #139, push the new immutable tag,
then dispatch `deploy-site.yml` on main. Tag creation is an explicit release action,
not something a build or workflow does automatically. Keep main fixed through the
initial receipt so the held old-version clients and live verifier have one target.

The main push can reach the production job before this milestone exists. That job
must fail the anchor check and publish nothing; the post-tag manual dispatch repeats
every production gate. Do not create a temporary tag merely to make the first job
green. Subsequent ordinary main commits derive their patch count from `v1.11`.

## host and notice evidence

`licenses.json` inventories rendered dependency modules from both the main app and
the separate self-contained rescue bundle. `third-party-notices.txt` retains their
complete installed license notices and the original project's license. Static asset
hashes and rescue bundle hashes tie the inventory to the distributed files. The
rescue inventory also records its template, rendered local modules, builder,
licence tool, lockfile, package metadata and Node runtime. Stale generated rescue
output fails compilation even if its own saved HTML hash still matches.
The worker includes the notices for offline use; browser checks must prove retrieval,
not merely find a filename in worker source.

The shell/rescue HTML uses `no-store, no-transform`; release metadata and the worker
must not be cached by the HTTP layer. Immutable app assets remain content-cached.
`_headers` and `_redirects` configure the host and must return 404 to clients.
Relative artifact paths retain both root and subdirectory hosting support.

The live verifier sends browser-shaped Accept/User-Agent headers for HTML. Its
regression control catches a host that gives Node clean HTML but injects script
for a browser-shaped request. That is not a substitute for the production receipt's
**actual browser navigation response hash**: browser transformations and request
details may differ from Node. Record that hash, the observed requests/cookies,
worker identity and old-to-new saved-data survival before claiming the live release
matches the reviewed artifact. An unverified browser or offline path stays named
as unverified rather than being inferred from another engine's pass.

References: [GitHub concurrency behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
[Cloudflare static asset deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
