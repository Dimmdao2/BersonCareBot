/**
 * Opt-in REAL-Postgres proof for D10b.
 *
 * Concrete failures caught:
 * - a stale "processing" row remains unclaimable forever;
 * - repeated worker crashes recycle one row forever instead of dead-lettering it;
 * - an expired "sent" queue row remains stored, or cleanup removes its durable attempt journal.
 *
 * Fixture writes and cleanup use app_staff. Reclaim/claim observations use the exact locked
 * worker source and therefore app_operational_delivery_worker (SELECT/UPDATE only).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealPostgresIntegrationTestHarness } from '../realPostgresIntegrationTestHarness.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  enqueueOutgoingDeliveryIfAbsent,
  resetStaleOutgoingDeliveryProcessing,
} from './outgoingDeliveryQueue.js';

const enabled =
  process.env.RUN_OUTGOING_DELIVERY_RECLAIM_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

describe.skipIf(!enabled)(
  'outgoing_delivery_queue reclaim / retention / dead-letter (opt-in, real Postgres)',
  () => {
    const harness = createRealPostgresIntegrationTestHarness('worker:outgoing-delivery-tick');
    const writtenQueueEventIds: string[] = [];
    const writtenAttemptEventIds: string[] = [];

    async function insertQueueRow(input: {
      status: 'processing' | 'sent';
      lastAttemptAt?: string;
      sentAt?: string;
      reclaimCount?: number;
    }): Promise<{ id: string; eventId: string }> {
      const eventId = `d10b-${randomUUID()}`;
      writtenQueueEventIds.push(eventId);
      const result = await harness.withFixtures((db) =>
        runIntegratorSql<{ id: string }>(
          db,
          sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, last_attempt_at, sent_at, reclaim_count
          ) VALUES (
            ${eventId}, 'operator_alert', 'telegram', '{}'::jsonb, ${input.status}, 1, 6,
            now(), ${input.lastAttemptAt ?? null}::timestamptz,
            ${input.sentAt ?? null}::timestamptz, ${input.reclaimCount ?? 0}
          )
          RETURNING id`,
        ),
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error('insertQueueRow: no id returned');
      return { id, eventId };
    }

    async function readQueueRow(
      id: string,
    ): Promise<
      { status: string; reclaim_count: number; failure_class: string | null } | undefined
    > {
      const result = await harness.withRuntime((db) =>
        runIntegratorSql<{
          status: string;
          reclaim_count: number;
          failure_class: string | null;
        }>(
          db,
          sql`SELECT status, reclaim_count, failure_class
              FROM public.outgoing_delivery_queue
              WHERE id = ${id}`,
        ),
      );
      return result.rows[0];
    }

    async function insertAttemptJournalMarker(): Promise<string> {
      const eventId = `d10b-attempt-${randomUUID()}`;
      writtenAttemptEventIds.push(eventId);
      await harness.withFixtures((db) =>
        runIntegratorSql(
          db,
          sql`INSERT INTO public.notification_delivery_attempts (
            channel, status, event_id, metadata
          ) VALUES ('telegram', 'success', ${eventId}, '{"test":"d10b"}'::jsonb)`,
        ),
      );
      return eventId;
    }

    beforeAll(async () => {
      await harness.assertTestDatabases();
    });

    afterAll(async () => {
      await harness.assertTestDatabases();
      await harness.withFixtures(async (db) => {
        if (writtenQueueEventIds.length > 0) {
          await runIntegratorSql(
            db,
            sql`DELETE FROM public.outgoing_delivery_queue
                WHERE event_id = ANY(${writtenQueueEventIds}::text[])`,
          );
        }
        if (writtenAttemptEventIds.length > 0) {
          await runIntegratorSql(
            db,
            sql`DELETE FROM public.notification_delivery_attempts
                WHERE event_id = ANY(${writtenAttemptEventIds}::text[])`,
          );
        }
      });
    });

    it('returns a stale processing row to pending but leaves a fresh processing row alone', async () => {
      const stale = await insertQueueRow({
        status: 'processing',
        lastAttemptAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      });
      const fresh = await insertQueueRow({
        status: 'processing',
        lastAttemptAt: new Date().toISOString(),
      });

      const result = await harness.withRuntime((db) =>
        resetStaleOutgoingDeliveryProcessing(db, 10, 5),
      );
      expect(result.reclaimed).toBeGreaterThanOrEqual(1);

      expect(await readQueueRow(stale.id)).toMatchObject({
        status: 'pending',
        reclaim_count: 1,
      });
      expect(await readQueueRow(fresh.id)).toMatchObject({ status: 'processing' });
    });

    it('dead-letters a stale row at the reclaim cap instead of recycling it forever', async () => {
      const capped = await insertQueueRow({
        status: 'processing',
        lastAttemptAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        reclaimCount: 4,
      });

      const result = await harness.withRuntime((db) =>
        resetStaleOutgoingDeliveryProcessing(db, 10, 5),
      );
      expect(result.deadLettered).toBeGreaterThanOrEqual(1);
      expect(await readQueueRow(capped.id)).toEqual({
        status: 'dead',
        reclaim_count: 5,
        failure_class: 'reclaim_limit_exceeded',
      });
    });

    it('producer cleanup removes an expired sent queue row and preserves both a recent row and its attempt journal', async () => {
      const expired = await insertQueueRow({
        status: 'sent',
        sentAt: new Date(Date.now() - 40 * 24 * 60 * 60_000).toISOString(),
      });
      const recent = await insertQueueRow({
        status: 'sent',
        sentAt: new Date().toISOString(),
      });
      const journalEventId = await insertAttemptJournalMarker();
      const enqueueEventId = `d10b-enqueue-${randomUUID()}`;
      writtenQueueEventIds.push(enqueueEventId);

      await harness.withFixtures((db) =>
        enqueueOutgoingDeliveryIfAbsent(db, {
          eventId: enqueueEventId,
          kind: 'operator_alert',
          channel: 'telegram',
          payloadJson: {},
        }),
      );

      expect(await readQueueRow(expired.id)).toBeUndefined();
      expect(await readQueueRow(recent.id)).toMatchObject({ status: 'sent' });
      const journal = await harness.withFixtures((db) =>
        runIntegratorSql<{ event_id: string }>(
          db,
          sql`SELECT event_id
              FROM public.notification_delivery_attempts
              WHERE event_id = ${journalEventId}`,
        ),
      );
      expect(journal.rows).toEqual([{ event_id: journalEventId }]);
    });
  },
);
