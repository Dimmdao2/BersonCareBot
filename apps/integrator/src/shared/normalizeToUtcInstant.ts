import { DateTime } from "luxon";

/** Причина неуспеха нормализации (для инцидентов / алертов в Stage 3+). */
export type NormalizeToUtcInstantFailureReason =
  | "invalid_datetime"
  | "invalid_timezone"
  | "unsupported_format";

export type TryNormalizeToUtcInstantResult =
  | { ok: true; utcIso: string }
  | { ok: false; reason: NormalizeToUtcInstantFailureReason };

/**
 * Нормализует строку времени в UTC instant (ISO-8601 с Z) и возвращает причину при неуспехе.
 *
 * - Строка с Z или ±offset → `Date.parse` + `toISOString()` (не использует TZ процесса для наивных строк).
 * - Наивная строка по контракту (см. `NAIVE_WALL_CLOCK` в модуле / Stage 2 doc) —
 *   интерпретируется как настенное время в `sourceTimezone` (IANA), затем UTC.
 * - Пустой/невалидный ввод → `ok: false` с дискретной причиной.
 *
 * `raw` / `sourceTimezone` могут быть нестроковыми (вызов из JS без типов) — без throw.
 */
export function tryNormalizeToUtcInstant(
  raw: unknown,
  sourceTimezone: unknown,
): TryNormalizeToUtcInstantResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid_datetime" };
  }
  if (typeof sourceTimezone !== "string") {
    return { ok: false, reason: "invalid_timezone" };
  }

  const trimmedRaw = raw.trim();
  if (!trimmedRaw) {
    return { ok: false, reason: "invalid_datetime" };
  }

  const tz = sourceTimezone.trim();
  if (!tz || !isValidIanaTimeZone(tz)) {
    return { ok: false, reason: "invalid_timezone" };
  }

  if (isNaiveWallClockString(trimmedRaw)) {
    const dt = parseNaiveWallClockInZone(trimmedRaw, tz);
    if (!dt) {
      return { ok: false, reason: "invalid_datetime" };
    }
    return { ok: true, utcIso: dt.toUTC().toJSDate().toISOString() };
  }

  const ms = Date.parse(trimmedRaw);
  if (!Number.isFinite(ms)) {
    return { ok: false, reason: "unsupported_format" };
  }
  return { ok: true, utcIso: new Date(ms).toISOString() };
}

/**
 * Нормализует строку времени в UTC instant (ISO-8601 с Z).
 *
 * Обёртка над {@link tryNormalizeToUtcInstant}: при неуспехе только `null` (без причины).
 * Для алертов используйте `tryNormalizeToUtcInstant`.
 */
export function normalizeToUtcInstant(raw: string, sourceTimezone: string): string | null {
  const r = tryNormalizeToUtcInstant(raw, sourceTimezone);
  return r.ok ? r.utcIso : null;
}

/**
 * Наивная дата-время без суффикса Z/offset: ровно `YYYY-MM-DD` + `T` или пробел +
 * `HH:mm:ss` + опционально `.` и 1–9 цифр дробной части. Все числовые поля — с ведущим нулём (двузначные месяц/день/часы/минуты/секунды).
 */
export const NAIVE_WALL_CLOCK_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:T| )\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/;

function isNaiveWallClockString(s: string): boolean {
  return NAIVE_WALL_CLOCK_REGEX.test(s);
}

function isValidIanaTimeZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}

function parseNaiveWallClockInZone(trimmed: string, zone: string): DateTime | null {
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const dt = DateTime.fromISO(normalized, { zone });
  return dt.isValid ? dt : null;
}
