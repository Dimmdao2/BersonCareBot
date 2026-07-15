#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const requireText = (path, fragments) => {
  const text = read(path);
  const missing = fragments.filter((fragment) => !text.includes(fragment));
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
  'SAAS_TEST_FIXTURE_DOUBLE_RUN_PROOF=1',
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
requireText('docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-04.md', [
  '`global_admin` auth profile',
  'post-matrix exact strict+FORCE',
  'double-seed convergence',
  'authenticated media',
]);

console.log('check-owner-ready-test-integration: OK');
