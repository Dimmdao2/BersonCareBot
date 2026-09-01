import {
  classifySaasIsolationFailure,
  isRecognizedSaasIsolationFailure,
  type SaasIsolationTelemetryEventClass,
} from './saasIsolationClassification.js';

/** Closed source vocabulary; mirrored by the `saas_isolation_events` service/operation constraint. */
export type SaasIsolationBackgroundSource =
  | { service: 'integrator'; operation: 'integrator_http_request' | 'integrator_projection' }
  | {
      service: 'worker';
      operation: 'worker_queue_drain' | 'worker_projection_delivery' | 'worker_outgoing_delivery';
    }
  | { service: 'scheduler'; operation: 'scheduler_lock' | 'scheduler_dispatch_tick' }
  | { service: 'media_worker'; operation: 'media_transcode_tick' };

export type SaasIsolationTelemetryTransportStatus = {
  state: 'idle' | 'ready' | 'degraded';
  queueLength: number;
  acceptedEvents: number;
  persistedEvents: number;
  transportFailures: number;
  droppedCircuitOpen: number;
  droppedQueueFull: number;
  circuitOpen: boolean;
};

export type SaasIsolationBackgroundReporter = ((error: unknown) => void) & {
  /** Redacted, process-local and bounded transport counters; never includes errors or payloads. */
  inspectTransportStatus(): SaasIsolationTelemetryTransportStatus;
};

/**
 * Where a classified event is written. This package owns classification and transport policy
 * (bounded queue, timeout, circuit breaker) and deliberately owns NO SQL: the statement and the
 * connection belong to the process family's own named DB boundary.
 */
export type SaasIsolationEventSink = (event: {
  eventClass: SaasIsolationTelemetryEventClass;
  source: SaasIsolationBackgroundSource;
}) => Promise<unknown>;

/**
 * Process-family integration point. `write` must be backed by a dedicated max=1 pool, never the
 * request/job client that just failed. Calls synchronously enqueue and are bounded/circuit-broken.
 */
export function createSaasIsolationBackgroundReporter(input: {
  source: SaasIsolationBackgroundSource;
  write: SaasIsolationEventSink;
  onStatus?: (status: SaasIsolationTelemetryTransportStatus) => void;
  now?: () => number;
  timeoutMs?: number;
}): SaasIsolationBackgroundReporter {
  const queue: SaasIsolationTelemetryEventClass[] = [];
  const now = input.now ?? Date.now;
  const timeoutMs = input.timeoutMs ?? 250;
  let draining = false;
  let circuitOpenUntil = 0;
  let state: SaasIsolationTelemetryTransportStatus['state'] = 'idle';
  let acceptedEvents = 0;
  let persistedEvents = 0;
  let transportFailures = 0;
  let droppedCircuitOpen = 0;
  let droppedQueueFull = 0;

  function increment(value: number): number {
    return value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;
  }

  function inspectTransportStatus(): SaasIsolationTelemetryTransportStatus {
    return {
      state,
      queueLength: queue.length,
      acceptedEvents,
      persistedEvents,
      transportFailures,
      droppedCircuitOpen,
      droppedQueueFull,
      circuitOpen: now() < circuitOpenUntil,
    };
  }

  function publishStatus(): void {
    try {
      input.onStatus?.(inspectTransportStatus());
    } catch {
      // Observability callbacks must never break the primary request/job path.
    }
  }

  function publishDropMilestone(value: number): void {
    if (value === 1 || value === 10 || value === 100 || value === 1_000 || value === 10_000) {
      publishStatus();
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        if (now() < circuitOpenUntil) {
          queue.length = 0;
          return;
        }
        const eventClass = queue.shift();
        if (!eventClass) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            input.write({ eventClass, source: input.source }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('saas_isolation_telemetry_timeout')),
                timeoutMs,
              );
            }),
          ]);
          persistedEvents = increment(persistedEvents);
          state = 'ready';
        } catch {
          transportFailures = increment(transportFailures);
          state = 'degraded';
          circuitOpenUntil = now() + 30_000;
          queue.length = 0;
          publishStatus();
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
    } finally {
      draining = false;
    }
  }

  const report = ((error: unknown): void => {
    if (!isRecognizedSaasIsolationFailure(error)) return;
    if (now() < circuitOpenUntil) {
      droppedCircuitOpen = increment(droppedCircuitOpen);
      publishDropMilestone(droppedCircuitOpen);
      return;
    }
    if (queue.length >= 32) {
      droppedQueueFull = increment(droppedQueueFull);
      publishDropMilestone(droppedQueueFull);
      return;
    }
    acceptedEvents = increment(acceptedEvents);
    queue.push(classifySaasIsolationFailure(error));
    void drain();
  }) as SaasIsolationBackgroundReporter;

  report.inspectTransportStatus = inspectTransportStatus;
  return report;
}
