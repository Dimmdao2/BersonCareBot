import {
  classifyCriticalHealthSignals,
  type CriticalHealthSignalsInput,
  type ProjectionProbeStatus,
} from './criticalHealthSignals';
import { extractDigestDegradedLines } from './extractDigestDegradedLines';
import type { CronJobsHealthPayload } from '@/app-layer/health/collectCronJobsHealth';
import type { IntegratorPushOutboxHealthSnapshot } from './ports';
import type { VideoTranscodeHealthStatus } from './criticalHealthSignals';

export type DigestHealthSnapshotInput = {
  webappDb: 'up' | 'down';
  integratorApi: 'ok' | 'unreachable' | 'error';
  projection: {
    probeStatus: ProjectionProbeStatus;
    deadCount: number;
    retriesOverThreshold: number;
    oldestPendingAt?: string | null;
  };
  projectionDigestDebounce?: {
    includeRetriesLine: boolean;
    includeStalePendingLine: boolean;
  };
  outgoingDelivery: {
    dueBacklog: number;
    deadTotal: number;
    /** Окно «отказывает сейчас»; без него сводка снова красна по июньской строке. */
    deadRecent?: number;
  };
  outboundDeliveryProvider: { recentIncidentCount: number; openIncidentCount?: number };
  integratorPushOutbox: IntegratorPushOutboxHealthSnapshot;
  backupJobs: Record<string, { lastStatus: string }>;
  probeConsecutiveFailRuns: number;
  probeIncidentsOpenCount: number;
  videoTranscodeStatus: VideoTranscodeHealthStatus;
  cronJobs: CronJobsHealthPayload;
  operatorIncidentsOpenCount: number;
};

/**
 * Строки сводки из текущего health-snapshot: ongoing critical (матрица §3) + non-critical degraded.
 */
export function buildDigestHealthSnapshotLines(input: DigestHealthSnapshotInput): string[] {
  const criticalInput: CriticalHealthSignalsInput = {
    webappDb: input.webappDb,
    integratorApi: input.integratorApi,
    projection: input.projection,
    outgoingDelivery: input.outgoingDelivery,
    outboundDeliveryProvider: input.outboundDeliveryProvider,
    integratorPushOutbox: input.integratorPushOutbox,
    backupJobs: input.backupJobs,
    probeConsecutiveFailRuns: input.probeConsecutiveFailRuns,
    probeIncidentsOpenCount: input.probeIncidentsOpenCount,
    videoTranscodeStatus: input.videoTranscodeStatus,
  };
  const criticalLines = classifyCriticalHealthSignals(criticalInput).flatMap((c) => c.lines);
  const skipOpenIncidentsLine = input.probeIncidentsOpenCount > 0;
  const degradedLines = extractDigestDegradedLines({
    projection: input.projection,
    projectionDigestDebounce: input.projectionDigestDebounce,
    outgoingDelivery: input.outgoingDelivery,
    integratorPushOutbox: input.integratorPushOutbox,
    videoTranscodeStatus: input.videoTranscodeStatus,
    cronJobs: input.cronJobs,
    operatorIncidentsOpenCount: skipOpenIncidentsLine ? 0 : input.operatorIncidentsOpenCount,
  });
  return [...criticalLines, ...degradedLines];
}
