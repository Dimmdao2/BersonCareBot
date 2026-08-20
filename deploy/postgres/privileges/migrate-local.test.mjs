import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
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
  const journal = JSON.stringify({
    entries: [{ idx: 0, version: '7', when: 202608170001, tag: '0001_probe' }],
  });
  writeFileSync(join(migrations, 'meta/_journal.json'), journal);
  // The name check reads the frozen snapshot, never the live journal above (see module doc on
  // `findJournalGrowth`); a fixture that wants `0001_probe` treated as legacy must freeze it too.
  writeFileSync(join(migrations, 'meta/_journal.frozen.json'), journal);
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
function createLedgerRuntime({ appliedTags, absentObject = false, foreignRow = null }) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-local-ledger-'));
  const bin = join(root, 'bin');
  const migrations = join(root, 'migrations');
  const capture = join(root, 'transaction.sql');
  mkdirSync(bin);
  mkdirSync(join(migrations, 'meta'), { recursive: true });
  const tags = ['0000_first', '0001_late_arrival', '0002_third'];
  const journal = JSON.stringify({
    entries: tags.map((tag, idx) => ({ idx, version: '7', when: 1800000000100 + idx * 100, tag })),
  });
  writeFileSync(join(migrations, 'meta/_journal.json'), journal);
  // The name check reads the frozen snapshot, never the live journal above; these fixtures use
  // legacy-shaped tags throughout, so they must be frozen too, or every ledger test below would
  // fail the name check before ever reaching the behaviour it means to exercise.
  writeFileSync(join(migrations, 'meta/_journal.frozen.json'), journal);
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
  const ledgerLines = appliedTags.map(
    (tag, index) => `${index + 1}\t${'a'.repeat(64)}\t${1800000000100 + index * 100}\t${tag}`,
  );
  // A row this checkout cannot name, carrying the exact content hash of a pending file: the
  // scenario a rename of an already-applied migration produces. `hash` overrides `matchesTag`'s
  // derived hash for simulating content drift — a foreign row that is NOT a byte-identical rename.
  if (foreignRow) {
    const hash = foreignRow.hash
      ?? createHash('sha256').update(readFileSync(join(migrations, `${foreignRow.matchesTag}.sql`), 'utf8')).digest('hex');
    ledgerLines.push(`${foreignRow.id ?? 598}\t${hash}\t${foreignRow.createdAt}\t${foreignRow.tag ?? ''}`);
  }
  const ledger = ledgerLines.join('\n');
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

// The rename-of-an-applied-migration case: a pending file byte-identical to a ledger row this
// checkout cannot name is not new work, it is `0001_late_arrival.sql` come back under a name the
// journal never froze. Order-is-the-file-name makes that an identity change, and it must be refused
// before a single statement reaches psql — not silently applied a second time under a new tag.
test('a pending file byte-identical to a foreign ledger row is refused as a rename, not applied', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: '0009_old_name_from_another_branch', matchesTag: '0001_late_arrival', createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime);

  assert.notEqual(result.status, 0, 'a renamed applied migration must not report success');
  assert.match(result.stderr, /0001_late_arrival\.sql is byte-identical to a migration/u);
  assert.match(result.stderr, /renaming an applied migration is forbidden/u);
  assert.doesNotMatch(result.stdout, /already current/u);
  assert.equal(existsSync(runtime.capture), false, 'no transaction may reach psql behind the rename gate');
});

// The ordinary case this must not catch: content that only happens to be pending, with no foreign
// ledger row sharing its hash, is applied normally.
test('a pending file with no matching foreign ledger row is applied normally, not refused', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: '0009_unrelated', matchesTag: '0002_third', createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /CREATE OR REPLACE FUNCTION app\.door_0001_late_arrival/u);
  assert.match(result.stdout, /pending=1 total=3/u);
});

// --reapply is a deliberate, named re-run of a migration the caller already knows is applied; it
// must not be mistaken for the rename case even though the reapplied tag is, by definition, applied
// under its own name already.
test('reapply is not mistaken for a rename even when a foreign row shares its own content hash', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0001_late_arrival', '0002_third'],
    absentObject: true,
    foreignRow: { tag: '0009_unrelated', matchesTag: '0000_first', createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, ['--reapply', '0000_first']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reapplied=1/u);
});

// F1 (MIGRATION_TIMESTAMP_NAMES_AUDIT_2026-08-20.md §3(a)): a new file with an old hand-picked
// number, not in the frozen legacy snapshot, used to sail straight through this wrapper to
// `BEGIN`/`INSERT` — the name rule lived only in `pnpm run lint`. This proves the wrapper itself now
// refuses it before a single statement reaches psql, no lint involved.
test('a new file with a hand-picked number the frozen snapshot does not know is refused, not applied', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0001_late_arrival', '0002_third'] });
  writeFileSync(
    join(runtime.migrations, '0051_audit_old_numbered_new_file.sql'),
    '-- BCB-MIGRATION-OWNER: app_probe_owner\nCREATE OR REPLACE FUNCTION app.door_0051() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;\n',
  );

  const result = runLedgerMigrator(runtime);

  assert.notEqual(result.status, 0, 'a hand-picked new name must not report success');
  assert.match(result.stderr, /0051_audit_old_numbered_new_file\.sql is not named YYYYMMDDTHHMMSS_lower_snake_case/u);
  assert.match(result.stderr, /frozen legacy .*snapshot/u);
  assert.doesNotMatch(result.stdout, /already current/u);
  assert.equal(existsSync(runtime.capture), false, 'no transaction may reach psql behind the name gate');
});

