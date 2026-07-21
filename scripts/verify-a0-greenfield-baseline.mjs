#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BASELINE_OWNER_ROLE,
  packageDir,
  repoRoot,
  schemaPath,
  seedPath,
  sqlLiteral,
  validatePackage,
} from './a0-greenfield-baseline-lib.mjs';

const operatorRole = 'bcb_a0_operator';
const databaseName = 'bcb_saas_a0_scratch_verify';
const postgresPort = '57438';
const scrubbedEnvironmentKeys = Object.freeze([
  'DATABASE_URL',
  'DATABASE_URL_STAFF',
  'DATABASE_URL_NONSTAFF',
  'INTEGRATOR_DATABASE_URL',
  'PGDATABASE',
  'PGHOST',
  'PGHOSTADDR',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGUSER',
]);

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const key of scrubbedEnvironmentKeys) delete environment[key];
  return { ...environment, ...overrides };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? cleanEnvironment(),
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    const stdout = String(result.stdout ?? '').trim();
    throw new Error(
      `${options.label ?? command}_failed` +
        `${stderr ? `\nstderr:\n${stderr.slice(-12000)}` : ''}` +
        `${stdout ? `\nstdout:\n${stdout.slice(-12000)}` : ''}`,
    );
  }
  return String(result.stdout ?? '');
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`unsafe_identifier:${value}`);
  return `"${value}"`;
}

