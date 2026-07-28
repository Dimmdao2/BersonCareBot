#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { sourceTextIncludes } from './source-text-guard.mjs';

const read = (path) => readFileSync(path, 'utf8');
const requireText = (path, fragments, readText = read) => {
  const text = readText(path);
  const missing = fragments.filter((fragment) => !sourceTextIncludes(text, fragment, path));
  if (missing.length > 0) throw new Error(`${path} missing:\n- ${missing.join('\n- ')}`);
};

const contractPath = 'docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json';
const contract = JSON.parse(read(contractPath));
const scenarios = new Map(
  [...contract.readOnlyScenarios, ...contract.mutationScenarios].map((scenario) => [
    scenario.id,
    scenario,
  ]),
);

const health = scenarios.get('global-admin.system-health.api');
if (
  health?.actor !== 'global_admin' ||
  health.expectStatus !== 200 ||
  !health.jsonExpectation?.requiredPaths?.includes('saasIsolation.schemaVersion') ||
  !health.jsonExpectation?.requiredPaths?.includes('saasIsolation.coverageComplete') ||
  !health.jsonExpectation?.requiredPaths?.includes('saasIsolation.trend.daily7Days')
) {
  throw new Error(`${contractPath}: global-admin System Health contract is incomplete`);
}
for (const id of ['doctor.system-health.denied', 'clinic-admin.system-health.denied']) {
  const scenario = scenarios.get(id);
  if (scenario?.expectStatus !== 403 || scenario.expectAuthDenial !== true) {
    throw new Error(`${contractPath}: ${id} must be an explicit 403 denial`);
  }
}
for (const id of [
  'public.app.entry',
  'public.login.config',
  'public.specialist-clinic-registration.entry',
  'public.booking.entry',
]) {
  if (scenarios.get(id)?.actor !== 'public')
    throw new Error(`${contractPath}: ${id} must use public auth`);
}
const adminWrite = scenarios.get('global-admin.clinical-write.denied');
if (
  adminWrite?.actor !== 'global_admin' ||
  adminWrite.method !== 'POST' ||
  adminWrite.expectStatus !== 403 ||
  adminWrite.expectAuthDenial !== true ||
  adminWrite.disabledByDefault !== true
) {
  throw new Error(`${contractPath}: global-admin clinical-write denial is incomplete`);
}
const specialistEngagementAnalytics = scenarios.get('doctor.analytics.patient-engagement');
if (
  !['doctor', 'clinic_admin'].includes(specialistEngagementAnalytics?.actor) ||
  specialistEngagementAnalytics?.path !==
    '/api/doctor/treatment-program-instances/{patientProgramInstanceId}/action-log' ||
  specialistEngagementAnalytics.jsonExpectation?.requireSuccess !== true ||
  !specialistEngagementAnalytics.jsonExpectation?.nonEmptyPaths?.includes('entries')
) {
  throw new Error(`${contractPath}: tenant specialist engagement analytics contract is incomplete`);
}

