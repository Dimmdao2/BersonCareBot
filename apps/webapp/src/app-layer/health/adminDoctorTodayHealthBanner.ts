import { classifyOperatorHealthBannerSignals } from "@/modules/operator-health/criticalHealthSignals";
import { collectOperatorHealthBannerInput } from "./collectCriticalHealthSignals";
import type { SystemHealthResponse } from "./collectAdminSystemHealthData";
import type { OperatorHealthBannerInput } from "@/modules/operator-health/criticalHealthSignals";

const SYSTEM_HEALTH_HREF = "/app/doctor/system-health";

export type AdminDoctorTodayHealthBanner =
  | { show: true; href: string; title: string }
  | { show: false };

const BANNER_ON: AdminDoctorTodayHealthBanner = {
  show: true,
  href: SYSTEM_HEALTH_HREF,
  title: "Требуется внимание к здоровью системы",
};

function mapSystemHealthToBannerInput(s: SystemHealthResponse): OperatorHealthBannerInput {
  const snap = s.projection.snapshot;
  const deadCount = typeof snap?.deadCount === "number" ? snap.deadCount : 0;
  const retriesOverThreshold =
    typeof snap?.retriesOverThreshold === "number" ? snap.retriesOverThreshold : 0;

  const backupJobs: Record<string, { lastStatus: string }> = {};
  for (const [jobKey, job] of Object.entries(s.backupJobs)) {
    backupJobs[jobKey] = { lastStatus: job.lastStatus };
  }

  return {
    webappDb: s.webappDb,
    integratorApi: s.integratorApi.status,
    projection: {
      probeStatus: s.projection.status,
      deadCount,
      retriesOverThreshold,
    },
    outgoingDelivery: {
      deadTotal: s.outgoingDelivery.deadTotal,
      dueBacklog: s.outgoingDelivery.dueBacklog,
    },
    integratorPushOutbox: s.integratorPushOutbox,
    backupJobs,
    probeConsecutiveFailRuns: s.probeOutbound?.consecutiveFailRuns ?? 0,
    videoTranscodeStatus: s.videoTranscode.status,
    operatorIncidentsOpenCount: s.operatorIncidentsOpen.length,
  };
}

/**
 * Критерии баннера «Сегодня» — `classifyOperatorHealthBannerSignals` (матрица §3, warn + critical).
 */
export function adminDoctorTodayHealthBannerFromSystemHealth(s: SystemHealthResponse): AdminDoctorTodayHealthBanner {
  if (classifyOperatorHealthBannerSignals(mapSystemHealthToBannerInput(s))) {
    return BANNER_ON;
  }
  return { show: false };
}

export async function loadAdminDoctorTodayHealthBanner(): Promise<AdminDoctorTodayHealthBanner> {
  const input = await collectOperatorHealthBannerInput();
  if (classifyOperatorHealthBannerSignals(input)) {
    return BANNER_ON;
  }
  return { show: false };
}
