import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checker = resolve(root, 'scripts/check-b0-migration-baseline.mjs');
const wrapper = resolve(root, 'scripts/__b0_alternate_executor.sh');
const inert = resolve(root, 'scripts/__b0_inert_prose.mjs');

function run() {
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8', timeout: 10_000 });
}

test('rejects a differently named executable SQL wrapper', () => {
  writeFileSync(wrapper, '#!/bin/sh\npsql "$DATABASE_URL" -f deploy/postgres/legacy-overlay.sql\n');
  try {
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /__b0_alternate_executor\.sh/);
  } finally {
    rmSync(wrapper, { force: true });
  }
});

test('does not pin inert prose in an executable source file', () => {
  writeFileSync(inert, '#!/usr/bin/env node\nconst note = "psql $DATABASE_URL -f retired.sql";\nvoid note;\n');
  try {
    const result = run();
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(inert, { force: true });
  }
});
