/**
 * Disposable PostgreSQL cutover proof: the legacy retry producer writes only the canonical
 * outgoing_delivery_queue, whose single worker claim path keeps future rows pending and locks a
 * due row against both the retired compatibility API and the canonical consumer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  startDisposablePostgres,
  type DisposablePostgres,
} from '../../scripts/d30DisposablePostgres.js';

const queueDdl = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA app;
CREATE SCHEMA integrator;
CREATE TABLE integrator.projection_outbox (id bigint PRIMARY KEY);
CREATE TABLE public.outgoing_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  kind text NOT NULL,
  channel text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_retry_at timestamptz NOT NULL,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  dead_at timestamptz,
  last_error text,
  failure_class text,
  reclaim_count integer NOT NULL DEFAULT 0,
  priority smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION app.read_outgoing_delivery_reclaim_config() RETURNS jsonb
  LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION app.resolve_outgoing_delivery_scope(uuid) RETURNS TABLE(resolution text)
  LANGUAGE sql AS $$ SELECT 'operator'::text $$;
CREATE FUNCTION app.operator_incident_alert_already_sent(uuid) RETURNS boolean
  LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text) RETURNS void
  LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid) RETURNS boolean
  LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid) RETURNS boolean
  LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION delay_cutover_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing' THEN
    PERFORM pg_sleep(0.25);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER delay_cutover_claim
  BEFORE UPDATE ON public.outgoing_delivery_queue
  FOR EACH ROW EXECUTE FUNCTION delay_cutover_claim();
`;

type QueueState = {
  id: string;
  status: string;
  next_retry_at: string;
  attempt_count: number;
  last_error: string | null;
};

function retryPayload(eventId: string): Record<string, unknown> {
  return {
    intent: {
      type: 'message.send',
      meta: {
        eventId,
        occurredAt: '2026-08-11T00:00:00.000Z',
        source: 'smsc',
      },
      payload: {
        message: { text: 'cutover fixture' },
        delivery: { channels: ['smsc'], maxAttempts: 3 },
      },
    },
    targets: [{ resource: 'smsc', address: { phoneNormalized: '+79990000001' } }],
  };
}

describe('job queue cutover on a post-drop PostgreSQL schema', () => {
  let disposable: DisposablePostgres | undefined;
  let db: DbPort;
  let closeDb: () => Promise<void>;
  let assertDeliveryWorkerPoolReady: () => Promise<void>;
  let jobQueue: typeof import('./jobQueue.js');
  let outgoingDeliveryQueue: typeof import('./outgoingDeliveryQueue.js');

  async function readRow(eventId: string): Promise<QueueState> {
    const result = await db.query<QueueState>(
      `SELECT id::text, status, next_retry_at::text, attempt_count, last_error
         FROM public.outgoing_delivery_queue
        WHERE event_id = $1`,
      [eventId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`queue row ${eventId} was not found`);
    return row;
  }

  async function waitForVisibleRow(eventId: string): Promise<QueueState> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await db.query<QueueState>(
        `SELECT id::text, status, next_retry_at::text, attempt_count, last_error
           FROM public.outgoing_delivery_queue
          WHERE event_id = $1`,
        [eventId],
      );
      const row = result.rows[0];
      if (row) return row;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`queue row ${eventId} did not become visible`);
  }

  beforeAll(async () => {
    disposable = startDisposablePostgres('job_queue_cutover');
    process.env.DATABASE_URL = disposable.connectionString;
    process.env.DATABASE_URL_DIAGNOSTIC = disposable.connectionString;
    process.env.DATABASE_URL_DELIVERY_WORKER = disposable.connectionString;
    process.env.DATABASE_URL_SCHEDULER = disposable.connectionString;
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'legacy-guc';
    process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
    process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/booking';
    process.env.NODE_ENV = 'test';

    const client = await import('../client.js');
    const readiness = await import('../operationalPoolReadiness.js');
    jobQueue = await import('./jobQueue.js');
    outgoingDeliveryQueue = await import('./outgoingDeliveryQueue.js');
    db = client.createDbPort();
    closeDb = client.closeDb;
    assertDeliveryWorkerPoolReady = readiness.assertDeliveryWorkerPoolReady;
    await db.query(queueDdl);
  });

  afterAll(async () => {
    await closeDb?.();
    disposable?.stop();
  });

  it('enqueues into the canonical queue, preserves an absolute future runAt, and starts without the dropped relation', async () => {
    const eventId = 'cutover-future';
    const runAt = '2030-01-01T00:00:00.000Z';
    await jobQueue.enqueueMessageRetryJob(db, {
      phoneNormalized: '+79990000001',
      messageText: 'cutover fixture',
      firstTryDelaySeconds: 0,
      firstTryAt: runAt,
      maxAttempts: 3,
      kind: 'message.deliver',
      payloadJson: retryPayload(eventId),
    });

    const row = await readRow(eventId);
    expect(row.status).toBe('pending');
    expect(new Date(row.next_retry_at).getTime()).toBe(new Date(runAt).getTime());
    expect(await outgoingDeliveryQueue.claimDueOutgoingDeliveries(db, 10)).toEqual([]);

    const legacyRelation = await db.query<{ relation: string | null }>(
      "SELECT to_regclass('integrator.message_retry_jobs')::text AS relation",
    );
    expect(legacyRelation.rows[0]?.relation).toBeNull();
    await expect(assertDeliveryWorkerPoolReady()).resolves.toBeUndefined();
  });

  it('never exposes a future delivery as due between its canonical insert and completed enqueue', async () => {
    const eventId = 'cutover-atomic-future';
    const runAt = '2030-01-03T00:00:00.000Z';
    await db.query(`
      CREATE OR REPLACE FUNCTION app.read_outgoing_delivery_reclaim_config() RETURNS jsonb
        LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(1);
        RETURN NULL;
      END;
      $$;
    `);

    const enqueue = jobQueue.enqueueMessageRetryJob(db, {
      phoneNormalized: '+79990000005',
      messageText: 'atomic future fixture',
      firstTryDelaySeconds: 0,
      firstTryAt: runAt,
      maxAttempts: 3,
      kind: 'message.deliver',
      payloadJson: retryPayload(eventId),
    });

    try {
      const visibleBeforeEnqueueReturns = await waitForVisibleRow(eventId);
      expect(visibleBeforeEnqueueReturns.status).toBe('pending');

      const prematureClaim = await outgoingDeliveryQueue.claimDueOutgoingDeliveries(db, 10);
      expect(prematureClaim.filter((row) => row.eventId === eventId)).toEqual([]);

      await enqueue;
      const scheduled = await readRow(eventId);
      expect(scheduled.status).toBe('pending');
      expect(new Date(scheduled.next_retry_at).getTime()).toBe(new Date(runAt).getTime());
    } finally {
      await enqueue.catch(() => undefined);
      await db.query(`
        CREATE OR REPLACE FUNCTION app.read_outgoing_delivery_reclaim_config() RETURNS jsonb
          LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
      `);
    }
  });

  it('lets exactly one of the retired compatibility API and canonical consumer claim a due row', async () => {
    const eventId = 'cutover-concurrent';
    await jobQueue.enqueueMessageRetryJob(db, {
      phoneNormalized: '+79990000002',
      messageText: 'concurrent fixture',
      firstTryDelaySeconds: 0,
      firstTryAt: '2000-01-01T00:00:00.000Z',
      maxAttempts: 3,
      kind: 'message.deliver',
      payloadJson: retryPayload(eventId),
    });

    const [compatibilityClaim, canonicalClaim] = await Promise.all([
      jobQueue.claimDueMessageRetryJobs(db, 1),
      outgoingDeliveryQueue.claimDueOutgoingDeliveries(db, 1),
    ]);
    const claimed = [
      ...compatibilityClaim.filter((row) => row.payloadJson?.intent !== undefined),
      ...canonicalClaim.filter((row) => row.eventId === eventId),
    ];
    expect(claimed).toHaveLength(1);
    expect((await readRow(eventId)).status).toBe('processing');
  });

  it('reschedules, dead-letters, and completes canonical UUID rows through the compatibility port', async () => {
    const retryEventId = 'cutover-retry-dead';
    await jobQueue.enqueueMessageRetryJob(db, {
      phoneNormalized: '+79990000003',
      messageText: 'retry fixture',
      firstTryDelaySeconds: 0,
      firstTryAt: '2000-01-01T00:00:00.000Z',
      maxAttempts: 3,
      kind: 'message.deliver',
      payloadJson: retryPayload(retryEventId),
    });
    const retryClaim = await jobQueue.claimDueMessageRetryJobs(db, 1);
    const retryId = retryClaim.find((row) => row.payloadJson?.intent !== undefined)?.id;
    expect(retryId).toBeDefined();
    await jobQueue.rescheduleMessageRetryJob(db, {
      id: retryId as string,
      attemptsDone: 2,
      nextRunAt: '2030-01-02T00:00:00.000Z',
      lastError: 'TEMPORARY_FAILURE',
    });
    expect(await readRow(retryEventId)).toMatchObject({
      status: 'failed_retryable',
      attempt_count: 2,
      last_error: 'TEMPORARY_FAILURE',
    });
    await db.query(
      "UPDATE public.outgoing_delivery_queue SET next_retry_at = '2000-01-01T00:00:00.000Z' WHERE event_id = $1",
      [retryEventId],
    );
    const reclaimed = await jobQueue.claimDueMessageRetryJobs(db, 1);
    const reclaimedId = reclaimed.find((row) => row.id === retryId)?.id;
    expect(reclaimedId).toBe(retryId);
    await jobQueue.failMessageRetryJob(db, {
      id: retryId as string,
      lastError: 'PERMANENT_FAILURE',
    });
    expect(await readRow(retryEventId)).toMatchObject({
      status: 'dead',
      last_error: 'PERMANENT_FAILURE',
    });

    const completeEventId = 'cutover-complete';
    await jobQueue.enqueueMessageRetryJob(db, {
      phoneNormalized: '+79990000004',
      messageText: 'complete fixture',
      firstTryDelaySeconds: 0,
      firstTryAt: '2000-01-01T00:00:00.000Z',
      maxAttempts: 1,
      kind: 'message.deliver',
      payloadJson: retryPayload(completeEventId),
    });
    const completeClaim = await jobQueue.claimDueMessageRetryJobs(db, 10);
    const completeId = completeClaim.find((row) => row.payloadJson?.intent !== undefined)?.id;
    expect(completeId).toBeDefined();
    await jobQueue.completeMessageRetryJob(db, completeId as string);
    expect(await readRow(completeEventId)).toMatchObject({ status: 'sent' });
  });
});
