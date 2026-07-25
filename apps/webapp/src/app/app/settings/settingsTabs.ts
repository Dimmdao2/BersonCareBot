import { routePaths } from "@/app-layer/routes/paths";

/**
 * Canonical sections of `/app/settings`. Mirrors the `?tab=` values `page.tsx` already parses
 * (`parseTab` / `LegacySettingsTab`) — this file only adds the nav data, it does not change gating.
 * Defect #1 2026-07-25: the page rendered these three sections with no way to navigate between
 * them; `?tab=team` and `?tab=billing` were only reachable by typing the URL.
 */
export type SettingsTabId = "organization" | "team" | "billing";

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  href: string;
};

const SETTINGS_BASE = routePaths.settings;

export const ALL_SETTINGS_TABS: SettingsTab[] = [
  { id: "organization", label: "Клиника", href: `${SETTINGS_BASE}?tab=organization` },
  { id: "team", label: "Команда", href: `${SETTINGS_BASE}?tab=team` },
  { id: "billing", label: "Тариф и биллинг", href: `${SETTINGS_BASE}?tab=billing` },
];
