import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import type { ScheduleKpis } from "@/modules/doctor-appointments/ports";
import type { DoctorAppointmentStatsFilter } from "@/modules/doctor-appointments/ports";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

type AppDeps = {
  doctorAppointments: {
    getScheduleKpis(
      filter: DoctorAppointmentStatsFilter,
      audience?: { excludedUserIds?: string[] },
    ): Promise<ScheduleKpis>;
  };
};

/** Резолвит пресет периода из строкового значения URL-параметра. Fallback — "month" (30 дн). */
export function resolveSchedulePeriodPreset(raw: string | null | undefined): AdminStatsTimePreset {
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  return "month";
}

/**
 * SSR-загрузчик KPI для страницы «Расписание».
 * Вызывается из `page.tsx` (server component).
 */
export async function loadDoctorScheduleKpis(
  deps: AppDeps,
  period: AdminStatsTimePreset,
  audience?: { excludedUserIds?: string[] },
): Promise<ScheduleKpis> {
  const tz = await getAppDisplayTimeZone();
  const filter: DoctorAppointmentStatsFilter = { kind: "preset", preset: period };
  return deps.doctorAppointments.getScheduleKpis(filter, audience);
}
