import { pathToFileURL } from 'node:url';
import { getSaasIsolationOperatorPool } from '../src/infra/db/saasIsolationTelemetry';
import { runtimeSaasIsolationDiagnostics } from '../src/infra/saasIsolationReporterRuntime';
import {
  assertSaasIsolationTestFixtureClean,
  runSaasIsolationTestScenarios,
  type SaasIsolationTestScenarioState,
} from '../src/modules/operator-health/saasIsolationTestScenarioRunner';
import { parseSaasIsolationTestScenarioCliArgs } from '../src/modules/operator-health/saasIsolationTestScenarioCliArgs';

const REQUIRED_DATABASE = 'bersoncarebot_test';

async function assertExactTestOperator(): Promise<void> {
  const result = await getSaasIsolationOperatorPool().query<{
    database_name: unknown;
    login_role: unknown;
    rolsuper: unknown;
    rolbypassrls: unknown;
    operator_member: unknown;
    app_role_member: unknown;
  }>(`
    SELECT current_database() AS database_name, current_user AS login_role,
           role.rolsuper, role.rolbypassrls,
           pg_has_role(current_user, 'saas_telemetry_operator', 'MEMBER') AS operator_member,
           (pg_has_role(current_user, 'app_owner', 'MEMBER')
             OR pg_has_role(current_user, 'app_staff', 'MEMBER')
             OR pg_has_role(current_user, 'app_patient', 'MEMBER')
             OR pg_has_role(current_user, 'app_worker', 'MEMBER')) AS app_role_member
    FROM pg_roles role WHERE role.rolname = current_user
  `);
  const row = result.rows[0];
  if (
    !row ||
    row.database_name !== REQUIRED_DATABASE ||
    typeof row.login_role !== 'string' ||
    row.rolsuper !== false ||
    row.rolbypassrls !== false ||
    row.operator_member !== true ||
    row.app_role_member !== false
  ) {
    throw new Error('saas_isolation_test_scenario_operator_preflight_failed');
  }
}

async function apply(state: SaasIsolationTestScenarioState): Promise<void> {
  await getSaasIsolationOperatorPool().query('SELECT app.set_saas_isolation_test_scenario($1)', [
    state,
  ]);
}

async function readFixtureCounts() {
  const result = await getSaasIsolationOperatorPool().query<{
    event_rows: unknown;
    hourly_rows: unknown;
    coverage_rows: unknown;
  }>('SELECT * FROM app.read_saas_isolation_test_scenario_fixture_counts()');
  const row = result.rows[0];
  if (!row) throw new Error('saas_isolation_test_scenario_counts_missing');
  return {
    eventRows: Number(row.event_rows),
    hourlyRows: Number(row.hourly_rows),
    coverageRows: Number(row.coverage_rows),
  };
}

async function main(): Promise<void> {
  const options = parseSaasIsolationTestScenarioCliArgs(process.argv.slice(2));
  try {
    await assertExactTestOperator();
    if (options.assertCleanOnly) {
      assertSaasIsolationTestFixtureClean(await readFixtureCounts());
      process.stdout.write('saas_isolation_test_scenario_final_clean\n');
      return;
    }
    await runSaasIsolationTestScenarios(
      {
        apply,
        readHealth: () => runtimeSaasIsolationDiagnostics.readHealth(),
        readFixtureCounts,
      },
      options.proveInjectedFailureCleanup ? { injectFailureAfter: 'incomplete' } : {},
    );
    process.stdout.write('saas_isolation_test_scenarios_passed_and_clean\n');
  } catch (error) {
    if (
      options.proveInjectedFailureCleanup &&
      error instanceof Error &&
      error.message === 'saas_isolation_test_scenario_injected_failure:incomplete'
    ) {
      process.stdout.write('saas_isolation_test_scenario_injected_failure_cleaned\n');
      return;
    }
    throw error;
  } finally {
    await getSaasIsolationOperatorPool().end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'saas_isolation_test_scenario_failed'}\n`,
    );
    process.exitCode = 1;
  });
}
