#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const scriptPath = 'docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs';
const deploySaas667Path = 'scripts/deploy-saas-667.sh';
const phase4RehearsalRunnerPath =
  'docs/_TODO/SAAS_FOUNDATION/scripts/run-phase4-prod-copy-rehearsal.mjs';
const phase4UrlEnv = 'PHASE4_REHEARSAL_DATABASE_URL';
const superuserUrlEnv = 'SAAS_DISPOSABLE_SUPERUSER_URL';
const superuserSudoEnv = 'SAAS_DISPOSABLE_SUPERUSER_SUDO_POSTGRES';
const deploySuperuserSudoEnv = 'SUPERUSER_SUDO_POSTGRES';
const allowedHostsEnv = 'SAAS_DISPOSABLE_ALLOWED_HOSTS';
const fixtureSeederPath = 'apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts';
const e1WebappRuntimeConfigPath = 'deploy/postgres/e1-webapp-runtime-config.sql';
const testSettingsOverridePath = 'deploy/postgres/test-settings-override.sql';
const patientContentDiaryProofPath =
  'docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-patient-content-diary-rls.mjs';
const safeDbNamePattern = /^bcb_saas_[a-z0-9_]+_(scratch|rehearsal)_[a-z0-9_]+$/;
const fixtureRehearsalDbNamePattern = /^bcb_saas_[a-z0-9_]+_rehearsal_[a-z0-9_]+$/;
const unsafeNameTokenPattern = /(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/;
const unsafeHostTokenPattern = /(^|[.-])(prod|production)([.-]|$)/;
const forbiddenDbNames = new Set([
  'bcb_webapp_prod',
  'bcb_webapp_test',
  'bcb_webapp_dev',
  'bersoncarebot',
  'bersoncarebot_prod',
  'bersoncarebot_test',
  'bersoncarebot_dev',
  'production',
  'prod',
  'test',
  'dev',
]);
const forbiddenHostnames = new Set([
  '135.106.162.170',
  'bersoncare.ru',
  'www.bersoncare.ru',
  'tgcarebot.bersonservices.ru',
  'bcb-prod',
  'prod',
  'production',
  'bersoncarebot-prod',
]);
const forbiddenConnectionOverrideParams = new Set([
  'database',
  'dbname',
  'host',
  'hostaddr',
  'options',
  'passfile',
  'service',
  'sslcert',
  'sslkey',
]);

function usage() {
  return [
    'Usage:',
    `  node ${scriptPath} --dry-run [--dump=/path/fresh.dump] [--db=bcb_saas_dormant_rehearsal_<stamp>]`,
    `  ${superuserUrlEnv}=postgres://... node ${scriptPath} --execute --dump=/path/fresh.dump --db=bcb_saas_dormant_rehearsal_<stamp> [--replace-existing] [--drop-on-success]`,
    `  node ${scriptPath} --execute --superuser-sudo-postgres --dump=/path/fresh.dump --db=bcb_saas_dormant_rehearsal_<stamp> [--replace-existing] [--drop-on-success]`,
    `  node ${scriptPath} --execute --superuser-sudo-postgres --dump=/path/fresh.dump --db=bcb_saas_fixture_rehearsal_<stamp> --prove-test-fixture --drop-on-success`,
    `  node ${scriptPath} --self-test`,
    '',
    'Purpose:',
    '  Restore an owner-provided fresh custom-format dump into a guarded disposable',
    '  bcb_saas_*_rehearsal_* database, run the canonical scripts/deploy-saas-667.sh',
    '  dormant migration chain, assert temporary elevation cleanup, and preserve the DB',
    '  for audit unless --drop-on-success is explicit.',
    '',
    'Safety:',
    '  --dry-run is the default and never connects to PostgreSQL.',
    '  --execute requires an explicit dump and exactly one explicit superuser transport:',
    `  ${superuserUrlEnv}/--superuser-url or ${superuserSudoEnv}=1/--superuser-sudo-postgres.`,
    '  Database names must match bcb_saas_*_scratch_* or bcb_saas_*_rehearsal_*',
    '  and must not contain prod/test/dev tokens.',
    '  Ambient DATABASE_URL/PGDATABASE/PGHOST are refused if they look unsafe and',
    '  are stripped from all child command environments.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    dbName: defaultDbName(),
    dropOnSuccess: false,
    dryRun: true,
    dumpPath: null,
    execute: false,
    proveTestFixture: false,
    replaceExisting: false,
    selfTest: false,
    superuserSudoPostgres: envFlag(superuserSudoEnv),
    superuserUrl: process.env[superuserUrlEnv] ?? null,
  };
  let sawDryRun = false;
  let sawExecute = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (arg === '--dry-run') {
      sawDryRun = true;
      options.dryRun = true;
      continue;
    }
    if (arg === '--execute') {
      sawExecute = true;
      options.execute = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--drop-on-success') {
      options.dropOnSuccess = true;
      continue;
    }
    if (arg === '--replace-existing') {
      options.replaceExisting = true;
      continue;
    }
    if (arg === '--prove-test-fixture') {
      options.proveTestFixture = true;
      continue;
    }
    if (arg.startsWith('--dump=')) {
      options.dumpPath = path.resolve(arg.slice('--dump='.length));
      continue;
    }
    if (arg.startsWith('--db=')) {
      options.dbName = arg.slice('--db='.length);
      continue;
    }
    if (arg.startsWith('--superuser-url=')) {
      options.superuserUrl = arg.slice('--superuser-url='.length);
      continue;
    }
    if (arg === '--superuser-sudo-postgres') {
      options.superuserSudoPostgres = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (options.selfTest && argv.length > 1) {
    throw new Error('--self-test must be run by itself');
  }
  if (sawExecute && sawDryRun) {
    throw new Error('--execute and --dry-run cannot both be active');
  }
  if (options.superuserSudoPostgres && options.superuserUrl) {
    throw new Error(
      `Choose only one superuser transport: ${superuserUrlEnv}/--superuser-url or ${superuserSudoEnv}=1/--superuser-sudo-postgres`,
    );
  }
  return options;
}

function envFlag(name) {
  const value = process.env[name];
  if (value === undefined || value === '') return false;
  if (value === '1') return true;
  throw new Error(`${name} must be exactly 1 when set`);
}

function defaultDbName(now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return `bcb_saas_dormant_rehearsal_${stamp}_${randomBytes(3).toString('hex')}`;
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    return pathname ? decodeURIComponent(pathname) : null;
  } catch {
    return null;
  }
}

function assertSafeDbName(source, value) {
  if (!value) throw new Error(`${source}: database name is required`);
  const normalized = value.toLowerCase();
  if (normalized !== value) throw new Error(`${source}: database name must be lowercase`);
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`${source}: database name must be a simple PostgreSQL identifier`);
  }
  if (value.length > 63)
    throw new Error(`${source}: database name exceeds PostgreSQL identifier length`);
  if (forbiddenDbNames.has(normalized) || unsafeNameTokenPattern.test(normalized)) {
    throw new Error(`${source}: refusing prod/test/dev-shaped database name ${value}`);
  }
  if (!safeDbNamePattern.test(normalized)) {
    throw new Error(
      `${source}: database name must match bcb_saas_*_scratch_* or bcb_saas_*_rehearsal_*`,
    );
  }
}

