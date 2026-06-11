/** Навигация кабинета врача: плоский список из 9 верхнеуровневых пунктов (desktop sidebar и mobile Sheet). */

import { routePaths } from "@/app-layer/routes/paths";
import type { UserRole } from "@/shared/types/session";

/** Устаревший ключ: один открытый кластер. Читается только для миграции в формат множества. */
export const DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY = "doctorMenu.openCluster.v1";

/** Ключ localStorage: JSON-массив с одним id открытого кластера (аккордеон — только один блок). */
export const DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY = "doctorMenu.openClusters.v1";

/** Дефолтный открытый кластер при первом заходе. */
export const DOCTOR_MENU_DEFAULT_CLUSTER_ID = "library";

/** Ключ счётчика для бейджа пункта меню врача (навигация). */
export type DoctorMenuBadgeKey =
  | "onlineIntakeNew"
  | "messagesUnread"
  | "registrationSystemFailures"
  | "pendingProgramTests"
  | "todayAttention"
  | "communicationsTotal";

export type DoctorMenuLinkItem = {
  id: string;
  label: string;
  href?: string;
  /** Подпункты — пункт рендерится как раскрывающийся аккордеон без перехода по клику. */
  items?: DoctorMenuLinkItem[];
  badgeKey?: DoctorMenuBadgeKey;
  requiresAdminMode?: boolean;
};

export type DoctorMenuAccess = {
  role: UserRole;
  adminMode: boolean;
};

export function isDoctorMenuLinkVisible(item: DoctorMenuLinkItem, access: DoctorMenuAccess): boolean {
  if (!item.requiresAdminMode) return true;
  return access.role === "admin";
}

const RAW_DOCTOR_MENU_ITEMS: DoctorMenuLinkItem[] = [
  { id: "today", label: "Сегодня", href: "/app/doctor", badgeKey: "todayAttention" },
  { id: "clients", label: "Пациенты", href: "/app/doctor/clients?scope=appointments" },
  { id: "schedule", label: "Расписание", href: routePaths.doctorSchedule },
  {
    id: "communications",
    label: "Коммуникации",
    href: routePaths.doctorCommunications,
    badgeKey: "communicationsTotal",
  },
  {
    id: "library",
    label: "Библиотека",
    items: [
      { id: "exercises", label: "Упражнения", href: "/app/doctor/exercises" },
      { id: "lfk-templates", label: "Комплексы ЛФК", href: "/app/doctor/lfk-templates" },
      { id: "clinical-tests", label: "Клинические тесты", href: "/app/doctor/clinical-tests" },
      { id: "test-sets", label: "Наборы тестов", href: "/app/doctor/test-sets" },
      { id: "recommendations", label: "Рекомендации", href: "/app/doctor/recommendations" },
      {
        id: "treatment-program-templates",
        label: "Шаблоны программ",
        href: "/app/doctor/treatment-program-templates",
      },
      {
        id: "treatment-program-promo",
        label: "Промо-программа",
        href: "/app/doctor/treatment-program-promo",
      },
      { id: "courses", label: "Курсы", href: "/app/doctor/courses" },
      { id: "references", label: "Справочники", href: "/app/doctor/references" },
    ],
  },
  { id: "content", label: "Контент", href: "/app/doctor/content" },
  {
    id: "analytics",
    label: "Аналитика",
    items: [
      {
        id: "analytics-clients",
        label: "По клиентам",
        href: "/app/doctor/analytics/clients",
        requiresAdminMode: true,
      },
      {
        id: "material-ratings",
        label: "По контенту",
        href: "/app/doctor/material-ratings",
        requiresAdminMode: true,
      },
      {
        id: "analytics-notifications",
        label: "По уведомлениям",
        href: "/app/doctor/analytics/notifications",
        requiresAdminMode: true,
      },
      {
        id: "usage",
        label: "Использование",
        href: "/app/doctor/usage",
        requiresAdminMode: true,
      },
    ],
  },
  {
    id: "settings",
    label: "Настройки",
    requiresAdminMode: true,
    items: [
      {
        id: "admin-app-settings",
        label: "Настройки приложения",
        href: "/app/doctor/admin/app-settings",
      },
      { id: "admin-auth", label: "Авторизация", href: "/app/doctor/admin/auth" },
      { id: "admin-integrations", label: "Интеграции", href: "/app/doctor/admin/integrations" },
      { id: "admin-technical", label: "Технические режимы", href: "/app/doctor/admin/technical" },
    ],
  },
  {
    id: "system",
    label: "Система",
    requiresAdminMode: true,
    items: [
      { id: "system-health", label: "Здоровье системы", href: "/app/doctor/system-health" },
      { id: "health-archive", label: "Архив сбоев", href: "/app/doctor/health-archive" },
      {
        id: "audit-log",
        label: "Журнал операций",
        href: "/app/doctor/audit-log",
        badgeKey: "registrationSystemFailures",
      },
      { id: "booking-merge", label: "Мердж пациентов", href: "/app/doctor/booking-merge" },
    ],
  },
];

/**
 * Плоский список из 9 верхнеуровневых пунктов с применённой фильтрацией по `requiresAdminMode`.
 * Подпункты у раскрывающихся пунктов тоже фильтруются; если все подпункты отфильтровались и `href` нет —
 * пункт не попадает в результат.
 */
export function getDoctorMenuItems(access: DoctorMenuAccess): DoctorMenuLinkItem[] {
  return RAW_DOCTOR_MENU_ITEMS.filter((item) => isDoctorMenuLinkVisible(item, access))
    .map((item) => {
      if (!item.items) return item;
      const filtered = item.items.filter((sub) => isDoctorMenuLinkVisible(sub, access));
      return { ...item, items: filtered };
    })
    .filter((item) => !item.items || item.items.length > 0 || item.href !== undefined);
}

/** Возвращает `true` если пункт с таким `id` является раскрывающимся (имеет `items`). */
export function isDoctorMenuClusterId(id: string): boolean {
  return RAW_DOCTOR_MENU_ITEMS.some((i) => i.id === id && !!i.items);
}

/** Плоский список всех пунктов навигации (верхнеуровневые ссылки + подпункты), без служебных действий. */
export const DOCTOR_MENU_LINKS: DoctorMenuLinkItem[] = RAW_DOCTOR_MENU_ITEMS.flatMap((item) =>
  item.items ? item.items : [item],
);

/** Активный пункт навигации по текущему пути. */
export function isDoctorNavItemActive(href: string, pathname: string): boolean {
  const [path] = href.split("?");
  const norm = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (path === "/app/doctor") {
    return norm === "/app/doctor";
  }
  /** Хаб CMS не считается активным на странице медиатеки (отдельный пункт меню). */
  if (path === "/app/doctor/content") {
    if (norm === "/app/doctor/content") return true;
    if (norm.startsWith("/app/doctor/content/library")) return false;
    return norm.startsWith(`${path}/`);
  }
  return norm === path || norm.startsWith(`${path}/`);
}
