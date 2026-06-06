import { routePaths } from "@/app-layer/routes/paths";
import { BOOKING_ADMIN_BASE, BOOKING_ADMIN_TABS, bookingAdminTabFromPathname } from "@/app/app/doctor/admin/booking/bookingAdminTabs";

/**
 * Заголовки экранов кабинета врача по pathname (сервер и клиент).
 */
export function getDoctorScreenTitle(pathname: string): string {
  const p = pathname.replace(/\/$/, "") || "/app/doctor";
  if (p === "/app/doctor") return "Сегодня";

  const exact: Record<string, string> = {
    [routePaths.doctorInstall]: "Установить приложение",
    "/app/settings": "Настройки специалиста",
    "/app/doctor/analytics/clients": "По клиентам",
    "/app/doctor/analytics/notifications": "По уведомлениям",
    "/app/doctor/system-health": "Здоровье системы",
    "/app/doctor/health-archive": "Архив сбоев",
    "/app/doctor/audit-log": "Журнал операций",
    "/app/doctor/admin/app-settings": "Настройки приложения",
    "/app/doctor/admin/auth": "Авторизация",
    "/app/doctor/admin/integrations": "Интеграции",
    "/app/doctor/admin/booking": "Настройки записи",
    "/app/doctor/admin/technical": "Технические режимы",
    "/app/doctor/clients": "Клиенты",
    "/app/doctor/appointments": "Записи",
    "/app/doctor/calendar": "Календарь",
    "/app/doctor/messages": "Сообщения",
    "/app/doctor/online-intake": "Онлайн-заявки",
    "/app/doctor/broadcasts": "Рассылки",
    "/app/doctor/stats": "По клиентам",
    "/app/doctor/material-ratings": "По контенту",
    "/app/doctor/usage": "Использование",
    "/app/doctor/content": "Материалы",
    "/app/doctor/content/library": "Библиотека файлов",
    "/app/doctor/content/news": "Мотивация",
    "/app/doctor/content/motivation": "Мотивация",
    "/app/doctor/content/sections": "Разделы контента",
    "/app/doctor/content/sections/new": "Новый раздел",
    "/app/doctor/exercises": "Упражнения ЛФК",
    "/app/doctor/exercises/new": "Новое упражнение",
    "/app/doctor/clinical-tests": "Клинические тесты",
    "/app/doctor/clinical-tests/new": "Новый тест",
    "/app/doctor/test-sets": "Наборы тестов",
    "/app/doctor/test-sets/new": "Новый набор тестов",
    "/app/doctor/recommendations": "Рекомендации",
    "/app/doctor/recommendations/new": "Новая рекомендация",
    "/app/doctor/treatment-program-templates": "Шаблоны программ",
    "/app/doctor/treatment-program-templates/new": "Новый шаблон программы",
    "/app/doctor/treatment-program-promo": "Промо-программа",
    "/app/doctor/courses": "Курсы",
    "/app/doctor/courses/new": "Новый курс",
    "/app/doctor/lfk-templates": "Комплексы",
    "/app/doctor/lfk-templates/new": "Новый комплекс",
    "/app/doctor/references": "Справочники",
  };
  if (exact[p]) return exact[p]!;

  if (p === BOOKING_ADMIN_BASE || p.startsWith(`${BOOKING_ADMIN_BASE}/`)) {
    const tabId = bookingAdminTabFromPathname(p);
    const tab = BOOKING_ADMIN_TABS.find((t) => t.id === tabId);
    if (tab && tab.id !== "overview") return `Настройки записи — ${tab.label}`;
    return "Настройки записи";
  }

  if (p === "/app/doctor/subscribers") return "Клиенты";
  if (p.startsWith("/app/doctor/subscribers/")) return "Клиент";
  if (/\/treatment-programs\//.test(p) && p.startsWith("/app/doctor/clients/")) return "Программа пациента";
  if (p.startsWith("/app/doctor/clients/") && p !== "/app/doctor/clients") return "Клиент";
  if (p.startsWith("/app/doctor/exercises/") && p !== "/app/doctor/exercises/new") return "Редактирование упражнения";
  if (p.startsWith("/app/doctor/clinical-tests/") && p !== "/app/doctor/clinical-tests/new")
    return "Редактирование теста";
  if (p.startsWith("/app/doctor/test-sets/") && p !== "/app/doctor/test-sets/new") return "Набор тестов";
  if (p.startsWith("/app/doctor/recommendations/") && p !== "/app/doctor/recommendations/new")
    return "Редактирование рекомендации";
  if (
    p.startsWith("/app/doctor/treatment-program-templates/") &&
    p !== "/app/doctor/treatment-program-templates/new"
  )
    return "Конструктор программы";
  if (p.startsWith("/app/doctor/lfk-templates/") && p !== "/app/doctor/lfk-templates/new")
    return "Конструктор комплекса";
  if (p.startsWith("/app/doctor/references/")) return "Редактирование справочника";
  if (p.startsWith("/app/doctor/content/sections/edit/")) return "Редактировать раздел";
  if (p.startsWith("/app/doctor/content/new")) return "Новая страница";
  if (p.includes("/app/doctor/content/edit")) return "Редактировать страницу";
  if (/^\/app\/doctor\/courses\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) {
    return "Редактирование курса";
  }

  return "Кабинет";
}
