/**
 * Product oracle for the disposable-PostgreSQL project (Б1/Б3, #1081).
 *
 * The per-file Vitest setup assigns a private clone before this module is imported. This test
 * proves the public email-OTP consume's atomicity on that clone: one transaction holds the
 * principal-row lock, a second reaches the same lock, and only the first consume can succeed.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { hashEmailChallengeCode } from '@/modules/auth/emailAuth';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { startPoolTransaction, withClient } from '@/infra/db/withClient';

type ConsumeResult = {
  ok: boolean;
  code: string | null;
  user_id: string | null;
  retry_after_seconds: number | null;
};

async function consumeLatestEmailChallenge(
  db: WebappSqlExecutor,
  email: string,
  codeHash: string,
): Promise<ConsumeResult[]> {
  const result = await runWebappSql<ConsumeResult>(
    db,
    sql`SELECT ok, code, user_id::text AS user_id, retry_after_seconds
        FROM app.email_otp_public_consume_latest_challenge(${email}, ${codeHash})`,
  );
  return result.rows;
}

async function waitUntilBackendIsBlocked(waitingBackendPid: number): Promise<void> {
  const blocked = await withClient(async (observer) => {
    const observerDb = getWebappSqlFromPgClient(observer);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await runWebappSql<{ blocked: boolean }>(
        observerDb,
        sql`SELECT cardinality(pg_blocking_pids(${waitingBackendPid}::integer)) > 0 AS blocked`,
      );
      if (result.rows[0]?.blocked) return true;
      // Yield to the second transaction's network request without a time-based sleep.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return false;
  });
  if (!blocked) {
    throw new Error('second email-OTP consume transaction did not reach its principal-row lock');
  }
}

describe('email OTP atomic consume', () => {
  it('serializes two consumes through the principal lock: exactly one succeeds and the replay expires', async () => {
    const userId = randomUUID();
    const email = `b2-atomic-${randomUUID()}@example.invalid`;
    const challengeId = randomUUID();
    const codeHash = hashEmailChallengeCode('123456');
    const db = getWebappSqlDb();
    const first = await startPoolTransaction(getPool());
    const second = await startPoolTransaction(getPool());
    let firstCommitted = false;

    try {
      await runWebappSql(
        db,
        sql`INSERT INTO public.platform_users (id, display_name, email, email_normalized, role)
            VALUES (${userId}::uuid, 'B2 atomic consume fixture', ${email}, ${email}, 'client')`,
      );
      await runWebappSql(
        db,
        sql`INSERT INTO public.email_challenges (id, user_id, email, code_hash, expires_at, attempts, created_at)
            VALUES (
              ${challengeId}::uuid,
              ${userId}::uuid,
              ${email},
              ${codeHash},
              extract(epoch FROM clock_timestamp())::bigint + 600,
              0,
              clock_timestamp()
            )`,
      );

      const firstDb = getWebappSqlFromPgClient(first.client);
      const secondDb = getWebappSqlFromPgClient(second.client);
      await runWebappSql(
        firstDb,
        sql`SELECT id FROM public.platform_users WHERE id = ${userId}::uuid FOR UPDATE`,
      );
      const firstResult = await consumeLatestEmailChallenge(firstDb, email, codeHash);
      expect(firstResult).toEqual([
        { ok: true, code: null, user_id: userId, retry_after_seconds: null },
      ]);

      const secondPid = await runWebappSql<{ pid: number }>(
        secondDb,
        sql`SELECT pg_backend_pid() AS pid`,
      );
      const secondConsume = consumeLatestEmailChallenge(secondDb, email, codeHash);

      await waitUntilBackendIsBlocked(secondPid.rows[0]!.pid);
      await first.commit();
      firstCommitted = true;

      expect(await secondConsume).toEqual([
        { ok: false, code: 'expired_code', user_id: null, retry_after_seconds: null },
      ]);
      const remaining = await runWebappSql<{ count: string }>(
        db,
        sql`SELECT count(*)::text AS count FROM public.email_challenges WHERE id = ${challengeId}::uuid`,
      );
      expect(remaining.rows[0]?.count).toBe('0');
    } finally {
      if (!firstCommitted) await first.rollback().catch(() => undefined);
      await second.rollback().catch(() => undefined);
      await Promise.all([first.release(), second.release()]);
      await runWebappSql(db, sql`DELETE FROM public.email_challenges WHERE user_id = ${userId}::uuid`);
      await runWebappSql(db, sql`DELETE FROM public.platform_users WHERE id = ${userId}::uuid`);
      await getPool().end();
    }
  });
});
