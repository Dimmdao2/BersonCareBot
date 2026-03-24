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
    "/app/doctor/content/news": "Новости и мотивация",
    "/app/doctor/references": "Справочники",
  };
  if (exact[p]) return exact[p]!;

  if (p.startsWith("/app/doctor/subscribers/") && p !== "/app/doctor/subscribers") return "Подписчик";
  if (p.startsWith("/app/doctor/clients/") && p !== "/app/doctor/clients") return "Клиент";
  if (p.startsWith("/app/doctor/content/new")) return "Новая страница";
  if (p.includes("/app/doctor/content/edit")) return "Редактировать страницу";

  return "Кабинет";
}
