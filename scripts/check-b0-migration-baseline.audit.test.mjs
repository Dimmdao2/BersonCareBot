import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const checker = resolve(root, 'scripts/check-b0-migration-baseline.mjs');

function run() {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function withFileMutation(relativePath, content, verify) {
  const path = resolve(root, relativePath);
  const existed = existsSync(path);
  const original = existed ? readFileSync(path, 'utf8') : null;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  try {
    verify();
  } finally {
    if (original !== null) writeFileSync(path, original);
    else rmSync(path, { force: true });
    let directory = dirname(path);
    while (directory !== root && existsSync(directory)) {
      try {
        rmSync(directory);
      } catch {
        break;
      }
      directory = dirname(directory);
    }
  }
}

function expectKilled(relativePath, content) {
  withFileMutation(relativePath, content, () => {
    const result = run();
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(result.status, 0, `mutation survived: ${relativePath}\n${output}`);
    assert.match(output, new RegExp(relativePath.split('/').at(-1).replaceAll('.', '\\.')));
  });
}

const savedAuditFaults = [
  ['scripts/__b0_psql_file.sh', '#!/bin/sh\npsql "$DATABASE_URL" -f legacy.sql\n'],
  ['scripts/__b0_a0-greenfield.sh', '#!/bin/sh\necho indirect\n'],
  ['scripts/__b0_database_ddl.sql', '  create   database bcb_throwaway;\n'],
  ['scripts/__b0_postgres_container.sh', '#!/bin/sh\ndocker run --rm postgres:17\n'],
  [
    'scripts/__b0_psql_child.mjs',
    "import { spawnSync } from 'node:child_process';\nspawnSync('psql', ['-f', 'legacy.sql']);\n",
  ],
  ['scripts/__b0_psql_stdin.sh', '#!/bin/sh\npsql "$DATABASE_URL" < legacy.sql\n'],
  ['tools/__b0_createdb.sh', '#!/bin/sh\ncreatedb bcb_throwaway\n'],
  ['.github/workflows/__b0_initdb.yml', 'name: bad\njobs:\n  bad:\n    steps:\n      - run: initdb /tmp/pg\n'],
  [
    'packages/__b0_fourth_workspace/package.json',
    '{"name":"@bersoncare/__b0","scripts":{"db":"dropdb bcb_throwaway"}}\n',
  ],
  [
    'apps/media-worker/__b0_createdb.mjs',
    "import { execFileSync } from 'node:child_process';\nexecFileSync('createdb', ['bcb_throwaway']);\n",
  ],
];

test('kills all ten file/workspace faults saved by the independent audit', { concurrency: false }, () => {
  for (const [relativePath, content] of savedAuditFaults) expectKilled(relativePath, content);
});

test('kills root manifest command and forbidden-name faults saved by the independent audit', { concurrency: false }, () => {
  const path = 'package.json';
  const original = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const cases = [
    ['__b0_database_command', 'createdb bcb_throwaway'],
    ['db:a0-bootstrap', 'node scripts/check-b0-migration-baseline.mjs'],
  ];
  for (const [name, command] of cases) {
    const mutated = structuredClone(original);
    mutated.scripts = { ...mutated.scripts, [name]: command };
    withFileMutation(path, `${JSON.stringify(mutated, null, 2)}\n`, () => {
      const result = run();
      const output = `${result.stdout}${result.stderr}`;
      assert.notEqual(result.status, 0, `root manifest mutation survived: ${name}\n${output}`);
      assert.match(output, new RegExp(name.replaceAll(':', '\\:')));
    });
  }
});

const equivalentFaults = [
  ['scripts/__b0_uppercase_ddl.sql', 'DrOp\tDaTaBaSe bcb_throwaway;\n'],
  ['scripts/__b0_container_version.sh', '#!/bin/sh\ndocker run POSTGRES:16-alpine\n'],
  [
    'scripts/__b0_execfile_psql.mts',
    "import { execFile } from 'node:child_process';\nexecFile('psql', ['--file', 'history.sql']);\n",
  ],
  ['scripts/__b0_sql_include.sql', '\\i history.sql\n'],
  [
    'scripts/__b0_exec_shell.cjs',
    "const { execSync } = require('node:child_process');\nexecSync('PG_CTL start -D /tmp/pg');\n",
  ],
  ['scripts/__b0_container_unpinned.yml', 'services:\n  db:\n    image: postgres\n'],
];

test('kills case, spacing, version, child-process and SQL-include equivalents', { concurrency: false }, () => {
  for (const [relativePath, content] of equivalentFaults) expectKilled(relativePath, content);
});

// Re-audit one, finding 2: command resolution and image identity must not depend on the surface form.
const reauditOneResolutionFaults = [
  [
    'scripts/__b0_quoted_variable_psql.sh',
    '#!/bin/sh\ndatabase_client=psql; "$database_client" "$DATABASE_URL" -f history.sql\n',
  ],
  [
    'tools/__b0_qualified_postgres_image/Dockerfile',
    'FROM docker.io/library/postgres:17\nRUN echo active\n',
  ],
  ['scripts/__b0_qualified_compose_image.yml', 'services:\n  db:\n    image: docker.io/library/postgres:17\n'],
];

test('kills quoted variable-resolved psql and fully-qualified PostgreSQL images', { concurrency: false }, () => {
  for (const [relativePath, content] of reauditOneResolutionFaults) expectKilled(relativePath, content);
});

test('does not pin inert prose in an executable source file', { concurrency: false }, () => {
  const path = 'scripts/__b0_inert_prose.mjs';
  withFileMutation(path, '#!/usr/bin/env node\nconst note = "psql $DATABASE_URL -f retired.sql";\nvoid note;\n', () => {
    const result = run();
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
});