requireText('docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs', [
  "'doctor', 'clinic_admin', 'patient', 'global_admin', 'public'",
  'profile.adminMode === true',
  'scenario.expectAuthDenial === true && status === expectedStatus',
  'body: JSON.stringify(scenario.requestJson)',
]);
requireText('deploy/postgres/test-owner-ready-locked-matrix.sql', [
  'matrix_a_cannot_read_b',
  'matrix_a_cannot_write_b',
  'matrix_b_cannot_read_a',
  'matrix_b_cannot_write_a',
  'matrix_shared_patient_selected_a',
  'matrix_shared_patient_selected_b',
  'matrix_org_scoped_booking_write_a',
  'ROLLBACK;',
]);
requireText('deploy/host/deploy-test-saas.sh', [
  'provision_saas_isolation_operator_login',
  'run_saas_isolation_test_scenario_proof',
  '--execute --prove-cleanup-on-injected-failure',
  '--execute --assert-clean-only',
  'run_owner_ready_locked_db_matrix',
  'post-matrix exact strict + FORCE reassertion',
  '--scenario-ids=global-admin.clinical-write.denied',
]);
requireText('deploy/host/render-saas-isolation-operator-provisioning.mjs', [
  'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
  'bersoncarebot_test',
  'LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  'ALTER ROLE ${roleIdentifier} PASSWORD',
  'FROM pg_auth_members membership',
  'REVOKE %I FROM %I',
]);
requireText('apps/webapp/scripts/run-saas-isolation-test-scenarios.ts', [
  "const REQUIRED_DATABASE = 'bersoncarebot_test'",
  'parseSaasIsolationTestScenarioCliArgs(process.argv.slice(2))',
  'saas_isolation_test_scenario_final_clean',
  'saas_isolation_test_scenario_injected_failure_cleaned',
  'app.read_saas_isolation_test_scenario_fixture_counts()',
]);
requireText('apps/webapp/src/modules/operator-health/saasIsolationTestScenarioCliArgs.ts', [
  "rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs",
  "args.includes('--execute')",
  '--prove-cleanup-on-injected-failure',
  '--assert-clean-only',
  'saas_isolation_test_scenario_conflicting_options',
]);
requireText('apps/webapp/src/modules/operator-health/saasIsolationTestScenarioCliArgs.test.ts', [
  "['--execute', '--assert-clean-only']",
  "'--prove-cleanup-on-injected-failure'",
  "'--unexpected'",
  'saas_isolation_test_scenario_conflicting_options',
]);
requireText('apps/webapp/src/modules/operator-health/saasIsolationTestScenarioRunner.ts', [
  'finally {',
  "await deps.apply('clean')",
  'assertSaasIsolationTestFixtureClean(await deps.readFixtureCounts())',
]);
const packageJson = JSON.parse(read('package.json'));
if (
  !packageJson.scripts?.['check:saas-product-smoke-contract']?.includes('--self-test') ||
  !packageJson.scripts?.audit?.includes('pnpm run check:saas-product-smoke-contract')
) {
  throw new Error(
    'package.json must wire product-smoke normal/self-test gate into canonical audit',
  );
}
requireText('apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts', [
  'doubleSeedSentinel: true',
  'proveDoubleSeedConvergence',
  'double_seed_unrelated_sentinel',
]);
const u5aSourceRequirements = new Map([
  [
    'apps/webapp/scripts/patient-organization-test-lifecycle.ts',
    [
      "const OPERATOR_DATABASE_URL_ENV = 'SAAS_ISOLATION_OPERATOR_DATABASE_URL'",
      "key.toLowerCase() === 'options'",
      'urlLoginRole !== probe.sessionRole',
      'probe.sessionRole !== probe.currentRole',
      'sanctionedMembershipTopology',
      'AND NOT capability_role.rolcanlogin',
      "options: ''",
      'await port.invoke(command)',
      'application_name',
    ],
  ],
  [
    'deploy/postgres/u5a-patient-organization-test-lifecycle.sql',
    [
      "current_database() = 'bersoncarebot_test'",
      "p_action NOT IN ('status', 'discharge', 'restore')",
      "granted_role.rolname = 'saas_telemetry_operator'",
      'AND NOT capability_role.rolcanlogin',
      "current_user <> 'app_owner'",
      "current_setting('role', true) IS DISTINCT FROM 'none'",
      "has_table_privilege('app_owner', 'public.org_enrollments', 'SELECT')",
      "has_table_privilege('app_owner', 'public.org_enrollments', 'UPDATE')",
      'LOCK TABLE public.org_enrollments IN SHARE MODE',
      'v_total <> 2',
      "v_clinic_a_status <> 'active'",
      "v_clinic_b_status NOT IN ('active', 'discharged')",
      'SECURITY DEFINER',
      'SET search_path = pg_catalog',
      'ALTER FUNCTION app.control_u5a_patient_organization_fixture(text) OWNER TO app_owner',
      'u5a_lifecycle_cleanup_no_capability_residue',
    ],
  ],
  [
    'deploy/host/run-u5a-patient-organization-test-lifecycle.sh',
    [
      'readonly REQUIRED_WRAPPER_SOURCE="$REQUIRED_PROJECT_ROOT/deploy/host/run-u5a-patient-organization-test-lifecycle.sh"',
      'wrapper_source="${BASH_SOURCE[0]}"',
      '[ "$wrapper_source" = "$REQUIRED_WRAPPER_SOURCE" ]',
      'assert_regular_nonsymlink_path "U5A wrapper source" "$wrapper_source"',
      'PG_ENV_UNSET_COMMAND=',
      'operator URL options are forbidden',
      'AND NOT capability_role.rolcanlogin',
      'session_user,',
      'current_user,',
      'flock -n 9',
      'operator URL login, session_user and current_user must be identical',
      'trap cleanup_on_exit EXIT',
      'apply_capability cleanup',
      'capability removed',
    ],
  ],
  [
    'docs/_TODO/SAAS_FOUNDATION/scripts/prove-u5a-patient-organization-test-lifecycle.mjs',
    [
      'phase4-locked-helper-rls-policies.sql',
      'exactStrictPolicyStatement',
      'FORCE ROW LEVEL SECURITY',
      'proveUriOptionsRejectedBeforeCliConnection',
      'URI options session/current mismatch proof',
      "cli('discharge', true)",
      "cli('restore', true)",
      'proveConcurrentSetProtection',
      'assertNoResidue',
      'capability_residue=0',
    ],
  ],
]);

