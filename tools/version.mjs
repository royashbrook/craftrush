import { execFileSync } from 'node:child_process';

export function versionFromTag(tag, commitsSince) {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag);
  const since = Number(commitsSince);
  if (!match || !Number.isInteger(since) || since < 0) {
    throw new Error('invalid release tag or commit count');
  }
  const [, major, minor, patch = '0'] = match;
  return `${major}.${minor}.${Number(patch) + since}`;
}

export function appVersion() {
  try {
    const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    const tag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], options).trim();
    const since = execFileSync('git', ['rev-list', `${tag}..HEAD`, '--count'], options).trim();
    return versionFromTag(tag, since);
  } catch {
    return '0.0.0-dev';
  }
}
