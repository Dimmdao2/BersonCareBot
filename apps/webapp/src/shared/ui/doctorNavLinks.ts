/** Пункт или разделитель бокового меню кабинета врача / админ-режима (Sheet и десктоп-сайдбар). */

export type DoctorMenuLinkItem = {
  kind: "link";
  id: string;
  label: string;
  href: string;
};

export type DoctorMenuSeparatorItem = {
  kind: "separator";
  id: string;
};

export type DoctorMenuEntry = DoctorMenuLinkItem | DoctorMenuSeparatorItem;

export const DOCTOR_MENU_ENTRIES: DoctorMenuEntry[] = [
  { kind: "link", id: "overview", label: "Обзор", href: "/app/doctor" },
  {
    kind: "link",
    id: "clients",
    label: "Клиенты и подписчики",
    href: "/app/doctor/clients?scope=appointments",
  },
  { kind: "link", id: "appointments", label: "Записи", href: "/app/doctor/appointments" },
  { kind: "link", id: "messages", label: "Сообщения", href: "/app/doctor/messages" },
  { kind: "separator", id: "sep-before-exercises" },
  { kind: "link", id: "exercises", label: "Упражнения", href: "/app/doctor/exercises" },
  { kind: "link", id: "lfk-templates", label: "Комплексы", href: "/app/doctor/lfk-templates" },
  { kind: "link", id: "clinical-tests", label: "Клинические тесты", href: "/app/doctor/clinical-tests" },
  { kind: "link", id: "test-sets", label: "Наборы тестов", href: "/app/doctor/test-sets" },
  { kind: "link", id: "recommendations", label: "Рекомендации", href: "/app/doctor/recommendations" },
  {
    kind: "link",
    id: "treatment-program-templates",
    label: "Шаблоны программ",
    href: "/app/doctor/treatment-program-templates",
  },
  { kind: "link", id: "courses-new", label: "Новый курс", href: "/app/doctor/courses/new" },
  { kind: "separator", id: "sep-before-references" },
  { kind: "link", id: "references", label: "Справочники", href: "/app/doctor/references" },
  { kind: "link", id: "patient-home", label: "Главная пациента", href: "/app/doctor/patient-home" },
  { kind: "link", id: "content", label: "CMS", href: "/app/doctor/content" },
  { kind: "link", id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" },
  { kind: "link", id: "stats", label: "Статистика", href: "/app/doctor/stats" },
];

/** Только ссылки — для мест, где нужен плоский список без разделителей. */
export const DOCTOR_MENU_LINKS: { id: string; label: string; href: string }[] = DOCTOR_MENU_ENTRIES.filter(
  (e): e is DoctorMenuLinkItem => e.kind === "link",
).map(({ id, label, href }) => ({ id, label, href }));

/** Активный пункт навигации по текущему пути. */
export function isDoctorNavItemActive(href: string, pathname: string): boolean {
  const [path] = href.split("?");
  const norm = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (path === "/app/doctor") {
    return norm === "/app/doctor";
  }
  return norm === path || norm.startsWith(`${path}/`);
}
