import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import { loadAdminTranscodeHealthMetricsSafe } from '@/app-layer/media/adminTranscodeHealthMetrics';
import { env } from '@/config/env';
import { proxyIntegratorProjectionHealth } from '@/app-layer/health/proxyIntegratorProjectionHealth';
import { classifyVideoTranscodeSystemHealthStatus } from '@/modules/operator-health/adminHealthThresholds';
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  OPERATOR_OUTBOUND_PROBE_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';
import type {
  CriticalHealthProjectionInput,
  CriticalHealthSignalsInput,
  DbStatus,
  IntegratorApiStatus,
  OperatorHealthBannerInput,
  ProjectionProbeStatus,
  VideoTranscodeHealthStatus,
} from '@/modules/operator-health/criticalHealthSignals';
import {
  countRecentOutboundProviderFailureIncidents,
  isOperatorProbeFailureIncident,
} from '@/modules/operator-health/criticalHealthSignals';
import { readProbeConsecutiveFailRuns } from '@/modules/operator-health/probeOutboundMeta';
import {
  WEBHOOK_BURST_MIN_COUNT,
  WEBHOOK_BURST_WINDOW_MINUTES,
} from '@/modules/operator-health/webhookBurst';
import { getConfigBool } from '@/modules/system-settings/configAdapter';
import { getCurrentWebappPoolRoutingMetrics } from '@/infra/db/client';
import {
  observeTenantIsolationCanary,
  observeTenantIsolationDiagnostics,
  observeTenantIsolationRuntimeCounters,
} from '@/modules/operator-health/tenantIsolationCriticalHealth';
import {
  readEmptyAudienceSignal,
  readOperatorHeartbeatVerdicts,
} from '@/app-layer/health/deliveryHeartbeatObserver';
import {
  loadCuratedSystemHealthSnapshot,
  type CuratedSystemHealthSnapshot,
} from '@/infra/repos/pgCuratedSystemHealthDiagnostics';

const INTEGRATOR_TIMEOUT_MS = 8_000;

type ProjectionSnapshot = {
  deadCount?: number;
  retriesOverThreshold?: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toProjectionProbeStatus(snapshot: ProjectionSnapshot): ProjectionProbeStatus {
  const deadCount = typeof snapshot.deadCount === 'number' ? snapshot.deadCount : 0;
  const retriesOverThreshold =
    typeof snapshot.retriesOverThreshold === 'number' ? snapshot.retriesOverThreshold : 0;
  if (deadCount > 0 || retriesOverThreshold > 0) return 'degraded';
  return 'ok';
}

async function probeWebappDb(): Promise<DbStatus> {
  try {
    const dbOk = await buildAppDeps().health.checkDbHealth();
    return dbOk ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

async function probeIntegratorApi(): Promise<IntegratorApiStatus> {
  const base = (env.INTEGRATOR_API_URL ?? '').replace(/\/$/, '');
  if (!base) return 'error';
  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...getCurrentCorrelationIdHeader() },
      cache: 'no-store',
      signal: AbortSignal.timeout(INTEGRATOR_TIMEOUT_MS),
    });
    const body = asObject(await res.json().catch(() => null));
    if (res.ok && body?.ok === true) return 'ok';
    return 'error';
  } catch {
    return 'unreachable';
  }
}

async function probeProjection(): Promise<CriticalHealthProjectionInput> {
  try {
    const response = await proxyIntegratorProjectionHealth();
    const payload = asObject(await response.json().catch(() => null));
    if (!response.ok || payload == null) {
      const code = typeof payload?.error === 'string' ? payload.error : 'projection_probe_failed';
      return {
        probeStatus: code.includes('unreachable') ? 'unreachable' : 'error',
        deadCount: 0,
        retriesOverThreshold: 0,
      };
    }
    const snapshot = payload as ProjectionSnapshot;
    const deadCount = typeof snapshot.deadCount === 'number' ? snapshot.deadCount : 0;
    const retriesOverThreshold =
      typeof snapshot.retriesOverThreshold === 'number' ? snapshot.retriesOverThreshold : 0;
    return {
      probeStatus: toProjectionProbeStatus(snapshot),
      deadCount,
      retriesOverThreshold,
    };
  } catch {
    return { probeStatus: 'error', deadCount: 0, retriesOverThreshold: 0 };
  }
}

async function probeVideoTranscodeStatus(): Promise<VideoTranscodeHealthStatus> {
  try {
    const [pipelineEnabled, reconcileEnabled] = await Promise.all([
      getConfigBool('video_hls_pipeline_enabled'),
      getConfigBool('video_hls_reconcile_enabled'),
    ]);
    const read = buildAppDeps().operatorHealthRead;
    const [metrics, tickRow] = await Promise.all([
      loadAdminTranscodeHealthMetricsSafe(),
      read.getOperatorJobStatus(
        OPERATOR_MEDIA_JOB_FAMILY,
        OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
      ),
    ]);
    if (!metrics) return pipelineEnabled ? 'error' : 'ok';
    return classifyVideoTranscodeSystemHealthStatus({
      pipelineEnabled,
      reconcileEnabled,
      pendingCount: metrics.pendingCount,
      oldestPendingAgeSeconds: metrics.oldestPendingAgeSeconds,
      failedLastHour: metrics.failedLastHour,
      failedLast24h: metrics.failedLast24h,
      reconcileLastStatus: tickRow?.lastStatus ?? null,
    });
  } catch {
    return 'error';
  }
}

