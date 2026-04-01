import { env } from '../../../config/env.js';

/** Fallback when env value is missing or invalid. */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = 'Europe/Moscow';

const IANA_LIKE = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

/**
 * Reads booking display timezone from env (BOOKING_DISPLAY_TIMEZONE).
 * Falls back to the constant default when env value is missing or invalid.
 * The `_db` parameter is kept for call-site compatibility and is ignored.
 */
export function getBookingDisplayTimezone(_db?: unknown): Promise<string> {
  const raw = env.BOOKING_DISPLAY_TIMEZONE?.trim() ?? '';
  const resolved = raw.length > 0 && IANA_LIKE.test(raw) ? raw : DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  return Promise.resolve(resolved);
}

/** For tests: no-op, retained for compatibility. */
export function resetBookingDisplayTimezoneCache(): void {
  // no-op: no longer cache-based
}