// The ordinary case this must not catch: a new file named as a timestamp is applied normally, even
// though the frozen snapshot has never heard of it — that is the whole point of the timestamp shape.
test('a new timestamp-named file is applied normally, not refused by the name gate', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0001_late_arrival', '0002_third'] });
  writeFileSync(
    join(runtime.migrations, '20260820T014233_new_work.sql'),
    '-- BCB-MIGRATION-OWNER: app_probe_owner\nCREATE OR REPLACE FUNCTION app.door_new_work() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;\n',
  );

  const result = runLedgerMigrator(runtime);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /CREATE OR REPLACE FUNCTION app\.door_new_work/u);
  assert.match(result.stdout, /pending=1 total=4/u);
});

// --relabel: the pure-identity-change case a plain rename is refused for above. A foreign row
// byte-identical to a file this checkout already carries under a new name is repointed by a ledger
// UPDATE only — no statement in the file runs again.
test('relabel repoints a foreign row at its renamed file without re-running any statement', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: '0009_old_name_from_another_branch', matchesTag: '0001_late_arrival', createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, [
    '--relabel',
    '0009_old_name_from_another_branch:0001_late_arrival',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(
    transaction,
    /UPDATE drizzle\.__drizzle_migrations SET tag = '0001_late_arrival' WHERE tag = '0009_old_name_from_another_branch';/u,
  );
  assert.doesNotMatch(transaction, /app\.door_0001_late_arrival\(\) RETURNS/u, 'relabel must not re-run the file');
  assert.doesNotMatch(transaction, /INSERT INTO drizzle\.__drizzle_migrations \(hash, created_at, tag\)/u);
  assert.match(result.stdout, /pending=0 total=3/u);
  assert.match(result.stdout, /relabeled=1/u);
});

test('relabel refuses when the renamed file content has drifted from the foreign row', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: {
      tag: '0009_old_name_from_another_branch',
      hash: 'f'.repeat(64),
      createdAt: 1800000000350,
    },
  });

  const result = runLedgerMigrator(runtime, [
    '--relabel',
    '0009_old_name_from_another_branch:0001_late_arrival',
  ]);

  assert.notEqual(result.status, 0, 'content drift must not be silently relabeled');
  assert.match(result.stderr, /is not a pure rename/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('relabel refuses an old tag that is not a foreign ledger row', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0001_late_arrival', '0002_third'] });

  const result = runLedgerMigrator(runtime, ['--relabel', '0009_never_applied:0001_late_arrival']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is not a foreign ledger row of .* \(nothing to relabel\)/u);
  assert.equal(existsSync(runtime.capture), false);
});

// --drop-foreign: a foreign row with no claimant anywhere in the folder — the legacy-backfill
// mislabel shape, not a rename — is removed by a ledger DELETE, and nothing else in the transaction
// changes.
test('drop-foreign deletes a foreign row with no claimant in this folder', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0001_late_arrival', '0002_third'],
    foreignRow: { tag: '0050_mislabelled_legacy_row', hash: 'b'.repeat(64), createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, ['--drop-foreign', '0050_mislabelled_legacy_row']);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /DELETE FROM drizzle\.__drizzle_migrations WHERE tag = '0050_mislabelled_legacy_row';/u);
  assert.match(result.stdout, /pending=0 total=3/u);
  assert.match(result.stdout, /dropped-foreign=1/u);
});

