#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const scratchRoot = mkdtempSync(path.join(tmpdir(), 'bcb-u5a-strict-proof.'));
const dataDir = path.join(scratchRoot, 'data');
const socketDir = path.join(scratchRoot, 'socket');
const postgresLog = path.join(scratchRoot, 'postgres.log');
const databaseName = 'bersoncarebot_test';
const operatorRole = 'u5a_fixture_operator_login';
const optionSwitchedRole = 'u5a_option_switched_role';
const pgEnvironmentKeys = [
  'PGAPPNAME',
  'PGCHANNELBINDING',
  'PGCLIENTENCODING',
  'PGCONNECT_TIMEOUT',
  'PGDATABASE',
  'PGGSSENCMODE',
  'PGGSSLIB',
  'PGHOST',
  'PGHOSTADDR',
  'PGKRBSRVNAME',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGREQUIREAUTH',
  'PGREQUIREPEER',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLCRL',
  'PGSSLCRLDIR',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLNEGOTIATION',
  'PGSSLROOTCERT',
  'PGSSLSNI',
  'PGTARGETSESSIONATTRS',
  'PGUSER',
];
const capabilitySql = path.join(
  repoRoot,
  'deploy/postgres/u5a-patient-organization-test-lifecycle.sql',
);
const canonicalPolicySql = path.join(
  repoRoot,
  'deploy/postgres/phase4-locked-helper-rls-policies.sql',
);
let clusterStarted = false;
let capabilityInstalled = false;

function fail(message) {
  throw new Error(message);
}

function assertRegularNoSymlink(filePath, label) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
}

function cleanPgEnvironment(source) {
  const clean = { ...source };
  for (const key of pgEnvironmentKeys) delete clean[key];
  return clean;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: cleanPgEnvironment(options.env ?? process.env),
    input: options.input,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${options.label ?? command} failed`);
  }
  return result;
}

function pgArgs(database = databaseName, user = 'postgres') {
  return ['-h', socketDir, '-U', user, '-d', database, '-X', '-v', 'ON_ERROR_STOP=1', '-qAt'];
}

function psql(sql, database = databaseName) {
  return run(path.join(pgBin, 'psql'), [...pgArgs(database), '-c', sql], {
    label: 'scratch psql',
  });
}

function applyCapability(mode) {
  run(
    path.join(pgBin, 'psql'),
    [
      ...pgArgs(),
      '-v',
      `u5a_lifecycle_expected_database=${databaseName}`,
      '-v',
      `u5a_lifecycle_operator_role=${operatorRole}`,
      '-v',
      `u5a_lifecycle_mode=${mode}`,
      '-f',
      capabilitySql,
    ],
    { label: `capability ${mode}` },
  );
}

function operatorUrl() {
  const encodedSocket = encodeURIComponent(socketDir);
  return `postgresql://${operatorRole}@localhost/${databaseName}?host=${encodedSocket}`;
}

function cli(command, execute = false) {
  const env = {
    ...cleanPgEnvironment(process.env),
    SAAS_ISOLATION_OPERATOR_DATABASE_URL: operatorUrl(),
  };
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_NONSTAFF',
    'DATABASE_URL_STAFF',
    'PGDATABASE',
    'PGHOST',
    'PGHOSTADDR',
    'PGOPTIONS',
    'PGPASSFILE',
    'PGSERVICE',
  ]) {
    delete env[key];
  }
  const args = [
    '--dir',
    'apps/webapp',
    'run',
    'test-fixture:patient-organization-lifecycle',
    '--',
    command,
  ];
  if (execute) args.push('--execute');
  const result = run('pnpm', args, { env, label: `operator CLI ${command}` });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (/postgres(?:ql)?:\/\/|53000000-/.test(output)) fail('operator CLI disclosed protected connection or IDs');
  process.stdout.write(result.stdout ?? '');
}

