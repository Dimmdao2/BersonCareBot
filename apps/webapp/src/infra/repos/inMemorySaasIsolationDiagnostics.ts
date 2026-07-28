import type {
  SaasIsolationCoverageRun,
  SaasIsolationDiagnosticsPort,
  SaasIsolationEventAggregate,
} from '@/modules/operator-health/saasIsolationDiagnostics';
import { emptySaasIsolationTrend } from '@/modules/operator-health/saasIsolationDiagnostics';

const events: SaasIsolationEventAggregate[] = [];
let coverage: SaasIsolationCoverageRun | null = null;
const coverageById = new Map<string, string>();

export const inMemorySaasIsolationDiagnosticsPort: SaasIsolationDiagnosticsPort = {
  async recordEvent(input) {
    const existing = events.find(
      (row) =>
        row.eventClass === input.eventClass &&
        row.sourceService === input.sourceService &&
        row.sourceOperation === input.sourceOperation &&
        row.lifecycleStatus === 'active' &&
        row.explanationStatus === (input.explanationStatus ?? 'unexplained'),
    );
    if (existing) {
      existing.occurrenceCount += 1;
      existing.lastSeenAt = new Date().toISOString();
      return;
    }
    events.push({
      eventClass: input.eventClass,
      sourceService: input.sourceService,
      sourceOperation: input.sourceOperation,
      explanationStatus: input.explanationStatus ?? 'unexplained',
      lifecycleStatus: 'active',
      occurrenceCount: 1,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  },
  async recordCoverageAndResolve(input) {
    const serialized = JSON.stringify(input);
    const existing = coverageById.get(input.id);
    if (existing !== undefined) {
      if (existing !== serialized) throw new Error('saas_isolation_coverage_id_conflict');
      return;
    }
    coverageById.set(input.id, serialized);
    coverage = { ...input };
    if (input.status !== 'complete') return;
    for (const row of events) {
      if (
        row.lifecycleStatus === 'active' &&
        row.lastSeenAt < input.startedAt &&
        input.servicesChecked.includes(row.sourceService)
      ) {
        row.lifecycleStatus = 'resolved';
      }
    }
  },
  async listEventAggregates() {
    return events.map((row) => ({ ...row }));
  },
  async getLastCoverageRun() {
    return coverage ? { ...coverage, servicesChecked: [...coverage.servicesChecked] } : null;
  },
  async getTrend() {
    const empty = emptySaasIsolationTrend();
    return {
      asOf: empty.asOf,
      current24Hours: 0,
      previous24Hours: 0,
      daily7Days: empty.daily7Days,
    };
  },
};
