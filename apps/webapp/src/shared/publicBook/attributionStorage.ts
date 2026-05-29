import type { BookingAttribution } from "@/modules/booking-attribution/types";
import { parseBookingAttributionFromSearchParams } from "@/modules/booking-attribution/parseBookingAttribution";

const STORAGE_KEY = "public_booking_attribution_v1";

export function readStoredPublicBookingAttribution(): BookingAttribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as BookingAttribution;
  } catch {
    return {};
  }
}

export function storePublicBookingAttribution(attr: BookingAttribution): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
}

/** Считать query текущей страницы и слить с уже сохранённым. */
export function capturePublicBookingAttributionFromLocation(): BookingAttribution {
  const fromUrl = parseBookingAttributionFromSearchParams(new URLSearchParams(window.location.search));
  const merged = { ...readStoredPublicBookingAttribution(), ...fromUrl };
  storePublicBookingAttribution(merged);
  return merged;
}
