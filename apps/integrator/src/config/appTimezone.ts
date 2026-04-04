import type { DbPort, DispatchPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { recordDataQualityIncidentAndMaybeTelegram } from '../infra/db/dataQualityIncidentAlert.js';
import type { IntegrationDataQualityErrorReason } from '../shared/integrationDataQuality/types.js';

/**
 * Единая IANA-таймзона «бизнес-времени» интегратора: букинг, напоминания, формат сообщений,
 * интерпретация наивных дат Rubitime (канонический парсинг — `shared/normalizeToUtcInstant`; см. {@link resolveRubitimeRecordAtUtcOffsetMinutes}).
 * Источник: `system_settings` key `app_display_timezone`, scope `admin` (как в webapp).
 */
export const DEFAULT_APP_DISPLAY_TIMEZONE = 'Europe/Moscow';

/** @deprecated Используйте {@link DEFAULT_APP_DISPLAY_TIMEZONE} — алиас для старых импортов. */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = DEFAULT_APP_DISPLAY_TIMEZONE;

const ADMIN_SCOPE = 'admin';
const APP_DISPLAY_TZ_KEY = 'app_display_timezone';
const TTL_MS = 60_000;

type CacheEntry = { tz: string; expiresAt: number };
let displayTzCache: CacheEntry | null = null;

function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

function parseSettingsValueJson(valueJson: unknown): string | null {
  if (valueJson !== null && typeof valueJson === 'object' && 'value' in valueJson) {
    const v = (valueJson as Record<string, unknown>).value;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

type DisplayTzResolve =
  | { kind: 'ok'; timezone: string }
  | {
      kind: 'fallback';
      timezone: string;
      reason: IntegrationDataQualityErrorReason;
      rawValue: string | null;
    };

async function resolveAppDisplayTimezone(db: DbPort): Promise<DisplayTzResolve> {
  const now = Date.now();
  if (displayTzCache && displayTzCache.expiresAt > now) {
    return { kind: 'ok', timezone: displayTzCache.tz };
  }

  let rows: { value_json: unknown }[];
  try {
    const res = await db.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2 LIMIT 1`,
      [APP_DISPLAY_TZ_KEY, ADMIN_SCOPE],
    );
    rows = res.rows;
  } catch (err) {
    logger.warn({ err, reason: 'query_failed' }, '[appDisplayTimezone] fallback');
    displayTzCache = { tz: DEFAULT_APP_DISPLAY_TIMEZONE, expiresAt: now + TTL_MS };
    return {
      kind: 'fallback',
      timezone: DEFAULT_APP_DISPLAY_TIMEZONE,
      reason: 'query_failed',
      rawValue: null,
    };
  }

  const rawParsed = rows[0] ? parseSettingsValueJson(rows[0].value_json) : null;
  if (rawParsed == null || rawParsed === '') {
    logger.warn({ reason: 'missing_or_empty' }, '[appDisplayTimezone] fallback');
    displayTzCache = { tz: DEFAULT_APP_DISPLAY_TIMEZONE, expiresAt: now + TTL_MS };
    return {
      kind: 'fallback',
      timezone: DEFAULT_APP_DISPLAY_TIMEZONE,
      reason: 'missing_or_empty',
      rawValue: null,
    };
  }
  if (!isValidIanaTimeZone(rawParsed)) {
    logger.warn({ reason: 'invalid_iana', raw: rawParsed }, '[appDisplayTimezone] fallback');
    displayTzCache = { tz: DEFAULT_APP_DISPLAY_TIMEZONE, expiresAt: now + TTL_MS };
    return {
      kind: 'fallback',
      timezone: DEFAULT_APP_DISPLAY_TIMEZONE,
      reason: 'invalid_iana',
      rawValue: rawParsed,
    };
  }

  displayTzCache = { tz: rawParsed, expiresAt: now + TTL_MS };
  return { kind: 'ok', timezone: rawParsed };
}

/**
 * IANA display timezone from webapp `system_settings` (TTL 60s).
 * Missing/invalid → `Europe/Moscow`, data-quality incident + optional Telegram (deduped).
 */
export async function getAppDisplayTimezone(input: {
  db: DbPort;
  dispatchPort?: DispatchPort;
}): Promise<string> {
  const r = await resolveAppDisplayTimezone(input.db);
  if (r.kind === 'ok') return r.timezone;

  await recordDataQualityIncidentAndMaybeTelegram({
    db: input.db,
    ...(input.dispatchPort ? { dispatchPort: input.dispatchPort } : {}),
    incident: {
      integration: 'core',
      entity: 'system_settings',
      externalId: APP_DISPLAY_TZ_KEY,
      field: 'app_display_timezone',
      rawValue: r.rawValue,
      timezoneUsed: DEFAULT_APP_DISPLAY_TIMEZONE,
      errorReason: r.reason,
    },
    alertLines: [
      '⚠️ App display timezone fallback',
      `key: ${APP_DISPLAY_TZ_KEY}`,
      `reason: ${r.reason}`,
      ...(r.rawValue != null && r.rawValue !== '' ? [`raw: ${r.rawValue}`] : []),
      `fallback: ${DEFAULT_APP_DISPLAY_TIMEZONE}`,
    ],
  });

  return r.timezone;
}

/** Test hook: clear TTL cache for display timezone. */
export function resetAppDisplayTimezoneCacheForTests(): void {
  displayTzCache = null;
}

/** @deprecated Используйте {@link getAppDisplayTimezone}. */
export async function getBookingDisplayTimezone(
  db: DbPort,
  dispatchPort?: DispatchPort,
): Promise<string> {
  return dispatchPort
    ? getAppDisplayTimezone({ db, dispatchPort })
    : getAppDisplayTimezone({ db });
}

/** @deprecated Используйте {@link resetAppDisplayTimezoneCacheForTests}. */
export function resetBookingDisplayTimezoneCache(): void {
  resetAppDisplayTimezoneCacheForTests();
}

const IANA_LIKE = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

let warnedLegacyEnvAppDisplayTimezone = false;

/** Test hook: allow repeated assertions on legacy-env warning. */
export function resetAppDisplayTimezoneSyncWarnForTests(): void {
  warnedLegacyEnvAppDisplayTimezone = false;
}

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
 * @deprecated Только для обратной совместимости тестов/одноразовых скриптов без БД:
 * читает необработанные process.env для устаревших имён display-TZ (вне zod-схемы); иначе дефолт.
 * В рантайме сервиса используйте {@link getAppDisplayTimezone}.
 */
export function getAppDisplayTimezoneSync(): string {
  const rawApp = typeof process.env.APP_DISPLAY_TIMEZONE === 'string' ? process.env.APP_DISPLAY_TIMEZONE.trim() : '';
  const rawBooking =
    typeof process.env.BOOKING_DISPLAY_TIMEZONE === 'string' ? process.env.BOOKING_DISPLAY_TIMEZONE.trim() : '';
  if (rawApp.length > 0 || rawBooking.length > 0) {
    if (!warnedLegacyEnvAppDisplayTimezone) {
      warnedLegacyEnvAppDisplayTimezone = true;
      logger.warn(
        {
          hasAppDisplayTimezoneEnv: rawApp.length > 0,
          hasBookingDisplayTimezoneEnv: rawBooking.length > 0,
        },
        '[appDisplayTimezone] APP_DISPLAY_TIMEZONE / BOOKING_DISPLAY_TIMEZONE are unsupported; use system_settings key app_display_timezone (admin scope)',
      );
    }
  }
  if (rawApp.length > 0 && IANA_LIKE.test(rawApp)) return rawApp;
  if (rawBooking.length > 0 && IANA_LIKE.test(rawBooking)) return rawBooking;
  return DEFAULT_APP_DISPLAY_TIMEZONE;
}

/**
 * Минуты смещения UTC для наивных меток Rubitime (`YYYY-MM-DD HH:mm:ss` без зоны):
 * из IANA `displayTimeZone` для переданного instant (DST через ICU `longOffset`).
 */
export function resolveRubitimeRecordAtUtcOffsetMinutes(instant: Date, displayTimeZone: string): number {
  return utcOffsetMinutesFromLongOffset(displayTimeZone, instant);
}

export async function getRubitimeRecordAtUtcOffsetMinutesForInstant(input: {
  db: DbPort;
  instant: Date;
  dispatchPort?: DispatchPort;
}): Promise<number> {
  const tz = await getAppDisplayTimezone(
    input.dispatchPort
      ? { db: input.db, dispatchPort: input.dispatchPort }
      : { db: input.db },
  );
  return resolveRubitimeRecordAtUtcOffsetMinutes(input.instant, tz);
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
