import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { resolveAdminStatsLocalRange } from "@/modules/admin-platform-stats/registrationTimeRange";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const AUDIT_LOG_HREF = "/app/doctor/audit-log";

export type AdminRegistrationFailureAttention =
  | { show: true; href: string; title: string; count: number }
  | { show: false };

/** Системные сбои регистрации за неделю — баннер на «Сегодня» для admin. */
export async function loadAdminRegistrationFailureAttention(): Promise<AdminRegistrationFailureAttention> {
  const iana = await getAppDisplayTimeZone();
  const range = resolveAdminStatsLocalRange(iana, "week", undefined, undefined);
  const deps = buildAppDeps();
  const { total } = await deps.productAnalytics.listRegistrationEvents({
    startIso: range.startUtcIso,
    endExclusiveIso: range.endExclusiveUtcIso,
    eventType: "auth_register_failure",
    errorClass: "system",
    page: 1,
    limit: 1,
  });

  if (!Number.isFinite(total) || total <= 0) {
    return { show: false };
  }

  const n = Math.floor(total);
  const word = n === 1 ? "сбой" : n >= 2 && n <= 4 ? "сбоя" : "сбоев";
  return {
    show: true,
    href: AUDIT_LOG_HREF,
    title: `Сбои регистрации за неделю: ${n} ${word}`,
    count: n,
  };
}
