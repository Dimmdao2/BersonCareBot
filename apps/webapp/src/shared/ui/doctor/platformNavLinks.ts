/**
 * Навигация платформенного (global admin) кабинета.
 *
 * Owner ruling 2026-07-26: the global admin is not a doctor — his clients are the specialists
 * and the clinics, not patients. His pages are moving out of `DoctorWorkspaceShell`'s clinical
 * menu (`doctorNavLinks.ts`) into their own `/app/admin/*` navigation.
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

import type { DoctorMenuAccess, DoctorMenuLinkItem } from '@/shared/ui/doctor/doctorNavLinks';
import { isDoctorMenuLinkVisible } from '@/shared/ui/doctor/doctorNavLinks';

/**
 * Slice 1 (PLAT-01…09) moved `system-health` to its own platform shell. Slice 2 moved
 * `health-archive` and `audit-log` alongside it. Slice 3 moved `commercial`. Slice 4 moved the
 * whole `admin/*` subtree (app-settings, auth, booking, integrations, technical). All of it first
 * landed at `/app/platform/*`; owner ruling 2026-07-26 (final home) renamed that whole tree to
 * `/app/admin/*` the same day, flattening the nested `admin/*` settings subtree one level (no
 * `/app/admin/admin/*`) — every href below reflects that final shape. Slices 5-7 move the rest
 * (`analytics`, still pointing at the clinical `/app/doctor/analytics` URL below) and update its
 * href then. No label collided once un-nested; every entry below kept its original label. This
 * file keeps its historical name — "platform" here names the `platform.operations` capability
 * this menu serves, not the (now-retired) `/app/platform/*` URL prefix.
 */
const RAW_PLATFORM_MENU_ITEMS: DoctorMenuLinkItem[] = [
  {
    id: 'account-security',
    label: 'Безопасность аккаунта',
    href: '/app/account?tab=security',
    accessTier: 'global_admin',
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    href: '/app/doctor/analytics',
    accessTier: 'global_admin',
  },
  // Owner punchlist §9.3 / #1068: the platform's clinic customers now have a first-class list.
  { id: 'clinics', label: 'Клиники', href: '/app/admin/clinics', accessTier: 'global_admin' },
  // Moved in slice 3.
  {
    id: 'commercial',
    label: 'Тарифы и триал',
    href: '/app/admin/commercial',
    accessTier: 'global_admin',
  },
  // К1 — payments cabinet plan: how clinics pay the platform for their tariff.
  { id: 'payments', label: 'Платежи', href: '/app/admin/payments', accessTier: 'global_admin' },
  // Moved in slice 4.
  {
    id: 'admin-app-settings',
    label: 'Настройки приложения',
    href: '/app/admin/app-settings',
    accessTier: 'global_admin',
  },
  { id: 'admin-auth', label: 'Авторизация', href: '/app/admin/auth', accessTier: 'global_admin' },
  {
    id: 'admin-booking',
    label: 'Запись клиентов',
    href: '/app/admin/booking',
    accessTier: 'global_admin',
  },
  {
    id: 'admin-integrations',
    label: 'Интеграции',
    href: '/app/admin/integrations',
    accessTier: 'global_admin',
  },
  {
    id: 'admin-technical',
    label: 'Технические режимы',
    href: '/app/admin/technical',
    accessTier: 'global_admin',
  },
  // Moved in slice 1.
  {
    id: 'system-health',
    label: 'Здоровье системы',
    href: '/app/admin/system-health',
    accessTier: 'global_admin',
  },
  // Moved in this slice.
  {
    id: 'health-archive',
    label: 'Архив сбоев',
    href: '/app/admin/health-archive',
    accessTier: 'global_admin',
  },
  {
    id: 'audit-log',
    label: 'Журнал операций',
    href: '/app/admin/audit-log',
    badgeKey: 'registrationSystemFailures',
    accessTier: 'global_admin',
  },
];

/** Flat list of platform destinations, filtered by capability. Never returns nested `.items`. */
export function getPlatformMenuItems(access: DoctorMenuAccess): DoctorMenuLinkItem[] {
  return RAW_PLATFORM_MENU_ITEMS.filter((item) => isDoctorMenuLinkVisible(item, access));
}

/** Unfiltered flat list, for tests and any future flat consumer (mirrors `DOCTOR_MENU_LINKS`). */
export const PLATFORM_MENU_LINKS: DoctorMenuLinkItem[] = RAW_PLATFORM_MENU_ITEMS;
