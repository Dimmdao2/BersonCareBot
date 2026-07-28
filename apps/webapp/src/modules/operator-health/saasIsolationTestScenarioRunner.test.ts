import { describe, expect, it, vi } from 'vitest';
import {
  emptySaasIsolationTrend,
  type SaasIsolationHealthPayload,
} from './saasIsolationDiagnostics';
import {
  runSaasIsolationTestScenarios,
  type SaasIsolationTestScenarioState,
} from './saasIsolationTestScenarioRunner';

function health(
  state: Exclude<SaasIsolationTestScenarioState, 'clean'>,
): SaasIsolationHealthPayload {
  return {
    schemaVersion: 3,
    status: state,
    statusReasons:
      state === 'incomplete'
        ? ['coverage_services_missing']
        : state === 'critical'
          ? ['active_unexplained_event']
          : [],
    active:
      state === 'critical'
        ? { unexplained: 1, explained: 0, occurrences: 1 }
        : { unexplained: 0, explained: 0, occurrences: 0 },
    resolved: { unexplained: 0, explained: 0, occurrences: 0 },
    byClass: state === 'critical' ? { rls_denial: 1 } : {},
    events: [],
    lastEventAt: null,
    lastCoverage: null,
    coverageFresh: state === 'okay',
    coverageComplete: state !== 'incomplete',
    missingServices: state === 'incomplete' ? ['integrator'] : [],
    trend: emptySaasIsolationTrend(Date.parse('2026-07-16T00:00:00.000Z')),
  };
}

function fixture() {
  let state: SaasIsolationTestScenarioState = 'clean';
  const apply = vi.fn(async (next: SaasIsolationTestScenarioState) => {
    state = next;
  });
  const baseline = health('okay');
  return {
    apply,
    readHealth: vi.fn(async () => {
      if (state === 'clean') return baseline;
      const scenario = health(state);
      if (state === 'critical') return scenario;
      return {
        ...scenario,
        active: baseline.active,
        resolved: baseline.resolved,
        byClass: baseline.byClass,
      };
    }),
    readFixtureCounts: vi.fn(async () => ({
      eventRows: state === 'critical' ? 1 : 0,
      hourlyRows: state === 'critical' ? 1 : 0,
      coverageRows: state === 'clean' ? 0 : 1,
    })),
  };
}

describe('E1 reversible TEST scenario runner', () => {
  it('checks okay, incomplete and critical, then cleans reserved rows', async () => {
    const deps = fixture();
    await expect(runSaasIsolationTestScenarios(deps)).resolves.toBeUndefined();
    expect(deps.apply.mock.calls.map(([state]) => state)).toEqual([
      'clean',
      'okay',
      'incomplete',
      'critical',
      'clean',
    ]);
    expect(await deps.readFixtureCounts()).toEqual({
      eventRows: 0,
      hourlyRows: 0,
      coverageRows: 0,
    });
  });

  it('cleans reserved rows in finally after an injected failure', async () => {
    const deps = fixture();
    await expect(
      runSaasIsolationTestScenarios(deps, { injectFailureAfter: 'incomplete' }),
    ).rejects.toThrow('saas_isolation_test_scenario_injected_failure:incomplete');
    expect(deps.apply.mock.calls.map(([state]) => state)).toEqual([
      'clean',
      'okay',
      'incomplete',
      'clean',
    ]);
    expect(await deps.readFixtureCounts()).toEqual({
      eventRows: 0,
      hourlyRows: 0,
      coverageRows: 0,
    });
  });

  it('fails closed when cleanup leaves any reserved row', async () => {
    const deps = fixture();
    deps.readFixtureCounts.mockResolvedValue({ eventRows: 1, hourlyRows: 0, coverageRows: 0 });
    await expect(runSaasIsolationTestScenarios(deps)).rejects.toThrow(
      'saas_isolation_test_scenario_cleanup_failed',
    );
  });

  it('proves fixture deltas without hiding a pre-existing real E1 event', async () => {
    let state: SaasIsolationTestScenarioState = 'clean';
    const realEvent = {
      eventClass: 'role_pool_mismatch' as const,
      sourceService: 'webapp' as const,
      sourceOperation: 'webapp_db_request' as const,
      explanationStatus: 'unexplained' as const,
      lifecycleStatus: 'active' as const,
      occurrenceCount: 14,
      firstSeenAt: '2026-07-17T02:11:17.374Z',
      lastSeenAt: '2026-07-17T02:14:13.750Z',
    };
    const baseline: SaasIsolationHealthPayload = {
      ...health('critical'),
      active: { unexplained: 1, explained: 0, occurrences: 14 },
      byClass: { role_pool_mismatch: 14 },
      events: [realEvent],
      lastEventAt: realEvent.lastSeenAt,
      coverageComplete: true,
      coverageFresh: true,
    };
    const deps = {
      apply: vi.fn(async (next: SaasIsolationTestScenarioState) => {
        state = next;
      }),
      readHealth: vi.fn(async (): Promise<SaasIsolationHealthPayload> => {
        if (state === 'clean') return baseline;
        if (state === 'critical') {
          return {
            ...baseline,
            active: { unexplained: 2, explained: 0, occurrences: 15 },
            byClass: { role_pool_mismatch: 14, rls_denial: 1 },
          };
        }
        if (state === 'incomplete') {
          return {
            ...baseline,
            statusReasons: ['active_unexplained_event', 'coverage_services_missing'],
            coverageComplete: false,
            missingServices: ['integrator'],
          };
        }
        return baseline;
      }),
      readFixtureCounts: vi.fn(async () => ({
        eventRows: state === 'critical' ? 1 : 0,
        hourlyRows: state === 'critical' ? 1 : 0,
        coverageRows: state === 'clean' ? 0 : 1,
      })),
    };

    await expect(runSaasIsolationTestScenarios(deps)).resolves.toBeUndefined();
    expect((await deps.readHealth()).active).toEqual(baseline.active);
    expect((await deps.readHealth()).byClass).toEqual({ role_pool_mismatch: 14 });
  });

  it('fails if the okay fixture changes the real E1 event component', async () => {
    const deps = fixture();
    deps.readHealth.mockResolvedValueOnce(health('okay')).mockResolvedValueOnce({
      ...health('okay'),
      active: { unexplained: 1, explained: 0, occurrences: 1 },
    });

    await expect(runSaasIsolationTestScenarios(deps)).rejects.toThrow(
      'saas_isolation_test_scenario_okay_event_delta_failed',
    );
  });

  it('fails if cleanup does not restore the baseline E1 event component', async () => {
    const deps = fixture();
    deps.readHealth
      .mockResolvedValueOnce(health('okay'))
      .mockResolvedValueOnce(health('okay'))
      .mockResolvedValueOnce(health('incomplete'))
      .mockResolvedValueOnce(health('critical'))
      .mockResolvedValueOnce({
        ...health('okay'),
        active: { unexplained: 1, explained: 0, occurrences: 1 },
      });

    await expect(runSaasIsolationTestScenarios(deps)).rejects.toThrow(
      'saas_isolation_test_scenario_cleanup_health_failed',
    );
  });
});
