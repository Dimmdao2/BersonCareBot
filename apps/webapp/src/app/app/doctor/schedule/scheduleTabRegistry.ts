import type { ComponentType } from "react";
import type { ScheduleTabId } from "./doctorScheduleTabs";

/** Стандартные пропы, которые шелл передаёт каждому компоненту-табу расписания. */
export type ScheduleTabProps = {
  /** URL-параметры, специфичные для этого таба (напр. { view: "3days", date: "2026-06-12" } для cal). */
  deepLinkParams: Record<string, string>;
  /** Вызывается табом при изменении deep-link параметра. null — удалить из URL. */
  onDeepLinkChange: (key: string, value: string | null) => void;
  /** SSR-данные, предзагруженные серверной страницей (типизация в каждом табе своя). */
  initialData?: unknown;
  /** Признак активного таба. Используется для управления поллингом. По умолчанию true. */
  isActive?: boolean;
  /** IANA-таймзона из system_settings (от серверной страницы). */
  initialTimeZone?: string;
};

export type ScheduleTabRegistryEntry = {
  id: ScheduleTabId;
  /** Фабрика динамического импорта. Возвращает компонент с ScheduleTabProps. */
  loader: () => Promise<{ default: ComponentType<ScheduleTabProps> }>;
  /** URL-ключи, которые этот таб читает/пишет. */
  deepLinkKeys: readonly string[];
};

/**
 * Реестр вкладок экрана «Расписание».
 * Добавить новую вкладку = создать компонент + строка здесь.
 */
export const SCHEDULE_TAB_REGISTRY: ScheduleTabRegistryEntry[] = [
  {
    id: "cal",
    loader: () =>
      import("./tabs/ScheduleCalendarTab").then((m) => ({ default: m.ScheduleCalendarTab })),
    deepLinkKeys: ["view", "date", "location", "service", "appt", "from", "render"],
  },
  {
    id: "work",
    loader: () =>
      import("./tabs/ScheduleWorkTab").then((m) => ({ default: m.ScheduleWorkTab })),
    deepLinkKeys: ["location", "month"],
  },
  {
    id: "setup",
    loader: () =>
      import("./tabs/ScheduleSetupTab").then((m) => ({ default: m.ScheduleSetupTab })),
    deepLinkKeys: ["section"],
  },
];
