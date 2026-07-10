import { Pool } from "pg";
import type { PoolClient } from "pg";

type MediaWorkerPoolProviderConfig = {
  connectionString: string;
};

function prepareMediaWorkerPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

export function createMediaWorkerPoolProvider(config: MediaWorkerPoolProviderConfig): Pool {
  const pool = new Pool({ connectionString: config.connectionString, max: 4 });
  pool.on("connect", prepareMediaWorkerPoolClient);
  return pool;
}
