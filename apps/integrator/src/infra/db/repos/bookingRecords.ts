import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { rubitimeEvents, rubitimeRecords } from '../schema/integratorDomainRepos.js';

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
  const recordAt =
    input.recordAt instanceof Date ? input.recordAt.toISOString() : (input.recordAt as string | null);
  const d = getIntegratorDrizzleSession(db);
  try {
    await d
      .insert(rubitimeRecords)
      .values({
        rubitimeRecordId: input.externalRecordId,
        phoneNormalized: input.phoneNormalized,
        recordAt,
        status: input.status,
        gcalEventId: input.gcalEventId ?? null,
        payloadJson: input.payloadJson as Record<string, unknown>,
        lastEvent: input.lastEvent,
      })
      .onConflictDoUpdate({
        target: rubitimeRecords.rubitimeRecordId,
        set: {
          phoneNormalized: input.phoneNormalized,
          recordAt,
          status: input.status,
          gcalEventId: input.gcalEventId ?? null,
          payloadJson: input.payloadJson as Record<string, unknown>,
          lastEvent: input.lastEvent,
          updatedAt: sql`NOW()`,
        },
      });
  } catch (err) {
    logger.error({ err, externalRecordId: input.externalRecordId }, 'upsert booking record failed');
  }
}

/** Saves raw incoming booking event journal entry. */
export async function insertEvent(db: DbPort, input: InsertBookingEventInput): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  try {
    await d.insert(rubitimeEvents).values({
      rubitimeRecordId: input.externalRecordId ?? null,
      event: input.event,
      payloadJson: input.payloadJson as Record<string, unknown>,
    });
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
  const d = getIntegratorDrizzleSession(db);
  try {
    const rows = await d
      .select({
        rubitimeRecordId: rubitimeRecords.rubitimeRecordId,
        recordAt: rubitimeRecords.recordAt,
        status: rubitimeRecords.status,
        recordLink: sql<string | null>`
          COALESCE(
            NULLIF(TRIM(${rubitimeRecords.payloadJson}->>'link'), ''),
            NULLIF(TRIM(${rubitimeRecords.payloadJson}->>'url'), ''),
            NULLIF(TRIM(${rubitimeRecords.payloadJson}->>'record_url'), '')
          )
        `.as('record_link'),
      })
      .from(rubitimeRecords)
      .where(
        and(eq(rubitimeRecords.phoneNormalized, phoneNormalized), inArray(rubitimeRecords.status, ['created', 'updated'])),
      )
      .orderBy(sql`${rubitimeRecords.recordAt} ASC NULLS LAST`);
    return rows.map((row) => ({
      rubitimeRecordId: row.rubitimeRecordId,
      recordAt: row.recordAt ?? null,
      status: row.status,
      link: row.recordLink ?? null,
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
  const d = getIntegratorDrizzleSession(db);
  try {
    const rows = await d
      .select({
        externalRecordId: rubitimeRecords.rubitimeRecordId,
        phoneNormalized: rubitimeRecords.phoneNormalized,
        payloadJson: rubitimeRecords.payloadJson,
        recordAt: rubitimeRecords.recordAt,
        status: rubitimeRecords.status,
      })
      .from(rubitimeRecords)
      .where(eq(rubitimeRecords.rubitimeRecordId, externalRecordId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      externalRecordId: row.externalRecordId,
      phoneNormalized: row.phoneNormalized,
      payloadJson: row.payloadJson,
      recordAt: row.recordAt ? new Date(row.recordAt) : null,
      status: row.status as BookingRecordStatus,
    };
  } catch (err) {
    logger.error({ err, externalRecordId }, 'get booking record by id failed');
    return null;
  }
}
