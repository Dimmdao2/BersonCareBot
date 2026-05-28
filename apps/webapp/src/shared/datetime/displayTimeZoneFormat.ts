/** Форматирование и ключи бакетов в `app_display_timezone` (IANA). */

export function displayZonePartsFromUtcInstant(utcIso: string, iana: string) {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    return { year: "0000", month: "01", day: "01", hour: "00", minute: "00" };
  }
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: map.year ?? "0000",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour: map.hour ?? "00",
    minute: map.minute ?? "00",
  };
}

/** `YYYY-MM-DD` в поясе приложения. */
export function toDisplayZoneDayKey(utcIso: string, iana: string): string {
  const p = displayZonePartsFromUtcInstant(utcIso, iana);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Локальный часовой бакет `YYYY-MM-DDTHH:00:00` (без суффикса TZ). */
export function toDisplayZoneHourBucketKey(utcIso: string, iana: string): string {
  const p = displayZonePartsFromUtcInstant(utcIso, iana);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00:00`;
}

function parsePgLocalBucket(bucket: string): { y: number; m: number; d: number; h: number } | null {
  const m = bucket.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}))?/);
  if (!m) return null;
  return {
    y: Number.parseInt(m[1]!, 10),
    m: Number.parseInt(m[2]!, 10),
    d: Number.parseInt(m[3]!, 10),
    h: m[4] != null ? Number.parseInt(m[4], 10) : 0,
  };
}

/** Подпись дня для графика (бакет уже в поясе приложения из SQL). */
export function formatDisplayZoneDayRuFromBucket(bucket: string): string {
  const p = parsePgLocalBucket(bucket);
  if (!p) return bucket;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0));
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDisplayZoneDayShortFromBucket(bucket: string): string {
  const p = parsePgLocalBucket(bucket);
  if (!p) return bucket.slice(0, 10);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0));
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export function formatDisplayZoneHourFromBucket(bucket: string): string {
  const p = parsePgLocalBucket(bucket);
  if (!p) return bucket;
  return `${String(p.h).padStart(2, "0")}:00`;
}

/** ISO-момент → подпись в поясе приложения (для таблиц). */
export function formatDisplayZoneInstantRu(iso: string | null | undefined, iana: string): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    timeZone: iana,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
