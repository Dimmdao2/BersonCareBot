/**
 * Opt-in, mutating proof for the decaying OTP lockout's atomic escalation (night plan C-2 step 3,
 * migration 0248_otp_decaying_lockout.sql).
 *
 * Real concurrent Postgres connections, not a JS mock: two backends race to escalate the SAME
 * identity's lockout row (`phone_otp_locks` for phone, `email_otp_locks` for email). The first
 * backend's escalation (an `INSERT ... ON CONFLICT DO UPDATE`) is held open inside a transaction;
 * the second backend's escalation for the SAME identity is proven to be BLOCKED on that row (not
 * merely slow) via `pg_blocking_pids`, then released by a COMMIT. The two escalations must land as
 * cycle 1 (120s) then cycle 2 (240s) -- never as two cycle-1 escalations (which would mean the
 * second writer never saw the first's committed cycle, i.e. a lost escalation), and never with the
 * row missing a write entirely. Same idiom as
 * pgEmailChallengeAtomicAttempts.devDb.integration.test.ts / pgPhoneChallengeAtomicAttempts.devDb
 * .integration.test.ts (step 1's proofs) -- two real connections, `pg_blocking_pids`, a COMMIT
 * barrier.
 *
 *   USE_REAL_DATABASE=1 RUN_OTP_DECAYING_LOCKOUT_ATOMIC_ESCALATION_DEV_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgOtpDecayingLockoutAtomicEscalation.devDb.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

const APPROVED_MUTATING_DATABASES = new Set([
  "bcb_webapp_dev",
  "bcb_webapp_email_otp_scratch",
]);

async function assertExactDevOrScratchDb(client: pg.PoolClient): Promise<void> {
  const result = await client.query<{ database_name: string }>("SELECT current_database() AS database_name");
  const databaseName = result.rows[0]?.database_name ?? "";
  if (!APPROVED_MUTATING_DATABASES.has(databaseName)) {
    throw new Error(
      `refusing mutating OTP-lockout atomic-escalation test on current_database="${databaseName}"; expected one of ${[...APPROVED_MUTATING_DATABASES].join(", ")}`,
    );
  }
}

async function waitUntilBackendIsBlocked(
  observer: pg.PoolClient,
  waitingBackendPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await observer.query<{ blocked: boolean }>(
      "SELECT cardinality(pg_blocking_pids($1::integer)) > 0 AS blocked",
      [waitingBackendPid],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("second escalation connection did not reach the lockout row lock");
}

const enabled =
  process.env.RUN_OTP_DECAYING_LOCKOUT_ATOMIC_ESCALATION_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("decaying OTP lockout atomic escalation (explicit mutating DEV/scratch opt-in)", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await assertExactDevOrScratchDb(client);
      const email = await client.query<{ exists: boolean }>(
        "SELECT to_regprocedure('app.email_auth_register_email_otp_lockout(uuid)') IS NOT NULL AS exists",
      );
      if (!email.rows[0]?.exists) {
        throw new Error("0248_otp_decaying_lockout is not installed on the approved DEV/scratch database");
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
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("email: serializes two real concurrent escalations through the row lock -- cycle 1 (120s) then cycle 2 (240s), never two cycle-1s", async () => {
    const userId = randomUUID();
    const setup = await pool.connect();
    const first = await pool.connect();
    const second = await pool.connect();
    const observer = await pool.connect();

    try {
      await assertExactDevOrScratchDb(setup);

      await first.query("BEGIN");
      const firstResult = await first.query<{ locked_until: string }>(
        "SELECT locked_until FROM app.email_auth_register_email_otp_lockout($1::uuid)",
        [userId],
      );
      const nowSec = Math.floor(Date.now() / 1000);
      const firstDelta = Number(firstResult.rows[0]!.locked_until) - nowSec;
      // First-ever escalation for this identity: cycle 1, ~120s (tolerate a couple seconds of test
      // wall-clock drift between `nowSec` here and `clock_timestamp()` inside the function).
      expect(firstDelta).toBeGreaterThanOrEqual(118);
      expect(firstDelta).toBeLessThanOrEqual(122);

      const secondPid = await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const secondEscalation = second.query<{ locked_until: string }>(
        "SELECT locked_until FROM app.email_auth_register_email_otp_lockout($1::uuid)",
        [userId],
      );

      // Barrier for the function's own row lock (the INSERT ... ON CONFLICT waits to see whether the
      // first, uncommitted insert will succeed or conflict): the second connection must be OBSERVABLY
      // blocked on the first's open transaction before we release it.
      await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
      await first.query("COMMIT");

      const secondResult = await secondEscalation;
      const secondDelta = Number(secondResult.rows[0]!.locked_until) - nowSec;
      // The second writer's escalation applied ON TOP of the first writer's already-committed cycle
      // 1, landing on cycle 2 (~240s) -- not on cycle 1 (~120s) again, which is what a lost escalation
      // (two concurrent callers both reading cycle=0 before either commits) would produce.
      expect(secondDelta).toBeGreaterThanOrEqual(236);
      expect(secondDelta).toBeLessThanOrEqual(242);

      const finalRow = await observer.query<{ lockout_cycle: number }>(
        "SELECT lockout_cycle FROM public.email_otp_locks WHERE user_id = $1::uuid",
        [userId],
      );
      expect(finalRow.rows[0]?.lockout_cycle).toBe(2);
    } finally {
      await Promise.allSettled([first.query("ROLLBACK"), second.query("ROLLBACK")]);
      try {
        await setup.query("DELETE FROM public.email_otp_locks WHERE user_id = $1::uuid", [userId]);
      } finally {
        observer.release();
        second.release();
        first.release();
        setup.release();
      }
    }
  });

  it("phone: serializes two real concurrent escalations through the row lock -- cycle 1 (120s) then cycle 2 (240s), never two cycle-1s", async () => {
    const phone = `+7900${Math.floor(1_000_000 + Math.random() * 8_000_000)}`;
    const setup = await pool.connect();
    const first = await pool.connect();
    const second = await pool.connect();
    const observer = await pool.connect();

    // Same raw SQL text as pgPhoneOtpLimits.ts:registerPhoneOtpLockout -- this proves the ACTUAL
    // query the application sends, not a paraphrase of it.
    const registerLockoutSql = `INSERT INTO phone_otp_locks (phone_normalized, lockout_cycle, locked_until)
       VALUES ($1, 1, $2 + 120)
       ON CONFLICT (phone_normalized) DO UPDATE SET
         lockout_cycle = phone_otp_locks.lockout_cycle + 1,
         locked_until = $2 + LEAST(1800, (120 * power(2, LEAST(phone_otp_locks.lockout_cycle, 10)))::bigint)
       RETURNING locked_until`;

    try {
      await assertExactDevOrScratchDb(setup);
      const nowSec = Math.floor(Date.now() / 1000);

      await first.query("BEGIN");
      const firstResult = await first.query<{ locked_until: string }>(registerLockoutSql, [phone, nowSec]);
      const firstDelta = Number(firstResult.rows[0]!.locked_until) - nowSec;
      expect(firstDelta).toBe(120);

      const secondPid = await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const secondEscalation = second.query<{ locked_until: string }>(registerLockoutSql, [phone, nowSec]);

      await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
      await first.query("COMMIT");

      const secondResult = await secondEscalation;
      const secondDelta = Number(secondResult.rows[0]!.locked_until) - nowSec;
      expect(secondDelta).toBe(240);

      const finalRow = await observer.query<{ lockout_cycle: number }>(
        "SELECT lockout_cycle FROM public.phone_otp_locks WHERE phone_normalized = $1",
        [phone],
      );
      expect(finalRow.rows[0]?.lockout_cycle).toBe(2);
    } finally {
      await Promise.allSettled([first.query("ROLLBACK"), second.query("ROLLBACK")]);
      try {
        await setup.query("DELETE FROM public.phone_otp_locks WHERE phone_normalized = $1", [phone]);
      } finally {
        observer.release();
        second.release();
        first.release();
        setup.release();
      }
    }
  });
});
