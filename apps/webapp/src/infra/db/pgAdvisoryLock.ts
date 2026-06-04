import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";

/** Drizzle on a dedicated connection (transaction + session advisory locks). */
export function drizzleOnPgClient(client: PoolClient) {
  return drizzle(client);
}

/** Transaction-scoped exclusive lock (`hashtext(lockKey::text)`). */
export async function pgAdvisoryXactLock(client: PoolClient, lockKey: string): Promise<void> {
  await drizzleOnPgClient(client).execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`);
}

/** Transaction-scoped shared lock (`hashtext(lockKey::text)`). */
export async function pgAdvisoryXactLockShared(client: PoolClient, lockKey: string): Promise<void> {
  await drizzleOnPgClient(client).execute(
    sql`SELECT pg_advisory_xact_lock_shared(hashtext(${lockKey}::text))`,
  );
}

/** Session-level lock — must use the same `PoolClient` for unlock. */
export async function pgSessionAdvisoryLock(client: PoolClient, lockKey: string): Promise<void> {
  await drizzleOnPgClient(client).execute(sql`SELECT pg_advisory_lock(hashtext(${lockKey}))`);
}

export async function pgSessionAdvisoryUnlock(client: PoolClient, lockKey: string): Promise<void> {
  await drizzleOnPgClient(client).execute(sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`);
}