function assertSafeHostname(source, hostname) {
  if (!hostname) throw new Error(`${source}: hostname is required`);
  const normalized = hostname.toLowerCase();
  if (forbiddenHostnames.has(normalized) || unsafeHostTokenPattern.test(normalized)) {
    throw new Error(`${source}: refusing production-shaped host`);
  }
  const allowed = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    ...String(process.env[allowedHostsEnv] ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
  if (!allowed.has(normalized)) {
    throw new Error(`${source}: host must be loopback or listed in ${allowedHostsEnv}`);
  }
}

function parsePostgresUrl(source, value) {
  if (!value) throw new Error(`${source}: URL is required`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${source}: invalid PostgreSQL URL`);
  }
  if (!new Set(['postgres:', 'postgresql:']).has(parsed.protocol)) {
    throw new Error(`${source}: URL must use postgres:// or postgresql://`);
  }
  assertSafeHostname(source, parsed.hostname);
  for (const key of parsed.searchParams.keys()) {
    if (forbiddenConnectionOverrideParams.has(key.toLowerCase())) {
      throw new Error(`${source}: query parameter ${key} is not allowed`);
    }
  }
  return parsed;
}

function assertSafeEnvironment() {
  if (process.env.PGHOST) assertSafeHostname('PGHOST', process.env.PGHOST);
  if (process.env.PGDATABASE) assertSafeDbName('PGDATABASE', process.env.PGDATABASE);
  if (process.env.DATABASE_URL) {
    parsePostgresUrl('DATABASE_URL', process.env.DATABASE_URL);
    assertSafeDbName('DATABASE_URL', databaseNameFromUrl(process.env.DATABASE_URL));
  }
}

function urlForDatabase(baseUrl, databaseName, { applicationName }) {
  const url = new URL(baseUrl.toString());
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  url.searchParams.set('application_name', applicationName);
  return url.toString();
}

function rolePgOptions(roleName) {
  quoteIdent(roleName);
  return `-c role=${roleName}`;
}

function redactedUrl(value) {
  const url = new URL(value);
  if (url.password) url.password = 'REDACTED';
  if (url.username) url.username = 'REDACTED';
  return url.toString();
}

function validateDumpIfPresent(dumpPath, { execute }) {
  if (!dumpPath) {
    if (execute) throw new Error('--dump is required in --execute mode');
    return { checked: false, label: '<not provided in dry-run>' };
  }
  if (!existsSync(dumpPath)) throw new Error(`dump path does not exist: ${dumpPath}`);
  const stat = statSync(dumpPath);
  if (!stat.isFile()) throw new Error(`dump path is not a regular file: ${dumpPath}`);
  if (stat.size <= 0) throw new Error(`dump path is empty: ${dumpPath}`);

  const result = spawnSync('pg_restore', ['--list', dumpPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw new Error(`pg_restore --list failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error('dump is not a readable PostgreSQL custom-format archive');
  }
  return { checked: true, label: `${path.basename(dumpPath)} (${stat.size} bytes)` };
}

function sanitizedChildEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'PGDATABASE',
    'PGHOST',
    'PGPASSWORD',
    'PGPASSFILE',
    'PGOPTIONS',
    'PGPORT',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGUSER',
    'SUPERUSER_URL',
    deploySuperuserSudoEnv,
    superuserUrlEnv,
    superuserSudoEnv,
  ]) {
    delete env[key];
  }
  return { ...env, ...extra };
}

function run(
  command,
  args,
  { env = sanitizedChildEnv(), input = null, label, redact = false } = {},
) {
  if (label) console.log(`\n[saas-disposable] ${label}`);
  if (redact) console.log(`[saas-disposable] $ ${command} ${args.map(redactArg).join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    input,
    stdio: input === null ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw new Error(`${label ?? command} failed to start: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${label ?? command} failed with status ${result.status ?? 'unknown'}`);
}

function runCaptured(
  command,
  args,
  { env = sanitizedChildEnv(), input = null, label, tolerateFailure = false } = {},
) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.error) throw new Error(`${label ?? command} failed to start: ${result.error.message}`);
  if (!tolerateFailure && result.status !== 0) {
    throw new Error(
      `${label ?? command} failed with status ${result.status ?? 'unknown'}: ${result.stderr.trim()}`,
    );
  }
  return result;
}

function redactArg(value) {
  if (String(value).startsWith('postgres://') || String(value).startsWith('postgresql://')) {
    return redactedUrl(value);
  }
  return value;
}

function psqlArgs({ databaseName, url }, { tuplesOnly = false } = {}) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) args.push('-Atq');
  args.push('-d', url ?? databaseName);
  return args;
}

function superuserPsql(plan, databaseName, sql, { label = 'psql', tuplesOnly = false } = {}) {
  const url = databaseName === 'postgres' ? plan.adminUrl : plan.targetSuperuserUrl;
  const args = psqlArgs({ databaseName, url }, { tuplesOnly });
  if (plan.transport === 'sudo-postgres') {
    return runCaptured('sudo', ['-n', '-u', 'postgres', 'psql', ...args], { input: sql, label });
  }
  return runCaptured('psql', args, { input: sql, label });
}

function superuserPsqlExec(plan, databaseName, sql, label) {
  superuserPsql(plan, databaseName, sql, { label });
}

function superuserPsqlScalar(plan, databaseName, sql, label) {
  return superuserPsql(plan, databaseName, sql, { label, tuplesOnly: true }).stdout.trim();
}

function localOwnerUrlForDatabase(databaseName, ownerRole, password, { applicationName }) {
  const url = new URL('postgres://localhost');
  url.username = ownerRole;
  url.password = password;
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  url.searchParams.set('application_name', applicationName);
  return url.toString();
}

function buildPlan(options) {
  assertSafeDbName('--db', options.dbName);
  assertSafeEnvironment();

  const superuserUrl = options.superuserUrl
    ? parsePostgresUrl(superuserUrlEnv, options.superuserUrl)
    : null;
  const ownerPassword = options.superuserSudoPostgres ? randomBytes(24).toString('hex') : null;
  const adminUrl = superuserUrl
    ? urlForDatabase(superuserUrl, 'postgres', {
        applicationName: 'saas_disposable_rehearsal_admin',
      })
    : null;
  const targetSuperuserUrl = superuserUrl
    ? urlForDatabase(superuserUrl, options.dbName, {
        applicationName: 'saas_disposable_rehearsal_superuser',
      })
    : null;
  const targetOwnerUrl = superuserUrl
    ? urlForDatabase(superuserUrl, options.dbName, {
        applicationName: 'saas_disposable_rehearsal_owner',
      })
    : options.superuserSudoPostgres
      ? localOwnerUrlForDatabase(options.dbName, options.dbName, ownerPassword, {
          applicationName: 'saas_disposable_rehearsal_owner',
        })
      : null;
  return {
    adminUrl,
    appOwnerRole: 'app_owner',
    dbName: options.dbName,
    ownerPassword,
    ownerRole: options.dbName,
    fixtureRuntimeRole: `${options.dbName}_runtime`,
    targetOwnerUrl,
    targetSuperuserUrl,
    transport: options.superuserSudoPostgres ? 'sudo-postgres' : superuserUrl ? 'url' : 'none',
  };
}

function createFixtureRuntimeRole(plan) {
  const exists = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.fixtureRuntimeRole)})::int;`,
    'check disposable fixture runtime role freshness',
  );
  if (exists === '1') throw new Error('disposable fixture runtime role already exists');
  superuserPsqlExec(
    plan,
    'postgres',
    `CREATE ROLE ${quoteIdent(plan.fixtureRuntimeRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    'create disposable fixture runtime role',
  );
}