function proveUriOptionsRejectedBeforeCliConnection() {
  const maliciousUrl = `${operatorUrl()}&options=-c%20role%3D${optionSwitchedRole}`;
  const mismatch = run(
    path.join(pgBin, 'psql'),
    ['-d', maliciousUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-F', '|', '-c', 'SELECT session_user, current_user'],
    { label: 'URI options session/current mismatch proof' },
  );
  if (mismatch.stdout.trim() !== `${operatorRole}|${optionSwitchedRole}`) {
    fail('scratch URI options did not reproduce the session/current mismatch');
  }

  const env = {
    ...cleanPgEnvironment(process.env),
    SAAS_ISOLATION_OPERATOR_DATABASE_URL: maliciousUrl,
  };
  const rejected = spawnSync(
    'pnpm',
    [
      '--dir',
      'apps/webapp',
      'run',
      'test-fixture:patient-organization-lifecycle',
      '--',
      'status',
    ],
    { cwd: repoRoot, encoding: 'utf8', env },
  );
  const output = `${rejected.stdout ?? ''}${rejected.stderr ?? ''}`;
  if (
    rejected.status === 0 ||
    !output.includes('operator_database_url_options_forbidden') ||
    /postgres(?:ql)?:\/\/|53000000-/.test(output)
  ) {
    fail('actual operator CLI did not safely reject URI options before connection');
  }
}

function exactStrictPolicyStatement() {
  const source = readFileSync(canonicalPolicySql, 'utf8');
  const start = source.indexOf('-- public.org_enrollments (saas_org_dormant_p0_8_3)');
  const end = source.indexOf('-- public.organization_member_invites', start);
  if (start < 0 || end < 0) fail('canonical org_enrollments policy block missing');
  const block = source.slice(start, end);
  const match = block.match(
    /CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"\."org_enrollments" FOR ALL USING \(\(\(app\.is_staff\(\).+?WITH CHECK \(.+?\);/,
  );
  if (!match) fail('canonical strict org_enrollments policy statement missing');
  return match[0];
}

function startLockHolder() {
  const child = spawn(
    path.join(pgBin, 'psql'),
    [
      ...pgArgs(databaseName, operatorRole),
      '-c',
      "BEGIN; SELECT * FROM app.control_u5a_patient_organization_fixture('status'); SELECT pg_sleep(3); COMMIT;",
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: cleanPgEnvironment(process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  return {
    child,
    output: () => output,
    completion: new Promise((resolve) => child.once('close', (code) => resolve(code))),
  };
}

async function proveConcurrentSetProtection() {
  const holder = startLockHolder();
  const readinessDeadline = Date.now() + 3_000;
  for (;;) {
    const lockProbe = psql(`
      SELECT (
        count(*) FILTER (WHERE lock.granted AND lock.mode = 'ShareLock') = 1
      )::int
      FROM pg_catalog.pg_locks AS lock
      JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE lock.relation = 'public.org_enrollments'::regclass
        AND activity.usename = '${operatorRole}'
    `);
    if (lockProbe.stdout.trim() === '1') break;
    if (holder.child.exitCode !== null) {
      fail(`lock holder exited before acquiring the protected-set lock: ${holder.output()}`);
    }
    if (Date.now() >= readinessDeadline) fail('lock holder did not report readiness');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const blocked = spawnSync(
    path.join(pgBin, 'psql'),
    [
      ...pgArgs(),
      '-c',
      `
        SET lock_timeout = '200ms';
        INSERT INTO public.org_enrollments (id, organization_id, platform_user_id, status)
        VALUES (
          '53000000-0000-4000-8000-00000000b303',
          '53000000-0000-4000-8000-0000000000c1',
          '53000000-0000-4000-8000-00000000a301',
          'active'
        );
      `,
    ],
    { cwd: repoRoot, encoding: 'utf8', env: cleanPgEnvironment(process.env) },
  );
  const holderCode = await Promise.race([
    holder.completion,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('lock holder exceeded five seconds')), 5_000),
    ),
  ]);
  if (holderCode !== 0) fail(`lock holder failed: ${holder.output()}`);
  if (blocked.status === 0 || !/lock timeout/i.test(`${blocked.stdout}${blocked.stderr}`)) {
    fail('concurrent shared-patient relationship write was not blocked');
  }
}

function assertNoResidue() {
  const result = psql(`
    SELECT (
      to_regprocedure('app.control_u5a_patient_organization_fixture(text)') IS NULL
      AND has_table_privilege('app_owner', 'public.org_enrollments', 'SELECT')
      AND has_table_privilege('app_owner', 'public.org_enrollments', 'UPDATE')
      AND NOT has_table_privilege('${operatorRole}', 'public.org_enrollments', 'SELECT')
      AND NOT has_table_privilege('${operatorRole}', 'public.org_enrollments', 'UPDATE')
      AND (
        SELECT count(*) = 1
          AND bool_and(granted_role.rolname = 'saas_telemetry_operator')
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
        JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
        WHERE member_role.rolname = '${operatorRole}'
      )
      AND (SELECT relrowsecurity AND relforcerowsecurity
           FROM pg_catalog.pg_class
           WHERE oid = 'public.org_enrollments'::regclass)
      AND (SELECT count(*) = 2 AND count(*) FILTER (WHERE status = 'active') = 2
           FROM public.org_enrollments
           WHERE platform_user_id = '53000000-0000-4000-8000-00000000a301'::uuid)
    )::int
  `);
  if (result.stdout.trim() !== '1') fail('scratch cleanup/no-residue assertion failed');
}

try {
  assertRegularNoSymlink(capabilitySql, 'capability SQL');
  assertRegularNoSymlink(canonicalPolicySql, 'canonical policy SQL');
  run('mkdir', ['-p', dataDir, socketDir]);
  run(path.join(pgBin, 'initdb'), ['-D', dataDir, '-A', 'trust', '-U', 'postgres', '--no-locale']);
  run(path.join(pgBin, 'pg_ctl'), [
    '-D',
    dataDir,
    '-l',
    postgresLog,
    '-o',
    `-k ${socketDir} -c listen_addresses=''`,
    '-w',
    'start',
  ]);
  clusterStarted = true;
  run(path.join(pgBin, 'createdb'), ['-h', socketDir, '-U', 'postgres', databaseName]);

  psql(`
    CREATE ROLE app_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
    CREATE ROLE app_staff NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE app_patient NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE app_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE saas_telemetry_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;
    CREATE ROLE ${operatorRole} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    CREATE ROLE ${optionSwitchedRole} NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT saas_telemetry_operator TO ${operatorRole};
    GRANT ${optionSwitchedRole} TO ${operatorRole};
    CREATE SCHEMA app;
    CREATE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql STABLE AS 'SELECT false';
    CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
    CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
    CREATE FUNCTION app.current_integrator_user_id() RETURNS bigint LANGUAGE sql STABLE AS 'SELECT NULL::bigint';
    CREATE TABLE public.org_enrollments (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      platform_user_id uuid NOT NULL,
      status text NOT NULL CHECK (status IN ('active','invited','discharged','archived'))
    );
    INSERT INTO public.org_enrollments VALUES
      ('53000000-0000-4000-8000-00000000b105','53000000-0000-4000-8000-0000000000a1','53000000-0000-4000-8000-00000000a301','active'),
      ('53000000-0000-4000-8000-00000000b203','53000000-0000-4000-8000-0000000000b1','53000000-0000-4000-8000-00000000a301','active');
    ALTER TABLE public.org_enrollments ENABLE ROW LEVEL SECURITY;
    ${exactStrictPolicyStatement()}
    ALTER TABLE public.org_enrollments FORCE ROW LEVEL SECURITY;
    GRANT SELECT ON TABLE public.org_enrollments TO app_staff, app_patient;
    GRANT USAGE ON SCHEMA public TO app_owner;
    GRANT SELECT, UPDATE ON TABLE public.org_enrollments TO app_owner;
    GRANT USAGE ON SCHEMA app TO ${operatorRole};
  `);

  proveUriOptionsRejectedBeforeCliConnection();
  psql(`REVOKE ${optionSwitchedRole} FROM ${operatorRole}; DROP ROLE ${optionSwitchedRole};`);
  applyCapability('install');
  capabilityInstalled = true;
  cli('status');
  cli('discharge', true);
  cli('discharge', true);
  cli('restore', true);
  cli('restore', true);
  await proveConcurrentSetProtection();
  cli('status');
  applyCapability('cleanup');
  capabilityInstalled = false;
  assertNoResidue();
  process.stdout.write(
    'u5a_patient_organization_lifecycle_strict_proof: PASS; strict_force=true; uri_options_rejected=true; session_current_mismatch_proved=true; final_active_relationships=2; capability_residue=0\n',
  );
} finally {
  if (capabilityInstalled) {
    try {
      cli('restore', true);
    } catch {
      // Cleanup below remains mandatory and its failure is surfaced.
    }
    try {
      applyCapability('cleanup');
    } catch {
      process.stderr.write('u5a strict proof capability cleanup failed\n');
    }
  }
  if (clusterStarted) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  }
  if (scratchRoot.startsWith(path.join(tmpdir(), 'bcb-u5a-strict-proof.'))) {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}
