/** Канонические подпути админки записи (без trailing slash). */

// PLAT-01…09 slice 4 (2026-07-26): the platform admin/booking page physically moved from
// `(global-admin)/doctor/admin/booking` to `platform/admin/booking` — its live URL (route groups
// don't appear in the URL) moved with it, from `/app/doctor/admin/booking` to
// `/app/platform/admin/booking`. Owner ruling 2026-07-26 (final home): the whole `/app/platform/*`
// tree renamed to `/app/admin/*`, and the nested `admin/booking` subtree flattened one level (no
// `/app/admin/admin/booking`) — this constant's value is now `/app/admin/booking`. It drives the
// redirect-stub subpages (catalog, integrations) below, the tab nav, and the screen-title lookup
// in doctorScreenTitles.ts.
export const BOOKING_ADMIN_BASE = '/app/admin/booking';

export type BookingAdminTabId = 'overview';

export type BookingAdminTab = {
  id: BookingAdminTabId;
  label: string;
  /** Пустой href = обзор (базовый путь). */
  href: string;
};

export const BOOKING_ADMIN_TABS: BookingAdminTab[] = [
  { id: 'overview', label: 'Обзор и настройка', href: BOOKING_ADMIN_BASE },
];

/** Legacy маршруты → актуальная вкладка (redirect + подсветка nav). */
const LEGACY_TAB_ALIASES: Record<string, BookingAdminTabId> = {
  [`${BOOKING_ADMIN_BASE}/catalog`]: 'overview',
  [`${BOOKING_ADMIN_BASE}/form-public`]: 'overview',
  [`${BOOKING_ADMIN_BASE}/payments`]: 'overview',
};

export function bookingAdminTabFromPathname(pathname: string): BookingAdminTabId {
  const norm = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  const alias = LEGACY_TAB_ALIASES[norm];
  if (alias) return alias;
  if (norm === BOOKING_ADMIN_BASE) return 'overview';
  for (const tab of BOOKING_ADMIN_TABS) {
    if (tab.id !== 'overview' && (norm === tab.href || norm.startsWith(`${tab.href}/`))) {
      return tab.id;
    }
  }
  return 'overview';
}
