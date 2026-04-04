import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

/** Repository for external booking records and incoming events. */
export type BookingRecordStatus = 'created' | 'updated' | 'canceled';

export type UpsertBookingRecordInput = {
  externalRecordId: string;
  phoneNormalized: string | null;
  recordAt: string | Date | null;
  status: BookingRecordStatus;
  gcalEventId?: string | null;
  payloadJson: unknown;
  lastEvent: string;
};

export type InsertBookingEventInput = {
  externalRecordId?: string | null;
  event: string;
  payloadJson: unknown;
};

export type BookingRecordRow = {
  id: string;
  external_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: BookingRecordStatus;
  payload_json: unknown;
  last_event: string;
  created_at: Date;
  updated_at: Date;
};

export type BookingRecordForLinking = {
  externalRecordId: string;
  phoneNormalized: string | null;
  payloadJson: unknown;
  recordAt: Date | null;
  status: BookingRecordStatus;
};

/** Creates or updates a booking record by external id. */
export async function upsertRecord(db: DbPort, input: UpsertBookingRecordInput): Promise<void> {
  const query = `
    INSERT INTO rubitime_records (
      rubitime_record_id,
      phone_normalized,
      record_at,
      status,
      gcal_event_id,
      payload_json,
      last_event,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3::timestamptz, $4, $5, $6::jsonb, $7, NOW(), NOW())
    ON CONFLICT (rubitime_record_id)
    DO UPDATE SET
      phone_normalized = EXCLUDED.phone_normalized,
      record_at = EXCLUDED.record_at,
      status = EXCLUDED.status,
      gcal_event_id = EXCLUDED.gcal_event_id,
      payload_json = EXCLUDED.payload_json,
      last_event = EXCLUDED.last_event,
      updated_at = NOW()
  `;

  const recordAt = input.recordAt instanceof Date ? input.recordAt.toISOString() : input.recordAt;
  try {
    await db.query(query, [
      input.externalRecordId,
      input.phoneNormalized,
      recordAt,
      input.status,
      input.gcalEventId ?? null,
      JSON.stringify(input.payloadJson),
      input.lastEvent,
    ]);
  } catch (err) {
    logger.error({ err, externalRecordId: input.externalRecordId }, 'upsert booking record failed');
  }
}

/** Saves raw incoming booking event journal entry. */
export async function insertEvent(db: DbPort, input: InsertBookingEventInput): Promise<void> {
  const query = `
    INSERT INTO rubitime_events (
      rubitime_record_id,
      event,
      payload_json,
      received_at
    )
    VALUES ($1, $2, $3::jsonb, NOW())
  `;
  try {
    await db.query(query, [
      input.externalRecordId ?? null,
      input.event,
      JSON.stringify(input.payloadJson),
    ]);
  } catch (err) {
    logger.error({ err, event: input.event }, 'insert booking event failed');
  }
}

export type ActiveBookingRecord = {
  rubitimeRecordId: string;
  recordAt: string | null;
  status: string;
  /** Link to the record (from RubiTime payload: link, url, or record_url). */
  link?: string | null;
};

/** Returns active (non-canceled) records by normalized phone. */
export async function getActiveRecordsByPhone(
  db: DbPort,
  phoneNormalized: string,
): Promise<ActiveBookingRecord[]> {
  // SQL column names trigger no-secrets entropy check (false positive)
  /* eslint-disable-next-line no-secrets/no-secrets */
  const query = `
    SELECT
      rubitime_record_id,
      record_at,
      status,
      COALESCE(
        NULLIF(TRIM(payload_json->>'link'), ''),
        NULLIF(TRIM(payload_json->>'url'), ''),
        NULLIF(TRIM(payload_json->>'record_url'), '')
      ) AS record_link
    FROM rubitime_records
    WHERE phone_normalized = $1
      AND status IN ('created', 'updated')
    ORDER BY record_at ASC NULLS LAST
  `;
  try {
    const res = await db.query<{
      rubitime_record_id: string;
      record_at: Date | null;
      status: string;
      record_link: string | null;
    }>(query, [phoneNormalized]);
    return res.rows.map((row) => ({
      rubitimeRecordId: row.rubitime_record_id,
      recordAt: row.record_at ? row.record_at.toISOString() : null,
      status: row.status,
      link: row.record_link ?? null,
    }));
  } catch (err) {
    logger.error({ err, phoneNormalized }, 'get active records by phone failed');
    return [];
  }
}

/** Returns record data for linking flows. */
export async function getRecordByExternalId(
  db: DbPort,
  externalRecordId: string,
): Promise<BookingRecordForLinking | null> {
  const query = `
    SELECT
      rubitime_record_id AS external_record_id,
      phone_normalized,
      payload_json,
      record_at,
      status
    FROM rubitime_records
    WHERE rubitime_record_id = $1
    LIMIT 1
  `;
  try {
    const res = await db.query<{
      external_record_id: string;
      phone_normalized: string | null;
      payload_json: unknown;
      record_at: Date | null;
      status: BookingRecordStatus;
    }>(query, [externalRecordId]);
    const row = res.rows[0];
    if (!row) return null;
    return {
      externalRecordId: row.external_record_id,
      phoneNormalized: row.phone_normalized,
      payloadJson: row.payload_json,
      recordAt: row.record_at,
      status: row.status,
    };
  } catch (err) {
    logger.error({ err, externalRecordId }, 'get booking record by id failed');
    return null;
  }
}
