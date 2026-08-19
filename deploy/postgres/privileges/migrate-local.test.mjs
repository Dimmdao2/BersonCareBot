import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migratorPath = fileURLToPath(new URL('./migrate-local.mjs', import.meta.url));

function createRollbackRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-local-rollback-'));
  const bin = join(root, 'bin');
  const migrations = join(root, 'migrations');
  const capture = join(root, 'transaction.sql');
  const psqlCalls = join(root, 'psql-calls.log');
  mkdirSync(bin);
  mkdirSync(join(migrations, 'meta'), { recursive: true });
  writeFileSync(
    join(migrations, 'meta/_journal.json'),
    JSON.stringify({
      entries: [{ idx: 0, version: '7', when: 202608170001, tag: '0001_probe' }],
    }),
  );
  writeFileSync(
    join(migrations, '0001_probe.sql'),
    [
      '-- BCB-MIGRATION-OWNER: app_probe_owner',
      '-- BCB-MIGRATION-SCHEMA-CREATE: app',
      '-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql',
      'CREATE FUNCTION app.rollback_probe() RETURNS integer LANGUAGE plpgsql AS $$',
      'BEGIN',
      '  RETURN 1;',
      'END;',
      '$$;',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -eu
printf 'psql\n' >> '${psqlCalls}'
for arg in "$@"; do
  if [[ "$arg" == '-c' ]]; then exit 0; fi
done
cat > '${capture}'
`,
  );
  chmodSync(join(bin, 'psql'), 0o755);
  return { bin, capture, migrations, psqlCalls, root };
}

test('rollback-only sends pending Drizzle DDL through one transaction without a commit', () => {
  const runtime = createRollbackRuntime();
  const result = spawnSync(
    process.execPath,
    [
      migratorPath,
      '--db',
      'bcb_webapp_dev',
      '--migrator',
      'bcb_dev_migrator',
      '--drizzle-folder',
      runtime.migrations,
      '--rollback-only',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated and rolled back/u);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /^\\set ON_ERROR_STOP on\nBEGIN;/u);
  assert.match(transaction, /CREATE FUNCTION app\.rollback_probe/u);
  assert.match(transaction, /INSERT INTO drizzle\.__drizzle_migrations/u);
  assert.match(transaction, /\nROLLBACK;\s*$/u);
  assert.doesNotMatch(transaction, /^COMMIT;\s*$/mu);
});

test('rollback-only refuses the legacy file mode', () => {
  const result = spawnSync(
    process.execPath,
    [migratorPath, '--db', 'bcb_webapp_dev', '--migrator', 'bcb_dev_migrator', '--rollback-only'],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--rollback-only is supported only with --drizzle-folder/u);
});

test('rollback-only rejects every legacy execution surface before invoking psql', () => {
  const cases = [
    { option: '--step', args: (path) => ['--step', `app_probe_owner:${path}`] },
    { option: '--owner', args: () => ['--owner', 'app_probe_owner'] },
    { option: '--migration', args: (path) => ['--migration', path] },
    { option: '--backfill', args: (path) => ['--backfill', path] },
    { option: '--post', args: (path) => ['--post', path] },
  ];

  for (const scenario of cases) {
    const runtime = createRollbackRuntime();
    const legacyPath = join(runtime.root, `${scenario.option.slice(2)}.sql`);
    writeFileSync(legacyPath, "COPY (SELECT '') TO PROGRAM 'true';\n");
    const result = spawnSync(
      process.execPath,
      [
        migratorPath,
        '--db',
        'bcb_webapp_dev',
        '--migrator',
        'bcb_dev_migrator',
        '--drizzle-folder',
        runtime.migrations,
        '--rollback-only',
        ...scenario.args(legacyPath),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
      },
    );

    assert.notEqual(result.status, 0, `${scenario.option} was accepted`);
    assert.match(
      result.stderr,
      new RegExp(`legacy execution option\\(s\\): ${scenario.option}`, 'u'),
    );
    assert.equal(existsSync(runtime.psqlCalls), false, `${scenario.option} invoked psql`);
    assert.equal(existsSync(runtime.capture), false, `${scenario.option} emitted a transaction`);
  }
});

test('normal legacy execution still accepts migration, backfill and post files', () => {
  const runtime = createRollbackRuntime();
  const migrationPath = join(runtime.migrations, '0001_probe.sql');
  const backfillPath = join(runtime.root, 'backfill.sql');
  const postPath = join(runtime.root, 'post.sql');
  writeFileSync(backfillPath, 'SELECT 1;\n');
  writeFileSync(postPath, 'SELECT 2;\n');

  const result = spawnSync(
    process.execPath,
    [
      migratorPath,
      '--db',
      'bcb_webapp_dev',
      '--migrator',
      'bcb_dev_migrator',
      '--owner',
      'app_probe_owner',
      '--migration',
      migrationPath,
      '--backfill',
      backfillPath,
      '--post',
      postPath,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, new RegExp(`\\\\i ${migrationPath}`, 'u'));
  assert.match(transaction, new RegExp(`\\\\i ${backfillPath}`, 'u'));
  assert.match(transaction, new RegExp(`\\\\i ${postPath}`, 'u'));
  assert.match(transaction, /\nCOMMIT;\s*$/u);
  assert.doesNotMatch(transaction, /^ROLLBACK;\s*$/mu);
});

// Selection is by name now: pending is every file the ledger does not name, in file-name order.
// The fake psql answers three different questions the wrapper asks — prepare the ledger, read it,
// probe the catalog — so a run can be driven without a database.
function createLedgerRuntime({ appliedTags, absentObject = false }) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-local-ledger-'));
  const bin = join(root, 'bin');
  const migrations = join(root, 'migrations');
  const capture = join(root, 'transaction.sql');
  mkdirSync(bin);
  mkdirSync(join(migrations, 'meta'), { recursive: true });
  const tags = ['0000_first', '0001_late_arrival', '0002_third'];
  writeFileSync(
    join(migrations, 'meta/_journal.json'),
    JSON.stringify({ entries: tags.map((tag, idx) => ({ idx, version: '7', when: 1800000000100 + idx * 100, tag })) }),
  );
  for (const tag of tags) {
    writeFileSync(
      join(migrations, `${tag}.sql`),
      [
        '-- BCB-MIGRATION-OWNER: app_probe_owner',
        `CREATE OR REPLACE FUNCTION app.door_${tag}() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;`,
        '',
      ].join('\n'),
    );
  }
  const ledger = appliedTags
    .map((tag, index) => `${'a'.repeat(64)}\t${1800000000100 + index * 100}\t${tag}`)
    .join('\n');
  // The catalog probe asks one row per expected object, positional. The fake answers `t` for every
  // probe except the one that names `absentObject`'s function — "the ledger names it, the catalog
  // does not have it".
  writeFileSync(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -eu
statement=""
next=0
for arg in "$@"; do
  if [[ "$next" == 1 ]]; then statement="$arg"; next=0; fi
  if [[ "$arg" == '-c' ]]; then next=1; fi
done
if [[ -n "$statement" ]]; then
  case "$statement" in
    *'DO $bcb_ledger$'*) exit 0 ;;
    *'FROM drizzle.__drizzle_migrations'*) printf '%b\\n' ${JSON.stringify(ledger)}; exit 0 ;;
  esac
  while IFS= read -r line; do
    [[ "$line" == SELECT*' AS at'* ]] || continue
    at="\${line#SELECT }"
    at="\${at%% *}"
    if [[ '${absentObject ? 'yes' : 'no'}' == 'yes' && "$line" == *door_0000_first* ]]; then
      printf '%s\\tf\\n' "$at"
    else
      printf '%s\\tt\\n' "$at"
    fi
  done <<< "$statement"
  exit 0
fi
cat > '${capture}'
`,
  );
  chmodSync(join(bin, 'psql'), 0o755);
  return { bin, capture, migrations, root };
}

