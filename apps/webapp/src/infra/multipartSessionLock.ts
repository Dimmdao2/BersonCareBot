import type { Pool, PoolClient } from "pg";

const LOCK_PREFIX = "multipart_session:";

/**
 * Exclusive transaction-scoped advisory lock for a single multipart upload session.
 * Serializes complete/abort/finalize for the same sessionId without holding the lock across S3 HTTP calls.
 */
export async function withMultipartSessionLock<T>(
  pool: Pool,
  sessionId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`${LOCK_PREFIX}${sessionId}`]);
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
