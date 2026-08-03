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
 * 0107, 0280 and D30's 0328 addition. Runs against its own throwaway PostgreSQL instance; reads no
 * application env and touches no configured DATABASE_URL.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { startDisposablePostgres } from './d30DisposablePostgres.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// D20 level-3 F5: a `main()` that returns early must not exit 0 with an empty log. `passedPieces`
// lives outside `main()` so the completion check below still fires even if `main()` never reaches it.
const EXPECTED_PIECES = ['piece 4a', 'piece 4b', 'piece 4c', 'piece 4d'] as const;
const passedPieces = new Set<string>();

function reportPiecePass(id: (typeof EXPECTED_PIECES)[number], message: string): void {
  passedPieces.add(id);
  console.log(`[${id}] PASS: ${message}`);
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
  organization_id uuid,
  CONSTRAINT outgoing_delivery_queue_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed_retryable', 'dead')
  )
);
CREATE UNIQUE INDEX uq_outgoing_delivery_queue_event_id
  ON public.outgoing_delivery_queue (event_id);
CREATE INDEX idx_outgoing_delivery_queue_due
  ON public.outgoing_delivery_queue (status, next_retry_at);
`;

const D30_ONLINE_INDEX_ARTIFACT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
  'deploy/postgres/d30-outgoing-delivery-queue-organization-status-due-online-index.sql',
);

function runD30OnlineIndexArtifact(connectionString: string) {
  return spawnSync(
    '/usr/lib/postgresql/16/bin/psql',
    ['-d', connectionString, '-X', '-v', 'ON_ERROR_STOP=1', '-f', D30_ONLINE_INDEX_ARTIFACT],
    { encoding: 'utf8' },
  );
}

/**
 * D20 level-3 F2 — makes the piece 4a race deterministic instead of timing-luck. A plain
 * `Promise.all` of two claims is not enough: each `claimDueOutgoingDeliveries` call is one
 * implicit-transaction UPDATE that, locally, completes in well under a millisecond, so the second
 * racer's UPDATE typically doesn't even reach the row lock until after the first has already
 * committed — no overlap, no bug exercised, regardless of which locking code path is under test.
 * This trigger holds the row lock for 400ms once a claim UPDATE has taken it (`BEFORE UPDATE`,
 * after Postgres has already locked the target row for the update), which is what actually forces
 * the second racer's UPDATE to block on the first — the scenario the missing-lock and two-phase-
 * claim bugs both need to be caught. It only fires on the pending→processing transition, so it
 * does not slow down piece 4c's reclaim (pending→dead) or 4b's plain insert.
 */
const CLAIM_RACE_DELAY_DDL = `
CREATE OR REPLACE FUNCTION delay_outgoing_delivery_claim() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing' THEN
    PERFORM pg_sleep(0.4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_delay_outgoing_delivery_claim
  BEFORE UPDATE ON public.outgoing_delivery_queue
  FOR EACH ROW EXECUTE FUNCTION delay_outgoing_delivery_claim();
`;

async function main(): Promise<void> {
  const disposable = startDisposablePostgres('outgoing_delivery');
  process.env.DATABASE_URL = disposable.connectionString;
  process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
  process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/cabinet';
  process.env.NODE_ENV = 'development';

  try {
    const {
      claimDueOutgoingDeliveries,
      enqueueOutgoingDeliveryIfAbsent,
      resetStaleOutgoingDeliveryProcessing,
      OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS,
    } = await import('../db/repos/outgoingDeliveryQueue.js');
    const { createDbPort, closeDb } = await import('../db/client.js');
    const { runWithInfraPrincipal } = await import('../principal/organizationPrincipal.js');

    const db = createDbPort();
    await runIntegratorSql(db, sql.raw(OUTGOING_DELIVERY_QUEUE_DDL));
    await runIntegratorSql(db, sql.raw(CLAIM_RACE_DELAY_DDL));

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
    // CLAIM_RACE_DELAY_DDL's trigger forces the two claims to genuinely overlap (see its comment).
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
    reportPiecePass('piece 4a', 'two concurrent claims on one due row, exactly one won');

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

    const countRes = await runIntegratorSql<{ n: number }>(
      db,
      sql`SELECT count(*)::int AS n FROM public.outgoing_delivery_queue WHERE event_id = ${eventId}`,
    );
    assert(
      countRes.rows[0]?.n === 1,
      `expected exactly one row for event_id after the repeated enqueue, found ${countRes.rows[0]?.n}`,
    );
    reportPiecePass('piece 4b', 'repeated enqueue with the same event_id did not create a second row');

    // --- Piece 4c: a stale row at the reclaim cap is dead-lettered, not recycled forever -----
    // F3 control: an already-`sent` row, stale by the same clock, must be left alone by reclaim —
    // widening the reclaim filter from `status = 'processing'` to include `'sent'` would re-deliver
    // an already-delivered message.
    const cappedEventId = `d30-reclaim-cap-${randomUUID()}`;
    const sentEventId = `d30-reclaim-sent-control-${randomUUID()}`;
    const cappedInsert = await runIntegratorSql<{ id: string }>(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, last_attempt_at, reclaim_count
          ) VALUES (
            ${cappedEventId}, 'operator_alert', 'telegram', '{}'::jsonb, 'processing', 1, 6,
            now(), now() - interval '20 minutes', 4
          )
          RETURNING id`,
    );
    const sentInsert = await runIntegratorSql<{ id: string }>(
      db,
      sql`INSERT INTO public.outgoing_delivery_queue (
            event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
            next_retry_at, last_attempt_at, sent_at, reclaim_count
          ) VALUES (
            ${sentEventId}, 'operator_alert', 'telegram', '{}'::jsonb, 'sent', 1, 6,
            now(), now() - interval '20 minutes', now() - interval '20 minutes', 0
          )
          RETURNING id`,
    );
    const cappedId = cappedInsert.rows[0]?.id;
    const sentId = sentInsert.rows[0]?.id;
    assert(cappedId !== undefined, 'could not insert the capped stale row fixture');
    assert(sentId !== undefined, 'could not insert the sent control row fixture');

    const reclaimResult = await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      resetStaleOutgoingDeliveryProcessing(db, 10, 5),
    );
    assert(
      reclaimResult.deadLettered >= 1,
      `expected the capped stale row to be dead-lettered, got deadLettered=${reclaimResult.deadLettered}`,
    );

    const cappedRow = await runIntegratorSql<{ status: string; failure_class: string | null }>(
      db,
      sql`SELECT status, failure_class FROM public.outgoing_delivery_queue WHERE id = ${cappedId}`,
    );
    const sentRow = await runIntegratorSql<{ status: string; sent_at: string | null }>(
      db,
      sql`SELECT status, sent_at FROM public.outgoing_delivery_queue WHERE id = ${sentId}`,
    );
    assert(cappedRow.rows[0]?.status === 'dead', 'the capped stale row must end up dead, not pending again');
    assert(
      cappedRow.rows[0]?.failure_class === OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS,
      `expected failure_class ${OUTGOING_DELIVERY_RECLAIM_LIMIT_FAILURE_CLASS}, got ${cappedRow.rows[0]?.failure_class}`,
    );
    assert(
      sentRow.rows[0]?.status === 'sent' && sentRow.rows[0]?.sent_at !== null,
      `reclaim must not touch an already-sent row, got status=${sentRow.rows[0]?.status} sent_at=${sentRow.rows[0]?.sent_at}`,
    );
    reportPiecePass(
      'piece 4c',
      'a stale row at the reclaim cap was dead-lettered, not recycled, and a stale-but-already-sent control row was left untouched',
    );

    // --- Piece 4d: standalone online-index artifact fails closed on valid incompatibility -----
    await runIntegratorSql(
      db,
      sql.raw(`CREATE INDEX idx_outgoing_delivery_queue_organization_status_due
        ON public.outgoing_delivery_queue (status, organization_id, next_retry_at)`),
    );
    const incompatibleResult = runD30OnlineIndexArtifact(disposable.connectionString);
    assert(
      incompatibleResult.status !== 0,
      'the standalone online-index artifact must return non-zero for a valid same-name index with incompatible key order',
    );
    assert(
      `${incompatibleResult.stdout}${incompatibleResult.stderr}`.includes(
        'FATAL: D30 outgoing delivery queue online index is missing, invalid, or has an incompatible definition',
      ),
      'the incompatible-index failure must retain the operator-facing diagnostic',
    );

    await runIntegratorSql(
      db,
      sql.raw('DROP INDEX public.idx_outgoing_delivery_queue_organization_status_due'),
    );
    const firstCreateResult = runD30OnlineIndexArtifact(disposable.connectionString);
    assert(
      firstCreateResult.status === 0,
      `the standalone online-index artifact must create the missing exact index, exit=${firstCreateResult.status}`,
    );
    const retryResult = runD30OnlineIndexArtifact(disposable.connectionString);
    assert(
      retryResult.status === 0,
      `the standalone online-index artifact retry must be idempotent, exit=${retryResult.status}`,
    );
    const indexState = await runIntegratorSql<{
      indisvalid: boolean;
      indisready: boolean;
      keys: string[];
    }>(
      db,
      sql.raw(`SELECT index_state.indisvalid,
                      index_state.indisready,
                      ARRAY(
                        SELECT attribute.attname::text
                          FROM unnest(index_state.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
                          JOIN pg_catalog.pg_attribute attribute
                            ON attribute.attrelid = index_state.indrelid
                           AND attribute.attnum = key_column.attnum
                         ORDER BY key_column.ordinality
                      ) AS keys
                 FROM pg_catalog.pg_index index_state
                WHERE index_state.indexrelid =
                      'public.idx_outgoing_delivery_queue_organization_status_due'::regclass`),
    );
    assert(
      indexState.rows[0]?.indisvalid === true && indexState.rows[0]?.indisready === true,
      'the created exact index must be valid and ready',
    );
    assert(
      indexState.rows[0]?.keys.join(',') === 'organization_id,status,next_retry_at',
      `the created exact index has unexpected keys: ${indexState.rows[0]?.keys.join(',')}`,
    );
    reportPiecePass(
      'piece 4d',
      'online-index artifact failed closed on an incompatible valid index and created/retried the exact index',
    );

    await closeDb();
    console.log('check-d30-outgoing-delivery-claim-concurrency: PASS');
  } finally {
    disposable.stop();
  }
}

main()
  .then(() => {
    const missing = EXPECTED_PIECES.filter((id) => !passedPieces.has(id));
    assert(
      missing.length === 0,
      `expected all of [${EXPECTED_PIECES.join(', ')}] to report PASS, missing: ${missing.join(', ')} (a piece was skipped, or main() returned before reaching it)`,
    );
  })
  .catch((err) => {
    console.error(
      `check-d30-outgoing-delivery-claim-concurrency: FAIL: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
