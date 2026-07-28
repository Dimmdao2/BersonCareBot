/**
 * Opt-in, mutating proof for the B2 atomic public email-OTP consume function.
 *
 * The fixture is private to this test and is always removed in finally. It refuses every
 * database except the named disposable DEV/scratch databases; TEST and PROD are never valid.
 *
 *   USE_REAL_DATABASE=1 RUN_EMAIL_OTP_ATOMIC_CONSUME_DEV_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashEmailChallengeCode } from '@/modules/auth/emailAuth';

const APPROVED_MUTATING_DATABASES = new Set(['bcb_webapp_dev', 'bcb_webapp_email_otp_scratch']);

async function assertExactDevOrScratchDb(client: pg.PoolClient): Promise<void> {
  const result = await client.query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );
  const databaseName = result.rows[0]?.database_name ?? '';
  if (!APPROVED_MUTATING_DATABASES.has(databaseName)) {
    throw new Error(
      `refusing mutating email-OTP consume test on current_database="${databaseName}"; expected one of ${[...APPROVED_MUTATING_DATABASES].join(', ')}`,
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
    // This yields to the second connection's network request without a time-based sleep.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('second email-OTP consume connection did not reach its principal-row lock');
}

const enabled =
  process.env.RUN_EMAIL_OTP_ATOMIC_CONSUME_DEV_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim());

describe.skipIf(!enabled)('email OTP atomic consume (explicit mutating DEV/scratch opt-in)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await assertExactDevOrScratchDb(client);
      const functionExists = await client.query<{ exists: boolean }>(
        "SELECT to_regprocedure('app.email_otp_public_consume_latest_challenge(text,text)') IS NOT NULL AS exists",
      );
      if (!functionExists.rows[0]?.exists) {
        throw new Error(
          '0232_email_otp_atomic_consume is not installed on the approved DEV/scratch database',
        );
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('serializes two real consumes through the principal lock: exactly one succeeds and the replay expires', async () => {
    const userId = randomUUID();
    const email = `b2-atomic-${randomUUID()}@example.invalid`;
    const challengeId = randomUUID();
    const codeHash = hashEmailChallengeCode('123456');
    const setup = await pool.connect();
    const first = await pool.connect();
    const second = await pool.connect();
    const observer = await pool.connect();

    try {
      await assertExactDevOrScratchDb(setup);
      await setup.query(
        `INSERT INTO public.platform_users (id, display_name, email, email_normalized, role)
         VALUES ($1::uuid, 'B2 atomic consume fixture', $2, $2, 'client')`,
        [userId, email],
      );
      await setup.query(
        `INSERT INTO public.email_challenges (id, user_id, email, code_hash, expires_at, attempts, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, extract(epoch FROM clock_timestamp())::bigint + 600, 0, clock_timestamp())`,
        [challengeId, userId, email, codeHash],
      );

      await first.query('BEGIN');
      // This is the barrier for the function's documented first lock, not a sleep or timing guess.
      await first.query('SELECT id FROM public.platform_users WHERE id = $1::uuid FOR UPDATE', [
        userId,
      ]);
      const firstResult = await first.query<{
        ok: boolean;
        code: string | null;
        user_id: string | null;
        retry_after_seconds: number | null;
      }>(
        `SELECT ok, code, user_id::text AS user_id, retry_after_seconds
         FROM app.email_otp_public_consume_latest_challenge($1, $2)`,
        [email, codeHash],
      );
      expect(firstResult.rows).toEqual([
        { ok: true, code: null, user_id: userId, retry_after_seconds: null },
      ]);

      const secondPid = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const secondConsume = second.query<{
        ok: boolean;
        code: string | null;
        user_id: string | null;
        retry_after_seconds: number | null;
      }>(
        `SELECT ok, code, user_id::text AS user_id, retry_after_seconds
         FROM app.email_otp_public_consume_latest_challenge($1, $2)`,
        [email, codeHash],
      );

      await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
      await first.query('COMMIT');

      const secondResult = await secondConsume;
      expect(secondResult.rows).toEqual([
        { ok: false, code: 'expired_code', user_id: null, retry_after_seconds: null },
      ]);
      const remaining = await observer.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public.email_challenges WHERE id = $1::uuid',
        [challengeId],
      );
      expect(remaining.rows[0]?.count).toBe('0');
    } finally {
      await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
      try {
        await setup.query('DELETE FROM public.email_challenges WHERE user_id = $1::uuid', [userId]);
        await setup.query('DELETE FROM public.platform_users WHERE id = $1::uuid', [userId]);
      } finally {
        observer.release();
        second.release();
        first.release();
        setup.release();
      }
    }
  });
});
