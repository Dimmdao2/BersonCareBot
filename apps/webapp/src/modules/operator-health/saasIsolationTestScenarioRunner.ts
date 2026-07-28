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

function sameCounts(
  left: Readonly<Record<string, number | undefined>>,
  right: Readonly<Record<string, number | undefined>>,
): boolean {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every(
    (key) => (left[key] ?? 0) === (right[key] ?? 0),
  );
}

function assertState(
  state: Exclude<SaasIsolationTestScenarioState, 'clean'>,
  health: SaasIsolationHealthPayload,
  baseline: SaasIsolationHealthPayload,
): void {
  const expectedUnexplained = baseline.active.unexplained + (state === 'critical' ? 1 : 0);
  const expectedOccurrences = baseline.active.occurrences + (state === 'critical' ? 1 : 0);
  const expectedByClass = {
    ...baseline.byClass,
    ...(state === 'critical' ? { rls_denial: (baseline.byClass.rls_denial ?? 0) + 1 } : {}),
  };
  if (
    health.active.unexplained !== expectedUnexplained ||
    health.active.explained !== baseline.active.explained ||
    health.active.occurrences !== expectedOccurrences ||
    !sameCounts(health.resolved, baseline.resolved) ||
    !sameCounts(health.byClass, expectedByClass)
  ) {
    throw new Error(`saas_isolation_test_scenario_${state}_event_delta_failed`);
  }
  if (state === 'okay' && (!health.coverageComplete || !health.coverageFresh)) {
    throw new Error('saas_isolation_test_scenario_okay_coverage_failed');
  }
  if (state === 'incomplete' && !health.statusReasons.includes('coverage_services_missing')) {
    throw new Error('saas_isolation_test_scenario_incomplete_reason_failed');
  }
  if (
    state === 'critical' &&
    (health.status !== 'critical' ||
      (health.byClass.rls_denial ?? 0) !== expectedByClass.rls_denial)
  ) {
    throw new Error('saas_isolation_test_scenario_critical_unexplained_failed');
  }
}

function assertEventComponentRestored(
  health: SaasIsolationHealthPayload,
  baseline: SaasIsolationHealthPayload,
): void {
  if (
    !sameCounts(health.active, baseline.active) ||
    !sameCounts(health.resolved, baseline.resolved) ||
    !sameCounts(health.byClass, baseline.byClass) ||
    health.lastEventAt !== baseline.lastEventAt
  ) {
    throw new Error('saas_isolation_test_scenario_cleanup_health_failed');
  }
}

export async function runSaasIsolationTestScenarios(
  deps: SaasIsolationTestScenarioDeps,
  options: { injectFailureAfter?: Exclude<SaasIsolationTestScenarioState, 'clean'> } = {},
): Promise<void> {
  let baseline: SaasIsolationHealthPayload | undefined;
  try {
    await deps.apply('clean');
    assertSaasIsolationTestFixtureClean(await deps.readFixtureCounts());
    baseline = await deps.readHealth();
    for (const state of SAAS_ISOLATION_TEST_SCENARIO_STATES) {
      await deps.apply(state);
      assertState(state, await deps.readHealth(), baseline);
      if (options.injectFailureAfter === state) {
        throw new Error(`saas_isolation_test_scenario_injected_failure:${state}`);
      }
    }
  } finally {
    await deps.apply('clean');
    assertSaasIsolationTestFixtureClean(await deps.readFixtureCounts());
    if (baseline) assertEventComponentRestored(await deps.readHealth(), baseline);
  }
}
