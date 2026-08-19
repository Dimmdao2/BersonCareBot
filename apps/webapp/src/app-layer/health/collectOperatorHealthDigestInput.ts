import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { collectAdminSystemHealthData } from '@/app-layer/health/collectAdminSystemHealthData';
import type { OperatorHealthDigestInput } from '@/modules/operator-health/buildOperatorHealthDigest';
import { buildDigestHealthSnapshotLines } from '@/modules/operator-health/digestHealthSnapshotLines';
import {
  countRecentOutboundProviderFailureIncidents,
  isOperatorProbeFailureIncident,
} from '@/modules/operator-health/criticalHealthSignals';
import { loadOperatorHealthProjectionThresholds } from '@/modules/operator-health/operatorHealthProjectionThresholds';
import {
  evaluateProjectionDigestDebounceFlags,
  parseProjectionDigestDebounceState,
} from '@/modules/operator-health/projectionDigestDebounce';
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';
import { getConfigValue } from '@/modules/system-settings/configAdapter';
import { readOperatorHeartbeatVerdicts } from '@/app-layer/health/deliveryHeartbeatObserver';

export async function collectOperatorHealthDigestInput(params: {
  windowStartIso: string;
  windowEndIso: string;
  suppressRecovery: boolean;
}): Promise<OperatorHealthDigestInput> {
  const deps = buildAppDeps();
  const digestRead = deps.operatorHealthDigestRead;
  const nowMs = Date.now();

  const [
    auditErrorCount,
    incidentsOpened,
    incidentsResolved,
    jobFailures,
    health,
    thresholds,
    debounceRow,
    openIncidents,
  ] = await Promise.all([
    digestRead.countAuditErrorsInWindow(params.windowStartIso, params.windowEndIso),
    digestRead.listIncidentsOpenedInWindow(params.windowStartIso, params.windowEndIso),
    digestRead.listIncidentsResolvedInWindow(params.windowStartIso, params.windowEndIso),
    digestRead.listJobFailuresInWindow(params.windowStartIso, params.windowEndIso),
    collectAdminSystemHealthData(),
    loadOperatorHealthProjectionThresholds(getConfigValue),
    deps.operatorHealthRead.getOperatorJobStatus(
      OPERATOR_HEALTH_JOB_FAMILY,
      OPERATOR_HEALTH_PROJECTION_DIGEST_DEBOUNCE_JOB_KEY,
    ),
    deps.operatorHealthRead.listOpenIncidents(100),
  ]);

  // D-d: сводка обязана нести доказательство, а не отсутствие ошибок.
  const [deliveryQueue, heartbeats] = await Promise.all([
    deps.operatorHealthRead.getOutgoingDeliveryQueueHealth().catch(() => null),
    readOperatorHeartbeatVerdicts(nowMs).catch(() => []),
  ]);

  const projectionSnapshot = health.projection.snapshot;
  const projection = {
    probeStatus: health.projection.status,
    deadCount: typeof projectionSnapshot?.deadCount === 'number' ? projectionSnapshot.deadCount : 0,
    retriesOverThreshold:
      typeof projectionSnapshot?.retriesOverThreshold === 'number'
        ? projectionSnapshot.retriesOverThreshold
        : 0,
    oldestPendingAt:
      typeof projectionSnapshot?.oldestPendingAt === 'string'
        ? projectionSnapshot.oldestPendingAt
        : null,
  };

  const debounceFlags = evaluateProjectionDigestDebounceFlags(
    {
      probeStatus: projection.probeStatus,
      deadCount: projection.deadCount,
      retriesOverThreshold: projection.retriesOverThreshold,
      oldestPendingAt: projection.oldestPendingAt,
    },
    thresholds,
    parseProjectionDigestDebounceState(debounceRow?.metaJson),
    nowMs,
  );

  const snapshotLines = buildDigestHealthSnapshotLines({
    webappDb: health.webappDb,
    integratorApi: health.integratorApi.status,
    projection,
    projectionDigestDebounce: {
      includeRetriesLine: debounceFlags.includeRetriesInDigest,
      includeStalePendingLine: debounceFlags.includeStalePendingInDigest,
    },
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
    integratorPushOutbox: health.integratorPushOutbox,
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
    auditErrorCount,
    incidentsOpened,
    incidentsResolved,
    jobFailures,
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
    suppressRecovery: params.suppressRecovery,
  };
}
