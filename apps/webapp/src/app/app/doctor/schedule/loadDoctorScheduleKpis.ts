import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import type { ScheduleKpis, ScheduleKpisQuery } from "@/modules/doctor-appointments/ports";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

type AppDeps = {
  doctorAppointments: {
    getScheduleKpis(
      query: ScheduleKpisQuery,
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
 * Строит ScheduleKpisQuery по пресету (today..today+2 в бизнес-таймзоне).
 * Используется шеллом/роутом на переходный период до переноса KPI в таб «Записи» (этапы D/F).
 */
export function buildKpisQueryFromPreset(preset: AdminStatsTimePreset, tz: string): ScheduleKpisQuery {
  const now = new Date();
  // Текущая дата в бизнес-таймзоне (YYYY-MM-DD)
  const todayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(now);

  if (preset === "day") {
    // Сегодня: [today 00:00, tomorrow 00:00)
    const from = `${todayKey}T00:00:00`;
    const to = offsetDateKey(todayKey, 1, tz) + "T00:00:00";
    return { from, to };
  }
  if (preset === "week") {
    // 7 дней: [today 00:00, today+7 00:00)
    const from = `${todayKey}T00:00:00`;
    const to = offsetDateKey(todayKey, 7, tz) + "T00:00:00";
    return { from, to };
  }
  // default "month" / "custom" — дефолт 3 дня (today..today+3) для обратной совместимости
  const from = `${todayKey}T00:00:00`;
  const to = offsetDateKey(todayKey, 3, tz) + "T00:00:00";
  return { from, to };
}

function offsetDateKey(dateKey: string, days: number, _tz: string): string {
  // Simple date arithmetic on YYYY-MM-DD string
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * SSR-загрузчик KPI для страницы «Расписание».
 * Вызывается из `page.tsx` (server component) и роута.
 * Передаёт дефолтный диапазон «3 дня»: today..today+2 в бизнес-таймзоне.
 * После этапа D/F KPI переедет полностью в таб «Записи» и этот загрузчик будет упразднён.
 */
export async function loadDoctorScheduleKpis(
  deps: AppDeps,
  period: AdminStatsTimePreset,
  audience?: { excludedUserIds?: string[] },
): Promise<ScheduleKpis> {
  const tz = await getAppDisplayTimeZone();
  const query = buildKpisQueryFromPreset(period, tz);
  return deps.doctorAppointments.getScheduleKpis(query, audience);
}
