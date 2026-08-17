import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { collectRetiredProductPostgresTests } from './census-retired-postgres-tests.mjs';

const root = resolve(import.meta.dirname, '..');
const checker = resolve(root, 'scripts/check-retired-db-consequence-inventory.mjs');

test('accounts for the complete 123-path retirement and the exact 122 product declarations', () => {
  const result = spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /123 paths/);
  assert.match(result.stdout, /product=122/);
  const dispositions = /static=(\d+) security=(\d+) named-DEV-READY=(\d+) required=(\d+) retired=(\d+)/.exec(
    result.stdout,
  );
  assert(dispositions, 'computed declaration disposition counts are missing');
  assert.equal(
    dispositions.slice(1).reduce((sum, count) => sum + Number(count), 0),
    122,
  );
  assert.match(result.stdout, /other=55 independent/);
});

// The stored inventory is only trustworthy while it matches the executable source census. A stored
// row that silently loses a declaration is exactly how the 121/122 undercount survived.
test('stores exactly the declarations the executable AST census finds in each retired source file', () => {
  const inventory = JSON.parse(
    readFileSync(
      resolve(root, 'docs/archive/2026-08-no-disposable-db-retirement/retired-executor-consequences.json'),
      'utf8',
    ),
  );
  const stored = new Map(
    inventory.rows
      .filter((row) => row.classification === 'product-postgres-oracle')
      .map((row) => [row.path, row]),
  );
  const census = collectRetiredProductPostgresTests();

  assert.deepEqual([...stored.keys()].sort(), census.map((row) => row.path).sort());
  for (const row of census) {
    const storedRow = stored.get(row.path);
    assert.deepEqual(
      storedRow.declarations.map((declaration) => declaration.title),
      row.titles,
      `${row.path}: stored declarations diverge from the source census`,
    );
    assert.deepEqual(
      storedRow.consequences,
      row.titles,
      `${row.path}: stored consequences diverge from the source census`,
    );
  }
  assert.equal(
    census.reduce((sum, row) => sum + row.calls, 0),
    122,
  );
});
