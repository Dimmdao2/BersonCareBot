/**
 * Opt-in REAL-Postgres proof for the delivery-attempt audit journal (D10a writer path).
 *
 * `createOperatorAwareDeliveryAttemptWritePort` routes every `delivery.attempt.log` write made
 * under the `worker:outgoing-delivery-tick` infra principal into `app.record_operator_delivery_attempt`
 * — unconditionally, for every queue kind the worker processes. The function validates provenance
 * against a matching `outgoing_delivery_queue` row and inserts into
 * `public.notification_delivery_attempts` (D10a canonical journal).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { createRealPostgresIntegrationTestHarness } from '../realPostgresIntegrationTestHarness.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { recordOperatorDeliveryAttempt } from './operatorDeliveryAttempts.js';

const enabled =
  process.env.RUN_OPERATOR_DELIVERY_ATTEMPT_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

describe.skipIf(!enabled)(
  'record_operator_delivery_attempt covers the whole outgoing-delivery queue (opt-in, real Postgres)',
  () => {
    const harness = createRealPostgresIntegrationTestHarness('worker:outgoing-delivery-tick');
    const writtenQueueEventIds: string[] = [];
    const writtenLogEventIds: string[] = [];

    async function insertQueueRow(input: { kind: string; channel: string }): Promise<string> {
      const eventId = `d987-${randomUUID()}`;
      writtenQueueEventIds.push(eventId);
      await harness.withFixtures((db) =>
        runIntegratorSql(
          db,
          sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at
          ) VALUES (
            ${eventId}, ${input.kind}, ${input.channel},
            ${JSON.stringify({ intent: { meta: { eventId } } })}::jsonb,
            'sent', 1, 6, now()
          )`,
        ),
      );
      return eventId;
    }

    function logAttempt(
      db: DbPort,
      input: {
        eventId: string;
        channel: string;
        status: 'success' | 'failed' | 'skipped';
        attempt: number;
        reason?: string;
      },
    ): Promise<void> {
      writtenLogEventIds.push(input.eventId);
      const mutation: DbWriteMutation = {
        type: 'delivery.attempt.log',
        params: {
          intentEventId: input.eventId,
          channel: input.channel,
          status: input.status,
          attempt: input.attempt,
          reason:
            input.reason ??
            (input.status === 'failed'
              ? 'provider_rejected'
              : input.status === 'skipped'
                ? 'provider_skipped'
                : null),
        },
      };
      return recordOperatorDeliveryAttempt(db, mutation);
    }

    async function readLoggedAttempts(
      eventId: string,
    ): Promise<{ status: string; attempt: number; kind: unknown }[]> {
      const result = await harness.withFixtures((db) =>
        runIntegratorSql<{ status: string; attempt: number; kind: unknown }>(
          db,
          sql`SELECT status, (metadata->>'attempt')::int AS attempt, intent_type AS kind
              FROM public.notification_delivery_attempts
              WHERE event_id = ${eventId}
              ORDER BY (metadata->>'attempt')::int`,
        ),
      );
      return result.rows;
    }

    beforeAll(async () => {
      await harness.assertTestDatabases();
    });

    afterAll(async () => {
      await harness.withFixtures(async (db) => {
        for (const eventId of writtenQueueEventIds) {
          await runIntegratorSql(
            db,
            sql`DELETE FROM public.outgoing_delivery_queue WHERE event_id = ${eventId}`,
          );
        }
        for (const eventId of writtenLogEventIds) {
          await runIntegratorSql(
            db,
            sql`DELETE FROM public.notification_delivery_attempts WHERE event_id = ${eventId}`,
          );
        }
      });
    });

    it('records a successful reminder_dispatch attempt (previously rejected as a non-operator-alert kind)', async () => {
      const eventId = await insertQueueRow({ kind: 'reminder_dispatch', channel: 'telegram' });

      await harness.withRuntime((db) =>
        logAttempt(db, { eventId, channel: 'telegram', status: 'success', attempt: 1 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'success', attempt: 1, kind: 'reminder_dispatch' }]);
    });

    it('records a failed doctor_broadcast_intent attempt, not only successes', async () => {
      const eventId = await insertQueueRow({ kind: 'doctor_broadcast_intent', channel: 'max' });

      await harness.withRuntime((db) =>
        logAttempt(db, { eventId, channel: 'max', status: 'failed', attempt: 1 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'failed', attempt: 1, kind: 'doctor_broadcast_intent' }]);
    });

    it('a retried attempt appends with the higher attempt number instead of failing', async () => {
      const eventId = await insertQueueRow({ kind: 'inbound_reply', channel: 'telegram' });

      await harness.withRuntime((db) =>
        logAttempt(db, { eventId, channel: 'telegram', status: 'failed', attempt: 1 }),
      );
      await harness.withRuntime((db) =>
        logAttempt(db, { eventId, channel: 'telegram', status: 'success', attempt: 2 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([
        { status: 'failed', attempt: 1, kind: 'inbound_reply' },
        { status: 'success', attempt: 2, kind: 'inbound_reply' },
      ]);
    });

    it('still records a genuine operator_alert attempt (no regression from widening the check)', async () => {
      const eventId = await insertQueueRow({ kind: 'operator_alert', channel: 'telegram' });

      await harness.withRuntime((db) =>
        logAttempt(db, { eventId, channel: 'telegram', status: 'success', attempt: 1 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'success', attempt: 1, kind: 'operator_alert' }]);
    });

    it('records skipped status for pre-dispatch worker skips', async () => {
      const eventId = await insertQueueRow({ kind: 'reminder_dispatch', channel: 'email' });

      await harness.withRuntime((db) =>
        logAttempt(db, {
          eventId,
          channel: 'email',
          status: 'skipped',
          attempt: 1,
          reason: 'stale_materialization',
        }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([
        { status: 'skipped', attempt: 1, kind: 'reminder_dispatch' },
      ]);
    });

    it('still rejects an attempt with no matching queue row (forged provenance)', async () => {
      const eventId = `d987-${randomUUID()}`;
      await expect(
        harness.withRuntime((db) =>
          logAttempt(db, { eventId, channel: 'telegram', status: 'success', attempt: 1 }),
        ),
      ).rejects.toThrow();
    });
  },
);
