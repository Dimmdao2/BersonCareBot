/**
 * IANA zones for admin «display timezone» select. Prefer engine list; fallback matches
 * Rubitime offset → IANA mapping (TIMEZONE_UTC_NORMALIZATION).
 */
const FALLBACK_IANA_ZONES = [
  "UTC",
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
] as const;

let cachedSorted: string[] | null = null;

/** Sorted IANA identifiers for `<Select>` options (cached). */
export function getCachedIanaTimezonesSorted(): string[] {
  if (cachedSorted) return cachedSorted;
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      const ids = Intl.supportedValuesOf("timeZone");
      cachedSorted = ids.slice().sort((a, b) => a.localeCompare(b));
      return cachedSorted;
    }
  } catch {
    /* ignore */
  }
  cachedSorted = [...FALLBACK_IANA_ZONES];
  return cachedSorted;
}

/** Europe/Moscow first if present, then alphabetical (for empty search). */
export function prioritizeMoscowFirst(zones: readonly string[]): string[] {
  const moscow = "Europe/Moscow";
  const set = new Set(zones);
  if (!set.has(moscow)) return zones.slice().sort((a, b) => a.localeCompare(b));
  const rest = zones.filter((z) => z !== moscow).sort((a, b) => a.localeCompare(b));
  return [moscow, ...rest];
}

export function isValidIanaTimeZoneId(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}
