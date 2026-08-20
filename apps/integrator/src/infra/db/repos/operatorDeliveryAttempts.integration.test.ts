/**
 * Opt-in REAL-Postgres proof for the delivery-attempt audit journal (D10a writer path).
 *
 * `createOperatorAwareDeliveryAttemptWritePort` routes every `delivery.attempt.log` write made
 * under the `worker:outgoing-delivery-tick` infra principal (or outgoing-delivery worker audit
 * context during per-row dispatch) into the single `app.record_operator_delivery_attempt` root.
 * The root enriches queue-backed attempts from `outgoing_delivery_queue` and accepts the caller's
 * sanitized context when a send has no queue row (D10a canonical journal).
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
  process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context' &&
  Boolean((process.env.INTEGRATOR_DB_URL ?? '').trim());

const TEST_FIXTURE_ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

describe.skipIf(!enabled)(
  'createOperatorAwareDeliveryAttemptWritePort (opt-in, real Postgres)',
  () => {
    const harness = createRealPostgresIntegrationTestHarness(
      'worker:outgoing-delivery-tick',
      'port-context',
    );
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

    async function insertQueueRow(input: {
      kind: string;
      channel: string;
      organizationId?: string;
      topicCode?: string;
      integratorUserId?: string;
    }): Promise<string> {
      const eventId = `d987-${randomUUID()}`;
      writtenQueueEventIds.push(eventId);
      const payload = {
        ...(input.topicCode ? { topicCode: input.topicCode } : {}),
        intent: {
          meta: {
            eventId,
            ...(input.integratorUserId ? { userId: input.integratorUserId } : {}),
          },
        },
      };
      await harness.withFixtures((db) =>
        runIntegratorSql(
          db,
          sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, organization_id, kind, channel, payload_json,
            status, attempt_count, max_attempts, next_retry_at
          ) VALUES (
            ${eventId}, ${input.organizationId ?? null}::uuid, ${input.kind}, ${input.channel},
            ${JSON.stringify(payload)}::jsonb,
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
      intentType?: string;
      correlationId?: string | null;
      organizationId?: string | null;
      payload?: Record<string, unknown>;
      occurredAt?: string;
    }): DbWriteMutation {
      writtenLogEventIds.push(input.eventId);
      return {
        type: 'delivery.attempt.log',
        params: {
          intentType: input.intentType ?? 'message.send',
          intentEventId: input.eventId,
          correlationId: input.correlationId ?? null,
          organizationId: input.organizationId ?? null,
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
          payload: input.payload ?? {},
          occurredAt: input.occurredAt ?? new Date().toISOString(),
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
        intentType?: string;
        correlationId?: string | null;
        organizationId?: string | null;
        payload?: Record<string, unknown>;
        occurredAt?: string;
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

    async function readQueueBackedContext(eventId: string): Promise<
      {
        organizationId: string | null;
        intentType: string | null;
        topicCode: string | null;
        integratorUserId: string | null;
        queueSource: boolean | null;
      }[]
    > {
      const result = await harness.withFixtures((db) =>
        runIntegratorSql<{
          organizationId: string | null;
          intentType: string | null;
          topicCode: string | null;
          integratorUserId: string | null;
          queueSource: boolean | null;
        }>(
          db,
          sql`SELECT
                organization_id::text AS "organizationId",
                intent_type AS "intentType",
                topic_code AS "topicCode",
                integrator_user_id AS "integratorUserId",
                (metadata->>'queueSource')::boolean AS "queueSource"
              FROM public.notification_delivery_attempts
              WHERE event_id = ${eventId}`,
        ),
      );
      return result.rows;
    }

    async function readLoggedAttemptContext(eventId: string): Promise<
      {
        organizationId: string | null;
        intentType: string | null;
        correlationId: string | null;
        queueSource: boolean | null;
      }[]
    > {
      const result = await harness.withFixtures((db) =>
        runIntegratorSql<{
          organizationId: string | null;
          intentType: string | null;
          correlationId: string | null;
          queueSource: boolean | null;
        }>(
          db,
          sql`SELECT
                organization_id::text AS "organizationId",
                intent_type AS "intentType",
                metadata->>'correlationId' AS "correlationId",
                (metadata->>'queueSource')::boolean AS "queueSource"
              FROM public.notification_delivery_attempts
              WHERE event_id = ${eventId}`,
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
      const eventId = await insertQueueRow({
        kind: 'reminder_dispatch',
        channel: 'telegram',
        organizationId: TEST_FIXTURE_ORGANIZATION_ID,
        topicCode: 'appointment_reminders',
        integratorUserId: '42001',
      });

      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, {
          eventId,
          channel: 'telegram',
          status: 'success',
          attempt: 1,
          intentType: 'caller.value.must.not.win',
          organizationId: null,
        }),
      );

      const rows = await readLoggedAttempts(eventId);
      expect(rows).toEqual([{ status: 'success', attempt: 1, kind: 'reminder_dispatch' }]);
      expect(await readQueueBackedContext(eventId)).toEqual([
        {
          organizationId: TEST_FIXTURE_ORGANIZATION_ID,
          intentType: 'reminder_dispatch',
          topicCode: 'appointment_reminders',
          integratorUserId: '42001',
          queueSource: null,
        },
      ]);
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
        logAttemptViaWorkerPort(db, {
          eventId,
          channel: 'telegram',
          status: 'success',
          attempt: 2,
        }),
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
      expect(rows).toEqual([{ status: 'skipped', attempt: 1, kind: 'reminder_dispatch' }]);
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

    it('records a platform attempt with no matching queue row and no organization', async () => {
      const eventId = `d987-${randomUUID()}`;
      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, {
          eventId,
          channel: 'email',
          status: 'success',
          attempt: 1,
          intentType: 'operator.alert',
          correlationId: 'incident:platform',
          organizationId: null,
          payload: { alertClass: 'delivery_pipeline_failed' },
        }),
      );

      expect(await readLoggedAttemptContext(eventId)).toEqual([
        {
          organizationId: null,
          intentType: 'operator.alert',
          correlationId: 'incident:platform',
          queueSource: false,
        },
      ]);
    });

    it('preserves a caller-supplied organization when no queue row exists', async () => {
      const eventId = `booking.confirmation.ics:${randomUUID()}`;
      await harness.withRuntime((db) =>
        logAttemptViaWorkerPort(db, {
          eventId,
          channel: 'email',
          status: 'success',
          attempt: 1,
          intentType: 'booking.confirmation',
          organizationId: TEST_FIXTURE_ORGANIZATION_ID,
          payload: { source: 'booking_confirmation' },
        }),
      );

      expect(await readLoggedAttemptContext(eventId)).toEqual([
        {
          organizationId: TEST_FIXTURE_ORGANIZATION_ID,
          intentType: 'booking.confirmation',
          correlationId: null,
          queueSource: false,
        },
      ]);
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
            params: {
              id: randomUUID(),
              occurrenceId: randomUUID(),
              channel: 'telegram',
              status: 'sent',
            },
          });
        }),
      );
      expect(tenantCalled).toBe(true);
    });
  },
);
