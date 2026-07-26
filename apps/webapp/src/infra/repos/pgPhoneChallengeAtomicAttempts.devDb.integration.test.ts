/**
 * Opt-in, mutating proof for the phone-login OTP atomic wrong-attempt counter
 * (`createPgPhoneChallengeStore().incrementVerifyAttempts`, night plan C-2 step 1).
 *
 * Real concurrent Postgres connections, not a JS mock: two backends race to increment the SAME
 * challenge row's `verify_attempts` column via `UPDATE phone_challenges SET verify_attempts =
 * verify_attempts + 1 ... RETURNING verify_attempts`. The first backend holds the row's write lock
 * inside an open transaction; the second backend's UPDATE is proven to be BLOCKED on that lock (not
 * merely slow) via `pg_blocking_pids`, then released by a COMMIT. Both increments must land --
 * verify_attempts must reach 2, never 1 -- which is exactly the lost-update shape the old
 * `challengeStore.get()` + `challengeStore.set({...stored, verifyAttempts})` pair was vulnerable to:
 * its second call was a blind `ON CONFLICT DO UPDATE SET verify_attempts = EXCLUDED.verify_attempts`
 * overwrite, not a relative increment.
 *
 *   USE_REAL_DATABASE=1 RUN_PHONE_CHALLENGE_ATOMIC_ATTEMPTS_DEV_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import pg from "pg";

const APPROVED_MUTATING_DATABASES = new Set([
  "bcb_webapp_dev",
  "bcb_webapp_email_otp_scratch",
]);

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

async function assertExactDevOrScratchDb(client: pg.PoolClient): Promise<void> {
  const result = await client.query<{ database_name: string }>("SELECT current_database() AS database_name");
  const databaseName = result.rows[0]?.database_name ?? "";
  if (!APPROVED_MUTATING_DATABASES.has(databaseName)) {
    throw new Error(
      `refusing mutating phone-challenge atomic-attempts test on current_database="${databaseName}"; expected one of ${[...APPROVED_MUTATING_DATABASES].join(", ")}`,
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
  throw new Error("second increment connection did not reach the phone_challenges row lock");
}

const enabled =
  process.env.RUN_PHONE_CHALLENGE_ATOMIC_ATTEMPTS_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("phone_challenges atomic verify_attempts increment (explicit mutating DEV/scratch opt-in)", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await assertExactDevOrScratchDb(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("serializes two real concurrent increments through the row lock: both land, verify_attempts reaches 2", async () => {
    const challengeId = generateChallengeId();
    const phone = "+79990000000";
    const setup = await pool.connect();
    const first = await pool.connect();
    const second = await pool.connect();
    const observer = await pool.connect();

    try {
      await assertExactDevOrScratchDb(setup);
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      await setup.query(
        `INSERT INTO public.phone_challenges (challenge_id, phone, expires_at, code, verify_attempts)
         VALUES ($1, $2, $3, '000000', 0)`,
        [challengeId, phone, expiresAt],
      );

      await first.query("BEGIN");
      const firstResult = await first.query<{ verify_attempts: number }>(
        `UPDATE phone_challenges
         SET verify_attempts = verify_attempts + 1
         WHERE challenge_id = $1
         RETURNING verify_attempts`,
        [challengeId],
      );
      expect(firstResult.rows).toEqual([{ verify_attempts: 1 }]);

      const secondPid = await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const secondIncrement = second.query<{ verify_attempts: number }>(
        `UPDATE phone_challenges
         SET verify_attempts = verify_attempts + 1
         WHERE challenge_id = $1
         RETURNING verify_attempts`,
        [challengeId],
      );

      // Barrier for the UPDATE statement's own row lock, not a sleep or timing guess: the second
      // connection must be OBSERVABLY blocked on the first's open transaction before we release it.
      await waitUntilBackendIsBlocked(observer, secondPid.rows[0]!.pid);
      await first.query("COMMIT");

      const secondResult = await secondIncrement;
      // The second writer's `+ 1` applied to the FIRST writer's already-committed value (1), landing
      // on 2 -- not on 1, which is what the old get()+set(absolute value) pair would have produced
      // from two callers that both read verifyAttempts=0 before either wrote.
      expect(secondResult.rows).toEqual([{ verify_attempts: 2 }]);

      const finalRow = await observer.query<{ verify_attempts: string }>(
        "SELECT verify_attempts::text AS verify_attempts FROM public.phone_challenges WHERE challenge_id = $1",
        [challengeId],
      );
      expect(finalRow.rows[0]?.verify_attempts).toBe("2");
    } finally {
      await Promise.allSettled([first.query("ROLLBACK"), second.query("ROLLBACK")]);
      try {
        await setup.query("DELETE FROM public.phone_challenges WHERE challenge_id = $1", [challengeId]);
      } finally {
        observer.release();
        second.release();
        first.release();
        setup.release();
      }
    }
  });

  it("returns zero rows for a challenge that no longer exists (raw SQL, same predicate the port uses)", async () => {
    const client = await pool.connect();
    try {
      await assertExactDevOrScratchDb(client);
      const now = Math.floor(Date.now() / 1000);
      const result = await client.query<{ verify_attempts: number }>(
        `UPDATE phone_challenges
         SET verify_attempts = verify_attempts + 1
         WHERE challenge_id = $1 AND expires_at > $2
         RETURNING verify_attempts`,
        [generateChallengeId(), now],
      );
      expect(result.rows).toEqual([]);
    } finally {
      client.release();
    }
  });
});
