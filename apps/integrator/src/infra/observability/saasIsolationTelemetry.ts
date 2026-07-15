import { createSaasIsolationBackgroundReporter } from '@bersoncare/db-principal';
import { createIntegratorSaasIsolationTelemetryPoolProvider } from '../db/integratorPoolProvider.js';

let telemetryPool: ReturnType<typeof createIntegratorSaasIsolationTelemetryPoolProvider> | null = null;
function query(sql: string, values: readonly unknown[]): Promise<unknown> {
  const connectionString = (process.env.DATABASE_URL ?? '').trim();
  if (!connectionString) return Promise.reject(new Error('DATABASE_URL is required'));
  telemetryPool ??= createIntegratorSaasIsolationTelemetryPoolProvider(connectionString);
  return telemetryPool.query(sql, values as unknown[]);
}

export const reportIntegratorIsolationFailure = createSaasIsolationBackgroundReporter({
  source: { service: 'integrator', operation: 'integrator_http_request' }, query,
});
export const reportWorkerQueueIsolationFailure = createSaasIsolationBackgroundReporter({
  source: { service: 'worker', operation: 'worker_queue_drain' }, query,
});
export const reportWorkerProjectionIsolationFailure = createSaasIsolationBackgroundReporter({
  source: { service: 'worker', operation: 'worker_projection_delivery' }, query,
});
export const reportWorkerOutgoingIsolationFailure = createSaasIsolationBackgroundReporter({
  source: { service: 'worker', operation: 'worker_outgoing_delivery' }, query,
});
export const reportSchedulerLockIsolationFailure = createSaasIsolationBackgroundReporter({
  source: { service: 'scheduler', operation: 'scheduler_lock' }, query,
});
export const reportSchedulerDispatchIsolationFailure = createSaasIsolationBackgroundReporter({
  source: { service: 'scheduler', operation: 'scheduler_dispatch_tick' }, query,
});