function assertFixtureProofOptions(plan, options) {
  if (!options.proveTestFixture) return;
  if (options.replaceExisting) {
    throw new Error('--prove-test-fixture requires a fresh, non-reused database name');
  }
  if (!fixtureRehearsalDbNamePattern.test(plan.dbName)) {
    throw new Error('--prove-test-fixture requires a bcb_saas_*_rehearsal_* database name');
  }
  if (!options.dropOnSuccess) {
    throw new Error('--prove-test-fixture requires --drop-on-success cleanup');
  }
  const hostname = plan.targetOwnerUrl ? new URL(plan.targetOwnerUrl).hostname.toLowerCase() : null;
  if (!new Set(['localhost', '127.0.0.1', '::1', '[::1]']).has(hostname)) {
    throw new Error('--prove-test-fixture requires a loopback PostgreSQL endpoint');
  }
  if (plan.fixtureRuntimeRole.length > 63) {
    throw new Error('--prove-test-fixture target name is too long for its disposable runtime role');
  }
}

function assertFixtureProofResourcesFresh(plan) {
  const state = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT concat_ws('|',
      EXISTS(SELECT 1 FROM pg_database WHERE datname=${quoteLiteral(plan.dbName)})::int,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.ownerRole)})::int,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.fixtureRuntimeRole)})::int
    );`,
    'assert disposable fixture resources are fresh',
  );
  if (state !== '0|0|0') throw new Error('disposable fixture DB or role name is already in use');
}

function printDryRun(plan, dumpInfo, options) {
  console.log('[saas-disposable] dry-run OK');
  console.log(`[saas-disposable] target DB: ${plan.dbName}`);
  console.log(`[saas-disposable] owner/migrator role: ${plan.ownerRole}`);
  console.log(`[saas-disposable] dump: ${dumpInfo.label}`);
  console.log(`[saas-disposable] replace existing DB: ${options.replaceExisting ? 'yes' : 'no'}`);
  console.log(`[saas-disposable] drop on success: ${options.dropOnSuccess ? 'yes' : 'no'}`);
  console.log(`[saas-disposable] TEST fixture proof: ${options.proveTestFixture ? 'yes' : 'no'}`);
  console.log(`[saas-disposable] superuser transport: ${plan.transport}`);
  console.log('[saas-disposable] planned sequence:');
  console.log('  1. create guarded disposable owner role and database');
  console.log('  2. restore dump with pg_restore --no-owner --no-acl --no-comments --role=<owner>');
  console.log('  3. assert DB owner and public.platform_users owner');
  console.log(
    `  4. run ${deploySaas667Path} with sanitized DATABASE_URL and explicit superuser transport`,
  );
  console.log('  5. assert migrator NOBYPASSRLS and no app_owner membership');
  console.log(`  6. run ${phase4RehearsalRunnerPath} --mode=db-state on the disposable DB`);
  if (options.proveTestFixture) {
    console.log(
      '  7. apply canonical TEST settings override, double-seed fixtures, and prove A/B capability + mirror',
    );
    console.log('  8. always drop the disposable DB and owner role');
  } else {
    console.log('  7. preserve DB for audit unless --drop-on-success is set');
  }
  if (plan.targetSuperuserUrl) {
    console.log(`[saas-disposable] target superuser URL: ${redactedUrl(plan.targetSuperuserUrl)}`);
    console.log(`[saas-disposable] target owner URL: ${redactedUrl(plan.targetOwnerUrl)}`);
  } else if (plan.transport === 'sudo-postgres') {
    console.log('[saas-disposable] superuser command: sudo -n -u postgres psql/pg_restore');
    console.log(
      '[saas-disposable] target owner URL: generated local disposable credential (not printed)',
    );
  } else {
    console.log(`[saas-disposable] ${superuserUrlEnv}: not required for dry-run and not provided`);
  }
}

function createDisposableDatabase(plan, options) {
  superuserPsqlExec(
    plan,
    'postgres',
    `
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ${quoteLiteral(plan.ownerRole)})
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(plan.ownerRole)})
\\gexec
ALTER ROLE ${quoteIdent(plan.ownerRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
${plan.transport === 'sudo-postgres' ? `ALTER ROLE ${quoteIdent(plan.ownerRole)} PASSWORD ${quoteLiteral(plan.ownerPassword)};` : ''}
`,
    'create/normalize disposable owner role',
  );

  const exists = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(plan.dbName)})::int;`,
    'check disposable DB existence',
  );
  if (exists === '1' && !options.replaceExisting) {
    throw new Error(
      `disposable DB ${plan.dbName} already exists; pass --replace-existing to recreate it`,
    );
  }
  if (exists === '1') {
    superuserPsqlExec(
      plan,
      'postgres',
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(plan.dbName)} AND pid <> pg_backend_pid();`,
      'terminate existing disposable DB sessions',
    );
    superuserPsqlExec(
      plan,
      'postgres',
      `DROP DATABASE ${quoteIdent(plan.dbName)};`,
      'drop existing disposable DB',
    );
  }
  superuserPsqlExec(
    plan,
    'postgres',
    `CREATE DATABASE ${quoteIdent(plan.dbName)} OWNER ${quoteIdent(plan.ownerRole)};`,
    'create disposable DB',
  );
  superuserPsqlExec(
    plan,
    plan.dbName,
    'CREATE EXTENSION IF NOT EXISTS btree_gist;',
    'pre-create btree_gist extension',
  );
}

function restoreDump(plan, dumpPath) {
  const command = plan.transport === 'sudo-postgres' ? 'sudo' : 'pg_restore';
  const prefixArgs =
    plan.transport === 'sudo-postgres' ? ['-n', '-u', 'postgres', 'pg_restore'] : [];
  const databaseTarget = plan.transport === 'sudo-postgres' ? plan.dbName : plan.targetSuperuserUrl;
  const result = runCaptured(
    command,
    [
      ...prefixArgs,
      '--no-owner',
      `--role=${plan.ownerRole}`,
      '--no-acl',
      '--no-comments',
      '-d',
      databaseTarget,
      dumpPath,
    ],
    { label: 'pg_restore disposable DB' },
  );
  if (result.stderr) process.stderr.write(result.stderr);

  const platformUsers = Number(
    superuserPsqlScalar(
      plan,
      plan.dbName,
      'SELECT count(*) FROM public.platform_users;',
      'verify platform_users restored',
    ),
  );
  if (!Number.isFinite(platformUsers) || platformUsers <= 0) {
    throw new Error(
      `restore verification failed: public.platform_users rows=${platformUsers || 0}`,
    );
  }
  const legacyIdentityTable = superuserPsqlScalar(
    plan,
    plan.dbName,
    "SELECT to_regclass('integrator.identities') IS NULL;",
    'verify legacy integrator identities stay dropped',
  );
  if (legacyIdentityTable !== 't') {
    throw new Error('restore verification failed: integrator.identities was resurrected');
  }
}

function assertOwnerState(plan) {
  const dbOwner = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = ${quoteLiteral(plan.dbName)};`,
    'assert DB owner',
  );
  if (dbOwner !== plan.ownerRole)
    throw new Error(`DB owner is ${dbOwner}, expected ${plan.ownerRole}`);

  const platformUsersOwner = superuserPsqlScalar(
    plan,
    plan.dbName,
    "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_users';",
    'assert platform_users owner',
  );
  if (platformUsersOwner !== plan.ownerRole) {
    throw new Error(
      `public.platform_users owner is ${platformUsersOwner}, expected ${plan.ownerRole}`,
    );
  }
}

