/**
 * Opt-in, mutating proof for migration 0247's atomic email-challenge wrong-attempt counter.
 *
 * Real concurrent Postgres connections, not a JS mock: two backends race to increment the SAME
 * challenge row's `attempts` column through `app.email_auth_increment_email_challenge_attempts`.
 * The first backend holds the row lock (via the function's own `FOR UPDATE`) inside an open
 * transaction; the second backend's call is proven to be BLOCKED on that lock (not merely slow) via
 * `pg_blocking_pids`, then released by a COMMIT. Both increments must land -- attempts must reach 2,
 * never 1 -- which is exactly the lost-update shape the old absolute-set
 * `email_auth_update_email_challenge_attempts(uuid, integer)` was vulnerable to (two callers reading
 * attempts=0 and both writing 1).
 *
 *   USE_REAL_DATABASE=1 RUN_EMAIL_CHALLENGE_ATOMIC_ATTEMPTS_DEV_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgEmailChallengeAtomicAttempts.devDb.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const APPROVED_MUTATING_DATABASES = new Set(['bcb_webapp_dev', 'bcb_webapp_email_otp_scratch']);

async function assertExactDevOrScratchDb(client: pg.PoolClient): Promise<void> {
  const result = await client.query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );
  const databaseName = result.rows[0]?.database_name ?? '';
  if (!APPROVED_MUTATING_DATABASES.has(databaseName)) {
    throw new Error(
      `refusing mutating email-challenge atomic-attempts test on current_database="${databaseName}"; expected one of ${[...APPROVED_MUTATING_DATABASES].join(', ')}`,
    );
  }
}

async function waitUntilBackendIsBlocked(
  observer: pg.PoolClient,
  waitingBackendPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await observer.query<{ blocked: boolean }>(
      'SELECT cardinality(pg_blocking_pids($1::integer)) > 0 AS blocked',
      [waitingBackendPid],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('second increment connection did not reach the challenge row lock');
}

const enabled =
  process.env.RUN_EMAIL_CHALLENGE_ATOMIC_ATTEMPTS_DEV_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim());

describe.skipIf(!enabled)(
  'email_challenges atomic attempts increment (explicit mutating DEV/scratch opt-in)',
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        await assertExactDevOrScratchDb(client);
        const functionExists = await client.query<{ exists: boolean }>(
          "SELECT to_regprocedure('app.email_auth_increment_email_challenge_attempts(uuid)') IS NOT NULL AS exists",
        );
        if (!functionExists.rows[0]?.exists) {
          throw new Error(
            '0247_email_challenge_atomic_attempts is not installed on the approved DEV/scratch database',
          );
        }
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    it('serializes two real concurrent increments through the row lock: both land, attempts reaches 2', async () => {
      const userId = randomUUID();
      const email = `atomic-attempts-${randomUUID()}@example.invalid`;
      const challengeId = randomUUID();
      const setup = await pool.connect();
      const first = await pool.connect();
      const second = await pool.connect();
      const observer = await pool.connect();

      try {
        await assertExactDevOrScratchDb(setup);
        await setup.query(
          `INSERT INTO public.platform_users (id, display_name, email, email_normalized, role)
         VALUES ($1::uuid, 'Atomic attempts fixture', $2, $2, 'client')`,
          [userId, email],
        );
        await setup.query(
          `INSERT INTO public.email_challenges (id, user_id, email, code_hash, expires_at, attempts, created_at)
         VALUES ($1::uuid, $2::uuid, $3, 'unreachable-hash', extract(epoch FROM clock_timestamp())::bigint + 600, 0, clock_timestamp())`,
          [challengeId, userId, email],
        );

        await first.query('BEGIN');
        const firstResult = await first.query<{ attempts: number }>(
          'SELECT attempts FROM app.email_auth_increment_email_challenge_attempts($1::uuid)',
          [challengeId],
        );
        expect(firstResult.rows).toEqual([{ attempts: 1 }]);

        const secondPid = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const secondIncrement = second.query<{ attempts: number }>(
          'SELECT attempts FROM app.email_auth_increment_email_challenge_attempts($1::uuid)',
          [challengeId],
        );

        // This is the barrier for the function's row lock (`FOR UPDATE`), not a sleep or timing guess:
        // the second connection must be OBSERVABLY blocked on the first's open transaction before we
        // release it, or this test would pass even if the function held no lock at all.
        await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
        await first.query('COMMIT');

        const secondResult = await secondIncrement;
        // The second writer's `+ 1` applied to the FIRST writer's already-committed value (1), landing
        // on 2 -- not on 1, which is what the old absolute-set accessor would have produced from two
        // callers that both read attempts=0 before either wrote.
        expect(secondResult.rows).toEqual([{ attempts: 2 }]);

        const finalRow = await observer.query<{ attempts: string }>(
          'SELECT attempts::text AS attempts FROM public.email_challenges WHERE id = $1::uuid',
          [challengeId],
        );
        expect(finalRow.rows[0]?.attempts).toBe('2');
      } finally {
        await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
        try {
          await setup.query('DELETE FROM public.email_challenges WHERE user_id = $1::uuid', [
            userId,
          ]);
          await setup.query('DELETE FROM public.platform_users WHERE id = $1::uuid', [userId]);
        } finally {
          observer.release();
          second.release();
          first.release();
          setup.release();
        }
      }
    });

    it('returns zero rows for a challenge that no longer exists (deleted by a concurrent resend/expiry/success)', async () => {
      const client = await pool.connect();
      try {
        await assertExactDevOrScratchDb(client);
        const result = await client.query<{ attempts: number }>(
          'SELECT attempts FROM app.email_auth_increment_email_challenge_attempts($1::uuid)',
          [randomUUID()],
        );
        expect(result.rows).toEqual([]);
      } finally {
        client.release();
      }
    });
  },
);
