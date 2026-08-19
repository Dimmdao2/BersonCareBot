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

// The watermark migrator applies `when > max(created_at)`.  These three cases pin the gate that
// makes a journal entry stranded below that watermark audible instead of "pending=0 already
// current" — the failure that left `app.read_public_clinic_card(text)` absent from TEST on 19.08
// while the ledger reported every migration applied.
function createWatermarkRuntime(ledgerWhens) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migrate-local-watermark-'));
  const bin = join(root, 'bin');
  const migrations = join(root, 'migrations');
  const capture = join(root, 'transaction.sql');
  mkdirSync(bin);
  mkdirSync(join(migrations, 'meta'), { recursive: true });
  const entries = [
    { idx: 0, version: '7', when: 1800000000100, tag: '0000_first' },
    { idx: 1, version: '7', when: 1800000000200, tag: '0001_stranded' },
    { idx: 2, version: '7', when: 1800000000300, tag: '0002_third' },
  ];
  writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify({ entries }));
  for (const entry of entries) {
    writeFileSync(
      join(migrations, `${entry.tag}.sql`),
      ['-- BCB-MIGRATION-OWNER: app_probe_owner', `SELECT '${entry.tag}';`, ''].join('\n'),
    );
  }
  const ledger = ledgerWhens
    .map((when, index) => `${String(index + 1).repeat(64).slice(0, 64).replaceAll(/[^0-9a-f]/gu, 'a')}\t${when}`)
    .join('\n');
  writeFileSync(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -eu
for arg in "$@"; do
  if [[ "$arg" == '-c' ]]; then printf '%b\\n' ${JSON.stringify(ledger)}; exit 0; fi
done
cat > '${capture}'
`,
  );
  chmodSync(join(bin, 'psql'), 0o755);
  return { bin, capture, migrations, root };
}

function runWatermarkMigrator(runtime, extraArgs = []) {
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

test('a journal entry below the ledger watermark and absent from it stops the run loudly', () => {
  const runtime = createWatermarkRuntime([1800000000100, 1800000000300]);

  const result = runWatermarkMigrator(runtime);

  assert.notEqual(result.status, 0, 'silently skipped migration must not report success');
  assert.match(result.stderr, /describe different states/u);
  assert.match(result.stderr, /when=1800000000200 tag=0001_stranded/u);
  assert.match(result.stderr, /--apply-out-of-order 0001_stranded/u);
  assert.doesNotMatch(result.stdout, /already current/u);
  assert.equal(existsSync(runtime.capture), false, 'no transaction may reach psql behind the gate');
});

test('the named out-of-order opt-in applies exactly the stranded entry through the same wrapper', () => {
  const runtime = createWatermarkRuntime([1800000000100, 1800000000300]);

  const result = runWatermarkMigrator(runtime, ['--apply-out-of-order', '0001_stranded']);

  assert.equal(result.status, 0, result.stderr);
  const transaction = readFileSync(runtime.capture, 'utf8');
  assert.match(transaction, /SELECT '0001_stranded';/u);
  assert.doesNotMatch(transaction, /SELECT '0002_third';/u);
  // Its true journal timestamp is what lands in the ledger, so the hole closes instead of moving.
  assert.match(
    transaction,
    /INSERT INTO drizzle\.__drizzle_migrations \(hash, created_at\) VALUES \('[0-9a-f]{64}', 1800000000200\);/u,
  );
  assert.match(transaction, /\nCOMMIT;\s*$/u);
  assert.match(result.stdout, /out-of-order=1/u);
});

test('a second stranded entry still stops a run that opted in for only the first', () => {
  const runtime = createWatermarkRuntime([1800000000300]);

  const result = runWatermarkMigrator(runtime, ['--apply-out-of-order', '0001_stranded']);

  assert.notEqual(result.status, 0, 'an unnamed hole must not ride along on a stale flag');
  assert.match(result.stderr, /when=1800000000100 tag=0000_first/u);
  assert.doesNotMatch(result.stderr, /tag=0001_stranded/u);
  assert.equal(existsSync(runtime.capture), false);
});

test('an aligned journal and ledger still report themselves current', () => {
  const runtime = createWatermarkRuntime([1800000000100, 1800000000200, 1800000000300]);

  const result = runWatermarkMigrator(runtime);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already current for "bersoncarebot_test": pending=0 total=3/u);
});