function runLedgerMigrator(runtime, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      migratorPath,
      '--db',
      'bersoncarebot_test',
      '--migrator',
      'bcb_test_migrator',
      '--drizzle-folder',
      runtime.migrations,
      ...extraArgs,
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${runtime.bin}:${process.env.PATH ?? ''}` } },
  );
}

test('a migration named below every applied one is applied, not skipped forever', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0002_third'] });

  const result = runLedgerMigrator(runtime);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /CREATE OR REPLACE FUNCTION app\.door_0001_late_arrival/u);
  assert.doesNotMatch(transaction, /app\.door_0002_third/u, 'an applied migration must not run again');
  assert.match(transaction, /INSERT INTO drizzle\.__drizzle_migrations \(hash, created_at, tag\)/u);
  assert.match(transaction, /'0001_late_arrival'\);/u);
  assert.match(result.stdout, /pending=1 total=3/u);
});

test('a ledger that names every migration reports itself current and touches nothing', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0001_late_arrival', '0002_third'] });

  const result = runLedgerMigrator(runtime);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already current for "bersoncarebot_test": pending=0 total=3/u);
  assert.equal(existsSync(runtime.capture), false, 'nothing may reach psql when nothing is pending');
});

test('an applied migration whose object is gone stops the run and names it', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0001_late_arrival', '0002_third'],
    absentObject: true,
  });

  const result = runLedgerMigrator(runtime);

  assert.notEqual(result.status, 0, 'a ledger answering for absent objects must not report success');
  assert.match(result.stderr, /objects are not in the catalog/u);
  assert.match(result.stderr, /absent: function app\.door_0000_first \(from 0000_first\)/u);
  assert.match(result.stderr, /--reapply 0000_first/u);
  assert.doesNotMatch(result.stdout, /already current/u);
  assert.equal(existsSync(runtime.capture), false, 'no transaction may reach psql behind the gate');
});

test('the named reapply drops the stale ledger row and sends the migration through again', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0001_late_arrival', '0002_third'],
    absentObject: true,
  });

  const result = runLedgerMigrator(runtime, ['--reapply', '0000_first']);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /CREATE OR REPLACE FUNCTION app\.door_0000_first/u);
  assert.doesNotMatch(transaction, /app\.door_0002_third/u);
  assert.match(transaction, /DELETE FROM drizzle\.__drizzle_migrations WHERE tag = '0000_first';/u);
  assert.match(result.stdout, /reapplied=1/u);
});

test('reapply refuses a tag the database never applied', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0002_third'] });

  const result = runLedgerMigrator(runtime, ['--reapply', '0001_late_arrival']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has not applied at all; it is ordinary pending work/u);
  assert.equal(existsSync(runtime.capture), false);
});
