import type { Pool, PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  clearDbPrincipalFromConnection,
} from "@bersoncare/db-principal";

async function prepareMediaWorkerClient(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client);
}

async function prepareMediaWorkerTransactionClient(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client);
}

export type MediaWorkerTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

async function releasePreparedMediaWorkerClient(client: PoolClient): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client);
  } finally {
    client.release();
  }
}

export async function startMediaWorkerTransaction(pool: Pool): Promise<MediaWorkerTransactionHandle> {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await prepareMediaWorkerClient(client);
    await client.query("BEGIN");
    transactionStarted = true;
    await prepareMediaWorkerTransactionClient(client);
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original setup error */
      }
    }
    await releasePreparedMediaWorkerClient(client);
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
    release: () => releasePreparedMediaWorkerClient(client),
  };
}
