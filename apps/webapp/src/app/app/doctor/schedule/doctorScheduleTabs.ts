/**
 * Канонические вкладки раздела «Расписание» кабинета врача.
 *
 * `/app/doctor/schedule` — страница-шелл (`page.tsx` → `DoctorScheduleShell`).
 * Активная вкладка определяется по `?tab=` параметру.
 * Старые прямые URL (`/calendar`, `/admin/booking`, `/appointments`) → 308 на агрегатный URL
 * через `doctorRouteRedirects.ts`.
 */

export const SCHEDULE_BASE = "/app/doctor/schedule";

export type ScheduleTabId = "cal" | "work" | "setup";

export type ScheduleTab = {
  id: ScheduleTabId;
  label: string;
  href: string;
};

export const SCHEDULE_TABS: ScheduleTab[] = [
  { id: "cal", label: "Календарь записей", href: `${SCHEDULE_BASE}?tab=cal` },
  { id: "work", label: "График работы", href: `${SCHEDULE_BASE}?tab=work` },
  { id: "setup", label: "Настройки записи", href: `${SCHEDULE_BASE}?tab=setup` },
];

export const SCHEDULE_DEFAULT_TAB: ScheduleTabId = "cal";

/** Нормализует значение `?tab=` к валидному id вкладки (fallback — cal). */
export function scheduleTabFromQuery(tab: string | null | undefined): ScheduleTabId {
  switch (tab) {
    case "cal":
      return "cal";
    case "work":
      return "work";
    case "setup":
      return "setup";
    default:
      return SCHEDULE_DEFAULT_TAB;
  }
}
