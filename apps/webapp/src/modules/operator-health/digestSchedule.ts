/** Локальное время и календарный день в IANA TZ для суточной сводки. */

export function formatLocalHm(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function formatLocalYmd(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeDigestTimeSlot(digestTime: string): string {
  const t = digestTime.trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return "09:00";
  return `${m[1]!.padStart(2, "0")}:00`;
}

export function isDigestSendSlot(now: Date, timeZone: string, digestTime: string): boolean {
  return formatLocalHm(now, timeZone) === normalizeDigestTimeSlot(digestTime);
}

export function buildDigestDedupKey(now: Date, timeZone: string): string {
  return `digest:${formatLocalYmd(now, timeZone)}`;
}

/** Окно сводки: с прошлой успешной отправки или последние 24 ч. */
export function resolveDigestWindowStartIso(lastDigestSentAt: string | null, now: Date): string {
  if (lastDigestSentAt) return lastDigestSentAt;
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}
