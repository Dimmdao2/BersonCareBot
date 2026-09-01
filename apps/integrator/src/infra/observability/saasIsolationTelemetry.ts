import {
  createSaasIsolationBackgroundReporter,
  type SaasIsolationBackgroundReporter,
  type SaasIsolationBackgroundSource,
  type SaasIsolationEventSink,
  type SaasIsolationTelemetryTransportStatus,
} from '@bersoncare/error-tracking';
import { logger } from './logger.js';

const write: SaasIsolationEventSink = () =>
  // Context-install/query failures must never recurse into another DB checkout. In port-context
  // mode PostgreSQL logs the denial; this reporter deliberately stays process-local, so the sink
  // is a declared failure and the degraded transport status below is what makes it visible.
  Promise.reject(new Error('port_context_telemetry_is_local'));

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
    write,
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
