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
export type DoctorMenuBadgeKey = "onlineIntakeNew" | "messagesUnread" | "registrationSystemFailures";

export type DoctorMenuLinkItem = {
  id: string;
  label: string;
  href: string;
  badgeKey?: DoctorMenuBadgeKey;
  /** Пункт виден только при role=admin (как admin API). */
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
    {
      id: "clients",
      label: "Пациенты",
      href: "/app/doctor/clients?scope=appointments",
    },
    { id: "appointments", label: "Записи", href: "/app/doctor/appointments" },
    {
      id: "booking-merge",
      label: "Мердж пациентов",
      href: "/app/doctor/booking-merge",
      requiresAdminMode: true,
    },
  ],
};

const CLUSTER_COMMUNICATIONS: DoctorMenuCluster = {
  id: "communications",
  label: "Коммуникации",
  items: [
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
    { id: "broadcasts", label: "Рассылки", href: "/app/doctor/broadcasts" },
  ],
};

const CLUSTER_LFK: DoctorMenuCluster = {
  id: "lfk-catalog",
  label: "Каталог ЛФК",
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
};

const CLUSTER_CONTENT: DoctorMenuCluster = {
  id: "content",
  label: "Контент",
  items: [
    { id: "patient-home", label: "Главная пациента", href: "/app/doctor/patient-home" },
    { id: "content", label: "Материалы", href: "/app/doctor/content" },
    { id: "library", label: "Библиотека файлов", href: "/app/doctor/content/library" },
  ],
};

const CLUSTER_ANALYTICS: DoctorMenuCluster = {
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
};

const CLUSTER_SISTEMA: DoctorMenuCluster = {
  id: "sistema",
  label: "Система",
  items: [
    {
      id: "system-health",
      label: "Здоровье системы",
      href: "/app/doctor/system-health",
      requiresAdminMode: true,
    },
    {
      id: "health-archive",
      label: "Архив сбоев",
      href: "/app/doctor/health-archive",
      requiresAdminMode: true,
    },
    {
      id: "audit-log",
      label: "Журнал операций",
      href: "/app/doctor/audit-log",
      requiresAdminMode: true,
      badgeKey: "registrationSystemFailures",
    },
  ],
};

const CLUSTER_ADMINISTRATION: DoctorMenuCluster = {
  id: "administration",
  label: "Администрирование",
  items: [
    {
      id: "admin-app-settings",
      label: "Настройки приложения",
      href: "/app/doctor/admin/app-settings",
      requiresAdminMode: true,
    },
    {
      id: "admin-auth",
      label: "Авторизация",
      href: "/app/doctor/admin/auth",
      requiresAdminMode: true,
    },
    {
      id: "admin-integrations",
      label: "Интеграции",
      href: "/app/doctor/admin/integrations",
      requiresAdminMode: true,
    },
    {
      id: "admin-booking",
      label: "Запись / Rubitime",
      href: "/app/doctor/admin/booking",
      requiresAdminMode: true,
    },
    {
      id: "admin-technical",
      label: "Технические режимы",
      href: "/app/doctor/admin/technical",
      requiresAdminMode: true,
    },
  ],
};

/** Все кластеры в каноническом порядке (без учёта позиции standalone между блоками). */
export const DOCTOR_MENU_CLUSTERS: DoctorMenuCluster[] = [
  CLUSTER_PATIENTS_WORK,
  CLUSTER_COMMUNICATIONS,
  CLUSTER_LFK,
  CLUSTER_CONTENT,
  CLUSTER_ANALYTICS,
  CLUSTER_SISTEMA,
  CLUSTER_ADMINISTRATION,
];

/** Верхнеуровневые ссылки вне кластеров. */
export const DOCTOR_MENU_STANDALONE_LINKS: DoctorMenuLinkItem[] = [
  { id: "overview", label: "Сегодня", href: "/app/doctor" },
];

function filterMenuLinks(items: DoctorMenuLinkItem[], access: DoctorMenuAccess): DoctorMenuLinkItem[] {
  return items.filter((item) => isDoctorMenuLinkVisible(item, access));
}

/**
 * Порядок секций для sidebar/Sheet: «Сегодня», затем кластеры (для admin — с аналитикой и системой).
 */
export function getDoctorMenuRenderSections(access: DoctorMenuAccess): DoctorMenuRenderSection[] {
  const raw: DoctorMenuRenderSection[] = [
    { type: "standalone", links: DOCTOR_MENU_STANDALONE_LINKS },
    { type: "cluster", cluster: CLUSTER_PATIENTS_WORK },
    { type: "cluster", cluster: CLUSTER_COMMUNICATIONS },
    { type: "cluster", cluster: CLUSTER_LFK },
    { type: "cluster", cluster: CLUSTER_CONTENT },
    { type: "cluster", cluster: CLUSTER_ANALYTICS },
    { type: "cluster", cluster: CLUSTER_SISTEMA },
    { type: "cluster", cluster: CLUSTER_ADMINISTRATION },
  ];

  const out: DoctorMenuRenderSection[] = [];
  for (const section of raw) {
    if (section.type === "standalone") {
      const links = filterMenuLinks(section.links, access);
      if (links.length > 0) out.push({ type: "standalone", links });
      continue;
    }
    const items = filterMenuLinks(section.cluster.items, access);
    if (items.length > 0) out.push({ type: "cluster", cluster: { ...section.cluster, items } });
  }
  return out;
}

export function isDoctorMenuClusterId(id: string): boolean {
  return DOCTOR_MENU_CLUSTERS.some((c) => c.id === id);
}

/** Плоский список всех пунктов навигации (кластеры + standalone), без служебных действий. */
export const DOCTOR_MENU_LINKS: DoctorMenuLinkItem[] = (() => {
  const fromClusters = DOCTOR_MENU_CLUSTERS.flatMap((c) => c.items);
  return [...DOCTOR_MENU_STANDALONE_LINKS, ...fromClusters];
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
