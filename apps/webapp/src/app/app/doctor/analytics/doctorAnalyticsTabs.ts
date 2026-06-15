/**
 * Канонические вкладки раздела «Аналитика» кабинета врача.
 *
 * `/app/doctor/analytics` — страница-шелл (`page.tsx` → `DoctorAnalyticsShell`).
 * Активная вкладка определяется по `?tab=` параметру.
 * Старые прямые URL подразделов аналитики (`/analytics/clients`, `/usage`,
 * `/analytics/notifications`) → 308 на агрегатный URL через `doctorRouteRedirects.ts`.
 *
 * Вопрос «на что отвечает вкладка» (канон 2026-06-14, пересмотрено S4.2):
 *  - Клиенты — кто наши клиенты/потенциальные, воронка записи;
 *  - Приложение — охват приложения и push, частота заходов + push-доставка;
 *  - Контент — как используют материалы (оценки, завершения, открытия видео);
 *  - Сопровождение — выполнение программ, активные на сопровождении, динамика.
 *
 * Вкладка «Уведомления» (notifications) упразднена как отдельная —
 * push-статистика перенесена в «Приложение». Backward-compat: `?tab=notifications`
 * → «Приложение».
 */

export const ANALYTICS_BASE = "/app/doctor/analytics";

export type AnalyticsTabId = "clients" | "app" | "content" | "soprovozhdenie";

export type AnalyticsTab = {
  id: AnalyticsTabId;
  label: string;
  href: string;
};

export const ANALYTICS_TABS: AnalyticsTab[] = [
  { id: "clients", label: "Клиенты", href: `${ANALYTICS_BASE}?tab=clients` },
  { id: "app", label: "Приложение", href: `${ANALYTICS_BASE}?tab=app` },
  { id: "content", label: "Контент", href: `${ANALYTICS_BASE}?tab=content` },
  { id: "soprovozhdenie", label: "Сопровождение", href: `${ANALYTICS_BASE}?tab=soprovozhdenie` },
];

export const ANALYTICS_DEFAULT_TAB: AnalyticsTabId = "clients";

/** Нормализует значение `?tab=` к валидному id вкладки (fallback — clients).
 *  `notifications` → `app` для backward compatibility. */
export function analyticsTabFromQuery(tab: string | null | undefined): AnalyticsTabId {
  switch (tab) {
    case "clients":
      return "clients";
    case "app":
      return "app";
    // backward compat: old notifications tab redirects to app
    case "notifications":
      return "app";
    case "content":
      return "content";
    case "soprovozhdenie":
      return "soprovozhdenie";
    default:
      return ANALYTICS_DEFAULT_TAB;
  }
}
