#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BASELINE_OWNER_ROLE,
  repoRoot,
  resolveTrustedPostgresBinaries,
  schemaPath,
  seedPath,
  sqlLiteral,
  validatePackage,
} from './a0-greenfield-baseline-lib.mjs';

const operatorRole = 'bcb_a1_operator';
const appOwnerRole = 'app_owner';
const staffRole = 'app_staff';
const patientRole = 'app_patient';
const staffLoginRole = 'app_runtime_staff_login';
const nonstaffLoginRole = 'app_runtime_nonstaff_login';
const postgresPort = '57439';
const signingSecret = 'a1-synthetic-signing-secret-2026-locked-proof';
const fixturePath = path.join(repoRoot, 'docs', 'ARCHITECTURE', 'DB_DUMPS', 'a1-rls', 'seed.sql');
const scrubbedEnvironmentKeys = Object.freeze([
  'A1_DATABASE_URL_NONSTAFF',
  'A1_DATABASE_URL_STAFF',
  'DATABASE_URL',
  'DATABASE_URL_NONSTAFF',
  'DATABASE_URL_STAFF',
  'DB_PRINCIPAL_CONTEXT_MODE',
  'DB_PRINCIPAL_SIGNING_SECRET',
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

let activeChild = null;
function terminateActiveChild(signal = 'SIGTERM') {
  if (!activeChild?.pid) return;
  try {
    process.kill(-activeChild.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ESRCH')) throw error;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? cleanEnvironment(),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeChild = child;
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const maxBuffer = 64 * 1024 * 1024;
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxBuffer) {
        terminateActiveChild('SIGKILL');
        reject(new Error(`${options.label ?? command}_max_buffer_exceeded`));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', reject);
    const timeout = setTimeout(() => terminateActiveChild('SIGKILL'), options.timeout ?? 300_000);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (activeChild === child) activeChild = null;
      const stdoutText = Buffer.concat(stdout).toString('utf8');
      const stderrText = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) {
        reject(
          new Error(
            `${options.label ?? command}_failed:${code ?? signal ?? 'unknown'}` +
              `${stderrText.trim() ? `\nstderr:\n${stderrText.trim().slice(-12000)}` : ''}` +
              `${stdoutText.trim() ? `\nstdout:\n${stdoutText.trim().slice(-12000)}` : ''}`,
          ),
        );
        return;
      }
      resolve(stdoutText);
    });
    child.stdin.end(options.input ?? undefined);
  });
}

const packageResult = validatePackage();
const postgresBinaries = resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_saas_a1_verify_'));
const dataDir = path.join(scratchRoot, 'data');
const socketDir = path.join(scratchRoot, 'socket');
const databaseName = `bcb_saas_a1_scratch_${process.pid}_${Date.now()}`;
fs.mkdirSync(socketDir, { mode: 0o700 });
let started = false;
let cleaning = false;

function cleanup(exitCode = null) {
  if (cleaning) return;
  cleaning = true;
  terminateActiveChild('SIGTERM');
  const canonicalTmp = fs.realpathSync(os.tmpdir());
  const canonicalScratch = fs.realpathSync(scratchRoot);
  const expectedPrefix = path.join(canonicalTmp, 'bcb_saas_a1_verify_');
  if (!canonicalScratch.startsWith(expectedPrefix) || path.dirname(dataDir) !== scratchRoot) {
    throw new Error('unsafe_scratch_cleanup_target');
  }
  if (started) {
    spawnSync(postgresBinaries.pg_ctl, ['-D', dataDir, '-m', 'immediate', 'stop'], {
      cwd: repoRoot,
      env: cleanEnvironment(),
      stdio: 'ignore',
    });
  }
  fs.rmSync(scratchRoot, { recursive: true, force: true });
  if (exitCode !== null) process.exit(exitCode);
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
]) {
  process.once(signal, () => cleanup(code));
}

