import { NAIVE_WALL_CLOCK_REGEX } from "./normalizeToUtcInstant.js";

/**
 * True if the string is safe to pass to PostgreSQL `::timestamptz` without session-TZ
 * interpreting a naive wall-clock value: must parse and end with Z or a numeric offset.
 */
export function isExplicitZonedIsoInstant(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (NAIVE_WALL_CLOCK_REGEX.test(t)) return false;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return false;
  if (/z$/i.test(t)) return true;
  // Require explicit numeric offset (colon form or ±HHMM); avoid treating calendar `-DD` as a zone.
  if (/[+-]\d{2}:\d{2}(?::\d{2})?$/.test(t)) return true;
  if (/[+-]\d{4}$/.test(t)) return true;
  return false;
}
