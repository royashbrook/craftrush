import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// This baseline predates the port. Never regenerate it from candidate output.
const baseline = '2aac84666806238febac53f6e701bef8f1e16b2d';
const unchanged = ['achievements', 'atlaskey', 'audio', 'boss', 'combat', 'crowd',
  'encounters', 'engine', 'fx', 'game', 'levelgen', 'mastery', 'render', 'theme', 'variants'];

function executable(source) {
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    verbatimModuleSyntax: true, removeComments: true,
  } }).outputText;
  const ast = ts.createSourceFile('runtime.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const walk = node => {
    if (ts.isParenthesizedExpression(node)) return walk(node.expression);
    if (ts.isStringLiteral(node)) return [node.kind, node.text.replace(/\.ts$/u, '.js')];
    if (ts.isIdentifier(node) || ts.isNumericLiteral(node)) return [node.kind, node.text];
    return [node.kind, ...node.getChildren(ast).map(walk)];
  };
  return walk(ast);
}

test('type erasure preserves the pinned engine executable syntax', () => {
  for (const name of unchanged) {
    const old = execFileSync('git', ['show', `${baseline}:js/${name}.js`], { encoding: 'utf8' });
    const current = readFileSync(new URL(`../js/${name}.ts`, import.meta.url), 'utf8');
    assert.deepEqual(executable(current), executable(old), name);
  }
});

test('the parity instrument sees changed rules, not just module names', () => {
  const current = readFileSync(new URL('../js/game.ts', import.meta.url), 'utf8');
  assert(current.includes('this.playerZ += this.speed * dt;'));
  const mutant = current.replace('this.playerZ += this.speed * dt;', 'this.playerZ += this.speed * dt * 2;');
  assert.notDeepEqual(executable(current), executable(mutant));
});
