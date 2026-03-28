/**
 * Декларативные конфиги навигации (PlatformMode) и блоков главной пациента.
 * Набор блоков на сервере задаётся по cookie входа: `PlatformEntry` (бот vs браузер).
 */

import type { PlatformEntry, PlatformMode } from "@/shared/lib/platform";

export type HeaderIconId = "settings" | "help" | "messages" | "reminders" | "menu";

export type PatientNavConfig = {
  headerRightIcons: HeaderIconId[];
  hasSheetMenu: boolean;
  showLogout: boolean;
  showInstallPrompt: boolean;
};

export const patientNavByPlatform: Record<PlatformMode, PatientNavConfig> = {
  bot: {
    headerRightIcons: ["help", "settings"],
    hasSheetMenu: false,
    showLogout: false,
    showInstallPrompt: false,
  },
  /** Браузер (и PWA): шапка отличается от мини-приложения в боте — справка и остальные разделы в гамбургере справа. */
  mobile: {
    headerRightIcons: ["messages", "help", "menu"],
    hasSheetMenu: true,
    showLogout: true,
    showInstallPrompt: true,
  },
  desktop: {
    headerRightIcons: ["messages", "help", "menu"],
    hasSheetMenu: true,
    showLogout: true,
    showInstallPrompt: false,
  },
};

export type HomeBlockId =
  | "appointments"
  | "cabinet"
  | "materials"
  | "assistant"
  | "purchases"
  | "lfk-complexes"
  | "patient-card"
  | "news"
  | "mailings"
  | "motivation"
  | "stats"
  | "channels";

/**
 * Единый порядок блоков главной для веба. В боте (`patientHomeBlocksByPlatform.bot`) скрываются только
 * перечисленные в `PATIENT_HOME_BLOCKS_HIDDEN_IN_BOT` — правки контента делаются здесь.
 */
export const patientHomeBlocksCanonical: HomeBlockId[] = [
  "cabinet",
  "materials",
  "purchases",
  "lfk-complexes",
  "patient-card",
  "news",
  "mailings",
  "motivation",
  "stats",
  "channels",
];

const PATIENT_HOME_BLOCKS_HIDDEN_IN_BOT: ReadonlySet<HomeBlockId> = new Set([
  "news",
  "mailings",
  "motivation",
  "stats",
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
