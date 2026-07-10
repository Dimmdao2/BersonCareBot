import type { Pool, PoolClient } from "pg";
import { applyCurrentDbPrincipalToTransaction } from "@bersoncare/db-principal";

async function prepareMediaWorkerClient(_client: PoolClient): Promise<void> {
  // Dormant SAAS hook: future tenant/app principal setup belongs here.
}

async function prepareMediaWorkerTransactionClient(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client);
}

export type MediaWorkerTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

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
    client.release();
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
    release: () => client.release(),
  };
}
