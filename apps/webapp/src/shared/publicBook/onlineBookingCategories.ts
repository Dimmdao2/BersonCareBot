import type { BookingCategory } from "@/modules/patient-booking/types";

export const PUBLIC_ONLINE_BOOKING_CATEGORIES = ["rehab_lfk", "nutrition", "general"] as const;

export function isPublicOnlineBookingCategory(s: string): s is BookingCategory {
  return (PUBLIC_ONLINE_BOOKING_CATEGORIES as readonly string[]).includes(s);
}
