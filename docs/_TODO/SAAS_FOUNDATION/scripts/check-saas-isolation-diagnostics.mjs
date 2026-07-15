#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const files = {
  migration: 'apps/webapp/db/drizzle-migrations/0185_saas_isolation_diagnostics.sql',
  overlay: 'deploy/postgres/saas-isolation-telemetry.sql',
  model: 'apps/webapp/src/modules/operator-health/saasIsolationDiagnostics.ts',
  repository: 'apps/webapp/src/infra/repos/pgSaasIsolationDiagnostics.ts',
  cli: 'apps/webapp/scripts/report-saas-isolation-diagnostics.ts',
  ui: 'apps/webapp/src/app/app/settings/SystemHealthSection.tsx',
  testScenarioRunner: 'apps/webapp/src/modules/operator-health/saasIsolationTestScenarioRunner.ts',
  testScenarioCli: 'apps/webapp/scripts/run-saas-isolation-test-scenarios.ts',
  testScenarioCliArgs:
    'apps/webapp/src/modules/operator-health/saasIsolationTestScenarioCliArgs.ts',
  reporter: 'apps/webapp/src/infra/saasIsolationReporterRuntime.ts',
  pools: 'apps/webapp/src/infra/db/saasIsolationTelemetry.ts',
  webappTelemetryPoolProvider: 'apps/webapp/src/infra/db/saasIsolationTelemetryPoolProvider.ts',
  integratorTelemetryConsumer: 'apps/integrator/src/infra/observability/saasIsolationTelemetry.ts',
  integratorPoolProvider: 'apps/integrator/src/infra/db/integratorPoolProvider.ts',
  mediaTelemetryConsumer: 'apps/media-worker/src/saasIsolationTelemetry.ts',
  mediaPoolProvider: 'apps/media-worker/src/poolProvider.ts',
  dbChokepointGuard: 'scripts/check-db-chokepoint.mjs',
  sharedReporter: 'packages/db-principal/src/index.ts',
  webappDeploy: 'deploy/host/deploy-test-saas.sh',
  operatorProvisioner: 'deploy/host/render-saas-isolation-operator-provisioning.mjs',
  codeOnlyDeploy: 'deploy/host/deploy-test.sh',
  integrator: 'apps/integrator/src/app/server.ts',
  worker: 'apps/integrator/src/infra/runtime/worker/main.ts',
  scheduler: 'apps/integrator/src/infra/runtime/scheduler/main.ts',
  mediaWorker: 'apps/media-worker/src/main.ts',
  cron: 'apps/webapp/src/app-layer/operator-health/recordOperatorCronJobTick.ts',
  rehearsal: 'docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-saas-isolation-diagnostics.mjs',
};

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`${label}: missing ${fragment}`);
}
function requireOrder(text, fragments, label) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, cursor + 1);
    if (next < 0 || next <= cursor) throw new Error(`${label}: order/missing ${fragment}`);
    cursor = next;
  }
}
function shellFunction(text, name) {
  const start = text.indexOf(`${name}(){`);
  if (start < 0) throw new Error(`missing shell function ${name}`);
  const next = text.indexOf('\n}\n', start);
  if (next < 0) throw new Error(`unterminated shell function ${name}`);
  return text.slice(start, next + 3);
}

