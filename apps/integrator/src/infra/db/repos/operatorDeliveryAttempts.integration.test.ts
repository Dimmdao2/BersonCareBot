/**
 * Opt-in REAL-Postgres proof for the delivery-attempt audit journal bug (found 04.08).
 *
 * `createOperatorAwareDeliveryAttemptWritePort` routes every `delivery.attempt.log` write made
 * under the `worker:outgoing-delivery-tick` infra principal into `app.record_operator_delivery_attempt`
 * — unconditionally, for every queue kind the worker processes, not just `operator_alert`. Before the
 * fix, that SQL function only accepted rows shaped like an operator alert (`op-inc:` eventId prefix,
 * `telegram`/`max` channel, a matching `outgoing_delivery_queue` row of `kind = 'operator_alert'`), so
 * every other kind's audit write (reminders, broadcasts, inbound replies, ...) was rejected right after
 * its delivery had already succeeded, and the caller's best-effort catch swallowed the failure. Concrete
 * failures this test catches:
 * - a non-operator-alert delivery (e.g. `reminder_dispatch`) leaves no attempt record at all;
 * - a failed delivery is equally unrecorded, so an operator can't see channel degradation;
 * - a retried attempt is rejected instead of appending a new row with the higher attempt number.
 *
 * Fixture writes and cleanup use app_staff. The behavior under test runs under the exact locked
 * worker source, therefore the narrow app_operational_delivery_worker role — the same role that has
 * no other privilege on `integrator.delivery_attempt_logs`.
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
      input: { eventId: string; channel: string; status: 'success' | 'failed'; attempt: number },
    ): Promise<void> {
      writtenLogEventIds.push(input.eventId);
      const mutation: DbWriteMutation = {
        type: 'delivery.attempt.log',
        params: {
          intentEventId: input.eventId,
          channel: input.channel,
          status: input.status,
          attempt: input.attempt,
          reason: input.status === 'failed' ? 'provider_rejected' : null,
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
          sql`SELECT status, attempt, payload_json->>'kind' AS kind
              FROM integrator.delivery_attempt_logs
              WHERE intent_event_id = ${eventId}
              ORDER BY attempt`,
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
            sql`DELETE FROM integrator.delivery_attempt_logs WHERE intent_event_id = ${eventId}`,
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
