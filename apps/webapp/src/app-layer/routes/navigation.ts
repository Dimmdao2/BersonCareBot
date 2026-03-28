/**
 * Декларативные конфиги навигации и блоков главной по PlatformMode.
 */

import type { PlatformMode } from "@/shared/lib/platform";

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
  mobile: {
    headerRightIcons: ["messages", "reminders", "menu"],
    hasSheetMenu: true,
    showLogout: true,
    showInstallPrompt: true,
  },
  desktop: {
    headerRightIcons: ["messages", "reminders", "menu"],
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

export const patientHomeBlocksByPlatform: Record<PlatformMode, HomeBlockId[]> = {
  bot: ["cabinet", "materials", "assistant", "purchases", "lfk-complexes", "patient-card"],
  mobile: [
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
  ],
  desktop: [
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
  ],
};
