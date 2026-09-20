import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// These workflows use block-style steps. Refuse other forms instead of silently
// accepting a workflow this small instrument has not inspected.
function assertPinned(source, name) {
  const lines = source.split('\n').filter(line => /\buses\s*:/.test(line) && !line.trimStart().startsWith('#'));
  assert.ok(lines.length > 0, `${name}: no action steps found`);
  for (const line of lines) {
    assert.match(line, /^\s*(?:-\s*)?uses: [\w.-]+\/[\w./-]+@[a-f0-9]{40}(?:\s+#.*)?\s*$/, `${name}: unpinned or unrecognised action step`);
  }
}

test('all checked-in workflow actions use immutable commit identities', () => {
  const root = new URL('../.github/workflows/', import.meta.url);
  for (const file of readdirSync(root).filter(name => /\.ya?ml$/.test(name))) {
    assertPinned(readFileSync(new URL(file, root), 'utf8'), file);
  }
});

test('the pin check rejects mutable refs and unsupported step forms', () => {
  for (const step of ['- uses: actions/checkout@v6', '- uses: actions/checkout@main',
    '- uses: actions/checkout@abc123', '- uses: "actions/checkout@v6"',
    '- {uses: actions/checkout@v6}', '- uses: ./local-action']) {
    assert.throws(() => assertPinned(step, 'control'));
  }
  assertPinned('- uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6', 'pinned control');
});
