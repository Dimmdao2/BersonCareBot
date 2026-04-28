import type { LucideIcon } from "lucide-react";
import { Activity, BookOpen, CalendarPlus, ClipboardList, Home } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * Декларативные конфиги навигации (PlatformMode) и блоков главной пациента.
 * Набор блоков на сервере задаётся по cookie входа: `PlatformEntry` (бот vs браузер).
 */

import type { PlatformEntry, PlatformMode } from "@/shared/lib/platform";

export type HeaderIconId = "profile" | "messages" | "reminders" | "menu";

export type PatientBottomNavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

/** Нижняя навигация пациента (фиксированная панель). Порядок и href — канон. */
export const PATIENT_BOTTOM_NAV_ITEMS: PatientBottomNavItem[] = [
  {
    href: routePaths.patient,
    label: "Сегодня",
    Icon: Home,
    isActive: (pathname) => pathname === routePaths.patient || pathname === `${routePaths.patient}/`,
  },
  {
    href: routePaths.patientBooking,
    label: "Запись",
    Icon: CalendarPlus,
    isActive: (pathname) =>
      pathname === routePaths.patientBooking || pathname.startsWith(`${routePaths.patientBooking}/`),
  },
  {
    href: routePaths.patientWarmups,
    label: "Разминки",
    Icon: Activity,
    isActive: (pathname) =>
      pathname === routePaths.patientWarmups || pathname.startsWith(`${routePaths.patientWarmups}/`),
  },
  {
    href: routePaths.patientTreatmentPrograms,
    label: "План",
    Icon: ClipboardList,
    isActive: (pathname) =>
      pathname === routePaths.patientTreatmentPrograms ||
      pathname.startsWith(`${routePaths.patientTreatmentPrograms}/`),
  },
  {
    href: routePaths.diary,
    label: "Дневник",
    Icon: BookOpen,
    isActive: (pathname) => pathname.startsWith(routePaths.diary),
  },
];

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
