import type { Pool, PoolClient } from "pg";
import { pgAdvisoryXactLock, pgAdvisoryXactLockShared } from "@/infra/db/pgAdvisoryLock";

/** Exclusive: purge / manual merge. Shared: user-owned media presign + intake attachment writes. */
export type UserLifecycleLockMode = "exclusive" | "shared";

/**
 * Transaction-scoped advisory lock on `hashtext(platform_user_id::text)` (same family as strict purge).
 * Compatible with concurrent shared locks; exclusive waits for shared and vice versa per PostgreSQL rules.
 */
/**
 * Exclusive locks on both user ids (sorted) in one transaction — for manual merge / two-party ops.
 */
export async function withTwoUserLifecycleLocksExclusive<T>(
  pool: Pool,
  userIdA: string,
  userIdB: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const [x, y] = [userIdA, userIdB].sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await pgAdvisoryXactLock(client, x);
    await pgAdvisoryXactLock(client, y);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function withUserLifecycleLock<T>(
  pool: Pool,
  userId: string,
  mode: UserLifecycleLockMode,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (mode === "exclusive") {
      await pgAdvisoryXactLock(client, userId);
    } else {
      await pgAdvisoryXactLockShared(client, userId);
    }
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
