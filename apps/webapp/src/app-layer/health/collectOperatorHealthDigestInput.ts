import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { collectAdminSystemHealthData } from '@/app-layer/health/collectAdminSystemHealthData';
import type { OperatorHealthDigestInput } from '@/modules/operator-health/buildOperatorHealthDigest';
import { buildDigestHealthSnapshotLines } from '@/modules/operator-health/digestHealthSnapshotLines';
import {
  countRecentOutboundProviderFailureIncidents,
  isOperatorProbeFailureIncident,
} from '@/modules/operator-health/criticalHealthSignals';
import { readOperatorHeartbeatVerdicts } from '@/app-layer/health/deliveryHeartbeatObserver';
import type { OperatorHealthDigestWindow } from '@/modules/operator-health/digestPorts';

export async function collectOperatorHealthDigestInput(params: {
  digestWindow: OperatorHealthDigestWindow;
}): Promise<OperatorHealthDigestInput> {
  const deps = buildAppDeps();
  const nowMs = Date.now();

  const [health, openIncidents] = await Promise.all([
    collectAdminSystemHealthData(),
    deps.operatorHealthRead.listOpenIncidents(100),
  ]);

  // D-d: сводка обязана нести доказательство, а не отсутствие ошибок.
  const [deliveryQueue, heartbeats] = await Promise.all([
    deps.operatorHealthRead.getOutgoingDeliveryQueueHealth().catch(() => null),
    readOperatorHeartbeatVerdicts(nowMs).catch(() => []),
  ]);

  const snapshotLines = buildDigestHealthSnapshotLines({
    webappDb: health.webappDb,
    integratorApi: health.integratorApi.status,
    outgoingDelivery: {
      dueBacklog: health.outgoingDelivery.dueBacklog,
      deadTotal: health.outgoingDelivery.deadTotal,
      // Окно берётся у объявленного корня очереди; сводный снимок его не несёт. Корень не
      // прочитался — поле не выставляется, и сводка честно откатывается на исторический счётчик,
      // а не объявляет очередь здоровой.
      ...(deliveryQueue ? { deadRecent: deliveryQueue.deadRecent } : {}),
    },
    outboundDeliveryProvider: {
      recentIncidentCount: countRecentOutboundProviderFailureIncidents(openIncidents, nowMs),
      openIncidentCount: openIncidents.filter(
        (incident) => incident.direction === 'outbound_delivery_provider',
      ).length,
    },
    backupJobs: Object.fromEntries(
      Object.entries(health.backupJobs).map(([jobKey, row]) => [
        jobKey,
        { lastStatus: row.lastStatus },
      ]),
    ),
    probeConsecutiveFailRuns: health.probeOutbound.consecutiveFailRuns,
    probeIncidentsOpenCount: openIncidents.filter(isOperatorProbeFailureIncident).length,
    videoTranscodeStatus: health.videoTranscode.status,
    cronJobs: health.cronJobs,
    operatorIncidentsOpenCount: health.operatorIncidents.openCount,
  });

  return {
    auditErrorCount: params.digestWindow.auditErrorCount,
    incidentsOpened: params.digestWindow.incidentsOpened,
    incidentsResolved: params.digestWindow.incidentsResolved,
    jobFailures: params.digestWindow.jobFailures,
    snapshotLines,
    hasStopIssue:
      (deliveryQueue ? deliveryQueue.deadRecent : health.outgoingDelivery.deadTotal) > 0 ||
      openIncidents.some((incident) => incident.direction === 'outbound_delivery_provider'),
    // Снимок не прочитался → поле не выставляем: сводка тогда честно печатает
    // «Доказательство доставки: НЕ СОБРАНО» и не имеет права быть зелёной.
    ...(deliveryQueue
      ? {
          deliveryEvidence: {
            confirmedDeliveries: deliveryQueue.confirmedSentLast24h,
            lastConfirmedDeliveryAt: deliveryQueue.lastSentAt,
            oldestUnsentAgeSeconds: deliveryQueue.oldestDueAgeSeconds,
          },
        }
      : {}),
    heartbeats,
    suppressRecovery: params.digestWindow.hadResolveAll,
  };
}
