import type { SaasIsolationHealthPayload } from './saasIsolationDiagnostics';

export const SAAS_ISOLATION_TEST_SCENARIO_STATES = ['okay', 'incomplete', 'critical'] as const;
export type SaasIsolationTestScenarioState =
  | (typeof SAAS_ISOLATION_TEST_SCENARIO_STATES)[number]
  | 'clean';

export type SaasIsolationTestFixtureCounts = {
  eventRows: number;
  hourlyRows: number;
  coverageRows: number;
};

export type SaasIsolationTestScenarioDeps = {
  apply(state: SaasIsolationTestScenarioState): Promise<void>;
  readHealth(): Promise<SaasIsolationHealthPayload>;
  readFixtureCounts(): Promise<SaasIsolationTestFixtureCounts>;
};

export function assertSaasIsolationTestFixtureClean(counts: SaasIsolationTestFixtureCounts): void {
  if (counts.eventRows !== 0 || counts.hourlyRows !== 0 || counts.coverageRows !== 0) {
    throw new Error('saas_isolation_test_scenario_cleanup_failed');
  }
}

function assertState(
  state: Exclude<SaasIsolationTestScenarioState, 'clean'>,
  health: SaasIsolationHealthPayload,
): void {
  if (health.status !== state)
    throw new Error(`saas_isolation_test_scenario_${state}_status_failed`);
  if (state === 'okay' && (health.active.occurrences !== 0 || !health.coverageComplete)) {
    throw new Error('saas_isolation_test_scenario_okay_zero_failed');
  }
  if (state === 'incomplete' && !health.statusReasons.includes('coverage_services_missing')) {
    throw new Error('saas_isolation_test_scenario_incomplete_reason_failed');
  }
  if (state === 'critical' && health.active.unexplained < 1) {
    throw new Error('saas_isolation_test_scenario_critical_unexplained_failed');
  }
}

export async function runSaasIsolationTestScenarios(
  deps: SaasIsolationTestScenarioDeps,
  options: { injectFailureAfter?: Exclude<SaasIsolationTestScenarioState, 'clean'> } = {},
): Promise<void> {
  try {
    await deps.apply('clean');
    assertSaasIsolationTestFixtureClean(await deps.readFixtureCounts());
    for (const state of SAAS_ISOLATION_TEST_SCENARIO_STATES) {
      await deps.apply(state);
      assertState(state, await deps.readHealth());
      if (options.injectFailureAfter === state) {
        throw new Error(`saas_isolation_test_scenario_injected_failure:${state}`);
      }
    }
  } finally {
    await deps.apply('clean');
    assertSaasIsolationTestFixtureClean(await deps.readFixtureCounts());
  }
}
