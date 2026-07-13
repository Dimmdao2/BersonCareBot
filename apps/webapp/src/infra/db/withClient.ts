import type { Pool, PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  type DbPrincipalApplyOptions,
} from "@bersoncare/db-principal";
import { getPool } from "@/infra/db/client";

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

async function prepareClientForRequest(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client, options);
}

async function releasePreparedClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  let cleanupError: unknown;
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    cleanupError = err;
    throw err;
  } finally {
    if (cleanupError === undefined) {
      client.release();
    } else {
      client.release(cleanupError instanceof Error ? cleanupError : new Error("DB principal cleanup failed"));
    }
  }
}

async function releasePreparedClientAfterSetupFailure(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    client.release(err instanceof Error ? err : new Error("DB principal cleanup failed"));
    return;
  }
  try {
    client.release();
  } catch {
    /* release is synchronous in pg; keep setup failure if a mock throws */
  }
}

async function prepareTransactionClientForRequest(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client, options);
}

export async function withPoolClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const client = await pool.connect();
  try {
    await prepareClientForRequest(client, principalApplyOptions);
    return await fn(client);
  } finally {
    await releasePreparedClient(client, principalApplyOptions);
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
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await prepareClientForRequest(client, principalApplyOptions);
    await client.query("BEGIN");
    transactionStarted = true;
    await prepareTransactionClientForRequest(client, principalApplyOptions);
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original setup error */
      }
    }
    await releasePreparedClientAfterSetupFailure(client, principalApplyOptions);
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
    release: () => releasePreparedClient(client, principalApplyOptions),
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
