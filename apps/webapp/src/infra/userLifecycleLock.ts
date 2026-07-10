import type { Pool, PoolClient } from "pg";
import { pgAdvisoryXactLock, pgAdvisoryXactLockShared } from "@/infra/db/pgAdvisoryLock";
import { withPoolTransaction } from "@/infra/db/withClient";

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
  return withPoolTransaction(pool, async (client) => {
    await pgAdvisoryXactLock(client, x);
    await pgAdvisoryXactLock(client, y);
    return fn(client);
  });
}

export async function withUserLifecycleLock<T>(
  pool: Pool,
  userId: string,
  mode: UserLifecycleLockMode,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withPoolTransaction(pool, async (client) => {
    if (mode === "exclusive") {
      await pgAdvisoryXactLock(client, userId);
    } else {
      await pgAdvisoryXactLockShared(client, userId);
    }
    return fn(client);
  });
}
