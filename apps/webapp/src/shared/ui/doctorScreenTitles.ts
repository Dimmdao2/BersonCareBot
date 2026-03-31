/**
 * Заголовки экранов кабинета врача по pathname (сервер и клиент).
 */
export function getDoctorScreenTitle(pathname: string): string {
  const p = pathname.replace(/\/$/, "") || "/app/doctor";
  if (p === "/app/doctor") return "Обзор";

  const exact: Record<string, string> = {
    "/app/doctor/subscribers": "Подписчики",
    "/app/doctor/clients": "Клиенты",
    "/app/doctor/appointments": "Записи",
    "/app/doctor/messages": "Сообщения",
    "/app/doctor/broadcasts": "Рассылки",
    "/app/doctor/stats": "Статистика",
    "/app/doctor/content": "Контент",
    "/app/doctor/content/sections": "Разделы контента",
    "/app/doctor/content/sections/new": "Новый раздел",
    "/app/doctor/content/news": "Новости",
    "/app/doctor/content/motivation": "Мотивация",
    "/app/doctor/exercises": "Упражнения ЛФК",
    "/app/doctor/exercises/new": "Новое упражнение",
    "/app/doctor/lfk-templates": "Шаблоны ЛФК",
    "/app/doctor/lfk-templates/new": "Новый шаблон ЛФК",
  };
  if (exact[p]) return exact[p]!;

  if (p.startsWith("/app/doctor/subscribers/") && p !== "/app/doctor/subscribers") return "Подписчик";
  if (p.startsWith("/app/doctor/clients/") && p !== "/app/doctor/clients") return "Клиент";
  if (p.startsWith("/app/doctor/exercises/") && p !== "/app/doctor/exercises/new") return "Редактирование упражнения";
  if (p.startsWith("/app/doctor/lfk-templates/") && p !== "/app/doctor/lfk-templates/new")
    return "Конструктор шаблона ЛФК";
  if (p.startsWith("/app/doctor/content/sections/edit/")) return "Редактировать раздел";
  if (p.startsWith("/app/doctor/content/new")) return "Новая страница";
  if (p.includes("/app/doctor/content/edit")) return "Редактировать страницу";

  return "Кабинет";
}
