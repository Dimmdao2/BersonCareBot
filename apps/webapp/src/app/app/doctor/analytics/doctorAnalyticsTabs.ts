/**
 * Канонические вкладки раздела «Аналитика» кабинета врача — tenant/visibility-scoped rebuild
 * (docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md).
 *
 * `/app/doctor/analytics` — страница-шелл (`page.tsx` → `DoctorAnalyticsShell`).
 * Активная вкладка определяется по `?tab=` параметру. Ровно два первых-этапных разреза:
 *  - Записи — scoped appointments KPI/график/drill-down (`DoctorAppointmentsPort`);
 *  - Активность — фактическое выполнение назначенных программ (`program_action_log`).
 *
 * Прежние глобальные вкладки (Клиенты/Приложение/Контент/Сопровождение) сюда не возвращаются —
 * они читали платформенные агрегаты без organizationId/visibility actor (AN-SCOPE-01) и никогда
 * не были смонтированы под этим маршрутом. Платформенная аналитика теперь отдельно на
 * `/app/admin/analytics`.
 */

export const ANALYTICS_BASE = '/app/doctor/analytics';

export type AnalyticsTabId = 'records' | 'activity';

export type AnalyticsTab = {
  id: AnalyticsTabId;
  label: string;
  href: string;
};

export const ANALYTICS_TABS: AnalyticsTab[] = [
  { id: 'records', label: 'Записи', href: `${ANALYTICS_BASE}?tab=records` },
  { id: 'activity', label: 'Активность', href: `${ANALYTICS_BASE}?tab=activity` },
];

export const ANALYTICS_DEFAULT_TAB: AnalyticsTabId = 'records';

/** Нормализует значение `?tab=` к валидному id вкладки (fallback — records). */
export function analyticsTabFromQuery(tab: string | null | undefined): AnalyticsTabId {
  switch (tab) {
    case 'records':
      return 'records';
    case 'activity':
      return 'activity';
    default:
      return ANALYTICS_DEFAULT_TAB;
  }
}
