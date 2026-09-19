import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const milestone = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const git = (cwd, ...args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

export function versionFromTag(tag, distance) {
  if (!milestone.test(tag)) throw new Error('release anchor must be vMAJOR.MINOR without leading zeroes');
  if (!/^(0|[1-9]\d*)$/.test(String(distance)) || !Number.isSafeInteger(Number(distance))) {
    throw new Error('invalid commit distance');
  }
  return `${tag.slice(1)}.${distance}`;
}

// Generated copies are excluded: their source, build tool and lockfile are
// inputs. Otherwise the first build and the next identical build would differ.
export function inputFingerprint(cwd, identity) {
  const hash = createHash('sha256').update(JSON.stringify({ identity, node: process.version }));
  const visit = path => {
    if (!existsSync(join(cwd, path))) return;
    for (const entry of readdirSync(join(cwd, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const file = `${path}/${entry.name}`;
      if (file === 'static/themes' || file === 'static/rescue.html') continue;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hash.update(file).update('\0').update(readFileSync(join(cwd, file))).update('\0');
      else throw new Error(`unsupported build input: ${file}`);
    }
  };
  for (const path of ['src', 'js', 'themes', 'static', 'tools']) visit(path);
  for (const path of ['package.json', 'package-lock.json', 'vite.config.js', 'svelte.config.js', 'tsconfig.json', 'LICENSE']) {
    if (existsSync(join(cwd, path))) hash.update(path).update('\0').update(readFileSync(join(cwd, path))).update('\0');
  }
  return hash.digest('hex');
}

export function deriveRelease(cwd = process.cwd(), mode = process.env.CRAFTRUSH_BUILD_MODE || 'development') {
  if (!['release', 'development'].includes(mode)) throw new Error('CRAFTRUSH_BUILD_MODE must be release or development');
  const development = mode === 'development';
  const source = git(cwd, 'rev-parse', 'HEAD');
  const dirty = Boolean(git(cwd, 'status', '--porcelain', '--untracked-files=normal'));
  const shallow = git(cwd, 'rev-parse', '--is-shallow-repository') === 'true';
  const tags = git(cwd, 'tag', '--list').split('\n').filter(tag => milestone.test(tag));
  let anchor = null;
  if (tags.length) {
    try {
      anchor = git(cwd, 'describe', '--tags', '--first-parent', '--abbrev=0', ...tags.flatMap(tag => ['--match', tag]));
    } catch { /* no milestone reachable on the release branch */ }
  }
  if (!development) {
    if (shallow) throw new Error('release requires complete history and tags, not a shallow checkout');
    if (dirty) throw new Error('release requires a clean working tree');
    if (!anchor) throw new Error('release requires a vMAJOR.MINOR anchor on the first-parent history');
    // Existing patch tags remain intact. A migration cannot silently fall back
    // behind an already published major/minor; its new milestone is deliberate.
    const [major, minor] = anchor.slice(1).split('.').map(Number);
    const releaseHistory = new Set(git(cwd, 'rev-list', '--first-parent', source).split('\n'));
    const newerLegacy = git(cwd, 'tag', '--merged', source).split('\n').find(tag => {
      const parts = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
      return parts && (+parts[1] > major || (+parts[1] === major && +parts[2] > minor))
        && releaseHistory.has(git(cwd, 'rev-parse', `${tag}^{commit}`));
    });
    if (newerLegacy) throw new Error(`release anchor ${anchor} predates legacy ${newerLegacy}; establish the next major/minor milestone`);
  }
  const base = anchor ? versionFromTag(anchor, git(cwd, 'rev-list', `${anchor}..HEAD`, '--count')) : '0.0.0';
  const identity = { version: `${base}${development ? '-dev' : ''}`, source, anchor, dirty, development };
  return Object.freeze({ ...identity, fingerprint: inputFingerprint(cwd, identity) });
}

// The release wrapper pins one identity before Kit's server, client and worker
// builds load their configs. Dev also reuses that snapshot across config loads.
export function releaseIdentity() {
  if (!process.env.CRAFTRUSH_RELEASE_IDENTITY) process.env.CRAFTRUSH_RELEASE_IDENTITY = JSON.stringify(deriveRelease());
  return JSON.parse(process.env.CRAFTRUSH_RELEASE_IDENTITY);
}

export function appVersion() { return releaseIdentity().version; }
