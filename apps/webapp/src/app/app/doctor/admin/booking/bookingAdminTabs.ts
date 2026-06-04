/** Канонические подпути админки записи (без trailing slash). */

export const BOOKING_ADMIN_BASE = "/app/doctor/admin/booking";

export type BookingAdminTabId =
  | "overview"
  | "form-public"
  | "payments"
  | "integrations";

export type BookingAdminTab = {
  id: BookingAdminTabId;
  label: string;
  /** Пустой href = обзор (базовый путь). */
  href: string;
};

export const BOOKING_ADMIN_TABS: BookingAdminTab[] = [
  { id: "overview",     label: "Обзор и настройка",        href: BOOKING_ADMIN_BASE },
  { id: "form-public",  label: "Форма и публичная запись",  href: `${BOOKING_ADMIN_BASE}/form-public` },
  { id: "payments",     label: "Оплата",                   href: `${BOOKING_ADMIN_BASE}/payments` },
  { id: "integrations", label: "Интеграция Rubitime",      href: `${BOOKING_ADMIN_BASE}/integrations` },
];

/** Legacy маршруты → актуальная вкладка (redirect + подсветка nav). */
const LEGACY_TAB_ALIASES: Record<string, BookingAdminTabId> = {
  [`${BOOKING_ADMIN_BASE}/catalog`]: "overview",
};

export function bookingAdminTabFromPathname(pathname: string): BookingAdminTabId {
  const norm = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const alias = LEGACY_TAB_ALIASES[norm];
  if (alias) return alias;
  if (norm === BOOKING_ADMIN_BASE) return "overview";
  for (const tab of BOOKING_ADMIN_TABS) {
    if (tab.id !== "overview" && (norm === tab.href || norm.startsWith(`${tab.href}/`))) {
      return tab.id;
    }
  }
  return "overview";
}
