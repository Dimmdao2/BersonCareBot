import { env } from './env.js';

/**
 * Единая IANA-таймзона «бизнес-времени» интегратора: букинг, напоминания, формат логов/сообщений,
 * интерпретация наивных дат Rubitime (в связке с {@link getRubitimeRecordAtUtcOffsetMinutesForInstant}).
 * Значение берётся из env (см. {@link getAppDisplayTimezoneSync}).
 */
export const DEFAULT_APP_DISPLAY_TIMEZONE = 'Europe/Moscow';

/** @deprecated Используйте {@link DEFAULT_APP_DISPLAY_TIMEZONE} — алиас для старых импортов. */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = DEFAULT_APP_DISPLAY_TIMEZONE;

const IANA_LIKE = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

function parseLongOffsetToMinutes(value: string): number | null {
  const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2]);
  const mins = m[3] !== undefined ? Number(m[3]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return sign * (hours * 60 + mins);
}

/**
 * Смещение UTC для зоны в указанный момент (учитывает DST, если есть в движке ICU).
 * Фолбэк +180 — типичный MSK, если longOffset недоступен или зона невалидна.
 */
export function utcOffsetMinutesFromLongOffset(timeZone: string, instant: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(instant);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (name) {
      const parsed = parseLongOffsetToMinutes(name);
      if (parsed !== null && Number.isFinite(parsed)) return parsed;
    }
  } catch {
    // invalid timeZone
  }
  return 180;
}

/**
 * Синхронно: валидная APP_DISPLAY_TIMEZONE, иначе валидная BOOKING_DISPLAY_TIMEZONE, иначе дефолт.
 * Если APP задана, но не похожа на IANA — не «глотаем» BOOKING (fallback по цепочке).
 */
export function getAppDisplayTimezoneSync(): string {
  const rawApp = typeof env.APP_DISPLAY_TIMEZONE === 'string' ? env.APP_DISPLAY_TIMEZONE.trim() : '';
  const rawBooking = typeof env.BOOKING_DISPLAY_TIMEZONE === 'string' ? env.BOOKING_DISPLAY_TIMEZONE.trim() : '';
  if (rawApp.length > 0 && IANA_LIKE.test(rawApp)) return rawApp;
  if (rawBooking.length > 0 && IANA_LIKE.test(rawBooking)) return rawBooking;
  return DEFAULT_APP_DISPLAY_TIMEZONE;
}

/**
 * Legacy async API — оставлен для совместимости вызовов; `_db` игнорируется.
 */
export function getBookingDisplayTimezone(_db?: unknown): Promise<string> {
  void _db;
  return Promise.resolve(getAppDisplayTimezoneSync());
}

export function resetBookingDisplayTimezoneCache(): void {
  // no-op
}

/**
 * Минуты смещения UTC для наивных меток Rubitime (`YYYY-MM-DD HH:mm:ss` без зоны).
 * Если в env задан RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES — используется он (ручной оверрайд).
 * Иначе — смещение выводится из IANA-зоны приложения для переданного instant.
 */
export function getRubitimeRecordAtUtcOffsetMinutesForInstant(instant: Date): number {
  const n = env.RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  return utcOffsetMinutesFromLongOffset(getAppDisplayTimezoneSync(), instant);
}

/**
 * ISO instant (UTC or offset) → Rubitime `record` string: `YYYY-MM-DD HH:mm:ss` in business IANA zone.
 * Used for api2 `create-record` (Rubitime expects naive local wall time, not UTC hours from ISO slice).
 */
export function formatIsoInstantAsRubitimeRecordLocal(slotStartIso: string, timeZone: string): string {
  const d = new Date(slotStartIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error('invalid_slot_start');
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPart['type']) => parts.find((p) => p.type === type)?.value ?? '';
  const y = get('year');
  const mo = get('month');
  const da = get('day');
  const h = get('hour');
  const mi = get('minute');
  const s = get('second');
  return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
}
