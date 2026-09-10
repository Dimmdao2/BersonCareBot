import { routePaths } from '@/app-layer/routes/paths';

/**
 * Canonical sections of `/app/settings`. Mirrors the `?tab=` values `page.tsx` already parses
 * (`parseTab` / `LegacySettingsTab`) — this file only adds the nav data, it does not change gating.
 * Defect #1 2026-07-25: the page rendered these three sections with no way to navigate between
 * them; `?tab=team` and `?tab=billing` were only reachable by typing the URL.
 */
export type SettingsTabId = 'specialist' | 'organization' | 'booking' | 'team' | 'billing';

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  href: string;
};

const SETTINGS_BASE = routePaths.settings;

export const ALL_SETTINGS_TABS: SettingsTab[] = [
  // Owner ruling 2026-09-10: settings say «организация», never «клиника» — a solo specialist is a
  // tenant just as much as a clinic is, and the same writers serve both.
  { id: 'organization', label: 'Организация', href: `${SETTINGS_BASE}?tab=organization` },
  // Solo only: the clinic composition reaches the same writers from `/app/manage/online-booking`.
  { id: 'booking', label: 'Онлайн-запись', href: `${SETTINGS_BASE}?tab=booking` },
  { id: 'specialist', label: 'Профиль специалиста', href: `${SETTINGS_BASE}?tab=specialist` },
  { id: 'team', label: 'Команда', href: `${SETTINGS_BASE}?tab=team` },
  { id: 'billing', label: 'Тариф и биллинг', href: `${SETTINGS_BASE}?tab=billing` },
];
