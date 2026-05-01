import { routePaths } from "@/app-layer/routes/paths";

/**
 * Декларативные конфиги навигации (PlatformMode) и блоков главной пациента.
 * Набор блоков на сервере задаётся по cookie входа: `PlatformEntry` (бот vs браузер).
 */

import type { PlatformEntry, PlatformMode } from "@/shared/lib/platform";

export type HeaderIconId = "profile" | "messages" | "reminders" | "menu";

/** Ширина patient mobile shell (`AppShell` / контентная колонка). */
export const PATIENT_MOBILE_SHELL_MAX_PX = 430 as const;

export type PatientPrimaryNavItemId = "today" | "booking" | "diary" | "plan" | "profile";

export type PatientPrimaryNavItem = {
  id: PatientPrimaryNavItemId;
  label: string;
  href: string;
};

/**
 * Порядок primary nav пациента: верхняя полоска на всех ширинах (`PatientTopNav`).
 * Mobile повторяет бывшее нижнее меню, перенесённое наверх:
 * «Сегодня / Запись / Дневник / План / Профиль».
 */
export const PATIENT_PRIMARY_NAV_ITEMS: readonly PatientPrimaryNavItem[] = [
  { id: "today", label: "Сегодня", href: routePaths.patient },
  { id: "booking", label: "Запись", href: routePaths.patientBooking },
  { id: "diary", label: "Дневник", href: routePaths.diary },
  { id: "plan", label: "План", href: routePaths.patientTreatmentPrograms },
  { id: "profile", label: "Профиль", href: routePaths.profile },
] as const;

/** Активный пункт primary nav по pathname (без query для сравнения префиксов). */
export function getPatientPrimaryNavActiveId(pathname: string | null): PatientPrimaryNavItemId | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0];
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const root = routePaths.patient;
  if (normalized === root) return "today";
  if (normalized.startsWith(routePaths.profile)) return "profile";
  if (normalized.startsWith(routePaths.diary)) return "diary";
  if (normalized.startsWith(routePaths.patientTreatmentPrograms)) return "plan";
  if (normalized.startsWith(routePaths.patientBooking)) return "booking";
  return null;
}

export type PatientNavConfig = {
  headerRightIcons: HeaderIconId[];
  hasSheetMenu: boolean;
  showLogout: boolean;
};

export const patientNavByPlatform: Record<PlatformMode, PatientNavConfig> = {
  bot: {
    headerRightIcons: ["profile"],
    hasSheetMenu: false,
    showLogout: false,
  },
  /** Браузер и PWA: профиль в правом углу шапки. */
  mobile: {
    headerRightIcons: ["profile"],
    hasSheetMenu: false,
    showLogout: false,
  },
  desktop: {
    headerRightIcons: ["profile"],
    hasSheetMenu: false,
    showLogout: false,
  },
};

export type HomeBlockId =
  | "appointments"
  | "cabinet"
  | "materials"
  | "assistant"
  | "news"
  | "mailings"
  | "motivation"
  | "channels";

/**
 * Единый порядок блоков главной для веба. В боте (`patientHomeBlocksByPlatform.bot`) скрываются только
 * перечисленные в `PATIENT_HOME_BLOCKS_HIDDEN_IN_BOT` — правки контента делаются здесь.
 */
export const patientHomeBlocksCanonical: HomeBlockId[] = [
  "cabinet",
  "materials",
  "news",
  "mailings",
  "motivation",
  "channels",
];

const PATIENT_HOME_BLOCKS_HIDDEN_IN_BOT: ReadonlySet<HomeBlockId> = new Set([
  "news",
  "mailings",
  "motivation",
  "channels",
]);

export const patientHomeBlocksByPlatform: Record<PlatformMode, HomeBlockId[]> = {
  bot: patientHomeBlocksCanonical.filter((id) => !PATIENT_HOME_BLOCKS_HIDDEN_IN_BOT.has(id)),
  mobile: [...patientHomeBlocksCanonical],
  desktop: [...patientHomeBlocksCanonical],
};

/** Блоки главной для SSR: в боте — тот же порядок, что на вебе, минус скрытые в мини-приложении. */
export function patientHomeBlocksForEntry(entry: PlatformEntry): HomeBlockId[] {
  if (entry === "bot") {
    return patientHomeBlocksCanonical.filter((id) => !PATIENT_HOME_BLOCKS_HIDDEN_IN_BOT.has(id));
  }
  return [...patientHomeBlocksCanonical];
}
