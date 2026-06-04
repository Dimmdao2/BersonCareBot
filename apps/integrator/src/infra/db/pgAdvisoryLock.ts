import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

/**
 * Dedicated `PoolClient` from `db.connect()` (Rubitime throttle, scheduler slots).
 * Same mechanism as `getIntegratorDrizzleSession(port).execute(sql)` on a TX port, but
 * without `DbPort` — session locks are not held inside `createDbPort().tx`.
 */
export function integratorDrizzleOnPgClient(client: PoolClient) {
  return drizzle(client);
}

function rowsFromExecute(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  const r = raw as { rows?: Record<string, unknown>[] };
  return r.rows ?? [];
}

/** Exported for tests — must not collide with other app advisory int keys. */
export const RUBITIME_API_ADVISORY_LOCK_KEY = 58220114;

export async function pgSessionAdvisoryLock(client: PoolClient, key: number): Promise<void> {
  await integratorDrizzleOnPgClient(client).execute(sql`SELECT pg_advisory_lock(${key})`);
}

export async function pgSessionAdvisoryUnlock(client: PoolClient, key: number): Promise<void> {
  await integratorDrizzleOnPgClient(client).execute(sql`SELECT pg_advisory_unlock(${key})`);
}

export async function pgTrySessionAdvisoryLock(client: PoolClient, key: number): Promise<boolean> {
  const raw = await integratorDrizzleOnPgClient(client).execute(
    sql`SELECT pg_try_advisory_lock(${key}) AS locked`,
  );
  const row = rowsFromExecute(raw)[0];
  return row?.locked === true;
}
