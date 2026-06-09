import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { collectAdminSystemHealthData } from "@/app-layer/health/collectAdminSystemHealthData";
import type { OperatorHealthDigestInput } from "@/modules/operator-health/buildOperatorHealthDigest";
import { buildDigestHealthSnapshotLines } from "@/modules/operator-health/digestHealthSnapshotLines";

export async function collectOperatorHealthDigestInput(params: {
  windowStartIso: string;
  windowEndIso: string;
  suppressRecovery: boolean;
}): Promise<OperatorHealthDigestInput> {
  const deps = buildAppDeps();
  const digestRead = deps.operatorHealthDigestRead;

  const [auditErrorCount, incidentsOpened, incidentsResolved, jobFailures, health] = await Promise.all([
    digestRead.countAuditErrorsInWindow(params.windowStartIso, params.windowEndIso),
    digestRead.listIncidentsOpenedInWindow(params.windowStartIso, params.windowEndIso),
    digestRead.listIncidentsResolvedInWindow(params.windowStartIso, params.windowEndIso),
    digestRead.listJobFailuresInWindow(params.windowStartIso, params.windowEndIso),
    collectAdminSystemHealthData(),
  ]);

  const projectionSnapshot = health.projection.snapshot;
  const projection = {
    probeStatus: health.projection.status,
    deadCount: typeof projectionSnapshot?.deadCount === "number" ? projectionSnapshot.deadCount : 0,
    retriesOverThreshold:
      typeof projectionSnapshot?.retriesOverThreshold === "number"
        ? projectionSnapshot.retriesOverThreshold
        : 0,
  };
  const snapshotLines = buildDigestHealthSnapshotLines({
    webappDb: health.webappDb,
    integratorApi: health.integratorApi.status,
    projection,
    outgoingDelivery: {
      dueBacklog: health.outgoingDelivery.dueBacklog,
      deadTotal: health.outgoingDelivery.deadTotal,
    },
    integratorPushOutbox: health.integratorPushOutbox,
    backupJobs: Object.fromEntries(
      Object.entries(health.backupJobs).map(([jobKey, row]) => [jobKey, { lastStatus: row.lastStatus }]),
    ),
    probeConsecutiveFailRuns: health.probeOutbound.consecutiveFailRuns,
    videoTranscodeStatus: health.videoTranscode.status,
    cronJobs: health.cronJobs,
    operatorIncidentsOpenCount: health.operatorIncidentsOpen.length,
  });

  return {
    auditErrorCount,
    incidentsOpened,
    incidentsResolved,
    jobFailures,
    snapshotLines,
    suppressRecovery: params.suppressRecovery,
  };
}
