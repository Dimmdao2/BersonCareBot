import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { collectAdminSystemHealthData } from "@/app-layer/health/collectAdminSystemHealthData";
import type { OperatorHealthDigestInput } from "@/modules/operator-health/buildOperatorHealthDigest";
import { extractDigestDegradedLines } from "@/modules/operator-health/extractDigestDegradedLines";

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
  const degradedLines = extractDigestDegradedLines({
    projection: {
      probeStatus: health.projection.status,
      deadCount: typeof projectionSnapshot?.deadCount === "number" ? projectionSnapshot.deadCount : 0,
      retriesOverThreshold:
        typeof projectionSnapshot?.retriesOverThreshold === "number"
          ? projectionSnapshot.retriesOverThreshold
          : 0,
    },
    outgoingDelivery: {
      dueBacklog: health.outgoingDelivery.dueBacklog,
      deadTotal: health.outgoingDelivery.deadTotal,
    },
    integratorPushOutbox: health.integratorPushOutbox,
    videoTranscodeStatus: health.videoTranscode.status,
    cronJobs: health.cronJobs,
    operatorIncidentsOpenCount: health.operatorIncidentsOpen.length,
  });

  return {
    auditErrorCount,
    incidentsOpened,
    incidentsResolved,
    jobFailures,
    degradedLines,
    suppressRecovery: params.suppressRecovery,
  };
}