try {
  const { initdb, pg_ctl: pgCtl, psql } = postgresBinaries;
  await run(initdb, ['-D', dataDir, `--username=${operatorRole}`, '--auth=trust', '--no-locale'], {
    label: 'initdb',
  });
  started = true;
  await run(
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

  const psqlBase = ['-h', socketDir, '-p', postgresPort, '-X', '-v', 'ON_ERROR_STOP=1'];
  const psqlAs = (user, database, sql, label, variables = []) =>
    run(
      psql,
      [
        ...psqlBase,
        ...variables.flatMap(([key, value]) => ['-v', `${key}=${value}`]),
        '-U',
        user,
        '-d',
        database,
        '-Atqc',
        sql,
      ],
      { label },
    );
  const psqlFileAs = (user, database, filePath, label, variables = []) =>
    run(
      psql,
      [
        ...psqlBase,
        ...variables.flatMap(([key, value]) => ['-v', `${key}=${value}`]),
        '-U',
        user,
        '-d',
        database,
        '-f',
        filePath,
      ],
      { label },
    );

  await psqlAs(
    operatorRole,
    'postgres',
    [
      `CREATE ROLE ${quoteIdent(BASELINE_OWNER_ROLE)} LOGIN NOINHERIT NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(staffRole)} NOLOGIN NOINHERIT NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(patientRole)} NOLOGIN NOINHERIT NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(appOwnerRole)} NOLOGIN NOINHERIT BYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(staffLoginRole)} LOGIN NOINHERIT NOBYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(nonstaffLoginRole)} LOGIN NOINHERIT NOBYPASSRLS;`,
      `GRANT ${quoteIdent(staffRole)} TO ${quoteIdent(staffLoginRole)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`,
      `GRANT ${quoteIdent(patientRole)} TO ${quoteIdent(nonstaffLoginRole)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`,
    ].join('\n'),
    'create_disposable_roles',
  );
  await psqlAs(
    operatorRole,
    'postgres',
    `CREATE DATABASE ${quoteIdent(databaseName)} OWNER ${quoteIdent(BASELINE_OWNER_ROLE)};`,
    'create_disposable_database',
  );
  await psqlFileAs(BASELINE_OWNER_ROLE, databaseName, schemaPath, 'restore_schema_baseline');

  await psqlAs(
    operatorRole,
    'postgres',
    `ALTER ROLE ${quoteIdent(BASELINE_OWNER_ROLE)} BYPASSRLS;`,
    'open_migration_window',
  );
  const ledgerPath = path.join(scratchRoot, 'ledger-seed.sql');
  fs.writeFileSync(ledgerPath, buildLedgerSql(packageResult.manifest), { mode: 0o600 });
  await psqlFileAs(BASELINE_OWNER_ROLE, databaseName, ledgerPath, 'seed_migration_ledgers');
  await psqlFileAs(BASELINE_OWNER_ROLE, databaseName, seedPath, 'apply_a0_seed');

  const ownerUrl = `postgresql://${BASELINE_OWNER_ROLE}@localhost:${postgresPort}/${databaseName}?host=${encodeURIComponent(socketDir)}`;
  await run('/usr/bin/bash', ['scripts/migrate-all.sh'], {
    env: cleanEnvironment({
      DATABASE_URL: ownerUrl,
      NODE_ENV: 'test',
      CI: 'true',
      BOOKING_URL: 'http://127.0.0.1:4200',
      API_ENV_FILE: path.join(scratchRoot, 'missing-api.env'),
      WEBAPP_ENV_FILE: path.join(scratchRoot, 'missing-webapp.env'),
    }),
    label: 'current_pending_migrations',
    timeout: 600_000,
  });
  await psqlFileAs(BASELINE_OWNER_ROLE, databaseName, fixturePath, 'apply_a1_fixture');

  await psqlAs(
    operatorRole,
    databaseName,
    [
      `ALTER SCHEMA app OWNER TO ${quoteIdent(appOwnerRole)};`,
      `GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(appOwnerRole)};`,
      `DO $a1_handoff$
     DECLARE item record;
     BEGIN
       FOR item IN
         SELECT relation.oid::regclass AS object_name
         FROM unnest(ARRAY[
           'app.context_signing_secrets',
           'app.principal_context',
           'app.context_nonce_ledger'
         ]) AS expected(qualified_name)
         JOIN pg_class relation ON relation.oid = to_regclass(expected.qualified_name)
       LOOP
         EXECUTE format('ALTER TABLE %s OWNER TO %I', item.object_name, '${appOwnerRole}');
       END LOOP;
       FOR item IN
         SELECT procedure.oid::regprocedure AS object_name
         FROM unnest(ARRAY[
           'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
           'app.current_org_id()',
           'app.current_patient_user_id()',
           'app.current_integrator_user_id()',
           'app.reset_principal_context()',
           'app.release_principal_context()',
           'app.close_active_user_phone_history(uuid)',
           'app.is_staff()'
         ]) AS expected(signature)
         JOIN pg_proc procedure ON procedure.oid = to_regprocedure(expected.signature)
       LOOP
         EXECUTE format('ALTER FUNCTION %s OWNER TO %I', item.object_name, '${appOwnerRole}');
       END LOOP;
     END
     $a1_handoff$;`,
    ].join('\n'),
    'prepare_protected_owner',
  );
  await psqlFileAs(
    operatorRole,
    databaseName,
    path.join(repoRoot, 'deploy/postgres/p0-5b-role-split-staff-patient.sql'),
    'apply_canonical_app_roles',
  );
  await psqlFileAs(
    operatorRole,
    databaseName,
    path.join(repoRoot, 'deploy/postgres/p2-b-protected-principal-context.sql'),
    'apply_protected_context',
    [
      ['p2_b_owner_role', appOwnerRole],
      ['p2_b_staff_role', staffRole],
      ['p2_b_patient_role', patientRole],
      ['p2_b_signing_secret', signingSecret],
    ],
  );
  await psqlFileAs(
    operatorRole,
    databaseName,
    path.join(repoRoot, 'deploy/postgres/p0-5b-grants.sql'),
    'apply_canonical_app_grants',
  );
  await psqlFileAs(
    operatorRole,
    databaseName,
    path.join(repoRoot, 'deploy/postgres/phase4-locked-helper-rls-policies.sql'),
    'apply_locked_policies',
    [['phase4_enforce_locked_context', '1']],
  );
  await psqlAs(
    operatorRole,
    databaseName,
    'ALTER TABLE public.be_appointments FORCE ROW LEVEL SECURITY;',
    'force_tested_boundary',
  );
  await psqlAs(
    operatorRole,
    'postgres',
    `ALTER ROLE ${quoteIdent(BASELINE_OWNER_ROLE)} NOBYPASSRLS;`,
    'close_migration_window',
  );

  const topologyProof = (
    await psqlAs(
      operatorRole,
      databaseName,
      `SELECT (
    (SELECT NOT rolbypassrls FROM pg_roles WHERE rolname=${sqlLiteral(BASELINE_OWNER_ROLE)})
    AND (SELECT NOT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname='app_staff')
    AND (SELECT NOT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname='app_patient')
    AND (SELECT NOT rolbypassrls AND NOT rolinherit FROM pg_roles WHERE rolname='app_runtime_staff_login')
    AND (SELECT NOT rolbypassrls AND NOT rolinherit FROM pg_roles WHERE rolname='app_runtime_nonstaff_login')
    AND pg_has_role('app_runtime_staff_login', 'app_staff', 'MEMBER')
    AND NOT pg_has_role('app_runtime_staff_login', 'app_patient', 'MEMBER')
    AND pg_has_role('app_runtime_nonstaff_login', 'app_patient', 'MEMBER')
    AND NOT pg_has_role('app_runtime_nonstaff_login', 'app_staff', 'MEMBER')
    AND NOT pg_has_role('app_runtime_staff_login', 'app_owner', 'MEMBER')
    AND NOT pg_has_role('app_runtime_nonstaff_login', 'app_owner', 'MEMBER')
    AND 2 = (
      SELECT count(*)
      FROM pg_auth_members membership
      JOIN pg_roles member_role ON member_role.oid=membership.member
      JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
      WHERE (member_role.rolname, granted_role.rolname) IN (
        ('app_runtime_staff_login', 'app_staff'),
        ('app_runtime_nonstaff_login', 'app_patient')
      )
        AND NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
    )
    AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.be_appointments'::regclass)
    AND EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid='public.be_appointments'::regclass
        AND lower(pg_get_expr(polqual, polrelid)) LIKE '%app.current_org_id()%'
        AND lower(pg_get_expr(polqual, polrelid)) LIKE '%app.current_patient_user_id()%'
        AND lower(pg_get_expr(polqual, polrelid)) NOT LIKE '%current_setting%'
    )
  )::int;`,
      'topology_policy_postcheck',
    )
  ).trim();
  if (topologyProof !== '1') throw new Error('topology_policy_postcheck_failed');

  await run('/usr/bin/env', ['pnpm', '--dir', 'packages/db-principal', 'build'], {
    label: 'build_db_principal',
  });
  const staffUrl = `postgresql://${staffLoginRole}@localhost:${postgresPort}/${databaseName}?host=${encodeURIComponent(socketDir)}`;
  const nonstaffUrl = `postgresql://${nonstaffLoginRole}@localhost:${postgresPort}/${databaseName}?host=${encodeURIComponent(socketDir)}`;
  const runtimeOutput = await run(
    '/usr/bin/env',
    ['pnpm', '--dir', 'apps/webapp', 'exec', 'tsx', 'scripts/run-a1-rls-conformance.ts'],
    {
      env: cleanEnvironment({
        NODE_ENV: 'test',
        CI: 'true',
        DB_PRINCIPAL_CONTEXT_MODE: 'locked',
        DB_PRINCIPAL_SIGNING_SECRET: signingSecret,
        A1_DATABASE_URL_STAFF: staffUrl,
        A1_DATABASE_URL_NONSTAFF: nonstaffUrl,
      }),
      label: 'runtime_query_boundary_proof',
    },
  );
  if (!runtimeOutput.includes('"status":"PASS"')) throw new Error('runtime_proof_missing_pass');

  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        transport: 'private-unix-socket-ephemeral-postgresql',
        baseline: 'a0-greenfield',
        migrationsApplied: true,
        lockedContext: true,
        forceRls: true,
        evidencePrincipal: 'non-owner-runtime-logins',
        organizations: 2,
        ownOrgAccess: true,
        crossOrgDenied: true,
        missingPrincipalDenied: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `verify-a1-rls-conformance: ${error instanceof Error ? error.message : 'unknown_error'}`,
  );
  cleanup();
  process.exit(1);
} finally {
  cleanup();
}
