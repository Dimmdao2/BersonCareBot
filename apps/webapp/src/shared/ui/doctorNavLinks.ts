/** Навигация кабинета врача: кластеры + отдельные верхнеуровневые ссылки (desktop sidebar и mobile Sheet). */

import { routePaths } from "@/app-layer/routes/paths";

/** Ключ localStorage для открытого кластера аккордеона. */
export const DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY = "doctorMenu.openCluster.v1";

/** Дефолтный открытый кластер при первом заходе. */
export const DOCTOR_MENU_DEFAULT_CLUSTER_ID = "patients-work";

/** Ключ счётчика для бейджа пункта меню врача (навигация). */
export type DoctorMenuBadgeKey = "onlineIntakeNew" | "messagesUnread";

export type DoctorMenuLinkItem = {
  id: string;
  label: string;
  href: string;
  badgeKey?: DoctorMenuBadgeKey;
};

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
    { id: "courses", label: "Курсы", href: "/app/doctor/courses" },
  ],
};

const CLUSTER_APP_CONTENT: DoctorMenuCluster = {
  id: "app-content",
  label: "Контент приложения",
  items: [
    { id: "patient-home", label: "Главная пациента", href: "/app/doctor/patient-home" },
    { id: "content", label: "CMS", href: "/app/doctor/content" },
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

/**
 * Порядок секций для sidebar/Sheet: три кластера, затем standalone «Библиотека файлов», затем коммуникации и система.
 */
export function getDoctorMenuRenderSections(): DoctorMenuRenderSection[] {
  return [
    { type: "cluster", cluster: CLUSTER_PATIENTS_WORK },
    { type: "cluster", cluster: CLUSTER_ASSIGNMENTS },
    { type: "cluster", cluster: CLUSTER_APP_CONTENT },
    { type: "standalone", links: DOCTOR_MENU_STANDALONE_LINKS },
    { type: "cluster", cluster: CLUSTER_COMMUNICATIONS },
    { type: "cluster", cluster: CLUSTER_SYSTEM },
  ];
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
