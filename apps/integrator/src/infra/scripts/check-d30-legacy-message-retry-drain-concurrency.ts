/**
 * D30 Ш7 disposable-PostgreSQL proof for the reversible legacy queue drain.
 *
 * The legacy queue is deliberately not converted: persisted appointment payloads retain their
 * historical TG→MAX ladder, optional Web Push sibling and first-success behavior in the existing
 * compatibility consumer. This proof covers the database boundary that makes the drain safe:
 * an expired processing lease is reclaimed once, preserves the original due time/payload, and is
 * claimed once after a worker crash before finalize. It starts an isolated local PostgreSQL only.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { startDisposablePostgres } from './d30DisposablePostgres.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const MESSAGE_RETRY_JOBS_DDL = `
CREATE SCHEMA integrator;
CREATE TABLE integrator.message_retry_jobs (
  id bigserial PRIMARY KEY,
  phone_normalized text,
  message_text text,
  next_try_at timestamptz NOT NULL,
  attempts_done integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'message.deliver',
  payload_json jsonb
);
CREATE INDEX idx_message_retry_jobs_due
  ON integrator.message_retry_jobs (status, next_try_at);

-- The delay makes the two callers overlap while the first CTE holds the row lock. Without
-- FOR UPDATE SKIP LOCKED, this proof would wait for a second reclaim instead of proving one winner.
CREATE FUNCTION integrator.delay_message_retry_transition() RETURNS trigger AS $$
BEGIN
  IF (OLD.status = 'processing' AND NEW.status = 'pending')
     OR (OLD.status = 'pending' AND NEW.status = 'processing') THEN
    PERFORM pg_sleep(0.4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_delay_message_retry_transition
  BEFORE UPDATE ON integrator.message_retry_jobs
  FOR EACH ROW EXECUTE FUNCTION integrator.delay_message_retry_transition();
`;

type RetryRow = {
  id: number;
  status: string;
  next_try_at: string;
  attempts_done: number;
  payload_matches: boolean;
};

async function main(): Promise<void> {
  const disposable = startDisposablePostgres('legacy_message_retry_drain');
  let closeDb: (() => Promise<void>) | undefined;
  process.env.DATABASE_URL = disposable.connectionString;
  process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
  process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/booking';
  process.env.NODE_ENV = 'development';

  try {
    const { createPostgresJobQueue } = await import('../adapters/jobQueuePort.js');
    const client = await import('../db/client.js');
    closeDb = client.closeDb;
    const db = client.createDbPort();
    const queue = createPostgresJobQueue({ db, retryDelaySeconds: 60 });
    await runIntegratorSql(db, sql.raw(MESSAGE_RETRY_JOBS_DDL));

    const payload = {
      booking: { bookingId: randomUUID() },
      intent: {
        type: 'message.send',
        meta: {
          eventId: `appointment-reminder:legacy:${randomUUID()}`,
          occurredAt: '2026-08-01T08:00:00.000Z',
          source: 'booking-lifecycle',
        },
        payload: {
          message: { text: 'Напоминание о записи' },
          delivery: { channels: ['telegram', 'max'] },
        },
      },
      retry: { maxAttempts: 2, backoffSeconds: [60] },
      targets: [
        { resource: 'telegram', address: { chatId: 'legacy-tg' } },
        { resource: 'max', address: { userId: 'legacy-max' } },
      ],
      webappPushNotify: {
        organizationId: randomUUID(),
        phoneNormalized: '+79990000000',
        slotStartIso: '2026-08-29T10:00:00.000Z',
        stableKey: `legacy-push:${randomUUID()}`,
      },
    };
    const futureDueAt = '2026-08-29T09:00:00.000Z';
    const futureInsert = await runIntegratorSql<{ id: number }>(
      db,
      sql`INSERT INTO integrator.message_retry_jobs (
            phone_normalized, message_text, next_try_at, attempts_done, max_attempts,
            status, kind, payload_json, updated_at
          ) VALUES (
            '+79990000000', 'Напоминание о записи', ${futureDueAt}::timestamptz, 1, 2,
            'processing', 'message.deliver', ${JSON.stringify(payload)}::jsonb,
            now() - interval '20 minutes'
          ) RETURNING id`,
    );
    const futureId = futureInsert.rows[0]?.id;
    assert(futureId !== undefined, 'could not create stale legacy appointment fixture');

    const [reclaimA, reclaimB] = await Promise.all([
      queue.reclaimStaleProcessing(10),
      queue.reclaimStaleProcessing(10),
    ]);
    assert(
      reclaimA + reclaimB === 1,
      `two concurrent reclaims must return one row exactly once, got ${reclaimA}+${reclaimB}`,
    );

    const futureRow = await runIntegratorSql<RetryRow>(
      db,
      sql`SELECT id, status, next_try_at::text, attempts_done,
                 payload_json = ${JSON.stringify(payload)}::jsonb AS payload_matches
          FROM integrator.message_retry_jobs WHERE id = ${futureId}`,
    );
    assert(
      futureRow.rows[0]?.status === 'pending' &&
        new Date(futureRow.rows[0].next_try_at).getTime() === new Date(futureDueAt).getTime() &&
        futureRow.rows[0].attempts_done === 1 &&
        futureRow.rows[0].payload_matches === true,
      'reclaim must preserve the original due time, attempts and appointment payload unchanged',
    );
    const prematureClaim = await queue.claimDueJobs(10);
    assert(
      !prematureClaim.some((job) => job.id === `message-retry:${futureId}`),
      'reclaim must not make a future legacy appointment claimable early',
    );
    const repeatReclaim = await queue.reclaimStaleProcessing(10);
    assert(repeatReclaim === 0, 'repeating drain must not duplicate or mutate a pending legacy row');

    const crashInsert = await runIntegratorSql<{ id: number }>(
      db,
      sql`INSERT INTO integrator.message_retry_jobs (
            phone_normalized, message_text, next_try_at, attempts_done, max_attempts,
            status, kind, payload_json, updated_at
          ) VALUES (
            '+79990000001', 'Crash fixture', now(), 0, 2,
            'processing', 'message.deliver', ${JSON.stringify(payload)}::jsonb,
            now() - interval '20 minutes'
          ) RETURNING id`,
    );
    const crashId = crashInsert.rows[0]?.id;
    assert(crashId !== undefined, 'could not create crash-before-finalize fixture');

    const reclaimedAfterCrash = await queue.reclaimStaleProcessing(10);
    assert(reclaimedAfterCrash === 1, 'a stale pre-finalize lease must be reclaimable');
    const [claimA, claimB] = await Promise.all([
      queue.claimDueJobs(10),
      queue.claimDueJobs(10),
    ]);
    const claimedCrashRows = [...claimA, ...claimB].filter(
      (job) => job.id === `message-retry:${crashId}`,
    );
    assert(
      claimedCrashRows.length === 1,
      `after reclaim, exactly one worker may claim the crashed row, got ${claimedCrashRows.length}`,
    );
    const crashRowCount = await runIntegratorSql<{ count: number }>(
      db,
      sql`SELECT count(*)::int AS count FROM integrator.message_retry_jobs WHERE id = ${crashId}`,
    );
    assert(
      crashRowCount.rows[0]?.count === 1,
      'reclaim and retry must reuse the historical row rather than create a duplicate',
    );

    console.log(
      'check-d30-legacy-message-retry-drain-concurrency: PASS (reclaim race, repeat drain, due preservation, crash-before-finalize single claim)',
    );
  } finally {
    if (closeDb) await closeDb();
    disposable.stop();
  }
}

main().catch((error) => {
  console.error(
    `check-d30-legacy-message-retry-drain-concurrency: FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
