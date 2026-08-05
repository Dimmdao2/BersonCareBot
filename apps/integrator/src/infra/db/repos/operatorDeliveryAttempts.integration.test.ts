/**
 * Opt-in REAL-Postgres proof for the delivery-attempt audit journal (D10a writer path).
 *
 * `createOperatorAwareDeliveryAttemptWritePort` routes every `delivery.attempt.log` write made
 * under the `worker:outgoing-delivery-tick` infra principal (or outgoing-delivery worker audit
 * context during per-row dispatch) into `app.record_operator_delivery_attempt` — for every queue
 * kind the worker processes. The function validates provenance against a matching
 * `outgoing_delivery_queue` row and inserts into `public.notification_delivery_attempts`
 * (D10a canonical journal).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbPort, DbWriteMutation, DbWritePort } from '../../../kernel/contracts/index.js';
import { createOperatorAwareDeliveryAttemptWritePort } from '../../runtime/worker/operatorDeliveryAttemptWritePort.js';
import { runWithOutgoingDeliveryWorkerAuditContext } from '../../runtime/worker/outgoingDeliveryWorkerAuditContext.js';
import {
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';
import { createRealPostgresIntegrationTestHarness } from '../realPostgresIntegrationTestHarness.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

const enabled =
  process.env.RUN_OPERATOR_DELIVERY_ATTEMPT_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

const TEST_FIXTURE_ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

describe.skipIf(!enabled)(
  'createOperatorAwareDeliveryAttemptWritePort (opt-in, real Postgres)',
  () => {
    const harness = createRealPostgresIntegrationTestHarness('worker:outgoing-delivery-tick');
    const writtenQueueEventIds: string[] = [];
    const writtenLogEventIds: string[] = [];

    function createWorkerShapedWritePort(db: DbPort): DbWritePort {
      const tenantWritePort: DbWritePort = {
        writeDb: async () => {
          throw new Error('tenant delivery.attempt.log path must not run in worker audit context');
        },
      };
      return createOperatorAwareDeliveryAttemptWritePort({ db, tenantWritePort });
    }

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

    function buildAttemptMutation(input: {
      eventId: string;
      channel: string;
      status: 'success' | 'failed' | 'skipped';
      attempt: number;
      reason?: string;
    }): DbWriteMutation {
      writtenLogEventIds.push(input.eventId);
      return {
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
                ? 'stale_materialization'
                : null),
        },
      };
    }

    async function logAttemptViaWorkerPort(
      db: DbPort,
      input: {
        eventId: string;
        channel: string;
        status: 'success' | 'failed' | 'skipped';
        attempt: number;
        reason?: string;
      },
    ): Promise<void> {
      const writePort = createWorkerShapedWritePort(db);
      await writePort.writeDb(buildAttemptMutation(input));
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

    it('records a successful reminder_dispatch attempt via worker-shaped writePort', async () => {
      const eventId = await insertQueueRow({ kind: 'reminder_dispatch', channel: 'telegram' });

      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, { eventId, channel: 'telegram', status: 'success', attempt: 1 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'success', attempt: 1, kind: 'reminder_dispatch' }]);
    });

    it('records a failed doctor_broadcast_intent attempt via worker-shaped writePort', async () => {
      const eventId = await insertQueueRow({ kind: 'doctor_broadcast_intent', channel: 'max' });

      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, { eventId, channel: 'max', status: 'failed', attempt: 1 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'failed', attempt: 1, kind: 'doctor_broadcast_intent' }]);
    });

    it('appends retried attempts with higher attempt numbers', async () => {
      const eventId = await insertQueueRow({ kind: 'inbound_reply', channel: 'telegram' });

      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, { eventId, channel: 'telegram', status: 'failed', attempt: 1 }),
      );
      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, { eventId, channel: 'telegram', status: 'success', attempt: 2 }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([
        { status: 'failed', attempt: 1, kind: 'inbound_reply' },
        { status: 'success', attempt: 2, kind: 'inbound_reply' },
      ]);
    });

    it('records skipped status for pre-dispatch worker skips (stale_materialization)', async () => {
      const eventId = await insertQueueRow({ kind: 'reminder_dispatch', channel: 'email' });

      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, {
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

    it('records skipped status for rate_limited pre-dispatch skip', async () => {
      const eventId = await insertQueueRow({ kind: 'reminder_dispatch', channel: 'email' });

      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, {
          eventId,
          channel: 'email',
          status: 'skipped',
          attempt: 1,
          reason: 'rate_limited',
        }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'skipped', attempt: 1, kind: 'reminder_dispatch' }]);
    });

    it('routes dispatchPort-shaped audit under org principal + worker audit context', async () => {
      const eventId = await insertQueueRow({ kind: 'reminder_dispatch', channel: 'telegram' });

      await harness.withRuntime((db) =>
        runWithOutgoingDeliveryWorkerAuditContext(() =>
          runWithOrganizationPrincipal(TEST_FIXTURE_ORGANIZATION_ID, () =>
            createWorkerShapedWritePort(db).writeDb(
              buildAttemptMutation({
                eventId,
                channel: 'telegram',
                status: 'success',
                attempt: 1,
              }),
            ),
          ),
        ),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'success', attempt: 1, kind: 'reminder_dispatch' }]);
    });

    it('still rejects an attempt with no matching queue row (forged provenance)', async () => {
      const eventId = `d987-${randomUUID()}`;
      await expect(
        harness.withRuntime((db) =>
          logAttemptViaWorkerPort(db, { eventId, channel: 'telegram', status: 'success', attempt: 1 }),
        ),
      ).rejects.toThrow();
    });

    it('delegates non-delivery.attempt.log mutations to tenantWritePort under worker principal', async () => {
      let tenantCalled = false;
      const tenantWritePort: DbWritePort = {
        writeDb: async (mutation) => {
          tenantCalled = true;
          expect(mutation.type).toBe('reminders.delivery.log');
        },
      };
      await harness.withRuntime((db) =>
        runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, async () => {
          const writePort = createOperatorAwareDeliveryAttemptWritePort({ db, tenantWritePort });
          await writePort.writeDb({
            type: 'reminders.delivery.log',
            params: { id: randomUUID(), occurrenceId: randomUUID(), channel: 'telegram', status: 'sent' },
          });
        }),
      );
      expect(tenantCalled).toBe(true);
    });
  },
);
