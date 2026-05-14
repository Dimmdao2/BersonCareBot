import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "@/modules/operator-health/adminHealthThresholds";
import { collectAdminSystemHealthData, type SystemHealthResponse } from "./collectAdminSystemHealthData";

const SYSTEM_HEALTH_HREF = "/app/settings?adminTab=system-health";

export type AdminDoctorTodayHealthBanner =
  | { show: true; href: string; title: string }
  | { show: false };

const BANNER_ON: AdminDoctorTodayHealthBanner = {
  show: true,
  href: SYSTEM_HEALTH_HREF,
  title: "Требуется внимание к здоровью системы",
};

/**
 * Те же критерии «важно для оператора», что и сводка `GET /api/admin/system-health`
 * (без дублирования порогов в нескольких местах вручную).
 */
export function adminDoctorTodayHealthBannerFromSystemHealth(s: SystemHealthResponse): AdminDoctorTodayHealthBanner {
  if (s.webappDb === "down") return BANNER_ON;
  if (s.integratorApi.status !== "ok") return BANNER_ON;
  if (s.projection.status !== "ok") return BANNER_ON;
  if (s.mediaPreview.status === "error") return BANNER_ON;
  if (s.videoPlayback.status === "error") return BANNER_ON;
  if (s.videoPlaybackClient.status !== "ok") return BANNER_ON;
  if (s.videoTranscode.status === "error") return BANNER_ON;
  if (s.videoTranscode.pipelineEnabled && s.videoTranscode.failedLastHour > 0) return BANNER_ON;
  if (Object.values(s.backupJobs).some((j) => j.lastStatus === "failure")) return BANNER_ON;
  if (s.operatorIncidentsOpen.length > 0) return BANNER_ON;
  const od = s.outgoingDelivery;
  if (od.deadTotal > 0 || od.dueBacklog >= ADMIN_DELIVERY_DUE_BACKLOG_WARNING) return BANNER_ON;
  return { show: false };
}

export async function loadAdminDoctorTodayHealthBanner(): Promise<AdminDoctorTodayHealthBanner> {
  const snapshot = await collectAdminSystemHealthData();
  return adminDoctorTodayHealthBannerFromSystemHealth(snapshot);
}