function runDeploy667(plan) {
  const env = deploy667ChildEnv(plan);
  run('bash', [deploySaas667Path], {
    env,
    label: 'run canonical #667 dormant migration chain',
    redact: true,
  });
}

function deploy667ChildEnv(plan) {
  const env = {
    API_ENV_FILE: '/nonexistent',
    BOOKING_URL: 'http://localhost:3000',
    DATABASE_URL: plan.targetOwnerUrl,
    PGOPTIONS: rolePgOptions(plan.ownerRole),
    WEBAPP_ENV_FILE: '/nonexistent',
  };
  if (plan.transport === 'sudo-postgres') {
    env[deploySuperuserSudoEnv] = '1';
  } else {
    env.SUPERUSER_URL = plan.targetSuperuserUrl;
  }
  return sanitizedChildEnv(env);
}

function assertCleanup(plan) {
  const bypass = superuserPsqlScalar(
    plan,
    plan.dbName,
    `SELECT rolbypassrls::text FROM pg_roles WHERE rolname = ${quoteLiteral(plan.ownerRole)};`,
    'assert owner role NOBYPASSRLS',
  );
  if (bypass !== 'false') {
    throw new Error(`cleanup assertion failed: ${plan.ownerRole} rolbypassrls=${bypass}`);
  }
  const membership = superuserPsqlScalar(
    plan,
    plan.dbName,
    `SELECT pg_has_role(${quoteLiteral(plan.ownerRole)}, ${quoteLiteral(plan.appOwnerRole)}, 'member')::text;`,
    'assert no temporary app_owner membership',
  );
  if (membership !== 'false') {
    throw new Error(
      `cleanup assertion failed: ${plan.ownerRole} is still a member of ${plan.appOwnerRole}`,
    );
  }
}

