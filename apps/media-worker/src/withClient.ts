import type { Pool, PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  type DbPrincipalApplyOptions,
} from "@bersoncare/db-principal";

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

async function prepareMediaWorkerClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client, options);
}

async function prepareMediaWorkerTransactionClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client, options);
}

export type MediaWorkerTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

async function releasePreparedMediaWorkerClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options);
  } finally {
    client.release();
  }
}

export async function startMediaWorkerTransaction(pool: Pool): Promise<MediaWorkerTransactionHandle> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await prepareMediaWorkerClient(client, principalApplyOptions);
    await client.query("BEGIN");
    transactionStarted = true;
    await prepareMediaWorkerTransactionClient(client, principalApplyOptions);
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original setup error */
      }
    }
    await releasePreparedMediaWorkerClient(client, principalApplyOptions);
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
    release: () => releasePreparedMediaWorkerClient(client, principalApplyOptions),
  };
}
