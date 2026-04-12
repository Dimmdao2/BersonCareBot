/** Пункты бокового меню кабинета врача / админ-режима (Sheet и десктоп-сайдбар). */
export const DOCTOR_MENU_LINKS: { id: string; label: string; href: string }[] = [
  { id: "overview", label: "Обзор", href: "/app/doctor" },
  { id: "clients", label: "Клиенты и подписчики", href: "/app/doctor/clients?scope=appointments" },
  { id: "appointments", label: "Записи", href: "/app/doctor/appointments" },
  { id: "messages", label: "Сообщения", href: "/app/doctor/messages" },
  { id: "exercises", label: "Упражнения", href: "/app/doctor/exercises" },
  { id: "lfk-templates", label: "Шаблоны ЛФК", href: "/app/doctor/lfk-templates" },
  { id: "content", label: "CMS", href: "/app/doctor/content" },
  { id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" },
  { id: "stats", label: "Статистика", href: "/app/doctor/stats" },
];

/** Активный пункт навигации по текущему пути. */
export function isDoctorNavItemActive(href: string, pathname: string): boolean {
  const [path] = href.split("?");
  const norm = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (path === "/app/doctor") {
    return norm === "/app/doctor";
  }
  return norm === path || norm.startsWith(`${path}/`);
}