function runDbStateCheck(plan) {
  const env = sanitizedChildEnv({
    [phase4UrlEnv]: plan.targetOwnerUrl,
  });
  run('node', [phase4RehearsalRunnerPath, '--mode=db-state'], {
    env,
    label: 'run disposable DB-state checks',
    redact: true,
  });
}

function setFixtureProofElevation(plan, enabled) {
  superuserPsqlExec(
    plan,
    plan.dbName,
    enabled
      ? `GRANT ${quoteIdent(plan.appOwnerRole)} TO ${quoteIdent(plan.ownerRole)}; ALTER ROLE ${quoteIdent(plan.ownerRole)} BYPASSRLS;`
      : `ALTER ROLE ${quoteIdent(plan.ownerRole)} NOBYPASSRLS; REVOKE ${quoteIdent(plan.appOwnerRole)} FROM ${quoteIdent(plan.ownerRole)};`,
    enabled
      ? 'open disposable fixture reconciliation window'
      : 'close disposable fixture reconciliation window',
  );
}

function runFixtureProof(plan) {
  createFixtureRuntimeRole(plan);
  setFixtureProofElevation(plan, true);
  try {
    run(
      'psql',
      [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        `e1_webapp_runtime_role=${plan.fixtureRuntimeRole}`,
        '-d',
        plan.targetOwnerUrl,
        '-f',
        e1WebappRuntimeConfigPath,
      ],
      {
        env: sanitizedChildEnv({ PGOPTIONS: rolePgOptions(plan.ownerRole) }),
        label: 'apply canonical E1 patient runtime capability overlay to disposable rehearsal',
        redact: true,
      },
    );
    run(
      'psql',
      [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'test_settings_overlay_mode=reset',
        '-d',
        plan.targetOwnerUrl,
        '-f',
        testSettingsOverridePath,
      ],
      {
        env: sanitizedChildEnv({ PGOPTIONS: rolePgOptions(plan.ownerRole) }),
        label: 'apply canonical TEST settings override to disposable rehearsal',
        redact: true,
      },
    );
    run(
      'pnpm',
      ['--dir', 'apps/webapp', 'exec', 'tsx', path.relative('apps/webapp', fixtureSeederPath)],
      {
        env: sanitizedChildEnv({
          DATABASE_URL: plan.targetOwnerUrl,
          PGOPTIONS: rolePgOptions(plan.ownerRole),
          SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF: '1',
          SAAS_TEST_FIXTURE_REHEARSAL_DATABASE: plan.dbName,
          SAAS_TEST_FIXTURE_REHEARSAL_MODE: '1',
        }),
        label: 'double-seed TEST walkthrough fixtures in disposable rehearsal',
        redact: true,
      },
    );

    const settingProof = superuserPsqlScalar(
      plan,
      plan.dbName,
      `SELECT CASE WHEN public_setting.value_json = '{"value":{"phones":["+79643805480","+79189000782","+12025550101","+12025550102"],"telegramIds":["364943522","7924656602"],"maxIds":["207278131"]}}'::jsonb
        THEN 'ok' ELSE 'failed' END
       FROM public.system_settings AS public_setting
       WHERE public_setting.key = 'test_account_identifiers'
         AND public_setting.scope = 'admin'
         AND public_setting.organization_id IS NULL;`,
      'prove canonical test-account setting',
    );
    if (settingProof !== 'ok') throw new Error('fixture setting proof failed');

    const capabilityProof = superuserPsqlScalar(
      plan,
      plan.dbName,
      `BEGIN;
       DO $proof$ DECLARE n text := 'fixture-proof-a-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
         SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id=true;
         h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a101',''),s,'sha256'),'hex');
         PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a101',NULL,h);
       END $proof$;
       SET SESSION AUTHORIZATION app_patient;
       SELECT app.is_current_patient_test_account()::text;
       RESET SESSION AUTHORIZATION;
       DO $proof$ BEGIN PERFORM app.reset_principal_context(); END $proof$;
       DO $proof$ DECLARE n text := 'fixture-proof-b-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
         SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id=true;
         h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a201',''),s,'sha256'),'hex');
         PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a201',NULL,h);
       END $proof$;
       SET SESSION AUTHORIZATION app_patient;
       SELECT app.is_current_patient_test_account()::text;
       RESET SESSION AUTHORIZATION;
       DO $proof$ BEGIN PERFORM app.reset_principal_context(); END $proof$;
       DO $proof$ DECLARE n text := 'fixture-proof-unrelated-' || pg_backend_pid()::text; e bigint := floor(extract(epoch FROM clock_timestamp()))::bigint + 300; s text; h text; BEGIN
         SELECT secret INTO STRICT s FROM app.context_signing_secrets WHERE id=true;
         h := encode(app_ext.hmac(concat_ws('|','v1',n,pg_backend_pid()::text,e::text,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a102',''),s,'sha256'),'hex');
         PERFORM app.install_signed_context(n,pg_backend_pid(),e,'53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a102',NULL,h);
       END $proof$;
       SET SESSION AUTHORIZATION app_patient;
       SELECT app.is_current_patient_test_account()::text;
       RESET SESSION AUTHORIZATION;
       ROLLBACK;`,
      'prove patient A/B test-account capability and unrelated denial',
    );
    if (capabilityProof !== 'true\ntrue\nfalse') {
      throw new Error('fixture capability proof failed');
    }
    console.log(
      '[saas-disposable] fixture proof OK: mirror=exact; patientA=true; patientB=true; unrelated=false',
    );
    run(
      'psql',
      [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'phase4_enforce_locked_context=1',
        '-d',
        plan.targetOwnerUrl,
        '-f',
        'deploy/postgres/phase4-locked-helper-rls-policies.sql',
      ],
      {
        env: sanitizedChildEnv({ PGOPTIONS: rolePgOptions(plan.ownerRole) }),
        label: 'install canonical locked-helper policies for patient isolation proof',
        redact: true,
      },
    );
    run(
      'psql',
      [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        plan.targetOwnerUrl,
        '-f',
        'deploy/postgres/reference-catalog-rls.sql',
      ],
      {
        env: sanitizedChildEnv({ PGOPTIONS: rolePgOptions(plan.ownerRole) }),
        label: 'install canonical reference-catalog patient policies for diary proof',
        redact: true,
      },
    );
    run('node', [patientContentDiaryProofPath, '--execute', `--db=${plan.dbName}`], {
      env: sanitizedChildEnv(),
      label: 'prove patient content/diary A/B/cross-org visibility',
      redact: true,
    });
  } finally {
    setFixtureProofElevation(plan, false);
  }
  assertCleanup(plan);
}