test('drop-foreign refuses a row whose hash a file in this folder still claims', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: '0050_mislabelled_legacy_row', matchesTag: '0001_late_arrival', createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, ['--drop-foreign', '0050_mislabelled_legacy_row']);

  assert.notEqual(result.status, 0, 'a row a file still claims by hash must not be dropped');
  assert.match(result.stderr, /this is a rename, not a dead row/u);
  assert.match(result.stderr, /--relabel 0050_mislabelled_legacy_row:0001_late_arrival/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('drop-foreign refuses a tag that is not a foreign ledger row', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0001_late_arrival', '0002_third'] });

  const result = runLedgerMigrator(runtime, ['--drop-foreign', '0002_third']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is not a foreign ledger row of .* \(nothing to drop\)/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('drop-foreign-hash deletes one tagless foreign row by its observed hash', () => {
  const hash = 'c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124';
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0001_late_arrival', '0002_third'],
    foreignRow: { tag: null, hash, createdAt: 1800000070000, id: 598 },
  });

  const result = runLedgerMigrator(runtime, ['--drop-foreign-hash', hash]);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(
    transaction,
    /DELETE FROM drizzle\.__drizzle_migrations WHERE id = 598 AND tag IS NULL AND hash = 'c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124';/u,
  );
  assert.match(result.stdout, /dropped-foreign-by-hash=1/u);
});

test('drop-foreign-hash refuses a tagless row whose hash a file in this folder still claims', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: null, matchesTag: '0001_late_arrival', createdAt: 1800000000350 },
  });
  const hash = createHash('sha256')
    .update(readFileSync(join(runtime.migrations, '0001_late_arrival.sql'), 'utf8'))
    .digest('hex');

  const result = runLedgerMigrator(runtime, ['--drop-foreign-hash', hash]);

  assert.notEqual(result.status, 0, 'a row a file still claims by hash must not be dropped');
  assert.match(result.stderr, /this is a rename, not a dead row/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('drop-foreign-hash refuses a hash that names no tagless foreign row', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0001_late_arrival', '0002_third'] });

  const result = runLedgerMigrator(runtime, ['--drop-foreign-hash', 'c13927102c549a4d']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is not exactly one tagless foreign ledger row/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('relabel, drop-foreign and drop-foreign-hash are refused without --drizzle-folder', () => {
  const result = spawnSync(
    process.execPath,
    [migratorPath, '--db', 'bcb_webapp_dev', '--migrator', 'bcb_dev_migrator', '--relabel', 'a:b'],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--relabel, --drop-foreign and --drop-foreign-hash are supported only with --drizzle-folder/u);

  const hashResult = spawnSync(
    process.execPath,
    [migratorPath, '--db', 'bcb_webapp_dev', '--migrator', 'bcb_dev_migrator', '--drop-foreign-hash', 'c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124'],
    { encoding: 'utf8' },
  );
  assert.notEqual(hashResult.status, 0);
  assert.match(hashResult.stderr, /--relabel, --drop-foreign and --drop-foreign-hash are supported only with --drizzle-folder/u);
});

test('unapply is refused without --drizzle-folder', () => {
  const result = spawnSync(
    process.execPath,
    [migratorPath, '--db', 'bcb_webapp_dev', '--migrator', 'bcb_dev_migrator', '--unapply', 'a'],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--unapply is supported only with --drizzle-folder/u);
});

// --unapply: the reverse of the INSERT the wrapper writes when a migration is applied. The row
// belongs to a file this folder still carries under the same tag and the same content — the ordinary
// case of undoing a migration whose DDL was already dealt with some other way (or removing a probe
// row), with the ledger DELETE as the only statement in the transaction.
test('unapply deletes a ledger row that a file in this folder still claims by tag and hash', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: '0001_late_arrival', matchesTag: '0001_late_arrival', createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, ['--unapply', '0001_late_arrival']);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /DELETE FROM drizzle\.__drizzle_migrations WHERE tag = '0001_late_arrival';/u);
  assert.doesNotMatch(transaction, /app\.door_0001_late_arrival\(\) RETURNS/u, 'unapply must not re-run the file');
  assert.doesNotMatch(transaction, /INSERT INTO drizzle\.__drizzle_migrations \(hash, created_at, tag\)/u);
  assert.match(result.stdout, /pending=0 total=3/u);
  assert.match(result.stdout, /unapplied=1/u);
});

// The hash gate: a row recorded under this tag whose content no longer matches the file on disk is
// content drift, not a plain unapply — dropping it would erase the only record of what actually ran.
// This is the case the gate exists for; deleting the `file.hash !== row.hash` check below would let
// this test's transaction reach psql, so it is the proof the gate is real, not decorative.
test('unapply refuses when the file content has drifted from the ledger row', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0002_third'],
    foreignRow: { tag: '0001_late_arrival', hash: 'f'.repeat(64), createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, ['--unapply', '0001_late_arrival']);

  assert.notEqual(result.status, 0, 'content drift must not be silently unapplied');
  assert.match(result.stderr, /does not match the ledger row's hash/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('unapply refuses a tag the database never applied', () => {
  const runtime = createLedgerRuntime({ appliedTags: ['0000_first', '0002_third'] });

  const result = runLedgerMigrator(runtime, ['--unapply', '0001_late_arrival']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has not applied at all \(nothing to unapply\)/u);
  assert.equal(existsSync(runtime.capture), false);
});

// The row exists but no file in this folder claims its tag — that shape belongs to --drop-foreign,
// not --unapply, and the refusal must name the operation that does handle it.
test('unapply refuses a foreign ledger row and points to --drop-foreign', () => {
  const runtime = createLedgerRuntime({
    appliedTags: ['0000_first', '0001_late_arrival', '0002_third'],
    foreignRow: { tag: '0050_mislabelled_legacy_row', hash: 'b'.repeat(64), createdAt: 1800000000350 },
  });

  const result = runLedgerMigrator(runtime, ['--unapply', '0050_mislabelled_legacy_row']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is a foreign ledger row of .* use --drop-foreign 0050_mislabelled_legacy_row instead/u);
  assert.equal(existsSync(runtime.capture), false);
});
