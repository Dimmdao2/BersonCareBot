import {
  classifyOperatorHealthBannerSignals,
  countActiveOutgoingDeliveryDead,
} from '@/modules/operator-health/criticalHealthSignals';
import { collectOperatorHealthBannerInput } from './collectCriticalHealthSignals';
import type { SystemHealthResponse } from './collectAdminSystemHealthData';
import type { OperatorHealthBannerInput } from '@/modules/operator-health/criticalHealthSignals';

const SYSTEM_HEALTH_HREF = '/app/admin/system-health';

export type AdminDoctorTodayHealthBanner =
  { show: true; href: string; title: string; tone?: 'warning' | 'stop' } | { show: false };

const BANNER_ON: AdminDoctorTodayHealthBanner = {
  show: true,
  href: SYSTEM_HEALTH_HREF,
  title: 'Требуется внимание к здоровью системы',
  tone: 'warning',
};

const DELIVERY_STOP_BANNER: AdminDoctorTodayHealthBanner = {
  show: true,
  href: SYSTEM_HEALTH_HREF,
  title: '🛑 ! Остановлена исходящая доставка',
  tone: 'stop',
};

function hasOutboundDeliveryStop(input: OperatorHealthBannerInput): boolean {
  return (
    countActiveOutgoingDeliveryDead(input.outgoingDelivery) > 0 ||
    (input.outboundDeliveryProvider?.openIncidentCount ?? 0) > 0 ||
    (input.outboundDeliveryProvider?.recentIncidentCount ?? 0) > 0
  );
}

function mapSystemHealthToBannerInput(s: SystemHealthResponse): OperatorHealthBannerInput {
  const backupJobs: Record<string, { lastStatus: string }> = {};
  for (const [jobKey, job] of Object.entries(s.backupJobs)) {
    backupJobs[jobKey] = { lastStatus: job.lastStatus };
  }

  return {
    webappDb: s.webappDb,
    integratorApi: s.integratorApi.status,
    outgoingDelivery: {
      deadTotal: s.outgoingDelivery.deadTotal,
      dueBacklog: s.outgoingDelivery.dueBacklog,
    },
    integratorPushOutbox: s.integratorPushOutbox,
    backupJobs,
    probeConsecutiveFailRuns: s.probeOutbound?.consecutiveFailRuns ?? 0,
    videoTranscodeStatus: s.videoTranscode.status,
    operatorIncidentsOpenCount: s.operatorIncidents.openCount,
  };
}

/**
 * Критерии баннера «Сегодня» — `classifyOperatorHealthBannerSignals` (матрица §3, warn + critical).
 */
export function adminDoctorTodayHealthBannerFromSystemHealth(
  s: SystemHealthResponse,
): AdminDoctorTodayHealthBanner {
  const input = mapSystemHealthToBannerInput(s);
  if (hasOutboundDeliveryStop(input)) return DELIVERY_STOP_BANNER;
  if (classifyOperatorHealthBannerSignals(input)) {
    return BANNER_ON;
  }
  return { show: false };
}

export async function loadAdminDoctorTodayHealthBanner(): Promise<AdminDoctorTodayHealthBanner> {
  const input = await collectOperatorHealthBannerInput();
  if (hasOutboundDeliveryStop(input)) return DELIVERY_STOP_BANNER;
  if (classifyOperatorHealthBannerSignals(input)) {
    return BANNER_ON;
  }
  return { show: false };
}