async function loadBackupJobsMap(
  read: ReturnType<typeof buildAppDeps>['operatorHealthRead'],
): Promise<Record<string, { lastStatus: string }>> {
  const rows = await read.listBackupJobStatus();
  const backupJobs: Record<string, { lastStatus: string }> = {};
  for (const row of rows) {
    backupJobs[row.jobKey] = { lastStatus: row.lastStatus };
  }
  return backupJobs;
}

function findCuratedJob(
  snapshot: CuratedSystemHealthSnapshot,
  jobFamily: string,
  jobKey: string,
) {
  return snapshot.operatorJobs.find(
    (job) => job.jobFamily === jobFamily && job.jobKey === jobKey,
  );
}

function curatedBackupJobsMap(
  snapshot: CuratedSystemHealthSnapshot,
): Record<string, { lastStatus: string }> {
  const backupJobs: Record<string, { lastStatus: string }> = {};
  for (const job of snapshot.operatorJobs) {
    if (job.jobFamily === 'backup') backupJobs[job.jobKey] = { lastStatus: job.lastStatus };
  }
  return backupJobs;
}

function curatedVideoTranscodeStatus(
  snapshot: CuratedSystemHealthSnapshot,
): VideoTranscodeHealthStatus {
  const reconcileJob = findCuratedJob(
    snapshot,
    OPERATOR_MEDIA_JOB_FAMILY,
    OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  );
  return classifyVideoTranscodeSystemHealthStatus({
    pipelineEnabled: snapshot.config.pipelineEnabled,
    reconcileEnabled: snapshot.config.reconcileEnabled,
    pendingCount: snapshot.videoTranscode.pendingCount,
    oldestPendingAgeSeconds: snapshot.videoTranscode.oldestPendingAgeSeconds,
    failedLastHour: snapshot.videoTranscode.failedLastHour,
    failedLast24h: snapshot.videoTranscode.failedLast24h,
    reconcileLastStatus: reconcileJob?.lastStatus ?? null,
  });
}

/** Scheduler path: sensitive cross-tenant aggregates come only from the curated diagnostics root. */
async function collectScheduledCriticalHealthSignalsBase(
  read: ReturnType<typeof buildAppDeps>['operatorHealthRead'],
): Promise<CriticalHealthSignalsInput> {
  const [webappDb, integratorApi, projection, snapshot, webhookBursts, operatorIncidents] =
    await Promise.all([
      probeWebappDb(),
      probeIntegratorApi(),
      probeProjection(),
      loadCuratedSystemHealthSnapshot(),
      read.listWebhookBurstSignals(WEBHOOK_BURST_WINDOW_MINUTES, WEBHOOK_BURST_MIN_COUNT),
      read.listOpenIncidents(100),
    ]);
  const [heartbeats, emptyAudience] = await Promise.all([
    readOperatorHeartbeatVerdicts().catch(() => []),
    readEmptyAudienceSignal().catch(() => undefined),
  ]);
  const outgoingDelivery = snapshot.outgoingDelivery;
  const outboundProviderIncidents = operatorIncidents.filter(
    (incident) => incident.direction === 'outbound_delivery_provider',
  );
  const probeJob = findCuratedJob(
    snapshot,
    OPERATOR_HEALTH_JOB_FAMILY,
    OPERATOR_OUTBOUND_PROBE_JOB_KEY,
  );

  return {
    webappDb,
    integratorApi,
    projection,
    outgoingDelivery: {
      deadTotal: outgoingDelivery.deadTotal,
      dueBacklog: outgoingDelivery.dueBacklog,
    },
    deliveryEvidence: {
      confirmedDeliveries: outgoingDelivery.confirmedSentLast24h ?? 0,
      lastConfirmedDeliveryAt: outgoingDelivery.lastSentAt ?? null,
      oldestUnsentAgeSeconds: outgoingDelivery.oldestDueAgeSeconds,
    },
    heartbeats,
    ...(emptyAudience ? { emptyAudience } : {}),
    outboundDeliveryProvider: {
      recentIncidentCount: countRecentOutboundProviderFailureIncidents(operatorIncidents),
      openIncidentCount: outboundProviderIncidents.length,
      openIncidents: outboundProviderIncidents,
    },
    integratorPushOutbox: {
      dueBacklog: snapshot.integratorPushOutbox.dueBacklog,
      deadTotal: snapshot.integratorPushOutbox.deadTotal,
      oldestDueAgeSeconds: snapshot.integratorPushOutbox.oldestDueAgeSeconds,
      dueByKind: snapshot.integratorPushOutbox.dueByKind,
      deadByKind: snapshot.integratorPushOutbox.deadByKind,
      processingCount: snapshot.integratorPushOutbox.processingCount,
      oldestProcessingAgeSeconds:
        snapshot.integratorPushOutbox.oldestProcessingAgeSeconds ?? null,
      lastQueueActivityAt: snapshot.integratorPushOutbox.lastQueueActivityAt,
    },
    backupJobs: curatedBackupJobsMap(snapshot),
    probeConsecutiveFailRuns: readProbeConsecutiveFailRuns(probeJob?.safeMeta),
    probeIncidentsOpenCount: operatorIncidents.filter(isOperatorProbeFailureIncident).length,
    videoTranscodeStatus: curatedVideoTranscodeStatus(snapshot),
    webhookBursts,
  };
}

