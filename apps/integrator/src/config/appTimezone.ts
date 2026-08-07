import type { DbPort, DispatchPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { recordDataQualityIncidentAndMaybeTelegram } from '../infra/db/dataQualityIncidentAlert.js';
import type { IntegrationDataQualityErrorReason } from '../shared/integrationDataQuality/types.js';
import {
  fetchIntegratorRuntimeSettingValueJson,
  parseSystemSettingStringValue,
} from '../infra/db/publicSystemSettings.js';

/**
 * Единая IANA-таймзона «бизнес-времени» интегратора: букинг, напоминания и формат сообщений.
 * Источник: `system_settings` key `app_display_timezone`, scope `admin` (как в webapp).
 */
export const DEFAULT_APP_DISPLAY_TIMEZONE = 'Europe/Moscow';

/** @deprecated Используйте {@link DEFAULT_APP_DISPLAY_TIMEZONE} — алиас для старых импортов. */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = DEFAULT_APP_DISPLAY_TIMEZONE;

const APP_DISPLAY_TZ_KEY = 'app_display_timezone';

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

type DisplayTzResolve =
  | { kind: 'ok'; timezone: string }
  | {
      kind: 'fallback';
      timezone: string;
      reason: IntegrationDataQualityErrorReason;
      rawValue: string | null;
    };

async function resolveAppDisplayTimezone(db: DbPort): Promise<DisplayTzResolve> {
  let valueJson: unknown | null;
  try {
    valueJson = await fetchIntegratorRuntimeSettingValueJson(db, APP_DISPLAY_TZ_KEY);
  } catch (err) {
    logger.warn({ err, reason: 'query_failed' }, '[appDisplayTimezone] fallback');
    return {
      kind: 'fallback',
      timezone: DEFAULT_APP_DISPLAY_TIMEZONE,
      reason: 'query_failed',
      rawValue: null,
    };
  }

  const rawParsed = valueJson !== null ? parseSystemSettingStringValue(valueJson) : null;
  if (rawParsed == null || rawParsed === '') {
    logger.warn({ reason: 'missing_or_empty' }, '[appDisplayTimezone] fallback');
    return {
      kind: 'fallback',
      timezone: DEFAULT_APP_DISPLAY_TIMEZONE,
      reason: 'missing_or_empty',
      rawValue: null,
    };
  }
  if (!isValidIanaTimeZone(rawParsed)) {
    logger.warn({ reason: 'invalid_iana', raw: rawParsed }, '[appDisplayTimezone] fallback');
    return {
      kind: 'fallback',
      timezone: DEFAULT_APP_DISPLAY_TIMEZONE,
      reason: 'invalid_iana',
      rawValue: rawParsed,
    };
  }

  return { kind: 'ok', timezone: rawParsed };
}

/**
 * IANA display timezone from webapp `system_settings`, read on demand.
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

/** @deprecated Используйте {@link getAppDisplayTimezone}. */
export async function getBookingDisplayTimezone(
  db: DbPort,
  dispatchPort?: DispatchPort,
): Promise<string> {
  return dispatchPort ? getAppDisplayTimezone({ db, dispatchPort }) : getAppDisplayTimezone({ db });
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
