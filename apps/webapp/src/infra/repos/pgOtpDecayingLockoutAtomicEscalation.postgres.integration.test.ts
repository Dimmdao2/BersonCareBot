/**
 * Disposable-Postgres proof (Б1/Б3, #1081) for the decaying OTP lockout's atomic escalation
 * (night plan C-2 step 3, migration 0248_otp_decaying_lockout.sql).
 *
 * Real concurrent Postgres connections, not a JS mock: two backends race to escalate the SAME
 * identity's lockout row (`phone_otp_locks` for phone, `email_otp_locks` for email). The first
 * backend's escalation (an `INSERT ... ON CONFLICT DO UPDATE`) is held open inside a transaction;
 * the second backend's escalation for the SAME identity is proven to be BLOCKED on that row (not
 * merely slow) via `pg_blocking_pids`, then released by a COMMIT. The two escalations must land as
 * cycle 1 (120s) then cycle 2 (240s) -- never as two cycle-1 escalations (lost escalation).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Self-contained fixture (random uuid/phone per test).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getPool } from '@/infra/db/client';

async function waitUntilBackendIsBlocked(
  observer: { query: (text: string, values?: unknown[]) => Promise<{ rows: { blocked: boolean }[] }> },
  waitingBackendPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await observer.query(
      'SELECT cardinality(pg_blocking_pids($1::integer)) > 0 AS blocked',
      [waitingBackendPid],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('second escalation connection did not reach the lockout row lock');
}

describe('decaying OTP lockout atomic escalation (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `ALTER TABLE email_otp_locks DISABLE ROW LEVEL SECURITY;
         ALTER TABLE phone_otp_locks DISABLE ROW LEVEL SECURITY;`,
      );
      const email = await client.query<{ exists: boolean }>(
        "SELECT to_regprocedure('app.email_auth_register_email_otp_lockout(uuid)') IS NOT NULL AS exists",
      );
      if (!email.rows[0]?.exists) {
        throw new Error('0248_otp_decaying_lockout is not installed on this database');
      }
      const phoneColumn = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'phone_otp_locks' AND column_name = 'lockout_cycle'
         ) AS exists`,
      );
      if (!phoneColumn.rows[0]?.exists) {
        throw new Error("0248_otp_decaying_lockout's phone_otp_locks.lockout_cycle column is missing");
      }
      const phoneAccessor = await client.query<{ exists: boolean }>(
        "SELECT to_regprocedure('app.phone_auth_register_otp_lockout(text,bigint)') IS NOT NULL AS exists",
      );
      if (!phoneAccessor.rows[0]?.exists) {
        throw new Error("0252_patient_action_accessors's phone lockout accessor is not installed");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('email: serializes two real concurrent escalations through the row lock -- cycle 1 (120s) then cycle 2 (240s), never two cycle-1s', async () => {
    const userId = randomUUID();
    const first = await getPool().connect();
    const second = await getPool().connect();
    const observer = await getPool().connect();

    try {
      await first.query('BEGIN');
      const firstResult = await first.query<{ locked_until: string }>(
        'SELECT locked_until FROM app.email_auth_register_email_otp_lockout($1::uuid)',
        [userId],
      );
      const nowSec = Math.floor(Date.now() / 1000);
      const firstDelta = Number(firstResult.rows[0]!.locked_until) - nowSec;
      // First-ever escalation for this identity: cycle 1, ~120s (tolerate a couple seconds of test
      // wall-clock drift between `nowSec` here and `clock_timestamp()` inside the function).
      expect(firstDelta).toBeGreaterThanOrEqual(118);
      expect(firstDelta).toBeLessThanOrEqual(122);

      const secondPid = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const secondEscalation = second.query<{ locked_until: string }>(
        'SELECT locked_until FROM app.email_auth_register_email_otp_lockout($1::uuid)',
        [userId],
      );

      // Barrier for the function's own row lock (the INSERT ... ON CONFLICT waits to see whether the
      // first, uncommitted insert will succeed or conflict): the second connection must be OBSERVABLY
      // blocked on the first's open transaction before we release it.
      await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
      await first.query('COMMIT');

      const secondResult = await secondEscalation;
      const secondDelta = Number(secondResult.rows[0]!.locked_until) - nowSec;
      // The second writer's escalation applied ON TOP of the first writer's already-committed cycle
      // 1, landing on cycle 2 (~240s) -- not on cycle 1 (~120s) again, which is what a lost escalation
      // (two concurrent callers both reading cycle=0 before either commits) would produce.
      expect(secondDelta).toBeGreaterThanOrEqual(236);
      expect(secondDelta).toBeLessThanOrEqual(242);

      const finalRow = await observer.query<{ lockout_cycle: number }>(
        'SELECT lockout_cycle FROM public.email_otp_locks WHERE user_id = $1::uuid',
        [userId],
      );
      expect(finalRow.rows[0]?.lockout_cycle).toBe(2);
    } finally {
      await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
      observer.release();
      second.release();
      first.release();
    }
  });

  it('phone: serializes two real concurrent escalations through the row lock -- cycle 1 (120s) then cycle 2 (240s), never two cycle-1s', async () => {
    const phone = `+7900${Math.floor(1_000_000 + Math.random() * 8_000_000)}`;
    const first = await getPool().connect();
    const second = await getPool().connect();
    const observer = await getPool().connect();

    // The same narrow accessor pgPhoneOtpLimits.ts calls. This executes the migration body itself,
    // rather than a paraphrased copy of its escalation arithmetic.
    const registerLockoutSql =
      'SELECT locked_until FROM app.phone_auth_register_otp_lockout($1::text, $2::bigint)';

    try {
      const nowSec = Math.floor(Date.now() / 1000);

      await first.query('BEGIN');
      const firstResult = await first.query<{ locked_until: string }>(registerLockoutSql, [
        phone,
        nowSec,
      ]);
      const firstDelta = Number(firstResult.rows[0]!.locked_until) - nowSec;
      expect(firstDelta).toBe(120);

      const secondPid = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const secondEscalation = second.query<{ locked_until: string }>(registerLockoutSql, [
        phone,
        nowSec,
      ]);

      await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
      await first.query('COMMIT');

      const secondResult = await secondEscalation;
      const secondDelta = Number(secondResult.rows[0]!.locked_until) - nowSec;
      expect(secondDelta).toBe(240);

      const finalRow = await observer.query<{ lockout_cycle: number }>(
        'SELECT lockout_cycle FROM public.phone_otp_locks WHERE phone_normalized = $1',
        [phone],
      );
      expect(finalRow.rows[0]?.lockout_cycle).toBe(2);
    } finally {
      await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
      observer.release();
      second.release();
      first.release();
    }
  });
});
