/**
 * D30 Ш0 §2a condition 2, point 3 — disposable-Postgres proof for `outgoing_delivery_queue`
 * row-level idempotency, the second guard that keeps two live schedulers from double-sending even
 * before the per-tick ownership check (piece 2) catches a lost lock:
 *
 * 1. Two concurrent `claimDueOutgoingDeliveries` calls against the same due row (`FOR UPDATE SKIP
 *    LOCKED`): exactly one must win the row.
 * 2. A repeated `enqueueOutgoingDeliveryIfAbsent` with the same `event_id` must not create a
 *    second row (`uq_outgoing_delivery_queue_event_id` + `ON CONFLICT DO NOTHING`).
 *
 * D20 level-3 item 15 addendum: `resetStaleOutgoingDeliveryProcessing`'s reclaim cap
 * (`outgoingDeliveryQueue.reclaim.integration.test.ts` proves the same behavior but is an opt-in
 * vitest test that no CI job ever enables — RUN_OUTGOING_DELIVERY_RECLAIM_TEST is not set anywhere
 * in `.github/workflows/ci.yml`, so it is dead protection per test-execution-policy.md's own "only
 * a real running CI job counts" rule). Proven here instead, in the script this CI job already runs:
 * 3. A stale "processing" row at the reclaim cap is dead-lettered, not recycled forever (D10b) —
 *    a crash-looping worker must not keep re-sending the same message on every reclaim.
 *
 * DDL below is the real `public.outgoing_delivery_queue` shape, assembled from migrations 0060,
 * 0107 and 0280. Runs against its own throwaway PostgreSQL instance; reads no application env and
 * touches no configured DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { startDisposablePostgres } from './d30DisposablePostgres.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const OUTGOING_DELIVERY_QUEUE_DDL = `
CREATE TABLE public.outgoing_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_id text NOT NULL,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  failure_class text,
  reclaim_count integer NOT NULL DEFAULT 0,
  CONSTRAINT outgoing_delivery_queue_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed_retryable', 'dead')
  )
);
CREATE UNIQUE INDEX uq_outgoing_delivery_queue_event_id
  ON public.outgoing_delivery_queue (event_id);
CREATE INDEX idx_outgoing_delivery_queue_due
  ON public.outgoing_delivery_queue (status, next_retry_at);
`;

async function main(): Promise<void> {
  const disposable = startDisposablePostgres('outgoing_delivery');
  process.env.DATABASE_URL = disposable.connectionString;
  process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
  process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/cabinet';
  process.env.NODE_ENV = 'development';

  try {
    const ddlClient = new pg.Client({ connectionString: disposable.connectionString });
    await ddlClient.connect();
    await ddlClient.query(OUTGOING_DELIVERY_QUEUE_DDL);
    await ddlClient.end();

    const {
      claimDueOutgoingDeliveries,
      enqueueOutgoingDeliveryIfAbsent,
      resetStaleOutgoingDeliveryProcessing,
      OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS,
    } = await import('../db/repos/outgoingDeliveryQueue.js');
    const { createDbPort, closeDb } = await import('../db/client.js');
    const { runWithInfraPrincipal } = await import('../principal/organizationPrincipal.js');

    const db = createDbPort();
    const eventId = `d30-claim-race-${randomUUID()}`;

    const inserted = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      enqueueOutgoingDeliveryIfAbsent(db, {
        eventId,
        kind: 'operator_alert',
        channel: 'telegram',
        payloadJson: {},
      }),
    );
    assert(inserted, 'the first enqueue for a fresh event_id must insert a row');

    // --- Piece 4a: two concurrent claims of the one due row ----------------------------------
    const [claimA, claimB] = await Promise.all([
      runWithInfraPrincipal({ source: 'scheduler:claim-due-jobs' }, () =>
        claimDueOutgoingDeliveries(db, 10),
      ),
      runWithInfraPrincipal({ source: 'scheduler:claim-due-jobs' }, () =>
        claimDueOutgoingDeliveries(db, 10),
      ),
    ]);
    const claimedRows = [...claimA, ...claimB].filter((row) => row.eventId === eventId);
    assert(
      claimedRows.length === 1,
      `expected exactly one concurrent claim to win the due row, got ${claimedRows.length}`,
    );
    console.log('[piece 4a] PASS: two concurrent claims on one due row, exactly one won');

    // --- Piece 4b: repeated enqueue with the same event_id does not duplicate the row --------
    const insertedAgain = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      enqueueOutgoingDeliveryIfAbsent(db, {
        eventId,
        kind: 'operator_alert',
        channel: 'telegram',
        payloadJson: {},
      }),
    );
    assert(insertedAgain === false, 'repeated enqueue with the same event_id must not insert a second row');

    const countClient = new pg.Client({ connectionString: disposable.connectionString });
    await countClient.connect();
    const countRes = await countClient.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.outgoing_delivery_queue WHERE event_id = $1',
      [eventId],
    );
    await countClient.end();
    assert(
      countRes.rows[0]?.n === 1,
      `expected exactly one row for event_id after the repeated enqueue, found ${countRes.rows[0]?.n}`,
    );
    console.log('[piece 4b] PASS: repeated enqueue with the same event_id did not create a second row');

    // --- Piece 4c: a stale row at the reclaim cap is dead-lettered, not recycled forever -----
    const cappedEventId = `d30-reclaim-cap-${randomUUID()}`;
    const cappedInsertClient = new pg.Client({ connectionString: disposable.connectionString });
    await cappedInsertClient.connect();
    const cappedInsert = await cappedInsertClient.query<{ id: string }>(
      `INSERT INTO public.outgoing_delivery_queue (
         event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
         next_retry_at, last_attempt_at, reclaim_count
       ) VALUES (
         $1, 'operator_alert', 'telegram', '{}'::jsonb, 'processing', 1, 6,
         now(), now() - interval '20 minutes', 4
       )
       RETURNING id`,
      [cappedEventId],
    );
    await cappedInsertClient.end();
    const cappedId = cappedInsert.rows[0]?.id;
    assert(cappedId !== undefined, 'could not insert the capped stale row fixture');

    const reclaimResult = await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      resetStaleOutgoingDeliveryProcessing(db, 10, 5),
    );
    assert(
      reclaimResult.deadLettered >= 1,
      `expected the capped stale row to be dead-lettered, got deadLettered=${reclaimResult.deadLettered}`,
    );

    const cappedCheckClient = new pg.Client({ connectionString: disposable.connectionString });
    await cappedCheckClient.connect();
    const cappedRow = await cappedCheckClient.query<{ status: string; failure_class: string | null }>(
      'SELECT status, failure_class FROM public.outgoing_delivery_queue WHERE id = $1',
      [cappedId],
    );
    await cappedCheckClient.end();
    assert(cappedRow.rows[0]?.status === 'dead', 'the capped stale row must end up dead, not pending again');
    assert(
      cappedRow.rows[0]?.failure_class === OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS,
      `expected failure_class ${OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS}, got ${cappedRow.rows[0]?.failure_class}`,
    );
    console.log('[piece 4c] PASS: a stale row at the reclaim cap was dead-lettered, not recycled');

    await closeDb();
    console.log('check-d30-outgoing-delivery-claim-concurrency: PASS');
  } finally {
    disposable.stop();
  }
}

main().catch((err) => {
  console.error(
    `check-d30-outgoing-delivery-claim-concurrency: FAIL: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
