import type { Pool, PoolClient } from "pg";

async function prepareMediaWorkerClient(_client: PoolClient): Promise<void> {
  // Dormant SAAS hook: future tenant/app principal setup belongs here.
}

export type MediaWorkerTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

export async function startMediaWorkerTransaction(pool: Pool): Promise<MediaWorkerTransactionHandle> {
  const client = await pool.connect();
  try {
    await prepareMediaWorkerClient(client);
    await client.query("BEGIN");
  } catch (err) {
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
