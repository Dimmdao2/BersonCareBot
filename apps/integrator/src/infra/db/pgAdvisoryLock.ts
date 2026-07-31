import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

/**
 * Dedicated `PoolClient` from the integrator checkout helper (scheduler slots).
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

/**
 * D30 Ш0 §2a condition 2: a session-level advisory lock is released the instant its holding
 * connection dies — silently, with no error delivered to application code that isn't watching
 * that exact connection. Re-running `pg_try_advisory_lock` on the SAME connection would be a false
 * negative (it is reentrant and would just re-grant), so ownership is read back from `pg_locks`
 * instead, matched on `pg_backend_pid()` of THIS connection. That backend-pid match is the part
 * that also catches a pooler (pgbouncer transaction mode) silently swapping the backend session
 * under an app-level "connection" that still answers queries — a plain `SELECT 1` liveness probe
 * would not see that swap, `pg_locks` ownership by this exact backend does.
 */
export async function pgSessionAdvisoryLockStillHeld(
  client: PoolClient,
  key: number,
): Promise<boolean> {
  const raw = await integratorDrizzleOnPgClient(client).execute(
    sql`SELECT count(*)::int AS held
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND objsubid = 1
          AND (classid::bigint << 32 | objid::bigint) = ${key}::bigint
          AND pid = pg_backend_pid()
          AND granted`,
  );
  const row = rowsFromExecute(raw)[0];
  return Number(row?.held ?? 0) >= 1;
}
