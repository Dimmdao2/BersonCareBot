import { logger } from '@/app-layer/logging/logger';
import {
  createSaasIsolationDiagnosticsService,
  redactSaasIsolationEventInput,
  type ReportSaasIsolationEventInput,
} from '@/modules/operator-health/saasIsolationDiagnostics';
import { pgSaasIsolationDiagnosticsPort } from '@/infra/repos/pgSaasIsolationDiagnostics';

export const runtimeSaasIsolationDiagnostics = createSaasIsolationDiagnosticsService(
  pgSaasIsolationDiagnosticsPort,
);

const MAX_QUEUE = 64;
const WRITE_TIMEOUT_MS = 250;
const CIRCUIT_OPEN_MS = 30_000;

type ReporterClock = {
  now(): number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

export function createBestEffortSaasIsolationReporter(
  writer: (input: ReportSaasIsolationEventInput) => Promise<void>,
  clock: ReporterClock = { now: Date.now, setTimeout, clearTimeout },
) {
  const queue: ReportSaasIsolationEventInput[] = [];
  let draining = false;
  let circuitOpenUntil = 0;

  async function boundedWrite(input: ReportSaasIsolationEventInput): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        writer(input),
        new Promise<never>((_, reject) => {
          timer = clock.setTimeout(
            () => reject(new Error('saas_isolation_telemetry_timeout')),
            WRITE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clock.clearTimeout(timer);
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        if (clock.now() < circuitOpenUntil) {
          queue.length = 0;
          return;
        }
        const input = queue.shift();
        if (!input) return;
        try {
          await boundedWrite(input);
        } catch {
          circuitOpenUntil = clock.now() + CIRCUIT_OPEN_MS;
          queue.length = 0;
          logger.warn(
            {
              eventClass: input.eventClass,
              sourceService: input.sourceService,
              sourceOperation: input.sourceOperation,
            },
            'saas_isolation_telemetry_persist_failed',
          );
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    report(input: ReportSaasIsolationEventInput): void {
      let safe: ReportSaasIsolationEventInput;
      try {
        safe = redactSaasIsolationEventInput(input);
      } catch {
        return;
      }
      if (clock.now() < circuitOpenUntil || queue.length >= MAX_QUEUE) return;
      queue.push(safe);
      void drain();
    },
    inspectForTest() {
      return { queueLength: queue.length, draining, circuitOpenUntil };
    },
  };
}

const runtimeReporter = createBestEffortSaasIsolationReporter((input) =>
  runtimeSaasIsolationDiagnostics.report(input),
);

/** Synchronous enqueue only: the primary failing path never awaits telemetry I/O. */
export function reportSaasIsolationEventBestEffort(
  input: ReportSaasIsolationEventInput,
): Promise<void> {
  runtimeReporter.report(input);
  return Promise.resolve();
}
