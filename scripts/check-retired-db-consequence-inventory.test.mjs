import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checker = resolve(root, 'scripts/check-retired-db-consequence-inventory.mjs');

test('accounts for the complete 123-path retirement and the exact 121 product declarations', () => {
  const result = spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /123 paths/);
  assert.match(result.stdout, /product=121/);
  assert.match(result.stdout, /named-DEV-READY=22 required=82/);
  assert.match(result.stdout, /other=55 independent/);
});
