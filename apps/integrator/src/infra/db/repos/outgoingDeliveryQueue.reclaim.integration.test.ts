/**
 * Opt-in REAL-Postgres proof for D10b.
 *
 * Concrete failures caught:
 * - a stale "processing" row remains unclaimable forever;
 * - repeated worker crashes recycle one row forever instead of dead-lettering it;
 * - an expired "sent" queue row remains stored, or cleanup removes its durable attempt journal.
 *
 * Guarded admin-socket setup/cleanup creates unique rows only after the named DEV/TEST database
 * guard. Reclaim/claim observations use the exact worker capability and therefore
 * app_operational_delivery_worker (SELECT/UPDATE only).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { createRealPostgresIntegrationTestHarness } from '../realPostgresIntegrationTestHarness.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  enqueueOutgoingDeliveryIfAbsent,
  resetStaleOutgoingDeliveryProcessing,
} from './outgoingDeliveryQueue.js';

const enabled =
  process.env.RUN_OUTGOING_DELIVERY_RECLAIM_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context' &&
  Boolean((process.env.INTEGRATOR_DB_URL ?? '').trim());

describe.skipIf(!enabled)(
  'outgoing_delivery_queue reclaim / retention / dead-letter (opt-in, real Postgres)',
  () => {
    const harness = createRealPostgresIntegrationTestHarness(
      'worker:outgoing-delivery-tick',
      'port-context',
    );
    const writtenQueueEventIds: string[] = [];

    function sqlLiteral(value: string): string {
      return `'${value.replaceAll("'", "''")}'`;
    }

    type AttemptJournalSnapshot = {
      rowCount: number;
      ids: string[];
      contentFingerprint: string;
    };

    async function insertQueueRow(input: {
      status: 'processing' | 'sent';
      lastAttemptAt?: string;
      sentAt?: string;
      reclaimCount?: number;
    }): Promise<{ id: string; eventId: string }> {
      const eventId = `d10b-${randomUUID()}`;
      writtenQueueEventIds.push(eventId);
      const lastAttemptAt = input.lastAttemptAt === undefined
        ? 'NULL'
        : `${sqlLiteral(input.lastAttemptAt)}::timestamptz`;
      const sentAt = input.sentAt === undefined
        ? 'NULL'
        : `${sqlLiteral(input.sentAt)}::timestamptz`;
      const id = harness.withAdminSocket(`
        INSERT INTO public.outgoing_delivery_queue (
          event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
          next_retry_at, last_attempt_at, sent_at, reclaim_count
        ) VALUES (
          ${sqlLiteral(eventId)}, 'operator_alert', 'telegram', '{}'::jsonb,
          ${sqlLiteral(input.status)}, 1, 6, now(), ${lastAttemptAt}, ${sentAt},
          ${input.reclaimCount ?? 0}
        )
        RETURNING id;
      `);
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

    // Снимок ВСЕГО журнала: сравнение до/после доказывает, что уборка очереди его не трогает,
    // и делает это строже подставной строки — следим за всеми записями, а не за одной своей.
    // Списка идентификаторов здесь нет намеренно: параметризованный пустой массив приводил к
    // `cannot cast type record to text[]` на настоящей базе (поймано живым прогоном 31.07).
    async function readAttemptJournalSnapshot(): Promise<AttemptJournalSnapshot> {
      const raw = harness.withAdminSocket(`
        SELECT json_build_object(
          'rowCount', count(*)::integer,
          'ids', COALESCE(array_agg(attempt.id::text ORDER BY attempt.id), ARRAY[]::text[]),
          'contentFingerprint', md5(COALESCE(
            string_agg(to_jsonb(attempt)::text, '' ORDER BY attempt.id), ''
          ))
        )::text
        FROM public.notification_delivery_attempts AS attempt;
      `);
      const row = JSON.parse(raw) as AttemptJournalSnapshot;
      return {
        rowCount: row.rowCount,
        ids: row.ids,
        contentFingerprint: row.contentFingerprint,
      };
    }

    beforeAll(async () => {
      await harness.assertTestDatabases();
    });

    afterAll(async () => {
      await harness.assertTestDatabases();
      for (const eventId of writtenQueueEventIds) {
        harness.withAdminSocket(
          `DELETE FROM public.outgoing_delivery_queue WHERE event_id = ${sqlLiteral(eventId)};`,
        );
      }
      if (writtenQueueEventIds.length > 0) {
        for (const eventId of writtenQueueEventIds) {
          const remaining = await harness.withRuntime((db) =>
            runIntegratorSql<{ row_count: number }>(
              db,
              sql`SELECT count(*)::integer AS row_count
                  FROM public.outgoing_delivery_queue
                  WHERE event_id = ${eventId}`,
            ),
          );
          expect(remaining.rows[0]?.row_count).toBe(0);
        }
      }
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

    it('producer cleanup removes an expired sent queue row, preserves a recent row, and leaves the entire attempt journal unchanged', async () => {
      const expired = await insertQueueRow({
        status: 'sent',
        sentAt: new Date(Date.now() - 40 * 24 * 60 * 60_000).toISOString(),
      });
      const recent = await insertQueueRow({
        status: 'sent',
        sentAt: new Date().toISOString(),
      });
      const enqueueEventId = `d10b-enqueue-${randomUUID()}`;
      writtenQueueEventIds.push(enqueueEventId);

      const journalBefore = await readAttemptJournalSnapshot();
      expect(
        journalBefore.rowCount,
        'notification_delivery_attempts is empty under app_staff; 0 = 0 cannot prove journal preservation',
      ).toBeGreaterThan(0);

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
      const journalAfter = await readAttemptJournalSnapshot();
      expect(journalAfter.rowCount).toBe(journalBefore.rowCount);
      expect(journalAfter.contentFingerprint).toBe(journalBefore.contentFingerprint);
    });
  },
);
