/** Канонические подпути админки записи (без trailing slash). */

export const BOOKING_ADMIN_BASE = "/app/doctor/admin/booking";

export type BookingAdminTabId =
  | "overview"
  | "locations"
  | "services"
  | "availability"
  | "schedule"
  | "form"
  | "rules"
  | "payments"
  | "memberships"
  | "public"
  | "operations"
  | "integrations";

export type BookingAdminTab = {
  id: BookingAdminTabId;
  label: string;
  /** Пустой href = обзор (базовый путь). */
  href: string;
};

export const BOOKING_ADMIN_TABS: BookingAdminTab[] = [
  { id: "overview", label: "Обзор", href: BOOKING_ADMIN_BASE },
  { id: "locations", label: "Локации", href: `${BOOKING_ADMIN_BASE}/locations` },
  { id: "services", label: "Услуги", href: `${BOOKING_ADMIN_BASE}/services` },
  { id: "availability", label: "Доступность", href: `${BOOKING_ADMIN_BASE}/availability` },
  { id: "schedule", label: "Расписание", href: `${BOOKING_ADMIN_BASE}/schedule` },
  { id: "form", label: "Форма", href: `${BOOKING_ADMIN_BASE}/form` },
  { id: "rules", label: "Правила", href: `${BOOKING_ADMIN_BASE}/rules` },
  { id: "payments", label: "Оплата", href: `${BOOKING_ADMIN_BASE}/payments` },
  { id: "memberships", label: "Абонементы", href: `${BOOKING_ADMIN_BASE}/memberships` },
  { id: "public", label: "Публичная запись", href: `${BOOKING_ADMIN_BASE}/public` },
  { id: "operations", label: "Операции", href: `${BOOKING_ADMIN_BASE}/operations` },
  { id: "integrations", label: "Rubitime", href: `${BOOKING_ADMIN_BASE}/integrations` },
];

/** Legacy маршруты → актуальная вкладка (redirect + подсветка nav). */
const LEGACY_TAB_ALIASES: Record<string, BookingAdminTabId> = {
  [`${BOOKING_ADMIN_BASE}/catalog`]: "locations",
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
