/** Навигация кабинета врача: кластеры + отдельные верхнеуровневые ссылки (desktop sidebar и mobile Sheet). */

import { routePaths } from "@/app-layer/routes/paths";
import type { UserRole } from "@/shared/types/session";

/** Устаревший ключ: один открытый кластер. Читается только для миграции в формат множества. */
export const DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY = "doctorMenu.openCluster.v1";

/** Ключ localStorage: JSON-массив id открытых кластеров (независимое сворачивание секций). */
export const DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY = "doctorMenu.openClusters.v1";

/** Дефолтный открытый кластер при первом заходе. */
export const DOCTOR_MENU_DEFAULT_CLUSTER_ID = "patients-work";

/** Ключ счётчика для бейджа пункта меню врача (навигация). */
export type DoctorMenuBadgeKey = "onlineIntakeNew" | "messagesUnread";

export type DoctorMenuLinkItem = {
  id: string;
  label: string;
  href: string;
  badgeKey?: DoctorMenuBadgeKey;
  /** Пункт виден только при role=admin и включённом admin mode (как admin API). */
  requiresAdminMode?: boolean;
};

export type DoctorMenuAccess = {
  role: UserRole;
  adminMode: boolean;
};

export function isDoctorMenuLinkVisible(item: DoctorMenuLinkItem, access: DoctorMenuAccess): boolean {
  if (!item.requiresAdminMode) return true;
  return access.role === "admin" && access.adminMode;
}

export type DoctorMenuCluster = {
  id: string;
  label: string;
  items: DoctorMenuLinkItem[];
};

export type DoctorMenuRenderSection =
  | { type: "cluster"; cluster: DoctorMenuCluster }
  | { type: "standalone"; links: DoctorMenuLinkItem[] };

const CLUSTER_PATIENTS_WORK: DoctorMenuCluster = {
  id: "patients-work",
  label: "Работа с пациентами",
  items: [
    { id: "overview", label: "Сегодня", href: "/app/doctor" },
    {
      id: "clients",
      label: "Пациенты",
      href: "/app/doctor/clients?scope=appointments",
    },
    { id: "appointments", label: "Записи", href: "/app/doctor/appointments" },
    {
      id: "online-intake",
      label: "Онлайн-заявки",
      href: routePaths.doctorOnlineIntake,
      badgeKey: "onlineIntakeNew",
    },
    {
      id: "messages",
      label: "Сообщения",
      href: "/app/doctor/messages",
      badgeKey: "messagesUnread",
    },
  ],
};

const CLUSTER_ASSIGNMENTS: DoctorMenuCluster = {
  id: "assignments",
  label: "Назначения",
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
  ],
};

const CLUSTER_APP_CONTENT: DoctorMenuCluster = {
  id: "app-content",
  label: "Контент приложения",
  items: [
    { id: "patient-home", label: "Главная пациента", href: "/app/doctor/patient-home" },
    { id: "content", label: "CMS", href: "/app/doctor/content" },
    { id: "material-ratings", label: "Статистика материалов", href: "/app/doctor/material-ratings" },
  ],
};

const CLUSTER_COMMUNICATIONS: DoctorMenuCluster = {
  id: "communications",
  label: "Коммуникации",
  items: [{ id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" }],
};

const CLUSTER_SYSTEM: DoctorMenuCluster = {
  id: "system",
  label: "Система",
  items: [
    { id: "references", label: "Справочники", href: "/app/doctor/references" },
    { id: "stats", label: "Статистика", href: "/app/doctor/stats" },
    {
      id: "usage",
      label: "Использование",
      href: "/app/doctor/usage",
      requiresAdminMode: true,
    },
  ],
};

/** Все кластеры в каноническом порядке (без учёта позиции standalone между блоками). */
export const DOCTOR_MENU_CLUSTERS: DoctorMenuCluster[] = [
  CLUSTER_PATIENTS_WORK,
  CLUSTER_ASSIGNMENTS,
  CLUSTER_APP_CONTENT,
  CLUSTER_COMMUNICATIONS,
  CLUSTER_SYSTEM,
];

/** Верхнеуровневые ссылки вне кластеров (по ТЗ — между «Контент приложения» и «Коммуникации» при рендере). */
export const DOCTOR_MENU_STANDALONE_LINKS: DoctorMenuLinkItem[] = [
  {
    id: "library",
    label: "Библиотека файлов",
    href: "/app/doctor/content/library",
  },
];

function filterMenuLinks(items: DoctorMenuLinkItem[], access: DoctorMenuAccess): DoctorMenuLinkItem[] {
  return items.filter((item) => isDoctorMenuLinkVisible(item, access));
}

/**
 * Порядок секций для sidebar/Sheet: три кластера, затем standalone «Библиотека файлов», затем коммуникации и система.
 */
export function getDoctorMenuRenderSections(access: DoctorMenuAccess): DoctorMenuRenderSection[] {
  const raw: DoctorMenuRenderSection[] = [
    { type: "cluster", cluster: CLUSTER_PATIENTS_WORK },
    { type: "cluster", cluster: CLUSTER_ASSIGNMENTS },
    { type: "cluster", cluster: CLUSTER_APP_CONTENT },
    { type: "standalone", links: DOCTOR_MENU_STANDALONE_LINKS },
    { type: "cluster", cluster: CLUSTER_COMMUNICATIONS },
    { type: "cluster", cluster: CLUSTER_SYSTEM },
  ];

  return raw.flatMap((section) => {
    if (section.type === "standalone") {
      const links = filterMenuLinks(section.links, access);
      return links.length > 0 ? [{ type: "standalone" as const, links }] : [];
    }
    const items = filterMenuLinks(section.cluster.items, access);
    return items.length > 0 ? [{ type: "cluster" as const, cluster: { ...section.cluster, items } }] : [];
  });
}

export function isDoctorMenuClusterId(id: string): boolean {
  return DOCTOR_MENU_CLUSTERS.some((c) => c.id === id);
}

/** Плоский список всех пунктов навигации (кластеры + standalone), без служебных действий. */
export const DOCTOR_MENU_LINKS: DoctorMenuLinkItem[] = (() => {
  const fromClusters = DOCTOR_MENU_CLUSTERS.flatMap((c) => c.items);
  return [...fromClusters, ...DOCTOR_MENU_STANDALONE_LINKS];
})();

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