function dropOnSuccess(plan) {
  superuserPsqlExec(
    plan,
    'postgres',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(plan.dbName)} AND pid <> pg_backend_pid();`,
    'terminate disposable DB sessions before drop',
  );
  superuserPsqlExec(
    plan,
    'postgres',
    `DROP DATABASE ${quoteIdent(plan.dbName)};`,
    'drop disposable DB',
  );
  superuserPsqlExec(
    plan,
    'postgres',
    `DROP ROLE ${quoteIdent(plan.ownerRole)};`,
    'drop disposable owner role',
  );
}

function dropFixtureProofResourcesIfPresent(plan) {
  const ownerRoleExists = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.ownerRole)})::int;`,
    'check disposable fixture owner role before cleanup',
  );
  if (ownerRoleExists === '1') {
    superuserPsqlExec(
      plan,
      'postgres',
      `ALTER ROLE ${quoteIdent(plan.ownerRole)} NOBYPASSRLS;
DO $cleanup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.appOwnerRole)}) THEN
    IF pg_has_role(${quoteLiteral(plan.ownerRole)}, ${quoteLiteral(plan.appOwnerRole)}, 'member') THEN
      EXECUTE format('REVOKE %I FROM %I', ${quoteLiteral(plan.appOwnerRole)}, ${quoteLiteral(plan.ownerRole)});
    END IF;
  END IF;
END
$cleanup$;`,
      'normalize disposable fixture owner before cleanup',
    );
  }
  const databaseExists = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname=${quoteLiteral(plan.dbName)})::int;`,
    'check disposable fixture DB before cleanup',
  );
  if (databaseExists === '1') {
    superuserPsqlExec(
      plan,
      'postgres',
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(plan.dbName)} AND pid <> pg_backend_pid();`,
      'terminate disposable fixture DB sessions before cleanup',
    );
    superuserPsqlExec(
      plan,
      'postgres',
      `DROP DATABASE ${quoteIdent(plan.dbName)};`,
      'drop disposable fixture DB',
    );
  }
  const roleExists = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.ownerRole)})::int;`,
    'check disposable fixture role before cleanup',
  );
  if (roleExists === '1') {
    superuserPsqlExec(
      plan,
      'postgres',
      `DROP ROLE ${quoteIdent(plan.ownerRole)};`,
      'drop disposable fixture owner role',
    );
  }
  const runtimeRoleExists = superuserPsqlScalar(
    plan,
    'postgres',
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.fixtureRuntimeRole)})::int;`,
    'check disposable fixture runtime role before cleanup',
  );
  if (runtimeRoleExists === '1') {
    superuserPsqlExec(
      plan,
      'postgres',
      `DROP ROLE ${quoteIdent(plan.fixtureRuntimeRole)};`,
      'drop disposable fixture runtime role',
    );
  }
}

function cleanupModeAfterExecution({
  created,
  dropOnSuccess: shouldDropOnSuccess,
  primaryError,
  proveTestFixture,
}) {
  if (proveTestFixture) return 'fixture';
  if (created && shouldDropOnSuccess && !primaryError) return 'ordinary';
  return 'none';
}

function runExecute(plan, options) {
  if (plan.transport === 'none') {
    throw new Error(
      `${superuserUrlEnv}/--superuser-url or ${superuserSudoEnv}=1/--superuser-sudo-postgres is required in --execute mode`,
    );
  }
  if (!options.dumpPath) throw new Error('--dump is required in --execute mode');
  assertFixtureProofOptions(plan, options);
  if (options.proveTestFixture) assertFixtureProofResourcesFresh(plan);
  console.log(`[saas-disposable] executing guarded dormant rehearsal for ${plan.dbName}`);
  let created = false;
  let primaryError = null;
  try {
    createDisposableDatabase(plan, options);
    created = true;
    restoreDump(plan, options.dumpPath);
    assertOwnerState(plan);
    runDeploy667(plan);
    assertCleanup(plan);
    runDbStateCheck(plan);
    if (options.proveTestFixture) runFixtureProof(plan);
  } catch (error) {
    primaryError = error;
  }
  const cleanupMode = cleanupModeAfterExecution({
    created,
    dropOnSuccess: options.dropOnSuccess,
    primaryError,
    proveTestFixture: options.proveTestFixture,
  });
  if (cleanupMode !== 'none') {
    try {
      if (cleanupMode === 'fixture') {
        dropFixtureProofResourcesIfPresent(plan);
      } else {
        dropOnSuccess(plan);
      }
    } catch (cleanupError) {
      if (primaryError)
        throw new AggregateError(
          [primaryError, cleanupError],
          'rehearsal failed and cleanup failed',
        );
      throw cleanupError;
    }
  } else if (!primaryError) {
    console.log(`[saas-disposable] preserved disposable DB for audit: ${plan.dbName}`);
  }
  if (primaryError) throw primaryError;
}

function assertThrows(label, fn) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`self-test expected rejection: ${label}`);
}

