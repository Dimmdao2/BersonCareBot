import { createDbPort } from '../../infra/db/client.js';
import { createGoogleCalendarClient, type GoogleCalendarClient, type GoogleCalendarEventInput } from './client.js';
import { isGoogleCalendarConfigured, type GoogleCalendarConfig } from './config.js';
import { getGoogleCalendarConfig } from './runtimeConfig.js';
import type { DbPort, DispatchPort } from '../../kernel/contracts/index.js';
import {
  deleteBookingCalendarMap,
  getGoogleEventIdByAppointmentKey,
  upsertBookingCalendarMap,
} from '../../infra/db/repos/bookingCalendarMap.js';
import { buildGoogleCalendarDescriptionForSync } from './calendarDescription.js';
import { resolvePackageCalendarContext } from './resolvePackageCalendarContext.js';
import {
  buildGoogleCalendarSummary,
  type GoogleCalendarTitleMarker,
} from './summaryMarkers.js';

export type { GoogleCalendarTitleMarker } from './summaryMarkers.js';

type SyncDeps = {
  client?: GoogleCalendarClient;
  config?: GoogleCalendarConfig;
  db?: DbPort;
  dispatchPort?: DispatchPort;
};

export type CanonicalCalendarSyncEvent = {
  action: 'created' | 'updated' | 'canceled';
  appointmentId: string;
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

export async function mapCanonicalAppointmentToGoogleEvent(
  input: CanonicalCalendarSyncEvent,
  db: DbPort,
): Promise<GoogleCalendarEventInput | null> {
  const startMs = new Date(input.startAt).getTime();
  const endMs = new Date(input.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  let packageLinked = false;
  let packageSessionLine: string | null = null;
  try {
    const packageContext = await resolvePackageCalendarContext(db, input.appointmentId);
    packageLinked = packageContext.packageLinked;
    packageSessionLine = packageContext.packageSessionLine;
  } catch {
    // Package enrichment is best-effort.
  }

  return {
    summary: buildGoogleCalendarSummary(
      input.clientName,
      input.serviceTitle ?? undefined,
      input.titleMarker ?? 'none',
      packageLinked,
    ),
    startDateTime: new Date(startMs).toISOString(),
    endDateTime: new Date(endMs).toISOString(),
    description: await buildGoogleCalendarDescriptionForSync(db, {
      appointmentId: input.appointmentId,
      ...(input.phoneNormalized !== undefined ? { phoneNormalized: input.phoneNormalized } : {}),
      ...(input.description !== undefined ? { clientComment: input.description } : {}),
      packageSessionLine,
    }),
  };
}

export async function syncCanonicalAppointmentToCalendar(
  input: CanonicalCalendarSyncEvent,
  deps: SyncDeps = {},
): Promise<string | null> {
  const config = deps.config ?? await getGoogleCalendarConfig();
  if (!isGoogleCalendarConfigured(config)) return null;

  const db = deps.db ?? createDbPort();
  const client = deps.client ?? createGoogleCalendarClient();
  const appointmentKey = canonicalCalendarMapKey(input.appointmentId);
  const existingGoogleEventId = await getGoogleEventIdByAppointmentKey(db, appointmentKey);

  if (input.action === 'canceled') {
    if (!existingGoogleEventId) return null;
    await client.deleteEvent(existingGoogleEventId);
    await deleteBookingCalendarMap(db, appointmentKey);
    return null;
  }

  const event = await mapCanonicalAppointmentToGoogleEvent(input, db);
  if (!event) return existingGoogleEventId;
  const upsertedId = await client.upsertEvent(existingGoogleEventId, event);
  await upsertBookingCalendarMap(db, { appointmentKey, gcalEventId: upsertedId });
  return upsertedId;
}
