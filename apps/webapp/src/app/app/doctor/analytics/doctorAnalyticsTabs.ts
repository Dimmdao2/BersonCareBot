/**
 * Канонические вкладки раздела «Аналитика» кабинета врача.
 *
 * `/app/doctor/analytics` — страница-шелл (`page.tsx` → `DoctorAnalyticsShell`).
 * Активная вкладка определяется по `?tab=` параметру.
 * Старые прямые URL подразделов аналитики (`/analytics/clients`, `/usage`,
 * `/analytics/notifications`) → 308 на агрегатный URL через `doctorRouteRedirects.ts`.
 *
 * Вопрос «на что отвечает вкладка» (канон 2026-06-14):
 *  - Клиенты — кто наши клиенты/потенциальные, воронка записи;
 *  - Контент — как используют материалы (оценки, завершения, открытия видео);
 *  - Приложение — охват приложения и push, частота заходов;
 *  - Уведомления — напоминания (авто) и рассылки (доставка + реакция).
 */

export const ANALYTICS_BASE = "/app/doctor/analytics";

export type AnalyticsTabId = "clients" | "content" | "app" | "notifications";

export type AnalyticsTab = {
  id: AnalyticsTabId;
  label: string;
  href: string;
};

export const ANALYTICS_TABS: AnalyticsTab[] = [
  { id: "clients", label: "Клиенты", href: `${ANALYTICS_BASE}?tab=clients` },
  { id: "content", label: "Контент", href: `${ANALYTICS_BASE}?tab=content` },
  { id: "app", label: "Приложение", href: `${ANALYTICS_BASE}?tab=app` },
  { id: "notifications", label: "Уведомления", href: `${ANALYTICS_BASE}?tab=notifications` },
];

export const ANALYTICS_DEFAULT_TAB: AnalyticsTabId = "clients";

/** Нормализует значение `?tab=` к валидному id вкладки (fallback — clients). */
export function analyticsTabFromQuery(tab: string | null | undefined): AnalyticsTabId {
  switch (tab) {
    case "clients":
      return "clients";
    case "content":
      return "content";
    case "app":
      return "app";
    case "notifications":
      return "notifications";
    default:
      return ANALYTICS_DEFAULT_TAB;
  }
}
