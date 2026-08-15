import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const gate = resolve(repoRoot, 'scripts/prod-to-target-cutover-executable-gate.mjs');

test('actual product cutover SQL preserves the systemic ownership and data invariants', () => {
  const output = execFileSync(process.execPath, [gate], { cwd: repoRoot, encoding: 'utf8' });
  assert.match(output, /PASS executable cutover systemic gate/u);
});

for (const mutant of ['membership', 'f1', 'f2', 'f3', 'f4', 'f5']) {
  test(`saved ${mutant} product-SQL mutant turns the executable gate red`, () => {
    const output = execFileSync(process.execPath, [gate, `--mutant=${mutant}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.match(output, new RegExp(`^RED ${mutant}:`, 'mu'));
  });
}
