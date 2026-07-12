import type { Pool, PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  clearDbPrincipalFromConnection,
} from "@bersoncare/db-principal";
import { getPool } from "@/infra/db/client";

async function prepareClientForRequest(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client);
}

async function releasePreparedClient(client: PoolClient): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client);
  } finally {
    client.release();
  }
}

async function prepareTransactionClientForRequest(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client);
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
    await releasePreparedClient(client);
  }
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPoolClient(getPool(), fn);
}

export type PoolTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

export async function startPoolTransaction(pool: Pool): Promise<PoolTransactionHandle> {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await prepareClientForRequest(client);
    await client.query("BEGIN");
    transactionStarted = true;
    await prepareTransactionClientForRequest(client);
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original setup error */
      }
    }
    await releasePreparedClient(client);
    throw err;
  }
  return {
    client,
    commit: async () => {
      await client.query("COMMIT");
    },
    rollback: async () => {
      await client.query("ROLLBACK");
    },
    release: () => releasePreparedClient(client),
  };
}

export async function withPoolTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await startPoolTransaction(pool);
  try {
    const out = await fn(tx.client);
    await tx.commit();
    return out;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* ignore rollback failures; preserve original error */
    }
    throw err;
  } finally {
    await tx.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPoolTransaction(getPool(), fn);
}
