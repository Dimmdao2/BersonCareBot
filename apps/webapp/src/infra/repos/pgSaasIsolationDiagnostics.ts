import { sql } from 'drizzle-orm';
import {
  getSaasIsolationEventWriterPool,
  getSaasIsolationOperatorPool,
} from '@/infra/db/saasIsolationTelemetry';
import { runPgPoolSql } from '@/infra/db/runWebappSql';
import type {
  RecordSaasIsolationCoverageInput,
  ReportSaasIsolationEventInput,
  SaasIsolationDiagnosticsPort,
} from '@/modules/operator-health/saasIsolationDiagnostics';

function toIso(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

export const pgSaasIsolationDiagnosticsPort: SaasIsolationDiagnosticsPort = {
  async recordEvent(input: ReportSaasIsolationEventInput): Promise<void> {
    await runPgPoolSql(
      getSaasIsolationEventWriterPool(),
      sql`SELECT app.report_saas_isolation_event(${input.eventClass}, ${input.sourceService}, ${input.sourceOperation}, ${input.explanationStatus ?? 'unexplained'})`,
    );
  },

  async recordCoverageAndResolve(input: RecordSaasIsolationCoverageInput): Promise<void> {
    await runPgPoolSql(
      getSaasIsolationOperatorPool(),
      sql`SELECT app.record_saas_isolation_coverage(${input.id}, ${input.status}, ${input.startedAt}, ${input.finishedAt}, ${sql.param(input.servicesChecked)}, ${input.checksCount}, ${input.unexpectedErrorsCount})`,
    );
  },

  async listEventAggregates(): Promise<unknown[]> {
    const result = await runPgPoolSql<{
      event_class: unknown;
      source_service: unknown;
      source_operation: unknown;
      explanation_status: unknown;
      lifecycle_status: unknown;
      occurrence_count: unknown;
      first_seen_at: unknown;
      last_seen_at: unknown;
    }>(getSaasIsolationOperatorPool(), sql`SELECT * FROM app.read_saas_isolation_events()`);
    return result.rows.map((row) => ({
      eventClass: row.event_class,
      sourceService: row.source_service,
      sourceOperation: row.source_operation,
      explanationStatus: row.explanation_status,
      lifecycleStatus: row.lifecycle_status,
      occurrenceCount: row.occurrence_count,
      firstSeenAt: toIso(row.first_seen_at),
      lastSeenAt: toIso(row.last_seen_at),
    }));
  },

  async getLastCoverageRun(): Promise<unknown | null> {
    const result = await runPgPoolSql<{
      id: unknown;
      status: unknown;
      started_at: unknown;
      finished_at: unknown;
      services_checked: unknown;
      checks_count: unknown;
      unexpected_errors_count: unknown;
    }>(getSaasIsolationOperatorPool(), sql`SELECT * FROM app.read_last_saas_isolation_coverage()`);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      startedAt: toIso(row.started_at),
      finishedAt: toIso(row.finished_at),
      servicesChecked: row.services_checked,
      checksCount: row.checks_count,
      unexpectedErrorsCount: row.unexpected_errors_count,
    };
  },

  async getTrend(): Promise<unknown> {
    const result = await runPgPoolSql<{
      as_of: unknown;
      current_24_hours: unknown;
      previous_24_hours: unknown;
      daily_7_days: unknown;
    }>(getSaasIsolationOperatorPool(), sql`SELECT * FROM app.read_saas_isolation_trend()`);
    const row = result.rows[0];
    if (!row) throw new Error('saas_isolation_trend_missing');
    return {
      asOf: toIso(row.as_of),
      current24Hours: Number(row.current_24_hours),
      previous24Hours: Number(row.previous_24_hours),
      daily7Days: row.daily_7_days,
    };
  },
};
