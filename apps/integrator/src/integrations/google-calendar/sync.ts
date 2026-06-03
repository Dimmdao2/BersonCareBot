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
import { buildGoogleCalendarDescriptionForSync } from './calendarDescription.js';
import {
  buildGoogleCalendarSummary,
  type GoogleCalendarTitleMarker,
} from './summaryMarkers.js';

export type { GoogleCalendarTitleMarker } from './summaryMarkers.js';

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

export type RubitimeCalendarSyncEvent = {
  action: 'created' | 'updated' | 'canceled';
  rubRecordId: string;
  recordAt?: string;
  record?: Record<string, unknown>;
  clientName?: string;
  phoneNormalized?: string | null;
  /** `canceled` action удаляет событие; маркеры — только при upsert (`created`/`updated`). */
  titleMarker?: GoogleCalendarTitleMarker;
};

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
  const summary = buildGoogleCalendarSummary(
    input.clientName,
    serviceTitle,
    input.titleMarker ?? 'none',
  );
  const description = await buildGoogleCalendarDescriptionForSync(db, {
    rubRecordId: input.rubRecordId,
    ...(input.record !== undefined ? { record: input.record } : {}),
    ...(input.phoneNormalized !== undefined ? { phoneNormalized: input.phoneNormalized } : {}),
  });
  return {
    summary,
    startDateTime: startIso,
    endDateTime: endIso,
    description,
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

export type CanonicalCalendarSyncEvent = {
  action: 'created' | 'updated' | 'canceled';
  appointmentId: string;
  /** When set (Rubitime transitional create), reuse the same GCal map row as post-create projection. */
  rubitimeRecordId?: string | null;
  startAt: string;
  endAt: string;
  clientName?: string;
  serviceTitle?: string | null;
  description?: string;
  phoneNormalized?: string | null;
  titleMarker?: GoogleCalendarTitleMarker;
};

export function canonicalCalendarMapKey(appointmentId: string): string {
  return `be:${appointmentId}`;
}

export async function syncCanonicalAppointmentToCalendar(
  input: CanonicalCalendarSyncEvent,
  deps: SyncDeps = {},
): Promise<string | null> {
  const rt = input.rubitimeRecordId?.trim();
  const mapKey = rt ? rt : canonicalCalendarMapKey(input.appointmentId);
  return syncAppointmentToCalendar(
    {
      action: input.action === 'created' ? 'created' : input.action === 'canceled' ? 'canceled' : 'updated',
      rubRecordId: mapKey,
      recordAt: input.startAt,
      record: {
        duration_minutes: Math.max(
          1,
          Math.round((new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 60_000),
        ),
        service_title: input.serviceTitle ?? undefined,
        comment: input.description,
      },
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.phoneNormalized !== undefined ? { phoneNormalized: input.phoneNormalized } : {}),
      ...(input.titleMarker !== undefined ? { titleMarker: input.titleMarker } : {}),
    },
    deps,
  );
}