function assertU5aSources(readText = read) {
  for (const [sourcePath, fragments] of u5aSourceRequirements) {
    requireText(sourcePath, fragments, readText);
  }
}

function runU5aCheckerMutationSelfTest() {
  for (const [sourcePath, fragments] of u5aSourceRequirements) {
    for (const fragment of fragments) {
      assert.throws(
        () =>
          assertU5aSources((candidatePath) => {
            const source = read(candidatePath);
            return candidatePath === sourcePath ? source.replaceAll(fragment, '') : source;
          }),
        new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }
  }
}

function runWrapperSourceGuardSelfTest() {
  const wrapperPath = 'deploy/host/run-u5a-patient-organization-test-lifecycle.sh';
  const scratch = mkdtempSync(path.join(tmpdir(), 'bcb-u5a-wrapper-source-guard.'));
  const canonicalRoot = path.join(scratch, 'canonical-test');
  const exactPath = path.join(
    canonicalRoot,
    'deploy/host/run-u5a-patient-organization-test-lifecycle.sh',
  );
  const payloadPath = path.join(scratch, 'wrapper-payload.sh');
  const aliasPath = path.join(scratch, 'wrapper-alias.sh');
  const transformed = read(wrapperPath)
    .replace(
      'readonly REQUIRED_PROJECT_ROOT="/opt/projects/bersoncarebot-test"',
      `readonly REQUIRED_PROJECT_ROOT="${canonicalRoot}"`,
    )
    .replace(
      'readonly WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"',
      `readonly WEBAPP_ENV="${path.join(scratch, 'missing-webapp.test')}"`,
    );
  const run = (sourcePath, cwd = scratch) =>
    spawnSync('bash', [sourcePath, 'status'], {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
  const output = (result) => `${result.stdout ?? ''}${result.stderr ?? ''}`;

  try {
    mkdirSync(path.dirname(exactPath), { recursive: true });
    writeFileSync(payloadPath, transformed, { mode: 0o755 });
    writeFileSync(exactPath, transformed, { mode: 0o755 });

    const canonical = run(exactPath);
    assert.notEqual(canonical.status, 0);
    assert.doesNotMatch(output(canonical), /wrapper source (?:must|alias)/u);

    writeFileSync(aliasPath, transformed, { mode: 0o755 });
    assert.match(output(run(aliasPath)), /wrapper source must be the exact canonical path/u);
    assert.match(
      output(run(path.relative(canonicalRoot, exactPath), canonicalRoot)),
      /wrapper source must be the exact canonical path/u,
    );

    unlinkSync(exactPath);
    symlinkSync(payloadPath, exactPath);
    assert.match(output(run(exactPath)), /contains a symlink component/u);

    unlinkSync(exactPath);
    const fifo = spawnSync('mkfifo', [exactPath], { encoding: 'utf8' });
    assert.equal(fifo.status, 0, fifo.stderr);
    const writer = spawn('sh', ['-c', 'exec cat "$1" > "$2"', 'writer', payloadPath, exactPath], {
      stdio: 'ignore',
    });
    assert.match(output(run(exactPath)), /must be a regular file/u);
    writer.kill();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

assertU5aSources();
requireText('docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-04.md', [
  '`global_admin` auth profile',
  'post-matrix exact strict+FORCE',
  'double-seed convergence',
  'authenticated media',
  'task #800',
]);

if (process.argv.includes('--self-test')) {
  runU5aCheckerMutationSelfTest();
  runWrapperSourceGuardSelfTest();
  console.log('check-owner-ready-test-integration self-test: OK');
} else {
  console.log('check-owner-ready-test-integration: OK');
}