async function main() {
  const loaded = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
    ),
  );
  for (const forbidden of ['organization_id', 'patient_id', 'user_id', 'payload', 'signature']) {
    if (loaded.migration.includes(`"${forbidden}"`))
      throw new Error(`migration unsafe column: ${forbidden}`);
  }
  for (const fragment of [
    'CREATE ROLE saas_telemetry_owner NOLOGIN',
    'NOBYPASSRLS',
    'SECURITY DEFINER',
    'REVOKE ALL ON TABLE',
    'invalid_saas_isolation_service_operation',
    'telemetry_least_privilege_verified',
    'source_service = ANY(v_distinct_services)',
    'CREATE ROLE saas_telemetry_operator NOLOGIN',
    'telemetry_operator_role_is_separate',
    'saas_isolation_coverage_id_conflict',
    'rolcanlogin AND rolinherit AND NOT rolsuper AND NOT rolbypassrls',
    "NOT pg_has_role(:'telemetry_operator_runtime_role', 'app_staff', 'MEMBER')",
    "NOT has_function_privilege(:'telemetry_webapp_runtime_role', 'app.read_saas_isolation_events()'",
    "NOT has_table_privilege(:'telemetry_operator_runtime_role', 'public.saas_isolation_events', 'SELECT')",
    "NOT has_function_privilege(:'telemetry_operator_runtime_role', 'app.report_saas_isolation_event(text,text,text,text)', 'EXECUTE')",
    "has_function_privilege(:'telemetry_operator_runtime_role', 'app.read_saas_isolation_events()'",
    'FROM pg_auth_members membership',
    "member_role.rolname <> :'telemetry_operator_runtime_role'",
    'FROM app_owner, app_staff, app_patient, app_worker',
    'telemetry_operator_sole_effective_member_verified',
    'app.read_saas_isolation_trend()',
    "bucket_start < v_bucket_start - interval '8 days'",
    "current_database() <> 'bersoncarebot_test'",
    'test-fixture:v3:%',
    'anchor AS MATERIALIZED',
    'as_of timestamptz',
    'hourly.bucket_start <= bounds.current_hour',
    "date_trunc('day', as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    'app.read_saas_isolation_test_scenario_fixture_counts()',
  ])
    requireText(loaded.overlay, fragment, 'overlay');
  for (const service of ['webapp', 'integrator', 'worker', 'scheduler', 'media_worker', 'cron']) {
    requireText(loaded.model, `"${service}"`, 'required service inventory');
  }
  requireText(
    loaded.model,
    'invalid_saas_isolation_complete_coverage',
    'complete coverage fail closed',
  );
  for (const fragment of [
    'current24Hours',
    'previous24Hours',
    'daily7Days',
    'validateSaasIsolationTrend',
  ]) {
    requireText(loaded.model, fragment, 'shared trend contract');
  }
  requireText(loaded.repository, 'app.read_saas_isolation_trend()', 'operator trend read');
  requireText(loaded.ui, 'Сигналы изоляции за 7 дней', 'seven-day operator UI');
  requireText(loaded.cli, 'state: enumValue(TEST_SCENARIOS', 'closed TEST scenario CLI');
  for (const fragment of [
    'finally {',
    "await deps.apply('clean')",
    'assertSaasIsolationTestFixtureClean(await deps.readFixtureCounts())',
  ])
    requireText(loaded.testScenarioRunner, fragment, 'TEST scenario guaranteed cleanup');
  for (const fragment of [
    "const REQUIRED_DATABASE = 'bersoncarebot_test'",
    'saas_telemetry_operator',
    'parseSaasIsolationTestScenarioCliArgs(process.argv.slice(2))',
    'saas_isolation_test_scenario_final_clean',
    'saas_isolation_test_scenario_operator_preflight_failed',
  ])
    requireText(loaded.testScenarioCli, fragment, 'TEST scenario exact operator wrapper');
  for (const fragment of [
    "rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs",
    '--prove-cleanup-on-injected-failure',
    '--assert-clean-only',
  ])
    requireText(loaded.testScenarioCliArgs, fragment, 'TEST scenario CLI argument contract');
  requireText(loaded.reporter, 'MAX_QUEUE = 64', 'bounded reporter');
  requireText(loaded.reporter, 'CIRCUIT_OPEN_MS', 'circuit breaker');
  requireText(loaded.reporter, 'Promise.race', 'total timeout');
  requireText(loaded.pools, 'SAAS_ISOLATION_OPERATOR_DATABASE_URL', 'separate operator connection');
  for (const [provider, factory] of [
    ['webappTelemetryPoolProvider', 'createSaasIsolationTelemetryPoolProvider'],
    ['integratorPoolProvider', 'createIntegratorSaasIsolationTelemetryPoolProvider'],
    ['mediaPoolProvider', 'createMediaWorkerSaasIsolationTelemetryPoolProvider'],
  ]) {
    requireText(loaded[provider], factory, `${provider} named telemetry provider`);
    requireText(loaded[provider], 'max: 1', `${provider} bounded telemetry pool`);
    requireText(loaded[provider], 'query_timeout: 200', `${provider} driver query bound`);
  }
  for (const consumer of ['pools', 'integratorTelemetryConsumer', 'mediaTelemetryConsumer']) {
    if (/\bnew\s+(?:pg\.)?(?:Pg)?Pool\b/.test(loaded[consumer])) {
      throw new Error(`${consumer} creates Pool outside a named provider`);
    }
  }
  requireText(
    loaded.dbChokepointGuard,
    '"apps/webapp/src/infra/db/saasIsolationTelemetryPoolProvider.ts"',
    'narrow T0 provider inventory',
  );
  requireText(
    loaded.sharedReporter,
    'if (!isRecognizedSaasIsolationFailure(error)) return',
    'background false-positive guard',
  );
  for (const fragment of [
    'ambient_read_allowed',
    'ambient_coverage_allowed',
    'operator_event_write_allowed',
    'concurrentWriter()',
    'occurrence_count',
    'saas_isolation_coverage_id_conflict',
    'non-isolation business failure reached telemetry writer',
    'stale_operator_membership_survived',
    'stale_operator_read_allowed',
    'all_six_classes_exact_plus_one',
    'trend_boundary_future_exclusion_and_exact_utc_dates',
    'non_test_scenario_allowed',
    'non_test_scenario_counts_allowed',
  ])
    requireText(loaded.rehearsal, fragment, 'PostgreSQL rehearsal proof');
  for (const [family, fragment] of [
    ['integrator', 'reportIntegratorIsolationFailure'],
    ['worker', 'reportWorkerQueueIsolationFailure'],
    ['scheduler', 'reportSchedulerLockIsolationFailure'],
    ['mediaWorker', 'isolationTelemetry.report'],
    ['cron', 'sourceService: "cron"'],
  ])
    requireText(loaded[family], fragment, `${family} native instrumentation`);
  requireOrder(
    loaded.cron,
    [
      '} catch (err) {',
      'isRecognizedSaasIsolationFailure(err)',
      'classifySaasIsolationFailure(err)',
    ],
    'cron reports only a caught status-write isolation failure',
  );
  if (loaded.cron.includes('isRecognizedSaasIsolationFailure(input.error)')) {
    throw new Error('cron must not infer isolation telemetry from the business result');
  }
  const installer = shellFunction(loaded.webappDeploy, 'install_saas_isolation_telemetry_overlay');
  requireOrder(
    installer,
    [
      'discover_webapp_bootstrap_base_role',
      'discover_api_runtime_role',
      'discover_saas_isolation_operator_role',
      'telemetry_webapp_runtime_role="$webapp_runtime_role"',
      'telemetry_api_runtime_role="$api_runtime_role"',
      'telemetry_operator_runtime_role="$operator_runtime_role"',
      'SAAS_ISOLATION_TELEMETRY',
    ],
    'telemetry role discovery/invocation',
  );
  const provisioner = shellFunction(loaded.webappDeploy, 'provision_saas_isolation_operator_login');
  for (const fragment of [
    'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
    'bersoncarebot_test',
    'password must be at least 32 bytes',
    'refusing to render credential-bearing SQL to a terminal',
    'LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    'ALTER ROLE ${roleIdentifier} PASSWORD',
    'FROM pg_auth_members membership',
    'REVOKE %I FROM %I',
  ])
    requireText(loaded.operatorProvisioner, fragment, 'operator login provisioner');
  requireOrder(
    provisioner,
    ['SAAS_ISOLATION_OPERATOR_PROVISIONER', 'sudo -u postgres psql'],
    'protected diagnostic login provisioning pipeline',
  );
  const closure = shellFunction(loaded.webappDeploy, 'run_strict_post_migration_closure');
  const scenarioProof = shellFunction(
    loaded.webappDeploy,
    'run_saas_isolation_test_scenario_proof',
  );
  for (const fragment of [
    '"--execute"',
    '"--execute --prove-cleanup-on-injected-failure"',
    '"--execute --assert-clean-only"',
    'diagnostics:saas-isolation:test-scenarios',
  ])
    requireText(scenarioProof, fragment, 'canonical TEST diagnostic scenario proof');
  requireOrder(
    closure,
    [
      'install_p0_5b_runtime_wall',
      'install_p2_b_protected_principal_context',
      'provision_saas_isolation_operator_login',
      'install_saas_isolation_telemetry_overlay',
      'run_saas_isolation_test_scenario_proof',
      'apply_test_strict_rls_finalizer',
    ],
    'telemetry overlay before strict finalizer execution',
  );
  requireOrder(
    loaded.codeOnlyDeploy,
    [
      'STRICT_CLOSURE=deploy/host/deploy-test-saas.sh',
      '"$DEPLOY_REPO/$STRICT_CLOSURE" --strict-preflight',
    ],
    'code-only deploy delegates strict closure',
  );
  if (process.argv.includes('--self-test')) {
    for (const [mutated, fragment, label] of [
      [
        loaded.overlay.replaceAll('SECURITY DEFINER', 'SECURITY INVOKER'),
        'SECURITY DEFINER',
        'unsafe ownership',
      ],
      [
        loaded.overlay.replaceAll('hourly.bucket_start <= bounds.current_hour', 'TRUE'),
        'hourly.bucket_start <= bounds.current_hour',
        'future trend bucket',
      ],
      [
        loaded.testScenarioRunner.replace('finally {', 'if (false) {'),
        'finally {',
        'missing scenario cleanup finally',
      ],
      [
        loaded.testScenarioCliArgs.replace(
          "rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs",
          'rawArgs',
        ),
        "rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs",
        'pnpm argument separator regression',
      ],
      [
        scenarioProof.replace('"--execute --prove-cleanup-on-injected-failure"', '"--execute"'),
        '"--execute --prove-cleanup-on-injected-failure"',
        'missing injected-failure cleanup proof',
      ],
      [
        closure.replace('run_saas_isolation_test_scenario_proof', 'true'),
        'run_saas_isolation_test_scenario_proof',
        'orphan TEST scenario wrapper',
      ],
    ]) {
      let rejected = false;
      try {
        requireText(mutated, fragment, `self-test ${label}`);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error(`self-test failed to reject ${label}`);
    }
    process.stdout.write('SaaS isolation diagnostics checker self-test: PASS\n');
    return;
  }
  process.stdout.write('SaaS isolation diagnostics static contract: PASS\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
