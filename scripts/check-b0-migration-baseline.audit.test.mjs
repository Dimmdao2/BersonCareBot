import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { after, before } from 'node:test';

import { acquireCheckoutLock, releaseCheckoutLock } from './b0-gate-selftest-lock.mjs';

// This matrix mutates the shared checkout; the other matrix does too. `node --test` runs the two
// files in parallel processes, so the lock — not an invocation flag — is what keeps them apart.
before(() => acquireCheckoutLock());
after(() => releaseCheckoutLock());

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

// Re-audit two: every shape that survived the independent audit of 2026-08-17 and is in the closure
// scope. Each one is an ordinary refactor of a forbidden command, not an obfuscation of it.
const reauditTwoSurvivingShapes = [
  // F1 — a bound executable with a computed argument. The parent commit killed this; the candidate
  // stopped killing it because one unresolvable element discarded the whole argument list.
  [
    'scripts/__reaudit_two_bound_executable_dynamic_arg.mjs',
    "import { spawnSync } from 'node:child_process';\nimport { resolve } from 'node:path';\nconst executable = 'psql';\nspawnSync(executable, ['-f', resolve(process.cwd(), 'history/0001_legacy.sql')]);\n",
  ],
  // F2 — a command string bound to a local name and run through exec/execSync.
  [
    'scripts/__reaudit_two_exec_variable_createdb.mjs',
    "import { execSync } from 'node:child_process';\nconst command = 'createdb bcb_throwaway';\nexecSync(command, { stdio: 'inherit' });\n",
  ],
  [
    'scripts/__reaudit_two_exec_variable_psql.mjs',
    "import { execSync } from 'node:child_process';\nconst command = 'psql -f apps/webapp/history/0001_legacy.sql';\nexecSync(command, { stdio: 'inherit' });\n",
  ],
  // F4 — an absolute binary path is the same command as the bare name.
  [
    'scripts/__reaudit_two_absolute_psql.sh',
    '#!/bin/sh\n/usr/lib/postgresql/16/bin/psql -d bcb_dev -f apps/webapp/history/0001_legacy.sql\n',
  ],
  [
    'scripts/__reaudit_two_absolute_createdb.sh',
    '#!/bin/sh\n/usr/lib/postgresql/16/bin/createdb bcb_throwaway\n',
  ],
  [
    'scripts/__reaudit_two_variable_absolute_psql.sh',
    '#!/bin/sh\nPSQL=/usr/bin/psql\n"$PSQL" -d bcb_dev -f apps/webapp/history/0001_legacy.sql\n',
  ],
  // F5 — a Make recipe line starts with a literal TAB, which no anchor used to cover.
  [
    'tools/__reaudit_two_make/Makefile',
    'reset:\n\tdropdb --if-exists bcb_throwaway\n\tcreatedb bcb_throwaway\n',
  ],
  // F7 — a `sh -c "…"` / `bash -c "…"` wrapper.
  ['scripts/__reaudit_two_sh_c.sh', '#!/bin/sh\nsh -c "createdb bcb_throwaway"\n'],
  ['scripts/__reaudit_two_bash_c.sh', '#!/bin/sh\nbash -c "dropdb bcb_throwaway"\n'],
  // F6 — a digest pin is the same image identity in YAML as in a Dockerfile.
  [
    'scripts/__reaudit_two_digest_compose.yml',
    'services:\n  db:\n    image: postgres@sha256:0000000000000000000000000000000000000000000000000000000000000000\n',
  ],
  [
    '.github/workflows/__reaudit_two_digest_service.yml',
    'name: bad\njobs:\n  bad:\n    services:\n      db:\n        image: postgres@sha256:0000000000000000000000000000000000000000000000000000000000000000\n    steps:\n      - run: echo hi\n',
  ],
  // F8 — `pg_restore --create` creates a database and rebuilds it from a dump, which PLAN.md:441
  // forbids outright.
  [
    'scripts/__reaudit_two_pg_restore.sh',
    '#!/bin/sh\npg_restore --clean --create --dbname postgres /var/backups/prod-A.dump\n',
  ],
  [
    'tools/__reaudit_two_pg_restore_child.mjs',
    "import { spawnSync } from 'node:child_process';\nconst dump = '/var/backups/prod-A.dump';\nspawnSync('pg_restore', ['--clean', '--create', '--dbname', 'postgres', dump]);\n",
  ],
  [
    'tools/__reaudit_two_pg_restore.py',
    "import subprocess\nsubprocess.run(['pg_restore', '--clean', '--create', '--dbname', 'postgres', '/var/backups/prod-A.dump'], check=True)\n",
  ],
];

test('kills every in-scope shape that survived the re-audit of 2026-08-17', { concurrency: false }, () => {
  for (const [relativePath, content] of reauditTwoSurvivingShapes) expectKilled(relativePath, content);
});

test('does not pin inert prose in an executable source file', { concurrency: false }, () => {
  const path = 'scripts/__b0_inert_prose.mjs';
  withFileMutation(path, '#!/usr/bin/env node\nconst note = "psql $DATABASE_URL -f retired.sql";\nvoid note;\n', () => {
    const result = run();
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
});
