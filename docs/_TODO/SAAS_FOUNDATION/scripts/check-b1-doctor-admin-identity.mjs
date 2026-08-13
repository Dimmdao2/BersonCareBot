#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const scriptPath = 'docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs';

function usage() {
  return [
    'Usage:',
    `  node ${scriptPath}`,
    `  node ${scriptPath} --self-test`,
    `  node ${scriptPath} --print-sql`,
    `  node ${scriptPath} --execute --database-url='<disposable-fresh-copy-runtime-url>' [--required-current-user='<owner-role>']`,
    `  node ${scriptPath} --execute --allow-test-target --database-url='<owner-authorized-test-url>' --required-current-user='bersoncarebot_test'`,
    '',
    'Safety: execution refuses prod/test/dev-shaped DB names and requires scratch/rehearsal/copy in the DB name.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    printSql: false,
    execute: false,
    allowTestTarget: false,
    databaseUrl: null,
    requiredCurrentUser: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (arg === '--print-sql') {
      options.printSql = true;
      continue;
    }
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    if (arg === '--allow-test-target') {
      options.allowTestTarget = true;
      continue;
    }
    if (arg.startsWith('--database-url=')) {
      options.databaseUrl = arg.slice('--database-url='.length);
      continue;
    }
    if (arg === '--database-url') {
      const value = argv[index + 1];
      assert(value && !value.startsWith('--'), '--database-url requires a value');
      options.databaseUrl = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--required-current-user=')) {
      options.requiredCurrentUser = arg.slice('--required-current-user='.length);
      continue;
    }
    if (arg === '--required-current-user') {
      const value = argv[index + 1];
      assert(value && !value.startsWith('--'), '--required-current-user requires a value');
      options.requiredCurrentUser = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function assertPgIdentifier(value, label) {
  assert(value, `${label} is required`);
  assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(value), `${label} must be a simple PostgreSQL identifier`);
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

function unsafeDbNameReason(name, options = {}) {
  const normalized = name.toLowerCase();
  const allowTestTarget = options.allowTestTarget === true;
  if (
    allowTestTarget &&
    (normalized === 'bersoncarebot_test' || normalized === 'bcb_webapp_test')
  ) {
    return null;
  }
  const forbiddenExact = new Set([
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

  if (!normalized) return 'empty database name';
  if (forbiddenExact.has(normalized)) return `forbidden database name ${name}`;
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    return `prod/test/dev-shaped database name ${name}`;
  }
  if (!/(^|[_-])(scratch|rehearsal|copy)([_-]|$)/.test(normalized)) {
    return `database name must include scratch/rehearsal/copy, got ${name}`;
  }
  return null;
}

function assertSafeDatabaseUrl(databaseUrl, options = {}) {
  assert(databaseUrl, 'execution requires --database-url');
  const dbName = databaseNameFromUrl(databaseUrl);
  assert(dbName, 'could not parse database name from URL');
  const reason = unsafeDbNameReason(dbName, options);
  assert(!reason, reason);
}

function assertExecutionOwnerContextContract(options) {
  if (options.allowTestTarget) {
    assert(
      options.requiredCurrentUser,
      'TEST target execution requires --required-current-user to pin the owner-role context',
    );
  }
  if (options.requiredCurrentUser) {
    assertPgIdentifier(options.requiredCurrentUser, '--required-current-user');
  }
}

function buildSql() {
  return String.raw`
WITH constants AS (
  SELECT
    '+79643805480'::text AS doctor_phone,
    '+79189000782'::text AS client_phone,
    'dimmdao@yandex.ru'::text AS doctor_email,
    'dimmdao@gmail.com'::text AS admin_email,
    'a0000000-0000-4000-8000-000000000001'::uuid AS expected_org_id
),
doctor_live AS (
  SELECT pu.id, pu.role, pu.email_normalized, pu.is_archived
  FROM public.platform_users pu, constants c
  WHERE pu.phone_normalized = c.doctor_phone AND pu.merged_into_id IS NULL
),
legacy_email_admin AS (
  SELECT pu.id
  FROM public.platform_users pu, constants c
  WHERE pu.role = 'admin'
    AND pu.display_name = 'Дмитрий Берсон'
    AND pu.email = c.admin_email
    AND pu.email_normalized = c.admin_email
    AND pu.phone_normalized IS NULL
    AND pu.integrator_user_id IS NULL
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE
    AND NOT EXISTS (SELECT 1 FROM public.user_channel_bindings b WHERE b.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_oauth_bindings b WHERE b.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_password_credentials c WHERE c.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM public.login_tokens t WHERE t.user_id = pu.id)
),
doctor_memberships AS (
  SELECT m.role, m.status, m.organization_id, m.specialist_id
  FROM public.be_organization_members m
  JOIN doctor_live d ON d.id = m.platform_user_id
),
admin_phone_setting AS (
  SELECT value_json
  FROM public.system_settings
  WHERE key = 'admin_phones' AND scope = 'admin' AND organization_id IS NULL
  LIMIT 1
),
facts AS (
  SELECT jsonb_build_object(
    'doctorLiveRows', (SELECT count(*) FROM doctor_live),
    'doctorRoleOk', EXISTS (
      SELECT 1 FROM doctor_live d, constants c
      WHERE d.role = 'doctor' AND d.email_normalized = c.doctor_email AND d.is_archived IS FALSE
    ),
    'doctorOwnerMemberships', (
      SELECT count(*) FROM doctor_memberships m, constants c
      WHERE m.role = 'owner' AND m.status = 'active' AND m.organization_id = c.expected_org_id AND m.specialist_id IS NOT NULL
    ),
    'legacyEmailDerivedAdminRows', (SELECT count(*) FROM legacy_email_admin),
    'clientHasDoctorEmail', EXISTS (
      SELECT 1 FROM public.platform_users pu, constants c
      WHERE pu.phone_normalized = c.client_phone AND pu.merged_into_id IS NULL AND pu.email_normalized = c.doctor_email
    ),
    'adminPhonesGlobalValue', COALESCE((SELECT value_json FROM admin_phone_setting), 'null'::jsonb)
  ) AS value
)
SELECT value::text FROM facts;
`;
}

function classifyFacts(facts) {
  const failures = [];

  if (facts.doctorLiveRows !== 1) failures.push('doctor_phone_live_row_count');
  if (facts.clientHasDoctorEmail === true) failures.push('client_still_holds_doctor_email');
  if (facts.doctorRoleOk !== true) failures.push('data_fix_not_applied_or_partial');
  if (facts.legacyEmailDerivedAdminRows !== 0)
    failures.push('legacy_email_admin_artifact_not_demoted');
  if (facts.doctorOwnerMemberships !== 1) failures.push('doctor_owner_membership_missing_or_wrong');

  const ok = failures.length === 0;
  return {
    ok,
    failureReasons: failures,
    nextDiagnosis: ok
      ? 'db_identity_shape_ok_run_a1_doctor_admin_smoke_to_check_session_or_route_failure'
      : 'fix_datafix_or_membership_seed_before_app_smoke',
  };
}

function parsePsqlJson(stdout) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  assert(lines.length > 0, 'psql returned no JSON facts');
  return JSON.parse(lines.at(-1));
}

function parsePsqlText(stdout) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  assert(lines.length > 0, 'psql returned no rows');
  return lines.at(-1);
}

function runPsqlText(databaseUrl, sql) {
  const result = spawnSync(
    'psql',
    [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '--no-align', '--tuples-only'],
    {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw new Error(`failed to start psql: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `psql failed with status ${result.status ?? 'unknown'}: ${result.stderr.trim()}`,
    );
  }
  return parsePsqlText(result.stdout);
}

function assertCurrentUser(databaseUrl, requiredCurrentUser) {
  if (!requiredCurrentUser) return;
  const currentUser = runPsqlText(databaseUrl, 'SELECT current_user;');
  assert(
    currentUser === requiredCurrentUser,
    `owner context mismatch: current_user=${currentUser}, expected ${requiredCurrentUser}`,
  );
}

function runPsql(databaseUrl) {
  const result = spawnSync(
    'psql',
    [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '--no-align', '--tuples-only'],
    {
      input: buildSql(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw new Error(`failed to start psql: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `psql failed with status ${result.status ?? 'unknown'}: ${result.stderr.trim()}`,
    );
  }
  return parsePsqlJson(result.stdout);
}

function runSelfTest() {
  const disposableUrl = 'postgres://user:pass@localhost/bcb_saas_rehearsal_20260714';
  assert(
    parseArgs(['--execute', `--database-url=${disposableUrl}`]).databaseUrl === disposableUrl,
    'self-test expected --database-url=<url> parsing',
  );
  assert(
    parseArgs(['--execute', '--database-url', disposableUrl]).databaseUrl === disposableUrl,
    'self-test expected --database-url <url> parsing',
  );
  const testTargetOptions = parseArgs([
    '--execute',
    '--allow-test-target',
    '--database-url',
    'postgres://user:pass@localhost/bersoncarebot_test',
    '--required-current-user',
    'bersoncarebot_test',
  ]);
  assert(
    testTargetOptions.allowTestTarget,
    'self-test expected wrapper-style test target flag parsing',
  );
  assert(
    testTargetOptions.requiredCurrentUser === 'bersoncarebot_test',
    'self-test expected --required-current-user parsing',
  );
  assertExecutionOwnerContextContract(testTargetOptions);
  assertThrows(
    () =>
      assertExecutionOwnerContextContract({
        allowTestTarget: true,
        requiredCurrentUser: null,
      }),
    'self-test expected TEST target execution without owner context to fail',
  );
  assertThrows(
    () =>
      assertExecutionOwnerContextContract({
        allowTestTarget: true,
        requiredCurrentUser: 'bersoncarebot-test',
      }),
    'self-test expected invalid owner role identifier to fail',
  );

  assert(unsafeDbNameReason('bcb_webapp_prod'), 'self-test expected prod DB refusal');
  assert(unsafeDbNameReason('bersoncarebot_test'), 'self-test expected test DB refusal');
  assert(
    !unsafeDbNameReason('bersoncarebot_test', { allowTestTarget: true }),
    'self-test expected explicit test allow',
  );
  assert(unsafeDbNameReason('bcb_webapp_dev'), 'self-test expected dev DB refusal');
  assert(
    !unsafeDbNameReason('bcb_saas_rehearsal_20260714'),
    'self-test expected rehearsal DB allow',
  );
  assert(!unsafeDbNameReason('bcb_saas_scratch_b1'), 'self-test expected scratch DB allow');

  const okFacts = {
    doctorLiveRows: 1,
    doctorRoleOk: true,
    doctorOwnerMemberships: 1,
    legacyEmailDerivedAdminRows: 0,
    clientHasDoctorEmail: false,
    adminPhonesGlobalValue: { value: [] },
  };
  assert(classifyFacts(okFacts).ok, 'self-test expected ok facts to pass');

  const badFacts = { ...okFacts, doctorRoleOk: false, doctorOwnerMemberships: 0 };
  const classified = classifyFacts(badFacts);
  assert(!classified.ok, 'self-test expected bad facts to fail');
  assert(
    classified.failureReasons.includes('data_fix_not_applied_or_partial') &&
      classified.failureReasons.includes('doctor_owner_membership_missing_or_wrong'),
    'self-test expected data-fix and membership failure reasons',
  );

  console.log('check-b1-doctor-admin-identity self-test: OK');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
  } else if (options.printSql) {
    console.log(buildSql());
  } else if (options.execute) {
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    assertSafeDatabaseUrl(databaseUrl, { allowTestTarget: options.allowTestTarget });
    assertExecutionOwnerContextContract(options);
    assertCurrentUser(databaseUrl, options.requiredCurrentUser);
    const facts = runPsql(databaseUrl);
    const classification = classifyFacts(facts);
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          phase: 'B1',
          checkedAt: new Date().toISOString(),
          facts,
          classification,
        },
        null,
        2,
      ),
    );
    if (!classification.ok) process.exit(1);
  } else {
    throw new Error(`choose --execute, --print-sql, or --self-test\n\n${usage()}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-b1-doctor-admin-identity: ${message}`);
  process.exit(1);
}