function buildLedgerSql(manifest) {
  const integratorValues = manifest.ledgers.integrator.entries
    .map((entry) => `(${sqlLiteral(entry.version)}, '2000-01-01T00:00:00Z'::timestamptz)`)
    .join(',\n');
  const drizzleValues = manifest.ledgers.drizzle.entries
    .map((entry) => `(${sqlLiteral(entry.sha256)}, ${Number(entry.when)})`)
    .join(',\n');
  return [
    'BEGIN;',
    `INSERT INTO integrator.schema_migrations (version, applied_at) VALUES\n${integratorValues};`,
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES\n${drizzleValues};`,
    'COMMIT;',
    '',
  ].join('\n');
}

function exactSet(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((value) => !actualSet.has(value));
  const extra = actual.filter((value) => !expectedSet.has(value));
  if (missing.length > 0 || extra.length > 0 || actual.length !== actualSet.size) {
    throw new Error(
      `${label}_ledger_drift:missing=${missing.length}:extra=${extra.length}:duplicates=${actual.length - actualSet.size}`,
    );
  }
}

const packageResult = validatePackage();
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_saas_a0_verify_'));
const dataDir = path.join(scratchRoot, 'data');
const socketDir = path.join(scratchRoot, 'socket');
fs.mkdirSync(socketDir, { mode: 0o700 });
let pgCtl = null;
let started = false;
let cleaning = false;

function cleanup(exitCode = null) {
  if (cleaning) return;
  cleaning = true;
  if (started && pgCtl) {
    spawnSync(pgCtl, ['-D', dataDir, '-m', 'immediate', 'stop'], {
      cwd: repoRoot,
      env: cleanEnvironment(),
      stdio: 'ignore',
    });
  }
  fs.rmSync(scratchRoot, { recursive: true, force: true });
  if (exitCode !== null) process.exit(exitCode);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () =>
    cleanup(128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 1)),
  );
}

try {
  const bindir = run('pg_config', ['--bindir'], { label: 'pg_config' }).trim();
  const initdb = path.join(bindir, 'initdb');
  pgCtl = path.join(bindir, 'pg_ctl');
  const psql = path.join(bindir, 'psql');
  for (const binary of [initdb, pgCtl, psql]) {
    if (!fs.existsSync(binary)) throw new Error(`postgres_binary_missing:${binary}`);
  }

  run(initdb, ['-D', dataDir, `--username=${operatorRole}`, '--auth=trust', '--no-locale'], {
    label: 'initdb',
  });
  run(
    pgCtl,
    [
      '-D',
      dataDir,
      '-o',
      `-F -k ${socketDir} -p ${postgresPort} -c listen_addresses=''`,
      '-w',
      'start',
      '-l',
      path.join(scratchRoot, 'postgres.log'),
    ],
    { label: 'pg_ctl_start' },
  );
  started = true;

  const psqlBase = ['-h', socketDir, '-p', postgresPort, '-X', '-v', 'ON_ERROR_STOP=1'];
  const psqlAs = (user, database, sql, label) =>
    run(psql, [...psqlBase, '-U', user, '-d', database, '-Atqc', sql], { label });
  const psqlFileAs = (user, database, filePath, label) =>
    run(psql, [...psqlBase, '-U', user, '-d', database, '-f', filePath], { label });

  psqlAs(
    operatorRole,
    'postgres',
    [
      `CREATE ROLE ${quoteIdent(BASELINE_OWNER_ROLE)} LOGIN NOINHERIT NOBYPASSRLS;`,
      'CREATE ROLE "app_staff" NOLOGIN NOINHERIT NOBYPASSRLS;',
      'CREATE ROLE "app_patient" NOLOGIN NOINHERIT NOBYPASSRLS;',
    ].join('\n'),
    'create_disposable_roles',
  );
  psqlAs(
    operatorRole,
    'postgres',
    `CREATE DATABASE ${quoteIdent(databaseName)} OWNER ${quoteIdent(BASELINE_OWNER_ROLE)};`,
    'create_disposable_database',
  );
  psqlFileAs(BASELINE_OWNER_ROLE, databaseName, schemaPath, 'restore_schema_baseline');

  const beforeSeedTableCount = Number(
    psqlAs(
      operatorRole,
      databaseName,
      `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','drizzle','integrator','public') AND c.relkind IN ('r','p');`,
      'pre_seed_table_census',
    ).trim(),
  );
  if (beforeSeedTableCount !== packageResult.manifest.baseline.census.tables) {
    throw new Error(`restored_table_census_drift:${beforeSeedTableCount}`);
  }
  psqlAs(
    operatorRole,
    databaseName,
    `DO $a0$
DECLARE item record; row_count bigint;
BEGIN
  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('app','drizzle','integrator','public') AND c.relkind IN ('r','p')
    ORDER BY 1,2
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', item.schema_name, item.table_name) INTO row_count;
    IF row_count <> 0 THEN RAISE EXCEPTION 'a0_pre_seed_rows_forbidden:%.%:%', item.schema_name, item.table_name, row_count; END IF;
  END LOOP;
END $a0$;`,
    'pre_seed_zero_rows',
  );

  psqlAs(
    operatorRole,
    'postgres',
    `ALTER ROLE ${quoteIdent(BASELINE_OWNER_ROLE)} BYPASSRLS;`,
    'enable_migration_window',
  );
  const ledgerSqlPath = path.join(scratchRoot, 'ledger-seed.sql');
  fs.writeFileSync(ledgerSqlPath, buildLedgerSql(packageResult.manifest), { mode: 0o600 });
  psqlFileAs(BASELINE_OWNER_ROLE, databaseName, ledgerSqlPath, 'seed_migration_ledgers');
  psqlFileAs(BASELINE_OWNER_ROLE, databaseName, seedPath, 'apply_synthetic_seed');

  const databaseUrl = `postgresql://${BASELINE_OWNER_ROLE}@localhost:${postgresPort}/${databaseName}?host=${encodeURIComponent(socketDir)}`;
  const migrateEnv = cleanEnvironment({
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    CI: 'true',
    BOOKING_URL: 'http://127.0.0.1:4200',
    API_ENV_FILE: path.join(scratchRoot, 'missing-api.env'),
    WEBAPP_ENV_FILE: path.join(scratchRoot, 'missing-webapp.env'),
  });
  run('bash', ['scripts/migrate-all.sh'], { env: migrateEnv, label: 'current_pending_migrations' });

  const actualIntegrator = psqlAs(
    operatorRole,
    databaseName,
    'SELECT version FROM integrator.schema_migrations ORDER BY version',
    'integrator_ledger_postcheck',
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  exactSet(
    actualIntegrator,
    packageResult.currentIntegrator.map((entry) => entry.version),
    'integrator',
  );
  const actualDrizzle = psqlAs(
    operatorRole,
    databaseName,
    'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
    'drizzle_ledger_postcheck',
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  exactSet(
    actualDrizzle,
    packageResult.currentDrizzle.map((entry) => entry.sha256),
    'drizzle',
  );

  const seedProof = psqlAs(
    operatorRole,
    databaseName,
    `SELECT (
      (SELECT count(*) FROM public.be_organizations WHERE id='a0000000-0000-4000-8000-000000000001')=1
      AND (SELECT count(*) FROM public.platform_users WHERE id='a0000000-0000-4000-8000-000000000002' AND email_normalized='owner@baseline.test' AND phone_normalized IS NULL)=1
      AND (SELECT count(*) FROM public.be_specialists WHERE id='518ea988-9b5e-4ad8-8194-a2d98f43bd7b' AND organization_id='a0000000-0000-4000-8000-000000000001' AND is_active)=1
      AND (SELECT count(*) FROM public.be_organization_members WHERE organization_id='a0000000-0000-4000-8000-000000000001' AND platform_user_id='a0000000-0000-4000-8000-000000000002' AND role='owner' AND status='active')=1
      AND (SELECT count(*) FROM public.be_appointments WHERE id='a0000000-0000-4000-8000-000000000005' AND specialist_id='518ea988-9b5e-4ad8-8194-a2d98f43bd7b')=1
      AND (SELECT count(*) FROM public.saas_org_entitlement_overrides WHERE organization_id='a0000000-0000-4000-8000-000000000001' AND mechanic='courses' AND enabled)=1
    )::int;`,
    'synthetic_seed_postcheck',
  ).trim();
  if (seedProof !== '1') throw new Error('synthetic_seed_postcheck_failed');

  const nonEmptyTables = psqlAs(
    operatorRole,
    databaseName,
    `CREATE TEMP TABLE a0_nonempty(schema_name text, table_name text, row_count bigint);
DO $a0$
DECLARE item record; item_count bigint;
BEGIN
  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('app','drizzle','integrator','public') AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', item.schema_name, item.table_name) INTO item_count;
    IF item_count > 0 THEN INSERT INTO a0_nonempty VALUES (item.schema_name, item.table_name, item_count); END IF;
  END LOOP;
END $a0$;
SELECT schema_name || '.' || table_name FROM a0_nonempty ORDER BY 1;`,
    'nonempty_table_census',
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const allowedNonEmpty = [
    'drizzle.__drizzle_migrations',
    'integrator.schema_migrations',
    'public.be_appointments',
    'public.be_organization_members',
    'public.be_organizations',
    'public.be_specialists',
    'public.platform_users',
    'public.reference_catalog_baselines',
    'public.reference_catalog_snapshot_receipts',
    'public.saas_org_entitlement_overrides',
  ].sort();
  if (JSON.stringify(nonEmptyTables) !== JSON.stringify(allowedNonEmpty)) {
    throw new Error(`unexpected_nonempty_tables:${nonEmptyTables.join(',')}`);
  }

  psqlAs(
    operatorRole,
    'postgres',
    `ALTER ROLE ${quoteIdent(BASELINE_OWNER_ROLE)} NOBYPASSRLS;`,
    'close_migration_window',
  );
  const bypassState = psqlAs(
    operatorRole,
    'postgres',
    `SELECT rolbypassrls::int FROM pg_roles WHERE rolname=${sqlLiteral(BASELINE_OWNER_ROLE)}`,
    'migration_window_cleanup_postcheck',
  ).trim();
  if (bypassState !== '0') throw new Error('baseline_owner_bypass_cleanup_failed');

  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        transport: 'private-unix-socket-ephemeral-postgresql',
        sourceRowsImportedBeforeSeed: 0,
        restoredTables: beforeSeedTableCount,
        syntheticNonEmptyTables: nonEmptyTables.length - 2,
        ledgers: {
          integrator: actualIntegrator.length,
          drizzle: actualDrizzle.length,
        },
        pendingApplied: {
          integrator: packageResult.pending.integrator.length,
          drizzle: packageResult.pending.drizzle.length,
        },
        migrationWindowClosed: true,
        package: path.relative(repoRoot, packageDir),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `verify-a0-greenfield-baseline: ${error instanceof Error ? error.message : 'unknown_error'}`,
  );
  cleanup();
  process.exit(1);
} finally {
  cleanup();
}
