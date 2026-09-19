import { writeFileSync } from 'node:fs';
import { deriveRelease } from './version.mjs';
import { artifactManifest, verifyArtifact } from './release-artifact.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--development')) throw new Error('usage: node tools/release-build.mjs [--development]');
process.env.CRAFTRUSH_BUILD_MODE = args.includes('--development') ? 'development' : 'release';
const release = deriveRelease(process.cwd(), process.env.CRAFTRUSH_BUILD_MODE);
process.env.CRAFTRUSH_RELEASE_IDENTITY = JSON.stringify(release);
const { build } = await import('vite');
await build();
if (deriveRelease(process.cwd(), process.env.CRAFTRUSH_BUILD_MODE).fingerprint !== release.fingerprint) {
  throw new Error('build inputs changed during compilation; rebuild from a stable snapshot');
}
writeFileSync('build/artifact.json', JSON.stringify(artifactManifest('build', release), null, 2) + '\n');
verifyArtifact('build', { allowDevelopment: release.development });
console.log(`verified ${release.version} / ${release.fingerprint} / ${release.source}${release.dirty ? ' (dirty development build)' : ''}`);
