/**
 * Навигация платформенного (global admin) кабинета.
 *
 * Owner ruling 2026-07-26: the global admin is not a doctor — his clients are the specialists
 * and the clinics, not patients. His pages are moving out of `DoctorWorkspaceShell`'s clinical
 * menu (`doctorNavLinks.ts`) into their own `/app/platform/*` navigation.
 *
 * Owner ruling 2026-07-26 (nav shape): this menu must be FLAT — no nesting, no accordion
 * groups. Every item sits at the top level and is directly clickable. It used to be one
 * top-level "Аналитика" link plus a nested "Система" cluster with 8 sub-items
 * (`doctorNavLinks.ts`, historical `RAW_DOCTOR_MENU_ITEMS`); both are flattened here into a
 * single list of top-level `DoctorMenuLinkItem`s (none of them carry `.items`), which is enough
 * for `DoctorMenuAccordion` to render them as plain links in both the sidebar and the mobile
 * sheet — no accordion/group behavior is triggered when an item has no `.items`, so no change
 * to that component was needed for the flat shape itself.
 */

import type { DoctorMenuAccess, DoctorMenuLinkItem } from "@/shared/ui/doctor/doctorNavLinks";
import { isDoctorMenuLinkVisible } from "@/shared/ui/doctor/doctorNavLinks";

/**
 * Slice 1 (PLAT-01…09) moves only `system-health` to `/app/platform/system-health`. The
 * remaining entries still live at their historical `/app/doctor/*` locations — slices 2-7 move
 * the pages and update these hrefs then. No label collided once un-nested; every entry below
 * kept its original label.
 */
const RAW_PLATFORM_MENU_ITEMS: DoctorMenuLinkItem[] = [
  { id: "analytics", label: "Аналитика", href: "/app/doctor/analytics", accessTier: "global_admin" },
  { id: "commercial", label: "Тарифы и триал", href: "/app/doctor/commercial", accessTier: "global_admin" },
  {
    id: "admin-app-settings",
    label: "Настройки приложения",
    href: "/app/doctor/admin/app-settings",
    accessTier: "global_admin",
  },
  { id: "admin-auth", label: "Авторизация", href: "/app/doctor/admin/auth", accessTier: "global_admin" },
  { id: "admin-booking", label: "Бронирование", href: "/app/doctor/admin/booking", accessTier: "global_admin" },
  {
    id: "admin-integrations",
    label: "Интеграции",
    href: "/app/doctor/admin/integrations",
    accessTier: "global_admin",
  },
  {
    id: "admin-technical",
    label: "Технические режимы",
    href: "/app/doctor/admin/technical",
    accessTier: "global_admin",
  },
  // Moved in this slice.
  { id: "system-health", label: "Здоровье системы", href: "/app/platform/system-health", accessTier: "global_admin" },
  { id: "health-archive", label: "Архив сбоев", href: "/app/doctor/health-archive", accessTier: "global_admin" },
  {
    id: "audit-log",
    label: "Журнал операций",
    href: "/app/doctor/audit-log",
    badgeKey: "registrationSystemFailures",
    accessTier: "global_admin",
  },
];

/** Flat list of platform destinations, filtered by capability. Never returns nested `.items`. */
export function getPlatformMenuItems(access: DoctorMenuAccess): DoctorMenuLinkItem[] {
  return RAW_PLATFORM_MENU_ITEMS.filter((item) => isDoctorMenuLinkVisible(item, access));
}

/** Unfiltered flat list, for tests and any future flat consumer (mirrors `DOCTOR_MENU_LINKS`). */
export const PLATFORM_MENU_LINKS: DoctorMenuLinkItem[] = RAW_PLATFORM_MENU_ITEMS;
