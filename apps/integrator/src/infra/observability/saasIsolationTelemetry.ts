import {
  createSaasIsolationBackgroundReporter,
  type SaasIsolationBackgroundReporter,
  type SaasIsolationBackgroundSource,
  type SaasIsolationTelemetryTransportStatus,
} from '@bersoncare/db-principal';
import {
  createIntegratorSaasIsolationTelemetryPoolProvider,
  withIntegratorSaasIsolationTelemetryClient,
} from '../db/integratorPoolProvider.js';
import { logger } from './logger.js';
import type { Pool } from 'pg';

let telemetryPool: ReturnType<typeof createIntegratorSaasIsolationTelemetryPoolProvider> | null =
  null;
function getTelemetryPool(): ReturnType<typeof createIntegratorSaasIsolationTelemetryPoolProvider> {
  const connectionString = (process.env.DATABASE_URL ?? '').trim();
  if (!connectionString) throw new Error('DATABASE_URL is required');
  telemetryPool ??= createIntegratorSaasIsolationTelemetryPoolProvider(connectionString);
  return telemetryPool;
}

function query(sql: string, values: readonly unknown[]): Promise<unknown> {
  return getTelemetryPool().query(sql, values as unknown[]);
}

export async function probeSaasIsolationTelemetryWriter(
  pool: Pick<Pool, 'connect'>,
  source: SaasIsolationBackgroundSource,
): Promise<void> {
  try {
    await withIntegratorSaasIsolationTelemetryClient(pool, async (client) => {
      try {
        await client.query('BEGIN');
        await client.query('SELECT app.report_saas_isolation_event($1, $2, $3, $4)', [
          // eslint-disable-next-line no-secrets/no-secrets -- closed telemetry enum, not credential material
          'unclassified_background_operation',
          source.service,
          source.operation,
          'explained',
        ]);
        await client.query('ROLLBACK');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The probe still fails; preserve only a redacted process-level status.
        }
        throw error;
      }
    });
  } catch {
    throw new Error('saas_isolation_telemetry_writer_probe_failed');
  }
}

function logTransportStatus(
  source: SaasIsolationBackgroundSource,
  status: SaasIsolationTelemetryTransportStatus,
): void {
  const fields = { sourceService: source.service, sourceOperation: source.operation, ...status };
  if (status.state === 'degraded') {
    logger.error({ saasIsolationTelemetry: fields }, 'SaaS isolation telemetry transport degraded');
  } else {
    logger.info({ saasIsolationTelemetry: fields }, 'SaaS isolation telemetry writer ready');
  }
}

function createReporter(source: SaasIsolationBackgroundSource): SaasIsolationBackgroundReporter {
  return createSaasIsolationBackgroundReporter({
    source,
    query,
    probe: () => probeSaasIsolationTelemetryWriter(getTelemetryPool(), source),
    onStatus: (status) => logTransportStatus(source, status),
  });
}

export const reportIntegratorIsolationFailure = createReporter({
  service: 'integrator',
  operation: 'integrator_http_request',
});
export const reportWorkerQueueIsolationFailure = createReporter({
  service: 'worker',
  operation: 'worker_queue_drain',
});
export const reportWorkerProjectionIsolationFailure = createReporter({
  service: 'worker',
  operation: 'worker_projection_delivery',
});
export const reportWorkerOutgoingIsolationFailure = createReporter({
  service: 'worker',
  operation: 'worker_outgoing_delivery',
});
export const reportSchedulerLockIsolationFailure = createReporter({
  service: 'scheduler',
  operation: 'scheduler_lock',
});
export const reportSchedulerDispatchIsolationFailure = createReporter({
  service: 'scheduler',
  operation: 'scheduler_dispatch_tick',
});

async function assertWriterReadyInLockedMode(
  reporter: SaasIsolationBackgroundReporter,
  processFamily: 'api' | 'worker' | 'scheduler',
): Promise<void> {
  if ((process.env.DB_PRINCIPAL_CONTEXT_MODE ?? '').trim() !== 'locked') return;
  if (await reporter.probeWriter()) return;
  throw new Error(`saas_isolation_telemetry_writer_unavailable:${processFamily}`);
}

export function assertApiIsolationTelemetryWriterReady(): Promise<void> {
  return assertWriterReadyInLockedMode(reportIntegratorIsolationFailure, 'api');
}

export function assertWorkerIsolationTelemetryWriterReady(): Promise<void> {
  return assertWriterReadyInLockedMode(reportWorkerQueueIsolationFailure, 'worker');
}

export function assertSchedulerIsolationTelemetryWriterReady(): Promise<void> {
  return assertWriterReadyInLockedMode(reportSchedulerLockIsolationFailure, 'scheduler');
}
