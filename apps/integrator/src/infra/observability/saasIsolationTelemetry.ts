import {
  createSaasIsolationBackgroundReporter,
  type SaasIsolationBackgroundReporter,
  type SaasIsolationBackgroundSource,
  type SaasIsolationTelemetryTransportStatus,
} from '@bersoncare/db-principal';
import { logger } from './logger.js';

function query(sql: string, values: readonly unknown[]): Promise<unknown> {
  // Context-install/query failures must never recurse into another DB checkout. In port-context
  // mode PostgreSQL logs the denial; this reporter deliberately stays process-local.
  void sql;
  void values;
  return Promise.reject(new Error('port_context_telemetry_is_local'));
}

export async function probeSaasIsolationTelemetryWriter(
  _pool: never,
  source: SaasIsolationBackgroundSource,
): Promise<void> {
  void source;
  throw new Error('port_context_telemetry_is_local');
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
    probe: () => Promise.reject(new Error('port_context_telemetry_is_local')),
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