/** Shared lightweight probes (without media/playback/engagement or isolation state). */
async function collectCriticalHealthSignalsBase(
  read: ReturnType<typeof buildAppDeps>['operatorHealthRead'],
): Promise<CriticalHealthSignalsInput> {
  const [
    webappDb,
    integratorApi,
    projection,
    outgoingDelivery,
    integratorPushOutbox,
    backupJobs,
    probeJob,
    videoTranscodeStatus,
    webhookBursts,
    operatorIncidents,
  ] = await Promise.all([
    probeWebappDb(),
    probeIntegratorApi(),
    probeProjection(),
    read.getOutgoingDeliveryQueueHealth(),
    read.getIntegratorPushOutboxHealth(),
    loadBackupJobsMap(read),
    read.getOperatorJobStatus(OPERATOR_HEALTH_JOB_FAMILY, OPERATOR_OUTBOUND_PROBE_JOB_KEY),
    probeVideoTranscodeStatus(),
    read.listWebhookBurstSignals(WEBHOOK_BURST_WINDOW_MINUTES, WEBHOOK_BURST_MIN_COUNT),
    read.listOpenIncidents(100),
  ]);
  // D-d/D-b: пульс и счётчик пустой аудитории собираются best-effort — их собственный сбой
  // не имеет права ослепить остальную часть тика.
  const [heartbeats, emptyAudience] = await Promise.all([
    readOperatorHeartbeatVerdicts().catch(() => []),
    readEmptyAudienceSignal().catch(() => undefined),
  ]);
  const outboundProviderIncidents = operatorIncidents.filter(
    (incident) => incident.direction === 'outbound_delivery_provider',
  );

  return {
    webappDb,
    integratorApi,
    projection,
    outgoingDelivery: {
      deadTotal: outgoingDelivery.deadTotal,
      dueBacklog: outgoingDelivery.dueBacklog,
    },
    deliveryEvidence: {
      confirmedDeliveries: outgoingDelivery.confirmedSentLast24h,
      lastConfirmedDeliveryAt: outgoingDelivery.lastSentAt,
      oldestUnsentAgeSeconds: outgoingDelivery.oldestDueAgeSeconds,
    },
    heartbeats,
    ...(emptyAudience ? { emptyAudience } : {}),
    outboundDeliveryProvider: {
      recentIncidentCount: countRecentOutboundProviderFailureIncidents(operatorIncidents),
      openIncidentCount: outboundProviderIncidents.length,
      openIncidents: outboundProviderIncidents,
    },
    integratorPushOutbox,
    backupJobs,
    probeConsecutiveFailRuns: readProbeConsecutiveFailRuns(probeJob?.metaJson),
    probeIncidentsOpenCount: operatorIncidents.filter(isOperatorProbeFailureIncident).length,
    videoTranscodeStatus,
    webhookBursts,
  };
}

/**
 * Scheduled five-minute critical tick collector. Tenant-isolation reads and
 * state advancement must stay on this scheduler boundary, never on page reads.
 */
export async function collectCriticalHealthSignals(): Promise<CriticalHealthSignalsInput> {
  const deps = buildAppDeps();
  const [base, isolationDiagnostics, isolationCanary] = await Promise.all([
    collectScheduledCriticalHealthSignalsBase(deps.operatorHealthRead),
    deps.saasIsolationDiagnostics.readHealth().catch(() => null),
    deps.operatorHealthRead.getTenantIsolationCanarySnapshot().catch(() => null),
  ]);
  const observedAt = Date.now();
  return {
    ...base,
    tenantIsolation: {
      runtime: observeTenantIsolationRuntimeCounters(
        getCurrentWebappPoolRoutingMetrics(),
        observedAt,
      ),
      diagnostics: observeTenantIsolationDiagnostics(isolationDiagnostics, observedAt),
      wentDark: observeTenantIsolationCanary(isolationCanary, observedAt),
    },
  };
}

/** Снимок для баннера «Сегодня». */
export async function collectOperatorHealthBannerInput(): Promise<OperatorHealthBannerInput> {
  const read = buildAppDeps().operatorHealthRead;
  const [base, incidents] = await Promise.all([
    collectCriticalHealthSignalsBase(read),
    read.listOpenIncidents(100),
  ]);
  return {
    ...base,
    operatorIncidentsOpenCount: incidents.length,
  };
}
