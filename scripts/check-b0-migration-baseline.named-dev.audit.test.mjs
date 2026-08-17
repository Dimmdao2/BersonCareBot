import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const checker = resolve(root, 'scripts/check-b0-migration-baseline.mjs');

function runGate() {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function expectKilled(relativePath, source) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
  try {
    const result = runGate();
    assert.notEqual(
      result.status,
      0,
      `active disposable/replay executor survived: ${relativePath}\n${result.stdout}${result.stderr}`,
    );
  } finally {
    rmSync(absolutePath, { force: true });
  }
}

test('rejects executable database creation through the pg client, not only createdb', () => {
  expectKilled(
    'scripts/__named_dev_pg_create.mjs',
    "import pg from 'pg';\nconst client = new pg.Client();\nawait client.query('CREATE DATABASE bcb_throwaway');\n",
  );
});

test('rejects psql meta-command replay passed through -c', () => {
  expectKilled(
    'scripts/__named_dev_psql_meta_replay.sh',
    "#!/bin/sh\npsql \"$DATABASE_URL\" -c '\\\\i history.sql'\n",
  );
});

test('rejects a callable Python createdb executor', () => {
  expectKilled(
    'tools/__named_dev_db_task.py',
    "import subprocess\nsubprocess.run(['createdb', 'bcb_throwaway'], check=True)\n",
  );
});

test('rejects case, spacing and alternate include equivalents', () => {
  for (const [path, source] of [
    [
      'tools/__named_dev_pg_drop.mts',
      "const client = getClient();\nawait client . query( `  DrOp  DaTaBaSe bcb_throwaway` );\n",
    ],
    [
      'scripts/__named_dev_psql_ir.sh',
      "#!/bin/sh\npsql \"$DATABASE_URL\" --command '\\ir history.sql'\n",
    ],
    [
      'tools/__named_dev_python_db_client.py',
      "cursor . execute(\"  CREATE   DATABASE bcb_throwaway\")\n",
    ],
    [
      'tools/__named_dev_python_dropdb.py',
      "import subprocess\nsubprocess . run(\"DROPDB bcb_throwaway\", shell=True, check=True)\n",
    ],
  ]) {
    expectKilled(path, source);
  }
});
