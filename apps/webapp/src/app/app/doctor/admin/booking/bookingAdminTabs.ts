/** Канонические подпути админки записи (без trailing slash). */

export const BOOKING_ADMIN_BASE = "/app/doctor/admin/booking";

export type BookingAdminTabId =
  | "overview"
  | "catalog"
  | "availability"
  | "schedule"
  | "form"
  | "rules"
  | "payments"
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
  { id: "catalog", label: "Каталог", href: `${BOOKING_ADMIN_BASE}/catalog` },
  { id: "availability", label: "Доступность", href: `${BOOKING_ADMIN_BASE}/availability` },
  { id: "schedule", label: "Расписание", href: `${BOOKING_ADMIN_BASE}/schedule` },
  { id: "form", label: "Форма", href: `${BOOKING_ADMIN_BASE}/form` },
  { id: "rules", label: "Правила", href: `${BOOKING_ADMIN_BASE}/rules` },
  { id: "payments", label: "Оплата", href: `${BOOKING_ADMIN_BASE}/payments` },
  { id: "public", label: "Публичная", href: `${BOOKING_ADMIN_BASE}/public` },
  { id: "operations", label: "Операции", href: `${BOOKING_ADMIN_BASE}/operations` },
  { id: "integrations", label: "Интеграции", href: `${BOOKING_ADMIN_BASE}/integrations` },
];

export function bookingAdminTabFromPathname(pathname: string): BookingAdminTabId {
  const norm = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (norm === BOOKING_ADMIN_BASE) return "overview";
  for (const tab of BOOKING_ADMIN_TABS) {
    if (tab.id !== "overview" && (norm === tab.href || norm.startsWith(`${tab.href}/`))) {
      return tab.id;
    }
  }
  return "overview";
}
