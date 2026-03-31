import type { DbPort } from '../../../kernel/contracts/ports.js';
import { logger } from '../../observability/logger.js';

const SETTING_KEY = 'booking_display_timezone';
/** Fallback when row missing, invalid, or DB errors. Must match webapp migration default. */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = 'Europe/Moscow';
const TTL_MS = 60_000;
/** Plan: optional IANA-like validation. */
const IANA_LIKE = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

type CacheEntry = { value: string; fetchedAt: number };
let cache: CacheEntry | null = null;

function parseValueJson(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== 'object' || !('value' in valueJson)) return null;
  const v = (valueJson as Record<string, unknown>).value;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Reads booking display timezone from system_settings (admin scope).
 * In-memory TTL cache (60s). On missing/invalid/DB error: warn + {@link DEFAULT_BOOKING_DISPLAY_TIMEZONE}.
 */
export async function getBookingDisplayTimezone(db: DbPort): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.value;
  }

  try {
    const res = await db.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
      [SETTING_KEY],
    );
    const row = res.rows[0];
    const raw = row ? parseValueJson(row.value_json) : null;
    let resolved = DEFAULT_BOOKING_DISPLAY_TIMEZONE;
    if (!raw) {
      logger.warn({}, '[bookingDisplayTimezone] missing or empty value in system_settings, using default');
    } else if (!IANA_LIKE.test(raw)) {
      logger.warn({ raw }, '[bookingDisplayTimezone] invalid timezone string, using default');
    } else {
      resolved = raw;
    }
    cache = { value: resolved, fetchedAt: now };
    return resolved;
  } catch (err) {
    logger.warn({ err }, '[bookingDisplayTimezone] DB error, using default');
    cache = { value: DEFAULT_BOOKING_DISPLAY_TIMEZONE, fetchedAt: now };
    return DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  }
}

/** For tests: clear TTL cache between cases. */
export function resetBookingDisplayTimezoneCache(): void {
  cache = null;
}
