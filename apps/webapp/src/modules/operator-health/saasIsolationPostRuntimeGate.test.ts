import { describe, expect, it, vi } from 'vitest';
import type { SaasIsolationHealthPayload } from './saasIsolationDiagnostics';
import { runSaasIsolationPostRuntimeGate } from './saasIsolationPostRuntimeGate';

const STARTED_AT = '2026-07-16T08:00:00.000Z';
const FINISHED_AT = '2026-07-16T08:05:00.000Z';
const COVERAGE_ID = '10000000-0000-4000-8000-000000000001';
const SERVICES = ['webapp', 'integrator', 'worker', 'scheduler', 'media_worker', 'cron'] as const;

function health(
  overrides: Partial<SaasIsolationHealthPayload> = {},
): SaasIsolationHealthPayload {
  return {
    schemaVersion: 3,
    status: 'okay',
    statusReasons: [],
    active: { unexplained: 0, explained: 0, occurrences: 0 },
    resolved: { unexplained: 0, explained: 0, occurrences: 0 },
    byClass: {},
    events: [],
    lastEventAt: null,
    lastCoverage: {
      id: COVERAGE_ID,
      status: 'complete',
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      servicesChecked: [...SERVICES],
      checksCount: 8,
      unexpectedErrorsCount: 0,
    },
    coverageFresh: true,
    coverageComplete: true,
    missingServices: [],
    trend: {
      asOf: FINISHED_AT,
      current24Hours: 0,
      previous24Hours: 0,
      delta: 0,
      daily7Days: [
        '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      ].map((date) => ({ date, count: 0 })),
    },
    ...overrides,
  };
}

function deps(reads: SaasIsolationHealthPayload[]) {
  return {
    readHealth: vi.fn(async () => {
      const value = reads.shift();
      if (!value) throw new Error('unexpected_read');
      return value;
    }),
    recordCoverage: vi.fn(async () => undefined),
    now: () => new Date(FINISHED_AT),
    randomId: () => COVERAGE_ID,
  };
}

describe('runSaasIsolationPostRuntimeGate', () => {
  it('records and rereads complete real runtime coverage without deleting events', async () => {
    const gateDeps = deps([
      health({ lastCoverage: null, coverageComplete: false, coverageFresh: false }),
      health({ status: 'incomplete', active: { unexplained: 0, explained: 1, occurrences: 1 } }),
    ]);

    await expect(runSaasIsolationPostRuntimeGate(STARTED_AT, 8, gateDeps)).resolves.toEqual({
      status: 'incomplete',
      activeExplained: 1,
    });
    expect(gateDeps.recordCoverage).toHaveBeenCalledWith({
      id: COVERAGE_ID,
      status: 'complete',
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      servicesChecked: [...SERVICES],
      checksCount: 8,
      unexpectedErrorsCount: 0,
    });
  });

  it('fails before the coverage write when an unexplained event is already active', async () => {
    const gateDeps = deps([
      health({ active: { unexplained: 1, explained: 0, occurrences: 1 } }),
    ]);

    await expect(runSaasIsolationPostRuntimeGate(STARTED_AT, 8, gateDeps))
      .rejects.toThrow('saas_isolation_post_runtime_gate_active_unexplained_before_coverage');
    expect(gateDeps.recordCoverage).not.toHaveBeenCalled();
  });

  it('fails when a runtime event appears during coverage or the exact coverage reread is missing', async () => {
    const eventDeps = deps([
      health(),
      health({ active: { unexplained: 1, explained: 0, occurrences: 1 } }),
    ]);
    await expect(runSaasIsolationPostRuntimeGate(STARTED_AT, 8, eventDeps))
      .rejects.toThrow('saas_isolation_post_runtime_gate_active_unexplained_after_coverage');

    const missingCoverageDeps = deps([
      health(),
      health({ lastCoverage: null, coverageComplete: false }),
    ]);
    await expect(runSaasIsolationPostRuntimeGate(STARTED_AT, 8, missingCoverageDeps))
      .rejects.toThrow('saas_isolation_post_runtime_gate_coverage_missing');
  });

  it('rejects an invalid time or a partial check count before any write', async () => {
    const invalidTimeDeps = deps([]);
    await expect(runSaasIsolationPostRuntimeGate('not-a-time', 8, invalidTimeDeps))
      .rejects.toThrow('saas_isolation_post_runtime_gate_invalid_started_at');
    await expect(runSaasIsolationPostRuntimeGate(STARTED_AT, 5, invalidTimeDeps))
      .rejects.toThrow('saas_isolation_post_runtime_gate_invalid_checks_count');
    expect(invalidTimeDeps.recordCoverage).not.toHaveBeenCalled();
  });
});
