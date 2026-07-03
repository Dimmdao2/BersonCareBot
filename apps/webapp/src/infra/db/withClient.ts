import type { Pool, PoolClient } from "pg";
import { getPool } from "@/infra/db/client";

async function prepareClientForRequest(_client: PoolClient): Promise<void> {
  // Dormant SAAS hook: future tenant/app principal setup belongs here.
}

export async function withPoolClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await prepareClientForRequest(client);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPoolClient(getPool(), fn);
}

export async function withPoolTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withPoolClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback failures; preserve original error */
      }
      throw err;
    }
  });
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPoolTransaction(getPool(), fn);
}
