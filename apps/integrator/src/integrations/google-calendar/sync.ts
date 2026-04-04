import { createDbPort } from '../../infra/db/client.js';
import {
  getAppDisplayTimezone,
  resolveRubitimeRecordAtUtcOffsetMinutes,
} from '../../config/appTimezone.js';
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

/** ISO with explicit zone is parsed as-is; naive `YYYY-MM-DD HH:mm:ss` / `T` without zone uses app display timezone. */
function parseRecordAtToIso(recordAt: string, displayTimeZone: string): string | null {
  const trimmed = recordAt.trim();
  const hasExplicitZone = /Z$/i.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed);
  if (hasExplicitZone) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  const naiveLocal = /^\d{4}-\d{2}-\d{2}(?: |T)\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed);
  if (naiveLocal) {
    const isoLocal = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(isoLocal);
    const probe =
      parts !== null
        ? new Date(
            Date.UTC(
              Number(parts[1]),
              Number(parts[2]) - 1,
              Number(parts[3]),
              Number(parts[4]),
              Number(parts[5]),
              Number(parts[6]),
            ),
          )
        : new Date();
    const offsetMin = resolveRubitimeRecordAtUtcOffsetMinutes(probe, displayTimeZone);
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');
    const date = new Date(`${isoLocal}${sign}${oh}:${om}`);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
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
  const startIso = parseRecordAtToIso(input.recordAt, displayTimeZone);
  if (!startIso) return null;
  const durationMinutes = extractDurationMinutes(input.record);
  const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
  const serviceTitle = extractServiceTitle(input.record);
  const summary = `${input.clientName ?? 'Клиент'}${serviceTitle ? ` — ${serviceTitle}` : ''}`;
  return {
    summary,
    startDateTime: startIso,
    endDateTime: endIso,
    description: `Rubitime record: ${input.rubRecordId}`,
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