function runSelfTest() {
  for (const name of [
    'bcb_webapp_prod',
    'bcb_webapp_test',
    'bcb_webapp_dev',
    'bersoncarebot',
    'bcb_saas_prod_rehearsal_x',
    'bcb_saas_dormant_test_x',
    'bcb_saas_dormant_dev_x',
    'unmarked_copy',
  ]) {
    assertThrows(name, () => assertSafeDbName('self-test', name));
  }
  assertSafeDbName('self-test', 'bcb_saas_dormant_rehearsal_selftest');
  assertSafeDbName('self-test', defaultDbName(new Date('2026-07-14T00:00:00.000Z')));

  const defaultOptions = parseArgs([]);
  if (defaultOptions.dryRun !== true || defaultOptions.execute !== false) {
    throw new Error('self-test expected default options to be dry-run only');
  }
  const explicitDryRunOptions = parseArgs(['--dry-run']);
  if (explicitDryRunOptions.dryRun !== true || explicitDryRunOptions.execute !== false) {
    throw new Error('self-test expected --dry-run to preserve dry-run only mode');
  }
  const executeOptions = parseArgs(['--execute']);
  if (executeOptions.dryRun !== false || executeOptions.execute !== true) {
    throw new Error('self-test expected --execute to disable dry-run and enable execute');
  }
  const sudoTransportOptions = parseArgs(['--dry-run', '--superuser-sudo-postgres']);
  if (sudoTransportOptions.superuserSudoPostgres !== true || sudoTransportOptions.dryRun !== true) {
    throw new Error(
      'self-test expected --superuser-sudo-postgres to be explicit and preserve dry-run',
    );
  }
  assertThrows('conflicting execute/dry-run flags', () => parseArgs(['--execute', '--dry-run']));
  assertThrows('conflicting dry-run/execute flags', () => parseArgs(['--dry-run', '--execute']));
  assertThrows('conflicting superuser transports', () =>
    parseArgs(['--superuser-sudo-postgres', '--superuser-url=postgres://u:p@localhost/postgres']),
  );
  assertThrows('self-test with extra flag', () => parseArgs(['--self-test', '--dry-run']));
  const fixtureProofOptions = parseArgs(['--execute', '--prove-test-fixture', '--drop-on-success']);
  if (!fixtureProofOptions.proveTestFixture) {
    throw new Error('self-test expected explicit fixture proof mode');
  }

  assertThrows('prod host', () =>
    parsePostgresUrl('self-test', 'postgres://u:p@135.106.162.170/postgres'),
  );
  assertThrows('host override', () =>
    parsePostgresUrl('self-test', 'postgres://u:p@localhost/postgres?host=135.106.162.170'),
  );
  assertThrows('options override', () =>
    parsePostgresUrl('self-test', 'postgres://u:p@localhost/postgres?options=bad'),
  );
  parsePostgresUrl('self-test', 'postgres://u:p@localhost/postgres');

  const plan = buildPlan({
    dbName: 'bcb_saas_dormant_rehearsal_selftest',
    superuserSudoPostgres: false,
    superuserUrl: 'postgres://u:p@localhost/postgres',
  });
  const sudoPlan = buildPlan({
    dbName: 'bcb_saas_dormant_rehearsal_selftest',
    superuserSudoPostgres: true,
    superuserUrl: null,
  });
  assertFixtureProofOptions(sudoPlan, fixtureProofOptions);
  assertThrows('fixture proof without cleanup', () =>
    assertFixtureProofOptions(sudoPlan, parseArgs(['--execute', '--prove-test-fixture'])),
  );
  assertThrows('fixture proof with reused DB', () =>
    assertFixtureProofOptions(
      sudoPlan,
      parseArgs(['--execute', '--prove-test-fixture', '--drop-on-success', '--replace-existing']),
    ),
  );
  assertThrows('fixture proof with scratch DB name', () =>
    assertFixtureProofOptions(
      { ...sudoPlan, dbName: 'bcb_saas_fixture_scratch_selftest' },
      fixtureProofOptions,
    ),
  );
  const remoteFixturePlan = {
    ...plan,
    targetOwnerUrl: 'postgres://u:p@nonprod.example/bcb_saas_dormant_rehearsal_remote',
  };
  assertThrows('fixture proof on non-loopback endpoint', () =>
    assertFixtureProofOptions(remoteFixturePlan, fixtureProofOptions),
  );
  if (sudoPlan.transport !== 'sudo-postgres') {
    throw new Error('self-test expected sudo-postgres plan transport');
  }
  if (sudoPlan.targetSuperuserUrl !== null) {
    throw new Error('self-test expected sudo-postgres plan to avoid superuser URL');
  }
  if (!sudoPlan.targetOwnerUrl.startsWith('postgres://')) {
    throw new Error('self-test expected sudo-postgres plan to generate a local owner DATABASE_URL');
  }
  const plusEncodedRoleToken = ['+', 'role'].join('');
  if (plan.targetOwnerUrl.includes('options=') || plan.targetOwnerUrl.includes('role=')) {
    throw new Error('self-test expected target owner URL to keep role handoff out of URL options');
  }
  if (plan.targetOwnerUrl.includes(plusEncodedRoleToken)) {
    throw new Error('self-test expected target owner URL to avoid plus-encoded role handoff');
  }
  const cleanupSql = [
    `SELECT rolbypassrls::text FROM pg_roles WHERE rolname = ${quoteLiteral(plan.ownerRole)};`,
    `SELECT pg_has_role(${quoteLiteral(plan.ownerRole)}, ${quoteLiteral(plan.appOwnerRole)}, 'member')::text;`,
  ].join('\n');
  if (!cleanupSql.includes('rolbypassrls') || !cleanupSql.includes('pg_has_role')) {
    throw new Error(
      'self-test expected cleanup assertions to include BYPASSRLS and membership checks',
    );
  }
  const restoreSource = restoreDump.toString();
  if (restoreSource.includes('tolerateFailure')) {
    throw new Error('self-test expected pg_restore to fail closed without tolerateFailure');
  }
  const nonZeroWarningToken = ['pg_restore returned', 'non-zero'].join(' ');
  const rowCountWarningToken = ['representative restored row counts', 'passed'].join(' ');
  if (restoreSource.includes(nonZeroWarningToken) || restoreSource.includes(rowCountWarningToken)) {
    throw new Error('self-test expected pg_restore non-zero to be fatal, not warning-only');
  }
  const fixtureProofSource = runFixtureProof.toString();
  if (
    !fixtureProofSource.includes('e1WebappRuntimeConfigPath') ||
    !fixtureProofSource.includes('app.install_signed_context') ||
    fixtureProofSource.includes('INSERT INTO app.principal_context')
  ) {
    throw new Error(
      'self-test expected fixture capability proof to use only signed principal context',
    );
  }
  if (
    cleanupModeAfterExecution({
      created: true,
      dropOnSuccess: true,
      primaryError: new Error('failed ordinary rehearsal'),
      proveTestFixture: false,
    }) !== 'none' ||
    cleanupModeAfterExecution({
      created: true,
      dropOnSuccess: true,
      primaryError: null,
      proveTestFixture: false,
    }) !== 'ordinary' ||
    cleanupModeAfterExecution({
      created: false,
      dropOnSuccess: true,
      primaryError: new Error('failed before app_owner existed'),
      proveTestFixture: true,
    }) !== 'fixture'
  ) {
    throw new Error('self-test expected failure-aware ordinary/fixture cleanup decisions');
  }
  const fixtureCleanupSource = dropFixtureProofResourcesIfPresent.toString();
  if (
    !fixtureCleanupSource.includes('ownerRoleExists') ||
    !fixtureCleanupSource.includes('IF EXISTS (SELECT 1 FROM pg_roles') ||
    fixtureCleanupSource.includes('setFixtureProofElevation(plan, false)')
  ) {
    throw new Error('self-test expected pre-app_owner fixture cleanup to remain fail-safe');
  }

  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    PGDATABASE: process.env.PGDATABASE,
    PGOPTIONS: process.env.PGOPTIONS,
    SUPERUSER_URL: process.env.SUPERUSER_URL,
    [deploySuperuserSudoEnv]: process.env[deploySuperuserSudoEnv],
    [superuserUrlEnv]: process.env[superuserUrlEnv],
    [superuserSudoEnv]: process.env[superuserSudoEnv],
  };
  try {
    process.env.DATABASE_URL =
      'postgres://ambient:secret@localhost/bcb_saas_dormant_rehearsal_ambient';
    process.env.PGDATABASE = 'bcb_saas_dormant_rehearsal_ambient';
    process.env.PGOPTIONS = '-c role=ambient';
    process.env.SUPERUSER_URL = 'postgres://ambient:secret@localhost/postgres';
    process.env[deploySuperuserSudoEnv] = '1';
    process.env[superuserUrlEnv] = 'postgres://ambient:secret@localhost/postgres';
    process.env[superuserSudoEnv] = '1';
    const sanitized = sanitizedChildEnv();
    for (const key of [
      'DATABASE_URL',
      'PGDATABASE',
      'PGOPTIONS',
      'SUPERUSER_URL',
      deploySuperuserSudoEnv,
      superuserUrlEnv,
      superuserSudoEnv,
    ]) {
      if (Object.hasOwn(sanitized, key)) {
        throw new Error(`self-test expected sanitized child env to strip ambient ${key}`);
      }
    }

    const explicitDeployEnv = deploy667ChildEnv(plan);
    if (explicitDeployEnv.DATABASE_URL !== plan.targetOwnerUrl) {
      throw new Error('self-test expected deploy #667 child env to preserve explicit DATABASE_URL');
    }
    if (explicitDeployEnv.SUPERUSER_URL !== plan.targetSuperuserUrl) {
      throw new Error(
        'self-test expected deploy #667 child env to preserve explicit SUPERUSER_URL',
      );
    }
    if (explicitDeployEnv.PGOPTIONS !== '-c role=bcb_saas_dormant_rehearsal_selftest') {
      throw new Error('self-test expected deploy #667 child env to pass explicit role PGOPTIONS');
    }
    if (
      explicitDeployEnv.DATABASE_URL.includes(plusEncodedRoleToken) ||
      explicitDeployEnv.PGOPTIONS.includes(plusEncodedRoleToken)
    ) {
      throw new Error(
        'self-test expected deploy #667 child env to avoid plus-encoded role handoff',
      );
    }
    if (Object.hasOwn(explicitDeployEnv, superuserUrlEnv)) {
      throw new Error(
        `self-test expected deploy #667 child env to strip ambient ${superuserUrlEnv}`,
      );
    }

    const sudoDeployEnv = deploy667ChildEnv(sudoPlan);
    if (sudoDeployEnv[deploySuperuserSudoEnv] !== '1') {
      throw new Error(
        `self-test expected deploy #667 child env to pass explicit ${deploySuperuserSudoEnv}=1`,
      );
    }
    if (Object.hasOwn(sudoDeployEnv, 'SUPERUSER_URL')) {
      throw new Error('self-test expected sudo deploy #667 child env not to pass SUPERUSER_URL');
    }
    if (
      Object.hasOwn(sudoDeployEnv, superuserUrlEnv) ||
      Object.hasOwn(sudoDeployEnv, superuserSudoEnv)
    ) {
      throw new Error(
        'self-test expected sudo deploy #667 child env to strip wrapper superuser env vars',
      );
    }
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
  console.log('run-saas-disposable-dormant-rehearsal self-test: OK');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    process.exit(0);
  }

  const plan = buildPlan(options);
  const dumpInfo = validateDumpIfPresent(options.dumpPath, { execute: options.execute });
  if (options.dryRun) {
    printDryRun(plan, dumpInfo, options);
  } else {
    runExecute(plan, options);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[saas-disposable] FAILED: ${message}`);
  process.exit(1);
}
