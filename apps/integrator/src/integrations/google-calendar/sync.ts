import { createDbPort } from '../../infra/db/client.js';
import { getAppDisplayTimezone } from '../../config/appTimezone.js';
import { normalizeToUtcInstant } from '../../shared/normalizeToUtcInstant.js';
import { createGoogleCalendarClient, type GoogleCalendarClient, type GoogleCalendarEventInput } from './client.js';
import { isGoogleCalendarConfigured, type GoogleCalendarConfig } from './config.js';
import { getGoogleCalendarConfig } from './runtimeConfig.js';
import type { DbPort, DispatchPort } from '../../kernel/contracts/index.js';
import {
  deleteBookingCalendarMap,
  getGoogleEventIdByRubitimeRecordId,
  upsertBookingCalendarMap,
} from '../../infra/db/repos/bookingCalendarMap.js';

export type RubitimeCalendarSyncEvent = {
  action: 'created' | 'updated' | 'canceled';
  rubRecordId: string;
  recordAt?: string;
  record?: Record<string, unknown>;
  clientName?: string;
};

type SyncDeps = {
  client?: GoogleCalendarClient;
  config?: GoogleCalendarConfig;
  db?: DbPort;
  /** When set, display-timezone fallback triggers Telegram alert (dedup) like other prod paths. */
  dispatchPort?: DispatchPort;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractDurationMinutes(record: Record<string, unknown> | undefined): number {
  if (!record) return 60;
  return (
    asNumber(record.duration_minutes)
    ?? asNumber(record.duration)
    ?? asNumber(record.service_duration)
    ?? 60
  );
}

function extractServiceTitle(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  return (
    asString(record.service_title)
    ?? asString(record.service_name)
    ?? asString(record.service)
  );
}

/** Комментарий клиента — каноническое поле Rubitime API `comment`. */
const RUBITIME_CLIENT_COMMENT_KEYS = ['comment'] as const;

/**
 * Внутренний комментарий администратора: в API нет единого канонического имени во всех версиях;
 * перебираем типичные ключи (см. также merge в `connector.toRubitimeIncoming`).
 */
const RUBITIME_ADMIN_COMMENT_KEYS = [
  'admin_comment',
  'comment_admin',
  'staff_comment',
  'internal_comment',
  'admin_note',
] as const;

function firstNonEmptyFromRecord(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!record) return undefined;
  for (const k of keys) {
    const s = asString(record[k]);
    if (s) return s;
  }
  return undefined;
}

/** Текст описания события в Google Calendar (вместо одного только id записи). */
export function buildGoogleCalendarDescriptionFromRubitimeRecord(
  record: Record<string, unknown> | undefined,
  rubRecordId: string,
): string {
  const client = firstNonEmptyFromRecord(record, RUBITIME_CLIENT_COMMENT_KEYS);
  const admin = firstNonEmptyFromRecord(record, RUBITIME_ADMIN_COMMENT_KEYS);
  const parts: string[] = [];
  if (client) parts.push(`Клиент: ${client}`);
  if (admin) parts.push(`Администратор: ${admin}`);
  if (parts.length > 0) {
    return parts.join('\n\n');
  }
  return `Rubitime #${rubRecordId}`;
}

export async function mapRubitimeEventToGoogleEvent(
  input: RubitimeCalendarSyncEvent,
  options?: { db?: DbPort; displayTimeZone?: string; dispatchPort?: DispatchPort },
): Promise<GoogleCalendarEventInput | null> {
  if (!input.recordAt) return null;
  const db = options?.db ?? createDbPort();
  const displayTimeZone =
    options?.displayTimeZone
    ?? (await getAppDisplayTimezone(
        options?.dispatchPort !== undefined
          ? { db, dispatchPort: options.dispatchPort }
          : { db },
      ));
  const startIso = normalizeToUtcInstant(input.recordAt, displayTimeZone);
  if (!startIso) return null;
  const durationMinutes = extractDurationMinutes(input.record);
  const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
  const serviceTitle = extractServiceTitle(input.record);
  const summary = `${input.clientName ?? 'Клиент'}${serviceTitle ? ` — ${serviceTitle}` : ''}`;
  return {
    summary,
    startDateTime: startIso,
    endDateTime: endIso,
    description: buildGoogleCalendarDescriptionFromRubitimeRecord(input.record, input.rubRecordId),
  };
}

export async function syncAppointmentToCalendar(
  input: RubitimeCalendarSyncEvent,
  deps: SyncDeps = {},
): Promise<string | null> {
  const config = deps.config ?? await getGoogleCalendarConfig();
  if (!isGoogleCalendarConfigured(config)) {
    return null;
  }
  const db = deps.db ?? createDbPort();
  const client = deps.client ?? createGoogleCalendarClient();
  const existingGoogleEventId = await getGoogleEventIdByRubitimeRecordId(db, input.rubRecordId);
  if (input.action === 'canceled') {
    if (!existingGoogleEventId) return null;
    await client.deleteEvent(existingGoogleEventId);
    await deleteBookingCalendarMap(db, input.rubRecordId);
    return null;
  }
  const event = await mapRubitimeEventToGoogleEvent(input, {
    db,
    ...(deps.dispatchPort !== undefined ? { dispatchPort: deps.dispatchPort } : {}),
  });
  if (!event) return existingGoogleEventId;
  const upsertedId = await client.upsertEvent(existingGoogleEventId, event);
  await upsertBookingCalendarMap(db, { rubitimeRecordId: input.rubRecordId, gcalEventId: upsertedId });
  return upsertedId;
}
