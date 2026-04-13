/**
 * Post-create projection: after a successful M2M create-record,
 * fetch the full record from Rubitime, normalize it, sync to Google Calendar,
 * and write booking.upsert so that appointment_records projection is populated
 * without waiting for a Rubitime webhook.
 *
 * Rubitime API2 enforces a minimum gap (~5s) between consecutive requests per key.
 * Right after `create-record`, `get-record` can fail with their rate limit; we wait
 * {@link RUBITIME_POST_CREATE_GET_RECORD_RETRY_MS} before a second fetch so the
 * intent is obvious in code. All api2 calls also go through the integrator-wide
 * throttle (`withRubitimeApiThrottle`, 5500 ms) for multi-process safety.
 *
 * This is intentionally a lightweight path that does NOT run the full
 * eventGateway / script runner to avoid duplicate notifications (those are
 * already sent via the booking.created lifecycle event from webapp).
 */
import type { DbWritePort, DispatchPort, WebappEventsPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { createDbPort } from '../../infra/db/client.js';
import { createGetBranchTimezoneWithDataQuality } from '../../infra/db/branchTimezone.js';
import { fetchRubitimeRecordById } from './client.js';
import { prepareRubitimeWebhookIngress } from './ingestNormalization.js';
import {
  buildUserEmailAutobindWebappEvent,
  syncRubitimeWebhookBodyToGoogleCalendar,
} from './connector.js';
import type { RubitimeWebhookBodyValidated } from './schema.js';

/** Margin over Rubitime's ~5s consecutive-request window before retrying `get-record` after a failure. */
export const RUBITIME_POST_CREATE_GET_RECORD_RETRY_MS = 5200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PostCreateProjectionDeps = {
  dispatchPort: DispatchPort;
  dbWritePort: DbWritePort;
  webappEventsPort?: WebappEventsPort | undefined;
};

export type PostCreateProjectionResult = {
  gcalEventId: string | null;
  projectionOk: boolean;
  error?: string;
};

export async function runPostCreateProjection(
  recordId: string,
  deps: PostCreateProjectionDeps,
): Promise<PostCreateProjectionResult> {
  logger.info({ recordId, source: 'postCreateProjection' }, 'starting post-create projection');

  let fetchedRecord: Record<string, unknown>;
  try {
    fetchedRecord = await fetchRubitimeRecordById({ recordId }) as Record<string, unknown>;
  } catch {
    try {
      await sleep(RUBITIME_POST_CREATE_GET_RECORD_RETRY_MS);
      fetchedRecord = await fetchRubitimeRecordById({ recordId }) as Record<string, unknown>;
    } catch (err) {
      logger.warn({ err, recordId }, '[postCreateProjection] fetch failed after retry');
      return { gcalEventId: null, projectionOk: false, error: 'fetch_failed' };
    }
  }

  logger.info({ recordId, fetchedKeys: Object.keys(fetchedRecord) }, 'fetched record from rubitime');

  const body: RubitimeWebhookBodyValidated = {
    from: 'webapp',
    event: 'event-create-record',
    data: fetchedRecord,
  };

  const db = createDbPort();
  const incoming = await prepareRubitimeWebhookIngress(body, {
    db,
    dispatchPort: deps.dispatchPort,
    getBranchTimezone: createGetBranchTimezoneWithDataQuality({ db, dispatchPort: deps.dispatchPort }),
  });

  let gcalEventId: string | null = null;
  try {
    gcalEventId = await syncRubitimeWebhookBodyToGoogleCalendar(incoming, {
      db,
      dispatchPort: deps.dispatchPort,
    });
    if (gcalEventId) {
      logger.info({ recordId, gcalEventId }, '[postCreateProjection] gcal sync ok');
    }
  } catch (err) {
    logger.warn({ err, recordId }, '[postCreateProjection] gcal sync failed');
  }

  try {
    await deps.dbWritePort.writeDb({
      type: 'booking.upsert',
      params: {
        externalRecordId: incoming.recordId,
        phoneNormalized: incoming.phone,
        recordAt: incoming.recordAt,
        status: 'created',
        rubitimeStatusCode: incoming.statusCode,
        payloadJson: incoming.record,
        lastEvent: incoming.action,
        gcalEventId: gcalEventId ?? undefined,
        rubitimeCooperatorId: incoming.cooperatorId,
        dateTimeEnd: incoming.dateTimeEnd,
        timeNormalizationStatus: incoming.timeNormalizationStatus,
        timeNormalizationFieldErrors: incoming.timeNormalizationFieldErrors,
      },
    });
    logger.info({ recordId }, '[postCreateProjection] booking.upsert ok');
  } catch (err) {
    logger.error({ err, recordId }, '[postCreateProjection] booking.upsert failed');
    return { gcalEventId, projectionOk: false, error: 'upsert_failed' };
  }

  if (deps.webappEventsPort) {
    const autobind = buildUserEmailAutobindWebappEvent(body);
    if (autobind) {
      try {
        await deps.webappEventsPort.emit(autobind);
      } catch (err) {
        logger.warn({ err, recordId }, '[postCreateProjection] email autobind emit failed');
      }
    }
  }

  return { gcalEventId, projectionOk: true };
}
