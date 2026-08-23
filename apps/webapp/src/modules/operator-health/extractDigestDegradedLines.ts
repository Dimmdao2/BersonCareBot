import type { CronJobsHealthPayload } from '@/app-layer/health/collectCronJobsHealth';
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from './adminHealthThresholds';

export type DigestDegradedSnapshot = {
  outgoingDelivery: { dueBacklog: number; deadTotal: number };
  videoTranscodeStatus: 'ok' | 'degraded' | 'error';
  cronJobs: CronJobsHealthPayload;
  operatorIncidentsOpenCount: number;
};

/**
 * Non-critical degraded сигналы для суточной сводки (матрица §3, не immediate push).
 */
export function extractDigestDegradedLines(snapshot: DigestDegradedSnapshot): string[] {
  const lines: string[] = [];

  if (snapshot.outgoingDelivery.dueBacklog >= ADMIN_DELIVERY_DUE_BACKLOG_WARNING) {
    lines.push(`Очередь доставки: due backlog ${snapshot.outgoingDelivery.dueBacklog}`);
  }

  if (snapshot.videoTranscodeStatus === 'degraded') {
    lines.push('Транскод HLS: деградация');
  }

  for (const job of snapshot.cronJobs.jobs) {
    if (job.status === 'degraded' || job.status === 'error') {
      lines.push(`Cron: ${job.label} — ${job.status}`);
    }
  }

  if (snapshot.operatorIncidentsOpenCount > 0) {
    lines.push(`Открытые инциденты: ${snapshot.operatorIncidentsOpenCount}`);
  }

  return lines;
}
